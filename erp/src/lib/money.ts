/**
 * Money and quantity arithmetic.
 *
 * Rule for the whole codebase: money never touches `number`. It is stored as NUMERIC(18,4)
 * in PostgreSQL, carried as `Decimal` in the domain, and converted to a string at the edges.
 * The only place a money value becomes a JS number is inside a chart library.
 */
import Decimal from 'decimal.js'

// 28 significant digits is far beyond NUMERIC(18,4); ROUND_HALF_UP matches what a Saudi
// accountant does by hand and what ZATCA's own examples show.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 })

export type Money = Decimal
export type Quantity = Decimal

/** Scale of monetary columns. Halalas are 2 dp; we keep 4 so line maths does not drift. */
export const MONEY_SCALE = 4
/** Scale of quantity columns. Recipes need grams of a kilo: 6 dp. */
export const QTY_SCALE = 6
/** Scale money is *presented* and settled at. */
export const PRESENTATION_SCALE = 2

export type MoneyInput = Money | string | number | null | undefined

/** Build a money value. Rejects NaN/Infinity loudly rather than poisoning a ledger. */
export function money(value: MoneyInput): Money {
  if (value === null || value === undefined) return new Decimal(0)
  const d = value instanceof Decimal ? value : new Decimal(value)
  if (!d.isFinite()) throw new RangeError(`Not a finite monetary value: ${String(value)}`)
  return d
}

export function qty(value: MoneyInput): Quantity {
  if (value === null || value === undefined) return new Decimal(0)
  const d = value instanceof Decimal ? value : new Decimal(value)
  if (!d.isFinite()) throw new RangeError(`Not a finite quantity: ${String(value)}`)
  return d
}

export const ZERO: Money = new Decimal(0)

/** Round to the storage scale (4 dp). Applied before anything is persisted. */
export function toStorage(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP)
}

export function toQtyStorage(value: MoneyInput): Quantity {
  return qty(value).toDecimalPlaces(QTY_SCALE, Decimal.ROUND_HALF_UP)
}

/** Round to halalas. Applied to document totals and to anything that will be paid. */
export function toHalala(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(PRESENTATION_SCALE, Decimal.ROUND_HALF_UP)
}

export function sum(values: MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(money(v)), new Decimal(0))
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero()
}

/** Two money values are equal if they agree to the storage scale. */
export function eq(a: MoneyInput, b: MoneyInput): boolean {
  return toStorage(a).equals(toStorage(b))
}

/** String form for the database and for XML. Always fixed-scale, never exponential. */
export function toDb(value: MoneyInput): string {
  return toStorage(value).toFixed(MONEY_SCALE)
}

export function qtyToDb(value: MoneyInput): string {
  return toQtyStorage(value).toFixed(QTY_SCALE)
}

/** Two-decimal string, the form ZATCA's UBL and every printed document use. */
export function toAmountString(value: MoneyInput): string {
  return toHalala(value).toFixed(PRESENTATION_SCALE)
}

/**
 * Distribute an amount across weights so the parts add back to exactly the whole.
 *
 * Used for header discounts across lines, landed cost across a receipt, and VAT across a
 * bundle. The remainder from rounding goes to the largest weight, which is what an accountant
 * expects to see and keeps the document balanced to the halala.
 */
export function allocate(total: MoneyInput, weights: MoneyInput[], scale = MONEY_SCALE): Money[] {
  const amount = money(total)
  const w = weights.map((x) => money(x))
  const totalWeight = sum(w)

  if (w.length === 0) return []
  if (totalWeight.isZero()) {
    // No basis to weight by: split evenly and give the remainder to the first part.
    const even = amount.div(w.length).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP)
    const parts = w.map(() => even)
    parts[0] = amount.minus(even.times(w.length - 1))
    return parts.map((p) => p.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP))
  }

  const parts = w.map((weight) =>
    amount.times(weight).div(totalWeight).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP),
  )
  const drift = amount.minus(sum(parts))
  if (!drift.isZero()) {
    let biggest = 0
    for (let i = 1; i < w.length; i += 1) if (w[i].abs().greaterThan(w[biggest].abs())) biggest = i
    parts[biggest] = parts[biggest].plus(drift)
  }
  return parts
}

export { Decimal }
