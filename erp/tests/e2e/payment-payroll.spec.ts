import { expect, test } from '@playwright/test'
import { blockExternalRequests, statePath } from './helpers'

/**
 * The two acceptance criteria that end in a person clicking something: money arriving against
 * an invoice, and a payroll run that produces a file for the bank.
 */
test.describe('recording money against an invoice', () => {
  test.use({ storageState: statePath('owner') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('settles the invoice and the books still balance', async ({ page }) => {
    // Raise an invoice for this test to settle.
    const [branches, items, parties] = await Promise.all([
      page.request.get('/api/v1/branches').then((r) => r.json()),
      page.request.get('/api/v1/items?q=SVC-CATERING').then((r) => r.json()),
      page.request.get('/api/v1/parties?role=customer').then((r) => r.json()),
    ])
    const item = items.data.find((i: { sku: string }) => i.sku === 'SVC-CATERING')
    const customer = parties.data.find((p: { vatNumber: string | null }) => p.vatNumber)

    const draft = await (
      await page.request.post('/api/v1/invoices', {
        data: {
          branchId: branches.data[0].id,
          partyId: customer.id,
          kind: 'STANDARD',
          date: new Date().toISOString(),
          lines: [
            {
              itemId: item.id,
              descriptionEn: 'Event catering service',
              quantity: '2',
              unitPrice: item.sellingPrice,
            },
          ],
        },
      })
    ).json()
    const invoice = await (await page.request.post(`/api/v1/invoices/${draft.id}/post`)).json()

    const before = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(before.balanced).toBe(true)

    await page.goto(`/invoices/${invoice.id}`)
    await page.locator('#main').waitFor({ state: 'visible' })

    // The control is offered because there is something outstanding.
    await page.getByRole('button', { name: 'تسجيل سند قبض' }).click()

    // The outstanding amount is pre-filled, because that is what is usually paid.
    await expect(page.locator('#paymentAmount')).toHaveValue(Number(invoice.payableTotal).toFixed(2))
    await page.locator('form:has(#paymentAmount) button[type="submit"]').click()

    // The invoice reads as settled and the payment control is gone: nothing is left to pay.
    await expect(page.getByText('مسددة', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'تسجيل سند قبض' })).toHaveCount(0)

    const settled = await (await page.request.get(`/api/v1/invoices/${invoice.id}`)).json()
    expect(settled.status).toBe('SETTLED')

    const after = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(after.balanced).toBe(true)
  })
})

test.describe('running payroll', () => {
  test.use({ storageState: statePath('owner') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('calculates, posts, and produces a WPS file the bank will take', async ({ page }) => {
    await page.goto('/payroll')
    await page.locator('#main').waitFor({ state: 'visible' })

    // A payroll run is one per branch per month by design, so the test picks a month that has
    // none rather than a fixed one — otherwise the second browser project would collide with
    // the run the first one made.
    const existing = await (await page.request.get('/api/v1/payroll/runs')).json()
    const taken = new Set<string>(existing.data.map((run: { periodStart: string }) => run.periodStart.slice(0, 7)))
    const year = new Date().getUTCFullYear()
    const period = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).find(
      (candidate) => !taken.has(candidate),
    )
    expect(period, 'every month of the year already has a payroll run').toBeTruthy()

    await page.fill('#period', period!)
    await page.getByRole('button', { name: 'احتساب' }).click()

    await expect(page.getByRole('status')).toContainText('5', { timeout: 20_000 })

    // Draft first: nothing in the ledger until somebody posts it.
    const runs = await (await page.request.get('/api/v1/payroll/runs')).json()
    const run = runs.data.find((r: { periodStart: string }) => r.periodStart.startsWith(period!))
    expect(run).toBeTruthy()
    expect(run.status).toBe('DRAFT')
    expect(run.employees).toBe(5)
    expect(Number(run.gosi)).toBeGreaterThan(0)
    expect(Number(run.eosbAccrual)).toBeGreaterThan(0)
    // The rates the run used are stamped on it.
    expect(run.ratesUsed.saudiEmployee).toBe('0.0975')

    // The WPS file is available before posting — the bank pays on the calculation, and the
    // ledger entry is the accountant's business.
    const wps = await page.request.get(`/api/v1/payroll/runs/${run.id}/wps`)
    expect(wps.status()).toBe(200)
    expect(wps.headers()['content-disposition']).toContain('WPS_')

    const rows = (await wps.text()).trimEnd().split('\r\n')
    expect(rows).toHaveLength(7) // column header, employer record, five employees
    expect(rows[1]).toContain('EMP')
    expect(rows[1].split(',')[6]).toBe('5')
    expect(rows[1].split(',')[7]).toBe(Number(run.totalNet).toFixed(2))

    // Post it, and the books still balance.
    const posted = await page.request.post(`/api/v1/payroll/runs/${run.id}/post`)
    expect(posted.status()).toBe(200)

    const trialBalance = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(trialBalance.balanced).toBe(true)

    // And it cannot be posted twice.
    const again = await page.request.post(`/api/v1/payroll/runs/${run.id}/post`)
    expect(again.status()).toBe(409)
  })
})
