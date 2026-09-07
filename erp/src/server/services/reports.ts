/**
 * Reporting.
 *
 * Every figure here is read from `journal_lines`, never recomputed from documents. That is what
 * makes the P&L agree with the trial balance and the VAT return agree with the ledger: there is
 * one set of numbers, and the reports are different views of it.
 */
import { NORMAL_BALANCE, type AccountType } from '@/lib/accounting/accounts'
import { buildTrialBalance, type TrialBalance } from '@/lib/accounting/posting'
import { buildAging, type AgingRow } from '@/lib/accounting/documents'
import { buildVatReturn, type VatCategory, type VatReturn } from '@/lib/tax/vat'
import { money, toDb, type Money } from '@/lib/money'
import type { Tx } from '../db'

export interface ReportFilter {
  tenantId: string
  from?: Date
  to?: Date
  branchId?: string
}

interface LedgerRow {
  accountId: string
  code: string
  nameEn: string
  nameAr: string
  type: AccountType
  debit: string
  credit: string
}

async function ledgerRows(tx: Tx, filter: ReportFilter): Promise<LedgerRow[]> {
  return tx.$queryRawUnsafe<LedgerRow[]>(
    `SELECT a.id       AS "accountId",
            a.code     AS code,
            a."nameEn" AS "nameEn",
            a."nameAr" AS "nameAr",
            a.type     AS type,
            COALESCE(SUM(l.debit), 0)::text  AS debit,
            COALESCE(SUM(l.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines l ON l."accountId" = a.id
       JOIN journal_entries e ON e.id = l."entryId"
      WHERE a."tenantId" = $1::uuid
        AND e.status = 'POSTED'
        AND ($2::date IS NULL OR e.date >= $2::date)
        AND ($3::date IS NULL OR e.date <= $3::date)
        AND ($4::uuid IS NULL OR l."branchId" = $4::uuid)
      GROUP BY a.id
      ORDER BY a.code`,
    filter.tenantId,
    filter.from ?? null,
    filter.to ?? null,
    filter.branchId ?? null,
  )
}

export async function trialBalance(tx: Tx, filter: ReportFilter): Promise<TrialBalance> {
  const rows = await ledgerRows(tx, filter)
  return buildTrialBalance(
    rows.map((r) => ({
      accountId: r.accountId,
      accountCode: r.code,
      accountNameEn: r.nameEn,
      accountNameAr: r.nameAr,
      accountType: r.type,
      debit: money(r.debit),
      credit: money(r.credit),
    })),
  )
}

export interface StatementLine {
  accountId: string
  code: string
  nameEn: string
  nameAr: string
  amount: Money
  /** Same figure for the comparative period, when one was requested. */
  comparative?: Money
}

export interface ProfitAndLoss {
  revenue: StatementLine[]
  costOfSales: StatementLine[]
  operatingExpenses: StatementLine[]
  otherIncome: StatementLine[]
  totalRevenue: Money
  totalCostOfSales: Money
  grossProfit: Money
  totalOperatingExpenses: Money
  operatingProfit: Money
  totalOtherIncome: Money
  netProfit: Money
}

/** Signed amount in the account's natural direction. */
function natural(row: LedgerRow): Money {
  const debit = money(row.debit)
  const credit = money(row.credit)
  return NORMAL_BALANCE[row.type] === 'DEBIT' ? debit.minus(credit) : credit.minus(debit)
}

function line(row: LedgerRow): StatementLine {
  return { accountId: row.accountId, code: row.code, nameEn: row.nameEn, nameAr: row.nameAr, amount: natural(row) }
}

function total(lines: StatementLine[]): Money {
  return lines.reduce((acc, l) => acc.plus(l.amount), money(0))
}

