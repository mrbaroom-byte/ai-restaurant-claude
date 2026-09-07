/**
 * TOTP (RFC 6238), used as the second factor for the Owner and Accountant roles.
 *
 * Implemented here rather than pulled in, because it is forty lines of HMAC and the alternative
 * is another dependency in the authentication path.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD_SECONDS = 30
const DIGITS = 6
/** Accept the neighbouring windows, so a slow phone clock does not lock someone out. */
const DRIFT_WINDOWS = 1

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`"${char}" is not a base32 character.`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** The code for one time step. */
export function generateTotp(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha1', key).update(buffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function currentCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / PERIOD_SECONDS)
}

/** Verify a code, allowing one window of clock drift either side. */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const candidate = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(candidate)) return false

  const counter = currentCounter(now)
  for (let offset = -DRIFT_WINDOWS; offset <= DRIFT_WINDOWS; offset += 1) {
    const expected = generateTotp(secret, counter + offset)
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true
  }
  return false
}
