import { translator } from '@/lib/i18n/server'
import type { Locale } from '@/lib/i18n/config'

/** The date range every report screen carries in its query string. */
export interface Period {
  from: Date
  to: Date
}

export function resolvePeriod(params: { from?: string; to?: string }, now = new Date()): Period {
  const from = params.from ? new Date(params.from) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const to = params.to ? new Date(params.to) : now
  return {
    from: Number.isNaN(from.getTime()) ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : from,
    to: Number.isNaN(to.getTime()) ? now : to,
  }
}

export function PeriodFilter({ period, locale, extra }: { period: Period; locale: Locale; extra?: React.ReactNode }) {
  const t = translator(locale)
  return (
    <form className="no-print card flex flex-wrap items-end gap-3 p-3" method="get">
      <div>
        <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-600">
          {t('app.from')}
        </label>
        <input id="from" name="from" type="date" defaultValue={period.from.toISOString().slice(0, 10)} className="field" />
      </div>
      <div>
        <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-600">
          {t('app.to')}
        </label>
        <input id="to" name="to" type="date" defaultValue={period.to.toISOString().slice(0, 10)} className="field" />
      </div>
      {extra}
      <button type="submit" className="btn-secondary">
        {t('app.search')}
      </button>
    </form>
  )
}
