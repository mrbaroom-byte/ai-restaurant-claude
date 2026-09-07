/**
 * Posting builders — one function per business event.
 *
 * Each returns a `PostingRequest` for the posting engine to validate and write. They are the
 * only place that decides *which* accounts a document touches, which keeps that decision
 * reviewable in one file rather than scattered across services.
 */
import { type Money, ZERO, money, sum, toHalala } from '../money'
import type { DocumentTotals } from '../tax/vat'
import type { PostingRequest } from './posting'

export interface DocumentContext {
  tenantId: string
  branchId: string
  date: Date
  reference: string
  partyId?: string
}

/**
 * Sales invoice.
 *
 *   Dr Accounts receivable      gross (or Cash/Bank when paid immediately)
 *     Cr Sales revenue          net of VAT
 *     Cr VAT output             VAT
 *   Dr Cost of goods sold       cost of the stock issued
 *     Cr Inventory              same
 *
 * The rounding adjustment, when the tenant rounds the payable, goes to its own account so the
 * revenue figure still ties to the VAT return.
 */
export function buildSalesInvoicePosting(params: {
  context: DocumentContext
  totals: DocumentTotals
  /** Cost of the goods issued. Zero for a service-only invoice. */
  costOfSales?: Money | string | number
  /** Cash sales debit cash or bank instead of receivables. */
  settlement?: 'RECEIVABLE' | 'CASH' | 'BANK'
  source?: 'SALES_INVOICE' | 'POS_SALE'
}): PostingRequest {
  const { context, totals } = params
  const settlementRole =
    params.settlement === 'CASH' ? 'CASH_ON_HAND' : params.settlement === 'BANK' ? 'BANK' : 'ACCOUNTS_RECEIVABLE'

  const lines: PostingRequest['lines'] = [
    {
      role: settlementRole,
      debit: totals.payableTotal,
      partyId: context.partyId,
      memoEn: 'Invoice total',
      memoAr: 'إجمالي الفاتورة',
    },
    { role: 'SALES_REVENUE', credit: totals.taxableTotal, memoEn: 'Sales', memoAr: 'مبيعات' },
  ]

  if (!totals.vatTotal.isZero()) {
    lines.push({ role: 'VAT_OUTPUT', credit: totals.vatTotal, memoEn: 'VAT on sales', memoAr: 'ضريبة القيمة المضافة على المبيعات' })
  }

  // Rounding the payable up is income; rounding it down is a cost. Either way it is its own line.
  if (!totals.roundingAdjustment.isZero()) {
    const adjustment = totals.roundingAdjustment
    lines.push(
      adjustment.greaterThan(0)
        ? { role: 'ROUNDING', credit: adjustment, memoEn: 'Rounding', memoAr: 'فروق التقريب' }
        : { role: 'ROUNDING', debit: adjustment.abs(), memoEn: 'Rounding', memoAr: 'فروق التقريب' },
    )
  }

  const cost = toHalala(params.costOfSales ?? 0)
  if (cost.greaterThan(0)) {
    lines.push({ role: 'COGS', debit: cost, memoEn: 'Cost of goods sold', memoAr: 'تكلفة البضاعة المباعة' })
    lines.push({ role: 'INVENTORY', credit: cost, memoEn: 'Stock issued', memoAr: 'صرف مخزون' })
  }

  return {
    tenantId: context.tenantId,
    branchId: context.branchId,
    date: context.date,
    source: params.source ?? 'SALES_INVOICE',
    reference: context.reference,
    memoEn: `Sales invoice ${context.reference}`,
    memoAr: `فاتورة مبيعات ${context.reference}`,
    lines,
  }
}

/**
 * Credit note — the exact mirror of the invoice it credits.
 *
 * Sales *returns* are credited to their own account rather than debited against revenue, so
 * the P&L shows gross sales and returns separately, which is what an owner wants to see.
 */
