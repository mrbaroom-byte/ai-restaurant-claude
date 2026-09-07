/**
 * Payroll calculation and its ledger posting.
 *
 * A payslip is assembled from earnings and deductions, each of which is a named line so the
 * employee can see exactly what changed month to month. The run then posts one journal entry
 * for the whole payroll rather than one per employee, with employee analysis on the lines.
 */
import { Decimal, type Money, ZERO, money, sum, toHalala } from '../money'
import { type GosiRates, type Nationality, DEFAULT_GOSI_RATES, calculateGosi } from './gosi'
import { type EosbInput, monthlyAccrual } from './eosb'
import type { PostingRequest } from '../accounting/posting'

/** Overtime multiplier under Article 107: the hourly wage plus 50%. */
export const OVERTIME_MULTIPLIER = new Decimal('1.5')

/**
 * Hours used to derive an hourly rate from a monthly wage: 30 days × 8 hours. This is the
 * common Saudi practice rather than a statutory figure, so it is a tenant setting.
 */
export const DEFAULT_MONTHLY_HOURS = new Decimal(240)

export interface PayrollEmployeeInput {
  employeeId: string
  employeeNumber: string
  nameEn: string
  nameAr: string
  nationality: Nationality
  /** Iqama number for a resident, national ID for a Saudi. */
  identityNumber: string
  iban: string
  hireDate: Date
  basicSalary: Money | string | number
  housingAllowance?: Money | string | number
  transportAllowance?: Money | string | number
  otherAllowance?: Money | string | number
  overtimeHours?: Money | string | number
  /** Days absent without pay in the period. */
  unpaidLeaveDays?: number
  /** Instalment falling due this month on a staff loan. */
  loanDeduction?: Money | string | number
  otherDeduction?: Money | string | number
  /** Non-recurring payments: bonus, commission, arrears. */
  additions?: Array<{ code: string; nameEn: string; nameAr: string; amount: Money | string | number }>
  gosiExempt?: boolean
  /** EOSB provision already carried for this employee. */
  eosbAccruedToDate?: Money | string | number
  branchId: string
}

export interface PayslipLine {
  code: string
  nameEn: string
  nameAr: string
  amount: Money
}

export interface Payslip {
  employeeId: string
  employeeNumber: string
  nameEn: string
  nameAr: string
  iban: string
  identityNumber: string
  branchId: string
  earnings: PayslipLine[]
  deductions: PayslipLine[]
  grossPay: Money
  totalDeductions: Money
  netPay: Money
  gosiEmployee: Money
  gosiEmployer: Money
  eosbAccrual: Money
  /** Full employment cost: gross plus the employer's own charges. */
  employerCost: Money
}

export interface PayrollRunInput {
  periodStart: Date
  periodEnd: Date
  employees: PayrollEmployeeInput[]
  gosiRates?: GosiRates
  monthlyHours?: Decimal
  /** Days in the payroll month, used to pro-rate unpaid leave. 30 by Saudi convention. */
  daysInMonth?: number
}

export interface PayrollRunResult {
  payslips: Payslip[]
  totalGross: Money
  totalNet: Money
  totalGosiEmployee: Money
  totalGosiEmployer: Money
  totalEosbAccrual: Money
  totalDeductions: Money
  totalEmployerCost: Money
}

function line(code: string, nameEn: string, nameAr: string, amount: Money): PayslipLine | null {
  return amount.isZero() ? null : { code, nameEn, nameAr, amount: toHalala(amount) }
}

