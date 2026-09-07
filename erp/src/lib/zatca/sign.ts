/**
 * The cryptographic stamp — XAdES-B enveloped signature inside `ext:UBLExtensions`.
 *
 * Order of operations, which matters:
 *   1. build the invoice without extensions, signature or QR
 *   2. hash it (`hashInvoice`) → the DigestValue of the invoice reference
 *   3. build SignedProperties (signing time, certificate digest, issuer/serial) and hash it
 *   4. build SignedInfo referencing both digests, canonicalise it, sign with the stamp key
 *   5. assemble the signature block, then compute the QR from the hash + signature + cert
 */
import { createPrivateKey, createSign, createVerify } from 'node:crypto'
import { type XmlElement, el, leaf, serialize } from './xml'
import { certificateDigest, sha256Base64 } from './hash'
import type { CertificateFacts } from './certificate'

export const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'
export const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#'
export const SIG_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2'
export const SAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2'
export const SBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2'
export const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
export const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'

export const C14N11 = 'http://www.w3.org/2006/12/xml-c14n11'
export const SHA256_URI = 'http://www.w3.org/2001/04/xmlenc#sha256'
export const ECDSA_SHA256_URI = 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256'
export const XPATH_TRANSFORM = 'http://www.w3.org/TR/1999/REC-xpath-19991116'

export const SIGNED_PROPERTIES_ID = 'xadesSignedProperties'

/**
 * The three XPath transforms ZATCA specifies: the signed data is the invoice with the
 * extensions, the UBL signature element and the QR reference removed.
 */
const INVOICE_TRANSFORMS = [
  "not(//ancestor-or-self::ext:UBLExtensions)",
  "not(//ancestor-or-self::cac:Signature)",
  "not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])",
]

/**
 * SignedProperties, whose canonical form is hashed into the second `ds:Reference`.
 *
 * The namespace declarations are carried on the element itself because the digest is taken
 * over this subtree in isolation, and a C14N of a detached subtree must include the
 * namespaces it inherits.
 */
export function signedPropertiesFor(cert: CertificateFacts, signingTime: Date): XmlElement {
  return el(
    'xades:SignedProperties',
    { Id: SIGNED_PROPERTIES_ID, 'xmlns:xades': XADES_NS },
    [
      el('xades:SignedSignatureProperties', undefined, [
        leaf('xades:SigningTime', signingTime.toISOString().replace(/\.\d{3}Z$/, 'Z')),
        el('xades:SigningCertificate', undefined, [
          el('xades:Cert', undefined, [
            el('xades:CertDigest', undefined, [
              el('ds:DigestMethod', { Algorithm: SHA256_URI, 'xmlns:ds': XMLDSIG_NS }),
              leaf('ds:DigestValue', certificateDigest(cert.base64), { 'xmlns:ds': XMLDSIG_NS }),
            ]),
            el('xades:IssuerSerial', undefined, [
              leaf('ds:X509IssuerName', cert.issuerName, { 'xmlns:ds': XMLDSIG_NS }),
              leaf('ds:X509SerialNumber', cert.serialNumber, { 'xmlns:ds': XMLDSIG_NS }),
            ]),
          ]),
        ]),
      ]),
    ],
  )
}

function buildSignedInfo(invoiceHash: string, signedPropertiesHash: string): XmlElement {
  return el('ds:SignedInfo', { 'xmlns:ds': XMLDSIG_NS }, [
    el('ds:CanonicalizationMethod', { Algorithm: C14N11 }),
    el('ds:SignatureMethod', { Algorithm: ECDSA_SHA256_URI }),
    el('ds:Reference', { Id: 'invoiceSignedData', URI: '' }, [
      el(
        'ds:Transforms',
        undefined,
        [
          ...INVOICE_TRANSFORMS.map((xpath) =>
            el('ds:Transform', { Algorithm: XPATH_TRANSFORM }, [leaf('ds:XPath', xpath)]),
          ),
          el('ds:Transform', { Algorithm: C14N11 }),
        ],
      ),
      el('ds:DigestMethod', { Algorithm: SHA256_URI }),
      leaf('ds:DigestValue', invoiceHash),
    ]),
    el(
      'ds:Reference',
      { Type: 'http://www.w3.org/2000/09/xmldsig#SignatureProperties', URI: `#${SIGNED_PROPERTIES_ID}` },
      [el('ds:DigestMethod', { Algorithm: SHA256_URI }), leaf('ds:DigestValue', signedPropertiesHash)],
    ),
  ])
}

export interface StampResult {
  /** The `ext:UBLExtensions` element to prepend to the invoice. */
  extensions: XmlElement
  /** Base64 ECDSA signature — QR tag 7. */
  signatureValue: string
  /** Base64 digest of the SignedProperties block, exposed for diagnostics. */
  signedPropertiesHash: string
  signingTime: Date
}

/**
 * Sign an invoice hash and produce the whole extension block.
 *
 * `privateKeyPem` is the secp256k1 stamp key. The signature is DER-encoded, which is what
 * ZATCA's validator expects from a `SHA256withECDSA` signer.
 */
export function stampInvoice(params: {
  invoiceHash: string
  certificate: CertificateFacts
  privateKeyPem: string
  signingTime?: Date
}): StampResult {
  const signingTime = params.signingTime ?? new Date()
  const signedProperties = signedPropertiesFor(params.certificate, signingTime)
  const signedPropertiesHash = sha256Base64(serialize(signedProperties))

  const signedInfo = buildSignedInfo(params.invoiceHash, signedPropertiesHash)

  const signer = createSign('SHA256')
  signer.update(serialize(signedInfo), 'utf8')
  signer.end()
  const signatureValue = signer.sign(createPrivateKey(params.privateKeyPem)).toString('base64')

  const signature = el('ds:Signature', { Id: 'signature', 'xmlns:ds': XMLDSIG_NS }, [
    signedInfo,
    leaf('ds:SignatureValue', signatureValue),
    el('ds:KeyInfo', undefined, [
      el('ds:X509Data', undefined, [leaf('ds:X509Certificate', params.certificate.base64)]),
    ]),
    el('ds:Object', undefined, [
      el('xades:QualifyingProperties', { Target: 'signature', 'xmlns:xades': XADES_NS }, [signedProperties]),
    ]),
  ])

  const extensions = el('ext:UBLExtensions', undefined, [
    el('ext:UBLExtension', undefined, [
      leaf('ext:ExtensionURI', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'),
      el('ext:ExtensionContent', undefined, [
        el(
          'sig:UBLDocumentSignatures',
          { 'xmlns:sig': SIG_NS, 'xmlns:sac': SAC_NS, 'xmlns:sbc': SBC_NS },
          [
            el('sac:SignatureInformation', undefined, [
              leaf('cbc:ID', 'urn:oasis:names:specification:ubl:signature:1'),
              leaf('sbc:ReferencedSignatureID', 'urn:oasis:names:specification:ubl:signature:Invoice'),
              signature,
            ]),
          ],
        ),
      ]),
    ]),
  ])

  return { extensions, signatureValue, signedPropertiesHash, signingTime }
}

/** Verify our own signature before submitting; a local failure is cheaper than a rejection. */
export function verifyStamp(params: {
  invoiceHash: string
  signedPropertiesHash: string
  signatureValue: string
  publicKeyPem: string
}): boolean {
  const signedInfo = buildSignedInfo(params.invoiceHash, params.signedPropertiesHash)
  const verifier = createVerify('SHA256')
  verifier.update(serialize(signedInfo), 'utf8')
  verifier.end()
  return verifier.verify(params.publicKeyPem, Buffer.from(params.signatureValue, 'base64'))
}
