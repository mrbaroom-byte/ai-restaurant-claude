import { posSyncRequest } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { syncSales } from '@/server/services/pos'

/**
 * Offline replay endpoint.
 *
 * The till sends its whole queue; every sale carries an idempotency key, so re-sending after a
 * timeout is safe and each sale gets its own verdict.
 */
export async function POST(request: Request) {
  try {
    const principal = await authorize('pos.operate')
    const body = await parseBody(request, posSyncRequest)

    const results = await syncSales(
      (work) => withTenant(principal.tenantId, work),
      {
        tenantId: principal.tenantId,
        sessionId: body.sessionId,
        warehouseId: body.warehouseId,
        userId: principal.userId,
        sales: body.sales,
      },
    )

    return ok({ results })
  } catch (error) {
    return errorResponse(error)
  }
}
