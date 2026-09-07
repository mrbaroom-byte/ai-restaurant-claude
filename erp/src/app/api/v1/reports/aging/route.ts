import { z } from 'zod'
import { authorize, errorResponse, ok, parseQuery } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { payablesAging, receivablesAging } from '@/server/services/reports'

const query = z.object({ kind: z.enum(['receivable', 'payable']).default('receivable') })

export async function GET(request: Request) {
  try {
    const principal = await authorize('contacts.view')
    const { kind } = parseQuery(request, query)

    const rows = await withTenant(principal.tenantId, (tx) =>
      kind === 'payable' ? payablesAging(tx, principal.tenantId) : receivablesAging(tx, principal.tenantId),
    )

    return ok({
      kind,
      rows: rows.map((row) => ({
        partyId: row.partyId,
        partyName: row.partyName,
        current: row.current.toFixed(2),
        days1to30: row.days1to30.toFixed(2),
        days31to60: row.days31to60.toFixed(2),
        days61to90: row.days61to90.toFixed(2),
        over90: row.over90.toFixed(2),
        total: row.total.toFixed(2),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
