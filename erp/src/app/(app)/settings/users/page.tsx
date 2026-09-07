import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { DateText, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { ROLE_LABELS, ROLE_PERMISSIONS, type RoleName } from '@/lib/rbac'
import { TOTP_REQUIRED_ROLES } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const principal = await requirePermission('settings.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: principal.tenantId, deletedAt: null },
      orderBy: { email: 'asc' },
    }),
    prisma.branch.findMany({ where: { tenantId: principal.tenantId }, select: { id: true, code: true } }),
  ])

  const branchCode = new Map(branches.map((branch) => [branch.id, branch.code]))

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.users')} />

      <div className="card">
        <DataTable
          rows={users}
          locale={locale}
          rowKey={(user) => user.id}
          columns={[
            { key: 'name', header: t('invoice.buyer'), render: (user, l) => (l === 'ar' ? user.nameAr ?? user.nameEn : user.nameEn) },
            { key: 'email', header: t('auth.email'), render: (user) => <span className="num text-xs">{user.email}</span> },
            { key: 'role', header: t('app.actions'), render: (user, l) => ROLE_LABELS[user.role as RoleName]?.[l] ?? user.role },
            {
              key: 'branches',
              header: t('nav.settings'),
              render: (user) =>
                user.branchIds.length === 0
                  ? t('app.all')
                  : user.branchIds.map((id) => branchCode.get(id) ?? '?').join(' · '),
            },
            {
              key: 'permissions',
              header: locale === 'ar' ? 'عدد الصلاحيات' : 'Permissions',
              numeric: true,
              render: (user) => (
                <span className="num">
                  {(ROLE_PERMISSIONS[user.role as RoleName]?.length ?? 0) +
                    user.extraPermissions.length -
                    user.revokedPermissions.length}
                </span>
              ),
            },
            {
              key: 'totp',
              header: t('auth.totp'),
              render: (user, l) =>
                user.totpEnabled ? (
                  <StatusBadge status="POSTED" label={l === 'ar' ? 'مفعّل' : 'On'} />
                ) : TOTP_REQUIRED_ROLES.includes(user.role as RoleName) ? (
                  <StatusBadge status="PENDING" label={l === 'ar' ? 'مطلوب' : 'Required'} />
                ) : (
                  <span className="text-ink-300">—</span>
                ),
            },
            {
              key: 'lastLogin',
              header: locale === 'ar' ? 'آخر دخول' : 'Last sign-in',
              render: (user, l) => (user.lastLoginAt ? <DateText value={user.lastLoginAt} locale={l} /> : '—'),
            },
            { key: 'status', header: t('invoice.status'), render: (user) => <StatusBadge status={user.status === 'ACTIVE' ? 'POSTED' : 'CANCELLED'} label={user.status} /> },
          ]}
        />
      </div>
    </div>
  )
}
