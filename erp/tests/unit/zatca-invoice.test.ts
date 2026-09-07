import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createPublicKey } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeDocument } from '@/lib/tax/vat'
import {
  DOCUMENT_TYPE_CODE,
  INITIAL_PIH,
  ZatcaValidationError,
  assertChainContinuity,
  buildCsr,
  describeQr,
  generateStampKeyPair,
  hashInvoice,
  invoiceTypeName,
  nextChainLink,
  prepareInvoice,
  readCertificate,
  validateEgsUnitInfo,
  stampInvoice,
  verifyStamp,
} from '@/lib/zatca'
import { buildInvoiceXml } from '@/lib/zatca/ubl'
import { canonicalizeForHash } from '@/lib/zatca/hash'

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8')
const certificatePem = fixture('stamp-cert.pem')
const privateKeyPem = fixture('stamp-key.pem')

const supplier = {
  registrationName: 'مؤسسة نخلة للمطاعم',
  vatNumber: '300000000000003',
  identification: { schemeId: 'CRN' as const, value: '4030123456' },
  address: {
    buildingNumber: '3245',
    street: 'طريق الأمير سلطان',
    district: 'الروضة',
    city: 'جدة',
    postalCode: '23434',
    additionalNumber: '7712',
    region: 'منطقة مكة المكرمة',
  },
}

const customer = {
  registrationName: 'شركة البحر الأحمر للتجارة',
  vatNumber: '311111111111113',
  identification: { schemeId: 'CRN' as const, value: '4030999888' },
  address: {
    buildingNumber: '1200',
    street: 'شارع التحلية',
    district: 'الأندلس',
    city: 'جدة',
    postalCode: '23326',
    additionalNumber: '4410',
  },
}

const lines = [
  { nameEn: 'Chicken Mandi', nameAr: 'مندي دجاج', unitCode: 'PCE', quantity: '2', unitPrice: '45.00' },
  { nameEn: 'Fresh Juice', nameAr: 'عصير طازج', unitCode: 'PCE', quantity: '3', unitPrice: '12.00' },
]

const totals = computeDocument({
  lines: [
    { quantity: 2, unitPrice: '45.00', vatCategory: 'STANDARD' },
    { quantity: 3, unitPrice: '12.00', vatCategory: 'STANDARD' },
  ],
})

const baseParams = {
  number: 'INV-JED-2026-000001',
  issueDate: new Date('2026-03-15T10:30:00Z'),
  documentTypeCode: DOCUMENT_TYPE_CODE.TAX_INVOICE,
  simplified: false,
  supplier,
  customer,
  lines,
  totals,
  icv: 1,
  pih: INITIAL_PIH,
  uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be',
  certificatePem,
  privateKeyPem,
  signingTime: new Date('2026-03-15T10:30:05Z'),
}

describe('invoice type name', () => {
  it('flags standard versus simplified in the first two positions', () => {
    expect(invoiceTypeName({ ...baseParams, simplified: false } as never)).toBe('0100000')
    expect(invoiceTypeName({ ...baseParams, simplified: true } as never)).toBe('0200000')
  })

  it('sets the export and self-billed flags in their own positions', () => {
    expect(invoiceTypeName({ simplified: false, isExport: true } as never)).toBe('0100100')
    expect(invoiceTypeName({ simplified: false, isSelfBilled: true } as never)).toBe('0100001')
    expect(invoiceTypeName({ simplified: true, isThirdParty: true, isSummary: true } as never)).toBe('0210010')
  })
})

