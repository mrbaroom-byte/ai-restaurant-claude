/**
 * ZATCA onboarding — the four steps between "we bought an ERP" and "we can issue tax invoices".
 *
 *   1. generate a secp256k1 key pair and a CSR carrying the EGS unit's identifiers
 *   2. exchange the CSR plus the portal OTP for a compliance CSID
 *   3. run ZATCA's compliance checks — a sample of each invoice type the CSR enabled
 *   4. exchange the compliance request id for the production CSID
 *
 * Each step records what ZATCA said, so a taxpayer who gets stuck at step 3 can see exactly
 * which check failed rather than "onboarding failed".
 */
import { randomUUID } from 'node:crypto'
import { ZatcaClient, type ZatcaEnvironmentName } from '@/lib/zatca/client'
import { buildCsr, csrForSubmission, generateStampKeyPair, type EgsUnitInfo } from '@/lib/zatca/csr'
import { addCertificateArmour, stripCertificateArmour } from '@/lib/zatca/csr'
import { prepareInvoice } from '@/lib/zatca'
import { DOCUMENT_TYPE_CODE } from '@/lib/zatca/ubl'
import { INITIAL_PIH } from '@/lib/zatca/hash'
import { computeDocument } from '@/lib/tax/vat'
import { decrypt, encrypt } from '@/lib/crypto/vault'
import { prisma } from '../db'

const ENVIRONMENT_NAME: Record<string, ZatcaEnvironmentName> = {
  SANDBOX: 'sandbox',
  SIMULATION: 'simulation',
  PRODUCTION: 'production',
}

export interface OnboardingStepResult {
  ok: boolean
  message: string
  /** ZATCA's raw reply, shown in the diagnostics panel. */
  detail?: unknown
}

/** Step 1. The private key never leaves the server and is stored encrypted. */
export async function generateDevice(params: {
  tenantId: string
  branchId: string
  info: EgsUnitInfo
  environment: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION'
}): Promise<{ certificateId: string; csrPem: string }> {
  const keys = generateStampKeyPair()
  const csr = buildCsr(params.info, keys.privateKeyPem, ENVIRONMENT_NAME[params.environment])

  const record = await prisma.zatcaCertificate.upsert({
    where: {
      tenantId_environment_egsSerial: {
        tenantId: params.tenantId,
        environment: params.environment,
        egsSerial: params.info.serialNumber,
      },
    },
    create: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      environment: params.environment,
      egsSerial: params.info.serialNumber,
      commonName: params.info.commonName,
      invoiceType: params.info.invoiceType,
      privateKeyEnc: encrypt(keys.privateKeyPem),
      csrPem: csr.pem,
      status: 'CSR_GENERATED',
    },
    update: {
      // Re-generating replaces the key, which invalidates any CSID issued against the old one.
      privateKeyEnc: encrypt(keys.privateKeyPem),
      csrPem: csr.pem,
      status: 'CSR_GENERATED',
      complianceCertEnc: null,
      complianceSecretEnc: null,
      productionCertEnc: null,
      productionSecretEnc: null,
      complianceRequestId: null,
    },
  })

  return { certificateId: record.id, csrPem: csr.pem }
}

/** Step 2. The OTP comes from the taxpayer's own Fatoora portal session. */
export async function requestComplianceCsid(params: {
  tenantId: string
  certificateId: string
  otp: string
  fetchImpl?: typeof fetch
  baseUrl?: string
}): Promise<OnboardingStepResult> {
  const record = await prisma.zatcaCertificate.findFirstOrThrow({
    where: { id: params.certificateId, tenantId: params.tenantId },
  })
  if (!record.csrPem) return { ok: false, message: 'Generate the certificate request first.' }

  const client = new ZatcaClient({
    environment: ENVIRONMENT_NAME[record.environment],
    baseUrl: params.baseUrl,
    fetchImpl: params.fetchImpl,
  })

  const response = await client.requestComplianceCsid(csrForSubmission(record.csrPem), params.otp)

  if (!response.ok || !response.body.binarySecurityToken) {
    return {
      ok: false,
      message:
        response.body.dispositionMessage ??
        response.errors[0]?.message ??
        `ZATCA replied ${response.httpStatus}. Check the OTP has not expired — it is valid for one hour.`,
      detail: response.body,
    }
  }

  await prisma.zatcaCertificate.update({
    where: { id: record.id },
    data: {
      complianceCertEnc: encrypt(response.body.binarySecurityToken),
      complianceSecretEnc: encrypt(response.body.secret ?? ''),
      complianceRequestId: String(response.body.requestID ?? ''),
      status: 'COMPLIANCE_CSID',
    },
  })

  return { ok: true, message: 'Compliance CSID issued.', detail: { requestId: response.body.requestID } }
}

/**
 * Step 3. ZATCA requires a passing check for each invoice type the CSR enabled, so a device
 * registered for both standard and simplified submits one of each.
 */
