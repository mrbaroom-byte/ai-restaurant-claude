import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TENANT_ID, asTenant, db, disconnect, reseed } from './setup'
import { balanceSheet, cashFlow, dashboard, profitAndLoss, receivablesAging, trialBalance, vatReturn } from '@/server/services/reports'
import { createDraft, postInvoice } from '@/server/services/invoice'
import { money, sum } from '@/lib/money'

beforeAll(() => reseed(), 180_000)
afterAll(() => disconnect())

const year = new Date().getUTCFullYear()
const periodStart = new Date(Date.UTC(year, 0, 1))
const periodEnd = new Date(Date.UTC(year, 11, 31))

describe('trial balance', () => {
  it('nets to zero over the seeded books', async () => {
    const tb = await asTenant((tx) => trialBalance(tx, { tenantId: TENANT_ID }))
    expect(tb.balanced).toBe(true)
    expect(tb.rows.length).toBeGreaterThan(0)
    expect(tb.totalDebit.greaterThan(0)).toBe(true)
  })

  it('nets to zero for a single branch too', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const tb = await asTenant((tx) => trialBalance(tx, { tenantId: TENANT_ID, branchId: branch.id }))
    expect(tb.balanced).toBe(true)
  })

  it('nets to zero for any date window', async () => {
    for (const [from, to] of [
      [periodStart, periodEnd],
      [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 5, 30))],
      [new Date(Date.UTC(year - 1, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))],
    ] as const) {
      const tb = await asTenant((tx) => trialBalance(tx, { tenantId: TENANT_ID, from, to }))
      expect(tb.balanced, `${from.toISOString()} → ${to.toISOString()}`).toBe(true)
    }
  })
})

describe('financial statements', () => {
  it('produce a P&L whose gross profit is revenue less cost of sales', async () => {
    const pl = await asTenant((tx) => profitAndLoss(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))
    expect(pl.grossProfit.toFixed(4)).toBe(pl.totalRevenue.minus(pl.totalCostOfSales).toFixed(4))
    expect(pl.netProfit.toFixed(4)).toBe(pl.operatingProfit.plus(pl.totalOtherIncome).toFixed(4))
    expect(pl.totalRevenue.greaterThan(0)).toBe(true)
  })

  it('produce a balance sheet that balances', async () => {
    const bs = await asTenant((tx) => balanceSheet(tx, { tenantId: TENANT_ID, to: periodEnd }))
    expect(bs.balanced, `assets ${bs.totalAssets.toFixed(2)} vs liabilities+equity ${bs.totalLiabilities.plus(bs.totalEquity).toFixed(2)}`).toBe(true)
  })

  it('carry the period result into equity so the sheet balances before year end', async () => {
    const bs = await asTenant((tx) => balanceSheet(tx, { tenantId: TENANT_ID, to: periodEnd }))
    const pl = await asTenant((tx) => profitAndLoss(tx, { tenantId: TENANT_ID, to: periodEnd }))
    expect(bs.resultForPeriod.toFixed(4)).toBe(pl.netProfit.toFixed(4))
  })

  it('offer a comparative column when a prior period is given', async () => {
    const pl = await asTenant((tx) =>
      profitAndLoss(
        tx,
        { tenantId: TENANT_ID, from: periodStart, to: periodEnd },
        { tenantId: TENANT_ID, from: new Date(Date.UTC(year - 1, 0, 1)), to: new Date(Date.UTC(year - 1, 11, 31)) },
      ),
    )
    expect(pl.revenue.every((l) => l.comparative !== undefined)).toBe(true)
    // Nothing was traded last year in the demo data.
    expect(pl.revenue.every((l) => l.comparative!.isZero())).toBe(true)
  })

  it('report cash movements that reconcile to the closing balance', async () => {
    const cash = await asTenant((tx) => cashFlow(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))
    expect(cash.closing.toFixed(4)).toBe(cash.opening.plus(cash.receipts).minus(cash.payments).toFixed(4))
    expect(cash.movements.length).toBeGreaterThan(0)
  })
})

