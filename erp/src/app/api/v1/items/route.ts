import { z } from 'zod'
import { itemRequest, pagination } from '@/lib/api/contract'
import { authorize, errorResponse, fail, ok, parseBody, parseQuery } from '@/lib/api/respond'
import { prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'
import { recordAudit } from '@/server/services/audit'

const listQuery = pagination.extend({ barcode: z.string().optional(), q: z.string().optional() })

export async function GET(request: Request) {
  try {
    const principal = await authorize('inventory.view')
    const { page, pageSize, barcode, q } = parseQuery(request, listQuery)

    const where = {
      tenantId: principal.tenantId,
      deletedAt: null,
      active: true,
      ...(barcode ? { barcode } : {}),
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: 'insensitive' as const } },
              { nameEn: { contains: q, mode: 'insensitive' as const } },
              { nameAr: { contains: q } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.item.findMany({
        where,
        include: { uom: { select: { code: true, uneceCode: true } } },
        orderBy: { sku: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.item.count({ where }),
    ])

    return ok({
      page,
      pageSize,
      total,
      data: rows.map((item) => ({
        id: item.id,
        sku: item.sku,
        barcode: item.barcode,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        kind: item.kind,
        uomCode: item.uom.code,
        uneceCode: item.uom.uneceCode,
        sellingPrice: toAmountString(item.sellingPrice.toString()),
        priceIncludesVat: item.priceIncludesVat,
        vatCategory: item.vatCategory,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize('inventory.manage')
    const body = await parseBody(request, itemRequest)

    const uom = await prisma.unitOfMeasure.findFirst({
      where: { tenantId: principal.tenantId, code: body.uomCode },
    })
    if (!uom) {
      return fail(
        'UNKNOWN_UOM',
        `There is no unit of measure with the code ${body.uomCode}. Add it in Settings → Units of measure.`,
        422,
      )
    }

    const item = await prisma.item.create({
      data: {
        tenantId: principal.tenantId,
        sku: body.sku,
        barcode: body.barcode,
        nameEn: body.nameEn,
        nameAr: body.nameAr,
        kind: body.kind,
        uomId: uom.id,
        sellingPrice: body.sellingPrice,
        priceIncludesVat: body.priceIncludesVat,
        vatCategory: body.vatCategory,
        reorderLevel: body.reorderLevel,
        createdBy: principal.userId,
      },
    })

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'items',
      entityId: item.id,
      action: 'CREATE',
      after: { sku: item.sku, nameEn: item.nameEn },
    })

    return ok({ id: item.id, sku: item.sku }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
