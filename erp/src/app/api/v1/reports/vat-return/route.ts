import { z } from 'zod'
import { authorize, errorResponse, ok, parseQuery } from '@/lib/api/respond'
import { withTenant } from '@/server/db'
import { vatReturn } from '@/server/services/reports'
import { VAT_RETURN_LABELS } from '@/lib/tax/vat'

const query = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  branchId: z.string().uuid().optional(),
})

export async function GET(request: Request) {
  try {
    const principal = await authorize('accounting.view')
    const { from, to, branchId } = parseQuery(request, query)

    const result = await withTenant(principal.tenantId, (tx) =>
      vatReturn(tx, { tenantId: principal.tenantId, from, to, branchId }),
    )

    // Serialise the boxes with their labels, so a caller can render the return without also
    // shipping a copy of the label table.
    const boxes = Object.fromEntries(
      Object.entries(result.return).map(([key, value]) => [
        key,
        typeof value === 'object' && 'taxable' in value
          ? {
              label: VAT_RETURN_LABELS[key],
              taxable: value.taxable.toFixed(2),
              vat: value.vat.toFixed(2),
            }
          : { label: VAT_RETURN_LABELS[key], amount: value.toFixed(2) },
      ]),
    )

    return ok({
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      boxes,
      sources: result.sources.map((source) => ({
        ...source,
        date: source.date.toISOString().slice(0, 10),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
