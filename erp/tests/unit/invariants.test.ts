/**
 * The accounting invariant suite.
 *
 * These are the acceptance criteria expressed as tests: whole business scenarios run end to
 * end through the same posting builders the application uses, with the trial balance checked
 * after every single step. If one of these fails, money has gone missing.
 */
import { describe, expect, it } from 'vitest'
import { TestLedger } from '../support/ledger'
import { computeDocument } from '@/lib/tax/vat'
import {
  buildAging,
  buildCashVariancePosting,
  buildCreditNotePosting,
  buildPaymentPosting,
  buildProductionPosting,
  buildSalesInvoicePosting,
  buildStockAdjustmentPosting,
  buildSupplierBillPosting,
  buildYearEndClosePosting,
} from '@/lib/accounting/documents'
import { buildPayrollPosting, runPayroll } from '@/lib/payroll/payroll'
import { EMPTY_STATE, applyMovement, type StockState } from '@/lib/inventory/valuation'
import { PostingError } from '@/lib/accounting/posting'

const tenantId = 't1'
const branchId = 'jed'

const context = (reference: string, date = new Date('2026-03-15T00:00:00Z'), partyId?: string) => ({
  tenantId, branchId, date, reference, partyId,
})

describe('I1/I2 — the trial balance nets to zero after every event', () => {
  it('stays balanced through a full trading month', () => {
    const ledger = new TestLedger(TestLedger.monthlyPeriods(2026))
    const expectBalanced = () => {
      const tb = ledger.trialBalance()
      expect(tb.balanced, `trial balance out by ${tb.totalDebit.minus(tb.totalCredit).toFixed(4)}`).toBe(true)
    }

    // 1. Buy stock on credit: 1,000 units at 8.00, plus 15% VAT.
    const purchase = computeDocument({ lines: [{ quantity: 1000, unitPrice: '8.00', vatCategory: 'STANDARD' }] })
    ledger.post(
      buildSupplierBillPosting({
        context: context('BILL-2026-000001', new Date('2026-03-01'), 'supplier-1'),
        totals: purchase,
        inventoryAmount: purchase.taxableTotal,
      }),
    )
    expectBalanced()
    expect(ledger.balanceOf('INVENTORY').toFixed(2)).toBe('8000.00')
    expect(ledger.balanceOf('VAT_INPUT').toFixed(2)).toBe('1200.00')
    expect(ledger.balanceOf('ACCOUNTS_PAYABLE').toFixed(2)).toBe('-9200.00')

    // 2. Sell 300 of them at 20.00 on credit. Cost of sales at 8.00 each.
    const sale = computeDocument({ lines: [{ quantity: 300, unitPrice: '20.00', vatCategory: 'STANDARD' }] })
    ledger.post(
      buildSalesInvoicePosting({
        context: context('INV-JED-2026-000001', new Date('2026-03-05'), 'customer-1'),
        totals: sale,
        costOfSales: '2400',
      }),
    )
    expectBalanced()
    expect(ledger.balanceOf('ACCOUNTS_RECEIVABLE').toFixed(2)).toBe('6900.00')
    expect(ledger.balanceOf('VAT_OUTPUT').toFixed(2)).toBe('-900.00')
    expect(ledger.balanceOf('COGS').toFixed(2)).toBe('2400.00')

    // 3. Customer pays in full.
    ledger.post(
      buildPaymentPosting({
        context: context('RCT-2026-000001', new Date('2026-03-10'), 'customer-1'),
        direction: 'RECEIPT',
        amount: sale.payableTotal,
        account: 'BANK',
      }),
    )
    expectBalanced()
    expect(ledger.balanceOf('ACCOUNTS_RECEIVABLE').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOf('BANK').toFixed(2)).toBe('6900.00')

    // 4. Pay the supplier, with a 25.00 bank charge.
    ledger.post(
      buildPaymentPosting({
        context: context('PMT-2026-000001', new Date('2026-03-12'), 'supplier-1'),
        direction: 'PAYMENT',
        amount: purchase.payableTotal,
        account: 'BANK',
        bankCharges: '25',
      }),
    )
    expectBalanced()
    expect(ledger.balanceOf('ACCOUNTS_PAYABLE').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOf('BANK_CHARGES').toFixed(2)).toBe('25.00')

    // 5. A stock count finds 5 units missing at 8.00.
    ledger.post(
      buildStockAdjustmentPosting({
        context: context('ADJ-2026-000001', new Date('2026-03-20')),
        valueChange: '-40',
        reasonEn: 'Stock count shortage',
        reasonAr: 'عجز جرد',
      }),
    )
    expectBalanced()
    expect(ledger.balanceOf('INVENTORY_ADJUSTMENT').toFixed(2)).toBe('40.00')

    // 6. Payroll for five people.
    const payroll = runPayroll({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
      employees: Array.from({ length: 5 }, (_, i) => ({
        employeeId: `e${i}`,
        employeeNumber: `EMP-00${i + 1}`,
        nameEn: `Employee ${i + 1}`,
        nameAr: `موظف ${i + 1}`,
        nationality: i % 2 === 0 ? ('SAUDI' as const) : ('NON_SAUDI' as const),
        identityNumber: `1${String(i).repeat(9)}`,
        iban: 'SA0380000000608010167519',
        hireDate: new Date('2022-01-01'),
        basicSalary: '5000',
        housingAllowance: '1250',
        branchId,
      })),
    })
    ledger.post(
      buildPayrollPosting({ tenantId, branchId, date: new Date('2026-03-31'), reference: 'PAY-2026-03', result: payroll }),
    )
    expectBalanced()
    expect(ledger.balanceOf('ACCRUED_SALARIES').toFixed(2)).toBe(payroll.totalNet.negated().toFixed(2))

    // 7. Till variance at close of a cash day.
    const variance = buildCashVariancePosting({
      context: context('POS-2026-000001', new Date('2026-03-31')),
      expected: '4500',
      counted: '4485',
    })!
    ledger.post(variance)
    expectBalanced()

    // 8. Production: turn 500.00 of components into a finished good valued at 500.00.
    ledger.post(
      buildProductionPosting({
        context: context('PRD-2026-000001', new Date('2026-03-25')),
        componentsCost: '500',
        outputValue: '500',
      }),
    )
    expectBalanced()

    // The whole month, twelve entries deep, still balances to the halala.
    const tb = ledger.trialBalance()
    expect(tb.totalDebit.equals(tb.totalCredit)).toBe(true)
    expect(tb.totalDebit.greaterThan(0)).toBe(true)
  })

  it('balances within a single branch as well as across the tenant', () => {
    const ledger = new TestLedger()
    const sale = computeDocument({ lines: [{ quantity: 1, unitPrice: '100', vatCategory: 'STANDARD' }] })

    ledger.post(buildSalesInvoicePosting({ context: { ...context('INV-1'), branchId: 'jed' }, totals: sale }))
    ledger.post(buildSalesInvoicePosting({ context: { ...context('INV-2'), branchId: 'ruh' }, totals: sale }))

    expect(ledger.trialBalance({ branchId: 'jed' }).balanced).toBe(true)
    expect(ledger.trialBalance({ branchId: 'ruh' }).balanced).toBe(true)
    expect(ledger.trialBalance().balanced).toBe(true)
  })
})

