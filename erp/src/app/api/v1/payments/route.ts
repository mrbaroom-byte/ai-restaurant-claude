import { paymentRequest } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { recordPayment } from '@/server/services/payment'
import { recordAudit } from '@/server/services/audit'
import { assertBranch } from '@/lib/rbac'

export async function POST(request: Request) {
  try {
    const principal = await authorize('sales.payment')
    const body = await parseBody(request, paymentRequest)
    assertBranch(principal, body.branchId)

    const result = await withTenant(principal.tenantId, (tx) =>
      recordPayment(tx, { ...body, tenantId: principal.tenantId, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payments',
      entityId: result.paymentId,
      action: 'RECORD',
      after: { number: result.number, amount: body.amount, allocated: result.allocated },
    })

    return ok(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
