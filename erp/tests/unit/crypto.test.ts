import { describe, expect, it } from 'vitest'
import { VaultError, decrypt, encrypt, isEncrypted, mask, resetKeyCache, safeEqual } from '@/lib/crypto/vault'
import { hashPassword, needsRehash, verifyPassword } from '@/lib/crypto/password'
import { randomBytes } from 'node:crypto'

const key = randomBytes(32)

describe('vault', () => {
  it('round-trips a value', () => {
    const secret = '-----BEGIN PRIVATE KEY-----\nMIGEAgEA...\n-----END PRIVATE KEY-----'
    expect(decrypt(encrypt(secret, key), key)).toBe(secret)
  })

  it('produces a different ciphertext each time, so equal values are not linkable', () => {
    expect(encrypt('SA0380000000608010167519', key)).not.toBe(encrypt('SA0380000000608010167519', key))
  })

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    const sealed = encrypt('sensitive', key)
    const parts = sealed.split(':')
    const flipped = Buffer.from(parts[3], 'base64')
    flipped[0] ^= 0xff
    parts[3] = flipped.toString('base64')
    expect(() => decrypt(parts.join(':'), key)).toThrow(VaultError)
  })

  it('refuses the wrong key', () => {
    expect(() => decrypt(encrypt('x', key), randomBytes(32))).toThrow(VaultError)
  })

  it('refuses a value that is not in the encrypted format', () => {
    expect(() => decrypt('plain text', key)).toThrow(/expected encrypted format/)
  })

  it('recognises its own ciphertext', () => {
    expect(isEncrypted(encrypt('x', key))).toBe(true)
    expect(isEncrypted('SA0380000000608010167519')).toBe(false)
    expect(isEncrypted(null)).toBe(false)
  })

  it('rejects a key of the wrong length with a message that says how to make one', () => {
    resetKeyCache()
    expect(() => encrypt('x', Buffer.alloc(16) as never)).toThrow()
    resetKeyCache()
  })

  it('masks all but the last few characters', () => {
    expect(mask('SA0380000000608010167519')).toBe('••••••••••••••••••••7519')
    expect(mask('1098765432', 3)).toBe('•••••••432')
    expect(mask('abc', 4)).toBe('•••')
  })

  it('compares in constant time and handles unequal lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('passwords', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false)
  }, 20_000)

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('a-long-enough-password')).not.toBe(await hashPassword('a-long-enough-password'))
  }, 20_000)

  it('normalises Unicode so an Arabic password typed two ways still verifies', async () => {
    const stored = await hashPassword('كلمةمرور طويلة جدا')
    expect(await verifyPassword('كلمةمرور طويلة جدا'.normalize('NFD'), stored)).toBe(true)
  }, 20_000)

  it('refuses a password too short to be worth hashing', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/)
  })

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('anything', 'bcrypt$1$2$3$4$5')).toBe(false)
  })

  it('flags a hash made with weaker parameters for upgrade', async () => {
    expect(needsRehash('scrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash(await hashPassword('a-long-enough-password'))).toBe(false)
  }, 20_000)
})
