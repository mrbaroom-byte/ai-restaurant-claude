/**
 * ZATCA Fatoora API client.
 *
 * Four calls matter:
 *   POST /compliance                     → compliance CSID (needs the portal OTP)
 *   POST /compliance/invoices            → run the compliance checks with that CSID
 *   POST /production/csids               → production CSID
 *   POST /invoices/clearance/single      → clear a standard (B2B) invoice
 *   POST /invoices/reporting/single      → report a simplified (B2C) invoice
 *
 * Errors are never swallowed. Every response — including a rejection — is returned in full so
 * the submission row can store ZATCA's own warning and error arrays and show them to the user.
 */

export type ZatcaEnvironmentName = 'sandbox' | 'simulation' | 'production'

export const ZATCA_BASE_URL: Record<ZatcaEnvironmentName, string> = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
}

export interface ZatcaCredentials {
  /** Binary security token — the CSID, base64. */
  username: string
  /** Secret returned alongside the CSID. */
  password: string
}

export interface ZatcaMessage {
  type?: string
  code?: string
  category?: string
  message?: string
  status?: string
}

export interface ZatcaResponse<T = unknown> {
  httpStatus: number
  ok: boolean
  body: T
  /** ZATCA's own validation results, surfaced verbatim. */
  warnings: ZatcaMessage[]
  errors: ZatcaMessage[]
  /** Raw text, kept for support tickets when the body is not JSON. */
  raw: string
}

export interface ComplianceCsidResponse {
  requestID?: string | number
  dispositionMessage?: string
  binarySecurityToken?: string
  secret?: string
  errors?: ZatcaMessage[]
}

export interface ClearanceResponse {
  clearanceStatus?: string
  clearedInvoice?: string
  validationResults?: {
    infoMessages?: ZatcaMessage[]
    warningMessages?: ZatcaMessage[]
    errorMessages?: ZatcaMessage[]
    status?: string
  }
}

export interface ReportingResponse {
  reportingStatus?: string
  validationResults?: ClearanceResponse['validationResults']
}

export interface ZatcaClientOptions {
  environment: ZatcaEnvironmentName
  /** Overrides the published base URL; used by tests and by an on-premise gateway. */
  baseUrl?: string
  credentials?: ZatcaCredentials
  /** Injected so tests need no network and the worker can add tracing. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function collectMessages(body: unknown): { warnings: ZatcaMessage[]; errors: ZatcaMessage[] } {
  const warnings: ZatcaMessage[] = []
  const errors: ZatcaMessage[] = []
  if (!body || typeof body !== 'object') return { warnings, errors }

  const b = body as Record<string, unknown>
  const results = (b.validationResults ?? {}) as Record<string, unknown>

  const push = (target: ZatcaMessage[], value: unknown) => {
    if (Array.isArray(value)) target.push(...(value as ZatcaMessage[]))
  }
  push(warnings, results.warningMessages)
  push(errors, results.errorMessages)
  push(errors, b.errors)
  return { warnings, errors }
}

export class ZatcaClient {
  private readonly baseUrl: string
  private readonly credentials?: ZatcaCredentials
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ZatcaClientOptions) {
    this.baseUrl = (options.baseUrl ?? ZATCA_BASE_URL[options.environment]).replace(/\/+$/, '')
    this.credentials = options.credentials
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  private authHeader(): Record<string, string> {
    if (!this.credentials) return {}
    const token = Buffer.from(
      `${this.credentials.username}:${this.credentials.password}`,
      'utf8',
    ).toString('base64')
    return { Authorization: `Basic ${token}` }
  }

  private async request<T>(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<ZatcaResponse<T>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // ZATCA versions its API by header; a missing version is rejected as a bad request.
          'Accept-Version': 'V2',
          'Accept-Language': 'en',
          ...this.authHeader(),
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const raw = await response.text()
      let parsed: unknown = raw
      try {
        parsed = raw ? JSON.parse(raw) : {}
      } catch {
        // ZATCA occasionally returns HTML from its gateway; keep the text and report it.
      }
      const { warnings, errors } = collectMessages(parsed)

      return {
        httpStatus: response.status,
        ok: response.ok,
        body: parsed as T,
        warnings,
        errors,
        raw,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Step 1 of onboarding. `otp` comes from the taxpayer's Fatoora portal. */
  async requestComplianceCsid(csrBase64: string, otp: string): Promise<ZatcaResponse<ComplianceCsidResponse>> {
    return this.request<ComplianceCsidResponse>('/compliance', { csr: csrBase64 }, { OTP: otp })
  }

  /** Step 2. ZATCA requires a passing check for each invoice type the CSR enabled. */
  async checkCompliance(invoiceHash: string, uuid: string, invoiceBase64: string): Promise<ZatcaResponse<ClearanceResponse>> {
    return this.request<ClearanceResponse>('/compliance/invoices', {
      invoiceHash,
      uuid,
      invoice: invoiceBase64,
    })
  }

  /** Step 3. Exchanges the compliance CSID for the production one. */
  async requestProductionCsid(complianceRequestId: string): Promise<ZatcaResponse<ComplianceCsidResponse>> {
    return this.request<ComplianceCsidResponse>('/production/csids', {
      compliance_request_id: complianceRequestId,
    })
  }

  /** Renew a production CSID before it expires. */
  async renewProductionCsid(csrBase64: string, otp: string): Promise<ZatcaResponse<ComplianceCsidResponse>> {
    return this.request<ComplianceCsidResponse>('/production/csids', { csr: csrBase64 }, { OTP: otp })
  }

  /**
   * Standard (B2B) invoice: clearance. The invoice is not legally valid until ZATCA returns it
   * cleared, so the caller must store `clearedInvoice` and print from that.
   */
  async clearInvoice(invoiceHash: string, uuid: string, invoiceBase64: string): Promise<ZatcaResponse<ClearanceResponse>> {
    return this.request<ClearanceResponse>(
      '/invoices/clearance/single',
      { invoiceHash, uuid, invoice: invoiceBase64 },
      { 'Clearance-Status': '1' },
    )
  }

  /** Simplified (B2C) invoice: reporting, due within 24 hours of issue. */
  async reportInvoice(invoiceHash: string, uuid: string, invoiceBase64: string): Promise<ZatcaResponse<ReportingResponse>> {
    return this.request<ReportingResponse>(
      '/invoices/reporting/single',
      { invoiceHash, uuid, invoice: invoiceBase64 },
      { 'Clearance-Status': '0' },
    )
  }
}

/**
 * Retry policy for the submission queue.
 *
 * ZATCA rate-limits and occasionally 502s. A validation rejection, though, is permanent: retrying
 * it wastes the 24-hour reporting window and hides the problem from the user, so only transport
 * and server failures are retried.
 */
export function isRetryable(response: { httpStatus: number }): boolean {
  if (response.httpStatus === 429) return true
  if (response.httpStatus >= 500) return true
  // 0 is used by the worker for a transport-level failure (DNS, TLS, timeout).
  if (response.httpStatus === 0) return true
  return false
}

/** Exponential backoff with jitter, capped at an hour. */
export function retryDelayMs(attempt: number): number {
  const base = Math.min(2 ** attempt * 1000, 3_600_000)
  return Math.round(base * (0.75 + Math.random() * 0.5))
}
