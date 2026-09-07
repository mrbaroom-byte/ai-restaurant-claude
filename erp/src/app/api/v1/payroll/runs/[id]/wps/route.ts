import { authorize, errorResponse } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { wpsFileFor } from '@/server/services/payroll'
import { recordAudit } from '@/server/services/audit'

/** The Wage Protection System file, ready to upload to the bank. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('payroll.wps')
    const { id } = await context.params

    const file = await withTenant(principal.tenantId, (tx) =>
      wpsFileFor(tx, { tenantId: principal.tenantId, payrollRunId: id }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payroll_runs',
      entityId: id,
      action: 'WPS_EXPORT',
      after: { filename: file.filename, records: file.recordCount, total: file.totalAmount.toFixed(2) },
    })

    return new Response(file.content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        // Warnings are advisory — an unusually large net pay, say — and travel in a header so
        // the file itself stays exactly what the bank expects.
        ...(file.warnings.length ? { 'X-Nakhla-Warnings': encodeURIComponent(file.warnings.join(' | ')) } : {}),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