describe('a credit note fully reverses an invoice — GL, VAT and stock', () => {
  it('leaves every affected account back where it started', () => {
    const ledger = new TestLedger()
    const totals = computeDocument({
      lines: [
        { quantity: 3, unitPrice: '45.00', vatCategory: 'STANDARD' },
        { quantity: 1, unitPrice: '200.00', vatCategory: 'ZERO_RATED' },
      ],
      headerDiscount: '35',
    })
    const cost = '150.00'

    ledger.post(
      buildSalesInvoicePosting({ context: context('INV-JED-2026-000010', undefined, 'customer-9'), totals, costOfSales: cost }),
    )

    const afterInvoice = {
      ar: ledger.balanceOf('ACCOUNTS_RECEIVABLE'),
      vat: ledger.balanceOf('VAT_OUTPUT'),
      inventory: ledger.balanceOf('INVENTORY'),
      cogs: ledger.balanceOf('COGS'),
    }
    expect(afterInvoice.ar.greaterThan(0)).toBe(true)
    expect(afterInvoice.vat.lessThan(0)).toBe(true)
    expect(afterInvoice.inventory.toFixed(2)).toBe('-150.00')

    ledger.post(
      buildCreditNotePosting({ context: context('CRN-JED-2026-000001', undefined, 'customer-9'), totals, costOfSales: cost }),
    )

    // Everything the invoice moved is back to zero.
    expect(ledger.balanceOf('ACCOUNTS_RECEIVABLE').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOf('VAT_OUTPUT').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOf('INVENTORY').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOf('COGS').toFixed(2)).toBe('0.00')
    expect(ledger.trialBalance().balanced).toBe(true)

    // Revenue and returns are both left standing, so gross sales stay visible in the P&L.
    expect(ledger.balanceOf('SALES_REVENUE').abs().greaterThan(0)).toBe(true)
    expect(ledger.balanceOf('SALES_RETURNS').greaterThan(0)).toBe(true)
    expect(ledger.balanceOf('SALES_REVENUE').plus(ledger.balanceOf('SALES_RETURNS')).toFixed(2)).toBe('0.00')
  })

  it('reverses the stock movement as exactly as it reverses the ledger', () => {
    let stock: StockState = EMPTY_STATE
    stock = applyMovement(stock, 'RECEIPT', '100', { method: 'WEIGHTED_AVERAGE', unitCost: '8' }).state

    const issue = applyMovement(stock, 'ISSUE', '30', { method: 'WEIGHTED_AVERAGE' })
    const returned = applyMovement(issue.state, 'RECEIPT', '30', {
      method: 'WEIGHTED_AVERAGE',
      unitCost: issue.unitCost,
    })

    expect(returned.state.quantity.toFixed(0)).toBe('100')
    expect(returned.state.value.toFixed(2)).toBe('800.00')
    expect(returned.costAmount.toFixed(2)).toBe(issue.costAmount.toFixed(2))
  })

  it('handles a partial credit note without disturbing the rest of the invoice', () => {
    const ledger = new TestLedger()
    const full = computeDocument({ lines: [{ quantity: 10, unitPrice: '50', vatCategory: 'STANDARD' }] })
    const part = computeDocument({ lines: [{ quantity: 4, unitPrice: '50', vatCategory: 'STANDARD' }] })

    ledger.post(buildSalesInvoicePosting({ context: context('INV-20', undefined, 'c1'), totals: full, costOfSales: '300' }))
    ledger.post(buildCreditNotePosting({ context: context('CRN-2', undefined, 'c1'), totals: part, costOfSales: '120' }))

    // 575.00 invoiced, 230.00 credited: 345.00 still owed.
    expect(ledger.balanceOf('ACCOUNTS_RECEIVABLE').toFixed(2)).toBe('345.00')
    expect(ledger.balanceOf('VAT_OUTPUT').toFixed(2)).toBe('-45.00')
    expect(ledger.balanceOf('INVENTORY').toFixed(2)).toBe('-180.00')
    expect(ledger.trialBalance().balanced).toBe(true)
  })
})

