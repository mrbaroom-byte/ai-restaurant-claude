import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { trialBalance } from '@/server/services/reports'
import { Amount } from '@/components/format'
import { PeriodFilter, resolvePeriod } from '../period-filter'

export const dynamic = 'force-dynamic'

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const period = resolvePeriod(await searchParams)

  const report = await withTenant(principal.tenantId, (tx) =>
    trialBalance(tx, { tenantId: principal.tenantId, from: period.from, to: period.to }),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('reports.trialBalance')}</h1>
      <PeriodFilter period={period} locale={locale} />

      <p
        className={`rounded-md px-4 py-2.5 text-sm ${
          report.balanced ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-800'
        }`}
      >
        {report.balanced ? t('reports.balanced') : t('reports.notBalanced')}
      </p>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-20">#</th>
              <th>{t('reports.account')}</th>
              <th className="text-end">{t('reports.debit')}</th>
              <th className="text-end">{t('reports.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.accountId}>
                <td className="num text-ink-500">{row.accountCode}</td>
                <td>{locale === 'ar' ? row.accountNameAr : row.accountNameEn}</td>
                <td className="text-end">
                  {row.debit.isZero() ? <span className="text-ink-300">—</span> : <Amount value={row.debit.toString()} locale={locale} />}
                </td>
                <td className="text-end">
                  {row.credit.isZero() ? <span className="text-ink-300">—</span> : <Amount value={row.credit.toString()} locale={locale} />}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-300 font-semibold">
              <td colSpan={2} className="px-3 py-2">
                {t('app.total')}
              </td>
              <td className="px-3 py-2 text-end">
                <Amount value={report.totalDebit.toString()} locale={locale} />
              </td>
              <td className="px-3 py-2 text-end">
                <Amount value={report.totalCredit.toString()} locale={locale} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
