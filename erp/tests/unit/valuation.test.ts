import { describe, expect, it } from 'vitest'
import {
  EMPTY_STATE,
  StockError,
  allocateLandedCost,
  applyMovement,
  averageCost,
  explodeBom,
  replayMovements,
  type StockState,
} from '@/lib/inventory/valuation'
import { sum } from '@/lib/money'

describe('weighted average', () => {
  const method = 'WEIGHTED_AVERAGE' as const

  it('blends the cost of successive receipts', () => {
    let state: StockState = EMPTY_STATE
    state = applyMovement(state, 'RECEIPT', '100', { method, unitCost: '10' }).state
    state = applyMovement(state, 'RECEIPT', '100', { method, unitCost: '20' }).state

    expect(state.quantity.toFixed(0)).toBe('200')
    expect(state.value.toFixed(2)).toBe('3000.00')
    expect(averageCost(state).toFixed(2)).toBe('15.00')
  })

  it('issues at the running average and leaves the average unchanged', () => {
    let state: StockState = EMPTY_STATE
    state = applyMovement(state, 'RECEIPT', '100', { method, unitCost: '10' }).state
    state = applyMovement(state, 'RECEIPT', '100', { method, unitCost: '20' }).state

    const issue = applyMovement(state, 'ISSUE', '50', { method })
    expect(issue.unitCost.toFixed(2)).toBe('15.00')
    expect(issue.costAmount.toFixed(2)).toBe('750.00')
    expect(averageCost(issue.state).toFixed(2)).toBe('15.00')
    expect(issue.state.value.toFixed(2)).toBe('2250.00')
  })

  it('refuses to issue more than is on hand by default', () => {
    const state = applyMovement(EMPTY_STATE, 'RECEIPT', '5', { method, unitCost: '10' }).state
    try {
      applyMovement(state, 'ISSUE', '6', { method })
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(StockError)
      expect((error as StockError).code).toBe('INSUFFICIENT_STOCK')
      expect((error as StockError).messageAr).toContain('الكمية المتاحة')
    }
  })

  it('flags a negative issue when the tenant allows it', () => {
    const state = applyMovement(EMPTY_STATE, 'RECEIPT', '5', { method, unitCost: '10' }).state
    const issue = applyMovement(state, 'ISSUE', '8', { method, allowNegative: true })
    expect(issue.wentNegative).toBe(true)
    expect(issue.state.quantity.toFixed(0)).toBe('-3')
    expect(issue.unitCost.toFixed(2)).toBe('10.00')
  })

  it('values an issue from an empty balance at the last known cost', () => {
    const issue = applyMovement(EMPTY_STATE, 'ISSUE', '2', {
      method,
      allowNegative: true,
      fallbackUnitCost: '7.50',
    })
    expect(issue.costAmount.toFixed(2)).toBe('15.00')
  })

  it('empties the value exactly when the last unit leaves', () => {
    let state: StockState = EMPTY_STATE
    state = applyMovement(state, 'RECEIPT', '3', { method, unitCost: '10' }).state
    state = applyMovement(state, 'RECEIPT', '3', { method, unitCost: '20' }).state
    state = applyMovement(state, 'ISSUE', '6', { method }).state
    expect(state.quantity.toFixed(0)).toBe('0')
    expect(state.value.toFixed(2)).toBe('0.00')
  })
})

