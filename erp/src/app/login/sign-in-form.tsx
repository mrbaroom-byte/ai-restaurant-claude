'use client'

import { useActionState } from 'react'
import { signInAction, type SignInState } from '@/server/actions/auth'

interface Labels {
  email: string
  password: string
  totp: string
  totpHint: string
  submit: string
  invalidCredentials: string
  totpRequired: string
  invalidTotp: string
  accountSuspended: string
}

const ERROR_LABEL: Record<string, keyof Labels> = {
  'auth.invalidCredentials': 'invalidCredentials',
  'auth.totpRequired': 'totpRequired',
  'auth.invalidTotp': 'invalidTotp',
  'auth.accountSuspended': 'accountSuspended',
}

export function SignInForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {})

  // Specific and actionable: the message names what went wrong, never "something went wrong".
  const message = state.fieldError ?? (state.errorKey ? labels[ERROR_LABEL[state.errorKey]] : undefined)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-700">
          {labels.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          dir="ltr"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      {state.needsTotp && (
        <div>
          <label htmlFor="totpCode" className="mb-1.5 block text-sm font-medium text-ink-700">
            {labels.totp}
          </label>
          <input
            id="totpCode"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,9}"
            maxLength={9}
            autoFocus
            dir="ltr"
            className="field text-center tracking-[0.4em]"
          />
          <p className="mt-1.5 text-xs text-ink-500">{labels.totpHint}</p>
        </div>
      )}

      {message && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {labels.submit}
      </button>
    </form>
  )
}
