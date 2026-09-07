'use server'

import { revalidatePath } from 'next/cache'
import { withTenant } from '../db'
import { requirePermission, currentLocale } from '../session'
import { createCreditNote, postInvoice, InvoiceError } from '../services/invoice'
import { PostingError } from '@/lib/accounting/posting'
import { StockError } from '@/lib/inventory/valuation'
import { ZatcaValidationError } from '@/lib/zatca'
import { recordAudit } from '../services/audit'

export interface ActionResult {
  error?: string
}

/**
 * Turn a domain error into the message the user should see, in their language.
 *
 * Every error type this can meet carries its own explanation of what is wrong and what to do,
 * so nothing here has to fall back on "something went wrong".
 */
async function toMessage(error: unknown): Promise<string> {
  const locale = await currentLocale()
  const arabic = locale === 'ar'

  if (error instanceof PostingError) return arabic ? error.messageAr : error.message
  if (error instanceof StockError) return arabic ? error.messageAr : error.message
  if (error instanceof InvoiceError) return arabic ? error.messageAr : error.message
  if (error instanceof ZatcaValidationError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export async function postInvoiceAction(invoiceId: string): Promise<ActionResult | void> {
  const principal = await requirePermission('sales.post')

  try {
    const result = await withTenant(principal.tenantId, (tx) =>
      postInvoice(tx, { tenantId: principal.tenantId, invoiceId, userId: principal.userId }),
    )
    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'invoices',
      entityId: invoiceId,
      action: 'POST',
      after: { number: result.number, icv: result.icv },
    })
  } catch (error) {
    return { error: await toMessage(error) }
  }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/invoices')
}

export async function issueCreditNoteAction(invoiceId: string, reason: string): Promise<ActionResult | void> {
  const principal = await requirePermission('sales.credit')

  let creditNoteId: string
  try {
    const result = await withTenant(principal.tenantId, (tx) =>
      createCreditNote(tx, {
        tenantId: principal.tenantId,
        invoiceId,
        date: new Date(),
        reason,
        userId: principal.userId,
      }),
    )
    creditNoteId = result.creditNoteId
    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'invoices',
      entityId: creditNoteId,
      action: 'CREDIT_NOTE',
      after: { number: result.number, against: invoiceId, reason },
    })
  } catch (error) {
    return { error: await toMessage(error) }
  }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/invoices')
}
