/**
 * Database access.
 *
 * Two things happen here that the rest of the application relies on:
 *
 *   1. A single Prisma client survives hot reload in development, so a long dev session does
 *      not exhaust the connection pool.
 *   2. `withTenant` sets `app.tenant_id` on the connection for the duration of a transaction,
 *      which is what the row-level security policies read. Every request goes through it.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * Run work inside a transaction with the tenant set on the connection.
 *
 * `set_config(..., true)` scopes the setting to the transaction, so a pooled connection
 * handed to the next request never carries the previous tenant's id.
 */
export async function withTenant<T>(tenantId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
    throw new Error('withTenant requires a UUID tenant id')
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId)
    return work(tx)
  })
}

/** Read-only helper for queries that do not need a transaction of their own. */
export async function readAsTenant<T>(tenantId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(tenantId, work)
}