describe('I6 — a locked period rejects every posting into it', () => {
  it('refuses with a message naming the period, and still accepts an open one', () => {
    const ledger = new TestLedger(TestLedger.monthlyPeriods(2026))
    const totals = computeDocument({ lines: [{ quantity: 1, unitPrice: '100', vatCategory: 'STANDARD' }] })

    ledger.post(buildSalesInvoicePosting({ context: context('INV-A', new Date('2026-01-15')), totals }))
    ledger.closePeriod(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 0, 23, 59, 59)))

    try {
      ledger.post(buildSalesInvoicePosting({ context: context('INV-B', new Date('2026-01-20')), totals }))
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(PostingError)
      expect((error as PostingError).code).toBe('PERIOD_CLOSED')
      expect((error as PostingError).message).toMatch(/2026-01-01 to 2026-01-31/)
    }

    // February is untouched.
    expect(() =>
      ledger.post(buildSalesInvoicePosting({ context: context('INV-C', new Date('2026-02-05')), totals })),
    ).not.toThrow()

    // And a reversal cannot sneak into the closed month either.
    const january = ledger.entries[0]
    expect(() => ledger.reverse(january, new Date('2026-01-25'))).toThrow(/closed/i)
    expect(() => ledger.reverse(january, new Date('2026-02-25'))).not.toThrow()
    expect(ledger.trialBalance().balanced).toBe(true)
  })
})

