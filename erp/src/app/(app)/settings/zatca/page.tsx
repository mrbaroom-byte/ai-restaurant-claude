import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { OnboardingSteps } from './steps'

export const dynamic = 'force-dynamic'

const STATUS_ORDER = ['DRAFT', 'CSR_GENERATED', 'COMPLIANCE_CSID', 'COMPLIANCE_PASSED', 'ACTIVE']

export default async function ZatcaSettingsPage() {
  const principal = await requirePermission('settings.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const [tenant, branches, certificates] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: principal.tenantId },
      select: { legalNameEn: true, legalNameAr: true, vatNumber: true, zatcaEnvironment: true },
    }),
    prisma.branch.findMany({
      where: { tenantId: principal.tenantId, active: true },
      include: { address: true },
      orderBy: { code: 'asc' },
    }),
    prisma.zatcaCertificate.findMany({
      where: { tenantId: principal.tenantId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const active = certificates.find((certificate) => certificate.status === 'ACTIVE')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold text-ink-900">{t('zatca.title')}</h1>

      {!active && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('zatca.notOnboarded')}</p>
      )}

      <section className="card p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-500">{t('invoice.seller')}</dt>
            <dd className="font-medium">{locale === 'ar' ? tenant.legalNameAr : tenant.legalNameEn}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('invoice.vatNumber')}</dt>
            <dd className="num font-medium">{tenant.vatNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">{t('zatca.environment')}</dt>
            <dd className="font-medium">{t(`zatca.${tenant.zatcaEnvironment.toLowerCase()}`)}</dd>
          </div>
        </dl>
      </section>

      {certificates.length > 0 && (
        <section className="card">
          <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-ink-800">
            {t('zatca.deviceSerial')}
          </h2>
          {/* The EGS serial is long by design; it scrolls here rather than widening the page. */}
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('zatca.deviceSerial')}</th>
                <th>{t('zatca.environment')}</th>
                <th>{t('zatca.invoiceTypes')}</th>
                <th>{t('invoice.status')}</th>
                <th className="text-end">{t('zatca.lastCounter')}</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td className="num text-xs">{certificate.egsSerial}</td>
                  <td>{t(`zatca.${certificate.environment.toLowerCase()}`)}</td>
                  <td className="num">{certificate.invoiceType}</td>
                  <td>
                    <span
                      className={`badge ${
                        certificate.status === 'ACTIVE' ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {certificate.status}
                      <span className="ms-1 text-[10px] opacity-70">
                        {STATUS_ORDER.indexOf(certificate.status) + 1}/{STATUS_ORDER.length}
                      </span>
                    </span>
                  </td>
                  <td className="num text-end">{certificate.lastIcv}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}

      <OnboardingSteps
        canManage={principal.role === 'OWNER'}
        environment={tenant.zatcaEnvironment}
        vatNumber={tenant.vatNumber ?? ''}
        organizationName={tenant.legalNameEn}
        branches={branches.map((branch) => ({
          id: branch.id,
          code: branch.code,
          name: locale === 'ar' ? branch.nameAr : branch.nameEn,
          address: [
            branch.address?.street,
            branch.address?.district,
            branch.address?.city,
            branch.address?.postalCode,
          ]
            .filter(Boolean)
            .join(', '),
        }))}
        certificates={certificates.map((certificate) => ({
          id: certificate.id,
          egsSerial: certificate.egsSerial,
          status: certificate.status,
        }))}
        labels={{
          generateCsr: t('zatca.generateCsr'),
          otp: t('zatca.otp'),
          otpHint: t('zatca.otpHint'),
          requestComplianceCsid: t('zatca.requestComplianceCsid'),
          runComplianceChecks: t('zatca.runComplianceChecks'),
          requestProductionCsid: t('zatca.requestProductionCsid'),
          deviceSerial: t('zatca.deviceSerial'),
          invoiceTypes: t('zatca.invoiceTypes'),
          environment: t('zatca.environment'),
          forbidden: t('errors.forbidden'),
        }}
      />
    </div>
  )
}
