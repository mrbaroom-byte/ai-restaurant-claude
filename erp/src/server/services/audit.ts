/**
 * Audit log.
 *
 * Every write that changes money, stock or access is recorded with who did it, when, and the
 * before and after values. Sensitive fields are redacted on the way in, so the log can be given
 * to an auditor without also handing over IBANs and national IDs.
 */
import { prisma } from '../db'

const REDACTED_FIELDS = new Set([
  'passwordHash', 'totpSecret', 'privateKeyEnc', 'complianceCertEnc', 'complianceSecretEnc',
  'productionCertEnc', 'productionSecretEnc', 'secretEnc', 'keyHash', 'iban', 'identityNumber',
  'tokenHash', 'refreshHash',
])

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) =>
        REDACTED_FIELDS.has(key) ? [key, '[redacted]'] : [key, redact(child)],
      ),
    )
  }
  return value
}

export interface AuditEntry {
  tenantId: string
  userId?: string
  entity: string
  entityId?: string
  action: string
  before?: unknown
  after?: unknown
  ipAddress?: string
  userAgent?: string
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      // An API key acts on nobody's behalf, so the user column stays null rather than lying.
      userId: entry.userId?.startsWith('apikey:') ? null : entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before === undefined ? undefined : (redact(entry.before) as never),
      after: entry.after === undefined ? undefined : (redact(entry.after) as never),
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    },
  })
}
