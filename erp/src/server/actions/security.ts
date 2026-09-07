'use server'

import { redirect } from 'next/navigation'
import { requirePrincipal } from '../session'
import { AuthError, completeTotpEnrolment } from '../services/auth'
import { recordAudit } from '../services/audit'

export interface TotpState {
  error?: string
}

export async function completeTotpAction(_previous: TotpState, formData: FormData): Promise<TotpState> {
  const principal = await requirePrincipal()
  const secret = String(formData.get('secret') ?? '')
  const code = String(formData.get('code') ?? '')

  try {
    await completeTotpEnrolment(principal.userId, secret, code)
    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'users',
      entityId: principal.userId,
      action: 'TOTP_ENROLLED',
    })
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message }
    throw error
  }

  redirect('/')
}