describe('FIFO', () => {
  const method = 'FIFO' as const
  const build = () => {
    let state: StockState = EMPTY_STATE
    state = applyMovement(state, 'RECEIPT', '100', {
      method, unitCost: '10', layerId: 'L1', receivedAt: new Date('2026-01-01'),
    }).state
    state = applyMovement(state, 'RECEIPT', '100', {
      method, unitCost: '20', layerId: 'L2', receivedAt: new Date('2026-02-01'),
    }).state
    return state
  }

  it('consumes the oldest layer first', () => {
    const issue = applyMovement(build(), 'ISSUE', '50', { method })
    expect(issue.costAmount.toFixed(2)).toBe('500.00')
    expect(issue.unitCost.toFixed(2)).toBe('10.00')
    expect(issue.state.layers).toHaveLength(2)
    expect(issue.state.layers[0].quantity.toFixed(0)).toBe('50')
  })

  it('spans layers when an issue is larger than the oldest', () => {
    const issue = applyMovement(build(), 'ISSUE', '150', { method })
    // 100 @ 10 + 50 @ 20
    expect(issue.costAmount.toFixed(2)).toBe('2000.00')
    expect(issue.state.layers).toHaveLength(1)
    expect(issue.state.layers[0].id).toBe('L2')
    expect(issue.state.layers[0].quantity.toFixed(0)).toBe('50')
  })

  it('gives a different cost of sale from weighted average, as it should', () => {
    const fifo = applyMovement(build(), 'ISSUE', '50', { method })
    let wavg: StockState = EMPTY_STATE
    wavg = applyMovement(wavg, 'RECEIPT', '100', { method: 'WEIGHTED_AVERAGE', unitCost: '10' }).state
    wavg = applyMovement(wavg, 'RECEIPT', '100', { method: 'WEIGHTED_AVERAGE', unitCost: '20' }).state
    const avg = applyMovement(wavg, 'ISSUE', '50', { method: 'WEIGHTED_AVERAGE' })

    expect(fifo.costAmount.toFixed(2)).toBe('500.00')
    expect(avg.costAmount.toFixed(2)).toBe('750.00')
  })

  it('refuses to issue past the last layer by default', () => {
    expect(() => applyMovement(build(), 'ISSUE', '201', { method })).toThrow(/Only 200/)
  })

  it('values an over-issue at the newest layer cost when allowed', () => {
    const issue = applyMovement(build(), 'ISSUE', '210', { method, allowNegative: true })
    // 100@10 + 100@20 + 10@20 (last known)
    expect(issue.costAmount.toFixed(2)).toBe('3200.00')
    expect(issue.wentNegative).toBe(true)
    expect(issue.state.layers).toHaveLength(0)
  })

  it('orders layers by receipt date, not insertion order', () => {
    let state: StockState = EMPTY_STATE
    state = applyMovement(state, 'RECEIPT', '10', { method, unitCost: '99', layerId: 'late', receivedAt: new Date('2026-06-01') }).state
    state = applyMovement(state, 'RECEIPT', '10', { method, unitCost: '1', layerId: 'early', receivedAt: new Date('2026-01-01') }).state
    const issue = applyMovement(state, 'ISSUE', '10', { method })
    expect(issue.unitCost.toFixed(2)).toBe('1.00')
  })
})

describe('movement guards', () => {
  it('refuses a negative quantity — direction comes from the movement kind', () => {
    expect(() => applyMovement(EMPTY_STATE, 'RECEIPT', '-5', { method: 'WEIGHTED_AVERAGE', unitCost: '1' })).toThrow(/positive/i)
  })

  it('refuses a zero-quantity movement', () => {
    expect(() => applyMovement(EMPTY_STATE, 'RECEIPT', '0', { method: 'WEIGHTED_AVERAGE', unitCost: '1' })).toThrow(/no effect/i)
  })

  it('refuses a negative receipt cost', () => {
    expect(() => applyMovement(EMPTY_STATE, 'RECEIPT', '1', { method: 'WEIGHTED_AVERAGE', unitCost: '-1' })).toThrow(/negative unit cost/i)
  })
})

