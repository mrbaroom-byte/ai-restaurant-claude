import { NextResponse, type NextRequest } from 'next/server'

/**
 * Server components cannot read the current path, so it is passed down as a header. The
 * application layout needs it to let the two-factor enrolment page through while everything
 * else is blocked behind enrolment.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Static assets and the health check do not need this.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
