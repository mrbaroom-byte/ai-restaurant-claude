/**
 * ZATCA e-invoicing — the one entry point the rest of the application uses.
 *
 * `prepareInvoice` turns a computed sales document into everything ZATCA needs: the signed
 * UBL XML, its hash (which becomes the next invoice's PIH), the base64 QR, and the request
 * body for clearance or reporting.
 */
import { randomUUID } from 'node:crypto'
import { type DocumentTotals } from '../tax/vat'
import { toAmountString, qtyToDb } from '../money'
import { type CertificateFacts, readCertificate } from './certificate'
import { hashInvoice } from './hash'
import { buildQrBase64 } from './tlv'
import { stampInvoice } from './sign'
import {
  type DocumentTypeCode,
  type UblInvoiceInput,
  type UblLine,
  type UblParty,
  DOCUMENT_TYPE_CODE,
  buildInvoiceXml,
  invoiceToDocument,
  validateInvoiceInput,
} from './ubl'
import { serialize } from './xml'

export * from './tlv'
export * from './hash'
export * from './ubl'
export * from './csr'
export * from './certificate'
export { stampInvoice, verifyStamp } from './sign'

export interface PreparedInvoice {
  /** Signed UBL document, ready to submit and to archive. */
  xml: string
  /** Pretty-printed copy for the "view XML" screen. */
  xmlPretty: string
  /** Base64 SHA-256 of the canonical invoice — becomes the next invoice's PIH. */
  invoiceHash: string
  /** Base64 TLV that is printed as the QR and embedded in the XML. */
  qrBase64: string
  signatureValue: string
  uuid: string
  icv: number
  pih: string
  /** Base64 of the whole signed document — what the ZATCA API body carries. */
  invoiceBase64: string
  /** Clearance for standard invoices, reporting for simplified. */
  submissionMode: 'CLEARANCE' | 'REPORTING'
}

export interface PrepareInvoiceParams {
  number: string
  issueDate: Date
  documentTypeCode: DocumentTypeCode
  simplified: boolean
  supplier: UblParty
  customer?: UblParty
  lines: Array<{
    nameEn: string
    nameAr?: string
    unitCode: string
    quantity: string | number
    unitPrice: string | number
  }>
  totals: DocumentTotals
  icv: number
  pih: string
  uuid?: string
  currencyCode?: string
  billingReference?: { number: string; issueDate?: Date }
  instructionNote?: string
  paymentMeansCode?: string
  supplyDate?: Date
  notes?: string[]
  isExport?: boolean
  certificatePem: string
  privateKeyPem: string
  signingTime?: Date
}

export class ZatcaValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`This invoice cannot be submitted to ZATCA:\n- ${problems.join('\n- ')}`)
    this.name = 'ZatcaValidationError'
    this.problems = problems
  }
}

/** Map the computed document totals onto UBL's monetary total fields. */
function ublTotals(totals: DocumentTotals) {
  return {
    lineExtensionAmount: toAmountString(totals.taxableTotal),
    taxExclusiveAmount: toAmountString(totals.taxableTotal),
    taxInclusiveAmount: toAmountString(totals.grandTotal),
    allowanceTotalAmount: toAmountString(totals.discountTotal),
    prepaidAmount: '0.00',
    payableRoundingAmount: toAmountString(totals.roundingAdjustment),
    payableAmount: toAmountString(totals.payableTotal),
    taxAmount: toAmountString(totals.vatTotal),
  }
}

