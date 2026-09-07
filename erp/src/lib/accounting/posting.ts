/**
 * The posting engine.
 *
 * Every business event in the system — a sale, a receipt, a stock adjustment, a payroll run —
 * is expressed as a `PostingRequest` and handed to `buildJournalEntry`. Nothing else is allowed
 * to construct journal lines. That is what makes the ledger trustworthy: there is exactly one
 * place where money enters the books, and it refuses anything that does not balance.
 *
 * This module is pure. It performs no I/O and knows nothing about Prisma, so the whole of the
 * accounting core can be unit-tested with no database.
 */
import { Decimal, type Money, ZERO, money, sum, toStorage } from '../money'
import type { AccountRole, AccountType } from './accounts'
import { NORMAL_BALANCE } from './accounts'

export type JournalSource =
  | 'MANUAL'
  | 'SALES_INVOICE'
  | 'CREDIT_NOTE'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_BILL'
  | 'DEBIT_NOTE'
  | 'SUPPLIER_PAYMENT'
  | 'EXPENSE'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_TRANSFER'
  | 'PRODUCTION'
  | 'GOODS_RECEIPT'
  | 'LANDED_COST'
  | 'PAYROLL'
  | 'POS_SALE'
  | 'POS_SESSION'
  | 'FX_REVALUATION'
  | 'PERIOD_CLOSE'
  | 'OPENING_BALANCE'
  | 'BANK_CHARGE'

export interface PostingLine {
  /** Account is addressed either by role (resolved per tenant) or by explicit account id. */
  accountId?: string
  role?: AccountRole
  /** Exactly one of debit/credit is non-zero. A line with both is a bug, not a shortcut. */
  debit?: Money | string | number
  credit?: Money | string | number
  /** Cost centre. Defaults to the entry's branch. */
  branchId?: string
  partyId?: string
  itemId?: string
  employeeId?: string
  memoEn?: string
  memoAr?: string
  /** Original-currency amount, when the entry is in a foreign currency. */
  currencyAmount?: Money | string | number
}

export interface PostingRequest {
  tenantId: string
  branchId: string
  date: Date
  source: JournalSource
  /** Id of the document that caused this posting, for drill-down and reversal. */
  sourceId?: string
  /** Human reference shown in the GL, e.g. the invoice number. */
  reference?: string
  memoEn?: string
  memoAr?: string
  currencyCode?: string
  /** Units of base currency per one unit of `currencyCode`. 1 for SAR. */
  exchangeRate?: Money | string | number
  lines: PostingLine[]
}

export interface BuiltJournalLine {
  accountId?: string
  role?: AccountRole
  debit: Money
  credit: Money
  branchId: string
  partyId?: string
  itemId?: string
  employeeId?: string
  memoEn?: string
  memoAr?: string
  currencyAmount?: Money
  lineNo: number
}

export interface BuiltJournalEntry {
  tenantId: string
  branchId: string
  date: Date
  source: JournalSource
  sourceId?: string
  reference?: string
  memoEn?: string
  memoAr?: string
  currencyCode: string
  exchangeRate: Money
  lines: BuiltJournalLine[]
  totalDebit: Money
  totalCredit: Money
}

export class PostingError extends Error {
  readonly code: string
  /** Arabic message, so the UI can show the user's language without a lookup table. */
  readonly messageAr: string

  constructor(code: string, messageEn: string, messageAr: string) {
    super(messageEn)
    this.name = 'PostingError'
    this.code = code
    this.messageAr = messageAr
  }
}

export interface FiscalPeriodView {
  startsOn: Date
  endsOn: Date
  status: 'OPEN' | 'CLOSED' | 'LOCKED'
}

/**
 * Validate and normalise a posting request into a balanced journal entry.
 *
 * Throws `PostingError` — never returns a half-valid entry — because a caller that ignores a
 * warning here would silently corrupt the ledger.
 */
