import { payrollRunRequest } from '@/lib/api/contract'
import { authorize, errorResponse, ok, parseBody } from '@/lib/api/respond'
import { withTenant, prisma } from '@/server/db'
import { createRun } from '@/server/services/payroll'
import { recordAudit } from '@/server/services/audit'
import { assertBranch } from '@/lib/rbac'
import { toAmountString } from '@/lib/money'

export async function GET() {
  try {
    const principal = await authorize('payroll.view')
    const runs = await prisma.payrollRun.findMany({
      where: { tenantId: principal.tenantId, deletedAt: null },
      include: { _count: { select: { payslips: true } } },
      orderBy: { periodStart: 'desc' },
    })

    return ok({
      data: runs.map((run) => ({
        id: run.id,
        number: run.number,
        periodStart: run.periodStart.toISOString().slice(0, 10),
        periodEnd: run.periodEnd.toISOString().slice(0, 10),
        status: run.status,
        employees: run._count.payslips,
        totalGross: toAmountString(run.totalGross.toString()),
        totalNet: toAmountString(run.totalNet.toString()),
        gosi: toAmountString(run.totalGosiEmployee.plus(run.totalGosiEmployer).toString()),
        eosbAccrual: toAmountString(run.totalEosbAccrual.toString()),
        ratesUsed: run.ratesUsed,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize('payroll.run')
    const body = await parseBody(request, payrollRunRequest)
    assertBranch(principal, body.branchId)

    const result = await withTenant(principal.tenantId, (tx) =>
      createRun(tx, { ...body, tenantId: principal.tenantId, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payroll_runs',
      entityId: result.payrollRunId,
      action: 'CREATE',
      after: { number: result.number, employees: result.employeeCount, totalNet: result.totalNet },
    })

    return ok(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
