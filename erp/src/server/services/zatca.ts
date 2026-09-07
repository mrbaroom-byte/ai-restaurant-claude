/**
 * ZATCA submission.
 *
 * Signing happens here rather than at posting time because it needs the stamp private key,
 * which only the server process holds. The invoice is signed, the hash is written back to close
 * the chain link the posting reserved, and the document goes to clearance or reporting.
 *
 * Nothing is swallowed: ZATCA's warnings and errors are stored whole on the submission row and
 * shown to the user with the invoice.
 */
import {
  type ZatcaEnvironmentName,
  ZatcaClient,
  isRetryable,
  retryDelayMs,
} from '@/lib/zatca/client'
import { prepareInvoice, ZatcaValidationError } from '@/lib/zatca'
import { DOCUMENT_TYPE_CODE, type UblParty } from '@/lib/zatca/ubl'
import { addCertificateArmour } from '@/lib/zatca/csr'
import { computeDocument, type VatCategory } from '@/lib/tax/vat'
import { money } from '@/lib/money'
import { decrypt } from '@/lib/crypto/vault'
import type { Tx } from '../db'

const ENVIRONMENT_NAME: Record<string, ZatcaEnvironmentName> = {
  SANDBOX: 'sandbox',
  SIMULATION: 'simulation',
  PRODUCTION: 'production',
}

export class ZatcaNotOnboardedError extends Error {
  readonly messageAr =
    'لم يكتمل الربط مع هيئة الزكاة والضريبة والجمارك. أكمل الإعداد من الإعدادات ← فاتورة.'
  constructor() {
    super('ZATCA onboarding is not complete. Finish it in Settings → ZATCA before submitting.')
    this.name = 'ZatcaNotOnboardedError'
  }
}

function partyFrom(row: {
  nameEn: string
  nameAr: string
  vatNumber?: string | null
  crNumber?: string | null
  identityScheme?: string | null
  identityValue?: string | null
  address?: {
    buildingNumber: string | null
    street: string | null
    district: string | null
    city: string | null
    postalCode: string | null
    additionalNumber: string | null
    region: string | null
    countryCode: string
  } | null
}): UblParty {
  return {
    // ZATCA prints the Arabic registered name; English is the fallback for a foreign buyer.
    registrationName: row.nameAr || row.nameEn,
    vatNumber: row.vatNumber ?? undefined,
    identification: row.crNumber
      ? { schemeId: 'CRN', value: row.crNumber }
      : row.identityScheme && row.identityValue
        ? { schemeId: row.identityScheme as 'NAT', value: row.identityValue }
        : undefined,
    address: row.address
      ? {
          buildingNumber: row.address.buildingNumber ?? '',
          street: row.address.street ?? '',
          district: row.address.district ?? '',
          city: row.address.city ?? '',
          postalCode: row.address.postalCode ?? '',
          additionalNumber: row.address.additionalNumber ?? undefined,
          region: row.address.region ?? undefined,
          countryCode: row.address.countryCode,
        }
      : undefined,
  }
}

export interface SignResult {
  xml: string
  invoiceHash: string
  qrBase64: string
  uuid: string
  submissionMode: 'CLEARANCE' | 'REPORTING'
  invoiceBase64: string
}

