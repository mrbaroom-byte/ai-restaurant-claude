import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, Quantity, StatusBadge } from '@/components/format'
import { formatDualDate } from '@/lib/i18n/config'
import { can } from '@/lib/rbac'
import { money } from '@/lib/money'
import { CreditNoteButton, PostInvoiceButton, PrintButton, RecordPaymentButton } from './actions-client'

export const dynamic = 'force-dynamic'

const DOCUMENT_TITLE_KEY = {
  TAX_INVOICE: { STANDARD: 'invoice.taxInvoice', SIMPLIFIED: 'invoice.simplifiedTaxInvoice' },
  CREDIT_NOTE: { STANDARD: 'invoice.creditNote', SIMPLIFIED: 'invoice.creditNote' },
  DEBIT_NOTE: { STANDARD: 'invoice.debitNote', SIMPLIFIED: 'invoice.debitNote' },
} as const

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePermission('sales.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const { id } = await params

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: principal.tenantId },
    include: {
      lines: { orderBy: { lineNo: 'asc' } },
      party: { include: { address: true } },
      branch: { include: { address: true } },
      submissions: { orderBy: { createdAt: 'desc' } },
      corrections: { select: { id: true, number: true, payableTotal: true, date: true } },
      originalInvoice: { select: { id: true, number: true } },
    },
  })
  if (!invoice) notFound()

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: principal.tenantId },
    select: { legalNameAr: true, legalNameEn: true, vatNumber: true, crNumber: true },
  })

  // The QR is exactly the value embedded in the signed XML — never regenerated for display.
  const qrDataUrl = invoice.qrBase64
    ? await QRCode.toDataURL(invoice.qrBase64, { errorCorrectionLevel: 'M', margin: 1, width: 220 })
    : null

  const titleKey = DOCUMENT_TITLE_KEY[invoice.documentType][invoice.kind]
  const latest = invoice.submissions[0]
  const creditedTotal = invoice.corrections.reduce((acc, c) => acc.plus(money(c.payableTotal.toString())), money(0))
  const outstanding = money(invoice.payableTotal.toString())
    .minus(money(invoice.paidTotal.toString()))
    .minus(creditedTotal)

  const sellerAddress = invoice.branch.address
  const buyerAddress = invoice.party?.address

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/invoices" className="text-sm text-ink-500 hover:text-ink-800">
          ← {t('nav.invoices')}
        </Link>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'DRAFT' && can(principal, 'sales.post') && (
            <PostInvoiceButton invoiceId={invoice.id} label={t('invoice.post')} />
          )}
          {invoice.status !== 'DRAFT' &&
            invoice.documentType === 'TAX_INVOICE' &&
            invoice.partyId &&
            outstanding.greaterThan(0) &&
            can(principal, 'sales.payment') && (
              <RecordPaymentButton
                invoiceId={invoice.id}
                branchId={invoice.branchId}
                partyId={invoice.partyId}
                outstanding={outstanding.toFixed(2)}
                locale={locale}
                labels={{
                  record: locale === 'ar' ? 'تسجيل سند قبض' : 'Record payment',
                  amount: t('invoice.payable'),
                  method: locale === 'ar' ? 'طريقة الدفع' : 'Method',
                  cancel: t('app.cancel'),
                }}
              />
            )}
          {invoice.status !== 'DRAFT' &&
            invoice.documentType === 'TAX_INVOICE' &&
            can(principal, 'sales.credit') && (
              <CreditNoteButton
                invoiceId={invoice.id}
                label={t('invoice.issueCreditNote')}
                reasonLabel={t('invoice.reason')}
                cancelLabel={t('app.cancel')}
              />
            )}
          <a href={`/api/v1/invoices/${invoice.id}/xml`} className="btn-secondary">
            XML
          </a>
          <PrintButton label={t('app.print')} />
        </div>
      </div>

      {invoice.status === 'DRAFT' && (
        <p className="no-print rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('invoice.draftHint')}
        </p>
      )}

      {latest?.status === 'REJECTED' && (
        <section className="no-print rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-red-900">{t('zatca.submissionErrors')}</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {(latest.errors as Array<{ code?: string; message?: string }> | null)?.map((error, i) => (
              <li key={i} className="font-mono text-xs">
                {error.code ? `${error.code}: ` : ''}
                {error.message}
              </li>
            )) ?? <li>{t('errors.unexpected')}</li>}
          </ul>
        </section>
      )}

      {/* The printed document itself. */}
      <article className="card p-6 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            {/* ZATCA requires the document title in Arabic on every invoice. */}
            <span className="no-print mb-2 block">
              <StatusBadge status={invoice.status} label={t(`status.${invoice.status}`)} />
            </span>
            <h1 className="font-arabic text-lg font-bold text-ink-900">
              {locale === 'ar' ? t(titleKey) : `${t(titleKey)} / `}
              {locale !== 'ar' && <span className="font-arabic">{titleKeyArabic(titleKey)}</span>}
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              {locale === 'ar' ? tenant.legalNameAr : tenant.legalNameEn}
            </p>
            <dl className="mt-2 space-y-0.5 text-xs text-ink-600">
              <div className="flex gap-2">
                <dt>{t('invoice.vatNumber')}:</dt>
                <dd className="num">{tenant.vatNumber}</dd>
              </div>
              {tenant.crNumber && (
                <div className="flex gap-2">
                  <dt>{t('invoice.crNumber')}:</dt>
                  <dd className="num">{tenant.crNumber}</dd>
                </div>
              )}
              {sellerAddress && (
                <div className="flex gap-2">
                  <dt>{t('invoice.address')}:</dt>
                  <dd>
                    {[sellerAddress.buildingNumber, sellerAddress.street, sellerAddress.district, sellerAddress.city, sellerAddress.postalCode, sellerAddress.additionalNumber]
                      .filter(Boolean)
                      .join('، ')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {qrDataUrl && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={t('invoice.qrHint')} width={140} height={140} className="mx-auto" />
              <p className="mt-1 max-w-[10rem] text-[10px] leading-tight text-ink-500">{t('invoice.qrHint')}</p>
            </div>
          )}
        </header>

        <section className="grid gap-4 border-b border-[var(--border)] py-4 sm:grid-cols-2">
          <dl className="space-y-1 text-sm">
            <Row label={t('invoice.number')} value={invoice.number ?? t('status.DRAFT')} mono />
            <Row label={t('invoice.date')} value={formatDualDate(invoice.date, locale)} />
            {invoice.dueDate && (
              <Row label={t('invoice.dueDate')} value={<DateText value={invoice.dueDate} locale={locale} />} />
            )}
            {invoice.icv !== null && <Row label="ICV" value={String(invoice.icv)} mono />}
            {invoice.originalInvoice && (
              <Row
                label={t('invoice.taxInvoice')}
                value={
                  <Link href={`/invoices/${invoice.originalInvoice.id}`} className="text-brand-700 hover:underline">
                    {invoice.originalInvoice.number}
                  </Link>
                }
              />
            )}
          </dl>

          {invoice.party ? (
            <dl className="space-y-1 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('invoice.buyer')}</p>
              <Row label="" value={locale === 'ar' ? invoice.party.nameAr : invoice.party.nameEn} />
              {invoice.party.vatNumber && <Row label={t('invoice.vatNumber')} value={invoice.party.vatNumber} mono />}
              {buyerAddress && (
                <Row
                  label={t('invoice.address')}
                  value={[buyerAddress.buildingNumber, buyerAddress.street, buyerAddress.district, buyerAddress.city]
                    .filter(Boolean)
                    .join('، ')}
                />
              )}
            </dl>
          ) : (
            <p className="text-sm text-ink-500">{t('invoice.simplifiedTaxInvoice')}</p>
          )}
        </section>

        <div className="table-wrap py-4">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>{t('invoice.description')}</th>
                <th>{t('invoice.quantity')}</th>
                <th>{t('invoice.unitPrice')}</th>
                <th>{t('invoice.discount')}</th>
                <th>{t('invoice.taxableAmount')}</th>
                <th>{t('invoice.vatRate')}</th>
                <th>{t('invoice.vatAmount')}</th>
                <th>{t('invoice.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="num text-ink-400">{line.lineNo}</td>
                  <td>
                    <span className="block">{locale === 'ar' ? line.descriptionAr ?? line.descriptionEn : line.descriptionEn}</span>
                    {locale === 'ar' && line.descriptionEn !== line.descriptionAr && (
                      <span className="block text-xs text-ink-400">{line.descriptionEn}</span>
                    )}
                  </td>
                  <td>
                    <Quantity value={line.quantity.toString()} locale={locale} />
                  </td>
                  <td>
                    <Amount value={line.unitPrice.toString()} locale={locale} />
                  </td>
                  <td>
                    <Amount value={line.discount.toString()} locale={locale} muted />
                  </td>
                  <td>
                    <Amount value={line.taxableAmount.toString()} locale={locale} />
                  </td>
                  <td className="num">{money(line.vatRate.toString()).times(100).toFixed(0)}%</td>
                  <td>
                    <Amount value={line.vatAmount.toString()} locale={locale} muted />
                  </td>
                  <td className="font-medium">
                    <Amount value={line.lineTotal.toString()} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="flex justify-end border-t border-[var(--border)] pt-4">
          <dl className="w-full max-w-sm space-y-1.5 text-sm">
            <Total label={t('invoice.subtotal')} value={invoice.taxableTotal.toString()} locale={locale} />
            {!money(invoice.discountTotal.toString()).isZero() && (
              <Total label={t('invoice.discount')} value={invoice.discountTotal.toString()} locale={locale} muted />
            )}
            <Total label={t('invoice.totalVat')} value={invoice.vatTotal.toString()} locale={locale} />
            {!money(invoice.roundingAdjustment.toString()).isZero() && (
              <Total label={t('invoice.rounding')} value={invoice.roundingAdjustment.toString()} locale={locale} muted />
            )}
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-base font-semibold">
              <dt>{t('invoice.grandTotal')}</dt>
              <dd>
                <Amount value={invoice.payableTotal.toString()} locale={locale} />
              </dd>
            </div>
            {!money(invoice.paidTotal.toString()).isZero() && (
              <>
                <Total label={t('invoice.paid')} value={invoice.paidTotal.toString()} locale={locale} muted />
                <Total label={t('invoice.outstanding')} value={outstanding.toString()} locale={locale} />
              </>
            )}
          </dl>
        </section>
      </article>

      <section className="no-print card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">{t('dashboard.zatcaStatus')}</h2>
        {invoice.submissions.length === 0 ? (
          <p className="text-sm text-ink-500">{t('app.none')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {invoice.submissions.map((submission) => (
              <li key={submission.id} className="flex flex-wrap items-center gap-3">
                <StatusBadge status={submission.status} label={submission.status} />
                <span className="text-ink-500">{submission.mode}</span>
                {submission.submittedAt && <DateText value={submission.submittedAt} locale={locale} />}
                {submission.httpStatus !== null && <span className="num text-xs text-ink-400">HTTP {submission.httpStatus}</span>}
                <span className="text-xs text-ink-400">
                  {t('zatca.retry')} <span className="num">{submission.attempt}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invoice.corrections.length > 0 && (
        <section className="no-print card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">{t('invoice.creditNote')}</h2>
          <ul className="space-y-1 text-sm">
            {invoice.corrections.map((note) => (
              <li key={note.id} className="flex items-center justify-between">
                <Link href={`/invoices/${note.id}`} className="text-brand-700 hover:underline">
                  {note.number}
                </Link>
                <Amount value={note.payableTotal.toString()} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      {label && <dt className="text-ink-500">{label}:</dt>}
      <dd className={mono ? 'num font-medium' : 'font-medium'}>{value}</dd>
    </div>
  )
}

function Total({
  label,
  value,
  locale,
  muted = false,
}: {
  label: string
  value: string
  locale: 'ar' | 'en'
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-600">{label}</dt>
      <dd>
        <Amount value={value} locale={locale} muted={muted} />
      </dd>
    </div>
  )
}

/** The Arabic document title is required on the printed invoice even in the English UI. */
function titleKeyArabic(key: string): string {
  return {
    'invoice.taxInvoice': 'فاتورة ضريبية',
    'invoice.simplifiedTaxInvoice': 'فاتورة ضريبية مبسطة',
    'invoice.creditNote': 'إشعار دائن',
    'invoice.debitNote': 'إشعار مدين',
  }[key] ?? ''
}
