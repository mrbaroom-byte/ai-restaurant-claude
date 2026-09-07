import { describe, expect, it } from 'vitest'
import { DEFAULT_GOSI_RATES, calculateGosi, contributoryWage } from '@/lib/payroll/gosi'
import { annualLeaveDays, calculateEosb, entitlementFraction, monthlyAccrual, serviceDays } from '@/lib/payroll/eosb'
import { buildPayrollPosting, calculatePayslip, runPayroll, type PayrollEmployeeInput } from '@/lib/payroll/payroll'
import { WpsValidationError, generateWpsFile, isValidSaudiIban, isValidSaudiIdentity, validateWps } from '@/lib/payroll/wps'
import { buildJournalEntry } from '@/lib/accounting/posting'
import { Decimal, money, sum } from '@/lib/money'

describe('GOSI', () => {
  it('charges a Saudi employee 9.75% and the employer 11.75% of basic plus housing', () => {
    const result = calculateGosi({ nationality: 'SAUDI', basicSalary: '8000', housingAllowance: '2000' })
    expect(result.contributoryWage.toFixed(2)).toBe('10000.00')
    expect(result.employeeContribution.toFixed(2)).toBe('975.00')
    expect(result.employerContribution.toFixed(2)).toBe('1175.00')
    expect(result.total.toFixed(2)).toBe('2150.00')
  })

  it('charges a non-Saudi employer 2% and the employee nothing', () => {
    const result = calculateGosi({ nationality: 'NON_SAUDI', basicSalary: '4000', housingAllowance: '1000' })
    expect(result.employeeContribution.toFixed(2)).toBe('0.00')
    expect(result.employerContribution.toFixed(2)).toBe('100.00')
  })

  it('excludes transport and other allowances from the contributory wage', () => {
    // Only basic + housing are passed in; the payslip's other allowances never reach GOSI.
    expect(contributoryWage({ nationality: 'SAUDI', basicSalary: '5000', housingAllowance: '1250' }).toFixed(2))
      .toBe('6250.00')
  })

  it('caps the contributory wage at the ceiling', () => {
    const result = calculateGosi({ nationality: 'SAUDI', basicSalary: '60000', housingAllowance: '15000' })
    expect(result.contributoryWage.toFixed(2)).toBe('45000.00')
    expect(result.employeeContribution.toFixed(2)).toBe('4387.50')
  })

  it('floors a Saudi wage but not a non-Saudi one', () => {
    expect(calculateGosi({ nationality: 'SAUDI', basicSalary: '1000' }).contributoryWage.toFixed(2)).toBe('1500.00')
    expect(calculateGosi({ nationality: 'NON_SAUDI', basicSalary: '1000' }).contributoryWage.toFixed(2)).toBe('1000.00')
  })

  it('charges nothing for an exempt employee', () => {
    const result = calculateGosi({ nationality: 'SAUDI', basicSalary: '10000', exempt: true })
    expect(result.total.toFixed(2)).toBe('0.00')
  })

  it('recomputes with whatever rates the run was stamped with', () => {
    const historical = { ...DEFAULT_GOSI_RATES, saudiEmployee: money('0.10'), saudiEmployer: money('0.12') }
    const result = calculateGosi({ nationality: 'SAUDI', basicSalary: '10000' }, historical)
    expect(result.employeeContribution.toFixed(2)).toBe('1000.00')
    expect(result.employerContribution.toFixed(2)).toBe('1200.00')
  })
})

