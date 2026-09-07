/**
 * Authentication and session handling.
 *
 * Sessions are opaque random tokens stored as a hash, so a database dump cannot be replayed as
 * a login. Owner and Accountant must have TOTP enabled — those two roles can move money and
 * close the books, and a password alone is not enough for that.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { type Permission, type Principal, type RoleName, assertPermission } from '@/lib/rbac'
import { hashPassword, needsRehash, verifyPassword } from '@/lib/crypto/password'
import { decrypt, encrypt } from '@/lib/crypto/vault'
import { generateTotpSecret, verifyTotp } from '@/lib/crypto/totp'
import { prisma } from '../db'

/** Roles for which a second factor is compulsory. */
export const TOTP_REQUIRED_ROLES: RoleName[] = ['OWNER', 'ACCOUNTANT']

export const SESSION_COOKIE = 'nakhla_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export class AuthError extends Error {
  readonly code: 'INVALID_CREDENTIALS' | 'TOTP_REQUIRED' | 'INVALID_TOTP' | 'SUSPENDED'
  readonly status = 401
  constructor(code: AuthError['code'], message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SignInResult {
  token: string
  refreshToken: string
  expiresAt: Date
  principal: Principal
  locale: string
}

export async function signIn(params: {
  email: string
  password: string
  totpCode?: string
  ipAddress?: string
  userAgent?: string
}): Promise<SignInResult> {
  const user = await prisma.user.findFirst({
    where: { email: params.email.trim().toLowerCase(), deletedAt: null },
  })

  // Hash regardless, so a missing account and a wrong password take the same time.
  const storedHash = user?.passwordHash ?? '$scrypt$0$0$0$0$0'
  const passwordOk = await verifyPassword(params.password, storedHash)

  if (!user || !user.passwordHash || !passwordOk) {
    throw new AuthError('INVALID_CREDENTIALS', 'That email and password do not match an account.')
  }
  if (user.status !== 'ACTIVE') {
    throw new AuthError('SUSPENDED', 'This account is suspended.')
  }

  const role = user.role as RoleName
  if (TOTP_REQUIRED_ROLES.includes(role) || user.totpEnabled) {
    if (!user.totpSecret) {
      throw new AuthError(
        'TOTP_REQUIRED',
        'This role requires two-factor authentication. Set it up before signing in.',
      )
    }
    if (!params.totpCode) throw new AuthError('TOTP_REQUIRED', 'Enter the code from your authenticator app.')
    if (!verifyTotp(decrypt(user.totpSecret), params.totpCode)) {
      throw new AuthError('INVALID_TOTP', 'That code is not right, or it has expired.')
    }
  }

  // Upgrade the stored hash if the parameters have been raised since it was made.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(params.password) },
    })
  }

  const token = randomBytes(32).toString('base64url')
  const refreshToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: tokenHash(token),
      refreshHash: tokenHash(refreshToken),
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  })
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  return {
    token,
    refreshToken,
    expiresAt,
    locale: user.locale,
    principal: {
      userId: user.id,
      tenantId: user.tenantId,
      role,
      branchIds: user.branchIds,
      extraPermissions: user.extraPermissions as Permission[],
      revokedPermissions: user.revokedPermissions as Permission[],
    },
  }
}

/** Resolve a session cookie to a principal, or null when it is missing or expired. */
export async function principalFromToken(token: string | undefined): Promise<Principal | null> {
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt) return null

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role as RoleName,
    branchIds: session.user.branchIds,
    extraPermissions: session.user.extraPermissions as Permission[],
    revokedPermissions: session.user.revokedPermissions as Permission[],
  }
}

export async function signOut(token: string | undefined): Promise<void> {
  if (!token) return
  await prisma.session.updateMany({
    where: { tokenHash: tokenHash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Revoke every session for a user — used when a password changes or an account is suspended. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}

/** Begin TOTP enrolment. The secret is only stored once the user proves they can read a code. */
export async function beginTotpEnrolment(userId: string, issuer = 'Nakhla ERP') {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const secret = generateTotpSecret()
  const label = encodeURIComponent(`${issuer}:${user.email}`)
  return {
    secret,
    otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
  }
}

export async function completeTotpEnrolment(userId: string, secret: string, code: string): Promise<void> {
  if (!verifyTotp(secret, code)) {
    throw new AuthError('INVALID_TOTP', 'That code is not right. Check your authenticator app and try again.')
  }
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encrypt(secret), totpEnabled: true },
  })
}

/**
 * API key authentication for integrations.
 *
 * The key is shown once at creation and only its hash is stored, so a leaked database gives an
 * attacker nothing they can present as a key.
 */
export async function principalFromApiKey(key: string | undefined): Promise<Principal | null> {
  if (!key) return null

  const record = await prisma.apiKey.findUnique({ where: { keyHash: tokenHash(key) } })
  if (!record || record.revokedAt) return null
  if (record.expiresAt && record.expiresAt < new Date()) return null

  // Presented key and stored prefix must agree, which makes a hash collision useless.
  const prefix = key.slice(0, 8)
  if (
    prefix.length !== record.prefix.length ||
    !timingSafeEqual(Buffer.from(prefix), Buffer.from(record.prefix))
  ) {
    return null
  }

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })

  return {
    userId: `apikey:${record.id}`,
    tenantId: record.tenantId,
    // An API key carries explicit permissions, never a role's whole set.
    role: 'AUDITOR',
    branchIds: [],
    extraPermissions: record.permissions as Permission[],
  }
}

export function createApiKey(): { key: string; prefix: string; hash: string } {
  const key = `nk_${randomBytes(24).toString('base64url')}`
  return { key, prefix: key.slice(0, 8), hash: tokenHash(key) }
}

export { assertPermission }