/** Sign a posted invoice and store the XML, hash and QR on it. */
export async function signInvoice(tx: Tx, tenantId: string, invoiceId: string): Promise<SignResult> {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, tenantId },
    include: {
      lines: { orderBy: { lineNo: 'asc' } },
      party: { include: { address: true } },
      originalInvoice: { select: { number: true, date: true } },
    },
  })

  if (!invoice.number || invoice.icv === null || !invoice.pih) {
    throw new Error('The invoice has not been posted, so it has no ZATCA chain values yet.')
  }

  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { legalNameEn: true, legalNameAr: true, vatNumber: true, crNumber: true },
  })
  const branch = await tx.branch.findUniqueOrThrow({
    where: { id: invoice.branchId },
    include: { address: true },
  })

  const certificate = await tx.zatcaCertificate.findFirst({
    where: { tenantId, OR: [{ branchId: invoice.branchId }, { branchId: null }], status: 'ACTIVE' },
    orderBy: { branchId: 'desc' },
  })
  if (!certificate?.productionCertEnc && !certificate?.complianceCertEnc) throw new ZatcaNotOnboardedError()

  const certificatePem = addCertificateArmour(
    decrypt(certificate.productionCertEnc ?? certificate.complianceCertEnc!),
  )
  const privateKeyPem = decrypt(certificate.privateKeyEnc)

  // Recomputed from the stored line amounts, which are VAT-exclusive by construction.
  const totals = computeDocument({
    lines: invoice.lines.map((line) => ({
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      discount: line.discount.toString(),
      vatCategory: line.vatCategory as VatCategory,
      vatRate: line.vatRate.toString(),
    })),
  })

  // The XML is what ZATCA clears and what the customer is charged, so it must state exactly
  // what was posted to the ledger. A disagreement here means an invoice would be cleared for
  // an amount the books never recorded — refuse rather than submit it.
  for (const [field, computed, stored] of [
    ['taxable total', totals.taxableTotal, money(invoice.taxableTotal.toString())],
    ['VAT total', totals.vatTotal, money(invoice.vatTotal.toString())],
    ['payable total', totals.grandTotal, money(invoice.payableTotal.toString()).minus(money(invoice.roundingAdjustment.toString()))],
  ] as const) {
    if (!computed.toDecimalPlaces(2).equals(stored.toDecimalPlaces(2))) {
      throw new Error(
        `Invoice ${invoice.number} would be signed with a ${field} of ${computed.toFixed(2)} but was posted at ${stored.toFixed(2)}. The invoice has not been submitted.`,
      )
    }
  }

  const documentTypeCode =
    invoice.documentType === 'CREDIT_NOTE'
      ? DOCUMENT_TYPE_CODE.CREDIT_NOTE
      : invoice.documentType === 'DEBIT_NOTE'
        ? DOCUMENT_TYPE_CODE.DEBIT_NOTE
        : DOCUMENT_TYPE_CODE.TAX_INVOICE

  const prepared = prepareInvoice({
    number: invoice.number,
    uuid: invoice.uuid,
    issueDate: invoice.issuedAt ?? invoice.date,
    documentTypeCode,
    simplified: invoice.kind === 'SIMPLIFIED',
    isExport: invoice.isExport,
    supplier: partyFrom({
      nameEn: tenant.legalNameEn,
      nameAr: tenant.legalNameAr,
      vatNumber: tenant.vatNumber,
      crNumber: tenant.crNumber,
      address: branch.address,
    }),
    customer: invoice.party ? partyFrom(invoice.party) : undefined,
    lines: invoice.lines.map((line) => ({
      nameEn: line.descriptionEn,
      nameAr: line.descriptionAr ?? undefined,
      unitCode: line.unitCode,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
    })),
    totals,
    icv: invoice.icv,
    pih: invoice.pih,
    currencyCode: invoice.currencyCode,
    supplyDate: invoice.supplyDate ?? undefined,
    billingReference: invoice.originalInvoice
      ? { number: invoice.originalInvoice.number ?? '', issueDate: invoice.originalInvoice.date }
      : undefined,
    instructionNote: invoice.correctionReason ?? undefined,
    paymentMeansCode: invoice.paymentMeansCode ?? undefined,
    certificatePem,
    privateKeyPem,
  })

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { invoiceHash: prepared.invoiceHash, qrBase64: prepared.qrBase64, signedXml: prepared.xml },
  })

  // Close the chain link: the next invoice's PIH is this invoice's hash.
  await tx.zatcaCertificate.update({
    where: { id: certificate.id },
    data: { lastInvoiceHash: prepared.invoiceHash },
  })

  return {
    xml: prepared.xml,
    invoiceHash: prepared.invoiceHash,
    qrBase64: prepared.qrBase64,
    uuid: prepared.uuid,
    submissionMode: prepared.submissionMode,
    invoiceBase64: prepared.invoiceBase64,
  }
}

export interface SubmitOutcome {
  status: 'CLEARED' | 'REPORTED' | 'REJECTED' | 'FAILED' | 'PENDING'
  httpStatus: number
  warnings: unknown[]
  errors: unknown[]
  retryAt?: Date
}

/**
 * Submit a signed invoice.
 *
 * A validation rejection is terminal — retrying it burns the 24-hour reporting window and hides
 * the problem — so only transport and server failures are rescheduled.
 */
