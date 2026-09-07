/**
 * End of service benefit, per Articles 84–87 of the Saudi Labour Law.
 *
 * The award: half a month's wage for each of the first five years of service, and a full
 * month's wage for each year after that, pro-rated for part years.
 *
 * How much of it is actually paid depends on how the contract ended:
 *   • employer termination, expiry of a fixed term, death, retirement → the full award
 *   • resignation under 2 years                                       → nothing
 *   • resignation 2 to under 5 years                                  → one third
 *   • resignation 5 to under 10 years                                 → two thirds
 *   • resignation 10 years or more                                    → the full award
 *   • resignation for a reason under Article 81, or a woman within six months of marriage or
 *     three months of childbirth                                      → the full award
 *
 * The accrual posted each month is the movement in the full award, not the resignation-adjusted
 * figure, because the liability the business carries is the amount it would owe on termination.
 */
import { Decimal, type Money, ZERO, money, toHalala } from '../money'

export type SeparationReason =
  | 'EMPLOYER_TERMINATION'
  | 'CONTRACT_EXPIRY'
  | 'RESIGNATION'
  | 'RESIGNATION_ARTICLE_81'
  | 'FEMALE_MARRIAGE_OR_BIRTH'
  | 'RETIREMENT'
  | 'DEATH'
  | 'DISABILITY'

export interface EosbInput {
  /** Last wage: basic plus the regular allowances that form the contractual wage. */
  monthlyWage: Money | string | number
  hireDate: Date
  /** Date of separation, or the accrual date when computing the carried liability. */
  asOf: Date
  reason?: SeparationReason
  /** Unpaid leave and other suspended periods that do not count towards service. */
  excludedDays?: number
}

export interface EosbResult {
  /** Completed years and the fraction of a year beyond them. */
  serviceYears: Decimal
  serviceDays: number
  /** The award before any resignation reduction — this is the liability to carry. */
  fullAward: Money
  /** Fraction of the award payable given the separation reason. */
  entitlementFraction: Decimal
  /** What is actually paid out. */
  payableAward: Money
}

const DAYS_PER_YEAR = new Decimal(365)

/** Service length in days, excluding suspended periods. */
export function serviceDays(hireDate: Date, asOf: Date, excludedDays = 0): number {
  const days = Math.floor((asOf.getTime() - hireDate.getTime()) / 86_400_000) - excludedDays
  return Math.max(0, days)
}

/**
 * Fraction of the award payable. Resignation is the only reason that reduces it, and only
 * below ten years of service.
 */
export function entitlementFraction(reason: SeparationReason | undefined, years: Decimal): Decimal {
  if (reason !== 'RESIGNATION') return new Decimal(1)
  if (years.lessThan(2)) return new Decimal(0)
  if (years.lessThan(5)) return new Decimal(1).div(3)
  if (years.lessThan(10)) return new Decimal(2).div(3)
  return new Decimal(1)
}

export function calculateEosb(input: EosbInput): EosbResult {
  const wage = money(input.monthlyWage)
  if (wage.isNegative()) throw new RangeError('End of service wage cannot be negative.')

  const days = serviceDays(input.hireDate, input.asOf, input.excludedDays ?? 0)
  const years = new Decimal(days).div(DAYS_PER_YEAR)

  // First five years at half a month per year; anything beyond at a full month per year.
  const firstFive = Decimal.min(years, 5)
  const beyondFive = Decimal.max(years.minus(5), 0)
  const months = firstFive.times('0.5').plus(beyondFive)

  const fullAward = toHalala(wage.times(months))
  const fraction = entitlementFraction(input.reason, years)

  return {
    serviceYears: years,
    serviceDays: days,
    fullAward,
    entitlementFraction: fraction,
    payableAward: toHalala(fullAward.times(fraction)),
  }
}

/**
 * The month's accrual: the increase in the carried liability.
 *
 * Posting the movement rather than recomputing the balance keeps the provision account equal
 * to the sum of its postings, which is what makes it reconcilable.
 */
export function monthlyAccrual(input: EosbInput, previouslyAccrued: Money | string | number): Money {
  const liability = calculateEosb({ ...input, reason: 'EMPLOYER_TERMINATION' }).fullAward
  const movement = liability.minus(money(previouslyAccrued))
  return toHalala(movement.isNegative() ? ZERO : movement)
}

/**
 * Annual leave entitlement: 21 days a year, rising to 30 after five years of service
 * (Article 109).
 */
export function annualLeaveDays(hireDate: Date, asOf: Date): number {
  const years = serviceDays(hireDate, asOf) / 365
  return years >= 5 ? 30 : 21
}
