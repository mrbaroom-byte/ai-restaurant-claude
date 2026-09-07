import { cookies } from 'next/headers'
import { loginRequest } from '@/lib/api/contract'
import { errorResponse, ok, parseBody } from '@/lib/api/respond'
import { SESSION_COOKIE, signIn } from '@/server/services/auth'

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, loginRequest)
    const result = await signIn({
      ...body,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    ;(await cookies()).set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    })

    return ok({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      role: result.principal.role,
      tenantId: result.principal.tenantId,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
