import { describe, expect, it } from 'vitest'
import { Decimal, allocate, eq, money, qtyToDb, sum, toAmountString, toDb, toHalala, toStorage } from '@/lib/money'

describe('money', () => {
  it('never loses precision on the classic float traps', () => {
    expect(toDb(money('0.1').plus(money('0.2')))).toBe('0.3000')
    expect(money('1.005').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)).toBe('1.01')
  })

  it('rejects values that would poison a ledger', () => {
    expect(() => money(Number.NaN)).toThrow(RangeError)
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('rounds half up, the way a Saudi accountant does by hand', () => {
    expect(toHalala('2.345').toFixed(2)).toBe('2.35')
    expect(toHalala('2.344').toFixed(2)).toBe('2.34')
    expect(toHalala('-2.345').toFixed(2)).toBe('-2.35')
  })

  it('stores money at four decimals and quantity at six', () => {
    expect(toDb('12.3')).toBe('12.3000')
    expect(qtyToDb('0.0000005')).toBe('0.000001')
  })

  it('treats values equal at storage scale as equal', () => {
    expect(eq('10.00001', '10.00002')).toBe(true)
    expect(eq('10.0001', '10.0002')).toBe(false)
  })
})

describe('allocate', () => {
  it('always adds back to the original amount', () => {
    const parts = allocate('100.00', ['1', '1', '1'])
    expect(sum(parts).toFixed(4)).toBe('100.0000')
  })

  it('gives the rounding remainder to the largest weight', () => {
    const parts = allocate('10.00', ['1', '1', '1'])
    // 3.3333 each leaves 0.0001; it lands on the first of the equal weights.
    expect(parts.map((p) => p.toFixed(4))).toEqual(['3.3334', '3.3333', '3.3333'])
    expect(sum(parts).toFixed(4)).toBe('10.0000')
  })

  it('weights proportionally', () => {
    const parts = allocate('150.00', ['100', '50'])
    expect(parts.map((p) => p.toFixed(2))).toEqual(['100.00', '50.00'])
  })

  it('splits evenly when there is nothing to weight by', () => {
    const parts = allocate('9.99', ['0', '0', '0'])
    expect(sum(parts).toFixed(2)).toBe('9.99')
  })

  it('handles a landed cost spread over many awkward weights', () => {
    const weights = ['33.33', '66.67', '0.01', '900.99']
    const parts = allocate('1234.56', weights)
    expect(sum(parts).toFixed(4)).toBe('1234.5600')
  })

  it('formats amounts for print at two decimals', () => {
    expect(toAmountString('115')).toBe('115.00')
    expect(toAmountString(toStorage('114.9950'))).toBe('115.00')
  })
})
