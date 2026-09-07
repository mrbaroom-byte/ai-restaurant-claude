import { authorize, errorResponse, fail, ok } from '@/lib/api/respond'
import { prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('sales.view')
    const { id } = await context.params

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        submissions: { orderBy: { createdAt: 'desc' }, take: 1 },
        party: { select: { id: true, nameEn: true, nameAr: true, vatNumber: true } },
      },
    })
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.', 404)

    return ok({
      id: invoice.id,
      number: invoice.number,
      uuid: invoice.uuid,
      status: invoice.status,
      kind: invoice.kind,
      documentType: invoice.documentType,
      date: invoice.date.toISOString().slice(0, 10),
      party: invoice.party,
      taxableTotal: toAmountString(invoice.taxableTotal.toString()),
      vatTotal: toAmountString(invoice.vatTotal.toString()),
      payableTotal: toAmountString(invoice.payableTotal.toString()),
      icv: invoice.icv,
      pih: invoice.pih,
      invoiceHash: invoice.invoiceHash,
      qrBase64: invoice.qrBase64,
      zatcaStatus: invoice.submissions[0]?.status ?? null,
      // ZATCA's own warnings and errors travel with the invoice, never summarised away.
      zatcaWarnings: invoice.submissions[0]?.warnings ?? null,
      zatcaErrors: invoice.submissions[0]?.errors ?? null,
      lines: invoice.lines.map((line) => ({
        lineNo: line.lineNo,
        itemId: line.itemId,
        descriptionEn: line.descriptionEn,
        descriptionAr: line.descriptionAr,
        unitCode: line.unitCode,
        quantity: line.quantity.toString(),
        unitPrice: toAmountString(line.unitPrice.toString()),
        discount: toAmountString(line.discount.toString()),
        vatCategory: line.vatCategory,
        vatRate: line.vatRate.toString(),
        taxableAmount: toAmountString(line.taxableAmount.toString()),
        vatAmount: toAmountString(line.vatAmount.toString()),
        lineTotal: toAmountString(line.lineTotal.toString()),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
