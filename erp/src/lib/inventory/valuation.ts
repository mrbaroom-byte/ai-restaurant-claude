/**
 * Stock valuation.
 *
 * Two methods, chosen per tenant and locked after the first movement because switching
 * mid-life would restate every historical cost of sale.
 *
 *   Weighted average — the default. One running cost per (item, warehouse); simple to explain
 *   to an owner and what most Saudi SMEs already use.
 *
 *   FIFO — layered. Each receipt is a layer; issues consume the oldest layer first. Needed when
 *   costs move sharply (imported goods, coffee green beans) or when an auditor asks for it.
 *
 * This module is pure: it takes the current state and a movement, and returns the new state
 * plus the cost to post. Persistence lives in the inventory service.
 */
import { Decimal, type Money, type Quantity, ZERO, allocate, money, qty, toQtyStorage, toStorage } from '../money'

export type ValuationMethod = 'WEIGHTED_AVERAGE' | 'FIFO'

export type MovementKind =
  | 'RECEIPT'          // goods receipt, production output, positive adjustment
  | 'ISSUE'            // sale, production consumption, negative adjustment
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'OPENING'

export interface StockLayer {
  /** Identifies the receipt this layer came from, for FIFO traceability. */
  id: string
  quantity: Quantity
  unitCost: Money
  receivedAt: Date
  lotCode?: string
  expiresOn?: Date
}

export interface StockState {
  quantity: Quantity
  /** Total value on hand. For weighted average this drives the unit cost. */
  value: Money
  /** FIFO only; empty for weighted average. */
  layers: StockLayer[]
}

export const EMPTY_STATE: StockState = { quantity: ZERO, value: ZERO, layers: [] }

export interface ValuationResult {
  state: StockState
  /** Cost to post: debit inventory on a receipt, credit inventory on an issue. */
  costAmount: Money
  /** Unit cost actually applied — what the movement row records. */
  unitCost: Money
  /**
   * Set when an issue was allowed to take stock negative. The cost then uses the last known
   * unit cost, and the UI flags it so somebody reconciles rather than discovering it at
   * year-end. Configurable per tenant (`allowNegativeStock`).
   */
  wentNegative: boolean
}

export class StockError extends Error {
  readonly code: string
  readonly messageAr: string
  constructor(code: string, en: string, ar: string) {
    super(en)
    this.name = 'StockError'
    this.code = code
    this.messageAr = ar
  }
}

/** Weighted average unit cost. Zero when nothing is on hand. */
export function averageCost(state: StockState): Money {
  if (state.quantity.isZero()) return ZERO
  return toStorage(state.value.div(state.quantity))
}

export interface ApplyOptions {
  method: ValuationMethod
  allowNegative?: boolean
  /** Cost supplied by the caller — required on a receipt, ignored on an issue. */
  unitCost?: Money | string | number
  layerId?: string
  receivedAt?: Date
  lotCode?: string
  expiresOn?: Date
  /** Last known unit cost, used when an issue drives the balance negative. */
  fallbackUnitCost?: Money | string | number
}

function receive(state: StockState, quantity: Quantity, options: ApplyOptions): ValuationResult {
  const unitCost = toStorage(options.unitCost ?? 0)
  if (unitCost.isNegative()) {
    throw new StockError('NEGATIVE_COST', 'A receipt cannot have a negative unit cost.', 'لا يمكن أن تكون تكلفة الوحدة سالبة عند الاستلام.')
  }
  const costAmount = toStorage(quantity.times(unitCost))

  const layers =
    options.method === 'FIFO'
      ? [
          ...state.layers,
          {
            id: options.layerId ?? `layer-${state.layers.length + 1}`,
            quantity,
            unitCost,
            receivedAt: options.receivedAt ?? new Date(),
            lotCode: options.lotCode,
            expiresOn: options.expiresOn,
          },
        ]
      : []

  return {
    state: {
      quantity: toQtyStorage(state.quantity.plus(quantity)),
      value: toStorage(state.value.plus(costAmount)),
      layers,
    },
    costAmount,
    unitCost,
    wentNegative: false,
  }
}