describe('end of service benefit', () => {
  const hire = new Date('2018-01-01')

  it('awards half a month a year for the first five years', () => {
    const result = calculateEosb({ monthlyWage: '12000', hireDate: hire, asOf: new Date('2021-01-01'), reason: 'EMPLOYER_TERMINATION' })
    // 1,096 days including a leap day = 3.0027 years, halved = 1.5014 months of wage.
    expect(Number(result.fullAward)).toBeCloseTo(18016.44, 2)
    expect(result.entitlementFraction.toFixed(2)).toBe('1.00')
  })

  it('awards a full month a year beyond five years', () => {
    const result = calculateEosb({ monthlyWage: '12000', hireDate: hire, asOf: new Date('2026-01-01'), reason: 'EMPLOYER_TERMINATION' })
    // 2,922 days = 8.0055 years: 5 x 0.5 + 3.0055 x 1 = 5.5055 months of wage.
    expect(Number(result.fullAward)).toBeCloseTo(66065.75, 2)
  })

  it('pays nothing on a resignation before two years', () => {
    expect(entitlementFraction('RESIGNATION', new Decimal('1.9')).toFixed(4)).toBe('0.0000')
  })

  it('pays a third between two and five years, two thirds to ten, then in full', () => {
    expect(entitlementFraction('RESIGNATION', new Decimal(3)).toFixed(4)).toBe('0.3333')
    expect(entitlementFraction('RESIGNATION', new Decimal(7)).toFixed(4)).toBe('0.6667')
    expect(entitlementFraction('RESIGNATION', new Decimal(11)).toFixed(4)).toBe('1.0000')
  })

  it('pays the full award regardless of length for the protected reasons', () => {
    for (const reason of ['RESIGNATION_ARTICLE_81', 'FEMALE_MARRIAGE_OR_BIRTH', 'DEATH', 'RETIREMENT', 'DISABILITY', 'CONTRACT_EXPIRY'] as const) {
      expect(entitlementFraction(reason, new Decimal('0.5')).toFixed(2)).toBe('1.00')
    }
  })

  it('reduces the payout but not the liability on a resignation', () => {
    const result = calculateEosb({ monthlyWage: '10000', hireDate: hire, asOf: new Date('2021-06-30'), reason: 'RESIGNATION' })
    expect(result.entitlementFraction.toFixed(4)).toBe('0.3333')
    expect(result.payableAward.lessThan(result.fullAward)).toBe(true)
  })

  it('excludes suspended service from the calculation', () => {
    const withLeave = calculateEosb({ monthlyWage: '10000', hireDate: hire, asOf: new Date('2026-01-01'), excludedDays: 365 })
    const without = calculateEosb({ monthlyWage: '10000', hireDate: hire, asOf: new Date('2026-01-01') })
    expect(withLeave.serviceDays).toBe(without.serviceDays - 365)
    expect(withLeave.fullAward.lessThan(without.fullAward)).toBe(true)
  })

  it('accrues only the movement in the liability each month', () => {
    const input = { monthlyWage: '12000', hireDate: hire, asOf: new Date('2026-02-01') }
    const liability = calculateEosb({ ...input, reason: 'EMPLOYER_TERMINATION' }).fullAward
    const accrual = monthlyAccrual(input, liability.minus(500))
    expect(accrual.toFixed(2)).toBe('500.00')
  })

  it('never accrues a negative amount when the wage falls', () => {
    const input = { monthlyWage: '5000', hireDate: hire, asOf: new Date('2026-02-01') }
    expect(monthlyAccrual(input, '999999').toFixed(2)).toBe('0.00')
  })

  it('reports no service for a future hire date', () => {
    expect(serviceDays(new Date('2030-01-01'), new Date('2026-01-01'))).toBe(0)
  })

  it('raises annual leave from 21 to 30 days after five years', () => {
    expect(annualLeaveDays(hire, new Date('2021-01-01'))).toBe(21)
    expect(annualLeaveDays(hire, new Date('2024-01-01'))).toBe(30)
  })
})

