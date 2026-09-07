'use server'

import { revalidatePath } from 'next/cache'
import { withTenant } from '../db'
import { requirePermission, currentLocale } from '../session'
import { PaymentError, recordPayment } from '../services/payment'
import { PostingError } from '@/lib/accounting/posting'
import { recordAudit } from '../services/audit'

export interface PaymentState {
  error?: string
  recorded?: string
}

export async function recordReceiptAction(_previous: PaymentState, formData: FormData): Promise<PaymentState> {
  const principal = await requirePermission('sales.payment')
  const locale = await currentLocale()

  const invoiceId = String(formData.get('invoiceId'))
  const branchId = String(formData.get('branchId'))
  const partyId = String(formData.get('partyId'))
  const amount = String(formData.get('amount') ?? '')
  const method = String(formData.get('method') ?? 'CASH') as 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'CARD' | 'CHEQUE' | 'STC_PAY'

  if (!amount || Number(amount) <= 0) {
    return {
      error: locale === 'ar' ? 'أدخل مبلغاً أكبر من صفر.' : 'Enter an amount greater than zero.',
    }
  }

  try {
    const result = await withTenant(principal.tenantId, (tx) =>
      recordPayment(tx, {
        tenantId: principal.tenantId,
        branchId,
        partyId,
        direction: 'RECEIPT',
        date: new Date(),
        method,
        amount,
        allocations: [{ invoiceId, amount }],
        userId: principal.userId,
      }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payments',
      entityId: result.paymentId,
      action: 'RECEIPT',
      after: { number: result.number, amount, invoiceId },
    })

    revalidatePath(`/invoices/${invoiceId}`)
    return { recorded: result.number }
  } catch (error) {
    if (error instanceof PaymentError) return { error: locale === 'ar' ? error.messageAr : error.message }
    if (error instanceof PostingError) return { error: locale === 'ar' ? error.messageAr : error.message }
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
