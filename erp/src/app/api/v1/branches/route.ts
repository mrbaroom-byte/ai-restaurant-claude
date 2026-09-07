import { authorize, errorResponse, ok } from '@/lib/api/respond'
import { prisma } from '@/server/db'

/**
 * Branches and their warehouses.
 *
 * An integration creating an invoice needs both — the branch decides the number series and the
 * cost centre, the warehouse decides where stock comes from — so they are returned together.
 */
export async function GET() {
  try {
    const principal = await authorize('settings.view')

    const branches = await prisma.branch.findMany({
      where: {
        tenantId: principal.tenantId,
        active: true,
        ...(principal.branchIds.length ? { id: { in: principal.branchIds } } : {}),
      },
      include: {
        warehouses: { where: { active: true }, select: { id: true, code: true, nameEn: true, nameAr: true } },
        address: true,
      },
      orderBy: { code: 'asc' },
    })

    return ok({
      data: branches.map((branch) => ({
        id: branch.id,
        code: branch.code,
        nameEn: branch.nameEn,
        nameAr: branch.nameAr,
        address: branch.address
          ? {
              buildingNumber: branch.address.buildingNumber,
              street: branch.address.street,
              district: branch.address.district,
              city: branch.address.city,
              postalCode: branch.address.postalCode,
              additionalNumber: branch.address.additionalNumber,
            }
          : null,
        warehouses: branch.warehouses,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
