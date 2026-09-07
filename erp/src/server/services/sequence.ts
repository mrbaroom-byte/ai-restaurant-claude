/**
 * Gap-free document numbering.
 *
 * The counter row is locked with `SELECT ... FOR UPDATE` inside the caller's transaction, so
 * two concurrent invoices queue rather than collide. Because the lock is held to commit, a
 * transaction that rolls back releases the number and the next document reuses it — which is
 * exactly what "gap-free" requires.
 */
import { type DocumentKind, allocate, formatNumber, type SequenceDefinition } from '@/lib/sequence'
import type { Tx } from '../db'

export interface AllocateParams {
  tenantId: string
  branchId?: string | null
  kind: DocumentKind
  date: Date
  branchCode?: string
}

export async function allocateNumber(tx: Tx, params: AllocateParams): Promise<string> {
  const scopeBranch = params.branchId ?? null

  // Lock the counter row. Two invoices posted at the same instant serialise here.
  const locked = await tx.$queryRawUnsafe<Array<{ id: string; prefix: string; resetYearly: boolean; padding: number; lastNumber: number; year: number; gapFree: boolean }>>(
    `SELECT id, prefix, "resetYearly", padding, "lastNumber", year, "gapFree"
       FROM sequences
      WHERE "tenantId" = $1::uuid
        AND "kind" = $2
        AND ("branchId" IS NOT DISTINCT FROM $3::uuid)
      FOR UPDATE`,
    params.tenantId,
    params.kind,
    scopeBranch,
  )

  if (locked.length === 0) {
    throw new Error(
      `No ${params.kind} number sequence is configured for this branch. Add one in Settings → Number sequences.`,
    )
  }

  const row = locked[0]
  const definition: SequenceDefinition = {
    kind: params.kind,
    prefix: row.prefix,
    branchCode: params.branchCode,
    resetYearly: row.resetYearly,
    padding: row.padding,
    lastNumber: row.lastNumber,
    year: row.year,
    gapFree: row.gapFree,
  }

  const result = allocate(definition, params.date)

  await tx.$executeRawUnsafe(
    `UPDATE sequences SET "lastNumber" = $1, year = $2, "updatedAt" = now() WHERE id = $3::uuid`,
    result.next.lastNumber,
    result.next.year,
    row.id,
  )

  return result.number
}

/** Preview the next number without consuming it, for the "new invoice" screen. */
export async function peekNumber(tx: Tx, params: AllocateParams): Promise<string | null> {
  const row = await tx.sequence.findFirst({
    where: { tenantId: params.tenantId, branchId: params.branchId ?? null, kind: params.kind },
  })
  if (!row) return null

  const year = params.date.getUTCFullYear()
  const rolled = row.resetYearly && year !== row.year
  return formatNumber(
    {
      kind: params.kind,
      prefix: row.prefix,
      branchCode: params.branchCode,
      resetYearly: row.resetYearly,
      padding: row.padding,
      lastNumber: 0,
      year,
      gapFree: row.gapFree,
    },
    rolled ? 1 : row.lastNumber + 1,
  )
}
