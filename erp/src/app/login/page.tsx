import { redirect } from 'next/navigation'
import { currentLocale, currentPrincipal } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { LOCALE_LABEL, LOCALES } from '@/lib/i18n/config'
import { setLocaleAction } from '@/server/actions/auth'
import { SignInForm } from './sign-in-form'

export default async function LoginPage() {
  if (await currentPrincipal()) redirect('/')

  const locale = await currentLocale()
  const t = translator(locale)

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl text-white">
            ن
          </div>
          <h1 className="text-xl font-semibold text-ink-900">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-ink-500">{t('app.tagline')}</p>
        </div>

        <div className="card p-6">
          <SignInForm
            labels={{
              email: t('auth.email'),
              password: t('auth.password'),
              totp: t('auth.totp'),
              totpHint: t('auth.totpHint'),
              submit: t('auth.signIn'),
              invalidCredentials: t('auth.invalidCredentials'),
              totpRequired: t('auth.totpRequired'),
              invalidTotp: t('auth.invalidTotp'),
              accountSuspended: t('auth.accountSuspended'),
            }}
          />
        </div>

        <form action={setLocaleAction} className="mt-6 flex justify-center gap-2">
          <input type="hidden" name="returnTo" value="/login" />
          {LOCALES.map((option) => (
            <button
              key={option}
              type="submit"
              name="locale"
              value={option}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                option === locale ? 'bg-white font-medium text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {LOCALE_LABEL[option]}
            </button>
          ))}
        </form>
      </div>
    </main>
  )
}