describe('VAT return', () => {
  it('matches the sum of its source invoices to the halala', async () => {
    const result = await asTenant((tx) =>
      vatReturn(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }),
    )

    const salesVat = sum(result.sources.filter((s) => s.kind === 'SALE').map((s) => s.vat))
    const purchaseVat = sum(result.sources.filter((s) => s.kind === 'PURCHASE').map((s) => s.vat))

    expect(result.return.box6.vat.toFixed(2)).toBe(salesVat.toFixed(2))
    expect(result.return.box12.vat.toFixed(2)).toBe(purchaseVat.toFixed(2))
    expect(result.return.box13.toFixed(2)).toBe(salesVat.minus(purchaseVat).toFixed(2))
    expect(result.return.box15.toFixed(2)).toBe(result.return.box13.plus(result.return.box14).toFixed(2))
  })

  it('lets every box be drilled into a document', async () => {
    const result = await asTenant((tx) => vatReturn(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      expect(source.documentId).toBeTruthy()
      expect(source.date).toBeInstanceOf(Date)
    }
  })

  it('reduces output tax when a credit note is issued', async () => {
    // Credit an invoice this test raises itself, so the seeded receivable that the aging and
    // dashboard tests read is left as it was.
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const warehouse = await db().warehouse.findFirstOrThrow({ where: { tenantId: TENANT_ID, branchId: branch.id } })
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })
    const customer = await db().party.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'CUS-0001' } })

    const { moveStock } = await import('@/server/services/inventory')
    await asTenant((tx) =>
      moveStock(tx, {
        tenantId: TENANT_ID, itemId: item.id, warehouseId: warehouse.id, kind: 'RECEIPT',
        date: new Date(), quantity: '20', unitCost: '1.20', source: 'OPENING',
      }),
    )

    const posted = await asTenant(async (tx) => {
      const draft = await createDraft(tx, {
        tenantId: TENANT_ID, branchId: branch.id, kind: 'STANDARD', date: new Date(), partyId: customer.id,
        lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '5', unitPrice: '3.00', warehouseId: warehouse.id }],
      })
      return postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    })

    const before = await asTenant((tx) => vatReturn(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))

    const { createCreditNote } = await import('@/server/services/invoice')
    await asTenant((tx) =>
      createCreditNote(tx, { tenantId: TENANT_ID, invoiceId: posted.invoiceId, date: new Date(), reason: 'إرجاع البضاعة' }),
    )

    const after = await asTenant((tx) => vatReturn(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))
    expect(after.return.box1.vat.lessThan(before.return.box1.vat)).toBe(true)

    // Still reconciles after the credit.
    const salesVat = sum(after.sources.filter((s) => s.kind === 'SALE').map((s) => s.vat))
    expect(after.return.box6.vat.toFixed(2)).toBe(salesVat.toFixed(2))
  }, 60_000)

  it('agrees with the VAT output account in the ledger', async () => {
    const result = await asTenant((tx) => vatReturn(tx, { tenantId: TENANT_ID, from: periodStart, to: periodEnd }))
    const vatOutput = await db().account.findFirstOrThrow({ where: { tenantId: TENANT_ID, role: 'VAT_OUTPUT' } })
    const totals = await db().journalLine.aggregate({
      where: { tenantId: TENANT_ID, accountId: vatOutput.id },
      _sum: { debit: true, credit: true },
    })
    // Credit balance on VAT output is the output tax charged, net of credit notes.
    const ledgerOutputTax = money(totals._sum.credit?.toString() ?? 0).minus(money(totals._sum.debit?.toString() ?? 0))
    expect(result.return.box6.vat.toFixed(2)).toBe(ledgerOutputTax.toFixed(2))
  })
})

describe('aging', () => {
  it('shows what the customer still owes after a part payment', async () => {
    const rows = await asTenant((tx) => receivablesAging(tx, TENANT_ID))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.total.greaterThan(0)).toBe(true)
      expect(row.total.toFixed(4)).toBe(
        row.current.plus(row.days1to30).plus(row.days31to60).plus(row.days61to90).plus(row.over90).toFixed(4),
      )
    }
  })
})

describe('dashboard', () => {
  it('answers every tile the owner sees', async () => {
    const view = await asTenant((tx) => dashboard(tx, TENANT_ID))

    expect(money(view.salesYearToDate).greaterThan(0)).toBe(true)
    expect(money(view.receivables).greaterThanOrEqualTo(0)).toBe(true)
    expect(view.zatca.pending + view.zatca.cleared + view.zatca.reported + view.zatca.rejected).toBeGreaterThan(0)
    expect(Array.isArray(view.topItems)).toBe(true)
    expect(Array.isArray(view.expiringDocuments)).toBe(true)
    expect(typeof view.lowStockCount).toBe('number')
  })

  it('picks up a new sale immediately', async () => {
    const before = await asTenant((tx) => dashboard(tx, TENANT_ID))

    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const warehouse = await db().warehouse.findFirstOrThrow({ where: { tenantId: TENANT_ID, branchId: branch.id } })
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })

    const { moveStock } = await import('@/server/services/inventory')
    await asTenant((tx) =>
      moveStock(tx, {
        tenantId: TENANT_ID, itemId: item.id, warehouseId: warehouse.id, kind: 'RECEIPT',
        date: new Date(), quantity: '50', unitCost: '1.20', source: 'OPENING',
      }),
    )

    await asTenant(async (tx) => {
      const draft = await createDraft(tx, {
        tenantId: TENANT_ID, branchId: branch.id, kind: 'SIMPLIFIED', date: new Date(),
        lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '10', unitPrice: '3.00', warehouseId: warehouse.id }],
      })
      return postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    })

    const after = await asTenant((tx) => dashboard(tx, TENANT_ID))
    expect(money(after.salesToday).greaterThan(money(before.salesToday))).toBe(true)
    expect(after.zatca.pending).toBeGreaterThan(before.zatca.pending)
  }, 60_000)
})
