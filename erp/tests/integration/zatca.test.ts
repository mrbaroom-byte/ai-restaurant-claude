import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TENANT_ID, asTenant, db, disconnect, reseed, trialBalanceTotals } from './setup'
import { signInvoice, submitInvoice } from '@/server/services/zatca'
import { createCreditNote, createDraft, postInvoice } from '@/server/services/invoice'
import { closeSession, openSession, syncSales } from '@/server/services/pos'
import { assertChainContinuity } from '@/lib/zatca/hash'
import { describeQr } from '@/lib/zatca/tlv'
import { money } from '@/lib/money'
import { randomUUID } from 'node:crypto'

beforeAll(() => reseed(), 180_000)
afterAll(() => disconnect())

async function jeddah() {
  const branch = await db().branch.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'JED' } })
  const warehouse = await db().warehouse.findFirstOrThrow({ where: { tenantId: TENANT_ID, branchId: branch.id } })
  return { branch, warehouse }
}

describe('signing a posted invoice', () => {
  it('produces the XML, hash and QR, and closes the chain link', async () => {
    const invoice = await db().invoice.findFirstOrThrow({
      where: { tenantId: TENANT_ID, status: { not: 'DRAFT' }, documentType: 'TAX_INVOICE' },
    })

    const signed = await asTenant((tx) => signInvoice(tx, TENANT_ID, invoice.id))

    expect(signed.xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')
    expect(signed.xml).toContain(invoice.number!)
    expect(signed.xml).toContain('<ds:X509Certificate>')
    expect(signed.submissionMode).toBe('CLEARANCE')

    // The QR carries what the customer's scanner will read off the printed invoice.
    const qr = describeQr(signed.qrBase64)
    expect(qr.vatNumber).toBe('300000000000003')
    expect(qr.invoiceTotal).toBe(money(invoice.payableTotal.toString()).toFixed(2))
    expect(qr.vatTotal).toBe(money(invoice.vatTotal.toString()).toFixed(2))
    expect(qr.invoiceHash).toBe(signed.invoiceHash)
    // A standard invoice carries tag 9; a simplified one does not.
    expect(qr.certificateSignature).toBeTruthy()

    const stored = await db().invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(stored.invoiceHash).toBe(signed.invoiceHash)
    expect(stored.qrBase64).toBe(signed.qrBase64)

    // The certificate now carries this hash, so the next invoice chains onto it.
    const certificate = await db().zatcaCertificate.findFirstOrThrow({ where: { tenantId: TENANT_ID } })
    expect(certificate.lastInvoiceHash).toBe(signed.invoiceHash)
  })
})

describe('the ZATCA chain across many invoices', () => {
  it('increments the counter and links each hash to the one before', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })

    // Stock the item so the issues succeed.
    const { moveStock } = await import('@/server/services/inventory')
    await asTenant((tx) =>
      moveStock(tx, {
        tenantId: TENANT_ID, itemId: item.id, warehouseId: warehouse.id, kind: 'RECEIPT',
        date: new Date(), quantity: '500', unitCost: '1.20', source: 'OPENING',
      }),
    )

    for (let i = 0; i < 4; i += 1) {
      await asTenant(async (tx) => {
        const draft = await createDraft(tx, {
          tenantId: TENANT_ID, branchId: branch.id, kind: 'SIMPLIFIED', date: new Date(),
          lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '2', unitPrice: '3.00', warehouseId: warehouse.id }],
        })
        const posted = await postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
        await signInvoice(tx, TENANT_ID, posted.invoiceId)
      })
    }

    const invoices = await db().invoice.findMany({
      where: { tenantId: TENANT_ID, icv: { not: null } },
      orderBy: { icv: 'asc' },
    })

    expect(invoices.length).toBeGreaterThanOrEqual(5)
    assertChainContinuity(
      invoices.map((i) => ({ icv: i.icv!, pih: i.pih!, invoiceHash: i.invoiceHash! })),
    )
  }, 60_000)
})