function issueWeightedAverage(state: StockState, quantity: Quantity, options: ApplyOptions): ValuationResult {
  const available = state.quantity
  const shortfall = quantity.minus(available)

  if (shortfall.greaterThan(0) && !options.allowNegative) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `Only ${available.toFixed(3)} in stock but ${quantity.toFixed(3)} was requested.`,
      `الكمية المتاحة ${available.toFixed(3)} بينما المطلوب ${quantity.toFixed(3)}.`,
    )
  }

  // Use the running average; if the balance is already zero or negative there is no average
  // to use, so fall back to the last known cost the caller supplies.
  const unitCost = available.greaterThan(0) ? averageCost(state) : toStorage(options.fallbackUnitCost ?? 0)
  const costAmount = toStorage(quantity.times(unitCost))

  return {
    state: {
      quantity: toQtyStorage(available.minus(quantity)),
      value: toStorage(state.value.minus(costAmount)),
      layers: [],
    },
    costAmount,
    unitCost,
    wentNegative: shortfall.greaterThan(0),
  }
}

function issueFifo(state: StockState, quantity: Quantity, options: ApplyOptions): ValuationResult {
  let remaining = quantity
  let costAmount = ZERO
  const layers: StockLayer[] = []

  // Oldest first. Ties broken by layer id so the result is deterministic.
  const ordered = [...state.layers].sort(
    (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id),
  )

  for (const layer of ordered) {
    if (remaining.isZero() || remaining.isNegative()) {
      layers.push(layer)
      continue
    }
    const take = Decimal.min(layer.quantity, remaining)
    costAmount = costAmount.plus(take.times(layer.unitCost))
    remaining = remaining.minus(take)
    const left = layer.quantity.minus(take)
    if (left.greaterThan(0)) layers.push({ ...layer, quantity: toQtyStorage(left) })
  }

  if (remaining.greaterThan(0)) {
    if (!options.allowNegative) {
      throw new StockError(
        'INSUFFICIENT_STOCK',
        `Only ${state.quantity.toFixed(3)} in stock but ${quantity.toFixed(3)} was requested.`,
        `الكمية المتاحة ${state.quantity.toFixed(3)} بينما المطلوب ${quantity.toFixed(3)}.`,
      )
    }
    // Nothing left to consume: value the remainder at the last layer's cost, or the fallback.
    const lastCost = ordered.at(-1)?.unitCost ?? toStorage(options.fallbackUnitCost ?? 0)
    costAmount = costAmount.plus(remaining.times(lastCost))
  }

  const newQuantity = toQtyStorage(state.quantity.minus(quantity))
  return {
    state: {
      quantity: newQuantity,
      value: toStorage(state.value.minus(costAmount)),
      layers,
    },
    costAmount: toStorage(costAmount),
    unitCost: quantity.isZero() ? ZERO : toStorage(costAmount.div(quantity)),
    wentNegative: remaining.greaterThan(0),
  }
}

/**
 * Apply one movement to a stock state.
 *
 * The caller passes the *absolute* quantity; direction comes from `kind`. That keeps negative
 * numbers out of the stock ledger for the same reason they are kept out of the general ledger.
 */
export function applyMovement(
  state: StockState,
  kind: MovementKind,
  quantityInput: Quantity | string | number,
  options: ApplyOptions,
): ValuationResult {
  const quantity = toQtyStorage(qty(quantityInput))
  if (quantity.isNegative()) {
    throw new StockError(
      'NEGATIVE_QUANTITY',
      'Movement quantity must be positive; use the movement kind to say which way stock is going.',
      'يجب أن تكون كمية الحركة موجبة؛ استخدم نوع الحركة لتحديد الاتجاه.',
    )
  }
  if (quantity.isZero()) {
    throw new StockError('ZERO_QUANTITY', 'A stock movement of zero has no effect.', 'حركة المخزون بكمية صفر بلا أثر.')
  }

  switch (kind) {
    case 'RECEIPT':
    case 'TRANSFER_IN':
    case 'OPENING':
      return receive(state, quantity, options)
    case 'ISSUE':
    case 'TRANSFER_OUT':
      return options.method === 'FIFO'
        ? issueFifo(state, quantity, options)
        : issueWeightedAverage(state, quantity, options)
    default: {
      const exhaustive: never = kind
      throw new StockError('UNKNOWN_MOVEMENT', `Unknown movement kind ${String(exhaustive)}.`, 'نوع حركة مخزون غير معروف.')
    }
  }
}

