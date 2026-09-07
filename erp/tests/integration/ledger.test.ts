import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TENANT_ID, asTenant, db, disconnect, reseed, trialBalanceTotals } from './setup'
import { post } from '@/server/services/posting'
import { allocateNumber } from '@/server/services/sequence'
import { buildSalesInvoicePosting } from '@/lib/accounting/documents'
import { computeDocument } from '@/lib/tax/vat'
import { money } from '@/lib/money'

beforeAll(() => reseed(), 180_000)
afterAll(() => disconnect())

describe('the seeded books', () => {
  it('balance to the halala', async () => {
    const totals = await trialBalanceTotals()
    expect(totals.debit).toBe(totals.credit)
    expect(money(totals.debit).greaterThan(0)).toBe(true)
  })

  it('have a journal entry behind every posted invoice', async () => {
    const invoices = await db().invoice.findMany({ where: { tenantId: TENANT_ID, status: { not: 'DRAFT' } } })
    expect(invoices.length).toBeGreaterThan(0)
    for (const invoice of invoices) {
      expect(invoice.entryId, `${invoice.number} has no journal entry`).toBeTruthy()
      expect(invoice.icv, `${invoice.number} has no ZATCA counter value`).toBeGreaterThan(0)
      expect(invoice.pih, `${invoice.number} has no previous invoice hash`).toBeTruthy()
    }
  })

  it('keep the stock balance equal to the sum of its movements', async () => {
    const balances = await db().stockBalance.findMany({ where: { tenantId: TENANT_ID } })
    expect(balances.length).toBeGreaterThan(0)

    for (const balance of balances) {
      const movements = await db().stockMovement.findMany({
        where: { tenantId: TENANT_ID, itemId: balance.itemId, warehouseId: balance.warehouseId },
      })
      const net = movements.reduce((acc, m) => {
        const signed = ['RECEIPT', 'TRANSFER_IN', 'OPENING'].includes(m.kind) ? 1 : -1
        return acc.plus(money(m.quantity.toString()).times(signed))
      }, money(0))
      expect(net.toFixed(6), `item ${balance.itemId}`).toBe(money(balance.quantity.toString()).toFixed(6))
    }
  })
})

describe('the posting service', () => {
  it('refuses an unbalanced request before the database ever sees it', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    await expect(
      asTenant((tx) =>
        post(tx, {
          tenantId: TENANT_ID,
          branchId: branch.id,
          date: new Date(),
          source: 'MANUAL',
          lines: [
            { role: 'BANK', debit: '100' },
            { role: 'SALES_REVENUE', credit: '90' },
          ],
        }),
      ),
    ).rejects.toThrow(/does not balance/)
  })

  it('refuses a role with no account mapped, naming the role', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    // Unmap the suspense account, then try to post to it.
    await db().account.updateMany({ where: { tenantId: TENANT_ID, role: 'SUSPENSE' }, data: { role: null } })
    try {
      await expect(
        asTenant((tx) =>
          post(tx, {
            tenantId: TENANT_ID,
            branchId: branch.id,
            date: new Date(),
            source: 'MANUAL',
            lines: [
              { role: 'SUSPENSE', debit: '10' },
              { role: 'BANK', credit: '10' },
            ],
          }),
        ),
      ).rejects.toThrow(/SUSPENSE/)
    } finally {
      await db().account.updateMany({ where: { tenantId: TENANT_ID, code: '7900' }, data: { role: 'SUSPENSE' } })
    }
  })

  it('leaves the books balanced after a real posting', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const totals = computeDocument({ lines: [{ quantity: 1, unitPrice: '1000', vatCategory: 'STANDARD' }] })

    await asTenant((tx) =>
      post(tx, buildSalesInvoicePosting({
        context: { tenantId: TENANT_ID, branchId: branch.id, date: new Date(), reference: 'TEST-1' },
        totals,
      })),
    )

    const after = await trialBalanceTotals()
    expect(after.debit).toBe(after.credit)
  })

  it('refuses to post into a closed period, naming it', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
    const year = new Date().getUTCFullYear()
    const januaryStart = new Date(Date.UTC(year, 0, 1))

    await db().fiscalPeriod.updateMany({
      where: { tenantId: TENANT_ID, startsOn: januaryStart },
      data: { status: 'CLOSED', closedAt: new Date() },
    })

    try {
      await expect(
        asTenant((tx) =>
          post(tx, {
            tenantId: TENANT_ID,
            branchId: branch.id,
            date: new Date(Date.UTC(year, 0, 15)),
            source: 'MANUAL',
            lines: [
              { role: 'BANK', debit: '10' },
              { role: 'SALES_REVENUE', credit: '10' },
            ],
          }),
        ),
      ).rejects.toThrow(/is closed/i)
    } finally {
      await db().fiscalPeriod.updateMany({
        where: { tenantId: TENANT_ID, startsOn: januaryStart },
        data: { status: 'OPEN', closedAt: null },
      })
    }
  })
})

describe('gap-free numbering', () => {
  it('issues consecutive numbers under concurrency', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'RUH' } })
    const date = new Date()

    // Ten transactions racing for the same counter. The row lock serialises them.
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () =>
        asTenant((tx) =>
          allocateNumber(tx, { tenantId: TENANT_ID, branchId: branch.id, kind: 'INVOICE', date, branchCode: branch.code }),
        ),
      ),
    )

    const counters = numbers.map((n) => Number(n.split('-').at(-1))).sort((a, b) => a - b)
    expect(new Set(counters).size).toBe(10)
    for (let i = 1; i < counters.length; i += 1) {
      expect(counters[i]).toBe(counters[i - 1] + 1)
    }
  }, 60_000)

  it('releases the number when the transaction rolls back, so no gap appears', async () => {
    const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'RUH' } })
    const date = new Date()

    const before = await db().sequence.findFirstOrThrow({
      where: { tenantId: TENANT_ID, branchId: branch.id, kind: 'CREDIT_NOTE' },
    })

    await expect(
      asTenant(async (tx) => {
        await allocateNumber(tx, { tenantId: TENANT_ID, branchId: branch.id, kind: 'CREDIT_NOTE', date, branchCode: branch.code })
        throw new Error('deliberate failure after allocating')
      }),
    ).rejects.toThrow(/deliberate failure/)

    const after = await db().sequence.findFirstOrThrow({
      where: { tenantId: TENANT_ID, branchId: branch.id, kind: 'CREDIT_NOTE' },
    })
    expect(after.lastNumber).toBe(before.lastNumber)
  })
})
