import { reportQuery } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseQuery } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { balanceSheet, type StatementLine } from '@/server/services/reports'

const serialise = (lines: StatementLine[]) =>
  lines.map((line) => ({ code: line.code, nameEn: line.nameEn, nameAr: line.nameAr, amount: line.amount.toFixed(2) }))

export async function GET(request: Request) {
  try {
    const principal = await authorize('accounting.view')
    const query = parseQuery(request, reportQuery)

    const report = await withTenant(principal.tenantId, (tx) =>
      balanceSheet(tx, { tenantId: principal.tenantId, ...query }),
    )

    return ok({
      assets: serialise(report.assets),
      liabilities: serialise(report.liabilities),
      equity: serialise(report.equity),
      totals: {
        assets: report.totalAssets.toFixed(2),
        liabilities: report.totalLiabilities.toFixed(2),
        equity: report.totalEquity.toFixed(2),
        resultForPeriod: report.resultForPeriod.toFixed(2),
      },
      // Surfaced rather than assumed: a balance sheet that does not balance is a fact the
      // caller needs, not something to hide behind a rounded total.
      balanced: report.balanced,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
