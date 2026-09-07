import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, EmptyState, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { decrypt, isEncrypted, mask } from '@/lib/crypto/vault'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

/** Identity numbers are encrypted at rest and masked on screen — PDPL, and plain good sense. */
function maskedIdentity(value: string): string {
  try {
    return mask(isEncrypted(value) ? decrypt(value) : value, 3)
  } catch {
    return '•••'
  }
}

export default async function EmployeesPage() {
  const principal = await requirePermission('hr.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const employees = await prisma.employee.findMany({
    where: { tenantId: principal.tenantId, deletedAt: null },
    include: { branch: { select: { code: true } } },
    orderBy: { employeeNumber: 'asc' },
  })

  const soon = Date.now() + 90 * 86_400_000

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.employees')} />

      <div className="card">
        {employees.length === 0 ? (
          <EmptyState
            title={t('nav.employees')}
            body={
              locale === 'ar'
                ? 'لا يوجد موظفون مسجلون. أضف الموظفين لتشغيل مسير الرواتب وحساب مكافأة نهاية الخدمة.'
                : 'No employees yet. Add them to run payroll and accrue end of service.'
            }
          />
        ) : (
          <DataTable
            rows={employees}
            locale={locale}
            rowKey={(employee) => employee.id}
            columns={[
              { key: 'number', header: 'ID', render: (e) => <span className="num text-ink-500">{e.employeeNumber}</span> },
              { key: 'name', header: t('invoice.buyer'), render: (e, l) => (l === 'ar' ? e.nameAr : e.nameEn) },
              { key: 'title', header: t('app.actions'), render: (e, l) => (l === 'ar' ? e.jobTitleAr : e.jobTitleEn) ?? '—' },
              { key: 'branch', header: t('nav.settings'), render: (e) => e.branch.code },
              {
                key: 'identity',
                header: locale === 'ar' ? 'الهوية / الإقامة' : 'ID / Iqama',
                render: (e) => <span className="num text-ink-500">{maskedIdentity(e.identityNumber)}</span>,
              },
              { key: 'nationality', header: locale === 'ar' ? 'الجنسية' : 'Nationality', render: (e) => e.nationality },
              { key: 'hired', header: locale === 'ar' ? 'تاريخ التعيين' : 'Hired', render: (e, l) => <DateText value={e.hireDate} locale={l} /> },
              {
                key: 'wage',
                header: locale === 'ar' ? 'الأجر الشهري' : 'Monthly wage',
                numeric: true,
                render: (e, l) => (
                  <Amount
                    value={money(e.basicSalary.toString())
                      .plus(money(e.housingAllowance.toString()))
                      .plus(money(e.transportAllowance.toString()))
                      .plus(money(e.otherAllowance.toString()))
                      .toString()}
                    locale={l}
                  />
                ),
              },
              {
                key: 'iqama',
                header: t('dashboard.expiringDocuments'),
                render: (e, l) =>
                  e.iqamaExpiry ? (
                    <span className={e.iqamaExpiry.getTime() < soon ? 'text-amber-700' : undefined}>
                      <DateText value={e.iqamaExpiry} locale={l} />
                    </span>
                  ) : (
                    '—'
                  ),
              },
              { key: 'status', header: t('invoice.status'), render: (e) => <StatusBadge status={e.status === 'ACTIVE' ? 'POSTED' : 'CANCELLED'} label={e.status} /> },
            ]}
          />
        )}
      </div>
    </div>
  )
}