const employee = (over: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput => ({
  employeeId: 'e1',
  employeeNumber: 'EMP-001',
  nameEn: 'Ahmed Al Qahtani',
  nameAr: 'أحمد القحطاني',
  nationality: 'SAUDI',
  identityNumber: '1098765432',
  iban: 'SA0380000000608010167519',
  hireDate: new Date('2020-01-01'),
  basicSalary: '8000',
  housingAllowance: '2000',
  transportAllowance: '500',
  branchId: 'b1',
  ...over,
})

describe('payslip', () => {
  it('assembles earnings and deductions into a net pay the employee can follow', () => {
    const slip = calculatePayslip(employee(), { periodEnd: new Date('2026-03-31') })

    expect(slip.grossPay.toFixed(2)).toBe('10500.00')
    expect(slip.gosiEmployee.toFixed(2)).toBe('975.00')
    expect(slip.netPay.toFixed(2)).toBe('9525.00')
    expect(slip.earnings.map((e) => e.code)).toEqual(['BASIC', 'HOUSING', 'TRANSPORT'])
    expect(slip.deductions.map((d) => d.code)).toEqual(['GOSI'])
    expect(slip.earnings[0].nameAr).toBe('الراتب الأساسي')
  })

  it('pays overtime at 150% of the hourly rate on the full wage', () => {
    const slip = calculatePayslip(employee({ overtimeHours: '10' }), { periodEnd: new Date('2026-03-31') })
    // 10,500 / 240 = 43.75/hour; x1.5 x10 = 656.25
    const overtime = slip.earnings.find((e) => e.code === 'OVERTIME')!
    expect(overtime.amount.toFixed(2)).toBe('656.25')
  })

  it('deducts unpaid leave at the daily rate', () => {
    const slip = calculatePayslip(employee({ unpaidLeaveDays: 3 }), { periodEnd: new Date('2026-03-31') })
    // 10,500 / 30 x 3 = 1,050
    expect(slip.deductions.find((d) => d.code === 'UNPAID_LEAVE')!.amount.toFixed(2)).toBe('1050.00')
  })

  it('includes loans, other deductions and ad hoc additions', () => {
    const slip = calculatePayslip(
      employee({
        loanDeduction: '500',
        otherDeduction: '100',
        additions: [{ code: 'BONUS', nameEn: 'Performance bonus', nameAr: 'مكافأة أداء', amount: '1000' }],
      }),
      { periodEnd: new Date('2026-03-31') },
    )
    expect(slip.grossPay.toFixed(2)).toBe('11500.00')
    expect(slip.netPay.toFixed(2)).toBe('9925.00')
  })

  it('reports the employer cost, not just the net pay', () => {
    const slip = calculatePayslip(employee(), { periodEnd: new Date('2026-03-31') })
    expect(slip.employerCost.greaterThan(slip.grossPay)).toBe(true)
    expect(slip.employerCost.toFixed(2)).toBe(
      slip.grossPay.plus(slip.gosiEmployer).plus(slip.eosbAccrual).toFixed(2),
    )
  })

  it('refuses a negative basic salary', () => {
    expect(() => calculatePayslip(employee({ basicSalary: '-1' }), { periodEnd: new Date('2026-03-31') }))
      .toThrow(/negative/i)
  })
})

describe('payroll run', () => {
  const employees = [
    employee(),
    employee({ employeeId: 'e2', employeeNumber: 'EMP-002', nameEn: 'Ravi Kumar', nameAr: 'رافي كومار', nationality: 'NON_SAUDI', identityNumber: '2345678901', iban: 'SA4420000001234567891234', basicSalary: '3500', housingAllowance: '875' }),
    employee({ employeeId: 'e3', employeeNumber: 'EMP-003', nameEn: 'Sara Al Otaibi', nameAr: 'سارة العتيبي', identityNumber: '1123456789', iban: 'SA6980000204608016212908', basicSalary: '6000', housingAllowance: '1500', overtimeHours: '8' }),
    employee({ employeeId: 'e4', employeeNumber: 'EMP-004', nameEn: 'Mohammed Hassan', nameAr: 'محمد حسن', nationality: 'NON_SAUDI', identityNumber: '2987654321', iban: 'SA0950000000012345678910', basicSalary: '4200', loanDeduction: '400' }),
    employee({ employeeId: 'e5', employeeNumber: 'EMP-005', nameEn: 'Noura Al Harbi', nameAr: 'نورة الحربي', identityNumber: '1555666777', iban: 'SA8510000012345678901234', basicSalary: '9000', housingAllowance: '2250', unpaidLeaveDays: 2 }),
  ]

  const result = runPayroll({
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-31'),
    employees,
  })

  it('produces one payslip per employee with consistent totals', () => {
    expect(result.payslips).toHaveLength(5)
    expect(result.totalGross.toFixed(2)).toBe(sum(result.payslips.map((p) => p.grossPay)).toFixed(2))
    expect(result.totalNet.toFixed(2)).toBe(sum(result.payslips.map((p) => p.netPay)).toFixed(2))
  })

  it('charges GOSI only to the Saudi employees, plus 2% on the others', () => {
    const saudis = result.payslips.filter((_, i) => employees[i].nationality === 'SAUDI')
    expect(saudis.every((p) => p.gosiEmployee.greaterThan(0))).toBe(true)
    const others = result.payslips.filter((_, i) => employees[i].nationality === 'NON_SAUDI')
    expect(others.every((p) => p.gosiEmployee.isZero())).toBe(true)
    expect(others.every((p) => p.gosiEmployer.greaterThan(0))).toBe(true)
  })

  it('accrues end of service for everyone', () => {
    expect(result.payslips.every((p) => p.eosbAccrual.greaterThan(0))).toBe(true)
    expect(result.totalEosbAccrual.toFixed(2)).toBe(sum(result.payslips.map((p) => p.eosbAccrual)).toFixed(2))
  })

  it('posts a balanced journal entry', () => {
    const entry = buildJournalEntry(
      buildPayrollPosting({
        tenantId: 't1',
        branchId: 'b1',
        date: new Date('2026-03-31'),
        reference: 'PAY-2026-03',
        result,
      }),
    )
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true)
    // The net pay owed to staff is the credit that will be cleared by the WPS payment.
    const accrued = entry.lines.find((l) => l.role === 'ACCRUED_SALARIES')!
    expect(accrued.credit.toFixed(2)).toBe(result.totalNet.toFixed(2))
    // Both halves of GOSI are owed onward as one liability.
    const gosi = entry.lines.find((l) => l.role === 'GOSI_PAYABLE')!
    expect(gosi.credit.toFixed(2)).toBe(result.totalGosiEmployee.plus(result.totalGosiEmployer).toFixed(2))
  })

  it('refuses the same employee twice in one run', () => {
    expect(() =>
      runPayroll({ periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-31'), employees: [employee(), employee()] }),
    ).toThrow(/appears twice/)
  })

  it('refuses a period that ends before it starts', () => {
    expect(() =>
      runPayroll({ periodStart: new Date('2026-03-31'), periodEnd: new Date('2026-03-01'), employees: [employee()] }),
    ).toThrow(/ends before it starts/)
  })

  describe('WPS export', () => {
    const options = {
      employer: {
        molEstablishmentId: '1234567',
        bankCode: 'RJHI',
        iban: 'SA0380000000608010167519',
        nameEn: 'Nakhla Restaurants',
        nameAr: 'مؤسسة نخلة للمطاعم',
      },
      periodYear: 2026,
      periodMonth: 3,
      paymentDate: new Date('2026-04-01'),
    }

    it('writes an employer record then one record per employee', () => {
      const file = generateWpsFile(result.payslips, options)
      const rows = file.content.trimEnd().split('\r\n')
      expect(rows[0]).toContain('recordType')       // header row
      expect(rows[1]).toContain('EMP')              // employer record
      expect(rows).toHaveLength(2 + result.payslips.length)
      expect(file.recordCount).toBe(5)
    })

    it('control totals in the employer record match the sum of the details', () => {
      const file = generateWpsFile(result.payslips, options)
      const employerRow = file.content.split('\r\n')[1].split(',')
      expect(employerRow[6]).toBe('5')
      expect(employerRow[7]).toBe(result.totalNet.toFixed(2))
      expect(file.totalAmount.toFixed(2)).toBe(result.totalNet.toFixed(2))
    })

    it('names the file after the establishment and the salary month', () => {
      expect(generateWpsFile(result.payslips, options).filename).toBe('WPS_1234567_202603.csv')
    })

    it('quotes a name containing the delimiter rather than breaking the row', () => {
      const tricky = [{ ...result.payslips[0], nameEn: 'Smith, John' }]
      const file = generateWpsFile(tricky, options)
      expect(file.content).toContain('"Smith, John"')
      expect(file.content.trimEnd().split('\r\n')).toHaveLength(3)
    })
  })
})

describe('WPS validation', () => {
  const base = {
    employeeId: 'e1', employeeNumber: 'EMP-001', nameEn: 'Ahmed', nameAr: 'أحمد',
    identityNumber: '1098765432', iban: 'SA0380000000608010167519', branchId: 'b1',
    earnings: [], deductions: [], grossPay: money('1000'), totalDeductions: money('0'),
    netPay: money('1000'), gosiEmployee: money('0'), gosiEmployer: money('0'),
    eosbAccrual: money('0'), employerCost: money('1000'),
  }
  const options = {
    employer: { molEstablishmentId: '1234567', bankCode: 'RJHI', iban: 'SA0380000000608010167519', nameEn: 'X', nameAr: 'س' },
    periodYear: 2026, periodMonth: 3, paymentDate: new Date('2026-04-01'),
  }

  it('validates a Saudi IBAN with the same mod-97 check the bank runs', () => {
    expect(isValidSaudiIban('SA0380000000608010167519')).toBe(true)
    expect(isValidSaudiIban('SA03 8000 0000 6080 1016 7519')).toBe(true)
    expect(isValidSaudiIban('SA0380000000608010167518')).toBe(false) // last digit changed
    expect(isValidSaudiIban('AE070331234567890123456')).toBe(false)  // not Saudi
    expect(isValidSaudiIban('SA038')).toBe(false)
  })

  it('validates Iqama and national ID formats', () => {
    expect(isValidSaudiIdentity('1098765432')).toBe(true)
    expect(isValidSaudiIdentity('2098765432')).toBe(true)
    expect(isValidSaudiIdentity('3098765432')).toBe(false)
    expect(isValidSaudiIdentity('109876543')).toBe(false)
  })

  it('names every employee whose details the bank would reject', () => {
    const problems = validateWps(
      [
        { ...base, iban: 'SA0000000000000000000000' },
        { ...base, employeeNumber: 'EMP-002', nameEn: 'Bad ID', identityNumber: '999' },
        { ...base, employeeNumber: 'EMP-003', nameEn: 'No Arabic', nameAr: '' },
      ],
      options,
    )
    expect(problems.join(' ')).toMatch(/invalid IBAN/)
    expect(problems.join(' ')).toMatch(/invalid Iqama or national ID/)
    expect(problems.join(' ')).toMatch(/no Arabic name/)
  })

  it('catches two employees sharing one bank account', () => {
    const problems = validateWps([base, { ...base, employeeNumber: 'EMP-002', nameEn: 'Other' }], options)
    expect(problems.join(' ')).toMatch(/share the IBAN/)
  })

  it('refuses to generate a file that would be rejected', () => {
    expect(() => generateWpsFile([{ ...base, iban: 'SA1' }], options)).toThrow(WpsValidationError)
  })

  it('warns rather than blocks on an unusual but legal amount', () => {
    const file = generateWpsFile([{ ...base, netPay: money('150000') }], options)
    expect(file.warnings.join(' ')).toMatch(/unusually large/)
  })
})