export function buildCreditNotePosting(params: {
  context: DocumentContext
  totals: DocumentTotals
  costOfSales?: Money | string | number
  settlement?: 'RECEIVABLE' | 'CASH' | 'BANK'
}): PostingRequest {
  const { context, totals } = params
  const settlementRole =
    params.settlement === 'CASH' ? 'CASH_ON_HAND' : params.settlement === 'BANK' ? 'BANK' : 'ACCOUNTS_RECEIVABLE'

  const lines: PostingRequest['lines'] = [
    { role: 'SALES_RETURNS', debit: totals.taxableTotal, memoEn: 'Sales return', memoAr: 'مردودات مبيعات' },
  ]

  if (!totals.vatTotal.isZero()) {
    lines.push({ role: 'VAT_OUTPUT', debit: totals.vatTotal, memoEn: 'VAT reversed', memoAr: 'عكس ضريبة القيمة المضافة' })
  }
  if (!totals.roundingAdjustment.isZero()) {
    const adjustment = totals.roundingAdjustment
    lines.push(
      adjustment.greaterThan(0)
        ? { role: 'ROUNDING', debit: adjustment, memoEn: 'Rounding', memoAr: 'فروق التقريب' }
        : { role: 'ROUNDING', credit: adjustment.abs(), memoEn: 'Rounding', memoAr: 'فروق التقريب' },
    )
  }

  lines.push({
    role: settlementRole,
    credit: totals.payableTotal,
    partyId: context.partyId,
    memoEn: 'Credit note total',
    memoAr: 'إجمالي الإشعار الدائن',
  })

  const cost = toHalala(params.costOfSales ?? 0)
  if (cost.greaterThan(0)) {
    lines.push({ role: 'INVENTORY', debit: cost, memoEn: 'Stock returned', memoAr: 'إرجاع مخزون' })
    lines.push({ role: 'COGS', credit: cost, memoEn: 'Cost of sales reversed', memoAr: 'عكس تكلفة المبيعات' })
  }

  return {
    tenantId: context.tenantId,
    branchId: context.branchId,
    date: context.date,
    source: 'CREDIT_NOTE',
    reference: context.reference,
    memoEn: `Credit note ${context.reference}`,
    memoAr: `إشعار دائن ${context.reference}`,
    lines,
  }
}

/**
 * Supplier bill.
 *
 *   Dr Inventory / Expense      net of recoverable VAT
 *   Dr VAT input                recoverable VAT
 *     Cr Accounts payable       gross, less withholding tax
 *     Cr Withholding tax payable
 */
export function buildSupplierBillPosting(params: {
  context: DocumentContext
  totals: DocumentTotals
  /** Split of the net amount between stock and expense. */
  inventoryAmount?: Money | string | number
  expenseRole?: 'GENERAL_EXPENSE' | 'RENT_EXPENSE' | 'UTILITIES_EXPENSE' | 'COGS'
  /** Withholding tax retained from the supplier, e.g. on a non-resident service. */
  withholdingTax?: Money | string | number
}): PostingRequest {
  const { context, totals } = params
  const inventoryAmount = toHalala(params.inventoryAmount ?? 0)
  const expenseAmount = toHalala(totals.taxableTotal.minus(inventoryAmount))
  const withholding = toHalala(params.withholdingTax ?? 0)

  if (expenseAmount.isNegative()) {
    throw new RangeError('The inventory portion of a bill cannot exceed its net total.')
  }

  const lines: PostingRequest['lines'] = []
  if (inventoryAmount.greaterThan(0)) {
    lines.push({ role: 'INVENTORY', debit: inventoryAmount, memoEn: 'Goods received', memoAr: 'بضاعة مستلمة' })
  }
  if (expenseAmount.greaterThan(0)) {
    lines.push({
      role: params.expenseRole ?? 'GENERAL_EXPENSE',
      debit: expenseAmount,
      memoEn: 'Purchases and expenses',
      memoAr: 'مشتريات ومصروفات',
    })
  }
  if (!totals.vatTotal.isZero()) {
    lines.push({ role: 'VAT_INPUT', debit: totals.vatTotal, memoEn: 'Recoverable VAT', memoAr: 'ضريبة مدخلات قابلة للخصم' })
  }
  if (withholding.greaterThan(0)) {
    lines.push({
      role: 'WITHHOLDING_TAX_PAYABLE',
      credit: withholding,
      memoEn: 'Withholding tax retained',
      memoAr: 'ضريبة استقطاع محتجزة',
    })
  }

  lines.push({
    role: 'ACCOUNTS_PAYABLE',
    credit: totals.grandTotal.minus(withholding),
    partyId: context.partyId,
    memoEn: 'Supplier bill',
    memoAr: 'فاتورة مورد',
  })

  return {
    tenantId: context.tenantId,
    branchId: context.branchId,
    date: context.date,
    source: 'SUPPLIER_BILL',
    reference: context.reference,
    memoEn: `Supplier bill ${context.reference}`,
    memoAr: `فاتورة مورد ${context.reference}`,
    lines,
  }
}