export async function profitAndLoss(tx: Tx, filter: ReportFilter, comparativeFilter?: ReportFilter): Promise<ProfitAndLoss> {
  const rows = (await ledgerRows(tx, filter)).filter((r) => r.type === 'REVENUE' || r.type === 'EXPENSE')

  const comparative = comparativeFilter
    ? new Map((await ledgerRows(tx, comparativeFilter)).map((r) => [r.accountId, natural(r)]))
    : null

  const withComparative = (statementLine: StatementLine): StatementLine =>
    comparative ? { ...statementLine, comparative: comparative.get(statementLine.accountId) ?? money(0) } : statementLine

  // Grouped by the chart's own numbering, which is what makes a custom account land in the
  // right section without a separate mapping table.
  const revenue = rows.filter((r) => r.code.startsWith('4')).map(line).map(withComparative)
  const costOfSales = rows.filter((r) => r.code.startsWith('5')).map(line).map(withComparative)
  const operatingExpenses = rows.filter((r) => r.code.startsWith('6') || r.code.startsWith('9')).map(line).map(withComparative)
  const otherIncome = rows.filter((r) => r.code.startsWith('7')).map(line).map(withComparative)

  const totalRevenue = total(revenue)
  const totalCostOfSales = total(costOfSales)
  const grossProfit = totalRevenue.minus(totalCostOfSales)
  const totalOperatingExpenses = total(operatingExpenses)
  const operatingProfit = grossProfit.minus(totalOperatingExpenses)
  // 7xxx mixes income and expense; naturalBalance already gives each the right sign.
  const totalOtherIncome = total(otherIncome)

  return {
    revenue,
    costOfSales,
    operatingExpenses,
    otherIncome,
    totalRevenue,
    totalCostOfSales,
    grossProfit,
    totalOperatingExpenses,
    operatingProfit,
    totalOtherIncome,
    netProfit: operatingProfit.plus(totalOtherIncome),
  }
}

export interface BalanceSheet {
  assets: StatementLine[]
  liabilities: StatementLine[]
  equity: StatementLine[]
  totalAssets: Money
  totalLiabilities: Money
  totalEquity: Money
  /** Profit for the period, carried into equity so the sheet balances before year end. */
  resultForPeriod: Money
  balanced: boolean
}

export async function balanceSheet(tx: Tx, filter: ReportFilter): Promise<BalanceSheet> {
  // A balance sheet is cumulative: everything up to the date, not just the period.
  const cumulative = { ...filter, from: undefined }
  const rows = await ledgerRows(tx, cumulative)

  const assets = rows.filter((r) => r.type === 'ASSET').map(line)
  const liabilities = rows.filter((r) => r.type === 'LIABILITY').map(line)
  const equity = rows.filter((r) => r.type === 'EQUITY').map(line)

  // Revenue and expense have not been closed out yet, so the result to date is equity.
  const pl = await profitAndLoss(tx, cumulative)

  const totalAssets = total(assets)
  const totalLiabilities = total(liabilities)
  const totalEquity = total(equity).plus(pl.netProfit)

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    resultForPeriod: pl.netProfit,
    balanced: totalAssets.toDecimalPlaces(2).equals(totalLiabilities.plus(totalEquity).toDecimalPlaces(2)),
  }
}

export interface CashFlowSummary {
  opening: Money
  receipts: Money
  payments: Money
  closing: Money
  movements: Array<{ date: Date; reference: string | null; memo: string | null; amount: Money }>
}

/**
 * Cash flow, direct method over the cash and bank accounts.
 *
 * A small business wants to know what came in and what went out, not an indirect
 * reconciliation from profit — see DECISIONS.md D-041.
 */
