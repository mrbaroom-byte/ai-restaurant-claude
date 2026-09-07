import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against a built application and a seeded database, because what they
 * are checking — that Arabic lays out right to left without clipping, that a cashier cannot
 * open the accounting screens — only exists once the whole stack is running.
 */
/**
 * Some environments ship a Chromium at a fixed path rather than in Playwright's own cache.
 * PLAYWRIGHT_CHROMIUM_PATH points at it; otherwise Playwright resolves its own download.
 */
const launchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  // A browser that phones home for autofill, sync and component updates makes the suite
  // depend on the network reaching Google. It must depend only on the application.
  args: [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate',
    // The application under test is on localhost. Sending its traffic through an ambient
    // corporate proxy makes the suite fail for reasons that have nothing to do with the code.
    '--no-proxy-server',
  ],
}

export default defineConfig({
  testDir: './tests/e2e',
  // Seeds the database, so a re-run starts from the same state the first run did.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar-SA',
  },

  projects: [
    // Signs each role in once; the specs reuse the saved cookies rather than paying for
    // scrypt on every test.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { launchOptions } },

    // The two widths the acceptance criteria name: a desktop and a phone.
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, launchOptions },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx next start -p 3210',
        url: 'http://127.0.0.1:3210/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