/**
 * Customer receipt or supplier payment, with optional FX difference on settlement.
 *
 *   Dr Bank/Cash              amount received
 *     Cr Accounts receivable  amount allocated, at the invoice's original rate
 *   Dr/Cr FX gain or loss     the difference
 */
export function buildPaymentPosting(params: {
  context: DocumentContext
  direction: 'RECEIPT' | 'PAYMENT'
  amount: Money | string | number
  /** Amount cleared against the invoice, in base currency at the original rate. */
  allocatedAtOriginalRate?: Money | string | number
  account: 'BANK' | 'CASH_ON_HAND'
  bankCharges?: Money | string | number
}): PostingRequest {
  const { context } = params
  const amount = toHalala(params.amount)
  const charges = toHalala(params.bankCharges ?? 0)
  const allocated = params.allocatedAtOriginalRate === undefined ? amount : toHalala(params.allocatedAtOriginalRate)
  const fxDifference = toHalala(amount.minus(allocated))

  if (amount.lessThanOrEqualTo(0)) throw new RangeError('A payment must be for a positive amount.')

  const lines: PostingRequest['lines'] = []

  if (params.direction === 'RECEIPT') {
    lines.push({ role: params.account, debit: amount.minus(charges), memoEn: 'Cash received', memoAr: 'نقدية مقبوضة' })
    if (charges.greaterThan(0)) {
      lines.push({ role: 'BANK_CHARGES', debit: charges, memoEn: 'Bank charges', memoAr: 'مصاريف بنكية' })
    }
    lines.push({
      role: 'ACCOUNTS_RECEIVABLE',
      credit: allocated,
      partyId: context.partyId,
      memoEn: 'Receivable settled',
      memoAr: 'تسوية ذمة مدينة',
    })
    // A receipt worth more base currency than the invoice carried is a gain.
    if (fxDifference.greaterThan(0)) {
      lines.push({ role: 'FX_GAIN', credit: fxDifference, memoEn: 'Exchange gain', memoAr: 'أرباح فروق العملة' })
    } else if (fxDifference.isNegative()) {
      lines.push({ role: 'FX_LOSS', debit: fxDifference.abs(), memoEn: 'Exchange loss', memoAr: 'خسائر فروق العملة' })
    }
  } else {
    lines.push({
      role: 'ACCOUNTS_PAYABLE',
      debit: allocated,
      partyId: context.partyId,
      memoEn: 'Payable settled',
      memoAr: 'تسوية ذمة دائنة',
    })
    if (charges.greaterThan(0)) {
      lines.push({ role: 'BANK_CHARGES', debit: charges, memoEn: 'Bank charges', memoAr: 'مصاريف بنكية' })
    }
    // Paying more base currency than the bill carried is a loss.
    if (fxDifference.greaterThan(0)) {
      lines.push({ role: 'FX_LOSS', debit: fxDifference, memoEn: 'Exchange loss', memoAr: 'خسائر فروق العملة' })
    } else if (fxDifference.isNegative()) {
      lines.push({ role: 'FX_GAIN', credit: fxDifference.abs(), memoEn: 'Exchange gain', memoAr: 'أرباح فروق العملة' })
    }
    lines.push({ role: params.account, credit: amount.plus(charges), memoEn: 'Cash paid', memoAr: 'نقدية مدفوعة' })
  }

  return {
    tenantId: context.tenantId,
    branchId: context.branchId,
    date: context.date,
    source: params.direction === 'RECEIPT' ? 'CUSTOMER_PAYMENT' : 'SUPPLIER_PAYMENT',
    reference: context.reference,
    memoEn: params.direction === 'RECEIPT' ? `Receipt ${context.reference}` : `Payment ${context.reference}`,
    memoAr: params.direction === 'RECEIPT' ? `سند قبض ${context.reference}` : `سند صرف ${context.reference}`,
    lines,
  }
}

