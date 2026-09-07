'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { requirePermission } from '../session'
import { recordAudit } from '../services/audit'

/**
 * Closing a period is the point at which a month stops moving. It is deliberately a two-way
 * door — reopening is allowed and audited — because a small business finds a missing receipt
 * a week after the close more often than it finds fraud.
 */
export async function closePeriodAction(formData: FormData): Promise<void> {
  const principal = await requirePermission('accounting.close')
  const periodId = String(formData.get('periodId'))

  const period = await prisma.fiscalPeriod.findFirstOrThrow({
    where: { id: periodId, tenantId: principal.tenantId },
  })

  await prisma.fiscalPeriod.update({
    where: { id: period.id },
    data: { status: 'CLOSED', closedAt: new Date(), closedBy: principal.userId },
  })

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'fiscal_periods',
    entityId: period.id,
    action: 'CLOSE',
    before: { status: period.status },
    after: { status: 'CLOSED' },
  })

  revalidatePath('/periods')
}

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  const principal = await requirePermission('accounting.close')
  const periodId = String(formData.get('periodId'))

  const period = await prisma.fiscalPeriod.findFirstOrThrow({
    where: { id: periodId, tenantId: principal.tenantId },
  })
  if (period.status === 'LOCKED') {
    throw new Error('A locked period belongs to a filed year and cannot be reopened here.')
  }

  await prisma.fiscalPeriod.update({
    where: { id: period.id },
    data: { status: 'OPEN', closedAt: null, closedBy: null },
  })

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'fiscal_periods',
    entityId: period.id,
    action: 'REOPEN',
    before: { status: period.status },
    after: { status: 'OPEN' },
  })

  revalidatePath('/periods')
}
