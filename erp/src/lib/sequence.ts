/**
 * Document numbering.
 *
 * Tax invoice numbers must be gap-free: ZATCA reads a missing number as a deleted invoice.
 * The allocator therefore hands out numbers under a row lock inside the same transaction that
 * writes the document, and a document that fails validation is never allocated a number at all.
 *
 * This module holds the pure formatting and the next-value rule; the row lock lives in
 * `src/server/services/sequence.ts`, which is the only caller.
 */

export type DocumentKind =
  | 'QUOTATION' | 'SALES_ORDER' | 'DELIVERY_NOTE' | 'INVOICE' | 'SIMPLIFIED_INVOICE'
  | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'RECEIPT' | 'PAYMENT'
  | 'PURCHASE_ORDER' | 'GOODS_RECEIPT' | 'SUPPLIER_BILL' | 'EXPENSE'
  | 'STOCK_TRANSFER' | 'STOCK_ADJUSTMENT' | 'STOCK_COUNT' | 'PRODUCTION_ORDER'
  | 'JOURNAL_ENTRY' | 'PAYROLL_RUN' | 'POS_SESSION'

export interface SequenceDefinition {
  kind: DocumentKind
  /** Short code that appears in the number, e.g. INV, PO, CRN. */
  prefix: string
  /** Branch code segment, e.g. JED. Omitted when the sequence is tenant-wide. */
  branchCode?: string
  /** Reset the counter each year. Standard for tax documents. */
  resetYearly: boolean
  padding: number
  /** Last number issued. The next document gets `lastNumber + 1`. */
  lastNumber: number
  /** Year the counter belongs to, for the yearly reset. */
  year: number
  /**
   * Gap-free sequences refuse to skip. Non-tax documents (quotations, stock counts) may be
   * allowed to skip on failure, which lets them be allocated outside the transaction.
   */
  gapFree: boolean
}

export const DEFAULT_SEQUENCES: Array<Pick<SequenceDefinition, 'kind' | 'prefix' | 'resetYearly' | 'padding' | 'gapFree'>> = [
  { kind: 'QUOTATION', prefix: 'QT', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'SALES_ORDER', prefix: 'SO', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'DELIVERY_NOTE', prefix: 'DN', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'INVOICE', prefix: 'INV', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'SIMPLIFIED_INVOICE', prefix: 'SNV', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'CREDIT_NOTE', prefix: 'CRN', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'DEBIT_NOTE', prefix: 'DBN', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'RECEIPT', prefix: 'RCT', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'PAYMENT', prefix: 'PMT', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'PURCHASE_ORDER', prefix: 'PO', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'GOODS_RECEIPT', prefix: 'GRN', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'SUPPLIER_BILL', prefix: 'BILL', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'EXPENSE', prefix: 'EXP', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'STOCK_TRANSFER', prefix: 'TRF', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'STOCK_ADJUSTMENT', prefix: 'ADJ', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'STOCK_COUNT', prefix: 'CNT', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'PRODUCTION_ORDER', prefix: 'PRD', resetYearly: true, padding: 6, gapFree: false },
  { kind: 'JOURNAL_ENTRY', prefix: 'JV', resetYearly: true, padding: 6, gapFree: true },
  { kind: 'PAYROLL_RUN', prefix: 'PAY', resetYearly: true, padding: 3, gapFree: false },
  { kind: 'POS_SESSION', prefix: 'POS', resetYearly: true, padding: 6, gapFree: false },
]

/** `INV-JED-2026-000123`, or `INV-2026-000123` for a tenant-wide sequence. */
export function formatNumber(definition: SequenceDefinition, value: number): string {
  const parts = [definition.prefix]
  if (definition.branchCode) parts.push(definition.branchCode)
  if (definition.resetYearly) parts.push(String(definition.year))
  parts.push(String(value).padStart(definition.padding, '0'))
  return parts.join('-')
}

export interface Allocation {
  number: string
  value: number
  /** The definition as it should be written back. */
  next: SequenceDefinition
}

/**
 * Compute the next number.
 *
 * The yearly reset happens here rather than on a schedule, so the first document of January
 * starts the new series whether or not anybody remembered to run a year-end job.
 */
export function allocate(definition: SequenceDefinition, on: Date): Allocation {
  const year = on.getUTCFullYear()
  const rolledOver = definition.resetYearly && year !== definition.year

  const next: SequenceDefinition = rolledOver
    ? { ...definition, year, lastNumber: 1 }
    : { ...definition, lastNumber: definition.lastNumber + 1 }

  return { number: formatNumber(next, next.lastNumber), value: next.lastNumber, next }
}

export class SequenceError extends Error {
  readonly messageAr: string
  constructor(en: string, ar: string) {
    super(en)
    this.name = 'SequenceError'
    this.messageAr = ar
  }
}

/**
 * Prove a set of issued numbers has no gaps.
 *
 * Run before a VAT return is filed and before a ZATCA compliance check, because a gap found
 * then is a conversation with an auditor, not a bug report.
 */
export function assertNoGaps(kind: DocumentKind, issued: number[]): void {
  if (issued.length === 0) return
  const sorted = [...issued].sort((a, b) => a - b)

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]) {
      throw new SequenceError(
        `${kind} number ${sorted[i]} was issued twice.`,
        `تم إصدار الرقم ${sorted[i]} لنوع ${kind} مرتين.`,
      )
    }
    if (sorted[i] !== sorted[i - 1] + 1) {
      throw new SequenceError(
        `${kind} numbering has a gap between ${sorted[i - 1]} and ${sorted[i]}.`,
        `يوجد انقطاع في ترقيم ${kind} بين ${sorted[i - 1]} و ${sorted[i]}.`,
      )
    }
  }
}
