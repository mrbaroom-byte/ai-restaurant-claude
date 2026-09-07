/**
 * Route handler plumbing: authenticate, authorise, validate, and turn a domain error into a
 * response the caller can act on.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthorizationError, BranchAccessError, type Permission, can } from '@/lib/rbac'
import { PostingError } from '@/lib/accounting/posting'
import { StockError } from '@/lib/inventory/valuation'
import { SequenceError } from '@/lib/sequence'
import { ZatcaValidationError } from '@/lib/zatca'
import { WpsValidationError } from '@/lib/payroll/wps'
import { InvoiceError } from '@/server/services/invoice'
import { AuthError } from '@/server/services/auth'
import { currentPrincipal } from '@/server/session'
import type { Principal } from '@/lib/rbac'

export function ok<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

export function fail(code: string, message: string, status: number, details?: Array<{ path: string; message: string }>): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status })
}

/**
 * Map a thrown error to a status and a message.
 *
 * Domain errors carry their own explanation, so the response says what is wrong and what to do
 * about it. Anything unrecognised becomes a 500 with a reference the user can quote — the
 * details go to the log, not to the caller.
 */
export function errorResponse(error: unknown, locale: 'ar' | 'en' = 'en'): NextResponse {
  const arabic = locale === 'ar'

  if (error instanceof z.ZodError) {
    return fail(
      'VALIDATION_FAILED',
      arabic ? 'البيانات المرسلة غير مكتملة أو غير صحيحة.' : 'The request could not be accepted as sent.',
      422,
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }
  if (error instanceof AuthError) return fail(error.code, error.message, 401)
  if (error instanceof AuthorizationError) return fail('FORBIDDEN', arabic ? error.messageAr : error.message, 403)
  if (error instanceof BranchAccessError) return fail('FORBIDDEN', arabic ? error.messageAr : error.message, 403)
  if (error instanceof PostingError) return fail(error.code, arabic ? error.messageAr : error.message, 409)
  if (error instanceof StockError) return fail(error.code, arabic ? error.messageAr : error.message, 409)
  if (error instanceof InvoiceError) return fail(error.code, arabic ? error.messageAr : error.message, 409)
  if (error instanceof SequenceError) return fail('SEQUENCE', arabic ? error.messageAr : error.message, 409)
  if (error instanceof ZatcaValidationError) return fail('ZATCA_VALIDATION', error.message, 422)
  if (error instanceof WpsValidationError) return fail('WPS_VALIDATION', error.message, 422)

  const reference = Math.random().toString(36).slice(2, 10).toUpperCase()
  console.error(`[${reference}]`, error)
  return fail(
    'INTERNAL',
    arabic
      ? `تعذّر إتمام العملية. الرقم المرجعي: ${reference}`
      : `That did not go through. Reference: ${reference}`,
    500,
  )
}

/** Authenticate and authorise, or throw the error `errorResponse` knows how to render. */
export async function authorize(permission: Permission | null): Promise<Principal> {
  const principal = await currentPrincipal()
  if (!principal) throw new AuthError('INVALID_CREDENTIALS', 'Sign in first.')
  if (permission && !can(principal, permission)) throw new AuthorizationError(permission)
  return principal
}

export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new z.ZodError([{ code: 'custom', path: [], message: 'The request body is not valid JSON.' }])
  }
  return schema.parse(body)
}

export function parseQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  return schema.parse(params)
}