export async function runComplianceChecks(params: {
  tenantId: string
  certificateId: string
  fetchImpl?: typeof fetch
  baseUrl?: string
}): Promise<OnboardingStepResult> {
  const record = await prisma.zatcaCertificate.findFirstOrThrow({
    where: { id: params.certificateId, tenantId: params.tenantId },
  })
  if (!record.complianceCertEnc || !record.complianceSecretEnc) {
    return { ok: false, message: 'Obtain the compliance CSID first.' }
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: params.tenantId },
    select: { legalNameAr: true, legalNameEn: true, vatNumber: true, crNumber: true },
  })
  const branch = await prisma.branch.findFirstOrThrow({
    where: { tenantId: params.tenantId, ...(record.branchId ? { id: record.branchId } : {}) },
    include: { address: true },
  })

  const certificatePem = addCertificateArmour(decrypt(record.complianceCertEnc))
  const privateKeyPem = decrypt(record.privateKeyEnc)

  const client = new ZatcaClient({
    environment: ENVIRONMENT_NAME[record.environment],
    baseUrl: params.baseUrl,
    fetchImpl: params.fetchImpl,
    credentials: {
      username: decrypt(record.complianceCertEnc),
      password: decrypt(record.complianceSecretEnc),
    },
  })

  const supplier = {
    registrationName: tenant.legalNameAr,
    vatNumber: tenant.vatNumber ?? '',
    identification: tenant.crNumber ? ({ schemeId: 'CRN', value: tenant.crNumber } as const) : undefined,
    address: branch.address
      ? {
          buildingNumber: branch.address.buildingNumber ?? '',
          street: branch.address.street ?? '',
          district: branch.address.district ?? '',
          city: branch.address.city ?? '',
          postalCode: branch.address.postalCode ?? '',
          additionalNumber: branch.address.additionalNumber ?? undefined,
          region: branch.address.region ?? undefined,
        }
      : undefined,
  }

  const totals = computeDocument({ lines: [{ quantity: 1, unitPrice: '100.00', vatCategory: 'STANDARD' }] })
  const sampleLines = [{ nameEn: 'Compliance check', nameAr: 'فحص الامتثال', unitCode: 'PCE', quantity: '1', unitPrice: '100.00' }]

  // The invoice type flag decides which samples ZATCA expects: TSCZ, positions 1 and 2.
  const wantsStandard = record.invoiceType.startsWith('1')
  const wantsSimplified = record.invoiceType[1] === '1'

  const attempts: Array<{ label: string; simplified: boolean }> = []
  if (wantsStandard) attempts.push({ label: 'standard tax invoice', simplified: false })
  if (wantsSimplified) attempts.push({ label: 'simplified tax invoice', simplified: true })

  const results: Array<{ label: string; ok: boolean; detail: unknown }> = []
  let icv = 1
  let pih = INITIAL_PIH

  for (const attempt of attempts) {
    const prepared = prepareInvoice({
      number: `COMPLIANCE-${icv}`,
      uuid: randomUUID(),
      issueDate: new Date(),
      documentTypeCode: DOCUMENT_TYPE_CODE.TAX_INVOICE,
      simplified: attempt.simplified,
      supplier,
      customer: attempt.simplified
        ? undefined
        : {
            registrationName: 'عميل الفحص',
            vatNumber: '399999999900003',
            address: supplier.address,
          },
      lines: sampleLines,
      totals,
      icv,
      pih,
      certificatePem,
      privateKeyPem,
    })

    const response = await client.checkCompliance(prepared.invoiceHash, prepared.uuid, prepared.invoiceBase64)
    const passed = response.ok && response.errors.length === 0
    results.push({ label: attempt.label, ok: passed, detail: response.body })

    icv += 1
    pih = prepared.invoiceHash
  }

  const allPassed = results.every((result) => result.ok)
  if (allPassed) {
    await prisma.zatcaCertificate.update({ where: { id: record.id }, data: { status: 'COMPLIANCE_PASSED' } })
  }

  return {
    ok: allPassed,
    message: allPassed
      ? `All ${results.length} compliance checks passed.`
      : `${results.filter((r) => !r.ok).map((r) => r.label).join(' and ')} failed. Open the detail below for ZATCA's reasons.`,
    detail: results,
  }
}

/** Step 4. Only after the checks pass. */
export async function requestProductionCsid(params: {
  tenantId: string
  certificateId: string
  fetchImpl?: typeof fetch
  baseUrl?: string
}): Promise<OnboardingStepResult> {
  const record = await prisma.zatcaCertificate.findFirstOrThrow({
    where: { id: params.certificateId, tenantId: params.tenantId },
  })
  if (record.status !== 'COMPLIANCE_PASSED') {
    return { ok: false, message: 'Run the compliance checks and get them all passing first.' }
  }
  if (!record.complianceRequestId || !record.complianceCertEnc || !record.complianceSecretEnc) {
    return { ok: false, message: 'The compliance CSID is missing. Start onboarding again.' }
  }

  const client = new ZatcaClient({
    environment: ENVIRONMENT_NAME[record.environment],
    baseUrl: params.baseUrl,
    fetchImpl: params.fetchImpl,
    credentials: {
      username: decrypt(record.complianceCertEnc),
      password: decrypt(record.complianceSecretEnc),
    },
  })

  const response = await client.requestProductionCsid(record.complianceRequestId)
  if (!response.ok || !response.body.binarySecurityToken) {
    return {
      ok: false,
      message: response.body.dispositionMessage ?? `ZATCA replied ${response.httpStatus}.`,
      detail: response.body,
    }
  }

  await prisma.zatcaCertificate.update({
    where: { id: record.id },
    data: {
      productionCertEnc: encrypt(response.body.binarySecurityToken),
      productionSecretEnc: encrypt(response.body.secret ?? ''),
      status: 'ACTIVE',
    },
  })

  return { ok: true, message: 'Production CSID issued. Tax invoices can now be cleared and reported.' }
}

export { stripCertificateArmour }
