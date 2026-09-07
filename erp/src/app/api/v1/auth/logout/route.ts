import { cookies } from 'next/headers'
import { errorResponse, ok } from '@/lib/api/respond'
import { SESSION_COOKIE, signOut } from '@/server/services/auth'

export async function POST() {
  try {
    const store = await cookies()
    await signOut(store.get(SESSION_COOKIE)?.value)
    store.delete(SESSION_COOKIE)
    return ok({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
