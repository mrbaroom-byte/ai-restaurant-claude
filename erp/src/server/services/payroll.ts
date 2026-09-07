/**
 * Payroll runs.
 *
 * A run is calculated, stored with the rates it used, and only then posted. The three steps are
 * deliberately separate: HR prepares it, the Accountant posts it, and the bank file is produced
 * from the stored payslips rather than recalculated — so the file, the payslip and the ledger
 * can never disagree about what somebody was paid.
 */
import {
  type PayrollEmployeeInput,
  type Payslip,
  buildPayrollPosting,
  runPayroll,
} from '@/lib/payroll/payroll'
import { DEFAULT_GOSI_RATES, type GosiRates } from '@/lib/payroll/gosi'
import { type WpsEmployer, generateWpsFile, validateWps } from '@/lib/payroll/wps'
import { decrypt, isEncrypted } from '@/lib/crypto/vault'
import { money, toDb } from '@/lib/money'
import { allocateNumber } from './sequence'
import { post } from './posting'
import type { Tx } from '../db'

export class PayrollError extends Error {
  readonly code: string
  readonly messageAr: string
  constructor(code: string, en: string, ar: string) {
    super(en)
    this.name = 'PayrollError'
    this.code = code
    this.messageAr = ar
  }
}

/** Rates for a tenant, falling back to the defaults when none are configured. */
export async function ratesFor(tx: Tx, tenantId: string): Promise<GosiRates> {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { payrollSettings: true },
  })
  const stored = tenant.payrollSettings as Record<string, string> | null
  if (!stored) return DEFAULT_GOSI_RATES

  return {
    saudiEmployee: money(stored.saudiEmployee ?? DEFAULT_GOSI_RATES.saudiEmployee.toString()),
    saudiEmployer: money(stored.saudiEmployer ?? DEFAULT_GOSI_RATES.saudiEmployer.toString()),
    nonSaudiEmployee: money(stored.nonSaudiEmployee ?? DEFAULT_GOSI_RATES.nonSaudiEmployee.toString()),
    nonSaudiEmployer: money(stored.nonSaudiEmployer ?? DEFAULT_GOSI_RATES.nonSaudiEmployer.toString()),
    wageCeiling: money(stored.wageCeiling ?? DEFAULT_GOSI_RATES.wageCeiling.toString()),
    wageFloor: money(stored.wageFloor ?? DEFAULT_GOSI_RATES.wageFloor.toString()),
  }
}

export interface CreateRunParams {
  tenantId: string
  branchId: string
  periodStart: Date
  periodEnd: Date
  /** Per-employee variables for the month: overtime, unpaid days, one-off additions. */
  adjustments?: Record<
    string,
    { overtimeHours?: string | number; unpaidLeaveDays?: number; otherDeduction?: string | number; additions?: PayrollEmployeeInput['additions'] }
  >
  userId?: string
}

export interface CreateRunResult {
  payrollRunId: string
  number: string
  employeeCount: number
  totalGross: string
  totalNet: string
}

