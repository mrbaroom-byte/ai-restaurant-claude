/**
 * Roles and permissions.
 *
 * The matrix below is the single source of truth. The API guard reads it, the UI reads it to
 * decide what to render, and the authorisation tests read it to prove that every route is
 * covered. Hiding a menu is not access control; `assertPermission` on the server is.
 */

export type Permission =
  // Sales
  | 'sales.view' | 'sales.create' | 'sales.edit.own' | 'sales.edit.any' | 'sales.post'
  | 'sales.credit' | 'sales.payment' | 'sales.price.override'
  // Purchasing
  | 'purchasing.view' | 'purchasing.create' | 'purchasing.approve' | 'purchasing.receive'
  | 'purchasing.bill' | 'purchasing.payment'
  // Inventory
  | 'inventory.view' | 'inventory.manage' | 'inventory.adjust' | 'inventory.transfer'
  | 'inventory.count' | 'inventory.produce' | 'inventory.cost.view'
  // Accounting
  | 'accounting.view' | 'accounting.post' | 'accounting.close' | 'accounting.reconcile'
  | 'accounting.coa.manage' | 'accounting.vat.file'
  // HR and payroll
  | 'hr.view' | 'hr.manage' | 'payroll.view' | 'payroll.run' | 'payroll.post' | 'payroll.wps'
  // POS
  | 'pos.operate' | 'pos.session.close.own' | 'pos.session.close.any' | 'pos.discount' | 'pos.refund'
  // Contacts
  | 'contacts.view' | 'contacts.manage' | 'contacts.credit.override'
  // Settings and platform
  | 'settings.view' | 'settings.manage' | 'settings.branch' | 'settings.fiscal'
  | 'settings.zatca' | 'users.manage' | 'audit.view' | 'api.manage' | 'backup.manage'

export type RoleName =
  | 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'SALES' | 'STOREKEEPER' | 'CASHIER' | 'HR' | 'AUDITOR'

export const ALL_PERMISSIONS: Permission[] = [
  'sales.view', 'sales.create', 'sales.edit.own', 'sales.edit.any', 'sales.post', 'sales.credit',
  'sales.payment', 'sales.price.override',
  'purchasing.view', 'purchasing.create', 'purchasing.approve', 'purchasing.receive',
  'purchasing.bill', 'purchasing.payment',
  'inventory.view', 'inventory.manage', 'inventory.adjust', 'inventory.transfer',
  'inventory.count', 'inventory.produce', 'inventory.cost.view',
  'accounting.view', 'accounting.post', 'accounting.close', 'accounting.reconcile',
  'accounting.coa.manage', 'accounting.vat.file',
  'hr.view', 'hr.manage', 'payroll.view', 'payroll.run', 'payroll.post', 'payroll.wps',
  'pos.operate', 'pos.session.close.own', 'pos.session.close.any', 'pos.discount', 'pos.refund',
  'contacts.view', 'contacts.manage', 'contacts.credit.override',
  'settings.view', 'settings.manage', 'settings.branch', 'settings.fiscal', 'settings.zatca',
  'users.manage', 'audit.view', 'api.manage', 'backup.manage',
]

/**
 * The permission matrix.
 *
 * Read it against the table in the specification: Owner has everything; Manager runs a branch
 * but only *views* accounting; Accountant owns the books but never touches POS; Cashier is
 * confined to their own till session.
 */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],

  MANAGER: [
    'sales.view', 'sales.create', 'sales.edit.any', 'sales.post', 'sales.credit', 'sales.payment',
    'sales.price.override',
    'purchasing.view', 'purchasing.create', 'purchasing.approve', 'purchasing.receive',
    'purchasing.bill', 'purchasing.payment',
    'inventory.view', 'inventory.manage', 'inventory.adjust', 'inventory.transfer',
    'inventory.count', 'inventory.produce', 'inventory.cost.view',
    // Accounting is view-only: a manager can see the numbers, not change the books.
    'accounting.view',
    'hr.view', 'payroll.view',
    'pos.operate', 'pos.session.close.own', 'pos.session.close.any', 'pos.discount', 'pos.refund',
    'contacts.view', 'contacts.manage',
    'settings.view', 'settings.branch', 'audit.view',
  ],

  ACCOUNTANT: [
    'sales.view',
    'purchasing.view', 'purchasing.approve', 'purchasing.payment',
    'inventory.view', 'inventory.cost.view',
    'accounting.view', 'accounting.post', 'accounting.close', 'accounting.reconcile',
    'accounting.coa.manage', 'accounting.vat.file',
    'payroll.view', 'payroll.post',
    'contacts.view',
    'settings.view', 'settings.fiscal', 'audit.view',
  ],

  SALES: [
    'sales.view', 'sales.create', 'sales.edit.own', 'sales.post',
    'inventory.view',
    'contacts.view', 'contacts.manage',
  ],

  STOREKEEPER: [
    'purchasing.view', 'purchasing.receive',
    'inventory.view', 'inventory.manage', 'inventory.adjust', 'inventory.transfer',
    'inventory.count', 'inventory.produce',
  ],

  CASHIER: ['pos.operate', 'pos.session.close.own', 'sales.view', 'inventory.view'],

  HR: ['hr.view', 'hr.manage', 'payroll.view', 'payroll.run', 'payroll.wps'],

  AUDITOR: [
    'sales.view', 'purchasing.view', 'inventory.view', 'inventory.cost.view',
    'accounting.view', 'hr.view', 'payroll.view', 'contacts.view', 'settings.view', 'audit.view',
  ],
}

