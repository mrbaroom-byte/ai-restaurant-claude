import { expect, test } from '@playwright/test'
import { blockExternalRequests, expectNoHorizontalPageScroll, findClippedText, statePath } from './helpers'

/**
 * The acceptance criterion: switching to Arabic flips the layout to RTL with no clipped text
 * on any screen at 1280px and 390px.
 */

const SCREENS = [
  { path: '/', name: 'dashboard' },
  { path: '/invoices', name: 'invoices' },
  { path: '/items', name: 'items' },
  { path: '/stock', name: 'stock' },
  { path: '/parties?role=customer', name: 'customers' },
  { path: '/bills', name: 'bills' },
  { path: '/journal', name: 'journal' },
  { path: '/accounts', name: 'chart of accounts' },
  { path: '/periods', name: 'fiscal periods' },
  { path: '/employees', name: 'employees' },
  { path: '/payroll', name: 'payroll' },
  { path: '/settings/users', name: 'users' },
  { path: '/settings/audit', name: 'audit log' },
  { path: '/reports/trial-balance', name: 'trial balance' },
  { path: '/reports/profit-loss', name: 'profit and loss' },
  { path: '/reports/balance-sheet', name: 'balance sheet' },
  { path: '/reports/vat-return', name: 'VAT return' },
  { path: '/reports/aging', name: 'aging' },
  { path: '/settings/zatca', name: 'ZATCA settings' },
]

test.describe('Arabic layout', () => {
  test.use({ storageState: statePath('owner') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('the document direction is right to left', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  })

  for (const screen of SCREENS) {
    test(`${screen.name} renders with no clipped text`, async ({ page }) => {
      await page.goto(screen.path)
      await page.locator('#main').waitFor({ state: 'visible' })

      const clipped = await findClippedText(page)
      expect(clipped, `clipped on ${screen.path}: ${clipped.join(' | ')}`).toEqual([])

      await expectNoHorizontalPageScroll(page)
    })
  }

  test('switching to English flips the layout back', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    const clipped = await findClippedText(page)
    expect(clipped, clipped.join(' | ')).toEqual([])
  })

  test('figures stay left-to-right inside a right-to-left page', async ({ page }) => {
    await page.goto('/reports/trial-balance')
    await page.locator('#main').waitFor({ state: 'visible' })

    // The page is RTL, but a number read right to left is a different number, so every
    // figure resolves to LTR — by the .num class, by an explicit attribute, or both.
    const directions = await page.locator('.num').evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).direction),
    )
    expect(directions.length).toBeGreaterThan(0)
    expect(directions.every((direction) => direction === 'ltr')).toBe(true)

    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl')
  })
})