export async function createRun(tx: Tx, params: CreateRunParams): Promise<CreateRunResult> {
  const existing = await tx.payrollRun.findFirst({
    where: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      periodStart: params.periodStart,
      deletedAt: null,
    },
    select: { number: true },
  })
  if (existing) {
    throw new PayrollError(
      'ALREADY_RUN',
      `Payroll ${existing.number} already covers this period for this branch.`,
      `مسير الرواتب ${existing.number} يغطي هذه الفترة لهذا الفرع بالفعل.`,
    )
  }

  const employees = await tx.employee.findMany({
    where: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
      deletedAt: null,
      hireDate: { lte: params.periodEnd },
    },
    orderBy: { employeeNumber: 'asc' },
  })

  if (employees.length === 0) {
    throw new PayrollError(
      'NO_EMPLOYEES',
      'There are no active employees in this branch to pay.',
      'لا يوجد موظفون على رأس العمل في هذا الفرع.',
    )
  }

  // Loans falling due this month reduce net pay and the loan balance together.
  const loans = await tx.loan.findMany({
    where: { tenantId: params.tenantId, status: 'ACTIVE', outstanding: { gt: 0 } },
    select: { employeeId: true, instalment: true, outstanding: true },
  })
  const instalmentFor = new Map(
    loans.map((loan) => [
      loan.employeeId,
      // Never deduct more than is still owed.
      money(loan.instalment.toString()).greaterThan(money(loan.outstanding.toString()))
        ? loan.outstanding.toString()
        : loan.instalment.toString(),
    ]),
  )

  const rates = await ratesFor(tx, params.tenantId)

  const inputs: PayrollEmployeeInput[] = employees.map((employee) => {
    const adjustment = params.adjustments?.[employee.id] ?? {}
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      nameEn: employee.nameEn,
      nameAr: employee.nameAr,
      nationality: employee.isSaudi ? 'SAUDI' : 'NON_SAUDI',
      identityNumber: readSensitive(employee.identityNumber),
      iban: readSensitive(employee.iban ?? ''),
      hireDate: employee.hireDate,
      basicSalary: employee.basicSalary.toString(),
      housingAllowance: employee.housingAllowance.toString(),
      transportAllowance: employee.transportAllowance.toString(),
      otherAllowance: employee.otherAllowance.toString(),
      overtimeHours: adjustment.overtimeHours,
      unpaidLeaveDays: adjustment.unpaidLeaveDays,
      loanDeduction: instalmentFor.get(employee.id),
      otherDeduction: adjustment.otherDeduction,
      additions: adjustment.additions,
      gosiExempt: employee.gosiExempt,
      eosbAccruedToDate: employee.eosbAccrued.toString(),
      branchId: employee.branchId,
    }
  })

  const result = runPayroll({
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    employees: inputs,
    gosiRates: rates,
  })

  const number = await allocateNumber(tx, {
    tenantId: params.tenantId,
    branchId: params.branchId,
    kind: 'PAYROLL_RUN',
    date: params.periodEnd,
  })

  const run = await tx.payrollRun.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      number,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      status: 'DRAFT',
      // Stamped, so a payslip reprinted next year recomputes with the rates that applied.
      ratesUsed: Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, value.toString()])),
      totalGross: toDb(result.totalGross),
      totalNet: toDb(result.totalNet),
      totalGosiEmployee: toDb(result.totalGosiEmployee),
      totalGosiEmployer: toDb(result.totalGosiEmployer),
      totalEosbAccrual: toDb(result.totalEosbAccrual),
      createdBy: params.userId,
      payslips: {
        create: result.payslips.map((payslip) => ({
          tenantId: params.tenantId,
          employeeId: payslip.employeeId,
          earnings: payslip.earnings.map(serialiseLine) as never,
          deductions: payslip.deductions.map(serialiseLine) as never,
          grossPay: toDb(payslip.grossPay),
          totalDeductions: toDb(payslip.totalDeductions),
          netPay: toDb(payslip.netPay),
          gosiEmployee: toDb(payslip.gosiEmployee),
          gosiEmployer: toDb(payslip.gosiEmployer),
          eosbAccrual: toDb(payslip.eosbAccrual),
        })),
      },
    },
    select: { id: true },
  })

  // Carry the end-of-service accrual onto each employee, so next month accrues the movement.
  for (const payslip of result.payslips) {
    await tx.employee.update({
      where: { id: payslip.employeeId },
      data: { eosbAccrued: { increment: toDb(payslip.eosbAccrual) as never } },
    })
  }

  return {
    payrollRunId: run.id,
    number,
    employeeCount: result.payslips.length,
    totalGross: toDb(result.totalGross),
    totalNet: toDb(result.totalNet),
  }
}

function serialiseLine(line: { code: string; nameEn: string; nameAr: string; amount: { toString(): string } }) {
  return { code: line.code, nameEn: line.nameEn, nameAr: line.nameAr, amount: line.amount.toString() }
}

/** Identity numbers and IBANs are encrypted at rest; payroll needs the real values. */
function readSensitive(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value
}

/** Post a calculated run to the ledger. Separate from creating it: a different role does this. */
export async function postRun(
  tx: Tx,
  params: { tenantId: string; payrollRunId: string; userId?: string },
): Promise<{ entryId: string }> {
  const run = await tx.payrollRun.findFirstOrThrow({
    where: { id: params.payrollRunId, tenantId: params.tenantId },
    include: { payslips: true },
  })
  if (run.status !== 'DRAFT') {
    throw new PayrollError(
      'ALREADY_POSTED',
      `Payroll ${run.number} is already ${run.status.toLowerCase()}.`,
      `مسير الرواتب ${run.number} مرحّل بالفعل.`,
    )
  }

  const payslips = run.payslips.map(rehydrate)
  const posted = await post(
    tx,
    buildPayrollPosting({
      tenantId: params.tenantId,
      branchId: run.branchId,
      date: run.periodEnd,
      reference: run.number,
      result: {
        payslips,
        totalGross: money(run.totalGross.toString()),
        totalNet: money(run.totalNet.toString()),
        totalGosiEmployee: money(run.totalGosiEmployee.toString()),
        totalGosiEmployer: money(run.totalGosiEmployer.toString()),
        totalEosbAccrual: money(run.totalEosbAccrual.toString()),
        totalDeductions: payslips.reduce((total, p) => total.plus(p.totalDeductions), money(0)),
        totalEmployerCost: payslips.reduce((total, p) => total.plus(p.employerCost), money(0)),
      },
    }),
    params.userId,
  )

  await tx.payrollRun.update({
    where: { id: run.id },
    data: { status: 'POSTED', entryId: posted.entryId },
  })

  // Reduce the loans the run recovered.
  for (const payslip of payslips) {
    const instalment = payslip.deductions.find((line) => line.code === 'LOAN')
    if (!instalment) continue
    const loan = await tx.loan.findFirst({
      where: { tenantId: params.tenantId, employeeId: payslip.employeeId, status: 'ACTIVE' },
    })
    if (!loan) continue

    const outstanding = money(loan.outstanding.toString()).minus(instalment.amount)
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        outstanding: toDb(outstanding),
        status: outstanding.lessThanOrEqualTo(0) ? 'SETTLED' : 'ACTIVE',
      },
    })
  }

  return { entryId: posted.entryId }
}

