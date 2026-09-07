import { describe, expect, it } from 'vitest'
import { buildVatReturn, computeDocument, computeLine, effectiveRate } from '@/lib/tax/vat'
import { money, sum, toAmountString } from '@/lib/money'

describe('computeLine', () => {
  it('applies 15% to a standard-rated line', () => {
    const line = computeLine({ quantity: 2, unitPrice: '50', vatCategory: 'STANDARD' })
    expect(line.taxableAmount.toFixed(2)).toBe('100.00')
    expect(line.vatAmount.toFixed(2)).toBe('15.00')
    expect(line.lineTotal.toFixed(2)).toBe('115.00')
  })

  it('charges nothing on zero-rated, exempt and out-of-scope supplies', () => {
    for (const category of ['ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE'] as const) {
      const line = computeLine({ quantity: 1, unitPrice: '100', vatCategory: category })
      expect(line.vatAmount.toFixed(2)).toBe('0.00')
      expect(line.lineTotal.toFixed(2)).toBe('100.00')
    }
  })

  it('backs VAT out of a shelf price so the printed unit price still matches the label', () => {
    // A 23.00 SAR menu item, VAT inclusive.
    const line = computeLine({ quantity: 1, unitPrice: '23.00', vatCategory: 'STANDARD', priceIncludesVat: true })
    expect(line.taxableAmount.toFixed(2)).toBe('20.00')
    expect(line.vatAmount.toFixed(2)).toBe('3.00')
    expect(line.lineTotal.toFixed(2)).toBe('23.00')
  })

  it('applies a line discount before tax', () => {
    const line = computeLine({ quantity: 1, unitPrice: '100', discount: '10', vatCategory: 'STANDARD' })
    expect(line.taxableAmount.toFixed(2)).toBe('90.00')
    expect(line.vatAmount.toFixed(2)).toBe('13.50')
  })

  it('refuses a discount larger than the line', () => {
    expect(() => computeLine({ quantity: 1, unitPrice: '10', discount: '11', vatCategory: 'STANDARD' })).toThrow(/exceeds/i)
  })

  it('honours a configured rate other than 15%', () => {
    expect(effectiveRate('STANDARD', '0.05').toFixed(2)).toBe('0.05')
    // A non-standard category never carries a rate, whatever is passed in.
    expect(effectiveRate('EXEMPT', '0.15').toFixed(2)).toBe('0.00')
  })
})

describe('computeDocument', () => {
  it('totals a mixed-category invoice and breaks tax down by category', () => {
    const doc = computeDocument({
      lines: [
        { quantity: 2, unitPrice: '50', vatCategory: 'STANDARD' },
        { quantity: 1, unitPrice: '200', vatCategory: 'ZERO_RATED' },
        { quantity: 3, unitPrice: '10', vatCategory: 'STANDARD' },
      ],
    })

    expect(doc.taxableTotal.toFixed(2)).toBe('330.00')
    expect(doc.vatTotal.toFixed(2)).toBe('19.50') // 15% of 130
    expect(doc.grandTotal.toFixed(2)).toBe('349.50')
    expect(doc.breakdown).toHaveLength(2)

    const standard = doc.breakdown.find((b) => b.category === 'STANDARD')!
    expect(standard.taxableAmount.toFixed(2)).toBe('130.00')
    expect(standard.categoryCode).toBe('S')

    const zero = doc.breakdown.find((b) => b.category === 'ZERO_RATED')!
    expect(zero.vatAmount.toFixed(2)).toBe('0.00')
    // ZATCA rejects a non-standard category with no exemption reason.
    expect(zero.exemptionReasonCode).toMatch(/^VATEX-SA-/)
    expect(zero.exemptionReasonAr).toBeTruthy()
  })

  it('spreads a header discount across lines so the VAT base stays reconcilable', () => {
    const doc = computeDocument({
      lines: [
        { quantity: 1, unitPrice: '100', vatCategory: 'STANDARD' },
        { quantity: 1, unitPrice: '300', vatCategory: 'STANDARD' },
      ],
      headerDiscount: '40',
    })

    expect(doc.discountTotal.toFixed(2)).toBe('40.00')
    expect(doc.taxableTotal.toFixed(2)).toBe('360.00')
    expect(doc.vatTotal.toFixed(2)).toBe('54.00')
    // 10 / 30 split in proportion to line value.
    expect(doc.lines[0].taxableAmount.toFixed(2)).toBe('90.00')
    expect(doc.lines[1].taxableAmount.toFixed(2)).toBe('270.00')
  })

  it('never lets a header discount exceed the document', () => {
    expect(() =>
      computeDocument({ lines: [{ quantity: 1, unitPrice: '10', vatCategory: 'STANDARD' }], headerDiscount: '11' }),
    ).toThrow(/exceeds/i)
  })

  it('keeps the tax breakdown equal to the tax total on a long awkward invoice', () => {
    // Thirty lines of 3.33 each: summing rounded line VAT would drift; group-level VAT does not.
    const doc = computeDocument({
      lines: Array.from({ length: 30 }, () => ({ quantity: 1, unitPrice: '3.33', vatCategory: 'STANDARD' as const })),
    })
    const breakdownTotal = sum(doc.breakdown.map((b) => b.vatAmount))
    expect(breakdownTotal.toFixed(2)).toBe(doc.vatTotal.toFixed(2))
    expect(doc.taxableTotal.toFixed(2)).toBe('99.90')
    expect(doc.vatTotal.toFixed(2)).toBe('14.99')
    expect(doc.grandTotal.toFixed(2)).toBe('114.89')
  })

  it('rounds the payable to the nearest 5 halalas when asked, and records the difference', () => {
    const doc = computeDocument({
      lines: [{ quantity: 1, unitPrice: '10.11', vatCategory: 'STANDARD' }],
      roundTo: '0.05',
    })
    expect(doc.grandTotal.toFixed(2)).toBe('11.63')
    expect(doc.payableTotal.toFixed(2)).toBe('11.65')
    expect(doc.roundingAdjustment.toFixed(2)).toBe('0.02')
  })

  it('leaves the payable alone when no rounding is configured', () => {
    const doc = computeDocument({ lines: [{ quantity: 1, unitPrice: '10.11', vatCategory: 'STANDARD' }] })
    expect(doc.payableTotal.equals(doc.grandTotal)).toBe(true)
    expect(doc.roundingAdjustment.isZero()).toBe(true)
  })
})

