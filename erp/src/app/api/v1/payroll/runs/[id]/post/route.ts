import { authorize, errorResponse, ok } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { postRun } from '@/server/services/payroll'
import { recordAudit } from '@/server/services/audit'

/**
 * Posting a payroll run is a different permission from creating it: HR prepares the numbers,
 * the Accountant puts them in the books.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('payroll.post')
    const { id } = await context.params

    const result = await withTenant(principal.tenantId, (tx) =>
      postRun(tx, { tenantId: principal.tenantId, payrollRunId: id, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payroll_runs',
      entityId: id,
      action: 'POST',
      after: { entryId: result.entryId },
    })

    return ok(result)
  } catch (error) {
    return errorResponse(error)
  }
}
