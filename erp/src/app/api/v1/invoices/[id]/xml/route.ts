import { authorize, errorResponse, fail } from '@/lib/api/respond'
import { prisma } from '@/server/db'

/** The signed UBL document. Once ZATCA has cleared an invoice, its copy is the legal one. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorize('sales.view')
    const { id } = await context.params

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: principal.tenantId },
      select: { number: true, signedXml: true, clearedXml: true, status: true },
    })
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.', 404)
    if (!invoice.signedXml) {
      return fail(
        'NOT_SIGNED',
        'This invoice has not been posted yet, so there is no signed document to download.',
        409,
      )
    }

    const xml = invoice.clearedXml ?? invoice.signedXml
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${invoice.number ?? id}.xml"`,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
