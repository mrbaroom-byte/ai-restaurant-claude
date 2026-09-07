import { authorize, errorResponse, ok } from '@/lib/api/respond'
import { withTenant, prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'
import { postInvoice } from '@/server/services/invoice'
import { recordAudit } from '@/server/services/audit'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('sales.post')
    const { id } = await context.params

    const result = await withTenant(principal.tenantId, (tx) =>
      postInvoice(tx, { tenantId: principal.tenantId, invoiceId: id, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'invoices',
      entityId: id,
      action: 'POST',
      after: { number: result.number, icv: result.icv, entryId: result.entryId },
    })

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } })
    return ok({
      id: invoice.id,
      number: invoice.number,
      uuid: invoice.uuid,
      status: invoice.status,
      kind: invoice.kind,
      documentType: invoice.documentType,
      date: invoice.date.toISOString().slice(0, 10),
      taxableTotal: toAmountString(invoice.taxableTotal.toString()),
      vatTotal: toAmountString(invoice.vatTotal.toString()),
      payableTotal: toAmountString(invoice.payableTotal.toString()),
      icv: invoice.icv,
      qrBase64: invoice.qrBase64,
      zatcaStatus: 'PENDING',
    })
  } catch (error) {
    return errorResponse(error)
  }
}