/**
 * Stock adjustment — a count difference, breakage, or expiry write-off.
 * A gain debits inventory; a loss credits it. Either way the other side is the adjustment
 * account, which an owner reviews monthly.
 */
export function buildStockAdjustmentPosting(params: {
  context: DocumentContext
  /** Positive when stock is found, negative when it is missing. */
  valueChange: Money | string | number
  reasonEn?: string
  reasonAr?: string
}): PostingRequest {
  const change = toHalala(params.valueChange)
  if (change.isZero()) throw new RangeError('A stock adjustment of zero value has nothing to post.')

  const lines: PostingRequest['lines'] = change.greaterThan(0)
    ? [
        { role: 'INVENTORY', debit: change, memoEn: params.reasonEn, memoAr: params.reasonAr },
        { role: 'INVENTORY_ADJUSTMENT', credit: change, memoEn: params.reasonEn, memoAr: params.reasonAr },
      ]
    : [
        { role: 'INVENTORY_ADJUSTMENT', debit: change.abs(), memoEn: params.reasonEn, memoAr: params.reasonAr },
        { role: 'INVENTORY', credit: change.abs(), memoEn: params.reasonEn, memoAr: params.reasonAr },
      ]

  return {
    tenantId: params.context.tenantId,
    branchId: params.context.branchId,
    date: params.context.date,
    source: 'STOCK_ADJUSTMENT',
    reference: params.context.reference,
    memoEn: params.reasonEn ?? `Stock adjustment ${params.context.reference}`,
    memoAr: params.reasonAr ?? `تسوية مخزون ${params.context.reference}`,
    lines,
  }
}

/**
 * Production / assembly: components leave stock, the finished good enters it. Any difference
 * between consumed cost and the value assigned to the output is a production variance.
 */
export function buildProductionPosting(params: {
  context: DocumentContext
  componentsCost: Money | string | number
  outputValue: Money | string | number
}): PostingRequest {
  const consumed = toHalala(params.componentsCost)
  const produced = toHalala(params.outputValue)
  const variance = toHalala(produced.minus(consumed))

  const lines: PostingRequest['lines'] = [
    { role: 'INVENTORY', debit: produced, memoEn: 'Finished goods produced', memoAr: 'إنتاج تام' },
    { role: 'INVENTORY', credit: consumed, memoEn: 'Components consumed', memoAr: 'استهلاك مكونات' },
  ]

  if (variance.greaterThan(0)) {
    lines.push({ role: 'PRODUCTION_VARIANCE', credit: variance, memoEn: 'Production variance', memoAr: 'انحراف إنتاج' })
  } else if (variance.lessThan(0)) {
    lines.push({ role: 'PRODUCTION_VARIANCE', debit: variance.abs(), memoEn: 'Production variance', memoAr: 'انحراف إنتاج' })
  }

  return {
    tenantId: params.context.tenantId,
    branchId: params.context.branchId,
    date: params.context.date,
    source: 'PRODUCTION',
    reference: params.context.reference,
    memoEn: `Production ${params.context.reference}`,
    memoAr: `أمر إنتاج ${params.context.reference}`,
    lines,
  }
}

/**
 * Year-end close: sweep revenue and expense balances into retained earnings.
 * Returns null when there is nothing to close, so the caller does not post an empty entry.
 */
