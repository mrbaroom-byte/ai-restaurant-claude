/**
 * The till's offline queue.
 *
 * A sale is written to IndexedDB the instant it is rung up, before any network call. The queue
 * then drains whenever the browser is online. Because every sale carries an idempotency key
 * generated at ring-up, a batch that is sent twice — a timeout, a refresh, a flaky 4G link —
 * posts exactly once on the server.
 *
 * IndexedDB rather than localStorage: a busy Friday can queue thousands of sales, and
 * localStorage is both small and synchronous.
 */
export interface QueuedSale {
  idempotencyKey: string
  soldAt: string
  tableCode?: string
  coverCount?: number
  tipAmount?: string
  tenders: Array<{ method: string; amount: string }>
  lines: Array<{
    itemId: string
    quantity: string
    unitPrice: string
    discount?: string
    modifiers?: Array<{ code: string; nameEn: string; nameAr: string; priceChange?: string }>
  }>
  /** Set once the server has confirmed it; kept briefly so the receipt can be reprinted. */
  syncedAt?: string
  invoiceNumber?: string
  lastError?: string
}

const DB_NAME = 'nakhla-pos'
const DB_VERSION = 1
const STORE = 'pending_sales'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'idempotencyKey' })
        store.createIndex('syncedAt', 'syncedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = work(transaction.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export async function enqueue(sale: QueuedSale): Promise<void> {
  await withStore('readwrite', (store) => store.put(sale))
}

export async function pending(): Promise<QueuedSale[]> {
  const all = await withStore<QueuedSale[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedSale[]>)
  return all.filter((sale) => !sale.syncedAt)
}

export async function markSynced(idempotencyKey: string, invoiceNumber?: string): Promise<void> {
  const sale = await withStore<QueuedSale | undefined>('readonly', (store) => store.get(idempotencyKey))
  if (!sale) return
  await withStore('readwrite', (store) => store.put({ ...sale, syncedAt: new Date().toISOString(), invoiceNumber }))
}

export async function markFailed(idempotencyKey: string, error: string): Promise<void> {
  const sale = await withStore<QueuedSale | undefined>('readonly', (store) => store.get(idempotencyKey))
  if (!sale) return
  await withStore('readwrite', (store) => store.put({ ...sale, lastError: error }))
}

/** Drop sales confirmed more than a day ago; the invoice is the record from then on. */
export async function pruneSynced(olderThanMs = 86_400_000): Promise<number> {
  const all = await withStore<QueuedSale[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedSale[]>)
  const cutoff = Date.now() - olderThanMs
  const stale = all.filter((sale) => sale.syncedAt && new Date(sale.syncedAt).getTime() < cutoff)
  for (const sale of stale) {
    await withStore('readwrite', (store) => store.delete(sale.idempotencyKey))
  }
  return stale.length
}

export interface SyncOutcome {
  sent: number
  created: number
  duplicates: number
  rejected: Array<{ idempotencyKey: string; error: string }>
  conflicts: string[]
}

/**
 * Drain the queue to the server.
 *
 * The server is the authority on price, so a sale rung up at a stale price comes back with a
 * conflict note; the sale still posts, and the note is shown in the session close report.
 */
export async function drain(params: { sessionId: string; warehouseId: string; batchSize?: number }): Promise<SyncOutcome> {
  const queue = (await pending()).slice(0, params.batchSize ?? 50)
  const outcome: SyncOutcome = { sent: queue.length, created: 0, duplicates: 0, rejected: [], conflicts: [] }
  if (queue.length === 0) return outcome

  const response = await fetch('/api/v1/pos/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: params.sessionId,
      warehouseId: params.warehouseId,
      sales: queue.map(({ syncedAt, invoiceNumber, lastError, ...sale }) => {
        void syncedAt
        void invoiceNumber
        void lastError
        return sale
      }),
    }),
  })

  if (!response.ok) {
    // The whole batch stays queued: a failed request is not a lost sale.
    const body = await response.json().catch(() => null)
    const message = body?.error?.message ?? `The server replied ${response.status}.`
    for (const sale of queue) await markFailed(sale.idempotencyKey, message)
    throw new Error(message)
  }

  const { results } = (await response.json()) as {
    results: Array<{ idempotencyKey: string; status: string; invoiceNumber?: string; conflictNote?: string; error?: string }>
  }

  for (const result of results) {
    if (result.status === 'REJECTED') {
      await markFailed(result.idempotencyKey, result.error ?? 'Rejected by the server.')
      outcome.rejected.push({ idempotencyKey: result.idempotencyKey, error: result.error ?? '' })
      continue
    }
    await markSynced(result.idempotencyKey, result.invoiceNumber)
    if (result.status === 'CREATED') outcome.created += 1
    else outcome.duplicates += 1
    if (result.conflictNote) outcome.conflicts.push(result.conflictNote)
  }

  return outcome
}
