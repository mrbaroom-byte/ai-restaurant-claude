import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  AuthorizationError,
  BranchAccessError,
  DEFAULT_APPROVAL_RULES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Permission,
  type Principal,
  type RoleName,
  assertBranch,
  assertPermission,
  can,
  canApprove,
  permissionsFor,
  requiresApproval,
} from '@/lib/rbac'

const principal = (role: RoleName, over: Partial<Principal> = {}): Principal => ({
  userId: 'u1', tenantId: 't1', role, branchIds: [], ...over,
})

describe('permission matrix', () => {
  it('gives the owner everything', () => {
    expect(new Set(ROLE_PERMISSIONS.OWNER)).toEqual(new Set(ALL_PERMISSIONS))
  })

  it('declares only permissions that exist', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of permissions) {
        expect(ALL_PERMISSIONS, `${role} declares unknown permission ${p}`).toContain(p)
      }
    }
  })

  it('has no duplicates within a role', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size, `${role} lists a permission twice`).toBe(permissions.length)
    }
  })

  it('labels every role in both languages', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
      expect(ROLE_LABELS[role].en).toBeTruthy()
      expect(ROLE_LABELS[role].ar).toBeTruthy()
      expect(ROLE_LABELS[role].ar).toMatch(/[؀-ۿ]/)
    }
  })
})

describe('a cashier cannot reach accounting', () => {
  const cashier = principal('CASHIER')

  it('is refused every accounting, payroll and settings permission', () => {
    const forbidden = ALL_PERMISSIONS.filter(
      (p) => p.startsWith('accounting.') || p.startsWith('payroll.') || p.startsWith('settings.') ||
        p.startsWith('purchasing.') || p.startsWith('hr.') || p === 'users.manage',
    )
    expect(forbidden.length).toBeGreaterThan(10)
    for (const permission of forbidden) {
      expect(can(cashier, permission), `cashier should not have ${permission}`).toBe(false)
      expect(() => assertPermission(cashier, permission)).toThrow(AuthorizationError)
    }
  })

  it('can still do the job the role exists for', () => {
    expect(can(cashier, 'pos.operate')).toBe(true)
    expect(can(cashier, 'pos.session.close.own')).toBe(true)
    // But not close somebody else's till.
    expect(can(cashier, 'pos.session.close.any')).toBe(false)
    expect(can(cashier, 'pos.refund')).toBe(false)
  })

  it('reports the refusal in both languages with the permission named', () => {
    try {
      assertPermission(cashier, 'accounting.post')
      throw new Error('should have refused')
    } catch (error) {
      const e = error as AuthorizationError
      expect(e.status).toBe(403)
      expect(e.permission).toBe('accounting.post')
      expect(e.message).toContain('accounting.post')
      expect(e.messageAr).toMatch(/[؀-ۿ]/)
    }
  })
})

