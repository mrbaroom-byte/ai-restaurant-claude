import { z } from 'zod'
import { pagination, partyRequest } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody, parseQuery } from '@/lib/api/respond'
import { prisma } from '@/server/db'
import { toAmountString } from '@/lib/money'
import { recordAudit } from '@/server/services/audit'

const listQuery = pagination.extend({ role: z.enum(['customer', 'supplier']).optional(), q: z.string().optional() })

export async function GET(request: Request) {
  try {
    const principal = await authorize('contacts.view')
    const { page, pageSize, role, q } = parseQuery(request, listQuery)

    const where = {
      tenantId: principal.tenantId,
      deletedAt: null,
      ...(role === 'customer' ? { isCustomer: true } : role === 'supplier' ? { isSupplier: true } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' as const } },
              { nameEn: { contains: q, mode: 'insensitive' as const } },
              { nameAr: { contains: q } },
              { vatNumber: { contains: q } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.party.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.party.count({ where }),
    ])

    return ok({
      page,
      pageSize,
      total,
      data: rows.map((party) => ({
        id: party.id,
        code: party.code,
        nameEn: party.nameEn,
        nameAr: party.nameAr,
        isCustomer: party.isCustomer,
        isSupplier: party.isSupplier,
        vatNumber: party.vatNumber,
        paymentTermDays: party.paymentTermDays,
        creditLimit: toAmountString(party.creditLimit.toString()),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize('contacts.manage')
    const body = await parseBody(request, partyRequest)

    const address = body.address
      ? await prisma.address.create({ data: { tenantId: principal.tenantId, ...body.address } })
      : null

    const party = await prisma.party.create({
      data: {
        tenantId: principal.tenantId,
        code: body.code,
        nameEn: body.nameEn,
        nameAr: body.nameAr,
        isCustomer: body.isCustomer,
        isSupplier: body.isSupplier,
        vatNumber: body.vatNumber,
        crNumber: body.crNumber,
        email: body.email,
        phone: body.phone,
        whatsapp: body.whatsapp,
        paymentTermDays: body.paymentTermDays,
        creditLimit: body.creditLimit,
        addressId: address?.id,
        createdBy: principal.userId,
      },
    })

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'parties',
      entityId: party.id,
      action: 'CREATE',
      after: { code: party.code, nameAr: party.nameAr },
    })

    return ok({ id: party.id, code: party.code }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
