import { expect, type Page } from '@playwright/test'
import { currentCounter, generateTotp } from '../../src/lib/crypto/totp'

/**
 * Block every request that leaves the application's origin.
 *
 * The pages are self-contained by design — no CDN, no web font, no analytics — so anything
 * outbound is either the browser phoning home or a regression, and either way the suite
 * should not wait on it.
 */
export async function blockExternalRequests(page: Page): Promise<void> {
  const origin = new URL(page.context().browser()?.version() ? 'http://127.0.0.1:3210' : 'http://127.0.0.1:3210')
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === origin.hostname || url.hostname === 'localhost') return route.continue()
    return route.abort()
  })
}

import { join } from 'node:path'

export const DEMO_PASSWORD = 'NakhlaDemo2026!'

export const AUTH_DIR = join(__dirname, '.auth')

/** Where the setup project saves each role's cookies. */
export const statePath = (role: keyof typeof USERS) => join(AUTH_DIR, `${role}.json`)

export const USERS = {
  owner: 'owner@nakhla.sa',
  manager: 'manager.jed@nakhla.sa',
  accountant: 'accountant@nakhla.sa',
  cashier: 'cashier@nakhla.sa',
  auditor: 'auditor@nakhla.sa',
  sales: 'sales@nakhla.sa',
} as const

/**
 * Sign in, completing two-factor enrolment when the role requires it.
 *
 * Owner and Accountant must carry a second factor, and a fresh tenant has not enrolled one, so
 * the first sign-in lands on the enrolment screen. Reading the secret off that screen and
 * answering with a real TOTP code exercises the flow a new owner actually goes through.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await blockExternalRequests(page)
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', DEMO_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })

  if (new URL(page.url()).pathname.startsWith('/settings/security')) {
    const secret = (await page.locator('code').first().innerText()).trim()
    await page.fill('#code', generateTotp(secret, currentCounter()))
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.startsWith('/settings/security'), { timeout: 30_000 })
  }

  await page.locator('#main').waitFor({ state: 'visible' })
}

/** Sign in and then supply the TOTP code, for a user who has already enrolled. */
export async function signInWithCode(page: Page, email: string, secret: string): Promise<void> {
  await blockExternalRequests(page)
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', DEMO_PASSWORD)
  await page.click('button[type="submit"]')

  await page.locator('#totpCode').waitFor({ state: 'visible' })
  await page.fill('#totpCode', generateTotp(secret, currentCounter()))
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

export async function setLocale(page: Page, locale: 'ar' | 'en'): Promise<void> {
  await page.context().addCookies([
    { name: 'nakhla_locale', value: locale, url: page.url() || 'http://127.0.0.1:3210' },
  ])
}

/**
 * Find text that overflows its own box.
 *
 * A right-to-left layout built with physical properties clips at the start edge rather than
 * wrapping, and that clipping is invisible in a screenshot diff, so it is measured instead.
 */
export async function findClippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const clipped: string[] = []
    const elements = document.querySelectorAll<HTMLElement>('h1, h2, h3, p, td, th, a, button, label, span, dt, dd')

    for (const element of elements) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowX === 'auto') continue
      // Only leaf text nodes; a container is allowed to be larger than its own text.
      if (element.children.length > 0) continue

      const text = element.textContent?.trim() ?? ''
      if (!text) continue

      // A one-pixel allowance for sub-pixel rounding in the layout engine.
      if (element.scrollWidth > element.clientWidth + 1) {
        clipped.push(`${element.tagName.toLowerCase()}: "${text.slice(0, 60)}"`)
      }
    }
    return clipped
  })
}

/** The page itself must never scroll sideways; wide tables scroll inside their own container. */
export async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1)
}