describe('submission', () => {
  const clearedResponse = {
    clearanceStatus: 'CLEARED',
    clearedInvoice: Buffer.from('<Invoice>cleared</Invoice>').toString('base64'),
    validationResults: { status: 'PASS', warningMessages: [{ code: 'BR-KSA-01', message: 'a harmless warning' }], errorMessages: [] },
  }

  it('records a clearance and stores ZATCA\'s own copy of the invoice', async () => {
    const invoice = await db().invoice.findFirstOrThrow({
      where: { tenantId: TENANT_ID, documentType: 'TAX_INVOICE', invoiceHash: { not: null } },
    })
    const submission = await db().zatcaSubmission.findFirstOrThrow({ where: { invoiceId: invoice.id } })

    const outcome = await asTenant((tx) =>
      submitInvoice(tx, TENANT_ID, submission.id, {
        fetchImpl: async () => new Response(JSON.stringify(clearedResponse), { status: 200 }),
      }),
    )

    expect(outcome.status).toBe('CLEARED')
    // Warnings are surfaced, not swallowed.
    expect(outcome.warnings).toHaveLength(1)

    const stored = await db().zatcaSubmission.findUniqueOrThrow({ where: { id: submission.id } })
    expect(stored.status).toBe('CLEARED')
    expect(stored.responseBody).toBeTruthy()

    const updated = await db().invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(updated.clearedXml).toContain('cleared')
  })

  it('marks a validation rejection terminal and keeps ZATCA\'s error text', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })

    const posted = await asTenant(async (tx) => {
      const draft = await createDraft(tx, {
        tenantId: TENANT_ID, branchId: branch.id, kind: 'SIMPLIFIED', date: new Date(),
        lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '1', unitPrice: '3.00', warehouseId: warehouse.id }],
      })
      return postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    })

    const outcome = await asTenant((tx) =>
      submitInvoice(tx, TENANT_ID, posted.submissionId, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              validationResults: {
                status: 'ERROR',
                errorMessages: [{ code: 'BR-KSA-16', message: 'The invoice hash does not match the invoice.' }],
              },
            }),
            { status: 400 },
          ),
      }),
    )

    expect(outcome.status).toBe('REJECTED')
    const stored = await db().zatcaSubmission.findUniqueOrThrow({ where: { id: posted.submissionId } })
    expect(stored.status).toBe('REJECTED')
    // Terminal: no retry is scheduled, because retrying a rejection hides the problem.
    expect(stored.nextAttemptAt).toBeNull()
    expect(JSON.stringify(stored.errors)).toContain('BR-KSA-16')
  })

  it('schedules a retry for a server failure rather than giving up', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })

    const posted = await asTenant(async (tx) => {
      const draft = await createDraft(tx, {
        tenantId: TENANT_ID, branchId: branch.id, kind: 'SIMPLIFIED', date: new Date(),
        lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '1', unitPrice: '3.00', warehouseId: warehouse.id }],
      })
      return postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    })

    const outcome = await asTenant((tx) =>
      submitInvoice(tx, TENANT_ID, posted.submissionId, {
        fetchImpl: async () => new Response('gateway timeout', { status: 504 }),
      }),
    )

    expect(outcome.status).toBe('PENDING')
    expect(outcome.retryAt).toBeInstanceOf(Date)
    const stored = await db().zatcaSubmission.findUniqueOrThrow({ where: { id: posted.submissionId } })
    expect(stored.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now())
    expect(stored.attempt).toBe(1)
  })
})