export function prepareInvoice(params: PrepareInvoiceParams): PreparedInvoice {
  const cert: CertificateFacts = readCertificate(params.certificatePem)
  const uuid = params.uuid ?? randomUUID()

  const lines: UblLine[] = params.totals.lines.map((computed, i) => {
    const source = params.lines[i]
    if (!source) throw new Error(`Computed totals have ${params.totals.lines.length} lines but only ${params.lines.length} line descriptions were supplied.`)
    return {
      id: i + 1,
      nameEn: source.nameEn,
      nameAr: source.nameAr,
      unitCode: source.unitCode,
      quantity: qtyToDb(source.quantity).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
      unitPrice: toAmountString(source.unitPrice),
      lineExtensionAmount: toAmountString(computed.taxableAmount),
      discount: toAmountString(computed.discount),
      vatCategory: computed.vatCategory,
      vatPercent: computed.vatRate.times(100).toFixed(2),
      vatAmount: toAmountString(computed.vatAmount),
      lineTotal: toAmountString(computed.lineTotal),
      exemptionReasonCode: params.totals.breakdown.find((b) => b.category === computed.vatCategory)?.exemptionReasonCode,
      exemptionReasonText: params.totals.breakdown.find((b) => b.category === computed.vatCategory)?.exemptionReasonEn,
    }
  })

  const input: UblInvoiceInput = {
    number: params.number,
    uuid,
    issueDate: params.issueDate,
    documentTypeCode: params.documentTypeCode,
    simplified: params.simplified,
    isExport: params.isExport,
    currencyCode: params.currencyCode ?? 'SAR',
    icv: params.icv,
    pih: params.pih,
    supplier: params.supplier,
    customer: params.customer,
    supplyDate: params.supplyDate,
    billingReference: params.billingReference,
    instructionNote: params.instructionNote,
    paymentMeansCode: params.paymentMeansCode,
    lines,
    taxSubtotals: params.totals.breakdown.map((b) => ({
      taxableAmount: toAmountString(b.taxableAmount),
      taxAmount: toAmountString(b.vatAmount),
      category: b.category,
      percent: b.rate.times(100).toFixed(2),
      exemptionReasonCode: b.exemptionReasonCode,
      exemptionReasonText: b.exemptionReasonEn,
    })),
    totals: ublTotals(params.totals),
    notes: params.notes,
  }

  const problems = validateInvoiceInput(input)
  if (problems.length) throw new ZatcaValidationError(problems)

  // 1. Hash the invoice with no extensions and no QR — that is the signed data.
  const unsigned = buildInvoiceXml(input)
  const invoiceHash = hashInvoice(unsigned)

  // 2. Stamp it.
  const stamp = stampInvoice({
    invoiceHash,
    certificate: cert,
    privateKeyPem: params.privateKeyPem,
    signingTime: params.signingTime,
  })

  // 3. Build the QR from the hash, the signature and the certificate.
  //    Tag 9 (ZATCA's signature over the certificate) belongs on standard invoices only.
  const qrBase64 = buildQrBase64({
    sellerName: params.supplier.registrationName,
    vatNumber: params.supplier.vatNumber ?? '',
    timestamp: params.issueDate,
    invoiceTotal: toAmountString(params.totals.payableTotal),
    vatTotal: toAmountString(params.totals.vatTotal),
    invoiceHash,
    signature: stamp.signatureValue,
    publicKey: cert.publicKeyDer,
    certificateSignature: params.simplified ? undefined : cert.signature,
  })

  // 4. Re-emit with the QR and the signature in place. The hash does not change, because
  //    both elements are excluded from the signed data by the XPath transforms.
  const signed = buildInvoiceXml({ ...input, qrBase64 }, stamp.extensions)
  const xml = invoiceToDocument(signed)

  return {
    xml,
    xmlPretty: invoiceToDocument(signed, true),
    invoiceHash,
    qrBase64,
    signatureValue: stamp.signatureValue,
    uuid,
    icv: params.icv,
    pih: params.pih,
    invoiceBase64: Buffer.from(xml, 'utf8').toString('base64'),
    submissionMode: params.simplified ? 'REPORTING' : 'CLEARANCE',
  }
}

/**
 * Phase 1 QR — five tags, no cryptographic stamp.
 *
 * Kept because a tenant that has not finished onboarding still has to print a compliant QR on
 * a simplified invoice; the UI shows a banner until the production CSID is in place.
 */
export function phaseOneQr(params: {
  sellerName: string
  vatNumber: string
  timestamp: Date
  invoiceTotal: string
  vatTotal: string
}): string {
  return buildQrBase64(params)
}

export { DOCUMENT_TYPE_CODE, serialize }
