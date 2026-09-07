import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, EmptyState, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'
import { DEFAULT_GOSI_RATES } from '@/lib/payroll/gosi'
import { money } from '@/lib/money'
import { can } from '@/lib/rbac'
import { PostRun, RunPayroll } from './actions-client'

export const dynamic = 'force-dynamic'

export default async function PayrollPage() {
  const principal = await requirePermission('payroll.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const [runs, branches] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { tenantId: principal.tenantId, deletedAt: null },
      include: { _count: { select: { payslips: true } } },
      orderBy: { periodStart: 'desc' },
    }),
    prisma.branch.findMany({
      where: {
        tenantId: principal.tenantId,
        active: true,
        ...(principal.branchIds.length ? { id: { in: principal.branchIds } } : {}),
      },
      orderBy: { code: 'asc' },
    }),
  ])

  const now = new Date()
  const defaultPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.payroll')} />

      {can(principal, 'payroll.run') && branches.length > 0 && (
        <RunPayroll
          branches={branches.map((branch) => ({
            id: branch.id,
            code: branch.code,
            name: locale === 'ar' ? branch.nameAr : branch.nameEn,
          }))}
          defaultPeriod={defaultPeriod}
          labels={{
            title: locale === 'ar' ? 'احتساب مسير رواتب' : 'Calculate a payroll run',
            period: locale === 'ar' ? 'الشهر' : 'Month',
            branch: locale === 'ar' ? 'الفرع' : 'Branch',
            submit: locale === 'ar' ? 'احتساب' : 'Calculate',
            hint:
              locale === 'ar'
                ? 'يُحتسب المسير أولاً كمسودة بلا أثر محاسبي. راجعه، ثم رحّله، ثم نزّل ملف حماية الأجور للبنك.'
                : 'A run is calculated as a draft with no accounting effect. Review it, post it, then download the WPS file for the bank.',
          }}
        />
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-800">
          {locale === 'ar' ? 'نسب التأمينات الاجتماعية المطبّقة' : 'GOSI rates in force'}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          {[
            { label: locale === 'ar' ? 'الموظف السعودي' : 'Saudi employee', value: DEFAULT_GOSI_RATES.saudiEmployee },
            { label: locale === 'ar' ? 'المنشأة (سعودي)' : 'Employer (Saudi)', value: DEFAULT_GOSI_RATES.saudiEmployer },
            { label: locale === 'ar' ? 'المنشأة (غير سعودي)' : 'Employer (non-Saudi)', value: DEFAULT_GOSI_RATES.nonSaudiEmployer },
          ].map((rate) => (
            <div key={rate.label}>
              <dt className="text-xs text-ink-500">{rate.label}</dt>
              <dd className="num font-medium">{rate.value.times(100).toFixed(2)}%</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-ink-500">{locale === 'ar' ? 'الحد الأعلى للأجر' : 'Wage ceiling'}</dt>
            <dd>
              <Amount value={DEFAULT_GOSI_RATES.wageCeiling.toString()} locale={locale} />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-500">
          {locale === 'ar'
            ? 'تُثبَّت النسب على كل مسير رواتب عند احتسابه، فتُعاد طباعة أي قسيمة قديمة بالنسب التي كانت سارية وقتها.'
            : 'These are stamped onto each payroll run when it is calculated, so an old payslip always reprints with the rates that applied at the time.'}
        </p>
      </section>

      <div className="card">
        {runs.length === 0 ? (
          <EmptyState
            title={t('nav.payroll')}
            body={
              locale === 'ar'
                ? 'لم يُنشأ أي مسير رواتب بعد. سيحتسب المسير التأمينات والعمل الإضافي ومكافأة نهاية الخدمة، ويُنتج ملف حماية الأجور.'
                : 'No payroll runs yet. A run works out GOSI, overtime and end-of-service, and produces the WPS file for the bank.'
            }
          />
        ) : (
          <DataTable
            rows={runs}
            locale={locale}
            rowKey={(run) => run.id}
            columns={[
              { key: 'number', header: t('invoice.number'), render: (run) => <span className="num font-medium">{run.number}</span> },
              { key: 'period', header: t('nav.periods'), render: (run, l) => <DateText value={run.periodStart} locale={l} /> },
              { key: 'count', header: t('nav.employees'), numeric: true, render: (run) => <span className="num">{run._count.payslips}</span> },
              { key: 'gross', header: locale === 'ar' ? 'الإجمالي' : 'Gross', numeric: true, render: (run, l) => <Amount value={run.totalGross.toString()} locale={l} /> },
              { key: 'gosi', header: 'GOSI', numeric: true, render: (run, l) => <Amount value={money(run.totalGosiEmployee.toString()).plus(money(run.totalGosiEmployer.toString())).toString()} locale={l} muted /> },
              { key: 'eosb', header: locale === 'ar' ? 'نهاية الخدمة' : 'End of service', numeric: true, render: (run, l) => <Amount value={run.totalEosbAccrual.toString()} locale={l} muted /> },
              { key: 'net', header: locale === 'ar' ? 'الصافي' : 'Net', numeric: true, render: (run, l) => <Amount value={run.totalNet.toString()} locale={l} /> },
              { key: 'status', header: t('invoice.status'), render: (run) => <StatusBadge status={run.status} label={t(`status.${run.status}`)} /> },
              {
                key: 'actions',
                header: t('app.actions'),
                render: (run, l) => (
                  <div className="flex flex-wrap items-center gap-2">
                    {run.status === 'DRAFT' && can(principal, 'payroll.post') && (
                      <PostRun payrollRunId={run.id} label={l === 'ar' ? 'ترحيل' : 'Post'} />
                    )}
                    {can(principal, 'payroll.wps') && (
                      <a href={`/api/v1/payroll/runs/${run.id}/wps`} className="btn-secondary px-3 py-1 text-xs">
                        WPS
                      </a>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
