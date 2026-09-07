/**
 * Reading the CSID certificate ZATCA issues.
 *
 * Three things are needed out of it and none are exposed by Node's X509Certificate:
 *   • the issuer name in the comma-separated order XAdES expects
 *   • the serial number as a decimal integer
 *   • the raw signature bytes, which become QR tag 9 on a standard invoice
 */
import { X509Certificate } from 'node:crypto'
import { addCertificateArmour } from './csr'

/** Walk one DER TLV at `offset`, returning its tag, content window and the next offset. */
function readTlv(der: Buffer, offset: number): { tag: number; start: number; end: number; next: number } {
  const tag = der[offset]
  let cursor = offset + 1
  let length = der[cursor]
  cursor += 1
  if (length & 0x80) {
    const byteCount = length & 0x7f
    if (byteCount === 0 || byteCount > 4) throw new Error('Unsupported DER length encoding in certificate')
    length = 0
    for (let i = 0; i < byteCount; i += 1) {
      length = length * 256 + der[cursor]
      cursor += 1
    }
  }
  return { tag, start: cursor, end: cursor + length, next: cursor + length }
}

/**
 * Raw ECDSA signature over the certificate — Certificate ::= SEQUENCE { tbs, algId, sig }.
 * The BIT STRING's first content byte counts unused bits and is dropped.
 */
export function certificateSignatureBytes(certificate: string | Buffer): Buffer {
  const der = Buffer.isBuffer(certificate)
    ? certificate
    : Buffer.from(new X509Certificate(addCertificateArmour(certificate)).raw)

  const outer = readTlv(der, 0)
  if (outer.tag !== 0x30) throw new Error('Certificate is not a DER SEQUENCE')

  const tbs = readTlv(der, outer.start)
  const algorithm = readTlv(der, tbs.next)
  const signature = readTlv(der, algorithm.next)
  if (signature.tag !== 0x03) throw new Error('Certificate signature is not a BIT STRING')

  return der.subarray(signature.start + 1, signature.end)
}

export interface CertificateFacts {
  /** Base64 certificate body with no PEM armour — the form ZATCA sends and expects back. */
  base64: string
  /** Issuer distinguished name, comma-separated, most specific first. */
  issuerName: string
  /** Serial number as a decimal string, which is what `xades:X509SerialNumber` requires. */
  serialNumber: string
  /** DER SubjectPublicKeyInfo — QR tag 8. */
  publicKeyDer: Buffer
  /** ZATCA's signature over this certificate — QR tag 9. */
  signature: Buffer
  validFrom: Date
  validTo: Date
  subject: string
}

/**
 * Node renders a DN as newline-separated `TYPE=value` lines, outermost first. XAdES wants a
 * single comma-separated string in the reverse (most specific first) order, which is how
 * ZATCA's validator compares it.
 */
export function formatDistinguishedName(nodeDn: string): string {
  return nodeDn
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .join(', ')
}

/** Serial numbers come out of Node as hex; XAdES wants the decimal value. */
export function hexToDecimalString(hex: string): string {
  return BigInt(`0x${hex.replace(/[^0-9a-fA-F]/g, '')}`).toString(10)
}

export function readCertificate(certificate: string): CertificateFacts {
  const pem = addCertificateArmour(certificate)
  const x509 = new X509Certificate(pem)

  return {
    base64: Buffer.from(x509.raw).toString('base64'),
    issuerName: formatDistinguishedName(x509.issuer),
    serialNumber: hexToDecimalString(x509.serialNumber),
    publicKeyDer: x509.publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
    signature: certificateSignatureBytes(Buffer.from(x509.raw)),
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
    subject: formatDistinguishedName(x509.subject),
  }
}

/** Warn before a stamp certificate expires — a lapsed CSID stops invoicing dead. */
export function daysUntilExpiry(facts: CertificateFacts, now = new Date()): number {
  return Math.floor((facts.validTo.getTime() - now.getTime()) / 86_400_000)
}
