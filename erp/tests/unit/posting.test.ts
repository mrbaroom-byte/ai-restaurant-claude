import { describe, expect, it } from 'vitest'
import {
  PostingError,
  assertPeriodOpen,
  buildJournalEntry,
  buildTrialBalance,
  naturalBalance,
  reverseEntry,
  type PostingRequest,
} from '@/lib/accounting/posting'
import { money } from '@/lib/money'

const base = (lines: PostingRequest['lines']): PostingRequest => ({
  tenantId: 't1',
  branchId: 'b1',
  date: new Date('2026-03-15T00:00:00Z'),
  source: 'SALES_INVOICE',
  reference: 'INV-JED-2026-000001',
  lines,
})

describe('buildJournalEntry', () => {
  it('accepts a balanced entry and normalises amounts to storage scale', () => {
    const entry = buildJournalEntry(
      base([
        { role: 'ACCOUNTS_RECEIVABLE', debit: '115' },
        { role: 'SALES_REVENUE', credit: '100' },
        { role: 'VAT_OUTPUT', credit: '15' },
      ]),
    )
    expect(entry.totalDebit.toFixed(4)).toBe('115.0000')
    expect(entry.totalCredit.toFixed(4)).toBe('115.0000')
    expect(entry.lines).toHaveLength(3)
    expect(entry.lines[0].lineNo).toBe(1)
    expect(entry.currencyCode).toBe('SAR')
  })

  it('refuses an unbalanced entry and says by how much, in both languages', () => {
    try {
      buildJournalEntry(
        base([
          { role: 'ACCOUNTS_RECEIVABLE', debit: '115' },
          { role: 'SALES_REVENUE', credit: '100' },
        ]),
      )
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(PostingError)
      const e = error as PostingError
      expect(e.code).toBe('UNBALANCED')
      expect(e.message).toContain('15.00')
      expect(e.messageAr).toContain('غير متوازن')
    }
  })

  it('refuses a negative amount rather than quietly flipping the side', () => {
    expect(() =>
      buildJournalEntry(base([{ role: 'BANK', debit: '-10' }, { role: 'SALES_REVENUE', credit: '-10' }])),
    ).toThrow(/negative/i)
  })

  it('refuses a line that is both a debit and a credit', () => {
    expect(() =>
      buildJournalEntry(base([{ role: 'BANK', debit: '10', credit: '5' }, { role: 'SALES_REVENUE', credit: '5' }])),
    ).toThrow(/both a debit and a credit/i)
  })

  it('refuses a line with no account', () => {
    expect(() =>
      buildJournalEntry(base([{ debit: '10' }, { role: 'SALES_REVENUE', credit: '10' }])),
    ).toThrow(/no account/i)
  })

  it('refuses a single-sided entry', () => {
    expect(() => buildJournalEntry(base([{ role: 'BANK', debit: '10' }]))).toThrow(/at least two lines/i)
  })

  it('refuses an entry with no tenant or branch', () => {
    expect(() =>
      buildJournalEntry({ ...base([{ role: 'BANK', debit: '1' }, { role: 'SALES_REVENUE', credit: '1' }]), tenantId: '' }),
    ).toThrow(/tenant/i)
    expect(() =>
      buildJournalEntry({ ...base([{ role: 'BANK', debit: '1' }, { role: 'SALES_REVENUE', credit: '1' }]), branchId: '' }),
    ).toThrow(/branch/i)
  })

  it('rejects a non-positive exchange rate', () => {
    expect(() =>
      buildJournalEntry({
        ...base([{ role: 'BANK', debit: '1' }, { role: 'SALES_REVENUE', credit: '1' }]),
        exchangeRate: '0',
      }),
    ).toThrow(/exchange rate/i)
  })

  it('balances a long entry with awkward fractions', () => {
    const entry = buildJournalEntry(
      base([
        { role: 'ACCOUNTS_RECEIVABLE', debit: '333.3333' },
        { role: 'ACCOUNTS_RECEIVABLE', debit: '333.3333' },
        { role: 'ACCOUNTS_RECEIVABLE', debit: '333.3334' },
        { role: 'SALES_REVENUE', credit: '1000' },
      ]),
    )
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true)
  })
})

