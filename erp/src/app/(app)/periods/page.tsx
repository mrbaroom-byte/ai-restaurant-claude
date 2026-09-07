import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { DateText, StatusBadge } from '@/components/format'
import { PageHeader } from '@/components/page'
import { can } from '@/lib/rbac'
import { closePeriodAction, reopenPeriodAction } from '@/server/actions/periods'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, { en: string; ar: string }> = {
  OPEN: { en: 'Open', ar: 'مفتوحة' },
  CLOSED: { en: 'Closed', ar: 'مقفلة' },
  LOCKED: { en: 'Locked', ar: 'مغلقة نهائياً' },
}

export default async function PeriodsPage() {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const mayClose = can(principal, 'accounting.close')

  const periods = await prisma.fiscalPeriod.findMany({
    where: { tenantId: principal.tenantId },
    orderBy: { startsOn: 'asc' },
  })

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.periods')} />

      <p className="rounded-md bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        {locale === 'ar'
          ? 'إقفال الفترة يمنع أي ترحيل بتاريخ يقع داخلها. أقفل الشهر بعد مراجعة الحسابات والإقرار الضريبي.'
          : 'Closing a period refuses any posting dated inside it. Close a month once you have reviewed the accounts and filed the VAT return.'}
      </p>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('nav.periods')}</th>
              <th>{t('app.from')}</th>
              <th>{t('app.to')}</th>
              <th>{t('invoice.status')}</th>
              {mayClose && <th className="text-end">{t('app.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <td className="num font-medium">{period.name}</td>
                <td>
                  <DateText value={period.startsOn} locale={locale} />
                </td>
                <td>
                  <DateText value={period.endsOn} locale={locale} />
                </td>
                <td>
                  <StatusBadge
                    status={period.status === 'OPEN' ? 'POSTED' : 'REVERSED'}
                    label={locale === 'ar' ? STATUS_LABEL[period.status].ar : STATUS_LABEL[period.status].en}
                  />
                </td>
                {mayClose && (
                  <td className="text-end">
                    <form action={period.status === 'OPEN' ? closePeriodAction : reopenPeriodAction}>
                      <input type="hidden" name="periodId" value={period.id} />
                      <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                        {period.status === 'OPEN'
                          ? locale === 'ar'
                            ? 'إقفال'
                            : 'Close'
                          : locale === 'ar'
                            ? 'إعادة فتح'
                            : 'Reopen'}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
