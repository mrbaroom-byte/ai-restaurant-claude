/**
 * UBL 2.1 invoice generation, ZATCA e-invoicing profile.
 *
 * UBL is a sequence schema: element order is part of the contract, and ZATCA's validator
 * rejects a document whose elements are correct but out of order. The builders below emit the
 * schema order, which is why they read as long flat lists rather than object spreads.
 */
import { type XmlElement, type XmlNode, el, leaf, toDocument } from './xml'
import { type VatCategory, VAT_CATEGORY_CODE } from '../tax/vat'
import { toAmountString } from '../money'
import { EXT_NS } from './sign'

export const UBL_NS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
export const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
export const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'

/** UN/CEFACT 1001 document type codes. */
export const DOCUMENT_TYPE_CODE = {
  TAX_INVOICE: '388',
  CREDIT_NOTE: '381',
  DEBIT_NOTE: '383',
} as const

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODE)[keyof typeof DOCUMENT_TYPE_CODE]

/**
 * Reason codes for a credit or debit note, as required by Article 40 of the VAT regulations.
 * ZATCA rejects a note with no `cbc:InstructionNote`.
 */
export const CREDIT_NOTE_REASONS = {
  CANCELLED: { en: 'Cancellation or suspension of the supply', ar: 'إلغاء أو تعليق التوريد' },
  RETURN: { en: 'Return of goods', ar: 'إرجاع البضاعة' },
  PRICE_CHANGE: { en: 'Change in the agreed consideration', ar: 'تغيير في مقابل التوريد المتفق عليه' },
  CORRECTION: { en: 'Correction of an error in the original invoice', ar: 'تصحيح خطأ في الفاتورة الأصلية' },
} as const

export interface NationalAddress {
  buildingNumber: string
  street: string
  district: string
  city: string
  postalCode: string
  /** The four-digit "additional number" of the Saudi National Address. */
  additionalNumber?: string
  region?: string
  countryCode?: string
}

export interface UblParty {
  registrationName: string
  vatNumber?: string
  /** Commercial registration or other identifier, with its ZATCA scheme. */
  identification?: { schemeId: 'CRN' | 'MOM' | 'MLS' | 'SAG' | 'OTH' | 'NAT' | 'GCC' | 'IQA' | 'PAS' | 'TIN'; value: string }
  address?: NationalAddress
}

export interface UblLine {
  /** 1-based line number as printed. */
  id: number
  nameEn: string
  nameAr?: string
  /** UN/ECE Rec 20 unit code, e.g. PCE, KGM, LTR, HUR. */
  unitCode: string
  quantity: string
  /** Unit price net of any line discount, exclusive of VAT. */
  unitPrice: string
  /** Line net amount, exclusive of VAT, after discount. */
  lineExtensionAmount: string
  discount?: string
  vatCategory: VatCategory
  /** Percentage as a whole number string, e.g. "15.00". */
  vatPercent: string
  vatAmount: string
  /** lineExtensionAmount + vatAmount. */
  lineTotal: string
  exemptionReasonCode?: string
  exemptionReasonText?: string
}

export interface UblTaxSubtotal {
  taxableAmount: string
  taxAmount: string
  category: VatCategory
  percent: string
  exemptionReasonCode?: string
  exemptionReasonText?: string
}

export interface UblInvoiceInput {
  /** Invoice number as printed, e.g. INV-JED-2026-000123. */
  number: string
  uuid: string
  issueDate: Date
  documentTypeCode: DocumentTypeCode
  /** True for a B2C simplified invoice (reporting model). */
  simplified: boolean
  /** Set for an export invoice, so the type name flags position 5. */
  isExport?: boolean
  /** Set for a self-billed invoice. */
  isSelfBilled?: boolean
  /** Set for a third-party invoice. */
  isThirdParty?: boolean
  /** Set for a nominal (deemed) supply. */
  isNominal?: boolean
  /** Set for a summary invoice covering several supplies. */
  isSummary?: boolean
  currencyCode?: string
  icv: number
  pih: string
  /** Base64 TLV. Omitted while hashing, injected before submission. */
  qrBase64?: string
  supplier: UblParty
  customer?: UblParty
  /** Supply date — required by ZATCA when it differs from the issue date. */
  supplyDate?: Date
  supplyEndDate?: Date
  /** Reference to the invoice being credited or debited. Required for 381/383. */
  billingReference?: { number: string; issueDate?: Date }
  /** Free-text reason for a credit or debit note. Required for 381/383. */
  instructionNote?: string
  /** UN/CEFACT 4461 payment means code. 10 cash, 42 bank transfer, 48 card, 30 credit. */
  paymentMeansCode?: string
  paymentTermsNote?: string
  /** Document-level discount, shown as an allowance. */
  documentDiscount?: { amount: string; taxCategory: VatCategory; percent: string; reason?: string }
  lines: UblLine[]
  taxSubtotals: UblTaxSubtotal[]
  totals: {
    lineExtensionAmount: string
    taxExclusiveAmount: string
    taxInclusiveAmount: string
    allowanceTotalAmount: string
    prepaidAmount: string
    payableRoundingAmount: string
    payableAmount: string
    taxAmount: string
  }
  notes?: string[]
}

