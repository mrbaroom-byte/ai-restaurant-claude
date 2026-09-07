'use server'

import { revalidatePath } from 'next/cache'
import { withTenant } from '../db'
import { requirePermission, currentLocale } from '../session'
import { PayrollError, createRun, postRun } from '../services/payroll'
import { PostingError } from '@/lib/accounting/posting'
import { recordAudit } from '../services/audit'

export interface PayrollState {
  error?: string
  message?: string
}

function monthBounds(value: string): { start: Date; end: Date } {
  const [year, month] = value.split('-').map(Number)
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the next month is the last day of this one.
    end: new Date(Date.UTC(year, month, 0)),
  }
}

export async function createPayrollRunAction(_previous: PayrollState, formData: FormData): Promise<PayrollState> {
  const principal = await requirePermission('payroll.run')
  const locale = await currentLocale()

  const branchId = String(formData.get('branchId'))
  const period = String(formData.get('period') ?? '')
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { error: locale === 'ar' ? 'اختر الشهر المراد احتساب رواتبه.' : 'Choose the month to pay.' }
  }

  const { start, end } = monthBounds(period)

  try {
    const result = await withTenant(principal.tenantId, (tx) =>
      createRun(tx, {
        tenantId: principal.tenantId,
        branchId,
        periodStart: start,
        periodEnd: end,
        userId: principal.userId,
      }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payroll_runs',
      entityId: result.payrollRunId,
      action: 'CREATE',
      after: { number: result.number, employees: result.employeeCount, totalNet: result.totalNet },
    })

    revalidatePath('/payroll')
    return {
      message:
        locale === 'ar'
          ? `تم احتساب المسير ${result.number} لعدد ${result.employeeCount} موظفين. راجعه ثم رحّله.`
          : `Payroll ${result.number} calculated for ${result.employeeCount} employees. Review it, then post it.`,
    }
  } catch (error) {
    if (error instanceof PayrollError) return { error: locale === 'ar' ? error.messageAr : error.message }
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function postPayrollRunAction(_previous: PayrollState, formData: FormData): Promise<PayrollState> {
  const principal = await requirePermission('payroll.post')
  const locale = await currentLocale()
  const payrollRunId = String(formData.get('payrollRunId'))

  try {
    const result = await withTenant(principal.tenantId, (tx) =>
      postRun(tx, { tenantId: principal.tenantId, payrollRunId, userId: principal.userId }),
    )

    await recordAudit({
      tenantId: principal.tenantId,
      userId: principal.userId,
      entity: 'payroll_runs',
      entityId: payrollRunId,
      action: 'POST',
      after: { entryId: result.entryId },
    })

    revalidatePath('/payroll')
    return { message: locale === 'ar' ? 'تم ترحيل المسير إلى دفتر الأستاذ.' : 'The run has been posted to the ledger.' }
  } catch (error) {
    if (error instanceof PayrollError) return { error: locale === 'ar' ? error.messageAr : error.message }
    if (error instanceof PostingError) return { error: locale === 'ar' ? error.messageAr : error.message }
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
