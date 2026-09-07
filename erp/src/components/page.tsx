/**
 * The shell every list screen shares: a title, optional actions, and a card that either holds
 * a table or teaches the user what the screen is for.
 */
import type { Locale } from '@/lib/i18n/config'

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
      {action}
    </div>
  )
}

export interface Column<T> {
  key: string
  header: string
  /** Right-aligned by default for figures. */
  numeric?: boolean
  render: (row: T, locale: Locale) => React.ReactNode
}

export function DataTable<T>({
  rows,
  columns,
  locale,
  rowKey,
  footer,
}: {
  rows: T[]
  columns: Column<T>[]
  locale: Locale
  rowKey: (row: T) => string
  footer?: React.ReactNode
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? 'text-end' : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'text-end' : undefined}>
                  {column.render(row, locale)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  )
}