export function calculatePayslip(
  employee: PayrollEmployeeInput,
  options: { periodEnd: Date; gosiRates?: GosiRates; monthlyHours?: Decimal; daysInMonth?: number } ,
): Payslip {
  const rates = options.gosiRates ?? DEFAULT_GOSI_RATES
  const monthlyHours = options.monthlyHours ?? DEFAULT_MONTHLY_HOURS
  const daysInMonth = new Decimal(options.daysInMonth ?? 30)

  const basic = money(employee.basicSalary)
  const housing = money(employee.housingAllowance ?? 0)
  const transport = money(employee.transportAllowance ?? 0)
  const other = money(employee.otherAllowance ?? 0)

  if (basic.isNegative()) throw new RangeError(`Basic salary for ${employee.employeeNumber} is negative.`)

  // Overtime is computed on the full wage, not on basic alone, which is the reading Saudi
  // labour offices apply to Article 107.
  const fullWage = basic.plus(housing).plus(transport).plus(other)
  const hourlyRate = fullWage.div(monthlyHours)
  const overtimeHours = money(employee.overtimeHours ?? 0)
  const overtime = toHalala(hourlyRate.times(OVERTIME_MULTIPLIER).times(overtimeHours))

  // Unpaid leave is deducted at the daily rate of the full wage.
  const unpaidDays = new Decimal(employee.unpaidLeaveDays ?? 0)
  const unpaidLeave = toHalala(fullWage.div(daysInMonth).times(unpaidDays))

  const additions = (employee.additions ?? []).map((a) => ({
    code: a.code,
    nameEn: a.nameEn,
    nameAr: a.nameAr,
    amount: toHalala(a.amount),
  }))

  const earnings = [
    line('BASIC', 'Basic salary', 'الراتب الأساسي', basic),
    line('HOUSING', 'Housing allowance', 'بدل السكن', housing),
    line('TRANSPORT', 'Transport allowance', 'بدل النقل', transport),
    line('OTHER', 'Other allowance', 'بدلات أخرى', other),
    line('OVERTIME', 'Overtime', 'العمل الإضافي', overtime),
    ...additions,
  ].filter((l): l is PayslipLine => l !== null)

  const gosi = calculateGosi(
    {
      nationality: employee.nationality,
      basicSalary: basic,
      housingAllowance: housing,
      exempt: employee.gosiExempt,
    },
    rates,
  )

  const deductions = [
    line('GOSI', 'GOSI employee share', 'حصة الموظف في التأمينات', gosi.employeeContribution),
    line('UNPAID_LEAVE', 'Unpaid leave', 'إجازة بدون راتب', unpaidLeave),
    line('LOAN', 'Loan instalment', 'قسط السلفة', money(employee.loanDeduction ?? 0)),
    line('OTHER_DEDUCTION', 'Other deductions', 'استقطاعات أخرى', money(employee.otherDeduction ?? 0)),
  ].filter((l): l is PayslipLine => l !== null)

  const grossPay = toHalala(sum(earnings.map((e) => e.amount)))
  const totalDeductions = toHalala(sum(deductions.map((d) => d.amount)))
  const netPay = toHalala(grossPay.minus(totalDeductions))

  const eosbInput: EosbInput = {
    monthlyWage: fullWage,
    hireDate: employee.hireDate,
    asOf: options.periodEnd,
  }
  const eosbAccrual = monthlyAccrual(eosbInput, employee.eosbAccruedToDate ?? 0)

  return {
    employeeId: employee.employeeId,
    employeeNumber: employee.employeeNumber,
    nameEn: employee.nameEn,
    nameAr: employee.nameAr,
    iban: employee.iban,
    identityNumber: employee.identityNumber,
    branchId: employee.branchId,
    earnings,
    deductions,
    grossPay,
    totalDeductions,
    netPay,
    gosiEmployee: gosi.employeeContribution,
    gosiEmployer: gosi.employerContribution,
    eosbAccrual,
    employerCost: toHalala(grossPay.plus(gosi.employerContribution).plus(eosbAccrual)),
  }
}

export function runPayroll(input: PayrollRunInput): PayrollRunResult {
  if (input.periodEnd < input.periodStart) {
    throw new RangeError('Payroll period ends before it starts.')
  }
  const seen = new Set<string>()
  for (const e of input.employees) {
    if (seen.has(e.employeeId)) throw new Error(`Employee ${e.employeeNumber} appears twice in this payroll run.`)
    seen.add(e.employeeId)
  }

  const payslips = input.employees.map((employee) =>
    calculatePayslip(employee, {
      periodEnd: input.periodEnd,
      gosiRates: input.gosiRates,
      monthlyHours: input.monthlyHours,
      daysInMonth: input.daysInMonth,
    }),
  )

  return {
    payslips,
    totalGross: toHalala(sum(payslips.map((p) => p.grossPay))),
    totalNet: toHalala(sum(payslips.map((p) => p.netPay))),
    totalGosiEmployee: toHalala(sum(payslips.map((p) => p.gosiEmployee))),
    totalGosiEmployer: toHalala(sum(payslips.map((p) => p.gosiEmployer))),
    totalEosbAccrual: toHalala(sum(payslips.map((p) => p.eosbAccrual))),
    totalDeductions: toHalala(sum(payslips.map((p) => p.totalDeductions))),
    totalEmployerCost: toHalala(sum(payslips.map((p) => p.employerCost))),
  }
}