/**
 * Landed cost: spread freight, customs and clearing over the goods on a receipt.
 *
 * Allocation basis is value by default, which is what an auditor expects; weight is offered
 * because a freight bill for a container is genuinely weight-driven.
 */
export interface LandedCostLine {
  itemId: string
  quantity: Quantity | string | number
  /** Goods value of the line, before landed cost. */
  lineValue: Money | string | number
  weight?: Money | string | number
}

export function allocateLandedCost(
  lines: LandedCostLine[],
  totalLandedCost: Money | string | number,
  basis: 'VALUE' | 'QUANTITY' | 'WEIGHT' = 'VALUE',
): Array<{ itemId: string; allocated: Money; newUnitCost: Money }> {
  const weights = lines.map((line) => {
    if (basis === 'QUANTITY') return qty(line.quantity)
    if (basis === 'WEIGHT') return money(line.weight ?? 0)
    return money(line.lineValue)
  })

  // Reuse the ledger allocator so landed cost adds back to the bill to the halala.
  const shares = allocate(totalLandedCost, weights)

  return lines.map((line, i) => {
    const quantity = qty(line.quantity)
    const allocated = shares[i]
    const newUnitCost = quantity.isZero()
      ? ZERO
      : toStorage(money(line.lineValue).plus(allocated).div(quantity))
    return { itemId: line.itemId, allocated, newUnitCost }
  })
}

/**
 * Rebuild a stock state from its movement history.
 *
 * Used by `pnpm stock:rebuild` and by the invariant test that proves the materialised balance
 * always equals the sum of movements.
 */
export function replayMovements(
  movements: Array<{ kind: MovementKind; quantity: Quantity | string | number; unitCost?: Money | string | number; id?: string; receivedAt?: Date }>,
  method: ValuationMethod,
  allowNegative = false,
): StockState {
  let state = EMPTY_STATE
  let lastCost: Money = ZERO
  for (const movement of movements) {
    const result = applyMovement(state, movement.kind, movement.quantity, {
      method,
      allowNegative,
      unitCost: movement.unitCost,
      layerId: movement.id,
      receivedAt: movement.receivedAt,
      fallbackUnitCost: lastCost,
    })
    state = result.state
    if (!result.unitCost.isZero()) lastCost = result.unitCost
  }
  return state
}

/**
 * Bill of materials explosion for production.
 *
 * A restaurant recipe, a 3D-print build and a coffee roast batch are the same shape: consume
 * components in fixed proportions, produce a finished good, and post the difference between
 * component cost and produced value to a variance account.
 */
export interface BomComponent {
  itemId: string
  /** Quantity per one unit of the finished good. */
  quantityPer: Quantity | string | number
  /** Expected loss, as a fraction: 0.05 for 5% trim/evaporation. */
  wastageRate?: Money | string | number
}

export function explodeBom(
  components: BomComponent[],
  outputQuantity: Quantity | string | number,
): Array<{ itemId: string; quantity: Quantity }> {
  const output = qty(outputQuantity)
  if (output.lessThanOrEqualTo(0)) {
    throw new StockError('BAD_OUTPUT', 'Production output must be positive.', 'كمية الإنتاج يجب أن تكون موجبة.')
  }
  return components.map((c) => {
    const wastage = money(c.wastageRate ?? 0)
    if (wastage.greaterThanOrEqualTo(1)) {
      throw new StockError(
        'BAD_WASTAGE',
        `Wastage of ${wastage.times(100).toFixed(1)}% would consume the whole component.`,
        `نسبة الهدر ${wastage.times(100).toFixed(1)}% تستهلك المكوّن بالكامل.`,
      )
    }
    // Gross up so the *usable* quantity after wastage is what the recipe calls for.
    const required = qty(c.quantityPer).times(output).div(new Decimal(1).minus(wastage))
    return { itemId: c.itemId, quantity: toQtyStorage(required) }
  })
}
