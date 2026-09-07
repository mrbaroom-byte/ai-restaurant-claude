import Link from 'next/link'
import { requirePrincipal, currentLocale } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { LOCALE_LABEL, LOCALES } from '@/lib/i18n/config'
import { ROLE_LABELS, type Permission, can } from '@/lib/rbac'
import { setLocaleAction, signOutAction } from '@/server/actions/auth'
import { prisma } from '@/server/db'

interface NavItem {
  href: string
  labelKey: string
  permission: Permission
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

/**
 * Navigation is filtered by permission, but that is convenience, not security — every page
 * behind these links calls `requirePermission` for itself.
 */
const NAV: NavGroup[] = [
  {
    labelKey: 'nav.sales',
    items: [
      { href: '/invoices', labelKey: 'nav.invoices', permission: 'sales.view' },
      { href: '/parties?role=customer', labelKey: 'nav.customers', permission: 'contacts.view' },
      { href: '/pos', labelKey: 'nav.pos', permission: 'pos.operate' },
    ],
  },
  {
    labelKey: 'nav.purchasing',
    items: [
      { href: '/bills', labelKey: 'nav.bills', permission: 'purchasing.view' },
      { href: '/parties?role=supplier', labelKey: 'nav.suppliers', permission: 'purchasing.view' },
    ],
  },
  {
    labelKey: 'nav.inventory',
    items: [
      { href: '/items', labelKey: 'nav.items', permission: 'inventory.view' },
      { href: '/stock', labelKey: 'nav.stock', permission: 'inventory.view' },
    ],
  },
  {
    labelKey: 'nav.accounting',
    items: [
      { href: '/journal', labelKey: 'nav.journal', permission: 'accounting.view' },
      { href: '/accounts', labelKey: 'nav.chartOfAccounts', permission: 'accounting.view' },
      { href: '/periods', labelKey: 'nav.periods', permission: 'accounting.view' },
    ],
  },
  {
    labelKey: 'nav.reports',
    items: [
      { href: '/reports/trial-balance', labelKey: 'nav.trialBalance', permission: 'accounting.view' },
      { href: '/reports/profit-loss', labelKey: 'nav.profitLoss', permission: 'accounting.view' },
      { href: '/reports/balance-sheet', labelKey: 'nav.balanceSheet', permission: 'accounting.view' },
      { href: '/reports/vat-return', labelKey: 'nav.vatReturn', permission: 'accounting.view' },
      { href: '/reports/aging', labelKey: 'nav.aging', permission: 'contacts.view' },
    ],
  },
  {
    labelKey: 'nav.hr',
    items: [
      { href: '/employees', labelKey: 'nav.employees', permission: 'hr.view' },
      { href: '/payroll', labelKey: 'nav.payroll', permission: 'payroll.view' },
    ],
  },
  {
    labelKey: 'nav.settings',
    items: [
      { href: '/settings/zatca', labelKey: 'nav.zatca', permission: 'settings.view' },
      { href: '/settings/users', labelKey: 'nav.users', permission: 'settings.view' },
      { href: '/settings/audit', labelKey: 'nav.auditLog', permission: 'audit.view' },
    ],
  },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePrincipal()
  const locale = await currentLocale()
  const t = translator(locale)

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: principal.tenantId },
      select: { legalNameAr: true, legalNameEn: true, tradeNameAr: true, tradeNameEn: true },
    }),
    principal.userId.startsWith('apikey:')
      ? null
      : prisma.user.findUnique({ where: { id: principal.userId }, select: { nameAr: true, nameEn: true } }),
  ])

  const tenantName = locale === 'ar' ? tenant.tradeNameAr ?? tenant.legalNameAr : tenant.tradeNameEn ?? tenant.legalNameEn
  const userName = locale === 'ar' ? user?.nameAr ?? user?.nameEn : user?.nameEn ?? user?.nameAr

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(principal, item.permission)),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-sidebar">
      <aside className="no-print border-b border-[var(--border)] bg-white lg:min-h-screen lg:border-b-0 lg:border-e">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg text-white">
            ن
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">{tenantName}</span>
            <span className="block text-xs text-ink-500">{t('app.name')}</span>
          </span>
        </div>

        <nav className="px-2 pb-4" aria-label={t('nav.dashboard')}>
          <Link
            href="/"
            className="mb-2 block rounded-md px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            {t('nav.dashboard')}
          </Link>

          {groups.map((group) => (
            <div key={group.labelKey} className="mb-3">
              <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {t(group.labelKey)}
              </h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                    >
                      {t(item.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-4 py-2.5">
          <div className="text-sm">
            <span className="font-medium text-ink-800">{userName}</span>
            <span className="ms-2 text-ink-500">{ROLE_LABELS[principal.role][locale]}</span>
          </div>

          <div className="flex items-center gap-2">
            <form action={setLocaleAction} className="flex rounded-md bg-ink-50 p-0.5">
              <input type="hidden" name="returnTo" value="/" />
              {LOCALES.map((option) => (
                <button
                  key={option}
                  type="submit"
                  name="locale"
                  value={option}
                  aria-current={option === locale}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    option === locale ? 'bg-white font-medium text-ink-900 shadow-sm' : 'text-ink-500'
                  }`}
                >
                  {LOCALE_LABEL[option]}
                </button>
              ))}
            </form>

            <form action={signOutAction}>
              <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
                {t('auth.signOut')}
              </button>
            </form>
          </div>
        </header>

        <main id="main" className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