describe('buildVatReturn', () => {
  it('maps sales and purchases into the Form 12 boxes and nets to the amount due', () => {
    const ret = buildVatReturn([
      { direction: 'SALE', category: 'STANDARD', taxableAmount: '100000', vatAmount: '15000' },
      { direction: 'SALE', category: 'ZERO_RATED', taxableAmount: '20000', vatAmount: '0' },
      { direction: 'SALE', category: 'ZERO_RATED', taxableAmount: '5000', vatAmount: '0', isImport: true },
      { direction: 'SALE', category: 'EXEMPT', taxableAmount: '1000', vatAmount: '0' },
      { direction: 'PURCHASE', category: 'STANDARD', taxableAmount: '40000', vatAmount: '6000' },
      { direction: 'PURCHASE', category: 'STANDARD', taxableAmount: '3000', vatAmount: '450', isImport: true },
      { direction: 'PURCHASE', category: 'STANDARD', taxableAmount: '2000', vatAmount: '300', reverseCharge: true },
    ])

    expect(ret.box1.vat.toFixed(2)).toBe('15000.00')
    expect(ret.box3.taxable.toFixed(2)).toBe('20000.00')
    expect(ret.box4.taxable.toFixed(2)).toBe('5000.00') // exports
    expect(ret.box5.taxable.toFixed(2)).toBe('1000.00')
    expect(ret.box6.taxable.toFixed(2)).toBe('126000.00')
    expect(ret.box7.vat.toFixed(2)).toBe('6000.00')
    expect(ret.box8.vat.toFixed(2)).toBe('450.00')
    expect(ret.box9.vat.toFixed(2)).toBe('300.00')
    expect(ret.box12.vat.toFixed(2)).toBe('6750.00')
    expect(ret.box13.toFixed(2)).toBe('8250.00')
    expect(ret.box15.toFixed(2)).toBe('8250.00')
  })

  it('leaves out-of-scope supplies off the return entirely', () => {
    const ret = buildVatReturn([
      { direction: 'SALE', category: 'OUT_OF_SCOPE', taxableAmount: '9999', vatAmount: '0' },
    ])
    expect(ret.box6.taxable.toFixed(2)).toBe('0.00')
  })

  it('carries prior-period corrections into box 14 and the net due', () => {
    const ret = buildVatReturn(
      [{ direction: 'SALE', category: 'STANDARD', taxableAmount: '1000', vatAmount: '150' }],
      '-50',
    )
    expect(ret.box14.toFixed(2)).toBe('-50.00')
    expect(ret.box15.toFixed(2)).toBe('100.00')
  })

  it('shows a refund position as a negative net', () => {
    const ret = buildVatReturn([
      { direction: 'SALE', category: 'STANDARD', taxableAmount: '1000', vatAmount: '150' },
      { direction: 'PURCHASE', category: 'STANDARD', taxableAmount: '4000', vatAmount: '600' },
    ])
    expect(ret.box15.toFixed(2)).toBe('-450.00')
  })

  it('reconciles to the halala against the source invoices it was built from', () => {
    // The acceptance criterion: the return equals the sum of the documents behind it.
    const invoices = Array.from({ length: 137 }, (_, i) =>
      computeDocument({ lines: [{ quantity: 1, unitPrice: (7.77 + i * 0.13).toFixed(2), vatCategory: 'STANDARD' }] }),
    )
    const rows = invoices.map((doc) => ({
      direction: 'SALE' as const,
      category: 'STANDARD' as const,
      taxableAmount: doc.taxableTotal,
      vatAmount: doc.vatTotal,
    }))
    const ret = buildVatReturn(rows)
    const expectedVat = sum(invoices.map((d) => d.vatTotal))
    const expectedTaxable = sum(invoices.map((d) => d.taxableTotal))

    expect(ret.box1.vat.toFixed(2)).toBe(toAmountString(expectedVat))
    expect(ret.box1.taxable.toFixed(2)).toBe(toAmountString(expectedTaxable))
    expect(ret.box13.toFixed(2)).toBe(toAmountString(money(expectedVat)))
  })
})
