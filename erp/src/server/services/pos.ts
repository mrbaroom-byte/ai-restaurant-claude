/**
 * Point of sale.
 *
 * A POS sale is a simplified tax invoice — there is no second sales ledger and no separate
 * numbering. What is different is how it arrives: a till may have been offline, so a batch of
 * sales replays at once and must post exactly once however many times it is sent.
 *
 * Idempotency is a unique index on (tenantId, idempotencyKey). The client generates the key
 * when the sale is rung up, so a replay after a timeout, a double tap, or a browser refresh
 * all resolve to the same sale.
 */
import { money, toDb, sum } from '@/lib/money'
import { buildCashVariancePosting } from '@/lib/accounting/documents'
import { createDraft, postInvoice, type DraftLineInput } from './invoice'
import { post } from './posting'
import { allocateNumber } from './sequence'
import type { Tx } from '../db'

export interface PosTender {
  method: 'CASH' | 'MADA' | 'VISA' | 'MASTERCARD' | 'APPLE_PAY' | 'STC_PAY' | 'CREDIT'
  amount: string | number
}

export interface PosSaleInput {
  /** Client-generated UUID. The same key always resolves to the same sale. */
  idempotencyKey: string
  soldAt: string | Date
  tableCode?: string
  coverCount?: number
  tipAmount?: string | number
  tenders: PosTender[]
  lines: Array<{
    itemId: string
    quantity: string | number
    /** Price the till showed. The server re-prices and wins if they disagree. */
    unitPrice: string | number
    discount?: string | number
    modifiers?: Array<{ code: string; nameEn: string; nameAr: string; priceChange?: string }>
  }>
}

export interface SyncResult {
  idempotencyKey: string
  status: 'CREATED' | 'DUPLICATE' | 'REJECTED'
  invoiceId?: string
  invoiceNumber?: string
  /** Set when the server re-priced a line the till had stale. */
  conflictNote?: string
  error?: string
}

/**
 * Replay a batch of offline sales.
 *
 * Each sale is its own transaction: one bad sale in a batch must not block the rest, and the
 * till needs a per-sale verdict so it knows what to clear from its queue.
 */
