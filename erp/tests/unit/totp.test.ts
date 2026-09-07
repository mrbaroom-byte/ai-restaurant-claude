import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, currentCounter, generateTotp, generateTotpSecret, verifyTotp } from '@/lib/crypto/totp'

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0x42])
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
  })

  it('matches the RFC 4648 test vectors', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY')
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ')
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
  })

  it('rejects a character that is not in the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow(/not a base32 character/)
  })
})

describe('TOTP', () => {
  // RFC 6238 appendix B uses the ASCII secret "12345678901234567890".
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890'))

  it('reproduces the RFC 6238 SHA-1 test vectors', () => {
    expect(generateTotp(rfcSecret, Math.floor(59 / 30))).toBe('287082')
    expect(generateTotp(rfcSecret, Math.floor(1111111109 / 30))).toBe('081804')
    expect(generateTotp(rfcSecret, Math.floor(1234567890 / 30))).toBe('005924')
  })

  it('accepts the code for the current window', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotp(secret, generateTotp(secret, currentCounter(now)), now)).toBe(true)
  })

  it('tolerates one window of clock drift either way', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    const counter = currentCounter(now)
    expect(verifyTotp(secret, generateTotp(secret, counter - 1), now)).toBe(true)
    expect(verifyTotp(secret, generateTotp(secret, counter + 1), now)).toBe(true)
  })

  it('refuses a code two windows out', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotp(secret, generateTotp(secret, currentCounter(now) - 3), now)).toBe(false)
  })

  it('refuses anything that is not six digits', () => {
    const secret = generateTotpSecret()
    for (const bad of ['12345', '1234567', 'abcdef', '', '12 34 56 7']) {
      expect(verifyTotp(secret, bad), bad).toBe(false)
    }
  })

  it('ignores spaces the user typed from their phone', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    const code = generateTotp(secret, currentCounter(now))
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true)
  })
})
