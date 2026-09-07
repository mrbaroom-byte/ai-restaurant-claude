import { describe, expect, it } from 'vitest'
import { buildQrBase64, buildQrTlv, decodeQrTlv, describeQr, encodeTag, truncateUtf8 } from '@/lib/zatca/tlv'

describe('TLV encoding', () => {
  it('lays out tag, length and value in that order', () => {
    const buf = encodeTag(1, 'AB')
    expect([...buf]).toEqual([1, 2, 0x41, 0x42])
  })

  it('counts bytes, not characters, for Arabic text', () => {
    const buf = encodeTag(1, 'مطعم')
    expect(buf[0]).toBe(1)
    expect(buf[1]).toBe(8) // four Arabic letters, two bytes each
    expect(buf.length).toBe(10)
  })

  it('refuses a value the single length byte cannot describe', () => {
    expect(() => encodeTag(1, 'x'.repeat(256))).toThrow(/255/)
  })

  it('refuses a tag outside 1-255', () => {
    expect(() => encodeTag(0, 'x')).toThrow(RangeError)
    expect(() => encodeTag(256, 'x')).toThrow(RangeError)
  })

  it('truncates on a character boundary, never mid-codepoint', () => {
    const arabic = 'م'.repeat(200) // 400 bytes
    const cut = truncateUtf8(arabic, 255)
    expect(Buffer.from(cut, 'utf8').length).toBeLessThanOrEqual(255)
    // A mid-codepoint cut would produce U+FFFD on decode.
    expect(cut).not.toContain('�')
    expect(cut.length).toBe(127)
  })
})

describe('Phase 1 QR (five tags)', () => {
  const payload = {
    sellerName: 'مطعم نخلة',
    vatNumber: '300000000000003',
    timestamp: new Date('2026-03-15T10:30:00Z'),
    invoiceTotal: '115.00',
    vatTotal: '15.00',
  }

  it('encodes exactly the five mandatory tags', () => {
    const tags = decodeQrTlv(buildQrTlv(payload))
    expect(tags.map((t) => t.tag)).toEqual([1, 2, 3, 4, 5])
  })

  it('round-trips through base64 back to the original values', () => {
    const decoded = describeQr(buildQrBase64(payload))
    expect(decoded.sellerName).toBe('مطعم نخلة')
    expect(decoded.vatNumber).toBe('300000000000003')
    expect(decoded.timestamp).toBe('2026-03-15T10:30:00Z')
    expect(decoded.invoiceTotal).toBe('115.00')
    expect(decoded.vatTotal).toBe('15.00')
  })

  it('writes the timestamp as ISO 8601 Zulu with no milliseconds', () => {
    const decoded = describeQr(buildQrBase64({ ...payload, timestamp: new Date('2026-03-15T10:30:00.123Z') }))
    expect(decoded.timestamp).toBe('2026-03-15T10:30:00Z')
  })

  it('rejects an unparseable timestamp instead of encoding "Invalid Date"', () => {
    expect(() => buildQrTlv({ ...payload, timestamp: 'not a date' })).toThrow(/Invalid QR timestamp/)
  })
})

describe('Phase 2 QR', () => {
  const base = {
    sellerName: 'Nakhla Restaurant',
    vatNumber: '300000000000003',
    timestamp: new Date('2026-03-15T10:30:00Z'),
    invoiceTotal: '115.00',
    vatTotal: '15.00',
    invoiceHash: 'ZmFrZS1oYXNo',
    signature: 'ZmFrZS1zaWc=',
    publicKey: Buffer.from([0x30, 0x56, 0x30, 0x10]),
  }

  it('carries tags 1-8 on a simplified invoice', () => {
    expect(decodeQrTlv(buildQrTlv(base)).map((t) => t.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('adds tag 9 on a standard invoice', () => {
    const tags = decodeQrTlv(buildQrTlv({ ...base, certificateSignature: Buffer.from([0xde, 0xad]) }))
    expect(tags.map((t) => t.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(tags[8].value).toEqual(Buffer.from([0xde, 0xad]))
  })

  it('keeps the hash and signature as text but the key as raw bytes', () => {
    const tags = decodeQrTlv(buildQrTlv(base))
    expect(tags[5].value.toString('utf8')).toBe('ZmFrZS1oYXNo')
    expect(tags[7].value).toEqual(base.publicKey)
  })

  it('refuses to decode a truncated TLV rather than returning a partial reading', () => {
    const buf = buildQrTlv(base)
    expect(() => decodeQrTlv(buf.subarray(0, buf.length - 3))).toThrow(/Truncated TLV/)
  })
})