export async function syncSales(
  runInTransaction: <T>(work: (tx: Tx) => Promise<T>) => Promise<T>,
  params: { tenantId: string; sessionId: string; warehouseId: string; userId?: string; sales: PosSaleInput[] },
): Promise<SyncResult[]> {
  const results: SyncResult[] = []

  for (const sale of params.sales) {
    try {
      const result = await runInTransaction((tx) => syncOne(tx, { ...params, sale }))
      results.push(result)
    } catch (error) {
      results.push({
        idempotencyKey: sale.idempotencyKey,
        status: 'REJECTED',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

async function syncOne(
  tx: Tx,
  params: { tenantId: string; sessionId: string; warehouseId: string; userId?: string; sale: PosSaleInput },
): Promise<SyncResult> {
  const { sale } = params

  // Already synced? Return the same answer, never a second invoice.
  const existing = await tx.posSale.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: params.tenantId, idempotencyKey: sale.idempotencyKey } },
    include: { invoice: { select: { id: true, number: true } } },
  })
  if (existing) {
    return {
      idempotencyKey: sale.idempotencyKey,
      status: 'DUPLICATE',
      invoiceId: existing.invoice?.id,
      invoiceNumber: existing.invoice?.number ?? undefined,
      conflictNote: existing.conflictNote ?? undefined,
    }
  }

  const session = await tx.posSession.findFirstOrThrow({
    where: { id: params.sessionId, tenantId: params.tenantId },
    select: { id: true, branchId: true, status: true },
  })
  if (session.status !== 'OPEN') {
    throw new Error('This till session is closed. Open a new session before syncing.')
  }

  // Re-price from the item master. The till may have been offline through a price change;
  // the server's price is the one that goes in the books, and the difference is logged.
  const conflicts: string[] = []
  const lines: DraftLineInput[] = []

  for (const line of sale.lines) {
    const item = await tx.item.findFirstOrThrow({
      where: { id: line.itemId, tenantId: params.tenantId },
      select: { id: true, sku: true, nameEn: true, nameAr: true, sellingPrice: true, vatCategory: true, uom: { select: { uneceCode: true } } },
    })

    const serverPrice = money(item.sellingPrice.toString())
    const tillPrice = money(line.unitPrice)
    if (!serverPrice.equals(tillPrice)) {
      conflicts.push(
        `${item.sku}: the till had ${tillPrice.toFixed(2)}, the price list has ${serverPrice.toFixed(2)}.`,
      )
    }

    // Modifiers can carry a price change, e.g. an extra shot.
    const modifierTotal = sum((line.modifiers ?? []).map((m) => m.priceChange ?? 0))

    lines.push({
      itemId: item.id,
      descriptionEn: item.nameEn,
      descriptionAr: item.nameAr,
      unitCode: item.uom.uneceCode,
      quantity: line.quantity,
      unitPrice: serverPrice.plus(modifierTotal).toString(),
      discount: line.discount,
      warehouseId: params.warehouseId,
      modifiers: line.modifiers,
    })
  }

  const soldAt = sale.soldAt instanceof Date ? sale.soldAt : new Date(sale.soldAt)

  const posSale = await tx.posSale.create({
    data: {
      tenantId: params.tenantId,
      sessionId: session.id,
      idempotencyKey: sale.idempotencyKey,
      soldAt,
      tableCode: sale.tableCode,
      coverCount: sale.coverCount,
      tipAmount: toDb(sale.tipAmount ?? 0),
      tenders: sale.tenders as never,
      conflictNote: conflicts.length ? conflicts.join(' ') : null,
    },
  })

  const draft = await createDraft(tx, {
    tenantId: params.tenantId,
    branchId: session.branchId,
    kind: 'SIMPLIFIED',
    date: soldAt,
    lines,
    paymentMeansCode: sale.tenders[0]?.method === 'CASH' ? '10' : '48',
    userId: params.userId,
  })

  await tx.invoice.update({ where: { id: draft.id }, data: { posSaleId: posSale.id } })

  const posted = await postInvoice(tx, {
    tenantId: params.tenantId,
    invoiceId: draft.id,
    userId: params.userId,
    settlement: sale.tenders.every((t) => t.method === 'CASH') ? 'CASH' : 'BANK',
  })

  // Keep the session's expected cash in step, so the close-out report is right.
  const cashTaken = sum(sale.tenders.filter((t) => t.method === 'CASH').map((t) => t.amount))
  if (cashTaken.greaterThan(0)) {
    await tx.posSession.update({
      where: { id: session.id },
      data: { expectedCash: { increment: toDb(cashTaken) as never } },
    })
  }

  return {
    idempotencyKey: sale.idempotencyKey,
    status: 'CREATED',
    invoiceId: posted.invoiceId,
    invoiceNumber: posted.number,
    conflictNote: conflicts.length ? conflicts.join(' ') : undefined,
  }
}

export async function openSession(
  tx: Tx,
  params: { tenantId: string; branchId: string; userId: string; terminalCode: string; openingFloat: string | number },
) {
  const open = await tx.posSession.findFirst({
    where: { tenantId: params.tenantId, terminalCode: params.terminalCode, status: 'OPEN' },
  })
  if (open) {
    throw new Error(
      `Till ${params.terminalCode} already has an open session (${open.number}). Close it before opening another.`,
    )
  }

  const number = await allocateNumber(tx, {
    tenantId: params.tenantId,
    branchId: params.branchId,
    kind: 'POS_SESSION',
    date: new Date(),
  })

  return tx.posSession.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      userId: params.userId,
      number,
      terminalCode: params.terminalCode,
      openingFloat: toDb(params.openingFloat),
      expectedCash: toDb(params.openingFloat),
      status: 'OPEN',
    },
  })
}

/** Close a session, posting the difference between counted and expected cash. */
export async function closeSession(
  tx: Tx,
  params: { tenantId: string; sessionId: string; countedCash: string | number; userId?: string },
) {
  const session = await tx.posSession.findFirstOrThrow({
    where: { id: params.sessionId, tenantId: params.tenantId },
  })
  if (session.status !== 'OPEN') throw new Error('This session is already closed.')

  const expected = money(session.expectedCash.toString())
  const counted = money(params.countedCash)
  const variance = counted.minus(expected)

  let entryId: string | undefined
  const posting = buildCashVariancePosting({
    context: {
      tenantId: params.tenantId,
      branchId: session.branchId,
      date: new Date(),
      reference: session.number,
    },
    expected,
    counted,
  })
  if (posting) {
    const result = await post(tx, posting, params.userId)
    entryId = result.entryId
  }

  return tx.posSession.update({
    where: { id: session.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      countedCash: toDb(counted),
      variance: toDb(variance),
      entryId,
    },
  })
}
