/**
 * Wage Protection System file export.
 *
 * WPS files are a bank-specific rendering of the same data. The record layout below follows
 * the common Mudad / SARIE CSV structure (an employer header record followed by one detail
 * record per employee), and the column order is a **template**, so a bank that wants a
 * different order or extra padding is a settings change rather than a code change.
 *
 * Validation is deliberately strict: a WPS file the bank rejects costs the business a day and
 * the employees their salary date, so every rule the bank checks is checked here first.
 */
import { type Money, money, sum, toHalala } from '../money'
import type { Payslip } from './payroll'

export interface WpsEmployer {
  /** Ministry of Human Resources establishment ID. */
  molEstablishmentId: string
  /** Employer's bank, as a SAMA bank code (e.g. RJHI, NCBK, RIBL). */
  bankCode: string
  /** Employer's own IBAN, from which salaries are paid. */
  iban: string
  nameEn: string
  nameAr: string
}

export interface WpsOptions {
  employer: WpsEmployer
  /** The salary month being paid. */
  periodYear: number
  periodMonth: number
  /** Value date the bank should execute the transfers. */
  paymentDate: Date
  /** Days in the payroll month, reported per employee. */
  workingDays?: number
  /** Column template. Override for a bank with a different layout. */
  template?: WpsTemplate
}

export interface WpsTemplate {
  name: string
  /** Order of the detail columns. Every field below must appear exactly once. */
  detailColumns: WpsDetailField[]
  delimiter: string
  /** Whether to emit a header row naming the columns. Most banks want it; some reject it. */
  includeHeaderRow: boolean
  /** Line ending the bank's parser expects. */
  lineEnding: '\r\n' | '\n'
}

export type WpsDetailField =
  | 'recordType'
  | 'employeeId'
  | 'identityNumber'
  | 'nameEn'
  | 'nameAr'
  | 'bankCode'
  | 'iban'
  | 'basicSalary'
  | 'housingAllowance'
  | 'otherAllowance'
  | 'deductions'
  | 'netSalary'
  | 'workingDays'
  | 'paymentType'

export const MUDAD_CSV_TEMPLATE: WpsTemplate = {
  name: 'Mudad CSV',
  detailColumns: [
    'recordType', 'employeeId', 'identityNumber', 'nameEn', 'nameAr', 'bankCode', 'iban',
    'basicSalary', 'housingAllowance', 'otherAllowance', 'deductions', 'netSalary',
    'workingDays', 'paymentType',
  ],
  delimiter: ',',
  includeHeaderRow: true,
  lineEnding: '\r\n',
}

export class WpsValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`The WPS file would be rejected by the bank:\n- ${problems.join('\n- ')}`)
    this.name = 'WpsValidationError'
    this.problems = problems
  }
}

/**
 * Saudi IBAN check: SA + 2 check digits + 2-digit bank code + 18 alphanumeric characters,
 * 24 in total, validated with the ISO 7064 mod-97 algorithm the bank itself will run.
 */
export function isValidSaudiIban(iban: string): boolean {
  const normalised = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^SA\d{22}$/.test(normalised)) return false

  // Move the first four characters to the end, then convert letters to numbers (A=10 …).
  const rearranged = normalised.slice(4) + normalised.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))

  // The number is far beyond Number.MAX_SAFE_INTEGER, so take the modulus piecewise.
  let remainder = 0
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

/** Iqama and national ID are both ten digits; a Saudi ID starts with 1, an Iqama with 2. */
export function isValidSaudiIdentity(value: string): boolean {
  return /^[12]\d{9}$/.test(value)
}

export interface WpsFile {
  content: string
  filename: string
  recordCount: number
  totalAmount: Money
  /** Non-fatal notes shown to the user before they upload, e.g. an unusually large net pay. */
  warnings: string[]
}

function amount(value: Money | string | number): string {
  return toHalala(value).toFixed(2)
}

function fieldValue(field: WpsDetailField, payslip: Payslip, options: WpsOptions): string {
  const find = (code: string) =>
    payslip.earnings.find((e) => e.code === code)?.amount ?? money(0)

  switch (field) {
    case 'recordType': return 'EDR'
    case 'employeeId': return payslip.employeeNumber
    case 'identityNumber': return payslip.identityNumber
    case 'nameEn': return payslip.nameEn
    case 'nameAr': return payslip.nameAr
    case 'bankCode': return payslip.iban.replace(/\s+/g, '').slice(4, 6)
    case 'iban': return payslip.iban.replace(/\s+/g, '').toUpperCase()
    case 'basicSalary': return amount(find('BASIC'))
    case 'housingAllowance': return amount(find('HOUSING'))
    case 'otherAllowance':
      return amount(
        payslip.earnings
          .filter((e) => e.code !== 'BASIC' && e.code !== 'HOUSING')
          .reduce((acc, e) => acc.plus(e.amount), money(0)),
      )
    case 'deductions': return amount(payslip.totalDeductions)
    case 'netSalary': return amount(payslip.netPay)
    case 'workingDays': return String(options.workingDays ?? 30)
    case 'paymentType': return 'S' // S = salary, as opposed to a bonus or settlement run
    default: {
      const exhaustive: never = field
      throw new Error(`Unknown WPS field ${String(exhaustive)}`)
    }
  }
}

