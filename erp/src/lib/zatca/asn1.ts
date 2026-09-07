/**
 * Minimal DER encoder.
 *
 * Node's crypto module can generate and use secp256k1 keys but cannot produce a PKCS#10
 * certificate signing request, and ZATCA's CSR carries custom extensions that no generic
 * library exposes anyway. So we encode the handful of ASN.1 constructs we need ourselves.
 * Everything here is DER (definite length, minimal encoding), which is what a CSR requires.
 */

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  SEQUENCE: 0x30,
  SET: 0x31,
} as const

/** DER length: short form below 128, else long form with the minimum number of bytes. */
export function encodeLength(length: number): Buffer {
  if (length < 0) throw new RangeError('ASN.1 length cannot be negative')
  if (length < 0x80) return Buffer.from([length])

  const bytes: number[] = []
  let remaining = length
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff)
    remaining >>>= 8
  }
  if (bytes.length > 0x7e) throw new RangeError('ASN.1 value is implausibly large')
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

export function encode(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content])
}

export function sequence(...items: Buffer[]): Buffer {
  return encode(TAG.SEQUENCE, Buffer.concat(items))
}

export function set(...items: Buffer[]): Buffer {
  return encode(TAG.SET, Buffer.concat(items))
}

export function integer(value: number | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return encode(TAG.INTEGER, value)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Only non-negative safe integers are encoded here')
  }
  const bytes: number[] = []
  let remaining = value
  do {
    bytes.unshift(remaining & 0xff)
    remaining = Math.floor(remaining / 256)
  } while (remaining > 0)
  // A leading bit of 1 would read as negative, so pad with a zero byte.
  if (bytes[0] & 0x80) bytes.unshift(0)
  return encode(TAG.INTEGER, Buffer.from(bytes))
}

/** BIT STRING with zero unused bits, which is all a CSR ever needs. */
export function bitString(content: Buffer): Buffer {
  return encode(TAG.BIT_STRING, Buffer.concat([Buffer.from([0x00]), content]))
}

export function octetString(content: Buffer): Buffer {
  return encode(TAG.OCTET_STRING, content)
}

export function boolean(value: boolean): Buffer {
  return encode(TAG.BOOLEAN, Buffer.from([value ? 0xff : 0x00]))
}

export function utf8String(value: string): Buffer {
  return encode(TAG.UTF8_STRING, Buffer.from(value, 'utf8'))
}

export function printableString(value: string): Buffer {
  if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(value)) {
    throw new RangeError(`Value is not encodable as a PrintableString: ${value}`)
  }
  return encode(TAG.PRINTABLE_STRING, Buffer.from(value, 'ascii'))
}

export function ia5String(value: string): Buffer {
  return encode(TAG.IA5_STRING, Buffer.from(value, 'ascii'))
}

export function nullValue(): Buffer {
  return Buffer.from([TAG.NULL, 0x00])
}

/** Context-specific constructed tag, e.g. `[0]` for CSR attributes. */
export function contextConstructed(number: number, content: Buffer): Buffer {
  return encode(0xa0 | number, content)
}

/** Context-specific primitive tag, e.g. `[4]` for a directoryName GeneralName. */
export function contextPrimitive(number: number, content: Buffer): Buffer {
  return encode(0x80 | number, content)
}

/** Encode a dotted OID string into DER. */
export function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map((p) => {
    const n = Number(p)
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Bad OID arc: ${p}`)
    return n
  })
  if (parts.length < 2) throw new RangeError(`OID needs at least two arcs: ${dotted}`)

  const bytes: number[] = [parts[0] * 40 + parts[1]]
  for (const arc of parts.slice(2)) {
    if (arc < 0x80) {
      bytes.push(arc)
      continue
    }
    const chunk: number[] = []
    let remaining = arc
    while (remaining > 0) {
      chunk.unshift(remaining & 0x7f)
      remaining = Math.floor(remaining / 128)
    }
    for (let i = 0; i < chunk.length - 1; i += 1) chunk[i] |= 0x80
    bytes.push(...chunk)
  }
  return encode(TAG.OID, Buffer.from(bytes))
}

/** Object identifiers referenced by the CSR builder. */
export const OID = {
  commonName: '2.5.4.3',
  country: '2.5.4.6',
  organization: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  serialNumber: '2.5.4.5',
  title: '2.5.4.12',
  registeredAddress: '2.5.4.26',
  businessCategory: '2.5.4.15',
  userId: '0.9.2342.19200300.100.1.1',
  ecPublicKey: '1.2.840.10045.2.1',
  secp256k1: '1.3.132.0.10',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  extensionRequest: '1.2.840.113549.1.9.14',
  subjectAltName: '2.5.29.17',
  /** Microsoft certificate template name — ZATCA reuses it to select the CSID template. */
  certificateTemplateName: '1.3.6.1.4.1.311.20.2',
} as const

/** Wrap DER bytes in a PEM block. */
export function toPem(der: Buffer, label: string): string {
  const b64 = der.toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

/** Strip a PEM block back to DER bytes. */
export function fromPem(pem: string): Buffer {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  return Buffer.from(body, 'base64')
}