describe('foreign currency settlement', () => {
  it('posts the difference to exchange gain and keeps the books balanced', () => {
    const ledger = new TestLedger()
    // Invoiced 1,000 USD when the rate made it 3,750 SAR; received 3,800 SAR.
    ledger.post(
      buildPaymentPosting({
        context: context('RCT-FX-1', undefined, 'customer-us'),
        direction: 'RECEIPT',
        amount: '3800',
        allocatedAtOriginalRate: '3750',
        account: 'BANK',
      }),
    )
    expect(ledger.balanceOf('FX_GAIN').toFixed(2)).toBe('-50.00')
    expect(ledger.trialBalance().balanced).toBe(true)
  })

  it('posts a loss when the riyal cost of settling a bill rises', () => {
    const ledger = new TestLedger()
    ledger.post(
      buildPaymentPosting({
        context: context('PMT-FX-1', undefined, 'supplier-cn'),
        direction: 'PAYMENT',
        amount: '3800',
        allocatedAtOriginalRate: '3750',
        account: 'BANK',
      }),
    )
    expect(ledger.balanceOf('FX_LOSS').toFixed(2)).toBe('50.00')
    expect(ledger.trialBalance().balanced).toBe(true)
  })
})

describe('withholding tax on a supplier bill', () => {
  it('splits the payable between the supplier and ZATCA', () => {
    const ledger = new TestLedger()
    const totals = computeDocument({ lines: [{ quantity: 1, unitPrice: '10000', vatCategory: 'STANDARD' }] })
    ledger.post(
      buildSupplierBillPosting({
        context: context('BILL-WHT', undefined, 'consultant'),
        totals,
        withholdingTax: '500', // 5% on a non-resident service
        expenseRole: 'GENERAL_EXPENSE',
      }),
    )
    expect(ledger.balanceOf('WITHHOLDING_TAX_PAYABLE').toFixed(2)).toBe('-500.00')
    expect(ledger.balanceOf('ACCOUNTS_PAYABLE').toFixed(2)).toBe('-11000.00')
    expect(ledger.trialBalance().balanced).toBe(true)
  })

  it('refuses a bill whose inventory portion exceeds its net', () => {
    const totals = computeDocument({ lines: [{ quantity: 1, unitPrice: '100', vatCategory: 'STANDARD' }] })
    expect(() =>
      buildSupplierBillPosting({ context: context('BILL-BAD'), totals, inventoryAmount: '200' }),
    ).toThrow(/cannot exceed/)
  })
})

describe('rounding the payable', () => {
  it('posts the rounding difference rather than absorbing it into revenue', () => {
    const ledger = new TestLedger()
    const totals = computeDocument({
      lines: [{ quantity: 1, unitPrice: '10.11', vatCategory: 'STANDARD' }],
      roundTo: '0.05',
    })
    ledger.post(buildSalesInvoicePosting({ context: context('INV-ROUND'), totals }))

    expect(ledger.balanceOf('SALES_REVENUE').toFixed(2)).toBe('-10.11')
    expect(ledger.balanceOf('ROUNDING').toFixed(2)).toBe('-0.02')
    expect(ledger.balanceOf('ACCOUNTS_RECEIVABLE').toFixed(2)).toBe('11.65')
    expect(ledger.trialBalance().balanced).toBe(true)
  })
})

