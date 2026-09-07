/**
 * Presentation helpers shared by every screen.
 *
 * `Amount` is used for every monetary figure so that tabular digits, the currency position and
 * the left-to-right run of the number itself are decided in one place, not per screen.
 */
import { type Locale, formatDate, formatDualDate, formatMoney, formatQuantity } from '@/lib/i18n/config'

export function Amount({
  value,
  locale,
  currency = 'SAR',
  className = '',
  muted = false,
}: {
  value: string | number | null | undefined
  locale: Locale
  currency?: string
  className?: string
  muted?: boolean
}) {
  const amount = Number(value ?? 0)
  const negative = amount < 0
  return (
    <span
      className={`num ${negative ? 'text-red-700' : muted ? 'text-ink-500' : ''} ${className}`}
      // Screen readers otherwise read a right-to-left amount digit group by digit group.
      dir="ltr"
    >
      {formatMoney(amount, locale, currency)}
    </span>
  )
}

export function Quantity({ value, locale }: { value: string | number; locale: Locale }) {
  return (
    <span className="num" dir="ltr">
      {formatQuantity(value, locale)}
    </span>
  )
}

export function DateText({ value, locale, dual = false }: { value: Date | string; locale: Locale; dual?: boolean }) {
  return <span className="whitespace-nowrap">{dual ? formatDualDate(value, locale) : formatDate(value, locale)}</span>
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-100 text-ink-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-sky-100 text-sky-800',
  POSTED: 'bg-brand-100 text-brand-800',
  PARTIALLY_SETTLED: 'bg-sky-100 text-sky-800',
  SETTLED: 'bg-brand-100 text-brand-800',
  CANCELLED: 'bg-ink-100 text-ink-500',
  REVERSED: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-800',
  CLEARED: 'bg-brand-100 text-brand-800',
  REPORTED: 'bg-brand-100 text-brand-800',
  REJECTED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${STATUS_STYLES[status] ?? 'bg-ink-100 text-ink-700'}`}>{label}</span>
}

/**
 * Empty states teach rather than apologise: they say what the screen is for and what to do next.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      <p className="max-w-md text-sm text-ink-500">{body}</p>
      {action}
    </div>
  )
}