export interface Principal {
  userId: string
  tenantId: string
  role: RoleName
  /** Branches the user may act in. Empty means every branch in the tenant. */
  branchIds: string[]
  /** Grants added on top of the role, e.g. a salesperson temporarily allowed to discount. */
  extraPermissions?: Permission[]
  /** Grants taken away from the role for this user. */
  revokedPermissions?: Permission[]
}

export class AuthorizationError extends Error {
  readonly status = 403
  readonly permission: Permission
  readonly messageAr: string

  constructor(permission: Permission) {
    super(`You do not have permission to do this (${permission}).`)
    this.name = 'AuthorizationError'
    this.permission = permission
    this.messageAr = `ليس لديك صلاحية لتنفيذ هذا الإجراء (${permission}).`
  }
}

export function permissionsFor(principal: Principal): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[principal.role] ?? [])
  for (const p of principal.extraPermissions ?? []) set.add(p)
  for (const p of principal.revokedPermissions ?? []) set.delete(p)
  return set
}

export function can(principal: Principal, permission: Permission): boolean {
  return permissionsFor(principal).has(permission)
}

/** The guard every mutating server action and route handler calls first. */
export function assertPermission(principal: Principal, permission: Permission): void {
  if (!can(principal, permission)) throw new AuthorizationError(permission)
}

export class BranchAccessError extends Error {
  readonly status = 403
  readonly messageAr = 'ليس لديك صلاحية على هذا الفرع.'
  constructor(branchId: string) {
    super(`You do not have access to branch ${branchId}.`)
    this.name = 'BranchAccessError'
  }
}

/** A branch-scoped user must not read or write another branch's documents. */
export function assertBranch(principal: Principal, branchId: string): void {
  if (principal.branchIds.length === 0) return
  if (!principal.branchIds.includes(branchId)) throw new BranchAccessError(branchId)
}

/**
 * Approval thresholds. A document above the limit needs a second person, which is the only
 * segregation of duties a five-person business can realistically run.
 */
export interface ApprovalRule {
  documentType: 'PURCHASE_ORDER' | 'EXPENSE' | 'CREDIT_NOTE' | 'JOURNAL_ENTRY' | 'STOCK_ADJUSTMENT'
  /** Amounts strictly above this need approval. */
  threshold: string
  approverRoles: RoleName[]
}

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  { documentType: 'PURCHASE_ORDER', threshold: '10000', approverRoles: ['OWNER'] },
  { documentType: 'EXPENSE', threshold: '5000', approverRoles: ['OWNER', 'ACCOUNTANT'] },
  { documentType: 'CREDIT_NOTE', threshold: '5000', approverRoles: ['OWNER', 'ACCOUNTANT'] },
  { documentType: 'JOURNAL_ENTRY', threshold: '50000', approverRoles: ['OWNER'] },
  { documentType: 'STOCK_ADJUSTMENT', threshold: '2000', approverRoles: ['OWNER', 'MANAGER'] },
]

export function requiresApproval(
  documentType: ApprovalRule['documentType'],
  amount: string | number,
  rules: ApprovalRule[] = DEFAULT_APPROVAL_RULES,
): ApprovalRule | null {
  const rule = rules.find((r) => r.documentType === documentType)
  if (!rule) return null
  return Number(amount) > Number(rule.threshold) ? rule : null
}

export function canApprove(principal: Principal, rule: ApprovalRule): boolean {
  return rule.approverRoles.includes(principal.role)
}

/** Bilingual role labels for the UI. */
export const ROLE_LABELS: Record<RoleName, { en: string; ar: string }> = {
  OWNER: { en: 'Owner', ar: 'المالك' },
  MANAGER: { en: 'Manager', ar: 'المدير' },
  ACCOUNTANT: { en: 'Accountant', ar: 'المحاسب' },
  SALES: { en: 'Sales', ar: 'المبيعات' },
  STOREKEEPER: { en: 'Storekeeper', ar: 'أمين المستودع' },
  CASHIER: { en: 'Cashier', ar: 'الكاشير' },
  HR: { en: 'Human Resources', ar: 'الموارد البشرية' },
  AUDITOR: { en: 'Auditor (read only)', ar: 'المراجع (اطلاع فقط)' },
}