export async function cashFlow(tx: Tx, filter: ReportFilter): Promise<CashFlowSummary> {
  const cashAccounts = await tx.account.findMany({
    where: { tenantId: filter.tenantId, role: { in: ['CASH_ON_HAND', 'BANK'] } },
    select: { id: true },
  })
  const ids = cashAccounts.map((a) => a.id)
  if (ids.length === 0) {
    return { opening: money(0), receipts: money(0), payments: money(0), closing: money(0), movements: [] }
  }

  const openingRows = await tx.journalLine.aggregate({
    where: {
      tenantId: filter.tenantId,
      accountId: { in: ids },
      entry: { status: 'POSTED', date: filter.from ? { lt: filter.from } : undefined },
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    },
    _sum: { debit: true, credit: true },
  })
  const opening = money(openingRows._sum.debit?.toString() ?? 0).minus(money(openingRows._sum.credit?.toString() ?? 0))

  const lines = await tx.journalLine.findMany({
    where: {
      tenantId: filter.tenantId,
      accountId: { in: ids },
      entry: {
        status: 'POSTED',
        date: { gte: filter.from ?? undefined, lte: filter.to ?? undefined },
      },
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    },
    include: { entry: { select: { date: true, reference: true, memoEn: true, memoAr: true } } },
    orderBy: { entry: { date: 'asc' } },
  })

  let receipts = money(0)
  let payments = money(0)
  const movements = lines.map((l) => {
    const amount = money(l.debit.toString()).minus(money(l.credit.toString()))
    if (amount.greaterThan(0)) receipts = receipts.plus(amount)
    else payments = payments.plus(amount.abs())
    return {
      date: l.entry.date,
      reference: l.entry.reference,
      memo: l.memoEn ?? l.entry.memoEn,
      amount,
    }
  })

  return { opening, receipts, payments, closing: opening.plus(receipts).minus(payments), movements }
}

export interface VatReturnWithSources {
  return: VatReturn
  /** Every document behind the figures, so a box can be drilled into. */
  sources: Array<{
    kind: 'SALE' | 'PURCHASE'
    documentId: string
    number: string | null
    date: Date
    partyName: string | null
    category: VatCategory
    taxable: string
    vat: string
  }>
}

/**
 * The VAT return for a period, with the documents behind it.
 *
 * Built from invoice and bill lines rather than from GL balances, because ZATCA's boxes split
 * by tax category and the ledger does not. The acceptance test proves the two agree.
 */
export async function vatReturn(tx: Tx, filter: ReportFilter & { from: Date; to: Date }): Promise<VatReturnWithSources> {
  const salesLines = await tx.$queryRawUnsafe<Array<{ documentId: string; number: string | null; date: Date; partyName: string | null; documentType: string; category: string; taxable: string; vat: string }>>(
    `SELECT i.id AS "documentId", i.number, i.date, p."nameAr" AS "partyName", i."documentType"::text,
            l."vatCategory" AS category,
            SUM(l."taxableAmount")::text AS taxable,
            SUM(l."vatAmount")::text AS vat
       FROM invoices i
       JOIN invoice_lines l ON l."invoiceId" = i.id
       LEFT JOIN parties p ON p.id = i."partyId"
      WHERE i."tenantId" = $1::uuid
        AND i.status NOT IN ('DRAFT', 'CANCELLED')
        AND i.date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR i."branchId" = $4::uuid)
      GROUP BY i.id, p."nameAr", l."vatCategory"`,
    filter.tenantId, filter.from, filter.to, filter.branchId ?? null,
  )

  const purchaseLines = await tx.$queryRawUnsafe<Array<{ documentId: string; number: string; date: Date; partyName: string | null; category: string; taxable: string; vat: string; isImport: boolean; reverseCharge: boolean }>>(
    `SELECT b.id AS "documentId", b.number, b.date, p."nameAr" AS "partyName",
            l."vatCategory" AS category,
            SUM(l."taxableAmount")::text AS taxable,
            SUM(l."vatAmount")::text AS vat,
            b."isImport", b."reverseCharge"
       FROM supplier_bills b
       JOIN supplier_bill_lines l ON l."billId" = b.id
       LEFT JOIN parties p ON p.id = b."partyId"
      WHERE b."tenantId" = $1::uuid
        AND b.status NOT IN ('DRAFT', 'CANCELLED')
        AND b.date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR b."branchId" = $4::uuid)
      GROUP BY b.id, p."nameAr", l."vatCategory", b."isImport", b."reverseCharge"`,
    filter.tenantId, filter.from, filter.to, filter.branchId ?? null,
  )

  const sources: VatReturnWithSources['sources'] = [
    ...salesLines.map((r) => ({
      kind: 'SALE' as const,
      documentId: r.documentId,
      number: r.number,
      date: r.date,
      partyName: r.partyName,
      category: r.category as VatCategory,
      // A credit note reduces the period's output tax, so it enters as a negative.
      taxable: r.documentType === 'CREDIT_NOTE' ? `-${r.taxable}` : r.taxable,
      vat: r.documentType === 'CREDIT_NOTE' ? `-${r.vat}` : r.vat,
    })),
    ...purchaseLines.map((r) => ({
      kind: 'PURCHASE' as const,
      documentId: r.documentId,
      number: r.number,
      date: r.date,
      partyName: r.partyName,
      category: r.category as VatCategory,
      taxable: r.taxable,
      vat: r.vat,
    })),
  ]

  const built = buildVatReturn([
    ...salesLines.map((r) => ({
      direction: 'SALE' as const,
      category: r.category as VatCategory,
      taxableAmount: r.documentType === 'CREDIT_NOTE' ? money(r.taxable).negated() : money(r.taxable),
      vatAmount: r.documentType === 'CREDIT_NOTE' ? money(r.vat).negated() : money(r.vat),
    })),
    ...purchaseLines.map((r) => ({
      direction: 'PURCHASE' as const,
      category: r.category as VatCategory,
      taxableAmount: money(r.taxable),
      vatAmount: money(r.vat),
      isImport: r.isImport,
      reverseCharge: r.reverseCharge,
    })),
  ])

  return { return: built, sources }
}