describe('prepareInvoice', () => {
  const prepared = prepareInvoice(baseParams)

  it('produces a document that carries the mandatory ZATCA fields', () => {
    expect(prepared.xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')
    expect(prepared.xml).toContain('<cbc:ID>INV-JED-2026-000001</cbc:ID>')
    expect(prepared.xml).toContain('<cbc:UUID>3cf5ee18-ee25-44ea-a444-2c37ba7f28be</cbc:UUID>')
    expect(prepared.xml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>')
    expect(prepared.xml).toContain('<cbc:IssueDate>2026-03-15</cbc:IssueDate>')
    expect(prepared.xml).toContain('<cbc:IssueTime>10:30:00</cbc:IssueTime>')
    expect(prepared.xml).toContain('<cbc:CompanyID>300000000000003</cbc:CompanyID>')
    expect(prepared.xml).toContain('<cbc:PayableAmount currencyID="SAR">144.90</cbc:PayableAmount>')
    expect(prepared.xml).toContain('<cbc:TaxExclusiveAmount currencyID="SAR">126.00</cbc:TaxExclusiveAmount>')
  })

  it('carries the ICV and the previous invoice hash', () => {
    expect(prepared.xml).toContain('<cbc:ID>ICV</cbc:ID><cbc:UUID>1</cbc:UUID>')
    expect(prepared.xml).toContain(INITIAL_PIH)
  })

  it('routes a B2B invoice to clearance and a B2C invoice to reporting', () => {
    expect(prepared.submissionMode).toBe('CLEARANCE')
    const simplified = prepareInvoice({ ...baseParams, simplified: true, customer: undefined })
    expect(simplified.submissionMode).toBe('REPORTING')
  })

  it('embeds the QR in the XML and prints the same value', () => {
    expect(prepared.xml).toContain(prepared.qrBase64)
    const decoded = describeQr(prepared.qrBase64)
    expect(decoded.sellerName).toBe('مؤسسة نخلة للمطاعم')
    expect(decoded.vatNumber).toBe('300000000000003')
    expect(decoded.invoiceTotal).toBe('144.90')
    expect(decoded.vatTotal).toBe('18.90')
    expect(decoded.invoiceHash).toBe(prepared.invoiceHash)
    expect(decoded.signature).toBe(prepared.signatureValue)
  })

  it('omits tag 9 on a simplified invoice and includes it on a standard one', () => {
    expect(describeQr(prepared.qrBase64).certificateSignature).toBeTruthy()
    const simplified = prepareInvoice({ ...baseParams, simplified: true, customer: undefined })
    expect(describeQr(simplified.qrBase64).certificateSignature).toBeUndefined()
  })

  it('excludes the extensions, signature and QR from the hashed data', () => {
    const canonical = canonicalizeForHash(buildInvoiceXml({
      number: baseParams.number,
      uuid: baseParams.uuid,
      issueDate: baseParams.issueDate,
      documentTypeCode: DOCUMENT_TYPE_CODE.TAX_INVOICE,
      simplified: false,
      icv: 1,
      pih: INITIAL_PIH,
      qrBase64: 'SHOULD-NOT-BE-HASHED',
      supplier,
      customer,
      lines: [],
      taxSubtotals: [],
      totals: {
        lineExtensionAmount: '0.00', taxExclusiveAmount: '0.00', taxInclusiveAmount: '0.00',
        allowanceTotalAmount: '0.00', prepaidAmount: '0.00', payableRoundingAmount: '0.00',
        payableAmount: '0.00', taxAmount: '0.00',
      },
    }))
    expect(canonical).not.toContain('SHOULD-NOT-BE-HASHED')
    expect(canonical).not.toContain('cac:Signature')
    expect(canonical).not.toContain('ext:UBLExtensions')
  })

  it('produces a hash that does not change when the QR and signature are added', () => {
    // The whole scheme depends on this: sign first, then add the QR that contains the signature.
    const unsigned = buildInvoiceXml({
      number: baseParams.number, uuid: baseParams.uuid, issueDate: baseParams.issueDate,
      documentTypeCode: DOCUMENT_TYPE_CODE.TAX_INVOICE, simplified: false, icv: 1, pih: INITIAL_PIH,
      supplier, customer, lines: [], taxSubtotals: [],
      totals: {
        lineExtensionAmount: '0.00', taxExclusiveAmount: '0.00', taxInclusiveAmount: '0.00',
        allowanceTotalAmount: '0.00', prepaidAmount: '0.00', payableRoundingAmount: '0.00',
        payableAmount: '0.00', taxAmount: '0.00',
      },
    })
    const withQr = buildInvoiceXml({
      number: baseParams.number, uuid: baseParams.uuid, issueDate: baseParams.issueDate,
      documentTypeCode: DOCUMENT_TYPE_CODE.TAX_INVOICE, simplified: false, icv: 1, pih: INITIAL_PIH,
      qrBase64: 'anything-at-all', supplier, customer, lines: [], taxSubtotals: [],
      totals: {
        lineExtensionAmount: '0.00', taxExclusiveAmount: '0.00', taxInclusiveAmount: '0.00',
        allowanceTotalAmount: '0.00', prepaidAmount: '0.00', payableRoundingAmount: '0.00',
        payableAmount: '0.00', taxAmount: '0.00',
      },
    })
    expect(hashInvoice(unsigned)).toBe(hashInvoice(withQr))
  })

  it('hashes the same invoice to the same value every time', () => {
    // ECDSA uses a random nonce, so the signature — and therefore the document bytes —
    // differ between runs. The hash must not: the chain and the QR both depend on it.
    const again = prepareInvoice(baseParams)
    expect(again.invoiceHash).toBe(prepared.invoiceHash)
    expect(again.signatureValue).not.toBe(prepared.signatureValue)
    expect(again.uuid).toBe(prepared.uuid)
  })

  it('changes the hash when any invoiced value changes', () => {
    const tampered = prepareInvoice({ ...baseParams, number: 'INV-JED-2026-000002' })
    expect(tampered.invoiceHash).not.toBe(prepared.invoiceHash)
  })

  it('signs with the stamp key and verifies against its own certificate', () => {
    const cert = readCertificate(certificatePem)
    const publicKey = createPublicKey(certificatePem).export({ type: 'spki', format: 'pem' }) as string
    const stamp = stampInvoice({
      invoiceHash: prepared.invoiceHash,
      certificate: cert,
      privateKeyPem,
      signingTime: baseParams.signingTime,
    })
    expect(
      verifyStamp({
        invoiceHash: prepared.invoiceHash,
        signedPropertiesHash: stamp.signedPropertiesHash,
        signatureValue: stamp.signatureValue,
        publicKeyPem: publicKey,
      }),
    ).toBe(true)
  })

  it('embeds the certificate and the XAdES signed properties', () => {
    expect(prepared.xml).toContain('<ds:X509Certificate>')
    expect(prepared.xml).toContain('xades:SignedProperties')
    expect(prepared.xml).toContain('Id="xadesSignedProperties"')
    expect(prepared.xml).toContain('<xades:SigningTime>2026-03-15T10:30:05Z</xades:SigningTime>')
  })
})

describe('prepareInvoice validation', () => {
  it('refuses a standard invoice with no buyer', () => {
    expect(() => prepareInvoice({ ...baseParams, customer: undefined })).toThrow(ZatcaValidationError)
  })

  it('refuses a credit note with no original reference or reason', () => {
    try {
      prepareInvoice({ ...baseParams, documentTypeCode: DOCUMENT_TYPE_CODE.CREDIT_NOTE })
      throw new Error('should have refused')
    } catch (error) {
      const problems = (error as ZatcaValidationError).problems
      expect(problems.join(' ')).toMatch(/reference the original invoice/)
      expect(problems.join(' ')).toMatch(/state the reason/)
    }
  })

  it('accepts a credit note that carries both', () => {
    const note = prepareInvoice({
      ...baseParams,
      number: 'CRN-JED-2026-000001',
      documentTypeCode: DOCUMENT_TYPE_CODE.CREDIT_NOTE,
      icv: 2,
      pih: 'abc',
      billingReference: { number: 'INV-JED-2026-000001', issueDate: baseParams.issueDate },
      instructionNote: 'إرجاع البضاعة',
    })
    expect(note.xml).toContain('<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>')
    expect(note.xml).toContain('<cac:BillingReference>')
    expect(note.xml).toContain('إرجاع البضاعة')
  })

  it('refuses a malformed VAT number', () => {
    expect(() =>
      prepareInvoice({ ...baseParams, supplier: { ...supplier, vatNumber: '30000' } }),
    ).toThrow(/15 digits/)
  })

  it('refuses an invoice with no lines', () => {
    expect(() =>
      prepareInvoice({ ...baseParams, lines: [], totals: computeDocument({ lines: [] }) }),
    ).toThrow(/at least one line/)
  })
})

describe('hash chain', () => {
  it('starts at ICV 1 with the fixed initial PIH', () => {
    expect(nextChainLink(null)).toEqual({ icv: 1, pih: INITIAL_PIH })
  })

  it('links each invoice to the hash of the one before it', () => {
    const first = { icv: 1, pih: INITIAL_PIH, invoiceHash: 'HASH-1' }
    expect(nextChainLink(first)).toEqual({ icv: 2, pih: 'HASH-1' })
  })

  it('accepts a well-formed chain', () => {
    expect(() =>
      assertChainContinuity([
        { icv: 1, pih: INITIAL_PIH, invoiceHash: 'H1' },
        { icv: 2, pih: 'H1', invoiceHash: 'H2' },
        { icv: 3, pih: 'H2', invoiceHash: 'H3' },
      ]),
    ).not.toThrow()
  })

  it('detects a deleted invoice as a counter gap', () => {
    expect(() =>
      assertChainContinuity([
        { icv: 1, pih: INITIAL_PIH, invoiceHash: 'H1' },
        { icv: 3, pih: 'H1', invoiceHash: 'H3' },
      ]),
    ).toThrow(/gap/i)
  })

  it('detects a tampered chain as a hash mismatch', () => {
    expect(() =>
      assertChainContinuity([
        { icv: 1, pih: INITIAL_PIH, invoiceHash: 'H1' },
        { icv: 2, pih: 'WRONG', invoiceHash: 'H2' },
      ]),
    ).toThrow(/chain is broken/i)
  })

  it('chains real invoices end to end', () => {
    let link = nextChainLink(null)
    const issued: { icv: number; pih: string; invoiceHash: string }[] = []
    for (let i = 0; i < 5; i += 1) {
      const inv = prepareInvoice({
        ...baseParams,
        number: `INV-JED-2026-${String(i + 1).padStart(6, '0')}`,
        uuid: `3cf5ee18-ee25-44ea-a444-2c37ba7f28b${i}`,
        icv: link.icv,
        pih: link.pih,
      })
      issued.push({ icv: link.icv, pih: link.pih, invoiceHash: inv.invoiceHash })
      link = nextChainLink({ icv: link.icv, pih: link.pih, invoiceHash: inv.invoiceHash })
    }
    expect(() => assertChainContinuity(issued)).not.toThrow()
    expect(issued.at(-1)!.icv).toBe(5)
  })
})

describe('CSR generation', () => {
  const egs = {
    commonName: 'NAKHLA-POS-JED-01',
    organizationName: 'مؤسسة نخلة للمطاعم',
    organizationalUnitName: 'Jeddah Branch',
    serialNumber: '1-NakhlaERP|2-1.0.0|3-JED-POS-01',
    vatNumber: '300000000000003',
    invoiceType: '1100',
    registeredAddress: 'Prince Sultan Road, Al Rawdah, Jeddah 23434',
    businessCategory: 'Restaurants',
  }

  it('rejects details ZATCA would reject, with a reason for each', () => {
    expect(() => validateEgsUnitInfo({ ...egs, vatNumber: '123' })).toThrow(/15 digits/)
    expect(() => validateEgsUnitInfo({ ...egs, vatNumber: '400000000000004' })).toThrow(/start and end with the digit 3/)
    expect(() => validateEgsUnitInfo({ ...egs, invoiceType: '1111' })).toThrow(/four digits/)
    expect(() => validateEgsUnitInfo({ ...egs, invoiceType: '0000' })).toThrow(/standard, simplified, or both/)
    expect(() => validateEgsUnitInfo({ ...egs, serialNumber: 'POS-1' })).toThrow(/1-<solution>/)
  })

  it('produces a CSR OpenSSL can parse, verify and read our identifiers out of', () => {
    const keys = generateStampKeyPair()
    const csr = buildCsr(egs, keys.privateKeyPem, 'sandbox')

    const dir = mkdtempSync(join(tmpdir(), 'csr-'))
    const path = join(dir, 'request.csr')
    writeFileSync(path, csr.pem)

    const text = execFileSync('openssl', ['req', '-in', path, '-noout', '-text', '-verify'], {
      encoding: 'utf8',
      // OpenSSL writes the verification verdict to stderr, the CSR dump to stdout.
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const verdict = execFileSync('sh', ['-c', `openssl req -in ${path} -noout -verify 2>&1`], {
      encoding: 'utf8',
    })

    // OpenSSL only prints this line when the CSR's own signature checks out.
    expect(verdict).toMatch(/verify OK/i)
    expect(text).toContain('NAKHLA-POS-JED-01')
    expect(text).toContain('secp256k1')
    expect(text).toContain('ecdsa-with-SHA256')
    // The ZATCA identifiers travel in the subjectAltName directoryName.
    expect(text).toContain('300000000000003')
    expect(text).toContain('1-NakhlaERP')
    expect(text).toContain('TSTZATCA-Code-Signing')
  })

  it("uses the environment's certificate template", () => {
    const keys = generateStampKeyPair()
    const dir = mkdtempSync(join(tmpdir(), 'csr-'))
    for (const [env, expected] of [['simulation', 'PREZATCA-Code-Signing'], ['production', 'ZATCA-Code-Signing']] as const) {
      const csr = buildCsr(egs, keys.privateKeyPem, env)
      const path = join(dir, `${env}.csr`)
      writeFileSync(path, csr.pem)
      const text = execFileSync('openssl', ['req', '-in', path, '-noout', '-text'], { encoding: 'utf8' })
      expect(text).toContain(expected)
    }
  })
})

describe('certificate reading', () => {
  it('extracts the issuer, serial, public key and signature', () => {
    const facts = readCertificate(certificatePem)
    expect(facts.issuerName).toContain('CN=TSTZATCA-Code-Signing')
    expect(facts.serialNumber).toMatch(/^\d+$/)
    expect(facts.publicKeyDer.length).toBeGreaterThan(20)
    expect(facts.signature.length).toBeGreaterThan(20)
    expect(facts.base64).not.toContain('BEGIN CERTIFICATE')
  })

  it('reverses the DN so the most specific component comes first', () => {
    const facts = readCertificate(certificatePem)
    expect(facts.issuerName.indexOf('CN=')).toBeLessThan(facts.issuerName.indexOf('C=SA'))
  })
})
