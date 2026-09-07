/**
 * The posting service — the single door into the general ledger.
 *
 * Nothing else in the application inserts a `journal_entries` or `journal_lines` row. A module
 * builds a `PostingRequest` describing what happened in business terms and hands it here; this
 * service resolves account roles, checks the period, validates through the domain engine, and
 * writes the entry inside the caller's transaction so the document and its ledger effect commit
 * or fail together.
 */
import {
  type BuiltJournalEntry,
  type FiscalPeriodView,
  type PostingRequest,
  PostingError,
  assertPeriodOpen,
  buildJournalEntry,
  reverseEntry,
} from '@/lib/accounting/posting'
import type { AccountRole } from '@/lib/accounting/accounts'
import { toDb } from '@/lib/money'
import { allocateNumber } from './sequence'
import type { Tx } from '../db'

interface AccountLookup {
  byRole: Map<string, string>
  byId: Set<string>
}

async function loadAccounts(tx: Tx, tenantId: string): Promise<AccountLookup> {
  const accounts = await tx.account.findMany({
    where: { tenantId, active: true },
    select: { id: true, role: true, postable: true },
  })

  const byRole = new Map<string, string>()
  const byId = new Set<string>()
  for (const account of accounts) {
    byId.add(account.id)
    if (account.role && account.postable) byRole.set(account.role, account.id)
  }
  return { byRole, byId }
}

async function loadPeriods(tx: Tx, tenantId: string): Promise<FiscalPeriodView[]> {
  const periods = await tx.fiscalPeriod.findMany({
    where: { tenantId },
    select: { startsOn: true, endsOn: true, status: true },
    orderBy: { startsOn: 'asc' },
  })
  return periods.map((p) => ({
    startsOn: p.startsOn,
    // A period's end date is inclusive; compare against the end of that day.
    endsOn: new Date(new Date(p.endsOn).setUTCHours(23, 59, 59, 999)),
    status: p.status as FiscalPeriodView['status'],
  }))
}

export interface PostResult {
  entryId: string
  number: string
  entry: BuiltJournalEntry
}

/**
 * Validate and write a posting.
 *
 * `userId` is recorded on the entry, not taken from an ambient context, so a background job
 * posting on a user's behalf is always attributable.
 */
export async function post(
  tx: Tx,
  request: PostingRequest,
  userId?: string,
): Promise<PostResult> {
  const periods = await loadPeriods(tx, request.tenantId)
  assertPeriodOpen(request.date, periods)

  const entry = buildJournalEntry(request)
  const accounts = await loadAccounts(tx, request.tenantId)

  for (const line of entry.lines) {
    if (!line.accountId && line.role) {
      const resolved = accounts.byRole.get(line.role)
      if (!resolved) {
        throw new PostingError(
          'ROLE_UNMAPPED',
          `No account is mapped to the role ${line.role}. Assign one in Settings → Chart of accounts.`,
          `لا يوجد حساب مرتبط بالدور ${line.role}. حدّد الحساب من الإعدادات ← دليل الحسابات.`,
        )
      }
      line.accountId = resolved
    }
    if (!line.accountId || !accounts.byId.has(line.accountId)) {
      throw new PostingError(
        'UNKNOWN_ACCOUNT',
        `Line ${line.lineNo} refers to an account that does not exist in this tenant.`,
        `السطر ${line.lineNo} يشير إلى حساب غير موجود في هذه المنشأة.`,
      )
    }
  }

  const period = await tx.fiscalPeriod.findFirst({
    where: { tenantId: request.tenantId, startsOn: { lte: request.date }, endsOn: { gte: request.date } },
    select: { id: true },
  })

  const number = await allocateNumber(tx, {
    tenantId: request.tenantId,
    branchId: request.branchId,
    kind: 'JOURNAL_ENTRY',
    date: request.date,
  })

  const created = await tx.journalEntry.create({
    data: {
      tenantId: entry.tenantId,
      branchId: entry.branchId,
      number,
      date: entry.date,
      periodId: period?.id,
      source: entry.source,
      sourceId: entry.sourceId,
      reference: entry.reference,
      memoEn: entry.memoEn,
      memoAr: entry.memoAr,
      currencyCode: entry.currencyCode,
      exchangeRate: entry.exchangeRate.toString(),
      status: 'POSTED',
      totalDebit: toDb(entry.totalDebit),
      totalCredit: toDb(entry.totalCredit),
      createdBy: userId,
      lines: {
        create: entry.lines.map((line) => ({
          tenantId: entry.tenantId,
          lineNo: line.lineNo,
          accountId: line.accountId!,
          branchId: line.branchId,
          debit: toDb(line.debit),
          credit: toDb(line.credit),
          currencyAmount: line.currencyAmount ? toDb(line.currencyAmount) : null,
          partyId: line.partyId,
          itemId: line.itemId,
          employeeId: line.employeeId,
          memoEn: line.memoEn,
          memoAr: line.memoAr,
        })),
      },
    },
    select: { id: true, number: true },
  })

  return { entryId: created.id, number: created.number, entry }
}

