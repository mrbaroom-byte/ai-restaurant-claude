import { creditNoteRequest } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody } from '@/lib/api/respond'
import { withTenant, prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'
import { createCreditNote } from '@/server/services/invoice'
import { recordAudit } from '@/server/services/audit'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('sales.credit')
    const { id } = await context.params
    const body = await parseBody(request, creditNoteRequest)

    const result = await withTenant(principal.tenantId, (tx) =>
      createCreditNote(tx, {
        tenantId: principal.tenantId,
        invoiceId: id,
        date: body.date,
        reason: body.reason,
        lines: body.lines,
        restock: body.restock,
        userId: principal.userId,
      }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'invoices',
      entityId: result.creditNoteId,
      action: 'CREDIT_NOTE',
      after: { number: result.number, against: id, reason: body.reason },
    })

    const note = await prisma.invoice.findUniqueOrThrow({ where: { id: result.creditNoteId } })
    return ok(
      {
        id: note.id,
        number: note.number,
        uuid: note.uuid,
        status: note.status,
        kind: note.kind,
        documentType: note.documentType,
        date: note.date.toISOString().slice(0, 10),
        taxableTotal: toAmountString(note.taxableTotal.toString()),
        vatTotal: toAmountString(note.vatTotal.toString()),
        payableTotal: toAmountString(note.payableTotal.toString()),
        icv: note.icv,
        qrBase64: note.qrBase64,
        zatcaStatus: 'PENDING',
      },
      201,
    )
  } catch (error) {
    return errorResponse(error)
  }
}
