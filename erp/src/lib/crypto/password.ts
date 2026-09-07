/**
 * Password hashing.
 *
 * scrypt from Node's own crypto, with per-password salt and the parameters OWASP currently
 * recommends for it (N=2^17, r=8, p=1, 64-byte output). No native dependency to compile, which
 * matters for a system a small business will deploy on whatever host they have.
 *
 * Stored form: `scrypt$N$r$p$<salt base64>$<hash base64>`, so the parameters can be raised
 * later and old hashes still verify.
 */
import { type ScryptOptions, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

/** promisify loses scrypt's options overload, so the wrapper is written out. */
function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    )
  })
}

const N = 2 ** 17
const r = 8
const p = 1
const KEY_LENGTH = 64
// scrypt needs roughly 128 * N * r bytes; the default 32 MB limit is far too small for N=2^17.
const MAX_MEMORY = 256 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Passwords must be at least 12 characters.')
  }
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY })
  return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const derived = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
    maxmem: MAX_MEMORY,
  })

  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/** True when a stored hash used weaker parameters and should be upgraded on next sign-in. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true
  return Number(parts[1]) < N || Number(parts[2]) < r
}
