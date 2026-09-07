import { reportQuery } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseQuery } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { trialBalance } from '@/server/services/reports'

export async function GET(request: Request) {
  try {
    const principal = await authorize('accounting.view')
    const query = parseQuery(request, reportQuery)

    const report = await withTenant(principal.tenantId, (tx) =>
      trialBalance(tx, { tenantId: principal.tenantId, ...query }),
    )

    return ok({
      balanced: report.balanced,
      totalDebit: report.totalDebit.toFixed(2),
      totalCredit: report.totalCredit.toFixed(2),
      rows: report.rows.map((row) => ({
        accountCode: row.accountCode,
        accountNameEn: row.accountNameEn,
        accountNameAr: row.accountNameAr,
        debit: row.debit.toFixed(2),
        credit: row.credit.toFixed(2),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
