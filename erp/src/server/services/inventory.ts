/**
 * Stock movements and their ledger effect.
 *
 * Every movement is appended to `stock_movements` and the materialised `stock_balances` row is
 * updated in the same transaction. The balance is a cache: `pnpm stock:rebuild` recomputes it
 * from the movements, and an integration test proves the two agree.
 */
import {
  type MovementKind,
  type StockLayer,
  type StockState,
  type ValuationMethod,
  EMPTY_STATE,
  applyMovement,
} from '@/lib/inventory/valuation'
import { money, qty, qtyToDb, toDb } from '@/lib/money'
import type { Tx } from '../db'

export interface MoveStockParams {
  tenantId: string
  itemId: string
  warehouseId: string
  kind: MovementKind
  date: Date
  quantity: string | number
  /** Required for a receipt; ignored on an issue, which is valued from the state. */
  unitCost?: string | number
  source: string
  sourceId?: string
  reference?: string
  lotCode?: string
  expiresOn?: Date
  userId?: string
}

export interface MoveStockResult {
  movementId: string
  costAmount: string
  unitCost: string
  wentNegative: boolean
  newQuantity: string
}

async function loadState(tx: Tx, params: { tenantId: string; itemId: string; warehouseId: string }, method: ValuationMethod): Promise<StockState> {
  const balance = await tx.stockBalance.findUnique({
    where: { itemId_warehouseId: { itemId: params.itemId, warehouseId: params.warehouseId } },
  })

  if (method !== 'FIFO') {
    return balance
      ? { quantity: qty(balance.quantity.toString()), value: money(balance.value.toString()), layers: [] }
      : EMPTY_STATE
  }

  // FIFO needs the open layers, which are the receipts with quantity still remaining.
  const rows = await tx.stockMovement.findMany({
    where: {
      tenantId: params.tenantId,
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      layerRemaining: { gt: 0 },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })

  const layers: StockLayer[] = rows.map((row) => ({
    id: row.id,
    quantity: qty(row.layerRemaining!.toString()),
    unitCost: money(row.unitCost.toString()),
    receivedAt: row.date,
    lotCode: row.lotCode ?? undefined,
    expiresOn: row.expiresOn ?? undefined,
  }))

  return {
    quantity: balance ? qty(balance.quantity.toString()) : qty(0),
    value: balance ? money(balance.value.toString()) : money(0),
    layers,
  }
}

export async function moveStock(tx: Tx, params: MoveStockParams): Promise<MoveStockResult> {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: params.tenantId },
    select: { valuationMethod: true, allowNegativeStock: true },
  })
  const method = tenant.valuationMethod as ValuationMethod

  const item = await tx.item.findFirstOrThrow({
    where: { id: params.itemId, tenantId: params.tenantId },
    select: { lastCost: true, kind: true, sku: true },
  })

  // Services and non-stock items have no balance to move.
  if (item.kind === 'SERVICE') {
    throw new Error(`${item.sku} is a service and does not hold stock.`)
  }

  const state = await loadState(tx, params, method)
  const result = applyMovement(state, params.kind, params.quantity, {
    method,
    allowNegative: tenant.allowNegativeStock,
    unitCost: params.unitCost,
    receivedAt: params.date,
    lotCode: params.lotCode,
    expiresOn: params.expiresOn,
    fallbackUnitCost: item.lastCost.toString(),
  })

  const isReceipt = params.kind === 'RECEIPT' || params.kind === 'TRANSFER_IN' || params.kind === 'OPENING'

  const movement = await tx.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      kind: params.kind,
      date: params.date,
      quantity: qtyToDb(params.quantity),
      unitCost: toDb(result.unitCost),
      costAmount: toDb(result.costAmount),
      // Only receipts open a FIFO layer.
      layerRemaining: method === 'FIFO' && isReceipt ? qtyToDb(params.quantity) : null,
      lotCode: params.lotCode,
      expiresOn: params.expiresOn,
      source: params.source,
      sourceId: params.sourceId,
      reference: params.reference,
      createdBy: params.userId,
    },
    select: { id: true },
  })

  // Write back what FIFO consumed from each layer.
  if (method === 'FIFO' && !isReceipt) {
    const remainingById = new Map(result.state.layers.map((l) => [l.id, l.quantity]))
    for (const layer of state.layers) {
      const left = remainingById.get(layer.id) ?? qty(0)
      if (!left.equals(layer.quantity)) {
        await tx.stockMovement.update({
          where: { id: layer.id },
          data: { layerRemaining: qtyToDb(left) },
        })
      }
    }
  }

  await tx.stockBalance.upsert({
    where: { itemId_warehouseId: { itemId: params.itemId, warehouseId: params.warehouseId } },
    create: {
      tenantId: params.tenantId,
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      quantity: qtyToDb(result.state.quantity),
      value: toDb(result.state.value),
    },
    update: {
      quantity: qtyToDb(result.state.quantity),
      value: toDb(result.state.value),
    },
  })

  // A receipt refreshes the item's last known cost, which is the fallback for negative stock.
  if (isReceipt && result.unitCost.greaterThan(0)) {
    await tx.item.update({ where: { id: params.itemId }, data: { lastCost: toDb(result.unitCost) } })
  }

  return {
    movementId: movement.id,
    costAmount: toDb(result.costAmount),
    unitCost: toDb(result.unitCost),
    wentNegative: result.wentNegative,
    newQuantity: qtyToDb(result.state.quantity),
  }
}

/** Items at or below their reorder level, for the dashboard and the stock.low webhook. */
export async function lowStockItems(tx: Tx, tenantId: string) {
  return tx.$queryRawUnsafe<Array<{ id: string; sku: string; nameEn: string; nameAr: string; onHand: string; reorderLevel: string }>>(
    `SELECT i.id, i.sku, i."nameEn", i."nameAr",
            COALESCE(SUM(b.quantity), 0)::text AS "onHand",
            i."reorderLevel"::text AS "reorderLevel"
       FROM items i
       LEFT JOIN stock_balances b ON b."itemId" = i.id
      WHERE i."tenantId" = $1::uuid
        AND i.active
        AND i.kind <> 'SERVICE'
        AND i."reorderLevel" > 0
        AND i."deletedAt" IS NULL
      GROUP BY i.id
     HAVING COALESCE(SUM(b.quantity), 0) <= i."reorderLevel"
      ORDER BY i."nameEn"`,
    tenantId,
  )
}
