import { execFileSync } from 'node:child_process'

/**
 * Reseed before the suite runs.
 *
 * The tests issue credit notes and enrol two-factor authentication, so a second run against the
 * state the first left behind would be testing something different. Seeding here makes
 * `npm run test:e2e` mean the same thing every time, on a laptop and in CI.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_SEED === '1') return
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'pipe', env: process.env })
}