export function buildJournalEntry(request: PostingRequest): BuiltJournalEntry {
  if (!request.tenantId) {
    throw new PostingError('NO_TENANT', 'Posting requires a tenant.', 'القيد يتطلب تحديد المنشأة.')
  }
  if (!request.branchId) {
    throw new PostingError('NO_BRANCH', 'Posting requires a branch or cost centre.', 'القيد يتطلب تحديد الفرع أو مركز التكلفة.')
  }
  if (!(request.date instanceof Date) || Number.isNaN(request.date.getTime())) {
    throw new PostingError('BAD_DATE', 'Posting requires a valid date.', 'القيد يتطلب تاريخاً صحيحاً.')
  }
  if (!request.lines || request.lines.length < 2) {
    throw new PostingError(
      'TOO_FEW_LINES',
      'A journal entry needs at least two lines (one debit and one credit).',
      'القيد المحاسبي يحتاج إلى سطرين على الأقل (مدين ودائن).',
    )
  }

  const rate = request.exchangeRate === undefined ? new Decimal(1) : money(request.exchangeRate)
  if (rate.lessThanOrEqualTo(0)) {
    throw new PostingError('BAD_RATE', 'Exchange rate must be greater than zero.', 'سعر الصرف يجب أن يكون أكبر من صفر.')
  }

  const lines: BuiltJournalLine[] = request.lines.map((line, index) => {
    const debit = toStorage(line.debit ?? 0)
    const credit = toStorage(line.credit ?? 0)

    if (!line.accountId && !line.role) {
      throw new PostingError(
        'NO_ACCOUNT',
        `Line ${index + 1} has no account.`,
        `السطر ${index + 1} بدون حساب.`,
      )
    }
    if (debit.isNegative() || credit.isNegative()) {
      throw new PostingError(
        'NEGATIVE_AMOUNT',
        `Line ${index + 1} has a negative amount. Post to the other side instead of using a minus sign.`,
        `السطر ${index + 1} يحتوي على مبلغ سالب. استخدم الطرف المقابل بدلاً من الإشارة السالبة.`,
      )
    }
    if (!debit.isZero() && !credit.isZero()) {
      throw new PostingError(
        'BOTH_SIDES',
        `Line ${index + 1} is both a debit and a credit.`,
        `السطر ${index + 1} مدين ودائن في آن واحد.`,
      )
    }
    if (debit.isZero() && credit.isZero()) {
      throw new PostingError(
        'ZERO_LINE',
        `Line ${index + 1} has no amount.`,
        `السطر ${index + 1} بدون مبلغ.`,
      )
    }

    return {
      accountId: line.accountId,
      role: line.role,
      debit,
      credit,
      branchId: line.branchId ?? request.branchId,
      partyId: line.partyId,
      itemId: line.itemId,
      employeeId: line.employeeId,
      memoEn: line.memoEn,
      memoAr: line.memoAr,
      currencyAmount: line.currencyAmount === undefined ? undefined : toStorage(line.currencyAmount),
      lineNo: index + 1,
    }
  })

  const totalDebit = toStorage(sum(lines.map((l) => l.debit)))
  const totalCredit = toStorage(sum(lines.map((l) => l.credit)))

  if (!totalDebit.equals(totalCredit)) {
    const diff = totalDebit.minus(totalCredit)
    throw new PostingError(
      'UNBALANCED',
      `Entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)} (difference ${diff.toFixed(2)}).`,
      `القيد غير متوازن: مدين ${totalDebit.toFixed(2)} مقابل دائن ${totalCredit.toFixed(2)} (الفرق ${diff.toFixed(2)}).`,
    )
  }
  if (totalDebit.isZero()) {
    throw new PostingError('EMPTY_ENTRY', 'Entry totals zero on both sides.', 'إجمالي القيد صفر على الطرفين.')
  }

  return {
    tenantId: request.tenantId,
    branchId: request.branchId,
    date: request.date,
    source: request.source,
    sourceId: request.sourceId,
    reference: request.reference,
    memoEn: request.memoEn,
    memoAr: request.memoAr,
    currencyCode: request.currencyCode ?? 'SAR',
    exchangeRate: rate,
    lines,
    totalDebit,
    totalCredit,
  }
}

/**
 * Reject a posting whose date falls in a period that is not open.
 *
 * `CLOSED` means month-end has been run; `LOCKED` means the year is filed. Neither accepts a
 * posting, and the message tells the user exactly which period is in the way.
 */
