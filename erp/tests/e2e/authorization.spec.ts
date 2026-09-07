import { expect, test } from '@playwright/test'
import { USERS, blockExternalRequests, signIn, statePath } from './helpers'

/**
 * The acceptance criterion: a cashier cannot reach any accounting endpoint, verified against a
 * running server rather than by checking that a menu item is hidden.
 */

const ACCOUNTING_PAGES = [
  '/reports/trial-balance',
  '/reports/profit-loss',
  '/reports/balance-sheet',
  '/reports/vat-return',
]

const ACCOUNTING_ENDPOINTS = [
  '/api/v1/reports/trial-balance',
  '/api/v1/reports/profit-loss',
  '/api/v1/reports/balance-sheet',
  '/api/v1/reports/vat-return?from=2026-01-01&to=2026-12-31',
]

test.describe('a cashier is shut out of accounting', () => {
  test.use({ storageState: statePath('cashier') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('the accounting section is not in the navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'ميزان المراجعة' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'قيود اليومية' })).toHaveCount(0)
  })

  for (const path of ACCOUNTING_ENDPOINTS) {
    test(`${path} returns 403`, async ({ page }) => {
      const response = await page.request.get(path)
      expect(response.status()).toBe(403)

      const body = await response.json()
      expect(body.error.code).toBe('FORBIDDEN')
      // The refusal names the permission, so a manager knows what to grant.
      expect(body.error.message).toContain('accounting.view')
    })
  }

  for (const path of ACCOUNTING_PAGES) {
    test(`${path} does not render the report`, async ({ page }) => {
      const response = await page.goto(path)
      // Whether it renders an error page or a server error, what must not happen is the
      // report rendering. The trial balance total is the tell.
      expect(await page.locator('tfoot').count()).toBe(0)
      expect(response?.status()).toBeGreaterThanOrEqual(400)
    })
  }

  test('the cashier can still do their own job', async ({ page }) => {
    await page.goto('/invoices')
    await expect(page.getByRole('heading', { name: 'الفواتير الضريبية' })).toBeVisible()

    const response = await page.request.get('/api/v1/invoices')
    expect(response.status()).toBe(200)
  })
})

test.describe('an auditor can read but not write', () => {
  test.use({ storageState: statePath('auditor') })

  test('creating an invoice is refused', async ({ page }) => {
    const response = await page.request.post('/api/v1/invoices', {
      data: { branchId: '00000000-0000-0000-0000-000000000000', kind: 'SIMPLIFIED', date: '2026-03-15', lines: [] },
    })
    expect(response.status()).toBe(403)
  })

  test('reading the trial balance is allowed', async ({ page }) => {
    const response = await page.request.get('/api/v1/reports/trial-balance')
    expect(response.status()).toBe(200)
    expect((await response.json()).balanced).toBe(true)
  })
})

test.describe('signing out', () => {
  test('ends the session', async ({ page }) => {
    // Signs in for itself: this test consumes the session it creates.
    await signIn(page, USERS.cashier)
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click()
    await page.waitForURL('**/login')

    const response = await page.request.get('/api/v1/invoices')
    expect(response.status()).toBe(401)
  })
})
