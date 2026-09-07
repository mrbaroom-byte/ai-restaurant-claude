/**
 * ZATCA onboarding: key pair and certificate signing request.
 *
 * The flow the Settings screen walks a user through:
 *   1. generate a secp256k1 key pair (this module)
 *   2. build a CSR carrying the EGS unit's identifiers (this module)
 *   3. POST the CSR with the Fatoora portal OTP → compliance CSID
 *   4. run the compliance checks with that CSID
 *   5. exchange it for the production CSID
 *
 * The private key never leaves the server and is stored encrypted (see `src/lib/crypto/vault.ts`).
 */
import { createPrivateKey, createPublicKey, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import {
  OID,
  bitString,
  contextConstructed,
  fromPem,
  oid,
  octetString,
  printableString,
  sequence,
  set,
  toPem,
  utf8String,
  integer,
} from './asn1'

export interface EgsUnitInfo {
  /** Common name — a unique name for this EGS unit (till, branch server, ERP instance). */
  commonName: string
  /** Legal entity name as registered. */
  organizationName: string
  /** Branch or department name; for a VAT group, the group member's 10-digit number. */
  organizationalUnitName: string
  /** Always "SA" for Saudi Arabia. */
  countryCode?: string
  /**
   * EGS serial number, format `1-<solution name>|2-<model/version>|3-<serial number>`.
   * ZATCA matches this against the device that submits, so it must be stable.
   */
  serialNumber: string
  /** 15-digit VAT registration number. */
  vatNumber: string
  /**
   * Invoice type flag, four digits `TSCZ`: T=standard, S=simplified, and two reserved zeroes.
   * `1100` = both standard and simplified. `1000` = standard only. `0100` = simplified only.
   */
  invoiceType: string
  /** Registered address, free text. */
  registeredAddress: string
  /** Industry / business category, e.g. "Restaurants". */
  businessCategory: string
}

export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production'

/**
 * Certificate template name per environment. ZATCA publishes these in the onboarding guide;
 * they are configurable in Settings so a template rename does not require a code change
 * (DECISIONS.md D-013).
 */
export const DEFAULT_CERTIFICATE_TEMPLATE: Record<ZatcaEnvironment, string> = {
  sandbox: 'TSTZATCA-Code-Signing',
  simulation: 'PREZATCA-Code-Signing',
  production: 'ZATCA-Code-Signing',
}

export interface GeneratedKeyPair {
  privateKeyPem: string
  publicKeyPem: string
  /** DER SubjectPublicKeyInfo — this is what goes into QR tag 8. */
  publicKeyDer: Buffer
}

/** Generate the secp256k1 key pair that will carry the cryptographic stamp. */
export function generateStampKeyPair(): GeneratedKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    publicKeyDer: createPublicKey(publicKey).export({ type: 'spki', format: 'der' }) as Buffer,
  }
}

function rdn(typeOid: string, value: Buffer): Buffer {
  return set(sequence(oid(typeOid), value))
}

/** Validate the fields ZATCA rejects rather than explains. */
export function validateEgsUnitInfo(info: EgsUnitInfo): void {
  const problems: string[] = []
  if (!/^\d{15}$/.test(info.vatNumber)) {
    problems.push('VAT number must be exactly 15 digits.')
  } else if (!info.vatNumber.startsWith('3') || !info.vatNumber.endsWith('3')) {
    // ZATCA's own validation: a Saudi VAT number starts and ends with 3.
    problems.push('VAT number must start and end with the digit 3.')
  }
  if (!/^[01]{2}0{2}$/.test(info.invoiceType)) {
    problems.push('Invoice type must be four digits, e.g. 1100 for standard and simplified.')
  }
  if (info.invoiceType === '0000') {
    problems.push('Invoice type must enable standard, simplified, or both.')
  }
  if (!/^1-[^|]+\|2-[^|]+\|3-[^|]+$/.test(info.serialNumber)) {
    problems.push('EGS serial number must have the form 1-<solution>|2-<model>|3-<serial>.')
  }
  if (!info.commonName.trim()) problems.push('Common name is required.')
  if (!info.organizationName.trim()) problems.push('Organisation name is required.')
  if (!info.organizationalUnitName.trim()) problems.push('Organisational unit is required.')
  if (problems.length) {
    throw new Error(`The EGS unit details are not acceptable to ZATCA:\n- ${problems.join('\n- ')}`)
  }
}

/**
 * Build the PKCS#10 CSR ZATCA's compliance endpoint expects.
 *
 * The subject carries C/OU/O/CN; the identifiers ZATCA actually reads live in a
 * subjectAltName directoryName, alongside a certificate template name extension.
 */
export function buildCsr(info: EgsUnitInfo, privateKeyPem: string, environment: ZatcaEnvironment = 'sandbox', templateName?: string): { der: Buffer; pem: string; base64: string } {
  validateEgsUnitInfo(info)

  const privateKey: KeyObject = createPrivateKey(privateKeyPem)
  const publicKeyDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer

  const subject = sequence(
    rdn(OID.country, printableString(info.countryCode ?? 'SA')),
    rdn(OID.organizationalUnit, utf8String(info.organizationalUnitName)),
    rdn(OID.organization, utf8String(info.organizationName)),
    rdn(OID.commonName, utf8String(info.commonName)),
  )

  // The identifiers ZATCA parses out of the CSR.
  const altNameDirectory = sequence(
    rdn(OID.serialNumber, utf8String(info.serialNumber)),
    rdn(OID.userId, utf8String(info.vatNumber)),
    rdn(OID.title, utf8String(info.invoiceType)),
    rdn(OID.registeredAddress, utf8String(info.registeredAddress)),
    rdn(OID.businessCategory, utf8String(info.businessCategory)),
  )
  // GeneralName [4] directoryName is explicitly tagged, so it wraps the RDNSequence.
  const subjectAltName = sequence(contextConstructed(4, altNameDirectory))

  const extensions = sequence(
    sequence(
      oid(OID.certificateTemplateName),
      octetString(printableString(templateName ?? DEFAULT_CERTIFICATE_TEMPLATE[environment])),
    ),
    sequence(oid(OID.subjectAltName), octetString(subjectAltName)),
  )

  const attributes = contextConstructed(0, sequence(oid(OID.extensionRequest), set(extensions)))

  const certificationRequestInfo = sequence(
    integer(0),
    subject,
    // SubjectPublicKeyInfo: Node already gives us the exact DER we need.
    publicKeyDer,
    attributes,
  )

  const signer = createSign('SHA256')
  signer.update(certificationRequestInfo)
  signer.end()
  const signature = signer.sign(privateKey)

  const der = sequence(
    certificationRequestInfo,
    sequence(oid(OID.ecdsaWithSha256)),
    bitString(signature),
  )

  const pem = toPem(der, 'CERTIFICATE REQUEST')
  return { der, pem, base64: der.toString('base64') }
}

/** ZATCA's compliance API wants the CSR as base64 of the PEM text, not of the DER. */
export function csrForSubmission(pem: string): string {
  return Buffer.from(pem, 'utf8').toString('base64')
}

/** Certificate text without the PEM armour — the form ZATCA returns and we store. */
export function stripCertificateArmour(certificate: string): string {
  return certificate.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
}

/** Re-add PEM armour so Node can parse a certificate ZATCA returned bare. */
export function addCertificateArmour(certificateBase64: string): string {
  if (certificateBase64.includes('BEGIN CERTIFICATE')) return certificateBase64
  return toPem(Buffer.from(certificateBase64, 'base64'), 'CERTIFICATE')
}

export { fromPem, toPem }