describe('reverseEntry', () => {
  it('produces the exact opposite of the original', () => {
    const original = buildJournalEntry(
      base([
        { role: 'ACCOUNTS_RECEIVABLE', debit: '115' },
        { role: 'SALES_REVENUE', credit: '100' },
        { role: 'VAT_OUTPUT', credit: '15' },
      ]),
    )
    const reversed = reverseEntry(original, { date: new Date('2026-04-01T00:00:00Z') })

    expect(reversed.totalDebit.equals(original.totalCredit)).toBe(true)
    expect(reversed.lines[0].credit.toFixed(2)).toBe('115.00')
    expect(reversed.lines[0].debit.toFixed(2)).toBe('0.00')
    expect(reversed.reference).toBe('REV-INV-JED-2026-000001')
    expect(reversed.memoAr).toContain('عكس قيد')

    // The pair together nets to nothing, which is what "reversed" has to mean.
    for (const role of ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'VAT_OUTPUT'] as const) {
      const net = [...original.lines, ...reversed.lines]
        .filter((l) => l.role === role)
        .reduce((acc, l) => acc.plus(l.debit).minus(l.credit), money(0))
      expect(net.isZero()).toBe(true)
    }
  })
})

describe('assertPeriodOpen', () => {
  const periods = [
    { startsOn: new Date('2026-01-01'), endsOn: new Date('2026-01-31T23:59:59Z'), status: 'CLOSED' as const },
    { startsOn: new Date('2026-02-01'), endsOn: new Date('2026-02-28T23:59:59Z'), status: 'LOCKED' as const },
    { startsOn: new Date('2026-03-01'), endsOn: new Date('2026-03-31T23:59:59Z'), status: 'OPEN' as const },
  ]

  it('allows a posting into an open period', () => {
    expect(() => assertPeriodOpen(new Date('2026-03-15'), periods)).not.toThrow()
  })

  it('names the closed period it is refusing', () => {
    try {
      assertPeriodOpen(new Date('2026-01-15'), periods)
      throw new Error('should have refused')
    } catch (error) {
      const e = error as PostingError
      expect(e.code).toBe('PERIOD_CLOSED')
      expect(e.message).toContain('2026-01-01')
      expect(e.message).toContain('2026-01-31')
      expect(e.messageAr).toContain('مقفلة')
    }
  })

  it('refuses a locked period too', () => {
    expect(() => assertPeriodOpen(new Date('2026-02-10'), periods)).toThrow(/locked/i)
  })

  it('refuses a date no period covers, rather than inventing one', () => {
    expect(() => assertPeriodOpen(new Date('2027-05-01'), periods)).toThrow(/No fiscal period/i)
  })
})

describe('buildTrialBalance', () => {
  const row = (accountId: string, code: string, type: 'ASSET' | 'REVENUE' | 'LIABILITY', debit: string, credit: string) => ({
    accountId,
    accountCode: code,
    accountNameEn: code,
    accountNameAr: code,
    accountType: type,
    debit: money(debit),
    credit: money(credit),
  })

  it('nets each account onto one side and balances', () => {
    const tb = buildTrialBalance([
      row('a', '1130', 'ASSET', '115', '0'),
      row('a', '1130', 'ASSET', '0', '115'),
      row('b', '1120', 'ASSET', '115', '0'),
      row('c', '4100', 'REVENUE', '0', '100'),
      row('d', '2120', 'LIABILITY', '0', '15'),
    ])

    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit.toFixed(2)).toBe('115.00')
    expect(tb.totalCredit.toFixed(2)).toBe('115.00')

    // A fully settled receivable shows as zero on both sides, not 115 in each column.
    const ar = tb.rows.find((r) => r.accountId === 'a')!
    expect(ar.debit.toFixed(2)).toBe('0.00')
    expect(ar.credit.toFixed(2)).toBe('0.00')
  })

  it('sorts by account code so it reads like a printed trial balance', () => {
    const tb = buildTrialBalance([
      row('c', '4100', 'REVENUE', '0', '100'),
      row('b', '1120', 'ASSET', '100', '0'),
    ])
    expect(tb.rows.map((r) => r.accountCode)).toEqual(['1120', '4100'])
  })
})

describe('naturalBalance', () => {
  it('reports a debit-natural account positively when it is in debit', () => {
    expect(naturalBalance('ASSET', money('100'), money('40')).toFixed(2)).toBe('60.00')
    expect(naturalBalance('REVENUE', money('0'), money('100')).toFixed(2)).toBe('100.00')
    expect(naturalBalance('LIABILITY', money('20'), money('100')).toFixed(2)).toBe('80.00')
  })
})
