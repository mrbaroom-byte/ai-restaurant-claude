import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { payablesAging, receivablesAging } from '@/server/services/reports'
import { Amount, EmptyState } from '@/components/format'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function AgingPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const principal = await requirePermission('contacts.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const kind = (await searchParams).kind === 'payable' ? 'payable' : 'receivable'

  const rows = await withTenant(principal.tenantId, (tx) =>
    kind === 'payable' ? payablesAging(tx, principal.tenantId) : receivablesAging(tx, principal.tenantId),
  )

  const columns = [
    { key: 'current', label: t('reports.current') },
    { key: 'days1to30', label: t('reports.days1to30') },
    { key: 'days31to60', label: t('reports.days31to60') },
    { key: 'days61to90', label: t('reports.days61to90') },
    { key: 'over90', label: t('reports.over90') },
  ] as const

  const columnTotal = (key: (typeof columns)[number]['key']) =>
    rows.reduce((acc, row) => acc.plus(row[key]), money(0))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('nav.aging')}</h1>

      <nav className="no-print flex gap-2">
        {(['receivable', 'payable'] as const).map((option) => (
          <a
            key={option}
            href={`/reports/aging?kind=${option}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              option === kind ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'
            }`}
          >
            {option === 'receivable' ? t('dashboard.receivables') : t('dashboard.payables')}
          </a>
        ))}
      </nav>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState title={t('nav.aging')} body={t('app.none')} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{kind === 'receivable' ? t('nav.customers') : t('nav.suppliers')}</th>
                  {columns.map((column) => (
                    <th key={column.key} className="text-end">
                      {column.label}
                    </th>
                  ))}
                  <th className="text-end">{t('app.total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.partyId}>
                    <td className="font-medium">{row.partyName}</td>
                    {columns.map((column) => (
                      <td key={column.key} className="text-end">
                        {row[column.key].isZero() ? (
                          <span className="text-ink-300">—</span>
                        ) : (
                          <Amount value={row[column.key].toString()} locale={locale} />
                        )}
                      </td>
                    ))}
                    <td className="text-end font-semibold">
                      <Amount value={row.total.toString()} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-300 font-semibold">
                  <td className="px-3 py-2">{t('app.total')}</td>
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 text-end">
                      <Amount value={columnTotal(column.key).toString()} locale={locale} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-end">
                    <Amount value={columnTotal('current').plus(columnTotal('days1to30')).plus(columnTotal('days31to60')).plus(columnTotal('days61to90')).plus(columnTotal('over90')).toString()} locale={locale} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
