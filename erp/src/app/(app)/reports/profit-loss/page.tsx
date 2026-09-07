import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { profitAndLoss, type StatementLine } from '@/server/services/reports'
import { Amount } from '@/components/format'
import { PeriodFilter, resolvePeriod } from '../period-filter'
import type { Locale } from '@/lib/i18n/config'
import type { Money } from '@/lib/money'

export const dynamic = 'force-dynamic'

function Section({
  title,
  lines,
  total,
  locale,
  comparative,
}: {
  title: string
  lines: StatementLine[]
  total: Money
  locale: Locale
  comparative: boolean
}) {
  if (lines.length === 0) return null
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={comparative ? 3 : 2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
          {title}
        </td>
      </tr>
      {lines.map((line) => (
        <tr key={line.accountId}>
          <td className="ps-6">
            <span className="num me-2 text-ink-400">{line.code}</span>
            {locale === 'ar' ? line.nameAr : line.nameEn}
          </td>
          <td className="text-end">
            <Amount value={line.amount.toString()} locale={locale} />
          </td>
          {comparative && (
            <td className="text-end">
              <Amount value={(line.comparative ?? '0').toString()} locale={locale} muted />
            </td>
          )}
        </tr>
      ))}
      <tr className="font-medium">
        <td className="ps-6">{title}</td>
        <td className="text-end">
          <Amount value={total.toString()} locale={locale} />
        </td>
        {comparative && <td />}
      </tr>
    </>
  )
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; compare?: string }>
}) {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const params = await searchParams
  const period = resolvePeriod(params)
  const comparative = params.compare === '1'

  const priorYear = (date: Date) => new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate()))

  const report = await withTenant(principal.tenantId, (tx) =>
    profitAndLoss(
      tx,
      { tenantId: principal.tenantId, from: period.from, to: period.to },
      comparative
        ? { tenantId: principal.tenantId, from: priorYear(period.from), to: priorYear(period.to) }
        : undefined,
    ),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('nav.profitLoss')}</h1>
      <PeriodFilter
        period={period}
        locale={locale}
        extra={
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-600">
            <input type="checkbox" name="compare" value="1" defaultChecked={comparative} className="h-4 w-4" />
            {t('reports.comparative')}
          </label>
        }
      />

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('reports.account')}</th>
              <th className="text-end">{t('app.total')}</th>
              {comparative && <th className="text-end">{t('reports.comparative')}</th>}
            </tr>
          </thead>
          <tbody>
            <Section title={t('reports.revenue')} lines={report.revenue} total={report.totalRevenue} locale={locale} comparative={comparative} />
            <Section title={t('reports.costOfSales')} lines={report.costOfSales} total={report.totalCostOfSales} locale={locale} comparative={comparative} />
            <tr className="border-y border-ink-200 bg-brand-50/50 font-semibold">
              <td className="px-3 py-2">{t('reports.grossProfit')}</td>
              <td className="px-3 py-2 text-end">
                <Amount value={report.grossProfit.toString()} locale={locale} />
              </td>
              {comparative && <td />}
            </tr>
            <Section title={t('reports.operatingExpenses')} lines={report.operatingExpenses} total={report.totalOperatingExpenses} locale={locale} comparative={comparative} />
            <tr className="border-y border-ink-200 font-semibold">
              <td className="px-3 py-2">{t('reports.operatingProfit')}</td>
              <td className="px-3 py-2 text-end">
                <Amount value={report.operatingProfit.toString()} locale={locale} />
              </td>
              {comparative && <td />}
            </tr>
            <Section title={t('reports.otherIncome')} lines={report.otherIncome} total={report.totalOtherIncome} locale={locale} comparative={comparative} />
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-300 text-base font-semibold">
              <td className="px-3 py-3">{t('reports.netProfit')}</td>
              <td className="px-3 py-3 text-end">
                <Amount value={report.netProfit.toString()} locale={locale} />
              </td>
              {comparative && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
