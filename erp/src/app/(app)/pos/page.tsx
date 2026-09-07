import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { EmptyState } from '@/components/format'
import { Till } from './till'

export const dynamic = 'force-dynamic'

export default async function PosPage() {
  const principal = await requirePermission('pos.operate')
  const locale = await currentLocale()
  const t = translator(locale)

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: principal.tenantId },
    select: { posEnabled: true, vatRate: true },
  })

  if (!tenant.posEnabled) {
    return (
      <div className="card">
        <EmptyState title={t('pos.title')} body={t('errors.forbidden')} />
      </div>
    )
  }

  const branchId = principal.branchIds[0]
  const branch = await prisma.branch.findFirstOrThrow({
    where: { tenantId: principal.tenantId, ...(branchId ? { id: branchId } : {}), active: true },
    include: { warehouses: { where: { active: true }, take: 1 } },
  })

  const [items, session] = await Promise.all([
    prisma.item.findMany({
      where: {
        tenantId: principal.tenantId,
        active: true,
        deletedAt: null,
        kind: { in: ['FINISHED_GOOD', 'STOCK', 'SERVICE'] },
      },
      include: { category: { select: { id: true, nameEn: true, nameAr: true } } },
      orderBy: { nameEn: 'asc' },
      take: 200,
    }),
    prisma.posSession.findFirst({
      where: { tenantId: principal.tenantId, userId: principal.userId, status: 'OPEN' },
    }),
  ])

  return (
    <Till
      locale={locale}
      vatRate={tenant.vatRate.toString()}
      warehouseId={branch.warehouses[0]?.id ?? ''}
      branchId={branch.id}
      session={session ? { id: session.id, number: session.number } : null}
      items={items.map((item) => ({
        id: item.id,
        sku: item.sku,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        price: item.sellingPrice.toString(),
        priceIncludesVat: item.priceIncludesVat,
        categoryId: item.category?.id ?? null,
        categoryEn: item.category?.nameEn ?? null,
        categoryAr: item.category?.nameAr ?? null,
      }))}
      labels={{
        title: t('pos.title'),
        openSession: t('pos.openSession'),
        closeSession: t('pos.closeSession'),
        openingFloat: t('pos.openingFloat'),
        countedCash: t('pos.countedCash'),
        cash: t('pos.cash'),
        mada: t('pos.mada'),
        card: t('pos.card'),
        stcPay: t('pos.stcPay'),
        pay: t('pos.pay'),
        offline: t('pos.offline'),
        queued: t('pos.queued'),
        syncNow: t('pos.syncNow'),
        total: t('invoice.grandTotal'),
        subtotal: t('invoice.subtotal'),
        vat: t('invoice.totalVat'),
        all: t('app.all'),
        search: t('app.search'),
        cancel: t('app.cancel'),
        empty: t('dashboard.empty'),
      }}
    />
  )
}
