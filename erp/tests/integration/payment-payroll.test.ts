/**
 * The two acceptance criteria that need a persisted service behind them:
 *
 *   • post a B2B invoice → payment received → AR cleared, VAT output credited, bank debited
 *   • payroll for five employees → correct GOSI and EOSB, a WPS file the bank will take, and a
 *     balanced ledger posting
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TENANT_ID, asTenant, db, disconnect, reseed, trialBalanceTotals } from './setup'
import { createDraft, postInvoice } from '@/server/services/invoice'
import { openInvoicesFor, recordPayment } from '@/server/services/payment'
import { createRun, postRun, wpsFileFor } from '@/server/services/payroll'
import { moveStock } from '@/server/services/inventory'
import { isValidSaudiIban } from '@/lib/payroll/wps'
import { money } from '@/lib/money'

beforeAll(() => reseed(), 180_000)
afterAll(() => disconnect())

async function accountBalance(code: string) {
  const account = await db().account.findFirstOrThrow({ where: { tenantId: TENANT_ID, code } })
  const totals = await db().journalLine.aggregate({
    where: { tenantId: TENANT_ID, accountId: account.id },
    _sum: { debit: true, credit: true },
  })
  return money(totals._sum.debit?.toString() ?? 0).minus(money(totals._sum.credit?.toString() ?? 0))
}

async function postInvoiceForTest(quantity = '10') {
  const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
  const warehouse = await db().warehouse.findFirstOrThrow({ where: { tenantId: TENANT_ID, branchId: branch.id } })
  const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })
  const customer = await db().party.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'CUS-0001' } })

  await asTenant((tx) =>
    moveStock(tx, {
      tenantId: TENANT_ID, itemId: item.id, warehouseId: warehouse.id, kind: 'RECEIPT',
      date: new Date(), quantity: '100', unitCost: '0.95', source: 'OPENING',
    }),
  )

  return asTenant(async (tx) => {
    const draft = await createDraft(tx, {
      tenantId: TENANT_ID, branchId: branch.id, kind: 'STANDARD', date: new Date(), partyId: customer.id,
      lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity, unitPrice: '3.00', warehouseId: warehouse.id }],
    })
    const posted = await postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    return { ...posted, branchId: branch.id, partyId: customer.id }
  })
}

describe('a B2B invoice, then the money arrives', () => {
  it('clears the receivable, leaves VAT output credited, and debits the bank', async () => {
    const invoice = await postInvoiceForTest()

    const arAfterInvoice = await accountBalance('1130')
    const vatAfterInvoice = await accountBalance('2120')
    const bankBefore = await accountBalance('1120')

    const posted = await db().invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })
    expect(posted.status).toBe('POSTED')

    // The customer pays the whole invoice by bank transfer.
    const receipt = await asTenant((tx) =>
      recordPayment(tx, {
        tenantId: TENANT_ID,
        branchId: invoice.branchId,
        partyId: invoice.partyId,
        direction: 'RECEIPT',
        date: new Date(),
        method: 'BANK_TRANSFER',
        amount: posted.payableTotal.toString(),
        allocations: [{ invoiceId: invoice.invoiceId, amount: posted.payableTotal.toString() }],
      }),
    )

    expect(receipt.number).toMatch(/^RCT-/)
    expect(receipt.unallocated).toBe('0.0000')

    // Receivables are back where they were before this invoice; the bank has the money.
    expect((await accountBalance('1130')).toFixed(2)).toBe(
      arAfterInvoice.minus(money(posted.payableTotal.toString())).toFixed(2),
    )
    expect((await accountBalance('1120')).toFixed(2)).toBe(
      bankBefore.plus(money(posted.payableTotal.toString())).toFixed(2),
    )
    // VAT output stays credited: collecting the money does not discharge the tax.
    expect((await accountBalance('2120')).toFixed(2)).toBe(vatAfterInvoice.toFixed(2))

    const settled = await db().invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })
    expect(settled.status).toBe('SETTLED')

    const totals = await trialBalanceTotals()
    expect(totals.debit).toBe(totals.credit)
  }, 60_000)

  it('records a part payment and leaves the rest outstanding', async () => {
    const invoice = await postInvoiceForTest('8')
    const posted = await db().invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })
    const half = money(posted.payableTotal.toString()).div(2)

    await asTenant((tx) =>
      recordPayment(tx, {
        tenantId: TENANT_ID, branchId: invoice.branchId, partyId: invoice.partyId,
        direction: 'RECEIPT', date: new Date(), method: 'CASH', amount: half,
        allocations: [{ invoiceId: invoice.invoiceId, amount: half }],
      }),
    )

    const after = await db().invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })
    expect(after.status).toBe('PARTIALLY_SETTLED')

    const open = await asTenant((tx) => openInvoicesFor(tx, TENANT_ID, invoice.partyId))
    const row = open.find((r) => r.id === invoice.invoiceId)!
    expect(money(row.outstanding).toFixed(2)).toBe(half.toFixed(2))
  }, 60_000)

  it('refuses to settle an invoice for more than it still owes', async () => {
    const invoice = await postInvoiceForTest('5')
    const posted = await db().invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })
    const tooMuch = money(posted.payableTotal.toString()).plus(1)

    await expect(
      asTenant((tx) =>
        recordPayment(tx, {
          tenantId: TENANT_ID, branchId: invoice.branchId, partyId: invoice.partyId,
          direction: 'RECEIPT', date: new Date(), method: 'CASH', amount: tooMuch,
          allocations: [{ invoiceId: invoice.invoiceId, amount: tooMuch }],
        }),
      ),
    ).rejects.toThrow(/outstanding/)
  }, 60_000)

  it('refuses to allocate more than the payment itself', async () => {
    const invoice = await postInvoiceForTest('5')
    await expect(
      asTenant((tx) =>
        recordPayment(tx, {
          tenantId: TENANT_ID, branchId: invoice.branchId, partyId: invoice.partyId,
          direction: 'RECEIPT', date: new Date(), method: 'CASH', amount: '10',
          allocations: [{ invoiceId: invoice.invoiceId, amount: '11' }],
        }),
      ),
    ).rejects.toThrow(/allocations total/)
  }, 60_000)

  it('refuses to settle another customer\'s invoice', async () => {
    const invoice = await postInvoiceForTest('5')
    const other = await db().party.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'CUS-0002' } })

    await expect(
      asTenant((tx) =>
        recordPayment(tx, {
          tenantId: TENANT_ID, branchId: invoice.branchId, partyId: other.id,
          direction: 'RECEIPT', date: new Date(), method: 'CASH', amount: '5',
          allocations: [{ invoiceId: invoice.invoiceId, amount: '5' }],
        }),
      ),
    ).rejects.toThrow(/does not belong to this customer/)
  }, 60_000)
})

describe('payroll for five employees', () => {
  it('computes GOSI and end of service, posts a balanced entry, and produces a WPS file', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const year = new Date().getUTCFullYear()
    const periodStart = new Date(Date.UTC(year, 2, 1))
    const periodEnd = new Date(Date.UTC(year, 2, 31))

    const before = await trialBalanceTotals()

    const run = await asTenant((tx) =>
      createRun(tx, { tenantId: TENANT_ID, branchId: branch.id, periodStart, periodEnd }),
    )

    expect(run.employeeCount).toBe(5)
    expect(money(run.totalNet).greaterThan(0)).toBe(true)
    expect(money(run.totalNet).lessThan(money(run.totalGross))).toBe(true)

    const stored = await db().payrollRun.findUniqueOrThrow({
      where: { id: run.payrollRunId },
      include: { payslips: { include: { employee: true } } },
    })

    // The rates are stamped on the run, so a reprint next year uses the right ones.
    expect(stored.ratesUsed).toMatchObject({ saudiEmployee: '0.0975', saudiEmployer: '0.1175' })

    // Saudis carry an employee contribution; non-Saudis do not, but their employer does.
    for (const payslip of stored.payslips) {
      if (payslip.employee.isSaudi) {
        expect(Number(payslip.gosiEmployee), payslip.employee.nameEn).toBeGreaterThan(0)
      } else {
        expect(Number(payslip.gosiEmployee), payslip.employee.nameEn).toBe(0)
        expect(Number(payslip.gosiEmployer), payslip.employee.nameEn).toBeGreaterThan(0)
      }
      expect(Number(payslip.eosbAccrual), payslip.employee.nameEn).toBeGreaterThan(0)
      expect(Number(payslip.netPay)).toBeGreaterThan(0)
    }

    // Draft: nothing has reached the ledger yet.
    expect(stored.status).toBe('DRAFT')
    expect((await trialBalanceTotals()).debit).toBe(before.debit)

    // Posting it balances.
    const posted = await asTenant((tx) =>
      postRun(tx, { tenantId: TENANT_ID, payrollRunId: run.payrollRunId }),
    )
    expect(posted.entryId).toBeTruthy()

    const entry = await db().journalEntry.findUniqueOrThrow({
      where: { id: posted.entryId },
      include: { lines: { include: { account: true } } },
    })
    expect(entry.totalDebit.toString()).toBe(entry.totalCredit.toString())

    // The net pay owed to staff, and both halves of GOSI as one liability.
    const accrued = entry.lines.find((line) => line.account.role === 'ACCRUED_SALARIES')!
    expect(money(accrued.credit.toString()).toFixed(2)).toBe(money(run.totalNet).toFixed(2))

    const gosi = entry.lines.find((line) => line.account.role === 'GOSI_PAYABLE')!
    expect(money(gosi.credit.toString()).toFixed(2)).toBe(
      money(stored.totalGosiEmployee.toString()).plus(money(stored.totalGosiEmployer.toString())).toFixed(2),
    )

    const after = await trialBalanceTotals()
    expect(after.debit).toBe(after.credit)

    // The bank file: one employer record, one per employee, and control totals that agree.
    const file = await asTenant((tx) => wpsFileFor(tx, { tenantId: TENANT_ID, payrollRunId: run.payrollRunId }))
    const rows = file.content.trimEnd().split('\r\n')

    expect(file.recordCount).toBe(5)
    expect(rows).toHaveLength(2 + 5) // header + employer + five employees
    expect(rows[1]).toContain('EMP')
    expect(rows[1].split(',')[6]).toBe('5')
    expect(rows[1].split(',')[7]).toBe(money(run.totalNet).toFixed(2))
    expect(file.filename).toMatch(/^WPS_\d+_\d{6}\.csv$/)

    // Every IBAN in the file passes the check the bank itself runs.
    for (const row of rows.slice(2)) {
      const iban = row.split(',').find((field) => field.startsWith('SA'))
      expect(isValidSaudiIban(iban ?? ''), row).toBe(true)
    }
  }, 120_000)

  it('refuses a second run for the same period and branch', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const year = new Date().getUTCFullYear()

    await expect(
      asTenant((tx) =>
        createRun(tx, {
          tenantId: TENANT_ID,
          branchId: branch.id,
          periodStart: new Date(Date.UTC(year, 2, 1)),
          periodEnd: new Date(Date.UTC(year, 2, 31)),
        }),
      ),
    ).rejects.toThrow(/already covers this period/)
  }, 60_000)

  it('refuses to post a run twice', async () => {
    const run = await db().payrollRun.findFirstOrThrow({ where: { tenantId: TENANT_ID, status: 'POSTED' } })
    await expect(
      asTenant((tx) => postRun(tx, { tenantId: TENANT_ID, payrollRunId: run.id })),
    ).rejects.toThrow(/already/)
  })

  it('accrues end of service onto the employee, so next month accrues only the movement', async () => {
    const employee = await db().employee.findFirstOrThrow({
      where: { tenantId: TENANT_ID, employeeNumber: 'EMP-001' },
    })
    expect(Number(employee.eosbAccrued)).toBeGreaterThan(0)
  })
})
