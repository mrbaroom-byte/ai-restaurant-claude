import { prisma } from '@/server/db'

/**
 * Liveness and readiness in one endpoint: the container is healthy only if it can reach the
 * database, because an app that cannot post to the ledger is not doing its job.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', database: 'ok', time: new Date().toISOString() })
  } catch (error) {
    return Response.json(
      { status: 'degraded', database: 'unreachable', message: String(error) },
      { status: 503 },
    )
  }
}
