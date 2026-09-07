import { reportQuery } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseQuery } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { profitAndLoss, type StatementLine } from '@/server/services/reports'

const serialise = (lines: StatementLine[]) =>
  lines.map((line) => ({
    code: line.code,
    nameEn: line.nameEn,
    nameAr: line.nameAr,
    amount: line.amount.toFixed(2),
    comparative: line.comparative?.toFixed(2),
  }))

export async function GET(request: Request) {
  try {
    const principal = await authorize('accounting.view')
    const query = parseQuery(request, reportQuery)

    const report = await withTenant(principal.tenantId, (tx) =>
      profitAndLoss(tx, { tenantId: principal.tenantId, ...query }),
    )

    return ok({
      revenue: serialise(report.revenue),
      costOfSales: serialise(report.costOfSales),
      operatingExpenses: serialise(report.operatingExpenses),
      otherIncome: serialise(report.otherIncome),
      totals: {
        revenue: report.totalRevenue.toFixed(2),
        costOfSales: report.totalCostOfSales.toFixed(2),
        grossProfit: report.grossProfit.toFixed(2),
        operatingExpenses: report.totalOperatingExpenses.toFixed(2),
        operatingProfit: report.operatingProfit.toFixed(2),
        otherIncome: report.totalOtherIncome.toFixed(2),
        netProfit: report.netProfit.toFixed(2),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