/** Escape a value for CSV: quote it if it contains the delimiter, a quote or a newline. */
function csvEscape(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function validateWps(payslips: Payslip[], options: WpsOptions): string[] {
  const problems: string[] = []

  if (!/^\d{1,15}$/.test(options.employer.molEstablishmentId)) {
    problems.push('The MOL establishment ID must be numeric.')
  }
  if (!isValidSaudiIban(options.employer.iban)) {
    problems.push(`The employer IBAN ${options.employer.iban} is not a valid Saudi IBAN.`)
  }
  if (options.periodMonth < 1 || options.periodMonth > 12) {
    problems.push('The salary month must be between 1 and 12.')
  }
  if (payslips.length === 0) problems.push('There are no employees in this payroll run.')

  const seenIbans = new Map<string, string>()
  for (const p of payslips) {
    if (!isValidSaudiIban(p.iban)) {
      problems.push(`${p.nameEn} (${p.employeeNumber}) has an invalid IBAN: ${p.iban}`)
    } else {
      const normalised = p.iban.replace(/\s+/g, '').toUpperCase()
      const existing = seenIbans.get(normalised)
      // Two employees paid into one account is a real payroll fraud pattern; banks flag it.
      if (existing) problems.push(`${p.nameEn} and ${existing} share the IBAN ${normalised}.`)
      else seenIbans.set(normalised, p.nameEn)
    }
    if (!isValidSaudiIdentity(p.identityNumber)) {
      problems.push(`${p.nameEn} (${p.employeeNumber}) has an invalid Iqama or national ID: ${p.identityNumber}`)
    }
    if (p.netPay.isNegative()) {
      problems.push(`${p.nameEn} (${p.employeeNumber}) has a negative net pay; deductions exceed earnings.`)
    }
    if (!p.nameAr?.trim()) {
      problems.push(`${p.nameEn} (${p.employeeNumber}) has no Arabic name, which WPS requires.`)
    }
  }

  return problems
}

export function generateWpsFile(payslips: Payslip[], options: WpsOptions): WpsFile {
  const problems = validateWps(payslips, options)
  if (problems.length) throw new WpsValidationError(problems)

  const template = options.template ?? MUDAD_CSV_TEMPLATE
  const { delimiter, lineEnding } = template

  const totalAmount = toHalala(sum(payslips.map((p) => p.netPay)))
  const period = `${options.periodYear}${String(options.periodMonth).padStart(2, '0')}`

  const rows: string[] = []

  if (template.includeHeaderRow) {
    rows.push(template.detailColumns.join(delimiter))
  }

  // Employer record — one per file, identifying who is paying and the control totals.
  rows.push(
    [
      'EMP',
      options.employer.molEstablishmentId,
      options.employer.bankCode,
      options.employer.iban.replace(/\s+/g, '').toUpperCase(),
      period,
      options.paymentDate.toISOString().slice(0, 10).replace(/-/g, ''),
      String(payslips.length),
      totalAmount.toFixed(2),
      'SAR',
    ]
      .map((v) => csvEscape(v, delimiter))
      .join(delimiter),
  )

  for (const payslip of payslips) {
    rows.push(
      template.detailColumns
        .map((field) => csvEscape(fieldValue(field, payslip, options), delimiter))
        .join(delimiter),
    )
  }

  const warnings: string[] = []
  for (const p of payslips) {
    if (p.netPay.greaterThan(100_000)) {
      warnings.push(`${p.nameEn} has an unusually large net pay of ${amount(p.netPay)} SAR — check before uploading.`)
    }
    if (p.netPay.isZero()) {
      warnings.push(`${p.nameEn} has a net pay of zero; the bank may reject a zero-value transfer.`)
    }
  }

  return {
    content: rows.join(lineEnding) + lineEnding,
    filename: `WPS_${options.employer.molEstablishmentId}_${period}.csv`,
    recordCount: payslips.length,
    totalAmount,
    warnings,
  }
}
