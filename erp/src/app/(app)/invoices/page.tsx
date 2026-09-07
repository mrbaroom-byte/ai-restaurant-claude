import Link from 'next/link'
import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, EmptyState, StatusBadge } from '@/components/format'
import { can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; zatca?: string }>
}) {
  const principal = await requirePermission('sales.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? 1))
  const query = params.q?.trim()

  const where = {
    tenantId: principal.tenantId,
    deletedAt: null,
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.zatca === 'rejected'
      ? { submissions: { some: { status: { in: ['REJECTED', 'FAILED'] as never[] } } } }
      : {}),
    ...(query
      ? {
          OR: [
            { number: { contains: query, mode: 'insensitive' as const } },
            { party: { nameAr: { contains: query } } },
            { party: { nameEn: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    // A branch-scoped user sees their own branch only.
    ...(principal.branchIds.length ? { branchId: { in: principal.branchIds } } : {}),
  }

  const [invoices, count] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        party: { select: { nameAr: true, nameEn: true } },
        submissions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
  ])

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.invoices')}</h1>
        {can(principal, 'sales.create') && (
          <Link href="/invoices/new" className="btn-primary">
            {t('invoice.taxInvoice')}
          </Link>
        )}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3" method="get">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
            {t('app.search')}
          </label>
          <input id="q" name="q" defaultValue={query} className="field" placeholder="INV-JED-2026-…" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-600">
            {t('invoice.status')}
          </label>
          <select id="status" name="status" defaultValue={params.status ?? ''} className="field">
            <option value="">{t('app.all')}</option>
            {['DRAFT', 'POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED'].map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          {t('app.search')}
        </button>
      </form>

      <div className="card">
        {invoices.length === 0 ? (
          <EmptyState
            title={t('nav.invoices')}
            body={t('invoice.emptyState')}
            action={
              can(principal, 'sales.create') ? (
                <Link href="/invoices/new" className="btn-primary">
                  {t('invoice.taxInvoice')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('invoice.number')}</th>
                    <th>{t('invoice.date')}</th>
                    <th>{t('invoice.buyer')}</th>
                    <th>{t('invoice.subtotal')}</th>
                    <th>{t('invoice.totalVat')}</th>
                    <th>{t('invoice.payable')}</th>
                    <th>{t('invoice.status')}</th>
                    <th>{t('dashboard.zatcaStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-brand-700 hover:underline">
                          {invoice.number ?? t('status.DRAFT')}
                        </Link>
                        {invoice.documentType === 'CREDIT_NOTE' && (
                          <span className="ms-2 badge bg-amber-100 text-amber-800">{t('invoice.creditNote')}</span>
                        )}
                      </td>
                      <td>
                        <DateText value={invoice.date} locale={locale} />
                      </td>
                      <td>
                        {invoice.party
                          ? locale === 'ar'
                            ? invoice.party.nameAr
                            : invoice.party.nameEn
                          : t('invoice.simplifiedTaxInvoice')}
                      </td>
                      <td>
                        <Amount value={invoice.taxableTotal.toString()} locale={locale} />
                      </td>
                      <td>
                        <Amount value={invoice.vatTotal.toString()} locale={locale} muted />
                      </td>
                      <td>
                        <Amount value={invoice.payableTotal.toString()} locale={locale} />
                      </td>
                      <td>
                        <StatusBadge status={invoice.status} label={t(`status.${invoice.status}`)} />
                      </td>
                      <td>
                        {invoice.submissions[0] ? (
                          <StatusBadge
                            status={invoice.submissions[0].status}
                            label={t(`dashboard.${invoice.submissions[0].status.toLowerCase()}`)}
                          />
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
                <span className="text-ink-500">
                  <span className="num">{count}</span>
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link href={`/invoices?page=${page - 1}`} className="btn-secondary px-3 py-1.5 text-xs">
                      ‹
                    </Link>
                  )}
                  <span className="px-2 py-1.5 text-xs text-ink-600">
                    <span className="num">{page}</span> / <span className="num">{pages}</span>
                  </span>
                  {page < pages && (
                    <Link href={`/invoices?page=${page + 1}`} className="btn-secondary px-3 py-1.5 text-xs">
                      ›
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