describe('year end close', () => {
  it('sweeps profit into retained earnings and leaves the balance sheet balanced', () => {
    const ledger = new TestLedger()
    const sale = computeDocument({ lines: [{ quantity: 1, unitPrice: '10000', vatCategory: 'STANDARD' }] })
    ledger.post(buildSalesInvoicePosting({ context: context('INV-Y', new Date('2026-06-01')), totals: sale, costOfSales: '4000' }))

    const revenue = ledger.balanceOfCode('4100')
    const cogs = ledger.balanceOfCode('5100')
    const entry = buildYearEndClosePosting({
      tenantId, branchId,
      date: new Date('2026-12-31'),
      reference: 'JV-CLOSE-2026',
      balances: [
        { accountId: ledger.accountByCode('4100').id, balance: revenue },
        { accountId: ledger.accountByCode('5100').id, balance: cogs },
      ],
    })!
    ledger.post(entry)

    expect(ledger.balanceOfCode('4100').toFixed(2)).toBe('0.00')
    expect(ledger.balanceOfCode('5100').toFixed(2)).toBe('0.00')
    // 10,000 revenue less 4,000 cost = 6,000 profit, credited to retained earnings.
    expect(ledger.balanceOf('RETAINED_EARNINGS').toFixed(2)).toBe('-6000.00')
    expect(ledger.trialBalance().balanced).toBe(true)
  })

  it('posts nothing when there is nothing to close', () => {
    expect(
      buildYearEndClosePosting({
        tenantId, branchId, date: new Date('2026-12-31'), reference: 'JV-CLOSE',
        balances: [{ accountId: 'acc-4100', balance: '0' }],
      }),
    ).toBeNull()
  })
})

describe('aging', () => {
  const asOf = new Date('2026-03-31T00:00:00Z')

  it('drops each document into the right bucket', () => {
    const rows = buildAging(
      [
        { partyId: 'c1', partyName: 'Al Faisal Trading', documentNumber: 'INV-1', dueDate: new Date('2026-04-15'), outstanding: '1000' },
        { partyId: 'c1', partyName: 'Al Faisal Trading', documentNumber: 'INV-2', dueDate: new Date('2026-03-15'), outstanding: '2000' },
        { partyId: 'c1', partyName: 'Al Faisal Trading', documentNumber: 'INV-3', dueDate: new Date('2026-02-10'), outstanding: '3000' },
        { partyId: 'c2', partyName: 'Red Sea Co', documentNumber: 'INV-4', dueDate: new Date('2026-01-10'), outstanding: '4000' },
        { partyId: 'c2', partyName: 'Red Sea Co', documentNumber: 'INV-5', dueDate: new Date('2025-10-01'), outstanding: '5000' },
      ],
      asOf,
    )

    const c1 = rows.find((r) => r.partyId === 'c1')!
    expect(c1.current.toFixed(2)).toBe('1000.00')
    expect(c1.days1to30.toFixed(2)).toBe('2000.00')
    expect(c1.days31to60.toFixed(2)).toBe('3000.00')
    expect(c1.total.toFixed(2)).toBe('6000.00')

    const c2 = rows.find((r) => r.partyId === 'c2')!
    expect(c2.days61to90.toFixed(2)).toBe('4000.00')
    expect(c2.over90.toFixed(2)).toBe('5000.00')

    // Biggest debtor first, which is the order an owner chases in.
    expect(rows[0].partyId).toBe('c2')
  })

  it('ignores fully settled documents', () => {
    const rows = buildAging(
      [{ partyId: 'c1', partyName: 'X', documentNumber: 'INV-1', dueDate: new Date('2026-01-01'), outstanding: '0' }],
      asOf,
    )
    expect(rows).toHaveLength(0)
  })
})

describe('cash variance', () => {
  it('posts a shortage as an expense and an overage as income', () => {
    const short = buildCashVariancePosting({ context: context('POS-1'), expected: '1000', counted: '990' })!
    expect(short.lines.find((l) => l.role === 'GENERAL_EXPENSE')?.debit).toBeDefined()

    const over = buildCashVariancePosting({ context: context('POS-2'), expected: '1000', counted: '1010' })!
    expect(over.lines.find((l) => l.role === 'OTHER_INCOME')?.credit).toBeDefined()
  })

  it('posts nothing when the till agrees', () => {
    expect(buildCashVariancePosting({ context: context('POS-3'), expected: '1000', counted: '1000' })).toBeNull()
  })
})
