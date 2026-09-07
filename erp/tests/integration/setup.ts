/**
 * Integration test harness.
 *
 * These tests run against a real PostgreSQL, because the things they prove — the gap-free
 * sequence lock, the deferred balance trigger, the idempotent POS replay — only exist once
 * there is a database underneath. Each test file gets a freshly seeded tenant.
 */
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

export const TENANT_ID = '0195c000-0000-7000-8000-000000000001'

let client: PrismaClient | null = null

export function db(): PrismaClient {
  if (!client) client = new PrismaClient()
  return client
}

/** Reseed. Slow enough to do once per file, fast enough not to matter. */
export function reseed(): void {
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'pipe',
    env: process.env,
  })
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect()
  client = null
}

/** Run work with the tenant set, the way the application does. */
export async function asTenant<T>(work: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>, tenantId = TENANT_ID): Promise<T> {
  return db().$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId)
    return work(tx)
  }, { timeout: 60_000 })
}

/** Total debits and credits across the whole tenant — the invariant every test re-checks. */
export async function trialBalanceTotals(tenantId = TENANT_ID) {
  const totals = await db().journalLine.aggregate({
    where: { tenantId },
    _sum: { debit: true, credit: true },
  })
  return {
    debit: totals._sum.debit?.toString() ?? '0',
    credit: totals._sum.credit?.toString() ?? '0',
  }
}