export async function receivablesAging(tx: Tx, tenantId: string, asOf = new Date()): Promise<AgingRow[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ partyId: string; partyName: string; number: string; dueDate: Date; outstanding: string }>>(
    `SELECT i."partyId", COALESCE(p."nameAr", p."nameEn", 'عميل نقدي') AS "partyName",
            COALESCE(i.number, '') AS number,
            COALESCE(i."dueDate", i.date) AS "dueDate",
            (i."payableTotal" - i."paidTotal"
              - COALESCE((SELECT SUM(c."payableTotal") FROM invoices c
                           WHERE c."originalInvoiceId" = i.id AND c.status <> 'DRAFT'), 0))::text AS outstanding
       FROM invoices i
       LEFT JOIN parties p ON p.id = i."partyId"
      WHERE i."tenantId" = $1::uuid
        AND i."documentType" = 'TAX_INVOICE'
        AND i.status IN ('POSTED', 'PARTIALLY_SETTLED')
        AND i."partyId" IS NOT NULL`,
    tenantId,
  )

  return buildAging(
    rows.filter((r) => Number(r.outstanding) > 0).map((r) => ({
      partyId: r.partyId,
      partyName: r.partyName,
      documentNumber: r.number,
      dueDate: r.dueDate,
      outstanding: r.outstanding,
    })),
    asOf,
  )
}

export async function payablesAging(tx: Tx, tenantId: string, asOf = new Date()): Promise<AgingRow[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ partyId: string; partyName: string; number: string; dueDate: Date; outstanding: string }>>(
    `SELECT b."partyId", COALESCE(p."nameAr", p."nameEn") AS "partyName", b.number,
            COALESCE(b."dueDate", b.date) AS "dueDate",
            (b."payableTotal" - b."paidTotal")::text AS outstanding
       FROM supplier_bills b
       JOIN parties p ON p.id = b."partyId"
      WHERE b."tenantId" = $1::uuid
        AND b.status NOT IN ('DRAFT', 'CANCELLED')`,
    tenantId,
  )

  return buildAging(
    rows.filter((r) => Number(r.outstanding) > 0).map((r) => ({
      partyId: r.partyId,
      partyName: r.partyName,
      documentNumber: r.number,
      dueDate: r.dueDate,
      outstanding: r.outstanding,
    })),
    asOf,
  )
}