/**
 * Reverse a posted entry.
 *
 * The original is marked REVERSED and linked to its reversal, so the audit trail shows both
 * and the trial balance nets to zero across the pair.
 */
export async function reverse(
  tx: Tx,
  entryId: string,
  options: { tenantId: string; date?: Date; userId?: string },
): Promise<PostResult> {
  const original = await tx.journalEntry.findFirst({
    where: { id: entryId, tenantId: options.tenantId },
    include: { lines: true },
  })
  if (!original) throw new Error('The journal entry to reverse was not found.')
  if (original.status !== 'POSTED') {
    throw new PostingError(
      'NOT_POSTED',
      `Only a posted entry can be reversed; ${original.number} is ${original.status}.`,
      `لا يمكن عكس إلا قيد مرحّل؛ القيد ${original.number} حالته ${original.status}.`,
    )
  }

  const built = buildJournalEntry({
    tenantId: original.tenantId,
    branchId: original.branchId,
    date: original.date,
    source: original.source as PostingRequest['source'],
    sourceId: original.sourceId ?? undefined,
    reference: original.reference ?? undefined,
    lines: original.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit.toString(),
      credit: l.credit.toString(),
      branchId: l.branchId,
      partyId: l.partyId ?? undefined,
      itemId: l.itemId ?? undefined,
      employeeId: l.employeeId ?? undefined,
      memoEn: l.memoEn ?? undefined,
      memoAr: l.memoAr ?? undefined,
    })),
  })

  const reversal = reverseEntry(built, { date: options.date ?? new Date() })
  const result = await post(tx, {
    tenantId: reversal.tenantId,
    branchId: reversal.branchId,
    date: reversal.date,
    source: reversal.source,
    sourceId: reversal.sourceId,
    reference: reversal.reference,
    memoEn: reversal.memoEn,
    memoAr: reversal.memoAr,
    currencyCode: reversal.currencyCode,
    exchangeRate: reversal.exchangeRate,
    lines: reversal.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      branchId: l.branchId,
      partyId: l.partyId,
      itemId: l.itemId,
      employeeId: l.employeeId,
      memoEn: l.memoEn,
      memoAr: l.memoAr,
    })),
  }, options.userId)

  await tx.journalEntry.update({
    where: { id: entryId },
    data: { status: 'REVERSED', reversedById: result.entryId, updatedBy: options.userId },
  })

  return result
}

/** Resolve one account role to an id; used by services that need an account directly. */
export async function accountIdForRole(tx: Tx, tenantId: string, role: AccountRole): Promise<string> {
  const account = await tx.account.findFirst({
    where: { tenantId, role, active: true, postable: true },
    select: { id: true },
  })
  if (!account) {
    throw new PostingError(
      'ROLE_UNMAPPED',
      `No account is mapped to the role ${role}.`,
      `لا يوجد حساب مرتبط بالدور ${role}.`,
    )
  }
  return account.id
}
