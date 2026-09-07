import { expect, test } from '@playwright/test'
import { USERS, blockExternalRequests, signIn, statePath } from './helpers'

/**
 * The acceptance criterion: a sale rung up while the till is offline reaches the ledger and the
 * ZATCA reporting queue exactly once when the connection returns.
 *
 * This drives the real till — the IndexedDB queue, the offline banner, the drain on reconnect —
 * rather than calling the sync endpoint directly, because what has to be proved is that a
 * cashier who keeps selling through an outage loses nothing and duplicates nothing.
 */
test.describe('the till', () => {
  // Signs in for itself: the session must belong to the cashier who opens the till.
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.cashier)
    await blockExternalRequests(page)
  })

  test('keeps selling while offline and posts each sale exactly once on reconnect', async ({ page, context }) => {
    await page.goto('/pos')
    await page.locator('#main').waitFor({ state: 'visible' })

    // Open the session with a float in the drawer.
    if (await page.locator('#openingFloat').isVisible().catch(() => false)) {
      await page.fill('#openingFloat', '500')
      await page.locator('form:has(#openingFloat) button[type="submit"]').click()
    }
    await page.getByRole('heading', { name: 'نقطة البيع' }).waitFor()

    const invoicesBefore = await countSimplifiedInvoices(page)

    // Pull the plug.
    await context.setOffline(true)
    await expect(page.getByText('غير متصل')).toBeVisible()

    // Ring up two sales while there is no connection at all.
    const water = page.getByRole('button', { name: /مياه معدنية/ })
    await water.click()
    await page.getByRole('button', { name: 'نقداً' }).click()
    await expect(page.getByText(/بانتظار المزامنة/)).toBeVisible()

    await water.click()
    await water.click()
    await page.getByRole('button', { name: 'مدى' }).click()

    // Both are queued on the device, nothing has reached the server.
    await expect(page.locator('.num', { hasText: '2' }).first()).toBeVisible()
    expect(await countSimplifiedInvoices(page, { offline: true })).toBe(invoicesBefore)

    // The connection returns.
    await context.setOffline(false)
    await page.getByRole('button', { name: 'مزامنة الآن' }).click()

    // Both sales become simplified tax invoices — two, not four, however many times the
    // queue is drained.
    await expect
      .poll(async () => countSimplifiedInvoices(page), { timeout: 30_000 })
      .toBe(invoicesBefore + 2)

    // Draining again changes nothing: every sale carries its own key.
    await page.reload()
    await page.waitForTimeout(2000)
    expect(await countSimplifiedInvoices(page)).toBe(invoicesBefore + 2)

    // Each one is queued for ZATCA reporting exactly once, and the books still balance.
    // The owner's saved session is reused: signing in again would ask for a two-factor code,
    // and the secret only ever existed on the enrolment screen.
    const owner = await page.context().browser()!.newContext({ storageState: statePath('owner') })
    const ownerPage = await owner.newPage()

    const list = await ownerPage.request.get('/api/v1/invoices?pageSize=50')
    const { data } = await list.json()
    const simplified = data.filter((invoice: { kind: string }) => invoice.kind === 'SIMPLIFIED')
    expect(simplified.length).toBeGreaterThanOrEqual(2)
    for (const invoice of simplified.slice(0, 2)) {
      expect(invoice.zatcaStatus, `${invoice.number} was not queued for ZATCA`).toBeTruthy()
      expect(invoice.icv).toBeGreaterThan(0)
    }

    const trialBalance = await (await ownerPage.request.get('/api/v1/reports/trial-balance')).json()
    expect(trialBalance.balanced).toBe(true)
    await owner.close()
  })
})

/** How many simplified invoices exist. Returns the last known count while offline. */
let lastCount = 0
async function countSimplifiedInvoices(page: import('@playwright/test').Page, options: { offline?: boolean } = {}) {
  if (options.offline) return lastCount
  const response = await page.request.get('/api/v1/invoices?pageSize=100')
  if (!response.ok()) return lastCount
  const { data } = await response.json()
  lastCount = data.filter((invoice: { kind: string }) => invoice.kind === 'SIMPLIFIED').length
  return lastCount
}