/**
 * Build the payroll journal entry.
 *
 *   Dr Salaries expense            gross pay
 *   Dr GOSI expense (employer)     employer share
 *   Dr EOSB expense                accrual for the month
 *     Cr GOSI payable              employee share + employer share
 *     Cr Loans receivable          loan instalments recovered
 *     Cr Other deductions          held for onward payment
 *     Cr EOSB provision            accrual for the month
 *     Cr Accrued salaries          net pay, cleared when the WPS file is paid
 */
export function buildPayrollPosting(params: {
  tenantId: string
  branchId: string
  date: Date
  reference: string
  result: PayrollRunResult
}): PostingRequest {
  const { result } = params

  const loanRecovered = toHalala(
    sum(result.payslips.flatMap((p) => p.deductions.filter((d) => d.code === 'LOAN').map((d) => d.amount))),
  )
  const otherDeductions = toHalala(
    sum(result.payslips.flatMap((p) => p.deductions.filter((d) => d.code === 'OTHER_DEDUCTION').map((d) => d.amount))),
  )
  // Unpaid leave is already netted out of gross pay by not being earned; it appears as a
  // deduction line for the employee's benefit, so it must be added back here to balance.
  const unpaidLeave = toHalala(
    sum(result.payslips.flatMap((p) => p.deductions.filter((d) => d.code === 'UNPAID_LEAVE').map((d) => d.amount))),
  )

  const lines: PostingRequest['lines'] = [
    {
      role: 'SALARIES_EXPENSE',
      debit: result.totalGross.minus(unpaidLeave),
      memoEn: 'Gross salaries',
      memoAr: 'إجمالي الرواتب',
    },
  ]

  if (!result.totalGosiEmployer.isZero()) {
    lines.push({ role: 'GOSI_EXPENSE', debit: result.totalGosiEmployer, memoEn: 'GOSI employer share', memoAr: 'حصة المنشأة في التأمينات' })
  }
  if (!result.totalEosbAccrual.isZero()) {
    lines.push({ role: 'EOSB_EXPENSE', debit: result.totalEosbAccrual, memoEn: 'End of service accrual', memoAr: 'مخصص نهاية الخدمة' })
  }

  const gosiPayable = toHalala(result.totalGosiEmployee.plus(result.totalGosiEmployer))
  if (!gosiPayable.isZero()) {
    lines.push({ role: 'GOSI_PAYABLE', credit: gosiPayable, memoEn: 'GOSI payable', memoAr: 'التأمينات المستحقة' })
  }
  if (!loanRecovered.isZero()) {
    lines.push({ role: 'PREPAID_EXPENSE', credit: loanRecovered, memoEn: 'Staff loan recovered', memoAr: 'استرداد سلف الموظفين' })
  }
  if (!otherDeductions.isZero()) {
    lines.push({ role: 'GENERAL_EXPENSE', credit: otherDeductions, memoEn: 'Other deductions withheld', memoAr: 'استقطاعات أخرى محتجزة' })
  }
  if (!result.totalEosbAccrual.isZero()) {
    lines.push({ role: 'EOSB_PROVISION', credit: result.totalEosbAccrual, memoEn: 'End of service provision', memoAr: 'مخصص مكافأة نهاية الخدمة' })
  }

  lines.push({
    role: 'ACCRUED_SALARIES',
    credit: result.totalNet,
    memoEn: 'Net pay due to employees',
    memoAr: 'صافي الرواتب المستحقة للموظفين',
  })

  return {
    tenantId: params.tenantId,
    branchId: params.branchId,
    date: params.date,
    source: 'PAYROLL',
    reference: params.reference,
    memoEn: `Payroll ${params.reference}`,
    memoAr: `مسير رواتب ${params.reference}`,
    lines,
  }
}
