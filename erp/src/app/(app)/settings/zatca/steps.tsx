'use client'

import { useActionState } from 'react'
import {
  generateDeviceAction,
  requestComplianceCsidAction,
  requestProductionCsidAction,
  runComplianceChecksAction,
  type OnboardingState,
} from '@/server/actions/zatca'

interface Labels {
  generateCsr: string; otp: string; otpHint: string; requestComplianceCsid: string
  runComplianceChecks: string; requestProductionCsid: string; deviceSerial: string
  invoiceTypes: string; environment: string; forbidden: string
}

function Outcome({ state }: { state: OnboardingState }) {
  if (!state.message) return null
  return (
    <div
      role="status"
      className={`mt-3 rounded-md px-3 py-2 text-sm ${
        state.ok ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-800'
      }`}
    >
      <p>{state.message}</p>
      {state.detail && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs opacity-80">ZATCA</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-white/60 p-2 text-[11px]" dir="ltr">
            {state.detail}
          </pre>
        </details>
      )}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-xs">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function OnboardingSteps({
  canManage,
  environment,
  vatNumber,
  organizationName,
  branches,
  certificates,
  labels,
}: {
  canManage: boolean
  environment: string
  vatNumber: string
  organizationName: string
  branches: Array<{ id: string; code: string; name: string; address: string }>
  certificates: Array<{ id: string; egsSerial: string; status: string }>
  labels: Labels
}) {
  const [generateState, generate, generating] = useActionState<OnboardingState, FormData>(generateDeviceAction, {})
  const [complianceState, compliance, requestingCompliance] = useActionState<OnboardingState, FormData>(requestComplianceCsidAction, {})
  const [checksState, checks, running] = useActionState<OnboardingState, FormData>(runComplianceChecksAction, {})
  const [productionState, production, requestingProduction] = useActionState<OnboardingState, FormData>(requestProductionCsidAction, {})

  if (!canManage) {
    return <p className="rounded-md bg-ink-50 px-4 py-3 text-sm text-ink-600">{labels.forbidden}</p>
  }

  const branch = branches[0]
  const latest = certificates[0]

  return (
    <div className="space-y-4">
      <Step number={1} title={labels.generateCsr}>
        <form action={generate} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="environment" value={environment} />
          <input type="hidden" name="vatNumber" value={vatNumber} />
          <input type="hidden" name="organizationName" value={organizationName} />

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">{labels.environment}</span>
            <input className="field bg-ink-50" value={environment} readOnly dir="ltr" />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">Branch</span>
            <select name="branchId" className="field" defaultValue={branch?.id}>
              {branches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.code} — {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">Common name</span>
            <input name="commonName" className="field" defaultValue={`EGS-${branch?.code ?? 'MAIN'}-01`} dir="ltr" required />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">Organisational unit</span>
            <input name="organizationalUnitName" className="field" defaultValue={branch?.name ?? 'Main'} required />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">{labels.deviceSerial}</span>
            <input
              name="serialNumber"
              className="field"
              defaultValue={`1-NakhlaERP|2-1.0.0|3-${branch?.code ?? 'MAIN'}-01`}
              dir="ltr"
              required
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">{labels.invoiceTypes}</span>
            <select name="invoiceType" className="field" defaultValue="1100" dir="ltr">
              <option value="1100">1100 — standard and simplified</option>
              <option value="1000">1000 — standard only</option>
              <option value="0100">0100 — simplified only</option>
            </select>
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-600">Registered address</span>
            <input name="registeredAddress" className="field" defaultValue={branch?.address ?? ''} required />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">Business category</span>
            <input name="businessCategory" className="field" defaultValue="Restaurants" required />
          </label>

          <div className="flex items-end">
            <button type="submit" disabled={generating} className="btn-primary">
              {labels.generateCsr}
            </button>
          </div>
        </form>
        <Outcome state={generateState} />
      </Step>

      <Step number={2} title={labels.requestComplianceCsid}>
        <form action={compliance} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="certificateId" value={latest?.id ?? ''} />
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-600">{labels.otp}</span>
            <input name="otp" className="field w-40 text-center tracking-widest" inputMode="numeric" dir="ltr" required />
          </label>
          <button type="submit" disabled={requestingCompliance || !latest} className="btn-primary">
            {labels.requestComplianceCsid}
          </button>
          <p className="w-full text-xs text-ink-500">{labels.otpHint}</p>
        </form>
        <Outcome state={complianceState} />
      </Step>

      <Step number={3} title={labels.runComplianceChecks}>
        <form action={checks}>
          <input type="hidden" name="certificateId" value={latest?.id ?? ''} />
          <button type="submit" disabled={running || !latest} className="btn-primary">
            {labels.runComplianceChecks}
          </button>
        </form>
        <Outcome state={checksState} />
      </Step>

      <Step number={4} title={labels.requestProductionCsid}>
        <form action={production}>
          <input type="hidden" name="certificateId" value={latest?.id ?? ''} />
          <button type="submit" disabled={requestingProduction || !latest} className="btn-primary">
            {labels.requestProductionCsid}
          </button>
        </form>
        <Outcome state={productionState} />
      </Step>
    </div>
  )
}
