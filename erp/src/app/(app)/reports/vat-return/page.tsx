import Link from 'next/link'
import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { withTenant } from '@/server/db'
import { vatReturn } from '@/server/services/reports'
import { VAT_RETURN_LABELS } from '@/lib/tax/vat'
import { Amount, DateText } from '@/components/format'
import { PeriodFilter, resolvePeriod } from '../period-filter'

export const dynamic = 'force-dynamic'

const AMOUNT_ONLY_BOXES = new Set(['box13', 'box14', 'box15'])

export default async function VatReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; box?: string }>
}) {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const params = await searchParams

  const now = new Date()
  const period = resolvePeriod(
    {
      from: params.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
      to: params.to,
    },
    now,
  )

  const result = await withTenant(principal.tenantId, (tx) =>
    vatReturn(tx, { tenantId: principal.tenantId, from: period.from, to: period.to }),
  )

  const boxes = Object.entries(VAT_RETURN_LABELS)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('nav.vatReturn')}</h1>
      <PeriodFilter period={period} locale={locale} />

      <p className="rounded-md bg-sky-50 px-4 py-2.5 text-sm text-sky-900">{t('reports.vatReturnHint')}</p>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16">#</th>
              <th>{t('reports.account')}</th>
              <th className="text-end">{t('invoice.taxableAmount')}</th>
              <th className="text-end">{t('invoice.vatAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map(([key, label]) => {
              const value = result.return[key as keyof typeof result.return]
              const isTotal = key === 'box6' || key === 'box12' || AMOUNT_ONLY_BOXES.has(key)
              const amountOnly = AMOUNT_ONLY_BOXES.has(key)

              return (
                <tr key={key} className={isTotal ? 'bg-ink-50 font-semibold' : ''}>
                  <td className="num text-ink-500">{key.replace('box', '')}</td>
                  <td>{locale === 'ar' ? label.ar : label.en}</td>
                  <td className="text-end">
                    {amountOnly ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      <Amount value={(value as { taxable: unknown }).taxable!.toString()} locale={locale} />
                    )}
                  </td>
                  <td className="text-end">
                    <Amount
                      value={amountOnly ? value!.toString() : (value as { vat: unknown }).vat!.toString()}
                      locale={locale}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-ink-800">
          {t('nav.invoices')} · <span className="num">{result.sources.length}</span>
        </h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('invoice.number')}</th>
                <th>{t('invoice.date')}</th>
                <th>{t('invoice.buyer')}</th>
                <th>{t('invoice.vatRate')}</th>
                <th className="text-end">{t('invoice.taxableAmount')}</th>
                <th className="text-end">{t('invoice.vatAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {result.sources.map((source) => (
                <tr key={`${source.kind}-${source.documentId}-${source.category}`}>
                  <td>
                    {source.kind === 'SALE' ? (
                      <Link href={`/invoices/${source.documentId}`} className="text-brand-700 hover:underline">
                        {source.number}
                      </Link>
                    ) : (
                      source.number
                    )}
                  </td>
                  <td>
                    <DateText value={source.date} locale={locale} />
                  </td>
                  <td>{source.partyName ?? '—'}</td>
                  <td className="text-xs text-ink-500">{source.category}</td>
                  <td className="text-end">
                    <Amount value={source.taxable} locale={locale} />
                  </td>
                  <td className="text-end">
                    <Amount value={source.vat} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
