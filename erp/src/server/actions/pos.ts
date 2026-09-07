'use server'

import { revalidatePath } from 'next/cache'
import { withTenant } from '../db'
import { requirePermission } from '../session'
import { closeSession, openSession } from '../services/pos'
import { recordAudit } from '../services/audit'

export async function openSessionAction(formData: FormData): Promise<void> {
  const principal = await requirePermission('pos.operate')

  const session = await withTenant(principal.tenantId, (tx) =>
    openSession(tx, {
      tenantId: principal.tenantId,
      branchId: String(formData.get('branchId')),
      userId: principal.userId,
      terminalCode: String(formData.get('terminalCode') || 'TILL-1'),
      openingFloat: String(formData.get('openingFloat') || '0'),
    }),
  )

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'pos_sessions',
    entityId: session.id,
    action: 'OPEN',
    after: { number: session.number, openingFloat: session.openingFloat.toString() },
  })

  revalidatePath('/pos')
}

export async function closeSessionAction(formData: FormData): Promise<void> {
  const principal = await requirePermission('pos.session.close.own')

  const closed = await withTenant(principal.tenantId, (tx) =>
    closeSession(tx, {
      tenantId: principal.tenantId,
      sessionId: String(formData.get('sessionId')),
      countedCash: String(formData.get('countedCash') || '0'),
      userId: principal.userId,
    }),
  )

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'pos_sessions',
    entityId: closed.id,
    action: 'CLOSE',
    after: {
      countedCash: closed.countedCash?.toString(),
      expectedCash: closed.expectedCash.toString(),
      variance: closed.variance?.toString(),
    },
  })

  revalidatePath('/pos')
}
