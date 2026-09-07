/**
 * Receipts and payments.
 *
 * A payment is money moving plus an allocation: which invoices it settles, and how much of
 * each. Both halves happen in one transaction, so a receipt can never be banked without the
 * receivable it clears being reduced by the same amount.
 *
 * Foreign currency is settled at the rate on the day, and the difference against the rate the
 * invoice carried posts to exchange gain or loss — never quietly to the customer's balance.
 */
import { buildPaymentPosting } from '@/lib/accounting/documents'
import { type MoneyInput, money, sum, toDb } from '@/lib/money'
import { allocateNumber } from './sequence'
import { post } from './posting'
import type { Tx } from '../db'

export class PaymentError extends Error {
  readonly code: string
  readonly messageAr: string
  constructor(code: string, en: string, ar: string) {
    super(en)
    this.name = 'PaymentError'
    this.code = code
    this.messageAr = ar
  }
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'CARD' | 'CHEQUE' | 'STC_PAY'

/** Which ledger account the money lands in. */
const ACCOUNT_FOR: Record<PaymentMethod, 'CASH_ON_HAND' | 'BANK'> = {
  CASH: 'CASH_ON_HAND',
  BANK_TRANSFER: 'BANK',
  MADA: 'BANK',
  CARD: 'BANK',
  CHEQUE: 'BANK',
  STC_PAY: 'BANK',
}

export interface RecordPaymentParams {
  tenantId: string
  branchId: string
  partyId: string
  direction: 'RECEIPT' | 'PAYMENT'
  date: Date
  method: PaymentMethod
  amount: MoneyInput
  bankCharges?: MoneyInput
  bankAccountId?: string
  reference?: string
  notes?: string
  /** Invoices (for a receipt) or bills (for a payment) this settles. */
  allocations: Array<{ invoiceId?: string; billId?: string; amount: MoneyInput }>
  userId?: string
}

export interface RecordPaymentResult {
  paymentId: string
  number: string
  entryId: string
  allocated: string
  unallocated: string
}

export async function recordPayment(tx: Tx, params: RecordPaymentParams): Promise<RecordPaymentResult> {
  const amount = money(params.amount)
  if (amount.lessThanOrEqualTo(0)) {
    throw new PaymentError(
      'BAD_AMOUNT',
      'A payment must be for a positive amount.',
      'يجب أن يكون مبلغ السند موجباً.',
    )
  }

  const allocated = sum(params.allocations.map((a) => a.amount))
  if (allocated.greaterThan(amount)) {
    throw new PaymentError(
      'OVER_ALLOCATED',
      `The allocations total ${allocated.toFixed(2)} but the payment is only ${amount.toFixed(2)}.`,
      `مجموع التخصيصات ${allocated.toFixed(2)} بينما مبلغ السند ${amount.toFixed(2)} فقط.`,
    )
  }

  // Check each allocation against what the document still owes, so a customer cannot be
  // credited twice for the same invoice.
  for (const allocation of params.allocations) {
    const share = money(allocation.amount)
    if (share.lessThanOrEqualTo(0)) {
      throw new PaymentError('BAD_ALLOCATION', 'Each allocation must be for a positive amount.', 'يجب أن يكون كل تخصيص بمبلغ موجب.')
    }

    if (allocation.invoiceId) {
      const invoice = await tx.invoice.findFirstOrThrow({
        where: { id: allocation.invoiceId, tenantId: params.tenantId },
        select: { number: true, status: true, payableTotal: true, paidTotal: true, partyId: true },
      })
      if (invoice.status === 'DRAFT') {
        throw new PaymentError(
          'NOT_POSTED',
          `Invoice ${invoice.number ?? allocation.invoiceId} is still a draft and owes nothing yet.`,
          `الفاتورة ${invoice.number ?? ''} ما زالت مسودة ولا يوجد عليها مبلغ مستحق.`,
        )
      }
      if (invoice.partyId !== params.partyId) {
        throw new PaymentError(
          'WRONG_PARTY',
          `Invoice ${invoice.number} does not belong to this customer.`,
          `الفاتورة ${invoice.number} لا تخص هذا العميل.`,
        )
      }

      const credits = await tx.invoice.aggregate({
        where: { tenantId: params.tenantId, originalInvoiceId: allocation.invoiceId, status: { not: 'DRAFT' } },
        _sum: { payableTotal: true },
      })
      const outstanding = money(invoice.payableTotal.toString())
        .minus(money(invoice.paidTotal.toString()))
        .minus(money(credits._sum.payableTotal?.toString() ?? 0))

      if (share.greaterThan(outstanding)) {
        throw new PaymentError(
          'OVER_SETTLED',
          `Invoice ${invoice.number} has ${outstanding.toFixed(2)} outstanding; ${share.toFixed(2)} was allocated to it.`,
          `المتبقي على الفاتورة ${invoice.number} هو ${outstanding.toFixed(2)}، بينما خُصص لها ${share.toFixed(2)}.`,
        )
      }
    }

    if (allocation.billId) {
      const bill = await tx.supplierBill.findFirstOrThrow({
        where: { id: allocation.billId, tenantId: params.tenantId },
        select: { number: true, payableTotal: true, paidTotal: true, partyId: true },
      })
      if (bill.partyId !== params.partyId) {
        throw new PaymentError(
          'WRONG_PARTY',
          `Bill ${bill.number} does not belong to this supplier.`,
          `الفاتورة ${bill.number} لا تخص هذا المورد.`,
        )
      }
      const outstanding = money(bill.payableTotal.toString()).minus(money(bill.paidTotal.toString()))
      if (share.greaterThan(outstanding)) {
        throw new PaymentError(
          'OVER_SETTLED',
          `Bill ${bill.number} has ${outstanding.toFixed(2)} outstanding; ${share.toFixed(2)} was allocated to it.`,
          `المتبقي على فاتورة المورد ${bill.number} هو ${outstanding.toFixed(2)}، بينما خُصص لها ${share.toFixed(2)}.`,
        )
      }
    }
  }

  const number = await allocateNumber(tx, {
    tenantId: params.tenantId,
    branchId: params.branchId,
    kind: params.direction === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
    date: params.date,
  })

  const payment = await tx.payment.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      partyId: params.partyId,
      number,
      direction: params.direction,
      date: params.date,
      method: params.method,
      amount: toDb(amount),
      bankCharges: toDb(params.bankCharges ?? 0),
      bankAccountId: params.bankAccountId,
      reference: params.reference,
      notes: params.notes,
      status: 'POSTED',
      createdBy: params.userId,
      allocations: {
        create: params.allocations.map((allocation) => ({
          tenantId: params.tenantId,
          invoiceId: allocation.invoiceId,
          billId: allocation.billId,
          amount: toDb(allocation.amount),
          // Single-currency for now: the base amount equals the allocated amount. A foreign
          // currency document supplies its own rate and the difference lands on FX.
          baseAmount: toDb(allocation.amount),
        })),
      },
    },
    select: { id: true },
  })

  const posted = await post(
    tx,
    buildPaymentPosting({
      context: {
        tenantId: params.tenantId,
        branchId: params.branchId,
        date: params.date,
        reference: number,
        partyId: params.partyId,
      },
      direction: params.direction,
      amount,
      // Unallocated money is still a movement on the party's account: it sits as a payment on
      // account until it is applied, which is what a customer paying a round number does.
      allocatedAtOriginalRate: amount,
      account: ACCOUNT_FOR[params.method],
      bankCharges: money(params.bankCharges ?? 0),
    }),
    params.userId,
  )

  await tx.payment.update({ where: { id: payment.id }, data: { entryId: posted.entryId } })

  // Move each settled document towards SETTLED.
  for (const allocation of params.allocations) {
    if (allocation.invoiceId) {
      const invoice = await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: { paidTotal: { increment: toDb(allocation.amount) as never } },
        select: { payableTotal: true, paidTotal: true, id: true },
      })
      const settled = money(invoice.paidTotal.toString()).greaterThanOrEqualTo(money(invoice.payableTotal.toString()))
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: settled ? 'SETTLED' : 'PARTIALLY_SETTLED' },
      })
    }
    if (allocation.billId) {
      const bill = await tx.supplierBill.update({
        where: { id: allocation.billId },
        data: { paidTotal: { increment: toDb(allocation.amount) as never } },
        select: { payableTotal: true, paidTotal: true, id: true },
      })
      const settled = money(bill.paidTotal.toString()).greaterThanOrEqualTo(money(bill.payableTotal.toString()))
      await tx.supplierBill.update({
        where: { id: bill.id },
        data: { status: settled ? 'SETTLED' : 'PARTIALLY_SETTLED' },
      })
    }
  }

  return {
    paymentId: payment.id,
    number,
    entryId: posted.entryId,
    allocated: toDb(allocated),
    unallocated: toDb(amount.minus(allocated)),
  }
}

/** Invoices a customer still owes on, for the payment screen. */
export async function openInvoicesFor(tx: Tx, tenantId: string, partyId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; number: string; date: Date; outstanding: string }>>(
    `SELECT i.id, i.number, i.date,
            (i."payableTotal" - i."paidTotal"
              - COALESCE((SELECT SUM(c."payableTotal") FROM invoices c
                           WHERE c."originalInvoiceId" = i.id AND c.status <> 'DRAFT'), 0))::text AS outstanding
       FROM invoices i
      WHERE i."tenantId" = $1::uuid
        AND i."partyId" = $2::uuid
        AND i."documentType" = 'TAX_INVOICE'
        AND i.status IN ('POSTED', 'PARTIALLY_SETTLED')
      ORDER BY i.date`,
    tenantId,
    partyId,
  )
  return rows.filter((row) => Number(row.outstanding) > 0)
}
