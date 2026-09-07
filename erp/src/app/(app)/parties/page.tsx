import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, EmptyState } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'

export const dynamic = 'force-dynamic'

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>
}) {
  const principal = await requirePermission('contacts.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const params = await searchParams
  const role = params.role === 'supplier' ? 'supplier' : 'customer'
  const query = params.q?.trim()

  const parties = await prisma.party.findMany({
    where: {
      tenantId: principal.tenantId,
      deletedAt: null,
      ...(role === 'supplier' ? { isSupplier: true } : { isCustomer: true }),
      ...(query
        ? {
            OR: [
              { code: { contains: query, mode: 'insensitive' } },
              { nameEn: { contains: query, mode: 'insensitive' } },
              { nameAr: { contains: query } },
              { vatNumber: { contains: query } },
            ],
          }
        : {}),
    },
    include: { address: { select: { city: true, district: true } } },
    orderBy: { code: 'asc' },
    take: 200,
  })

  return (
    <div className="space-y-4">
      <PageHeader title={role === 'supplier' ? t('nav.suppliers') : t('nav.customers')} />

      <nav className="no-print flex gap-2">
        {(['customer', 'supplier'] as const).map((option) => (
          <a
            key={option}
            href={`/parties?role=${option}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              option === role ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'
            }`}
          >
            {option === 'customer' ? t('nav.customers') : t('nav.suppliers')}
          </a>
        ))}
      </nav>

      <form className="card flex flex-wrap items-end gap-3 p-3" method="get">
        <input type="hidden" name="role" value={role} />
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
            {t('app.search')}
          </label>
          <input id="q" name="q" defaultValue={query} className="field" />
        </div>
        <button type="submit" className="btn-secondary">
          {t('app.search')}
        </button>
      </form>

      <div className="card">
        {parties.length === 0 ? (
          <EmptyState
            title={role === 'supplier' ? t('nav.suppliers') : t('nav.customers')}
            body={
              locale === 'ar'
                ? 'لا توجد جهات مسجلة بعد. أضف عميلاً أو مورداً لتتمكن من إصدار الفواتير وتتبع الذمم.'
                : 'Nobody here yet. Add a customer or supplier so invoices and balances have somewhere to go.'
            }
          />
        ) : (
          <DataTable
            rows={parties}
            locale={locale}
            rowKey={(party) => party.id}
            columns={[
              { key: 'code', header: 'ID', render: (party) => <span className="num text-ink-500">{party.code}</span> },
              { key: 'name', header: t('invoice.buyer'), render: (party, l) => (l === 'ar' ? party.nameAr : party.nameEn) },
              {
                key: 'vat',
                header: t('invoice.vatNumber'),
                render: (party) => (party.vatNumber ? <span className="num">{party.vatNumber}</span> : '—'),
              },
              {
                key: 'city',
                header: t('invoice.address'),
                render: (party) => party.address?.city ?? '—',
              },
              {
                key: 'terms',
                header: t('invoice.dueDate'),
                numeric: true,
                render: (party) => <span className="num">{party.paymentTermDays}</span>,
              },
              {
                key: 'limit',
                header: t('invoice.outstanding'),
                numeric: true,
                render: (party, l) =>
                  Number(party.creditLimit) === 0 ? (
                    <span className="text-ink-300">—</span>
                  ) : (
                    <Amount value={party.creditLimit.toString()} locale={l} muted />
                  ),
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