export function assertPeriodOpen(date: Date, periods: FiscalPeriodView[]): void {
  const period = periods.find((p) => date >= p.startsOn && date <= p.endsOn)
  if (!period) {
    throw new PostingError(
      'NO_PERIOD',
      `No fiscal period covers ${date.toISOString().slice(0, 10)}. Create the period before posting.`,
      `لا توجد فترة مالية تغطي تاريخ ${date.toISOString().slice(0, 10)}. أنشئ الفترة قبل الترحيل.`,
    )
  }
  if (period.status !== 'OPEN') {
    const from = period.startsOn.toISOString().slice(0, 10)
    const to = period.endsOn.toISOString().slice(0, 10)
    throw new PostingError(
      'PERIOD_CLOSED',
      `The period ${from} to ${to} is ${period.status.toLowerCase()}. Reopen it or post to an open period.`,
      `الفترة من ${from} إلى ${to} ${period.status === 'CLOSED' ? 'مقفلة' : 'مغلقة نهائياً'}. أعد فتحها أو رحّل إلى فترة مفتوحة.`,
    )
  }
}

/** Build the exact opposite of a posted entry. Used for reversals and cancellations. */
export function reverseEntry(
  entry: BuiltJournalEntry,
  options: { date?: Date; memoEn?: string; memoAr?: string } = {},
): BuiltJournalEntry {
  const reversed = buildJournalEntry({
    tenantId: entry.tenantId,
    branchId: entry.branchId,
    date: options.date ?? entry.date,
    source: entry.source,
    sourceId: entry.sourceId,
    reference: entry.reference ? `REV-${entry.reference}` : undefined,
    memoEn: options.memoEn ?? `Reversal of ${entry.reference ?? entry.source}`,
    memoAr: options.memoAr ?? `عكس قيد ${entry.reference ?? entry.source}`,
    currencyCode: entry.currencyCode,
    exchangeRate: entry.exchangeRate,
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      role: line.role,
      debit: line.credit,
      credit: line.debit,
      branchId: line.branchId,
      partyId: line.partyId,
      itemId: line.itemId,
      employeeId: line.employeeId,
      memoEn: line.memoEn,
      memoAr: line.memoAr,
      currencyAmount: line.currencyAmount,
    })),
  })
  return reversed
}

export interface TrialBalanceRow {
  accountId: string
  accountCode: string
  accountNameEn: string
  accountNameAr: string
  accountType: AccountType
  debit: Money
  credit: Money
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebit: Money
  totalCredit: Money
  balanced: boolean
}

/** Net a set of rows into a trial balance, one net figure per account. */
export function buildTrialBalance(rows: TrialBalanceRow[]): TrialBalance {
  const byAccount = new Map<string, TrialBalanceRow>()

  for (const row of rows) {
    const existing = byAccount.get(row.accountId)
    if (existing) {
      existing.debit = existing.debit.plus(row.debit)
      existing.credit = existing.credit.plus(row.credit)
    } else {
      byAccount.set(row.accountId, { ...row, debit: money(row.debit), credit: money(row.credit) })
    }
  }

  // Present each account on its net side only — a trial balance with both columns filled for
  // the same account is what confuses owners into thinking the books are wrong.
  const netted = [...byAccount.values()].map((row) => {
    const net = row.debit.minus(row.credit)
    return {
      ...row,
      debit: net.greaterThan(0) ? toStorage(net) : ZERO,
      credit: net.isNegative() ? toStorage(net.abs()) : ZERO,
    }
  })

  netted.sort((a, b) => a.accountCode.localeCompare(b.accountCode))
  const totalDebit = toStorage(sum(netted.map((r) => r.debit)))
  const totalCredit = toStorage(sum(netted.map((r) => r.credit)))

  return { rows: netted, totalDebit, totalCredit, balanced: totalDebit.equals(totalCredit) }
}

/** Signed balance in the account's natural direction; used by P&L and balance sheet. */
export function naturalBalance(type: AccountType, debit: Money, credit: Money): Money {
  return NORMAL_BALANCE[type] === 'DEBIT' ? debit.minus(credit) : credit.minus(debit)
}
