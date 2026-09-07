'use client'

import { useActionState, useState, useTransition } from 'react'
import { issueCreditNoteAction, postInvoiceAction } from '@/server/actions/invoices'
import { recordReceiptAction, type PaymentState } from '@/server/actions/payments'

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn-secondary" onClick={() => window.print()}>
      {label}
    </button>
  )
}

export function PostInvoiceButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await postInvoiceAction(invoiceId)
            setError(result?.error ?? null)
          })
        }
      >
        {label}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  )
}

export function CreditNoteButton({
  invoiceId,
  label,
  reasonLabel,
  cancelLabel,
}: {
  invoiceId: string
  label: string
  reasonLabel: string
  cancelLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-white p-3">
      <div className="min-w-[16rem] flex-1">
        <label htmlFor="creditReason" className="mb-1 block text-xs font-medium text-ink-600">
          {reasonLabel}
        </label>
        <input
          id="creditReason"
          className="field"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          autoFocus
        />
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending || reason.trim().length === 0}
        onClick={() =>
          start(async () => {
            const result = await issueCreditNoteAction(invoiceId, reason)
            if (result?.error) setError(result.error)
            else setOpen(false)
          })
        }
      >
        {label}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
        {cancelLabel}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}

const METHODS = [
  { value: 'CASH', ar: 'نقداً', en: 'Cash' },
  { value: 'BANK_TRANSFER', ar: 'حوالة بنكية', en: 'Bank transfer' },
  { value: 'MADA', ar: 'مدى', en: 'Mada' },
  { value: 'CARD', ar: 'بطاقة', en: 'Card' },
  { value: 'CHEQUE', ar: 'شيك', en: 'Cheque' },
  { value: 'STC_PAY', ar: 'STC Pay', en: 'STC Pay' },
] as const

/**
 * Recording money against an invoice.
 *
 * The outstanding amount is pre-filled because that is what is usually paid; a part payment is
 * a matter of typing over it.
 */
export function RecordPaymentButton({
  invoiceId,
  branchId,
  partyId,
  outstanding,
  locale,
  labels,
}: {
  invoiceId: string
  branchId: string
  partyId: string
  outstanding: string
  locale: 'ar' | 'en'
  labels: { record: string; amount: string; method: string; cancel: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<PaymentState, FormData>(recordReceiptAction, {})

  if (state.recorded && open) setOpen(false)

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        {labels.record}
      </button>
    )
  }

  return (
    <form action={action} className="flex w-full flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-white p-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="partyId" value={partyId} />

      <div>
        <label htmlFor="paymentAmount" className="mb-1 block text-xs font-medium text-ink-600">
          {labels.amount}
        </label>
        <input
          id="paymentAmount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={outstanding}
          className="field w-36"
          dir="ltr"
          autoFocus
          required
        />
      </div>

      <div>
        <label htmlFor="paymentMethod" className="mb-1 block text-xs font-medium text-ink-600">
          {labels.method}
        </label>
        <select id="paymentMethod" name="method" className="field" defaultValue="BANK_TRANSFER">
          {METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {locale === 'ar' ? method.ar : method.en}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {labels.record}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
        {labels.cancel}
      </button>

      {state.error && (
        <p role="alert" className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  )
}
