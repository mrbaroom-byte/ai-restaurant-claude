/**
 * GOSI (General Organisation for Social Insurance) contributions.
 *
 * Rates are **settings, not constants**. They have changed within the working life of most
 * Saudi SMEs and the July 2024 reform introduced a stepped schedule for new entrants. The
 * defaults below are the best-known current rates for an existing employee; every one of them
 * is editable per tenant and stamped onto the payroll run, so a historical payslip always
 * recomputes with the rates that applied when it was produced. See DECISIONS.md D-030.
 */
import { type Money, ZERO, money, toHalala } from '../money'

export type Nationality = 'SAUDI' | 'NON_SAUDI'

export interface GosiRates {
  /** Saudi employee share (annuities + unemployment insurance). */
  saudiEmployee: Money
  /** Saudi employer share (annuities + occupational hazards + unemployment insurance). */
  saudiEmployer: Money
  /** Non-Saudi employee share — nil; the branch exists so a rule change is a settings change. */
  nonSaudiEmployee: Money
  /** Non-Saudi employer share (occupational hazards only). */
  nonSaudiEmployer: Money
  /** Monthly ceiling on the contributory wage. */
  wageCeiling: Money
  /** Monthly floor on the contributory wage, applied to Saudis only. */
  wageFloor: Money
}

export const DEFAULT_GOSI_RATES: GosiRates = {
  saudiEmployee: money('0.0975'),
  saudiEmployer: money('0.1175'),
  nonSaudiEmployee: ZERO,
  nonSaudiEmployer: money('0.02'),
  wageCeiling: money('45000'),
  wageFloor: money('1500'),
}

export interface GosiInput {
  nationality: Nationality
  basicSalary: Money | string | number
  housingAllowance?: Money | string | number
  /** Employees registered before the 2024 reform, or exempt categories, can be excluded. */
  exempt?: boolean
}

export interface GosiResult {
  /** The wage GOSI is charged on: basic + housing, floored and capped. */
  contributoryWage: Money
  employeeContribution: Money
  employerContribution: Money
  total: Money
}

/**
 * Contributory wage is basic salary plus housing allowance — transport and other allowances
 * are excluded. Capped at the ceiling; Saudis are also floored.
 */
export function contributoryWage(input: GosiInput, rates: GosiRates = DEFAULT_GOSI_RATES): Money {
  const raw = money(input.basicSalary).plus(money(input.housingAllowance ?? 0))
  let wage = raw
  if (wage.greaterThan(rates.wageCeiling)) wage = rates.wageCeiling
  if (input.nationality === 'SAUDI' && wage.lessThan(rates.wageFloor)) wage = rates.wageFloor
  return toHalala(wage)
}

export function calculateGosi(input: GosiInput, rates: GosiRates = DEFAULT_GOSI_RATES): GosiResult {
  if (input.exempt) {
    return { contributoryWage: ZERO, employeeContribution: ZERO, employerContribution: ZERO, total: ZERO }
  }

  const wage = contributoryWage(input, rates)
  const employeeRate = input.nationality === 'SAUDI' ? rates.saudiEmployee : rates.nonSaudiEmployee
  const employerRate = input.nationality === 'SAUDI' ? rates.saudiEmployer : rates.nonSaudiEmployer

  const employeeContribution = toHalala(wage.times(employeeRate))
  const employerContribution = toHalala(wage.times(employerRate))

  return {
    contributoryWage: wage,
    employeeContribution,
    employerContribution,
    total: toHalala(employeeContribution.plus(employerContribution)),
  }
}
