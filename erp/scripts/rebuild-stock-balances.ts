/**
 * Rebuild every stock balance from its movement history.
 *
 * `stock_balances` is a materialised running total; `stock_movements` is the truth. This script
 * recomputes one from the other and reports any disagreement, which is how a drift caused by a
 * crash mid-transaction would be found.
 *
 * Run with: pnpm stock:rebuild [--apply]
 */
import { PrismaClient } from '@prisma/client'
import { replayMovements, type MovementKind, type ValuationMethod } from '../src/lib/inventory/valuation'
import { qtyToDb, toDb } from '../src/lib/money'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, legalNameEn: true, valuationMethod: true } })
  let drifted = 0

  for (const tenant of tenants) {
    const pairs = await prisma.stockMovement.groupBy({
      by: ['itemId', 'warehouseId'],
      where: { tenantId: tenant.id },
    })

    for (const pair of pairs) {
      const movements = await prisma.stockMovement.findMany({
        where: { tenantId: tenant.id, itemId: pair.itemId, warehouseId: pair.warehouseId },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      })

      const rebuilt = replayMovements(
        movements.map((movement) => ({
          kind: movement.kind as MovementKind,
          quantity: movement.quantity.toString(),
          unitCost: movement.unitCost.toString(),
          id: movement.id,
          receivedAt: movement.date,
        })),
        tenant.valuationMethod as ValuationMethod,
        true,
      )

      const stored = await prisma.stockBalance.findUnique({
        where: { itemId_warehouseId: { itemId: pair.itemId, warehouseId: pair.warehouseId } },
      })

      const quantityMatches = stored && rebuilt.quantity.toFixed(6) === Number(stored.quantity).toFixed(6)
      const valueMatches = stored && rebuilt.value.toFixed(4) === Number(stored.value).toFixed(4)

      if (!quantityMatches || !valueMatches) {
        drifted += 1
        const item = await prisma.item.findUnique({ where: { id: pair.itemId }, select: { sku: true } })
        process.stdout.write(
          `  drift  ${item?.sku ?? pair.itemId}: stored ${stored?.quantity ?? '—'} / ${stored?.value ?? '—'}` +
            `  rebuilt ${rebuilt.quantity.toFixed(6)} / ${rebuilt.value.toFixed(4)}\n`,
        )

        if (apply) {
          await prisma.stockBalance.upsert({
            where: { itemId_warehouseId: { itemId: pair.itemId, warehouseId: pair.warehouseId } },
            create: {
              tenantId: tenant.id,
              itemId: pair.itemId,
              warehouseId: pair.warehouseId,
              quantity: qtyToDb(rebuilt.quantity),
              value: toDb(rebuilt.value),
            },
            update: { quantity: qtyToDb(rebuilt.quantity), value: toDb(rebuilt.value) },
          })
        }
      }
    }

    process.stdout.write(`${tenant.legalNameEn}: checked ${pairs.length} item/warehouse pairs\n`)
  }

  if (drifted === 0) {
    process.stdout.write('\nEvery stock balance agrees with its movement history.\n')
  } else if (apply) {
    process.stdout.write(`\nCorrected ${drifted} balances.\n`)
  } else {
    process.stdout.write(`\n${drifted} balances disagree. Re-run with --apply to correct them.\n`)
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
