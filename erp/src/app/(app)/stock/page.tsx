import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma, withTenant } from '@/server/db'
import { lowStockItems } from '@/server/services/inventory'
import { Amount, EmptyState, Quantity } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { can } from '@/lib/rbac'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function StockPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const principal = await requirePermission('inventory.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const lowOnly = (await searchParams).filter === 'low'

  const [balances, low] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { tenantId: principal.tenantId },
      include: {
        item: { select: { id: true, sku: true, nameEn: true, nameAr: true, reorderLevel: true } },
        warehouse: { select: { code: true, nameEn: true, nameAr: true } },
      },
      orderBy: [{ item: { sku: 'asc' } }],
    }),
    withTenant(principal.tenantId, (tx) => lowStockItems(tx, principal.tenantId)),
  ])

  const lowIds = new Set(low.map((row) => row.id))
  const rows = lowOnly ? balances.filter((balance) => lowIds.has(balance.itemId)) : balances
  const showValue = can(principal, 'inventory.cost.view')
  const totalValue = rows.reduce((sum, row) => sum.plus(money(row.value.toString())), money(0))

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.stock')} />

      <nav className="no-print flex gap-2">
        <a href="/stock" className={`rounded-md px-3 py-1.5 text-sm ${lowOnly ? 'bg-white text-ink-600' : 'bg-brand-600 text-white'}`}>
          {t('app.all')}
        </a>
        <a href="/stock?filter=low" className={`rounded-md px-3 py-1.5 text-sm ${lowOnly ? 'bg-brand-600 text-white' : 'bg-white text-ink-600'}`}>
          {t('dashboard.lowStock')} <span className="num">({low.length})</span>
        </a>
      </nav>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            title={t('nav.stock')}
            body={
              lowOnly
                ? locale === 'ar'
                  ? 'لا توجد أصناف تحت حد إعادة الطلب. المخزون في وضع جيد.'
                  : 'Nothing is below its reorder level. Stock is in good shape.'
                : locale === 'ar'
                  ? 'لا توجد حركات مخزون بعد. سجّل استلام بضاعة لتبدأ الأرصدة بالظهور.'
                  : 'No stock movements yet. Receive some goods and balances will appear here.'
            }
          />
        ) : (
          <DataTable
            rows={rows}
            locale={locale}
            rowKey={(row) => row.id}
            columns={[
              { key: 'sku', header: 'SKU', render: (row) => <span className="num text-ink-500">{row.item.sku}</span> },
              { key: 'item', header: t('invoice.description'), render: (row, l) => (l === 'ar' ? row.item.nameAr : row.item.nameEn) },
              { key: 'warehouse', header: t('nav.inventory'), render: (row, l) => (l === 'ar' ? row.warehouse.nameAr : row.warehouse.nameEn) },
              {
                key: 'quantity',
                header: t('invoice.quantity'),
                numeric: true,
                render: (row, l) => (
                  <span className={lowIds.has(row.itemId) ? 'text-amber-700' : undefined}>
                    <Quantity value={row.quantity.toString()} locale={l} />
                  </span>
                ),
              },
              {
                key: 'reorder',
                header: t('dashboard.lowStock'),
                numeric: true,
                render: (row, l) => <Quantity value={row.item.reorderLevel.toString()} locale={l} />,
              },
              ...(showValue
                ? [
                    {
                      key: 'value',
                      header: t('app.total'),
                      numeric: true,
                      render: (row: (typeof rows)[number], l: typeof locale) => (
                        <Amount value={row.value.toString()} locale={l} />
                      ),
                    },
                  ]
                : []),
            ]}
            footer={
              showValue ? (
                <tfoot>
                  <tr className="border-t-2 border-ink-300 font-semibold">
                    <td colSpan={5} className="px-3 py-2">
                      {t('app.total')}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Amount value={totalValue.toString()} locale={locale} />
                    </td>
                  </tr>
                </tfoot>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  )
}