describe('separation of duties across the other roles', () => {
  const cases: Array<[RoleName, Permission, boolean]> = [
    // A manager sees the numbers but does not keep the books.
    ['MANAGER', 'accounting.view', true],
    ['MANAGER', 'accounting.post', false],
    ['MANAGER', 'accounting.close', false],
    ['MANAGER', 'settings.branch', true],
    ['MANAGER', 'settings.manage', false],
    ['MANAGER', 'users.manage', false],
    // An accountant keeps the books and never touches the till.
    ['ACCOUNTANT', 'accounting.close', true],
    ['ACCOUNTANT', 'payroll.post', true],
    ['ACCOUNTANT', 'payroll.run', false],
    ['ACCOUNTANT', 'pos.operate', false],
    ['ACCOUNTANT', 'sales.create', false],
    ['ACCOUNTANT', 'settings.fiscal', true],
    ['ACCOUNTANT', 'settings.zatca', false],
    // HR prepares payroll but cannot post it to the ledger.
    ['HR', 'payroll.run', true],
    ['HR', 'payroll.wps', true],
    ['HR', 'payroll.post', false],
    ['HR', 'accounting.view', false],
    // Sales edits its own documents only.
    ['SALES', 'sales.edit.own', true],
    ['SALES', 'sales.edit.any', false],
    ['SALES', 'sales.credit', false],
    ['SALES', 'sales.price.override', false],
    ['SALES', 'inventory.adjust', false],
    // A storekeeper moves stock but does not sell or price it.
    ['STOREKEEPER', 'inventory.adjust', true],
    ['STOREKEEPER', 'purchasing.receive', true],
    ['STOREKEEPER', 'purchasing.approve', false],
    ['STOREKEEPER', 'sales.create', false],
    ['STOREKEEPER', 'inventory.cost.view', false],
    // An auditor reads everything and writes nothing.
    ['AUDITOR', 'accounting.view', true],
    ['AUDITOR', 'audit.view', true],
    ['AUDITOR', 'accounting.post', false],
    ['AUDITOR', 'sales.create', false],
  ]

  it.each(cases)('%s %s → %s', (role, permission, expected) => {
    expect(can(principal(role), permission)).toBe(expected)
  })

  it('gives no role outside the owner a write permission on settings or users', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
      if (role === 'OWNER') continue
      expect(can(principal(role), 'settings.manage'), `${role}`).toBe(false)
      expect(can(principal(role), 'users.manage'), `${role}`).toBe(false)
      expect(can(principal(role), 'backup.manage'), `${role}`).toBe(false)
    }
  })

  it('lets only the owner and the accountant file a VAT return', () => {
    const allowed = (Object.keys(ROLE_PERMISSIONS) as RoleName[]).filter((r) => can(principal(r), 'accounting.vat.file'))
    expect(allowed.sort()).toEqual(['ACCOUNTANT', 'OWNER'])
  })
})

describe('per-user grants', () => {
  it('adds an extra permission on top of the role', () => {
    const salesperson = principal('SALES', { extraPermissions: ['sales.price.override'] })
    expect(can(salesperson, 'sales.price.override')).toBe(true)
    // The role itself is untouched for everybody else.
    expect(can(principal('SALES'), 'sales.price.override')).toBe(false)
  })

  it('revokes a permission the role would otherwise grant', () => {
    const restricted = principal('MANAGER', { revokedPermissions: ['pos.refund'] })
    expect(can(restricted, 'pos.refund')).toBe(false)
    expect(can(restricted, 'pos.operate')).toBe(true)
  })

  it('lets a revocation beat a grant, so removing access always works', () => {
    const p = principal('SALES', { extraPermissions: ['sales.credit'], revokedPermissions: ['sales.credit'] })
    expect(permissionsFor(p).has('sales.credit')).toBe(false)
  })
})

describe('branch scoping', () => {
  it('allows a user with no branch restriction into any branch', () => {
    expect(() => assertBranch(principal('OWNER'), 'anything')).not.toThrow()
  })

  it('confines a branch-scoped user to their own branches', () => {
    const p = principal('MANAGER', { branchIds: ['jed', 'ruh'] })
    expect(() => assertBranch(p, 'jed')).not.toThrow()
    expect(() => assertBranch(p, 'dmm')).toThrow(BranchAccessError)
  })
})

describe('approval thresholds', () => {
  it('leaves a document under the limit alone', () => {
    expect(requiresApproval('PURCHASE_ORDER', '9999.99')).toBeNull()
  })

  it('requires approval strictly above the limit', () => {
    expect(requiresApproval('PURCHASE_ORDER', '10000')).toBeNull()
    expect(requiresApproval('PURCHASE_ORDER', '10000.01')).not.toBeNull()
  })

  it('names who may approve', () => {
    const rule = requiresApproval('EXPENSE', '6000')!
    expect(rule.approverRoles).toContain('OWNER')
    expect(canApprove(principal('ACCOUNTANT'), rule)).toBe(true)
    expect(canApprove(principal('SALES'), rule)).toBe(false)
  })

  it('covers every rule with at least one approver role', () => {
    for (const rule of DEFAULT_APPROVAL_RULES) {
      expect(rule.approverRoles.length).toBeGreaterThan(0)
      expect(Number(rule.threshold)).toBeGreaterThan(0)
    }
  })
})
