/**
 * An in-memory ledger for the invariant tests.
 *
 * It does what `src/server/services/posting.ts` does — resolve roles to accounts, refuse a
 * closed period, append lines — but against arrays instead of Postgres, so the accounting
 * invariants can be exercised over whole business scenarios with no database.
 */
import {
  type BuiltJournalEntry,
  type FiscalPeriodView,
  type PostingRequest,
  type TrialBalanceRow,
  assertPeriodOpen,
  buildJournalEntry,
  buildTrialBalance,
  reverseEntry,
} from '@/lib/accounting/posting'
import { DEFAULT_CHART_OF_ACCOUNTS, type AccountRole, type AccountType } from '@/lib/accounting/accounts'
import { type Money, ZERO, money, toStorage } from '@/lib/money'

interface AccountRecord {
  id: string
  code: string
  nameEn: string
  nameAr: string
  type: AccountType
  role?: AccountRole
}

export class TestLedger {
  readonly accounts: AccountRecord[]
  readonly entries: BuiltJournalEntry[] = []
  periods: FiscalPeriodView[]

  constructor(periods?: FiscalPeriodView[]) {
    this.accounts = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.postable).map((a) => ({
      id: `acc-${a.code}`,
      code: a.code,
      nameEn: a.nameEn,
      nameAr: a.nameAr,
      type: a.type,
      role: a.role,
    }))
    this.periods = periods ?? [
      { startsOn: new Date('2026-01-01'), endsOn: new Date('2026-12-31T23:59:59Z'), status: 'OPEN' },
    ]
  }

  accountByRole(role: AccountRole): AccountRecord {
    const found = this.accounts.find((a) => a.role === role)
    if (!found) throw new Error(`No account carries the role ${role}`)
    return found
  }

  accountByCode(code: string): AccountRecord {
    const found = this.accounts.find((a) => a.code === code)
    if (!found) throw new Error(`No account with code ${code}`)
    return found
  }

  /** Validate, resolve roles, and append. Mirrors the real posting service. */
  post(request: PostingRequest): BuiltJournalEntry {
    assertPeriodOpen(request.date, this.periods)
    const entry = buildJournalEntry(request)
    for (const line of entry.lines) {
      if (!line.accountId && line.role) line.accountId = this.accountByRole(line.role).id
      if (!line.accountId) throw new Error('Line resolved to no account')
    }
    this.entries.push(entry)
    return entry
  }

  reverse(entry: BuiltJournalEntry, date?: Date): BuiltJournalEntry {
    const reversal = reverseEntry(entry, { date })
    assertPeriodOpen(reversal.date, this.periods)
    this.entries.push(reversal)
    return reversal
  }

  private rows(filter?: { from?: Date; to?: Date; branchId?: string }): TrialBalanceRow[] {
    const rows: TrialBalanceRow[] = []
    for (const entry of this.entries) {
      if (filter?.from && entry.date < filter.from) continue
      if (filter?.to && entry.date > filter.to) continue
      for (const line of entry.lines) {
        if (filter?.branchId && line.branchId !== filter.branchId) continue
        const account = this.accounts.find((a) => a.id === line.accountId)!
        rows.push({
          accountId: account.id,
          accountCode: account.code,
          accountNameEn: account.nameEn,
          accountNameAr: account.nameAr,
          accountType: account.type,
          debit: line.debit,
          credit: line.credit,
        })
      }
    }
    return rows
  }

  trialBalance(filter?: { from?: Date; to?: Date; branchId?: string }) {
    return buildTrialBalance(this.rows(filter))
  }

  /** Net movement on one account, debit positive. */
  balanceOf(role: AccountRole): Money {
    const account = this.accountByRole(role)
    let net = ZERO
    for (const entry of this.entries) {
      for (const line of entry.lines) {
        if (line.accountId === account.id) net = net.plus(line.debit).minus(line.credit)
      }
    }
    return toStorage(net)
  }

  balanceOfCode(code: string): Money {
    const account = this.accountByCode(code)
    let net = ZERO
    for (const entry of this.entries) {
      for (const line of entry.lines) {
        if (line.accountId === account.id) net = net.plus(line.debit).minus(line.credit)
      }
    }
    return toStorage(net)
  }

  closePeriod(startsOn: Date, endsOn: Date): void {
    this.periods = this.periods.map((p) =>
      p.startsOn.getTime() === startsOn.getTime() && p.endsOn.getTime() === endsOn.getTime()
        ? { ...p, status: 'CLOSED' as const }
        : p,
    )
  }

  /** Split the year into months so a period can be closed independently. */
  static monthlyPeriods(year: number): FiscalPeriodView[] {
    return Array.from({ length: 12 }, (_, i) => ({
      startsOn: new Date(Date.UTC(year, i, 1)),
      endsOn: new Date(Date.UTC(year, i + 1, 0, 23, 59, 59)),
      status: 'OPEN' as const,
    }))
  }
}

export { money }
