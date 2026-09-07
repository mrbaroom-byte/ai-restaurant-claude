/**
 * Invoice hashing and the ZATCA hash chain.
 *
 * Every invoice carries two chain values:
 *   • ICV — Invoice Counter Value, a strictly incrementing integer per device/solution.
 *   • PIH — Previous Invoice Hash, the base64 SHA-256 of the invoice before it.
 *
 * Together they let ZATCA detect a deleted or reordered invoice. Breaking the chain is the
 * single most common reason a Phase 2 onboarding fails, so the chain is validated here rather
 * than trusted, and `assertChainContinuity` runs before every submission.
 */
import { createHash } from 'node:crypto'
import { type XmlElement, pruneTree, serialize } from './xml'

/**
 * PIH of the first invoice in a chain: base64 of the SHA-256 *hex string* of "0".
 * ZATCA fixes this value; it is a constant, not something we compute at runtime, so that a
 * mistake in our own hashing can never silently produce a plausible-looking chain start.
 */
export const INITIAL_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=='

/**
 * Elements excluded from the hash. They either contain the signature itself (which cannot hash
 * over its own value) or are added after signing.
 */
const EXCLUDED_FROM_HASH = new Set(['ext:UBLExtensions', 'cac:Signature'])

function isQrReference(node: XmlElement): boolean {
  if (node.name !== 'cac:AdditionalDocumentReference') return false
  const id = (node.children ?? []).find(
    (c): c is XmlElement => !!c && typeof c === 'object' && c.name === 'cbc:ID',
  )
  return id?.text === 'QR'
}

/** The exact byte string ZATCA hashes: canonical XML minus extensions, signature and QR. */
export function canonicalizeForHash(invoice: XmlElement): string {
  const pruned = pruneTree(invoice, (n) => EXCLUDED_FROM_HASH.has(n.name) || isQrReference(n))
  return serialize(pruned)
}

/** Base64 SHA-256 of the canonicalised invoice. This is the value signed and put in tag 6. */
export function hashInvoice(invoice: XmlElement): string {
  return createHash('sha256').update(canonicalizeForHash(invoice), 'utf8').digest('base64')
}

/** Hash of an already-canonicalised string, for verifying documents we did not generate. */
export function hashCanonicalString(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('base64')
}

/** Base64 SHA-256 of arbitrary bytes — used for the certificate digest in SignedProperties. */
export function sha256Base64(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('base64')
}

/**
 * The certificate digest ZATCA expects in `xades:SignedSignatureProperties`: the SHA-256 of the
 * base64 certificate *text* (not of the DER bytes), then base64-encoded. This double-encoding
 * is a genuine quirk of the specification, not a mistake here — see DECISIONS.md D-012.
 */
export function certificateDigest(certificateBase64: string): string {
  return sha256Base64(certificateBase64)
}

export interface ChainLink {
  icv: number
  pih: string
  invoiceHash: string
}

export class ChainError extends Error {
  readonly code: string
  readonly messageAr: string
  constructor(code: string, en: string, ar: string) {
    super(en)
    this.name = 'ChainError'
    this.code = code
    this.messageAr = ar
  }
}

/** The chain values for the next invoice, given the last one that was issued. */
export function nextChainLink(previous: ChainLink | null): { icv: number; pih: string } {
  if (!previous) return { icv: 1, pih: INITIAL_PIH }
  return { icv: previous.icv + 1, pih: previous.invoiceHash }
}

/** Verify a chain before submission. Throws with a message the user can act on. */
export function assertChainContinuity(links: ChainLink[]): void {
  let expectedIcv = 1
  let expectedPih = INITIAL_PIH

  for (const link of links) {
    if (link.icv !== expectedIcv) {
      throw new ChainError(
        'ICV_GAP',
        `Invoice counter is ${link.icv} but ${expectedIcv} was expected. The chain has a gap — an invoice was deleted or issued out of order.`,
        `عداد الفواتير ${link.icv} بينما المتوقع ${expectedIcv}. توجد فجوة في السلسلة — تم حذف فاتورة أو إصدارها خارج الترتيب.`,
      )
    }
    if (link.pih !== expectedPih) {
      throw new ChainError(
        'PIH_MISMATCH',
        `Invoice ${link.icv} references the wrong previous hash. The chain is broken.`,
        `الفاتورة رقم ${link.icv} تشير إلى تجزئة سابقة غير صحيحة. السلسلة مكسورة.`,
      )
    }
    expectedIcv = link.icv + 1
    expectedPih = link.invoiceHash
  }
}
