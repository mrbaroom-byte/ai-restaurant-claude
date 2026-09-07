/**
 * Reading the session in a server component or route handler.
 *
 * `requirePrincipal` and `requirePermission` are the two functions every protected page and
 * endpoint starts with. Hiding a menu item is presentation; these are the access control.
 */
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { type Locale, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import { type Permission, type Principal, AuthorizationError, can } from '@/lib/rbac'
import { SESSION_COOKIE, principalFromApiKey, principalFromToken } from './services/auth'

export const LOCALE_COOKIE = 'nakhla_locale'

export async function currentPrincipal(): Promise<Principal | null> {
  const store = await cookies()
  const fromCookie = await principalFromToken(store.get(SESSION_COOKIE)?.value)
  if (fromCookie) return fromCookie

  // A bearer value is either the session token the login endpoint handed back, or a long-lived
  // API key. Both are accepted, so a caller does not have to know which kind it holds.
  const header = (await headers()).get('authorization')
  if (header?.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim()
    return (await principalFromToken(bearer)) ?? (await principalFromApiKey(bearer))
  }
  return null
}

/** For a page: send an unauthenticated visitor to sign in rather than showing an error. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await currentPrincipal()
  if (!principal) redirect('/login')
  return principal
}

export async function requirePermission(permission: Permission): Promise<Principal> {
  const principal = await requirePrincipal()
  if (!can(principal, permission)) throw new AuthorizationError(permission)
  return principal
}

export async function currentLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
