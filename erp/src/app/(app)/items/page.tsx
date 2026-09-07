import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, EmptyState, Quantity, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const principal = await requirePermission('inventory.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const query = (await searchParams).q?.trim()

  const items = await prisma.item.findMany({
    where: {
      tenantId: principal.tenantId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { sku: { contains: query, mode: 'insensitive' } },
              { barcode: { contains: query } },
              { nameEn: { contains: query, mode: 'insensitive' } },
              { nameAr: { contains: query } },
            ],
          }
        : {}),
    },
    include: {
      uom: { select: { code: true } },
      category: { select: { nameEn: true, nameAr: true } },
      balances: { select: { quantity: true } },
    },
    orderBy: { sku: 'asc' },
    take: 200,
  })

  const showCost = can(principal, 'inventory.cost.view')

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.items')} />

      <form className="card flex flex-wrap items-end gap-3 p-3" method="get">
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
        {items.length === 0 ? (
          <EmptyState
            title={t('nav.items')}
            body={
              locale === 'ar'
                ? 'لا توجد أصناف بعد. أضف أصنافك لتتمكن من البيع والشراء وتتبع المخزون.'
                : 'No items yet. Add the things you buy and sell so stock and invoices have something to work with.'
            }
          />
        ) : (
          <DataTable
            rows={items}
            locale={locale}
            rowKey={(item) => item.id}
            columns={[
              { key: 'sku', header: 'SKU', render: (item) => <span className="num text-ink-500">{item.sku}</span> },
              {
                key: 'name',
                header: t('invoice.description'),
                render: (item, l) => (
                  <>
                    <span className="block">{l === 'ar' ? item.nameAr : item.nameEn}</span>
                    {item.barcode && <span className="num block text-xs text-ink-400">{item.barcode}</span>}
                  </>
                ),
              },
              {
                key: 'category',
                header: t('nav.inventory'),
                render: (item, l) =>
                  item.category ? (l === 'ar' ? item.category.nameAr : item.category.nameEn) : '—',
              },
              { key: 'kind', header: t('invoice.status'), render: (item) => <StatusBadge status={item.kind} label={item.kind} /> },
              { key: 'uom', header: t('invoice.quantity'), render: (item) => item.uom.code },
              {
                key: 'onHand',
                header: t('nav.stock'),
                numeric: true,
                render: (item, l) =>
                  item.kind === 'SERVICE' ? (
                    <span className="text-ink-300">—</span>
                  ) : (
                    <Quantity
                      value={item.balances.reduce((sum, b) => sum + Number(b.quantity), 0)}
                      locale={l}
                    />
                  ),
              },
              {
                key: 'price',
                header: t('invoice.unitPrice'),
                numeric: true,
                render: (item, l) => <Amount value={item.sellingPrice.toString()} locale={l} />,
              },
              ...(showCost
                ? [
                    {
                      key: 'cost',
                      header: t('reports.costOfSales'),
                      numeric: true,
                      render: (item: (typeof items)[number], l: typeof locale) => (
                        <Amount value={item.lastCost.toString()} locale={l} muted />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
    </div>
  )
}