export function buildYearEndClosePosting(params: {
  tenantId: string
  branchId: string
  date: Date
  reference: string
  /** Net balance per account: positive = debit balance, negative = credit balance. */
  balances: Array<{ accountId: string; balance: Money | string | number }>
}): PostingRequest | null {
  const lines: PostingRequest['lines'] = []
  let net: Money = ZERO

  for (const { accountId, balance } of params.balances) {
    const amount = toHalala(balance)
    if (amount.isZero()) continue
    // Close a debit balance with a credit, and vice versa.
    lines.push(
      amount.greaterThan(0)
        ? { accountId, credit: amount, memoEn: 'Year end close', memoAr: 'إقفال نهاية السنة' }
        : { accountId, debit: amount.abs(), memoEn: 'Year end close', memoAr: 'إقفال نهاية السنة' },
    )
    net = net.plus(amount)
  }

  if (lines.length === 0) return null
  if (net.isZero()) {
    // Income exactly equalled expense. The closing lines still need to balance each other,
    // and there is no result to carry to retained earnings.
    return {
      tenantId: params.tenantId,
      branchId: params.branchId,
      date: params.date,
      source: 'PERIOD_CLOSE',
      reference: params.reference,
      memoEn: 'Year end closing entry',
      memoAr: 'قيد إقفال نهاية السنة',
      lines,
    }
  }

  // A net debit across income and expense is a loss, which reduces retained earnings.
  lines.push(
    net.greaterThan(0)
      ? { role: 'RETAINED_EARNINGS', debit: net, memoEn: 'Loss for the year', memoAr: 'خسارة العام' }
      : { role: 'RETAINED_EARNINGS', credit: net.abs(), memoEn: 'Profit for the year', memoAr: 'أرباح العام' },
  )

  return {
    tenantId: params.tenantId,
    branchId: params.branchId,
    date: params.date,
    source: 'PERIOD_CLOSE',
    reference: params.reference,
    memoEn: 'Year end closing entry',
    memoAr: 'قيد إقفال نهاية السنة',
    lines,
  }
}

/**
 * POS session close: the cash counted against the cash the till says it took.
 * A shortage is an expense; an overage is other income. Neither is quietly absorbed.
 */
export function buildCashVariancePosting(params: {
  context: DocumentContext
  expected: Money | string | number
  counted: Money | string | number
}): PostingRequest | null {
  const variance = toHalala(money(params.counted).minus(money(params.expected)))
  if (variance.isZero()) return null

  const lines: PostingRequest['lines'] = variance.greaterThan(0)
    ? [
        { role: 'CASH_ON_HAND', debit: variance, memoEn: 'Cash over', memoAr: 'زيادة في الصندوق' },
        { role: 'OTHER_INCOME', credit: variance, memoEn: 'Cash over', memoAr: 'زيادة في الصندوق' },
      ]
    : [
        { role: 'GENERAL_EXPENSE', debit: variance.abs(), memoEn: 'Cash short', memoAr: 'عجز في الصندوق' },
        { role: 'CASH_ON_HAND', credit: variance.abs(), memoEn: 'Cash short', memoAr: 'عجز في الصندوق' },
      ]

  return {
    tenantId: params.context.tenantId,
    branchId: params.context.branchId,
    date: params.context.date,
    source: 'POS_SESSION',
    reference: params.context.reference,
    memoEn: `Till variance ${params.context.reference}`,
    memoAr: `فرق الصندوق ${params.context.reference}`,
    lines,
  }
}

/** Aging buckets for receivables and payables. */
export interface AgingInput {
  partyId: string
  partyName: string
  documentNumber: string
  dueDate: Date
  outstanding: Money | string | number
}

export interface AgingRow {
  partyId: string
  partyName: string
  current: Money
  days1to30: Money
  days31to60: Money
  days61to90: Money
  over90: Money
  total: Money
}

export function buildAging(rows: AgingInput[], asOf: Date): AgingRow[] {
  const byParty = new Map<string, AgingRow>()

  for (const row of rows) {
    const amount = toHalala(row.outstanding)
    if (amount.isZero()) continue

    const existing = byParty.get(row.partyId) ?? {
      partyId: row.partyId,
      partyName: row.partyName,
      current: ZERO, days1to30: ZERO, days31to60: ZERO, days61to90: ZERO, over90: ZERO, total: ZERO,
    }

    const daysOverdue = Math.floor((asOf.getTime() - row.dueDate.getTime()) / 86_400_000)
    if (daysOverdue <= 0) existing.current = existing.current.plus(amount)
    else if (daysOverdue <= 30) existing.days1to30 = existing.days1to30.plus(amount)
    else if (daysOverdue <= 60) existing.days31to60 = existing.days31to60.plus(amount)
    else if (daysOverdue <= 90) existing.days61to90 = existing.days61to90.plus(amount)
    else existing.over90 = existing.over90.plus(amount)

    existing.total = existing.total.plus(amount)
    byParty.set(row.partyId, existing)
  }

  return [...byParty.values()].sort((a, b) => b.total.comparedTo(a.total))
}

/** Total of an aging report, for the dashboard tile. */
export function agingTotal(rows: AgingRow[]): Money {
  return toHalala(sum(rows.map((r) => r.total)))
}
