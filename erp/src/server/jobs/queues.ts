/**
 * Background queues.
 *
 * Four jobs matter: submitting invoices to ZATCA, sending notifications, generating scheduled
 * reports, and taking the nightly backup. They share one Redis connection.
 *
 * The application runs perfectly well without Redis — the queue helpers become no-ops and the
 * ZATCA submissions simply wait for the next worker run. That matters because a five-person
 * business should not be blocked from invoicing by an infrastructure component being down.
 */
import { Queue, type ConnectionOptions } from 'bullmq'

export const QUEUE_NAMES = {
  zatca: 'zatca-submit',
  notify: 'notifications',
  reports: 'reports',
  backup: 'backup',
} as const

let connection: ConnectionOptions | null | undefined

function redisConnection(): ConnectionOptions | null {
  if (connection !== undefined) return connection
  const url = process.env.REDIS_URL
  if (!url) {
    connection = null
    return null
  }
  const parsed = new URL(url)
  connection = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    // BullMQ requires this to be null so a blocking command is never retried away.
    maxRetriesPerRequest: null,
  }
  return connection
}

const queues = new Map<string, Queue>()

export function queue(name: string): Queue | null {
  const options = redisConnection()
  if (!options) return null
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: options,
        defaultJobOptions: {
          attempts: 8,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 30 * 86_400 },
        },
      }),
    )
  }
  return queues.get(name)!
}

/** Enqueue, or do nothing when Redis is not configured. Never throws into a request path. */
export async function enqueue(name: string, jobName: string, data: unknown, delayMs = 0): Promise<boolean> {
  const target = queue(name)
  if (!target) return false
  try {
    await target.add(jobName, data, { delay: delayMs })
    return true
  } catch (error) {
    console.error(`Could not enqueue ${jobName} on ${name}:`, error)
    return false
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
}
