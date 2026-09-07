'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '../session'
import { generateDevice, requestComplianceCsid, requestProductionCsid, runComplianceChecks } from '../services/onboarding'
import { recordAudit } from '../services/audit'
import { validateEgsUnitInfo } from '@/lib/zatca/csr'

export interface OnboardingState {
  ok?: boolean
  message?: string
  detail?: string
}

const deviceForm = z.object({
  branchId: z.string().uuid(),
  commonName: z.string().min(1),
  organizationName: z.string().min(1),
  organizationalUnitName: z.string().min(1),
  serialNumber: z.string().min(1),
  vatNumber: z.string(),
  invoiceType: z.string(),
  registeredAddress: z.string().min(1),
  businessCategory: z.string().min(1),
  environment: z.enum(['SANDBOX', 'SIMULATION', 'PRODUCTION']),
})

export async function generateDeviceAction(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const principal = await requirePermission('settings.zatca')

  const parsed = deviceForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }

  const { branchId, environment, ...info } = parsed.data
  try {
    // Fails loudly with the specific field ZATCA would reject, before any network call.
    validateEgsUnitInfo(info)
    const result = await generateDevice({ tenantId: principal.tenantId, branchId, info, environment })

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'zatca_certificates',
      entityId: result.certificateId,
      action: 'GENERATE_CSR',
      after: { egsSerial: info.serialNumber, environment },
    })

    revalidatePath('/settings/zatca')
    return { ok: true, message: 'Key pair and certificate request generated.', detail: result.csrPem }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function requestComplianceCsidAction(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const principal = await requirePermission('settings.zatca')
  const certificateId = String(formData.get('certificateId'))
  const otp = String(formData.get('otp') ?? '').trim()

  if (!/^\d{4,8}$/.test(otp)) {
    return { ok: false, message: 'The OTP from the Fatoora portal is a short numeric code. Copy it exactly.' }
  }

  const result = await requestComplianceCsid({ tenantId: principal.tenantId, certificateId, otp })

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'zatca_certificates',
    entityId: certificateId,
    action: 'COMPLIANCE_CSID',
    after: { ok: result.ok },
  })

  revalidatePath('/settings/zatca')
  return { ok: result.ok, message: result.message, detail: JSON.stringify(result.detail, null, 2) }
}

export async function runComplianceChecksAction(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const principal = await requirePermission('settings.zatca')
  const certificateId = String(formData.get('certificateId'))

  const result = await runComplianceChecks({ tenantId: principal.tenantId, certificateId })
  revalidatePath('/settings/zatca')
  return { ok: result.ok, message: result.message, detail: JSON.stringify(result.detail, null, 2) }
}

export async function requestProductionCsidAction(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const principal = await requirePermission('settings.zatca')
  const certificateId = String(formData.get('certificateId'))

  const result = await requestProductionCsid({ tenantId: principal.tenantId, certificateId })

  await recordAudit({
    tenantId: principal.tenantId,
    userId: principal.userId,
    entity: 'zatca_certificates',
    entityId: certificateId,
    action: 'PRODUCTION_CSID',
    after: { ok: result.ok },
  })

  revalidatePath('/settings/zatca')
  return { ok: result.ok, message: result.message, detail: JSON.stringify(result.detail, null, 2) }
}
