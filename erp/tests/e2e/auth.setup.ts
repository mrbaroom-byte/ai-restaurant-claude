import { test as setup } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { AUTH_DIR, USERS, signIn, statePath } from './helpers'

/**
 * Sign each role in once and save its cookies.
 *
 * Password hashing is deliberately slow, so signing in per test would spend most of the suite's
 * time on scrypt rather than on the application. This runs first and the specs reuse the state.
 */
mkdirSync(AUTH_DIR, { recursive: true })

for (const role of ['owner', 'cashier', 'auditor'] as const) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await signIn(page, USERS[role])
    await page.context().storageState({ path: statePath(role) })
  })
}
