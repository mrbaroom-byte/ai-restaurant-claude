import Link from 'next/link'
import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { DateText, EmptyState } from '@/components/format'
import { PageHeader } from '@/components/page'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entity?: string }>
}) {
  const principal = await requirePermission('audit.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))

  const where = {
    tenantId: principal.tenantId,
    ...(params.entity ? { entity: params.entity } : {}),
  }

  const [entries, count, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { tenantId: principal.tenantId }, select: { id: true, nameEn: true, nameAr: true } }),
  ])

  const userName = new Map(users.map((user) => [user.id, locale === 'ar' ? user.nameAr ?? user.nameEn : user.nameEn]))

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.auditLog')} />

      <p className="rounded-md bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        {locale === 'ar'
          ? 'يسجَّل كل تغيير يمسّ المال أو المخزون أو الصلاحيات، مع القيم قبل وبعد. تُخفى المفاتيح وأرقام الهوية والحسابات البنكية قبل الحفظ.'
          : 'Every change that touches money, stock or access is recorded with its before and after values. Keys, identity numbers and bank accounts are redacted before storage.'}
      </p>

      <div className="card">
        {entries.length === 0 ? (
          <EmptyState title={t('nav.auditLog')} body={t('app.none')} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('invoice.date')}</th>
                    <th>{t('invoice.buyer')}</th>
                    <th>{t('nav.settings')}</th>
                    <th>{t('app.actions')}</th>
                    <th>{t('invoice.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap">
                        <DateText value={entry.createdAt} locale={locale} />
                        <span className="num ms-2 text-xs text-ink-400">
                          {entry.createdAt.toISOString().slice(11, 19)}
                        </span>
                      </td>
                      <td>{entry.userId ? userName.get(entry.userId) ?? '—' : <span className="text-ink-400">API</span>}</td>
                      <td className="num text-xs text-ink-500">{entry.entity}</td>
                      <td>
                        <span className="badge bg-ink-100 text-ink-700">{entry.action}</span>
                      </td>
                      <td className="max-w-md">
                        <code className="block truncate text-[11px] text-ink-500" dir="ltr">
                          {JSON.stringify(entry.after ?? entry.before ?? {})}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {count > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
                <span className="num text-ink-500">{count}</span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link href={`/settings/audit?page=${page - 1}`} className="btn-secondary px-3 py-1.5 text-xs">
                      ‹
                    </Link>
                  )}
                  {page * PAGE_SIZE < count && (
                    <Link href={`/settings/audit?page=${page + 1}`} className="btn-secondary px-3 py-1.5 text-xs">
                      ›
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
