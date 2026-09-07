import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { balanceSheet, type StatementLine } from '@/server/services/reports'
import { Amount } from '@/components/format'
import { PeriodFilter, resolvePeriod } from '../period-filter'
import type { Locale } from '@/lib/i18n/config'
import type { Money } from '@/lib/money'

export const dynamic = 'force-dynamic'

function Column({
  title,
  lines,
  total,
  locale,
  extra,
}: {
  title: string
  lines: StatementLine[]
  total: Money
  locale: Locale
  extra?: { label: string; amount: Money }
}) {
  return (
    <section className="card table-wrap">
      <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-ink-800">{title}</h2>
      <table className="data-table">
        <tbody>
          {lines.map((line) => (
            <tr key={line.accountId}>
              <td>
                <span className="num me-2 text-ink-400">{line.code}</span>
                {locale === 'ar' ? line.nameAr : line.nameEn}
              </td>
              <td className="text-end">
                <Amount value={line.amount.toString()} locale={locale} />
              </td>
            </tr>
          ))}
          {extra && (
            <tr>
              <td className="italic text-ink-600">{extra.label}</td>
              <td className="text-end">
                <Amount value={extra.amount.toString()} locale={locale} />
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-300 font-semibold">
            <td className="px-3 py-2">{title}</td>
            <td className="px-3 py-2 text-end">
              <Amount value={total.toString()} locale={locale} />
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const period = resolvePeriod(await searchParams)

  const report = await withTenant(principal.tenantId, (tx) =>
    balanceSheet(tx, { tenantId: principal.tenantId, to: period.to }),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('nav.balanceSheet')}</h1>
      <PeriodFilter period={period} locale={locale} />

      {!report.balanced && (
        <p className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">{t('reports.notBalanced')}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Column title={t('reports.assets')} lines={report.assets} total={report.totalAssets} locale={locale} />
        <div className="space-y-4">
          <Column title={t('reports.liabilities')} lines={report.liabilities} total={report.totalLiabilities} locale={locale} />
          <Column
            title={t('reports.equity')}
            lines={report.equity}
            total={report.totalEquity}
            locale={locale}
            extra={{ label: t('reports.resultForPeriod'), amount: report.resultForPeriod }}
          />
        </div>
      </div>
    </div>
  )
}
