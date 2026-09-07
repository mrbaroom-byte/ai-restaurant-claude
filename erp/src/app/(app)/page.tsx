import Link from 'next/link'
import { currentLocale, requirePrincipal } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { dashboard } from '@/server/services/reports'
import { Amount, EmptyState, Quantity } from '@/components/format'
import { can } from '@/lib/rbac'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

function Tile({
  label,
  children,
  hint,
  tone = 'neutral',
}: {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const accent = {
    neutral: 'text-ink-900',
    good: 'text-brand-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  }[tone]

  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold ${accent}`}>{children}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  const principal = await requirePrincipal()
  const locale = await currentLocale()
  const t = translator(locale)

  const view = await withTenant(principal.tenantId, (tx) => dashboard(tx, principal.tenantId))

  const ytd = money(view.salesYearToDate)
  const lastYtd = money(view.salesLastYearToDate)
  const growth = lastYtd.isZero() ? null : ytd.minus(lastYtd).div(lastYtd).times(100)

  const nothingYet = ytd.isZero() && money(view.cashPosition).isZero() && view.zatca.cleared === 0

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-ink-900">{t('dashboard.title')}</h1>

      {nothingYet ? (
        <div className="card">
          <EmptyState
            title={t('dashboard.title')}
            body={t('dashboard.empty')}
            action={
              can(principal, 'sales.create') ? (
                <Link href="/invoices/new" className="btn-primary">
                  {t('nav.invoices')}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label={t('dashboard.cashPosition')}>
              <Amount value={view.cashPosition} locale={locale} />
            </Tile>
            <Tile label={t('dashboard.salesToday')}>
              <Amount value={view.salesToday} locale={locale} />
            </Tile>
            <Tile label={t('dashboard.salesMonth')}>
              <Amount value={view.salesMonthToDate} locale={locale} />
            </Tile>
            <Tile
              label={t('dashboard.salesYear')}
              hint={
                growth
                  ? `${growth.toFixed(1)}% ${t('dashboard.vsLastYear')}`
                  : undefined
              }
              tone={growth ? (growth.greaterThan(0) ? 'good' : 'bad') : 'neutral'}
            >
              <Amount value={view.salesYearToDate} locale={locale} />
            </Tile>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label={t('dashboard.receivables')}>
              <Link href="/reports/aging" className="hover:underline">
                <Amount value={view.receivables} locale={locale} />
              </Link>
            </Tile>
            <Tile label={t('dashboard.payables')}>
              <Amount value={view.payables} locale={locale} />
            </Tile>
            <Tile label={t('dashboard.lowStock')} tone={view.lowStockCount > 0 ? 'warn' : 'neutral'}>
              <Link href="/stock?filter=low" className="hover:underline">
                <span className="num">{view.lowStockCount}</span>
              </Link>
            </Tile>
            <Tile
              label={t('dashboard.zatcaStatus')}
              tone={view.zatca.rejected > 0 ? 'bad' : view.zatca.pending > 0 ? 'warn' : 'good'}
              hint={
                <span className="flex flex-wrap gap-x-3">
                  <span>
                    {t('dashboard.cleared')} <span className="num">{view.zatca.cleared}</span>
                  </span>
                  <span>
                    {t('dashboard.reported')} <span className="num">{view.zatca.reported}</span>
                  </span>
                  <span>
                    {t('dashboard.pending')} <span className="num">{view.zatca.pending}</span>
                  </span>
                </span>
              }
            >
              <Link href="/invoices?zatca=rejected" className="hover:underline">
                {view.zatca.rejected > 0 ? (
                  <>
                    <span className="num">{view.zatca.rejected}</span> {t('dashboard.rejected')}
                  </>
                ) : (
                  t('dashboard.cleared')
                )}
              </Link>
            </Tile>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-ink-800">
                {t('dashboard.topItems')}
              </h2>
              {view.topItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-500">{t('app.none')}</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('invoice.description')}</th>
                        <th>{t('invoice.quantity')}</th>
                        <th>{t('reports.revenue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.topItems.map((item) => (
                        <tr key={item.nameEn}>
                          <td>{locale === 'ar' ? item.nameAr : item.nameEn}</td>
                          <td>
                            <Quantity value={item.quantity} locale={locale} />
                          </td>
                          <td>
                            <Amount value={item.revenue} locale={locale} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-ink-800">
                {t('dashboard.expiringDocuments')}
              </h2>
              {view.expiringDocuments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-500">{t('app.none')}</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {view.expiringDocuments.map((doc) => (
                    <li key={`${doc.kind}-${doc.nameEn}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>{locale === 'ar' ? doc.nameAr : doc.nameEn}</span>
                      <span className={doc.daysLeft < 30 ? 'text-red-700' : 'text-amber-700'}>
                        <span className="num">{doc.daysLeft}</span> {t('dashboard.daysLeft')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