export interface Dashboard {
  cashPosition: string
  salesToday: string
  salesMonthToDate: string
  salesYearToDate: string
  salesLastYearToDate: string
  receivables: string
  payables: string
  lowStockCount: number
  zatca: { pending: number; cleared: number; reported: number; rejected: number }
  expiringDocuments: Array<{ kind: string; nameAr: string; nameEn: string; expiresOn: Date; daysLeft: number }>
  topItems: Array<{ nameEn: string; nameAr: string; quantity: string; revenue: string }>
}

/** Everything the owner's first screen shows, in one round trip. */
export async function dashboard(tx: Tx, tenantId: string, now = new Date()): Promise<Dashboard> {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const startOfLastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1))
  const sameDayLastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()))

  const cash = await cashFlow(tx, { tenantId, to: now })

  const salesBetween = async (from: Date, to: Date) => {
    const result = await tx.invoice.aggregate({
      where: {
        tenantId,
        documentType: 'TAX_INVOICE',
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        date: { gte: from, lte: to },
      },
      _sum: { taxableTotal: true },
    })
    const credits = await tx.invoice.aggregate({
      where: { tenantId, documentType: 'CREDIT_NOTE', status: { notIn: ['DRAFT', 'CANCELLED'] }, date: { gte: from, lte: to } },
      _sum: { taxableTotal: true },
    })
    return toDb(
      money(result._sum.taxableTotal?.toString() ?? 0).minus(money(credits._sum.taxableTotal?.toString() ?? 0)),
    )
  }

  const [receivables, payables] = await Promise.all([
    receivablesAging(tx, tenantId, now),
    payablesAging(tx, tenantId, now),
  ])

  const { lowStockItems } = await import('./inventory')
  const lowStock = await lowStockItems(tx, tenantId)

  const submissions = await tx.zatcaSubmission.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { _all: true },
  })
  const countOf = (status: string) => submissions.find((s) => s.status === status)?._count._all ?? 0

  // Documents about to expire: a lapsed CR or Iqama stops the business dead.
  const soon = new Date(now.getTime() + 90 * 86_400_000)
  const employees = await tx.employee.findMany({
    where: { tenantId, status: 'ACTIVE', iqamaExpiry: { not: null, lte: soon } },
    select: { nameEn: true, nameAr: true, iqamaExpiry: true },
  })

  const topItems = await tx.$queryRawUnsafe<Array<{ nameEn: string; nameAr: string; quantity: string; revenue: string }>>(
    `SELECT it."nameEn", it."nameAr",
            SUM(l.quantity)::text AS quantity,
            SUM(l."taxableAmount")::text AS revenue
       FROM invoice_lines l
       JOIN invoices i ON i.id = l."invoiceId"
       JOIN items it ON it.id = l."itemId"
      WHERE i."tenantId" = $1::uuid
        AND i."documentType" = 'TAX_INVOICE'
        AND i.status NOT IN ('DRAFT', 'CANCELLED')
        AND i.date >= $2::date
      GROUP BY it.id
      ORDER BY SUM(l."taxableAmount") DESC
      LIMIT 5`,
    tenantId,
    startOfMonth,
  )

  return {
    cashPosition: toDb(cash.closing),
    salesToday: await salesBetween(startOfDay, now),
    salesMonthToDate: await salesBetween(startOfMonth, now),
    salesYearToDate: await salesBetween(startOfYear, now),
    salesLastYearToDate: await salesBetween(startOfLastYear, sameDayLastYear),
    receivables: toDb(receivables.reduce((acc, r) => acc.plus(r.total), money(0))),
    payables: toDb(payables.reduce((acc, r) => acc.plus(r.total), money(0))),
    lowStockCount: lowStock.length,
    zatca: {
      pending: countOf('PENDING'),
      cleared: countOf('CLEARED'),
      reported: countOf('REPORTED'),
      rejected: countOf('REJECTED') + countOf('FAILED'),
    },
    expiringDocuments: employees.map((e) => ({
      kind: 'IQAMA',
      nameEn: e.nameEn,
      nameAr: e.nameAr,
      expiresOn: e.iqamaExpiry!,
      daysLeft: Math.floor((e.iqamaExpiry!.getTime() - now.getTime()) / 86_400_000),
    })),
    topItems,
  }
}
