import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEQUENCES,
  SequenceError,
  allocate,
  assertNoGaps,
  formatNumber,
  type SequenceDefinition,
} from '@/lib/sequence'

const definition = (over: Partial<SequenceDefinition> = {}): SequenceDefinition => ({
  kind: 'INVOICE',
  prefix: 'INV',
  branchCode: 'JED',
  resetYearly: true,
  padding: 6,
  lastNumber: 0,
  year: 2026,
  gapFree: true,
  ...over,
})

describe('number formatting', () => {
  it('reads as prefix, branch, year, counter', () => {
    expect(formatNumber(definition(), 123)).toBe('INV-JED-2026-000123')
  })

  it('drops the branch when the sequence is tenant-wide', () => {
    expect(formatNumber(definition({ branchCode: undefined }), 7)).toBe('INV-2026-000007')
  })

  it('drops the year when the counter does not reset', () => {
    expect(formatNumber(definition({ resetYearly: false }), 7)).toBe('INV-JED-000007')
  })

  it('honours the configured padding', () => {
    expect(formatNumber(definition({ padding: 3 }), 7)).toBe('INV-JED-2026-007')
    // A counter past the padding widens rather than truncating.
    expect(formatNumber(definition({ padding: 3 }), 12345)).toBe('INV-JED-2026-12345')
  })
})

describe('allocation', () => {
  it('issues consecutive numbers', () => {
    let def = definition()
    const issued: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const result = allocate(def, new Date('2026-05-01'))
      issued.push(result.number)
      def = result.next
    }
    expect(issued).toEqual(['INV-JED-2026-000001', 'INV-JED-2026-000002', 'INV-JED-2026-000003'])
  })

  it('restarts the counter in a new year without anybody running a job', () => {
    const def = definition({ lastNumber: 4821, year: 2026 })
    const result = allocate(def, new Date('2027-01-01'))
    expect(result.number).toBe('INV-JED-2027-000001')
    expect(result.next.year).toBe(2027)
  })

  it('keeps counting when the sequence does not reset yearly', () => {
    const def = definition({ resetYearly: false, lastNumber: 4821 })
    expect(allocate(def, new Date('2027-01-01')).number).toBe('INV-JED-004822')
  })

  it('does not mutate the definition it was given', () => {
    const def = definition({ lastNumber: 5 })
    allocate(def, new Date('2026-05-01'))
    expect(def.lastNumber).toBe(5)
  })
})

describe('gap detection', () => {
  it('accepts a complete run', () => {
    expect(() => assertNoGaps('INVOICE', [1, 2, 3, 4, 5])).not.toThrow()
  })

  it('accepts a run given out of order', () => {
    expect(() => assertNoGaps('INVOICE', [3, 1, 5, 4, 2])).not.toThrow()
  })

  it('accepts an empty set', () => {
    expect(() => assertNoGaps('INVOICE', [])).not.toThrow()
  })

  it('reports a missing number, naming both sides of the gap', () => {
    try {
      assertNoGaps('INVOICE', [1, 2, 4])
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(SequenceError)
      expect((error as SequenceError).message).toContain('between 2 and 4')
      expect((error as SequenceError).messageAr).toMatch(/[؀-ۿ]/)
    }
  })

  it('reports a duplicate, which is worse than a gap', () => {
    expect(() => assertNoGaps('INVOICE', [1, 2, 2, 3])).toThrow(/issued twice/)
  })
})

describe('default sequences', () => {
  it('covers every document kind exactly once', () => {
    const kinds = DEFAULT_SEQUENCES.map((s) => s.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('makes every tax document gap-free', () => {
    const taxDocuments = ['INVOICE', 'SIMPLIFIED_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'JOURNAL_ENTRY']
    for (const kind of taxDocuments) {
      expect(DEFAULT_SEQUENCES.find((s) => s.kind === kind)?.gapFree, kind).toBe(true)
    }
  })

  it('gives every sequence a distinct prefix', () => {
    const prefixes = DEFAULT_SEQUENCES.map((s) => s.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })
})
