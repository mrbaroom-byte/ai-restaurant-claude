import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, EmptyState, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function BillsPage() {
  const principal = await requirePermission('purchasing.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const bills = await prisma.supplierBill.findMany({
    where: { tenantId: principal.tenantId, deletedAt: null },
    include: { party: { select: { nameEn: true, nameAr: true } } },
    orderBy: [{ date: 'desc' }],
    take: 200,
  })

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.bills')} />

      <div className="card">
        {bills.length === 0 ? (
          <EmptyState
            title={t('nav.bills')}
            body={
              locale === 'ar'
                ? 'لا توجد فواتير موردين بعد. تسجيل فاتورة المورد هو ما يُدخل ضريبة المدخلات في الإقرار الضريبي.'
                : 'No supplier bills yet. Recording one is what puts input VAT into your return.'
            }
          />
        ) : (
          <DataTable
            rows={bills}
            locale={locale}
            rowKey={(bill) => bill.id}
            columns={[
              { key: 'number', header: t('invoice.number'), render: (bill) => <span className="num font-medium">{bill.number}</span> },
              {
                key: 'supplierNumber',
                header: locale === 'ar' ? 'رقم فاتورة المورد' : 'Supplier invoice',
                render: (bill) => <span className="num text-xs text-ink-500">{bill.supplierInvoiceNumber ?? '—'}</span>,
              },
              { key: 'date', header: t('invoice.date'), render: (bill, l) => <DateText value={bill.date} locale={l} /> },
              { key: 'party', header: t('nav.suppliers'), render: (bill, l) => (l === 'ar' ? bill.party.nameAr : bill.party.nameEn) },
              { key: 'net', header: t('invoice.subtotal'), numeric: true, render: (bill, l) => <Amount value={bill.taxableTotal.toString()} locale={l} /> },
              { key: 'vat', header: t('invoice.totalVat'), numeric: true, render: (bill, l) => <Amount value={bill.vatTotal.toString()} locale={l} muted /> },
              { key: 'total', header: t('invoice.payable'), numeric: true, render: (bill, l) => <Amount value={bill.payableTotal.toString()} locale={l} /> },
              {
                key: 'outstanding',
                header: t('invoice.outstanding'),
                numeric: true,
                render: (bill, l) => (
                  <Amount value={money(bill.payableTotal.toString()).minus(money(bill.paidTotal.toString())).toString()} locale={l} />
                ),
              },
              { key: 'status', header: t('invoice.status'), render: (bill) => <StatusBadge status={bill.status} label={t(`status.${bill.status}`)} /> },
            ]}
          />
        )}
      </div>
    </div>
  )
}