/**
 * The seven-character `name` attribute of `cbc:InvoiceTypeCode`.
 * Positions: 1–2 transaction type, 3 third party, 4 nominal, 5 exports, 6 summary, 7 self-billed.
 */
export function invoiceTypeName(input: UblInvoiceInput): string {
  const transaction = input.simplified ? '02' : '01'
  const flag = (v: boolean | undefined) => (v ? '1' : '0')
  return (
    transaction +
    flag(input.isThirdParty) +
    flag(input.isNominal) +
    flag(input.isExport) +
    flag(input.isSummary) +
    flag(input.isSelfBilled)
  )
}

/** UBL amount elements all carry a currencyID attribute. */
function cur(currency: string): Record<string, string> {
  return { currencyID: currency }
}

function addressElement(address: NationalAddress): XmlElement {
  return el('cac:PostalAddress', undefined, [
    leaf('cbc:StreetName', address.street),
    leaf('cbc:BuildingNumber', address.buildingNumber),
    leaf('cbc:PlotIdentification', address.additionalNumber),
    leaf('cbc:CitySubdivisionName', address.district),
    leaf('cbc:CityName', address.city),
    leaf('cbc:PostalZone', address.postalCode),
    leaf('cbc:CountrySubentity', address.region),
    el('cac:Country', undefined, [leaf('cbc:IdentificationCode', address.countryCode ?? 'SA')]),
  ])
}

function partyElement(wrapper: string, party: UblParty): XmlElement {
  return el(wrapper, undefined, [
    el('cac:Party', undefined, [
      party.identification
        ? el('cac:PartyIdentification', undefined, [
            leaf('cbc:ID', party.identification.value, { schemeID: party.identification.schemeId }),
          ])
        : null,
      party.address ? addressElement(party.address) : null,
      party.vatNumber
        ? el('cac:PartyTaxScheme', undefined, [
            leaf('cbc:CompanyID', party.vatNumber),
            el('cac:TaxScheme', undefined, [leaf('cbc:ID', 'VAT')]),
          ])
        : el('cac:PartyTaxScheme', undefined, [el('cac:TaxScheme', undefined, [leaf('cbc:ID', 'VAT')])]),
      el('cac:PartyLegalEntity', undefined, [leaf('cbc:RegistrationName', party.registrationName)]),
    ]),
  ])
}

function taxCategoryElement(
  tag: string,
  category: VatCategory,
  percent: string,
  exemptionReasonCode?: string,
  exemptionReasonText?: string,
): XmlElement {
  return el(tag, undefined, [
    leaf('cbc:ID', VAT_CATEGORY_CODE[category], { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }),
    leaf('cbc:Percent', percent),
    category === 'STANDARD' ? null : leaf('cbc:TaxExemptionReasonCode', exemptionReasonCode),
    category === 'STANDARD' ? null : leaf('cbc:TaxExemptionReason', exemptionReasonText),
    el('cac:TaxScheme', undefined, [
      leaf('cbc:ID', 'VAT', { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }),
    ]),
  ])
}

