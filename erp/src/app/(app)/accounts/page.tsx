import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { PageHeader } from '@/components/page'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, { en: string; ar: string }> = {
  ASSET: { en: 'Assets', ar: 'الأصول' },
  LIABILITY: { en: 'Liabilities', ar: 'الالتزامات' },
  EQUITY: { en: 'Equity', ar: 'حقوق الملكية' },
  REVENUE: { en: 'Revenue', ar: 'الإيرادات' },
  EXPENSE: { en: 'Expenses', ar: 'المصروفات' },
}

export default async function AccountsPage() {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)

  const accounts = await prisma.account.findMany({
    where: { tenantId: principal.tenantId },
    orderBy: { code: 'asc' },
  })

  // Nesting depth from the parent chain, so the tree reads as a chart of accounts should.
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const depthOf = (id: string): number => {
    let depth = 0
    let current = byId.get(id)
    while (current?.parentId) {
      depth += 1
      current = byId.get(current.parentId)
    }
    return depth
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.chartOfAccounts')} />

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-24">#</th>
              <th>{t('reports.account')}</th>
              <th>{t('invoice.status')}</th>
              <th>{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className={account.postable ? '' : 'bg-ink-50/60 font-medium'}>
                <td className="num text-ink-500">{account.code}</td>
                <td style={{ paddingInlineStart: `${0.75 + depthOf(account.id) * 1.25}rem` }}>
                  {locale === 'ar' ? account.nameAr : account.nameEn}
                </td>
                <td className="text-xs text-ink-500">
                  {locale === 'ar' ? TYPE_LABEL[account.type].ar : TYPE_LABEL[account.type].en}
                </td>
                <td className="text-xs text-ink-400">
                  {account.role ? <span className="num">{account.role}</span> : account.postable ? '' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
