'use client'

import { useActionState } from 'react'
import { completeTotpAction, type TotpState } from '@/server/actions/security'

export function EnrolTotp({
  secret,
  labels,
}: {
  secret: string
  labels: { code: string; submit: string; hint: string; invalid: string }
}) {
  const [state, action, pending] = useActionState<TotpState, FormData>(completeTotpAction, {})

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="secret" value={secret} />
      <label htmlFor="code" className="block text-sm font-medium text-ink-700">
        {labels.code}
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={9}
        required
        dir="ltr"
        className="field text-center tracking-[0.4em]"
      />
      <p className="text-xs text-ink-500">{labels.hint}</p>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {labels.submit}
      </button>
    </form>
  )
}
