'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { AuthError, SESSION_COOKIE, signIn, signOut } from '../services/auth'
import { LOCALE_COOKIE } from '../session'
import { isLocale } from '@/lib/i18n/config'

const credentials = z.object({
  email: z.string().email('Enter the email address you sign in with.'),
  password: z.string().min(1, 'Enter your password.'),
  totpCode: z.string().optional(),
})

export interface SignInState {
  /** Error key from the message catalogue, so the message is shown in the user's language. */
  errorKey?: string
  /** A field-level problem, already in the user's language. */
  fieldError?: string
  /** Set when the password was right but a second factor is still needed. */
  needsTotp?: boolean
}

export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    totpCode: (formData.get('totpCode') as string) || undefined,
  })
  if (!parsed.success) {
    return { fieldError: parsed.error.issues[0]?.message }
  }

  try {
    const result = await signIn(parsed.data)
    const store = await cookies()
    store.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    })
    if (isLocale(result.locale)) {
      store.set(LOCALE_COOKIE, result.locale, { sameSite: 'lax', path: '/', maxAge: 31_536_000 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === 'TOTP_REQUIRED') return { errorKey: 'auth.totpRequired', needsTotp: true }
      if (error.code === 'INVALID_TOTP') return { errorKey: 'auth.invalidTotp', needsTotp: true }
      if (error.code === 'SUSPENDED') return { errorKey: 'auth.accountSuspended' }
      return { errorKey: 'auth.invalidCredentials' }
    }
    throw error
  }

  redirect('/')
}

export async function signOutAction(): Promise<void> {
  const store = await cookies()
  await signOut(store.get(SESSION_COOKIE)?.value)
  store.delete(SESSION_COOKIE)
  redirect('/login')
}

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale')
  if (typeof locale === 'string' && isLocale(locale)) {
    ;(await cookies()).set(LOCALE_COOKIE, locale, { sameSite: 'lax', path: '/', maxAge: 31_536_000 })
  }
  redirect((formData.get('returnTo') as string) || '/')
}