describe('credit note', () => {
  it('reverses the ledger, the VAT and the stock, and leaves the books balanced', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })

    // Stock the item here rather than leaning on another test's side effects.
    const { moveStock } = await import('@/server/services/inventory')
    await asTenant((tx) =>
      moveStock(tx, {
        tenantId: TENANT_ID, itemId: item.id, warehouseId: warehouse.id, kind: 'RECEIPT',
        date: new Date(), quantity: '100', unitCost: '1.20', source: 'OPENING',
      }),
    )

    const before = await trialBalanceTotals()
    const balanceBefore = await db().stockBalance.findFirstOrThrow({
      where: { itemId: item.id, warehouseId: warehouse.id },
    })
    const arBefore = await accountBalance('1130')
    const vatBefore = await accountBalance('2120')

    const posted = await asTenant(async (tx) => {
      const draft = await createDraft(tx, {
        tenantId: TENANT_ID, branchId: branch.id, kind: 'STANDARD', date: new Date(),
        partyId: (await db().party.findFirstOrThrow({ where: { tenantId: TENANT_ID, code: 'CUS-0001' } })).id,
        lines: [{ itemId: item.id, descriptionEn: 'Mineral water', quantity: '10', unitPrice: '3.00', warehouseId: warehouse.id }],
      })
      return postInvoice(tx, { tenantId: TENANT_ID, invoiceId: draft.id })
    })

    expect((await accountBalance('1130')).greaterThan(arBefore)).toBe(true)

    await asTenant((tx) =>
      createCreditNote(tx, {
        tenantId: TENANT_ID,
        invoiceId: posted.invoiceId,
        date: new Date(),
        reason: 'إرجاع البضاعة',
      }),
    )

    // Every account the invoice touched is back where it was.
    expect((await accountBalance('1130')).toFixed(4)).toBe(arBefore.toFixed(4))
    expect((await accountBalance('2120')).toFixed(4)).toBe(vatBefore.toFixed(4))

    const balanceAfter = await db().stockBalance.findFirstOrThrow({
      where: { itemId: item.id, warehouseId: warehouse.id },
    })
    expect(balanceAfter.quantity.toString()).toBe(balanceBefore.quantity.toString())
    expect(balanceAfter.value.toString()).toBe(balanceBefore.value.toString())

    const after = await trialBalanceTotals()
    expect(after.debit).toBe(after.credit)
    expect(money(after.debit).greaterThan(money(before.debit))).toBe(true)
  }, 60_000)

  it('refuses to credit more than the invoice carried', async () => {
    const invoice = await db().invoice.findFirstOrThrow({
      where: { tenantId: TENANT_ID, documentType: 'TAX_INVOICE', status: { not: 'DRAFT' } },
      include: { lines: true },
    })

    await expect(
      asTenant((tx) =>
        createCreditNote(tx, {
          tenantId: TENANT_ID,
          invoiceId: invoice.id,
          date: new Date(),
          reason: 'test',
          lines: [{ invoiceLineId: invoice.lines[0].id, quantity: '99999' }],
        }),
      ),
    ).rejects.toThrow(/Cannot credit/)
  })

  it('refuses a credit note with no reason, because ZATCA requires one', async () => {
    const invoice = await db().invoice.findFirstOrThrow({
      where: { tenantId: TENANT_ID, documentType: 'TAX_INVOICE', status: { not: 'DRAFT' } },
    })
    await expect(
      asTenant((tx) => createCreditNote(tx, { tenantId: TENANT_ID, invoiceId: invoice.id, date: new Date(), reason: '  ' })),
    ).rejects.toThrow(/reason/)
  })
})

