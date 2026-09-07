'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeDocument } from '@/lib/tax/vat'
import { formatMoney, type Locale } from '@/lib/i18n/config'
import { drain, enqueue, pending, type QueuedSale } from '@/lib/pos/queue'
import { closeSessionAction, openSessionAction } from '@/server/actions/pos'

interface PosItem {
  id: string
  sku: string
  nameEn: string
  nameAr: string
  price: string
  priceIncludesVat: boolean
  categoryId: string | null
  categoryEn: string | null
  categoryAr: string | null
}

interface Labels {
  title: string; openSession: string; closeSession: string; openingFloat: string
  countedCash: string; cash: string; mada: string; card: string; stcPay: string
  pay: string; offline: string; queued: string; syncNow: string; total: string
  subtotal: string; vat: string; all: string; search: string; cancel: string; empty: string
}

interface Line {
  item: PosItem
  quantity: number
}

const TENDERS = [
  { method: 'CASH', labelKey: 'cash' },
  { method: 'MADA', labelKey: 'mada' },
  { method: 'VISA', labelKey: 'card' },
  { method: 'STC_PAY', labelKey: 'stcPay' },
] as const

export function Till({
  locale,
  items,
  vatRate,
  warehouseId,
  branchId,
  session,
  labels,
}: {
  locale: Locale
  items: PosItem[]
  vatRate: string
  warehouseId: string
  branchId: string
  session: { id: string; number: string } | null
  labels: Labels
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [online, setOnline] = useState(true)
  const [queueLength, setQueueLength] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const name = (item: { nameAr: string; nameEn: string }) => (locale === 'ar' ? item.nameAr : item.nameEn)

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>()
    for (const item of items) {
      if (item.categoryId && !seen.has(item.categoryId)) {
        seen.set(item.categoryId, {
          id: item.categoryId,
          label: locale === 'ar' ? item.categoryAr ?? '' : item.categoryEn ?? '',
        })
      }
    }
    return [...seen.values()]
  }, [items, locale])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => {
      if (category && item.categoryId !== category) return false
      if (!needle) return true
      return (
        item.sku.toLowerCase().includes(needle) ||
        item.nameEn.toLowerCase().includes(needle) ||
        item.nameAr.includes(search.trim())
      )
    })
  }, [items, category, search])

  // The till totals the sale with the same VAT engine the server uses, so the figure on screen
  // is the figure that gets posted.
  const totals = useMemo(
    () =>
      computeDocument({
        lines: lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.item.price,
          vatCategory: 'STANDARD',
          vatRate,
          priceIncludesVat: line.item.priceIncludesVat,
        })),
      }),
    [lines, vatRate],
  )

  const refreshQueue = useCallback(async () => {
    try {
      setQueueLength((await pending()).length)
    } catch {
      // A browser with IndexedDB disabled still sells; it just cannot queue offline.
      setQueueLength(0)
    }
  }, [])

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    void refreshQueue()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [refreshQueue])

  const sync = useCallback(async () => {
    if (!session || !navigator.onLine) return
    try {
      const outcome = await drain({ sessionId: session.id, warehouseId })
      await refreshQueue()
      if (outcome.conflicts.length) setMessage(outcome.conflicts.join(' '))
      else if (outcome.rejected.length) setMessage(outcome.rejected[0].error)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }, [session, warehouseId, refreshQueue])

  // Drain whenever the connection returns, and on a slow timer while it holds.
  useEffect(() => {
    if (!online) return
    void sync()
    const timer = setInterval(() => void sync(), 30_000)
    return () => clearInterval(timer)
  }, [online, sync])

  function addLine(item: PosItem) {
    setLines((current) => {
      const existing = current.find((line) => line.item.id === item.id)
      if (existing) {
        return current.map((line) => (line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { item, quantity: 1 }]
    })
  }

  function changeQuantity(itemId: string, delta: number) {
    setLines((current) =>
      current
        .map((line) => (line.item.id === itemId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    )
  }

  async function takePayment(method: string) {
    if (lines.length === 0 || !session) return
    setBusy(true)
    setMessage(null)

    const sale: QueuedSale = {
      idempotencyKey: crypto.randomUUID(),
      soldAt: new Date().toISOString(),
      tenders: [{ method, amount: totals.payableTotal.toFixed(2) }],
      lines: lines.map((line) => ({
        itemId: line.item.id,
        quantity: String(line.quantity),
        unitPrice: line.item.price,
      })),
    }

    try {
      // Queue first, then try to send. A sale is never lost to a dropped connection.
      await enqueue(sale)
      setLines([])
      await refreshQueue()
      await sync()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <form action={openSessionAction} className="card mx-auto max-w-sm p-6">
        <input type="hidden" name="branchId" value={branchId} />
        <h1 className="mb-4 text-lg font-semibold">{labels.openSession}</h1>
        <label htmlFor="openingFloat" className="mb-1.5 block text-sm font-medium text-ink-700">
          {labels.openingFloat}
        </label>
        <input
          id="openingFloat"
          name="openingFloat"
          type="number"
          step="0.01"
          min="0"
          defaultValue="500"
          className="field"
          dir="ltr"
        />
        <label htmlFor="terminalCode" className="mb-1.5 mt-4 block text-sm font-medium text-ink-700">
          POS
        </label>
        <input id="terminalCode" name="terminalCode" defaultValue="TILL-1" className="field" dir="ltr" />
        <button type="submit" className="btn-primary mt-4 w-full">
          {labels.openSession}
        </button>
      </form>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.search}
            className="field max-w-xs"
            // A barcode scanner types into whatever has focus, so this stays focused by default.
            autoFocus
          />
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`btn ${category === null ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
          >
            {labels.all}
          </button>
          {categories.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={`btn ${category === entry.id ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addLine(item)}
              className="card flex min-h-[5.5rem] flex-col justify-between p-3 text-start transition active:scale-[0.98]"
            >
              <span className="text-sm font-medium leading-snug">{name(item)}</span>
              <span className="num mt-2 text-sm text-ink-500">{formatMoney(item.price, locale)}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="card flex flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h1 className="text-sm font-semibold">{labels.title}</h1>
          <span className="num text-xs text-ink-500">{session.number}</span>
        </header>

        {!online && (
          <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{labels.offline}</p>
        )}
        {queueLength > 0 && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 text-xs">
            <span className="text-ink-600">
              <span className="num">{queueLength}</span> {labels.queued}
            </span>
            <button type="button" onClick={() => void sync()} className="text-brand-700 hover:underline">
              {labels.syncNow}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-400">{labels.empty}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {lines.map((line) => (
                <li key={line.item.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="flex-1 text-sm">{name(line.item)}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(line.item.id, -1)}
                    aria-label="-"
                    className="h-7 w-7 rounded border border-[var(--border)] text-sm"
                  >
                    −
                  </button>
                  <span className="num w-8 text-center text-sm">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(line.item.id, 1)}
                    aria-label="+"
                    className="h-7 w-7 rounded border border-[var(--border)] text-sm"
                  >
                    +
                  </button>
                  <span className="num w-20 text-end text-sm">
                    {formatMoney(Number(line.item.price) * line.quantity, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 border-t border-[var(--border)] px-4 py-3 text-sm">
          <div className="flex justify-between text-ink-600">
            <span>{labels.subtotal}</span>
            <span className="num">{formatMoney(totals.taxableTotal.toString(), locale)}</span>
          </div>
          <div className="flex justify-between text-ink-600">
            <span>{labels.vat}</span>
            <span className="num">{formatMoney(totals.vatTotal.toString(), locale)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-semibold">
            <span>{labels.total}</span>
            <span className="num">{formatMoney(totals.payableTotal.toString(), locale)}</span>
          </div>
        </div>

        {message && (
          <p role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {message}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] p-3">
          {TENDERS.map((tender) => (
            <button
              key={tender.method}
              type="button"
              disabled={busy || lines.length === 0}
              onClick={() => void takePayment(tender.method)}
              className="btn-primary min-h-[3rem]"
            >
              {labels[tender.labelKey]}
            </button>
          ))}
        </div>

        <form action={closeSessionAction} className="flex gap-2 border-t border-[var(--border)] p-3">
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            name="countedCash"
            type="number"
            step="0.01"
            min="0"
            placeholder={labels.countedCash}
            className="field flex-1"
            dir="ltr"
            required
          />
          <button type="submit" className="btn-secondary">
            {labels.closeSession}
          </button>
        </form>
      </aside>
    </div>
  )
}