/** Rebuild a payslip from its stored JSON, so the file and the payslip agree exactly. */
function rehydrate(stored: {
  employeeId: string
  earnings: unknown
  deductions: unknown
  grossPay: { toString(): string }
  totalDeductions: { toString(): string }
  netPay: { toString(): string }
  gosiEmployee: { toString(): string }
  gosiEmployer: { toString(): string }
  eosbAccrual: { toString(): string }
}): Payslip & { employeeNumber: string } {
  const lines = (value: unknown) =>
    (value as Array<{ code: string; nameEn: string; nameAr: string; amount: string }>).map((line) => ({
      ...line,
      amount: money(line.amount),
    }))

  return {
    employeeId: stored.employeeId,
    employeeNumber: '',
    nameEn: '',
    nameAr: '',
    iban: '',
    identityNumber: '',
    branchId: '',
    earnings: lines(stored.earnings),
    deductions: lines(stored.deductions),
    grossPay: money(stored.grossPay.toString()),
    totalDeductions: money(stored.totalDeductions.toString()),
    netPay: money(stored.netPay.toString()),
    gosiEmployee: money(stored.gosiEmployee.toString()),
    gosiEmployer: money(stored.gosiEmployer.toString()),
    eosbAccrual: money(stored.eosbAccrual.toString()),
    employerCost: money(stored.grossPay.toString())
      .plus(money(stored.gosiEmployer.toString()))
      .plus(money(stored.eosbAccrual.toString())),
  }
}

/**
 * The WPS file for the bank, built from the stored payslips.
 *
 * Validation runs first and names the employee and the problem, because a file the bank rejects
 * costs the employees their salary date.
 */
export async function wpsFileFor(
  tx: Tx,
  params: { tenantId: string; payrollRunId: string; bankCode?: string },
) {
  const run = await tx.payrollRun.findFirstOrThrow({
    where: { id: params.payrollRunId, tenantId: params.tenantId },
    include: { payslips: { include: { employee: true } } },
  })

  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: params.tenantId },
    select: { molEstablishmentId: true, legalNameEn: true, legalNameAr: true },
  })
  const bank = await tx.bankAccount.findFirst({
    where: { tenantId: params.tenantId, active: true },
    select: { iban: true, bankName: true },
  })

  if (!tenant.molEstablishmentId) {
    throw new PayrollError(
      'NO_MOL_ID',
      'The Ministry of Human Resources establishment ID is not set. Add it in Settings before producing a WPS file.',
      'الرقم الموحد للمنشأة لدى وزارة الموارد البشرية غير محدد. أضفه في الإعدادات قبل إخراج ملف حماية الأجور.',
    )
  }
  if (!bank?.iban) {
    throw new PayrollError(
      'NO_BANK',
      'No bank account is configured to pay salaries from.',
      'لا يوجد حساب بنكي محدد لصرف الرواتب منه.',
    )
  }

  const employer: WpsEmployer = {
    molEstablishmentId: tenant.molEstablishmentId,
    bankCode: params.bankCode ?? readSensitive(bank.iban).slice(4, 6),
    iban: readSensitive(bank.iban),
    nameEn: tenant.legalNameEn,
    nameAr: tenant.legalNameAr,
  }

  const payslips: Payslip[] = run.payslips.map((stored) => ({
    ...rehydrate(stored),
    employeeNumber: stored.employee.employeeNumber,
    nameEn: stored.employee.nameEn,
    nameAr: stored.employee.nameAr,
    iban: readSensitive(stored.employee.iban ?? ''),
    identityNumber: readSensitive(stored.employee.identityNumber),
    branchId: stored.employee.branchId,
  }))

  const options = {
    employer,
    periodYear: run.periodEnd.getUTCFullYear(),
    periodMonth: run.periodEnd.getUTCMonth() + 1,
    paymentDate: new Date(),
  }

  const problems = validateWps(payslips, options)
  if (problems.length) {
    throw new PayrollError(
      'WPS_INVALID',
      `The bank would reject this file:\n- ${problems.join('\n- ')}`,
      `سيرفض البنك هذا الملف:\n- ${problems.join('\n- ')}`,
    )
  }

  return generateWpsFile(payslips, options)
}
