import Link from 'next/link'
import { currentLocale, requirePermission } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { Amount, DateText, EmptyState, StatusBadge } from '@/components/format'
import { DataTable, PageHeader } from '@/components/page'

export const dynamic = 'force-dynamic'

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const principal = await requirePermission('accounting.view')
  const locale = await currentLocale()
  const t = translator(locale)
  const page = Math.max(1, Number((await searchParams).page ?? 1))
  const pageSize = 50

  const where = { tenantId: principal.tenantId, deletedAt: null }
  const [entries, count] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { code: true, nameEn: true, nameAr: true } } } } },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.journalEntry.count({ where }),
  ])

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.journal')} />

      <div className="card">
        {entries.length === 0 ? (
          <EmptyState
            title={t('nav.journal')}
            body={
              locale === 'ar'
                ? 'لا توجد قيود بعد. كل فاتورة أو سند أو مسير رواتب يُنشئ قيده تلقائياً.'
                : 'No entries yet. Every invoice, payment and payroll run posts its own automatically.'
            }
          />
        ) : (
          <>
            <DataTable
              rows={entries}
              locale={locale}
              rowKey={(entry) => entry.id}
              columns={[
                { key: 'number', header: t('invoice.number'), render: (entry) => <span className="num font-medium">{entry.number}</span> },
                { key: 'date', header: t('invoice.date'), render: (entry, l) => <DateText value={entry.date} locale={l} /> },
                { key: 'source', header: t('app.actions'), render: (entry) => <span className="text-xs text-ink-500">{entry.source}</span> },
                {
                  key: 'reference',
                  header: t('app.search'),
                  render: (entry) => <span className="num text-xs">{entry.reference ?? '—'}</span>,
                },
                {
                  key: 'memo',
                  header: t('invoice.description'),
                  render: (entry, l) => (l === 'ar' ? entry.memoAr : entry.memoEn) ?? '—',
                },
                {
                  key: 'accounts',
                  header: t('reports.account'),
                  render: (entry) => (
                    <span className="num text-xs text-ink-500">
                      {[...new Set(entry.lines.map((line) => line.account.code))].join(' · ')}
                    </span>
                  ),
                },
                { key: 'total', header: t('app.total'), numeric: true, render: (entry, l) => <Amount value={entry.totalDebit.toString()} locale={l} /> },
                { key: 'status', header: t('invoice.status'), render: (entry) => <StatusBadge status={entry.status} label={t(`status.${entry.status}`)} /> },
              ]}
            />
            {count > pageSize && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
                <span className="num text-ink-500">{count}</span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link href={`/journal?page=${page - 1}`} className="btn-secondary px-3 py-1.5 text-xs">
                      ‹
                    </Link>
                  )}
                  {page * pageSize < count && (
                    <Link href={`/journal?page=${page + 1}`} className="btn-secondary px-3 py-1.5 text-xs">
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