export async function submitInvoice(
  tx: Tx,
  tenantId: string,
  submissionId: string,
  options: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<SubmitOutcome> {
  const submission = await tx.zatcaSubmission.findFirstOrThrow({
    where: { id: submissionId, tenantId },
    include: { invoice: { select: { id: true, uuid: true, branchId: true, invoiceHash: true, signedXml: true } } },
  })

  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { zatcaEnvironment: true },
  })
  const certificate = await tx.zatcaCertificate.findFirst({
    where: { tenantId, OR: [{ branchId: submission.invoice.branchId }, { branchId: null }], status: 'ACTIVE' },
    orderBy: { branchId: 'desc' },
  })
  if (!certificate) throw new ZatcaNotOnboardedError()

  let signed = {
    invoiceHash: submission.invoice.invoiceHash,
    invoiceBase64: submission.invoice.signedXml
      ? Buffer.from(submission.invoice.signedXml, 'utf8').toString('base64')
      : null,
  }

  if (!signed.invoiceHash || !signed.invoiceBase64) {
    try {
      const prepared = await signInvoice(tx, tenantId, submission.invoice.id)
      signed = { invoiceHash: prepared.invoiceHash, invoiceBase64: prepared.invoiceBase64 }
    } catch (error) {
      // A document ZATCA would reject is caught here, before it costs a submission attempt.
      const message = error instanceof ZatcaValidationError ? error.problems : [String(error)]
      await tx.zatcaSubmission.update({
        where: { id: submissionId },
        data: { status: 'REJECTED', attempt: submission.attempt + 1, errors: message as never, nextAttemptAt: null },
      })
      return { status: 'REJECTED', httpStatus: 0, warnings: [], errors: message }
    }
  }

  const token = certificate.productionCertEnc ?? certificate.complianceCertEnc
  const secret = certificate.productionSecretEnc ?? certificate.complianceSecretEnc
  if (!token || !secret) throw new ZatcaNotOnboardedError()

  const client = new ZatcaClient({
    environment: ENVIRONMENT_NAME[tenant.zatcaEnvironment],
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl,
    credentials: { username: decrypt(token), password: decrypt(secret) },
  })

  let response
  try {
    response =
      submission.mode === 'CLEARANCE'
        ? await client.clearInvoice(signed.invoiceHash!, submission.invoice.uuid, signed.invoiceBase64!)
        : await client.reportInvoice(signed.invoiceHash!, submission.invoice.uuid, signed.invoiceBase64!)
  } catch (error) {
    // Transport failure: retryable, and the reason is recorded for support.
    const attempt = submission.attempt + 1
    const retryAt = new Date(Date.now() + retryDelayMs(attempt))
    await tx.zatcaSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'PENDING',
        attempt,
        httpStatus: 0,
        errors: [{ message: String(error) }] as never,
        nextAttemptAt: retryAt,
      },
    })
    return { status: 'PENDING', httpStatus: 0, warnings: [], errors: [{ message: String(error) }], retryAt }
  }

  const attempt = submission.attempt + 1
  const cleared = response.ok && response.errors.length === 0
  const retryable = !cleared && isRetryable(response)
  const status = cleared
    ? submission.mode === 'CLEARANCE'
      ? ('CLEARED' as const)
      : ('REPORTED' as const)
    : retryable
      ? ('PENDING' as const)
      : ('REJECTED' as const)

  const retryAt = retryable ? new Date(Date.now() + retryDelayMs(attempt)) : null

  await tx.zatcaSubmission.update({
    where: { id: submissionId },
    data: {
      status,
      attempt,
      httpStatus: response.httpStatus,
      responseBody: response.body as never,
      warnings: response.warnings as never,
      errors: response.errors as never,
      submittedAt: new Date(),
      nextAttemptAt: retryAt,
    },
  })

  // Clearance returns the invoice ZATCA stamped; that copy is the legal document.
  const body = response.body as { clearedInvoice?: string } | undefined
  if (status === 'CLEARED' && body?.clearedInvoice) {
    await tx.invoice.update({
      where: { id: submission.invoice.id },
      data: { clearedXml: Buffer.from(body.clearedInvoice, 'base64').toString('utf8') },
    })
  }

  return {
    status,
    httpStatus: response.httpStatus,
    warnings: response.warnings,
    errors: response.errors,
    retryAt: retryAt ?? undefined,
  }
}

/** Submissions due for another attempt, oldest first. Read by the worker. */
export async function dueSubmissions(tx: Tx, tenantId: string, limit = 25) {
  return tx.zatcaSubmission.findMany({
    where: { tenantId, status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true, invoiceId: true, mode: true, attempt: true },
  })
}
