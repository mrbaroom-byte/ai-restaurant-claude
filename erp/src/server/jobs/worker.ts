/**
 * The background worker.
 *
 * Run as `pnpm worker` alongside the web process, or as the same image with `WORKER=1`.
 *
 * The ZATCA job is the one that matters: a simplified invoice must reach ZATCA within 24 hours
 * of issue, and a standard invoice is not legally valid until it is cleared. The worker
 * therefore also sweeps for submissions that are due regardless of whether their job survived,
 * so a Redis outage delays submissions rather than losing them.
 */
import { Worker, type ConnectionOptions } from 'bullmq'
import { QUEUE_NAMES } from './queues'
import { prisma, withTenant } from '../db'
import { dueSubmissions, submitInvoice } from '../services/zatca'

const SWEEP_INTERVAL_MS = Number(process.env.ZATCA_SWEEP_INTERVAL_MS ?? 60_000)

function connectionFromEnv(): ConnectionOptions | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  }
}

async function processSubmission(tenantId: string, submissionId: string): Promise<void> {
  const outcome = await withTenant(tenantId, (tx) => submitInvoice(tx, tenantId, submissionId))
  const line = `zatca ${submissionId} → ${outcome.status} (HTTP ${outcome.httpStatus})`
  if (outcome.status === 'REJECTED') {
    // A rejection is a business problem the user must see, so it is logged at error level even
    // though the worker itself is behaving correctly.
    console.error(line, JSON.stringify(outcome.errors))
  } else {
    console.log(line)
  }
}

/**
 * Sweep every tenant for submissions whose retry time has arrived.
 *
 * This is the safety net: it runs whether or not Redis is available, so an invoice never sits
 * unsubmitted because a queue entry was lost.
 */
async function sweep(): Promise<number> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } })
  let processed = 0

  for (const tenant of tenants) {
    const due = await withTenant(tenant.id, (tx) => dueSubmissions(tx, tenant.id, 25))
    for (const submission of due) {
      try {
        await processSubmission(tenant.id, submission.id)
        processed += 1
      } catch (error) {
        console.error(`zatca ${submission.id} threw:`, error)
      }
    }
  }

  return processed
}

async function main(): Promise<void> {
  const connection = connectionFromEnv()

  if (connection) {
    const worker = new Worker(
      QUEUE_NAMES.zatca,
      async (job) => {
        const { tenantId, submissionId } = job.data as { tenantId: string; submissionId: string }
        await processSubmission(tenantId, submissionId)
      },
      { connection, concurrency: Number(process.env.ZATCA_CONCURRENCY ?? 4) },
    )

    worker.on('failed', (job, error) => console.error(`zatca job ${job?.id} failed:`, error))
    console.log(`worker: listening on ${QUEUE_NAMES.zatca}`)
  } else {
    console.log('worker: REDIS_URL is not set, running in sweep-only mode')
  }

  // Sweep on a timer regardless. Redis speeds submission up; it is not what makes it happen.
  const tick = async () => {
    try {
      const processed = await sweep()
      if (processed > 0) console.log(`worker: swept ${processed} due submissions`)
    } catch (error) {
      console.error('worker: sweep failed', error)
    }
  }

  await tick()
  const timer = setInterval(() => void tick(), SWEEP_INTERVAL_MS)

  const shutdown = async () => {
    clearInterval(timer)
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  console.error('worker: failed to start', error)
  process.exit(1)
})
