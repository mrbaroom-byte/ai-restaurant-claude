/**
 * The API's permission guards must match the published contract.
 *
 * A route whose `authorize(...)` call drifts from the permission documented in ENDPOINTS is a
 * silent privilege change, so it is checked here rather than trusted to review.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@/lib/api/contract'
import { ROLE_PERMISSIONS, type Permission, type RoleName, can } from '@/lib/rbac'

const ROOT = join(__dirname, '../..')

/** Contract path → the route file Next.js would serve it from. */
function routeFile(path: string): string {
  const segments = path
    .replace(/^\//, '')
    .split('/')
    .map((segment) => (segment.startsWith('{') ? `[${segment.slice(1, -1)}]` : segment))
  return join(ROOT, 'src/app', ...segments, 'route.ts')
}

describe('every documented endpoint exists', () => {
  it.each(ENDPOINTS.map((e) => [e.method, e.path] as const))('%s %s', (_method, path) => {
    expect(existsSync(routeFile(path)), `no route handler at ${routeFile(path)}`).toBe(true)
  })
})

describe('every route guards with the permission it documents', () => {
  const guarded = ENDPOINTS.filter((e) => e.permission !== null)

  it.each(guarded.map((e) => [e.method, e.path, e.permission] as const))(
    '%s %s requires %s',
    (method, path, permission) => {
      const source = readFileSync(routeFile(path), 'utf8')
      const handler = source.slice(source.indexOf(`export async function ${method}(`))
      expect(handler, `${method} ${path} has no handler`).not.toBe('')
      expect(handler).toContain(`authorize('${permission}')`)
    },
  )

  it('leaves no guarded route calling authorize(null)', () => {
    for (const endpoint of guarded) {
      const source = readFileSync(routeFile(endpoint.path), 'utf8')
      expect(source, `${endpoint.path}`).not.toContain('authorize(null)')
    }
  })
})

describe('a cashier is shut out of every accounting endpoint', () => {
  const cashier = { userId: 'u', tenantId: 't', role: 'CASHIER' as RoleName, branchIds: [] }

  const accountingEndpoints = ENDPOINTS.filter(
    (e) => e.permission !== null && (e.permission.startsWith('accounting.') || e.permission.startsWith('payroll.')),
  )

  it('has accounting endpoints to check', () => {
    expect(accountingEndpoints.length).toBeGreaterThan(0)
  })

  it.each(accountingEndpoints.map((e) => [e.path, e.permission] as const))('%s is refused', (_path, permission) => {
    expect(can(cashier, permission as Permission)).toBe(false)
  })
})

describe('read-only roles cannot reach a write endpoint', () => {
  const writePermissions = ENDPOINTS.filter((e) => e.method === 'POST' && e.permission).map(
    (e) => e.permission as Permission,
  )

  it.each(['AUDITOR', 'CASHIER'] as RoleName[])('%s', (role) => {
    const principal = { userId: 'u', tenantId: 't', role, branchIds: [] }
    // The cashier's own POS endpoint is the one write either of them may perform.
    const allowed = writePermissions.filter((permission) => can(principal, permission))
    expect(allowed.every((permission) => permission.startsWith('pos.')), `${role} may write: ${allowed}`).toBe(true)
  })

  it('never lets an auditor write anything at all', () => {
    const auditor = { userId: 'u', tenantId: 't', role: 'AUDITOR' as RoleName, branchIds: [] }
    for (const permission of ROLE_PERMISSIONS.AUDITOR) {
      expect(
        permission.endsWith('.view') || permission === 'audit.view' || permission === 'inventory.cost.view',
        `auditor holds ${permission}`,
      ).toBe(true)
    }
  })
})