describe('POS offline replay', () => {
  it('posts a replayed batch exactly once', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })
    const cashier = await db().user.findFirstOrThrow({ where: { tenantId: TENANT_ID, role: 'CASHIER' } })

    const session = await asTenant((tx) =>
      openSession(tx, {
        tenantId: TENANT_ID, branchId: branch.id, userId: cashier.id,
        terminalCode: 'TILL-1', openingFloat: '500',
      }),
    )

    const sales = [
      { idempotencyKey: randomUUID(), soldAt: new Date(), tenders: [{ method: 'CASH' as const, amount: '6.00' }], lines: [{ itemId: item.id, quantity: '2', unitPrice: '3.00' }] },
      { idempotencyKey: randomUUID(), soldAt: new Date(), tenders: [{ method: 'MADA' as const, amount: '9.00' }], lines: [{ itemId: item.id, quantity: '3', unitPrice: '3.00' }] },
    ]

    const run = <T>(work: Parameters<typeof asTenant<T>>[0]) => asTenant(work)

    const first = await syncSales(run, {
      tenantId: TENANT_ID, sessionId: session.id, warehouseId: warehouse.id, userId: cashier.id, sales,
    })
    expect(first.map((r) => r.status)).toEqual(['CREATED', 'CREATED'])

    // The till lost the response and replays the same batch.
    const replay = await syncSales(run, {
      tenantId: TENANT_ID, sessionId: session.id, warehouseId: warehouse.id, userId: cashier.id, sales,
    })
    expect(replay.map((r) => r.status)).toEqual(['DUPLICATE', 'DUPLICATE'])
    expect(replay[0].invoiceNumber).toBe(first[0].invoiceNumber)

    // Exactly two sales and two invoices exist, not four.
    const posSales = await db().posSale.count({ where: { tenantId: TENANT_ID, sessionId: session.id } })
    expect(posSales).toBe(2)
    const invoiceCount = await db().invoice.count({
      where: { tenantId: TENANT_ID, posSaleId: { not: null } },
    })
    expect(invoiceCount).toBe(2)

    // Both are queued for ZATCA reporting, once each.
    for (const result of first) {
      const submissions = await db().zatcaSubmission.count({ where: { invoiceId: result.invoiceId! } })
      expect(submissions).toBe(1)
    }

    const totals = await trialBalanceTotals()
    expect(totals.debit).toBe(totals.credit)
  }, 60_000)

  it('re-prices a stale offline sale and records the conflict', async () => {
    const { branch, warehouse } = await jeddah()
    const item = await db().item.findFirstOrThrow({ where: { tenantId: TENANT_ID, sku: 'MENU-WATER' } })
    const cashier = await db().user.findFirstOrThrow({ where: { tenantId: TENANT_ID, role: 'CASHIER' } })

    const session = await asTenant((tx) =>
      openSession(tx, {
        tenantId: TENANT_ID, branchId: branch.id, userId: cashier.id,
        terminalCode: 'TILL-2', openingFloat: '200',
      }),
    )

    const results = await syncSales(<T,>(work: Parameters<typeof asTenant<T>>[0]) => asTenant(work), {
      tenantId: TENANT_ID, sessionId: session.id, warehouseId: warehouse.id, userId: cashier.id,
      sales: [
        {
          idempotencyKey: randomUUID(),
          soldAt: new Date(),
          tenders: [{ method: 'CASH', amount: '2.50' }],
          // The till was offline through a price rise and still thinks water is 2.50.
          lines: [{ itemId: item.id, quantity: '1', unitPrice: '2.50' }],
        },
      ],
    })

    expect(results[0].status).toBe('CREATED')
    expect(results[0].conflictNote).toMatch(/the till had 2\.50, the price list has 3\.00/)

    const invoice = await db().invoice.findUniqueOrThrow({ where: { id: results[0].invoiceId! } })
    // Server price wins: 3.00 inclusive of VAT.
    expect(money(invoice.payableTotal.toString()).toFixed(2)).toBe('3.00')
  }, 60_000)

  it('posts the till variance when the session is closed', async () => {
    const { branch } = await jeddah()
    const cashier = await db().user.findFirstOrThrow({ where: { tenantId: TENANT_ID, role: 'CASHIER' } })

    const session = await asTenant((tx) =>
      openSession(tx, {
        tenantId: TENANT_ID, branchId: branch.id, userId: cashier.id,
        terminalCode: 'TILL-3', openingFloat: '300',
      }),
    )

    const closed = await asTenant((tx) =>
      closeSession(tx, { tenantId: TENANT_ID, sessionId: session.id, countedCash: '295', userId: cashier.id }),
    )

    expect(closed.status).toBe('CLOSED')
    expect(money(closed.variance!.toString()).toFixed(2)).toBe('-5.00')
    expect(closed.entryId).toBeTruthy()

    const totals = await trialBalanceTotals()
    expect(totals.debit).toBe(totals.credit)
  })

  it('refuses to open a second session on the same till', async () => {
    const { branch } = await jeddah()
    const cashier = await db().user.findFirstOrThrow({ where: { tenantId: TENANT_ID, role: 'CASHIER' } })

    await asTenant((tx) =>
      openSession(tx, { tenantId: TENANT_ID, branchId: branch.id, userId: cashier.id, terminalCode: 'TILL-9', openingFloat: '100' }),
    )
    await expect(
      asTenant((tx) =>
        openSession(tx, { tenantId: TENANT_ID, branchId: branch.id, userId: cashier.id, terminalCode: 'TILL-9', openingFloat: '100' }),
      ),
    ).rejects.toThrow(/already has an open session/)
  })
})

async function accountBalance(code: string) {
  const account = await db().account.findFirstOrThrow({ where: { tenantId: TENANT_ID, code } })
  const totals = await db().journalLine.aggregate({
    where: { tenantId: TENANT_ID, accountId: account.id },
    _sum: { debit: true, credit: true },
  })
  return money(totals._sum.debit?.toString() ?? 0).minus(money(totals._sum.credit?.toString() ?? 0))
}
