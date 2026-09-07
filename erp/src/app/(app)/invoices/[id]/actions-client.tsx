'use client'

import { useState, useTransition } from 'react'
import { issueCreditNoteAction, postInvoiceAction } from '@/server/actions/invoices'

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
