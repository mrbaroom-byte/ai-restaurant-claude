import { invoiceRequest, pagination } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody, parseQuery } from '@/lib/api/respond'
import { withTenant, prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'
import { createDraft } from '@/server/services/invoice'
import { assertBranch } from '@/lib/rbac'
import { recordAudit } from '@/server/services/audit'

export async function GET(request: Request) {
  try {
    const principal = await authorize('sales.view')
    const { page, pageSize } = parseQuery(request, pagination)

    const where = {
      tenantId: principal.tenantId,
      deletedAt: null,
      ...(principal.branchIds.length ? { branchId: { in: principal.branchIds } } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { submissions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
      }),
      prisma.invoice.count({ where }),
    ])

    return ok({
      page,
      pageSize,
      total,
      data: rows.map((invoice) => ({
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
        zatcaStatus: invoice.submissions[0]?.status ?? null,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize('sales.create')
    const body = await parseBody(request, invoiceRequest)
    assertBranch(principal, body.branchId)

    const invoice = await withTenant(principal.tenantId, (tx) =>
      createDraft(tx, { ...body, tenantId: principal.tenantId, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'invoices',
      entityId: invoice.id,
      action: 'CREATE',
      after: { payableTotal: toAmountString(invoice.payableTotal.toString()), lines: invoice.lines.length },
    })

    return ok(
      {
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
        zatcaStatus: null,
      },
      201,
    )
  } catch (error) {
    return errorResponse(error)
  }
}
