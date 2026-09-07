'use client'

import { useActionState } from 'react'
import { createPayrollRunAction, postPayrollRunAction, type PayrollState } from '@/server/actions/payroll'

function Notice({ state }: { state: PayrollState }) {
  if (!state.error && !state.message) return null
  return (
    <p
      role="status"
      className={`mt-3 rounded-md px-3 py-2 text-sm ${
        state.error ? 'bg-red-50 text-red-800' : 'bg-brand-50 text-brand-800'
      }`}
    >
      {state.error ?? state.message}
    </p>
  )
}

export function RunPayroll({
  branches,
  defaultPeriod,
  labels,
}: {
  branches: Array<{ id: string; code: string; name: string }>
  defaultPeriod: string
  labels: { title: string; period: string; branch: string; submit: string; hint: string }
}) {
  const [state, action, pending] = useActionState<PayrollState, FormData>(createPayrollRunAction, {})

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-800">{labels.title}</h2>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="period" className="mb-1 block text-xs font-medium text-ink-600">
            {labels.period}
          </label>
          <input id="period" name="period" type="month" defaultValue={defaultPeriod} className="field" dir="ltr" required />
        </div>
        <div>
          <label htmlFor="branchId" className="mb-1 block text-xs font-medium text-ink-600">
            {labels.branch}
          </label>
          <select id="branchId" name="branchId" className="field" defaultValue={branches[0]?.id}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} — {branch.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {labels.submit}
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-500">{labels.hint}</p>
      <Notice state={state} />
    </section>
  )
}

export function PostRun({ payrollRunId, label }: { payrollRunId: string; label: string }) {
  const [state, action, pending] = useActionState<PayrollState, FormData>(postPayrollRunAction, {})

  return (
    <>
      <form action={action}>
        <input type="hidden" name="payrollRunId" value={payrollRunId} />
        <button type="submit" className="btn-secondary px-3 py-1 text-xs" disabled={pending}>
          {label}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </>
  )
}
