/**
 * ZATCA QR code — TLV (tag / length / value) encoding.
 *
 * Phase 2 requires nine tags. Tags 1–7 carry UTF-8 text (the hash and the signature travel as
 * their base64 *strings*); tags 8 and 9 carry raw binary (the DER public key and ZATCA's
 * signature over the certificate). This split follows ZATCA's own SDK — see DECISIONS.md D-011.
 *
 * Length is a single byte, so no field may exceed 255 bytes. Seller names are truncated on a
 * character boundary rather than mid-codepoint, which would produce an unscannable QR.
 */

export const QR_TAG = {
  SELLER_NAME: 1,
  VAT_NUMBER: 2,
  TIMESTAMP: 3,
  INVOICE_TOTAL: 4,
  VAT_TOTAL: 5,
  INVOICE_HASH: 6,
  SIGNATURE: 7,
  PUBLIC_KEY: 8,
  CERTIFICATE_SIGNATURE: 9,
} as const

export interface QrPayload {
  /** Seller's registered name, exactly as on the VAT certificate. */
  sellerName: string
  /** 15-digit VAT registration number. */
  vatNumber: string
  /** Invoice issue instant, ISO 8601. */
  timestamp: Date | string
  /** Total including VAT, two decimals, as printed on the invoice. */
  invoiceTotal: string
  /** VAT total, two decimals. */
  vatTotal: string
  /** Base64 SHA-256 of the canonicalised invoice XML. */
  invoiceHash?: string
  /** Base64 ECDSA signature over the invoice hash. */
  signature?: string
  /** DER SubjectPublicKeyInfo bytes of the stamp public key. */
  publicKey?: Buffer
  /** ZATCA's signature over the CSID certificate. Standard invoices only. */
  certificateSignature?: Buffer
}

/** Encode one TLV field. Throws rather than silently truncating a value that must be exact. */
export function encodeTag(tag: number, value: string | Buffer): Buffer {
  if (!Number.isInteger(tag) || tag < 1 || tag > 255) {
    throw new RangeError(`QR tag must be 1–255, received ${tag}`)
  }
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
  if (bytes.length > 255) {
    throw new RangeError(
      `QR tag ${tag} is ${bytes.length} bytes; the TLV length field holds at most 255.`,
    )
  }
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes])
}

/** Cut a UTF-8 string to at most `maxBytes` without splitting a character. */
export function truncateUtf8(value: string, maxBytes = 255): string {
  const buf = Buffer.from(value, 'utf8')
  if (buf.length <= maxBytes) return value
  let end = maxBytes
  // Walk back off any continuation byte (10xxxxxx) so we never cut a codepoint in half.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1
  return buf.subarray(0, end).toString('utf8')
}

function isoZulu(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid QR timestamp: ${String(value)}`)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Build the TLV buffer.
 *
 * Simplified (B2C) invoices carry tags 1–8. Standard (B2B) invoices additionally carry tag 9.
 * Phase 1 fallback — used only before onboarding completes — carries tags 1–5.
 */
export function buildQrTlv(payload: QrPayload): Buffer {
  const parts: Buffer[] = [
    encodeTag(QR_TAG.SELLER_NAME, truncateUtf8(payload.sellerName)),
    encodeTag(QR_TAG.VAT_NUMBER, payload.vatNumber),
    encodeTag(QR_TAG.TIMESTAMP, isoZulu(payload.timestamp)),
    encodeTag(QR_TAG.INVOICE_TOTAL, payload.invoiceTotal),
    encodeTag(QR_TAG.VAT_TOTAL, payload.vatTotal),
  ]

  if (payload.invoiceHash) parts.push(encodeTag(QR_TAG.INVOICE_HASH, payload.invoiceHash))
  if (payload.signature) parts.push(encodeTag(QR_TAG.SIGNATURE, payload.signature))
  if (payload.publicKey) parts.push(encodeTag(QR_TAG.PUBLIC_KEY, payload.publicKey))
  if (payload.certificateSignature) {
    parts.push(encodeTag(QR_TAG.CERTIFICATE_SIGNATURE, payload.certificateSignature))
  }

  return Buffer.concat(parts)
}

/** Base64 TLV — the exact string that goes into the QR image and into the UBL XML. */
export function buildQrBase64(payload: QrPayload): string {
  return buildQrTlv(payload).toString('base64')
}

export interface DecodedTag {
  tag: number
  length: number
  value: Buffer
}

/**
 * Decode a TLV buffer. Used by the compliance self-check screen so a user can see exactly what
 * their QR contains, and by the test suite to prove round-tripping.
 */
export function decodeQrTlv(input: Buffer | string): DecodedTag[] {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'base64')
  const tags: DecodedTag[] = []
  let offset = 0
  while (offset < buf.length) {
    if (offset + 2 > buf.length) throw new Error('Truncated TLV: missing length byte.')
    const tag = buf[offset]
    const length = buf[offset + 1]
    const start = offset + 2
    const end = start + length
    if (end > buf.length) {
      throw new Error(`Truncated TLV: tag ${tag} declares ${length} bytes but only ${buf.length - start} remain.`)
    }
    tags.push({ tag, length, value: buf.subarray(start, end) })
    offset = end
  }
  return tags
}

/** Human-readable decode for the diagnostics screen. */
export function describeQr(input: Buffer | string): Record<string, string> {
  const names: Record<number, string> = {
    1: 'sellerName', 2: 'vatNumber', 3: 'timestamp', 4: 'invoiceTotal', 5: 'vatTotal',
    6: 'invoiceHash', 7: 'signature', 8: 'publicKey', 9: 'certificateSignature',
  }
  const out: Record<string, string> = {}
  for (const t of decodeQrTlv(input)) {
    const key = names[t.tag] ?? `tag${t.tag}`
    out[key] = t.tag >= 8 ? t.value.toString('base64') : t.value.toString('utf8')
  }
  return out
}