describe('replayMovements', () => {
  it('reproduces the same balance the running state holds — the rebuild invariant', () => {
    const movements = [
      { kind: 'RECEIPT' as const, quantity: '100', unitCost: '10', id: 'A', receivedAt: new Date('2026-01-01') },
      { kind: 'ISSUE' as const, quantity: '30' },
      { kind: 'RECEIPT' as const, quantity: '50', unitCost: '14', id: 'B', receivedAt: new Date('2026-02-01') },
      { kind: 'ISSUE' as const, quantity: '80' },
      { kind: 'TRANSFER_IN' as const, quantity: '20', unitCost: '12', id: 'C', receivedAt: new Date('2026-03-01') },
    ]

    for (const method of ['WEIGHTED_AVERAGE', 'FIFO'] as const) {
      const replayed = replayMovements(movements, method)
      let running = EMPTY_STATE
      for (const m of movements) {
        running = applyMovement(running, m.kind, m.quantity, {
          method, unitCost: m.unitCost, layerId: m.id, receivedAt: m.receivedAt,
        }).state
      }
      expect(replayed.quantity.toFixed(6)).toBe(running.quantity.toFixed(6))
      expect(replayed.value.toFixed(4)).toBe(running.value.toFixed(4))
      expect(replayed.quantity.toFixed(0)).toBe('60')
    }
  })
})

describe('allocateLandedCost', () => {
  it('spreads freight by value and adds back to the exact total', () => {
    const result = allocateLandedCost(
      [
        { itemId: 'a', quantity: '10', lineValue: '1000' },
        { itemId: 'b', quantity: '5', lineValue: '3000' },
      ],
      '400',
    )
    expect(sum(result.map((r) => r.allocated)).toFixed(2)).toBe('400.00')
    expect(result[0].allocated.toFixed(2)).toBe('100.00')
    expect(result[1].allocated.toFixed(2)).toBe('300.00')
    expect(result[0].newUnitCost.toFixed(2)).toBe('110.00')
    expect(result[1].newUnitCost.toFixed(2)).toBe('660.00')
  })

  it('can allocate by quantity or by weight instead', () => {
    const lines = [
      { itemId: 'a', quantity: '10', lineValue: '1000', weight: '5' },
      { itemId: 'b', quantity: '10', lineValue: '3000', weight: '15' },
    ]
    const byQty = allocateLandedCost(lines, '400', 'QUANTITY')
    expect(byQty.map((r) => r.allocated.toFixed(2))).toEqual(['200.00', '200.00'])

    const byWeight = allocateLandedCost(lines, '400', 'WEIGHT')
    expect(byWeight.map((r) => r.allocated.toFixed(2))).toEqual(['100.00', '300.00'])
  })

  it('never loses a halala on an awkward split', () => {
    const result = allocateLandedCost(
      Array.from({ length: 7 }, (_, i) => ({ itemId: `i${i}`, quantity: '3', lineValue: '111.11' })),
      '1000.03',
    )
    expect(sum(result.map((r) => r.allocated)).toFixed(2)).toBe('1000.03')
  })
})

describe('explodeBom', () => {
  it('multiplies each component by the output quantity', () => {
    const required = explodeBom(
      [
        { itemId: 'chicken', quantityPer: '0.35' },
        { itemId: 'rice', quantityPer: '0.25' },
      ],
      '40',
    )
    expect(required[0].quantity.toFixed(3)).toBe('14.000')
    expect(required[1].quantity.toFixed(3)).toBe('10.000')
  })

  it('grosses up for wastage so the usable quantity is what the recipe needs', () => {
    // 20% trim loss on fresh vegetables: 1 kg usable needs 1.25 kg bought.
    const required = explodeBom([{ itemId: 'onion', quantityPer: '1', wastageRate: '0.2' }], '1')
    expect(required[0].quantity.toFixed(4)).toBe('1.2500')
  })

  it('refuses a wastage rate that would consume the whole component', () => {
    expect(() => explodeBom([{ itemId: 'x', quantityPer: '1', wastageRate: '1' }], '1')).toThrow(/consume the whole/i)
  })

  it('refuses a non-positive output', () => {
    expect(() => explodeBom([{ itemId: 'x', quantityPer: '1' }], '0')).toThrow(/positive/i)
  })
})
