/**
 * Encryption at rest for the values that must never appear in a database dump in the clear:
 * ZATCA private keys and CSIDs, IBANs, and national identity numbers.
 *
 * AES-256-GCM with a random 96-bit nonce per value. The key comes from `ENCRYPTION_KEY`
 * (32 bytes, base64) and is never written anywhere. Ciphertext is stored as
 * `v1:<nonce>:<tag>:<ciphertext>`, all base64, so a future key rotation can be told apart
 * from the current one by its prefix.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12

export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

let cachedKey: Buffer | null = null

export function loadKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (cachedKey) return cachedKey
  if (!raw) {
    throw new VaultError(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new VaultError(`ENCRYPTION_KEY must decode to 32 bytes; it decoded to ${key.length}.`)
  }
  cachedKey = key
  return key
}

/** Reset the cached key. Tests use it; production never calls it. */
export function resetKeyCache(): void {
  cachedKey = null
}

export function encrypt(plaintext: string, key = loadKey()): string {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, nonce.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decrypt(payload: string, key = loadKey()): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new VaultError('Stored value is not in the expected encrypted format.')
  }
  const [, nonceB64, tagB64, ciphertextB64] = parts
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(nonceB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // A GCM tag failure means the ciphertext was altered or the wrong key was used. Both
    // are security events, so the message says nothing about which.
    throw new VaultError('Could not decrypt the stored value.')
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`)
}

/**
 * Mask a value for display: an IBAN shows its last four, an identity number its last three.
 * Used everywhere a sensitive field appears on screen or in an export.
 */
export function mask(value: string, visible = 4): string {
  const trimmed = value.replace(/\s+/g, '')
  if (trimmed.length <= visible) return '•'.repeat(trimmed.length)
  return '•'.repeat(trimmed.length - visible) + trimmed.slice(-visible)
}

/** Constant-time comparison for API keys and session tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}
