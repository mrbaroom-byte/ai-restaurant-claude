/**
 * Session cookie attributes.
 *
 * `Secure` must be set whenever the connection is HTTPS, and must not be set when it is not —
 * a Secure cookie over plain HTTP is simply never sent, which presents to the user as "I sign
 * in and nothing happens". Deciding it from NODE_ENV alone breaks the two deployments a small
 * business actually has: a production build served over http on a shop LAN, and any e2e run
 * against `next start`.
 *
 * So it is decided from the request: the forwarded protocol a TLS terminator sets, else the
 * host, with `COOKIE_SECURE` as an explicit override for an operator who knows better.
 */
import { headers } from 'next/headers'

export interface CookieAttributes {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
}

export async function isSecureRequest(): Promise<boolean> {
  const override = process.env.COOKIE_SECURE
  if (override === 'true') return true
  if (override === 'false') return false

  const store = await headers()

  // Set by every common TLS terminator: nginx, Caddy, ALB, Cloudflare.
  const forwarded = store.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwarded) return forwarded === 'https'

  const host = store.get('host') ?? ''
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return false
  }

  // No forwarding header and not local: assume the deployment is behind TLS, which is what
  // the production compose file sets up.
  return process.env.NODE_ENV === 'production'
}

export async function sessionCookieAttributes(): Promise<CookieAttributes> {
  return { httpOnly: true, sameSite: 'lax', secure: await isSecureRequest(), path: '/' }
}