function lineElement(line: UblLine, currency: string): XmlElement {
  return el('cac:InvoiceLine', undefined, [
    leaf('cbc:ID', String(line.id)),
    leaf('cbc:InvoicedQuantity', line.quantity, { unitCode: line.unitCode }),
    leaf('cbc:LineExtensionAmount', line.lineExtensionAmount, cur(currency)),
    el('cac:TaxTotal', undefined, [
      leaf('cbc:TaxAmount', line.vatAmount, cur(currency)),
      leaf('cbc:RoundingAmount', line.lineTotal, cur(currency)),
    ]),
    el('cac:Item', undefined, [
      leaf('cbc:Name', line.nameAr ? `${line.nameEn} / ${line.nameAr}` : line.nameEn),
      taxCategoryElement(
        'cac:ClassifiedTaxCategory',
        line.vatCategory,
        line.vatPercent,
        line.exemptionReasonCode,
        line.exemptionReasonText,
      ),
    ]),
    el('cac:Price', undefined, [
      leaf('cbc:PriceAmount', line.unitPrice, cur(currency)),
      line.discount && line.discount !== '0.00'
        ? el('cac:AllowanceCharge', undefined, [
            leaf('cbc:ChargeIndicator', 'false'),
            leaf('cbc:AllowanceChargeReason', 'discount'),
            leaf('cbc:Amount', line.discount, cur(currency)),
          ])
        : null,
    ]),
  ])
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isoTime(date: Date): string {
  return date.toISOString().slice(11, 19)
}

/**
 * Build the invoice tree.
 *
 * Called twice per invoice: once without `qrBase64` to compute the hash that gets signed, then
 * again with the QR and the signature extensions to produce the document that is submitted.
 */
export function buildInvoiceXml(input: UblInvoiceInput, extensions?: XmlElement): XmlElement {
  const currency = input.currencyCode ?? 'SAR'

  const children: XmlNode[] = [
    extensions ?? null,
    leaf('cbc:ProfileID', 'reporting:1.0'),
    leaf('cbc:ID', input.number),
    leaf('cbc:UUID', input.uuid),
    leaf('cbc:IssueDate', isoDate(input.issueDate)),
    leaf('cbc:IssueTime', isoTime(input.issueDate)),
    leaf('cbc:InvoiceTypeCode', input.documentTypeCode, { name: invoiceTypeName(input) }),
    ...(input.notes ?? []).map((n) => leaf('cbc:Note', n, { languageID: 'ar' })),
    leaf('cbc:DocumentCurrencyCode', currency),
    leaf('cbc:TaxCurrencyCode', 'SAR'),

    input.billingReference
      ? el('cac:BillingReference', undefined, [
          el('cac:InvoiceDocumentReference', undefined, [
            leaf('cbc:ID', input.billingReference.number),
            input.billingReference.issueDate ? leaf('cbc:IssueDate', isoDate(input.billingReference.issueDate)) : null,
          ]),
        ])
      : null,

    // ICV — the invoice counter for this solution.
    el('cac:AdditionalDocumentReference', undefined, [
      leaf('cbc:ID', 'ICV'),
      leaf('cbc:UUID', String(input.icv)),
    ]),
    // PIH — hash of the previous invoice, embedded as an attached binary object.
    el('cac:AdditionalDocumentReference', undefined, [
      leaf('cbc:ID', 'PIH'),
      el('cac:Attachment', undefined, [
        leaf('cbc:EmbeddedDocumentBinaryObject', input.pih, { mimeCode: 'text/plain' }),
      ]),
    ]),
    // QR — omitted while hashing; ZATCA's transforms exclude it from the signed data anyway.
    input.qrBase64
      ? el('cac:AdditionalDocumentReference', undefined, [
          leaf('cbc:ID', 'QR'),
          el('cac:Attachment', undefined, [
            leaf('cbc:EmbeddedDocumentBinaryObject', input.qrBase64, { mimeCode: 'text/plain' }),
          ]),
        ])
      : null,

    el('cac:Signature', undefined, [
      leaf('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice'),
      leaf('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'),
    ]),

    partyElement('cac:AccountingSupplierParty', input.supplier),
    input.customer ? partyElement('cac:AccountingCustomerParty', input.customer) : null,

    input.supplyDate
      ? el('cac:Delivery', undefined, [
          leaf('cbc:ActualDeliveryDate', isoDate(input.supplyDate)),
          input.supplyEndDate ? leaf('cbc:LatestDeliveryDate', isoDate(input.supplyEndDate)) : null,
        ])
      : null,

    input.paymentMeansCode
      ? el('cac:PaymentMeans', undefined, [
          leaf('cbc:PaymentMeansCode', input.paymentMeansCode),
          input.instructionNote ? leaf('cbc:InstructionNote', input.instructionNote) : null,
        ])
      : input.instructionNote
        ? el('cac:PaymentMeans', undefined, [
            leaf('cbc:PaymentMeansCode', '1'),
            leaf('cbc:InstructionNote', input.instructionNote),
          ])
        : null,

    input.paymentTermsNote ? el('cac:PaymentTerms', undefined, [leaf('cbc:Note', input.paymentTermsNote)]) : null,

    input.documentDiscount
      ? el('cac:AllowanceCharge', undefined, [
          leaf('cbc:ChargeIndicator', 'false'),
          leaf('cbc:AllowanceChargeReason', input.documentDiscount.reason ?? 'discount'),
          leaf('cbc:Amount', input.documentDiscount.amount, cur(currency)),
          taxCategoryElement('cac:TaxCategory', input.documentDiscount.taxCategory, input.documentDiscount.percent),
        ])
      : null,

    // Detailed tax breakdown, then the single-figure total ZATCA reads for the tax currency.
    el('cac:TaxTotal', undefined, [
      leaf('cbc:TaxAmount', input.totals.taxAmount, cur(currency)),
      ...input.taxSubtotals.map((s) =>
        el('cac:TaxSubtotal', undefined, [
          leaf('cbc:TaxableAmount', s.taxableAmount, cur(currency)),
          leaf('cbc:TaxAmount', s.taxAmount, cur(currency)),
          taxCategoryElement('cac:TaxCategory', s.category, s.percent, s.exemptionReasonCode, s.exemptionReasonText),
        ]),
      ),
    ]),
    el('cac:TaxTotal', undefined, [
      leaf('cbc:TaxAmount', input.totals.taxAmount, cur('SAR')),
    ]),

    el('cac:LegalMonetaryTotal', undefined, [
      leaf('cbc:LineExtensionAmount', input.totals.lineExtensionAmount, cur(currency)),
      leaf('cbc:TaxExclusiveAmount', input.totals.taxExclusiveAmount, cur(currency)),
      leaf('cbc:TaxInclusiveAmount', input.totals.taxInclusiveAmount, cur(currency)),
      leaf('cbc:AllowanceTotalAmount', input.totals.allowanceTotalAmount, cur(currency)),
      leaf('cbc:PrepaidAmount', input.totals.prepaidAmount, cur(currency)),
      leaf('cbc:PayableRoundingAmount', input.totals.payableRoundingAmount, cur(currency)),
      leaf('cbc:PayableAmount', input.totals.payableAmount, cur(currency)),
    ]),

    ...input.lines.map((l) => lineElement(l, currency)),
  ]

  return el(
    'Invoice',
    {
      xmlns: UBL_NS,
      'xmlns:cac': CAC_NS,
      'xmlns:cbc': CBC_NS,
      'xmlns:ext': EXT_NS,
    },
    children,
  )
}

/** Serialise to a submittable document. */
export function invoiceToDocument(invoice: XmlElement, pretty = false): string {
  return toDocument(invoice, pretty)
}

/**
 * Structural checks that catch the mistakes ZATCA rejects with an unhelpful message.
 * Run before submission; failures are shown to the user with the field named.
 */
export function validateInvoiceInput(input: UblInvoiceInput): string[] {
  const problems: string[] = []

  if (!input.number?.trim()) problems.push('Invoice number is missing.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.uuid)) {
    problems.push('Invoice UUID must be a version 4 UUID.')
  }
  if (!Number.isInteger(input.icv) || input.icv < 1) problems.push('Invoice counter value must be a positive integer.')
  if (!input.pih) problems.push('Previous invoice hash is missing — the ZATCA chain would break.')
  if (!input.supplier?.vatNumber || !/^\d{15}$/.test(input.supplier.vatNumber)) {
    problems.push('Supplier VAT number must be 15 digits.')
  }
  if (!input.supplier?.address) problems.push('Supplier National Address is required on every invoice.')
  if (!input.lines?.length) problems.push('An invoice needs at least one line.')

  if (!input.simplified) {
    // Standard (B2B) invoices must identify the buyer.
    if (!input.customer) problems.push('A standard tax invoice must name the buyer.')
    else if (!input.customer.vatNumber && !input.customer.identification) {
      problems.push('A standard tax invoice needs the buyer VAT number or another buyer identifier.')
    }
    if (!input.customer?.address) problems.push('A standard tax invoice needs the buyer address.')
  }

  if (input.documentTypeCode !== DOCUMENT_TYPE_CODE.TAX_INVOICE) {
    if (!input.billingReference) problems.push('A credit or debit note must reference the original invoice.')
    if (!input.instructionNote) problems.push('A credit or debit note must state the reason for issue.')
  }

  const declaredTax = Number(input.totals.taxAmount)
  const subtotalTax = input.taxSubtotals.reduce((a, s) => a + Number(s.taxAmount), 0)
  if (Math.abs(declaredTax - subtotalTax) > 0.01) {
    problems.push(
      `Tax total ${toAmountString(declaredTax)} does not match the sum of the tax breakdown ${toAmountString(subtotalTax)}.`,
    )
  }

  return problems
}
