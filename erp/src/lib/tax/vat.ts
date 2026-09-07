/**
 * VAT engine.
 *
 * Saudi VAT is 15% standard-rated since 1 July 2020, but the rate is a tenant setting, not a
 * constant, because it has changed once already and zero-rated / exempt supplies coexist on the
 * same invoice.
 */
import { Decimal, type Money, ZERO, allocate, money, sum, toHalala, toStorage } from '../money'

export type VatCategory =
  /** Standard rated — 15%. ZATCA category code S. */
  | 'STANDARD'
  /** Zero rated — exports, qualifying medicines, international transport. Code Z. */
  | 'ZERO_RATED'
  /** Exempt — residential rent, qualifying financial services. Code E. */
  | 'EXEMPT'
  /** Outside the scope of Saudi VAT. Code O. */
  | 'OUT_OF_SCOPE'

/** ZATCA UBL tax category codes (UN/ECE 5305). */
export const VAT_CATEGORY_CODE: Record<VatCategory, string> = {
  STANDARD: 'S',
  ZERO_RATED: 'Z',
  EXEMPT: 'E',
  OUT_OF_SCOPE: 'O',
}

/**
 * Exemption reason codes ZATCA requires whenever the category is not standard-rated.
 * Defaults chosen for the most common SME cases; overridable per line.
 */
export const DEFAULT_EXEMPTION_REASON: Record<VatCategory, { code: string; en: string; ar: string } | null> = {
  STANDARD: null,
  ZERO_RATED: {
    code: 'VATEX-SA-32',
    en: 'Export of goods or services outside the GCC territory',
    ar: 'تصدير السلع أو الخدمات خارج دول مجلس التعاون',
  },
  EXEMPT: {
    code: 'VATEX-SA-29',
    en: 'Financial services mentioned in Article 29 of the VAT Regulations',
    ar: 'الخدمات المالية المذكورة في المادة التاسعة والعشرين من اللائحة التنفيذية',
  },
  OUT_OF_SCOPE: {
    code: 'VATEX-SA-OOS',
    en: 'Supply outside the scope of Saudi VAT',
    ar: 'توريد خارج نطاق ضريبة القيمة المضافة',
  },
}

export const STANDARD_VAT_RATE = new Decimal('0.15')

export interface TaxableLineInput {
  /** Quantity in the line's unit of measure. */
  quantity: Money | string | number
  /** Unit price before VAT and before discount. */
  unitPrice: Money | string | number
  /** Line-level discount as an absolute amount (already computed from any percentage). */
  discount?: Money | string | number
  vatCategory: VatCategory
  /** Rate as a fraction (0.15). Ignored unless the category is STANDARD. */
  vatRate?: Money | string | number
  /** True when `unitPrice` already includes VAT (retail / POS pricing). */
  priceIncludesVat?: boolean
}

export interface ComputedLine {
  /** quantity × unitPrice, before discount. UBL: LineExtensionAmount before allowance. */
  gross: Money
  discount: Money
  /** Net of discount and exclusive of VAT. UBL: cac:InvoiceLine/cbc:LineExtensionAmount. */
  taxableAmount: Money
  vatRate: Money
  vatAmount: Money
  /** taxableAmount + vatAmount. UBL: cac:TaxTotal on the line. */
  lineTotal: Money
  vatCategory: VatCategory
}

export interface VatBreakdownRow {
  category: VatCategory
  categoryCode: string
  rate: Money
  taxableAmount: Money
  vatAmount: Money
  exemptionReasonCode?: string
  exemptionReasonEn?: string
  exemptionReasonAr?: string
}

export interface DocumentTotals {
  lines: ComputedLine[]
  /** Sum of line gross before any discount. */
  grossTotal: Money
  /** Line discounts plus the allocated header discount. */
  discountTotal: Money
  /** Sum of taxable amounts — UBL LegalMonetaryTotal/TaxExclusiveAmount. */
  taxableTotal: Money
  vatTotal: Money
  /** TaxInclusiveAmount, before any rounding adjustment. */
  grandTotal: Money
  /** Difference introduced by rounding the payable to the nearest configured unit. */
  roundingAdjustment: Money
  /** What the customer actually pays. */
  payableTotal: Money
  breakdown: VatBreakdownRow[]
}

/** Rate that actually applies: only standard-rated supplies carry a rate. */
export function effectiveRate(category: VatCategory, rate?: Money | string | number): Money {
  if (category !== 'STANDARD') return ZERO
  return rate === undefined ? STANDARD_VAT_RATE : money(rate)
}

/** Compute one line. Handles VAT-inclusive pricing, which POS always uses. */
export function computeLine(line: TaxableLineInput): ComputedLine {
  const quantity = money(line.quantity)
  const rate = effectiveRate(line.vatCategory, line.vatRate)

  // With inclusive pricing, back out the tax first so discounts apply to the net amount and
  // the printed unit price still matches the shelf label.
  const unitPrice = line.priceIncludesVat
    ? money(line.unitPrice).div(rate.plus(1))
    : money(line.unitPrice)

  const gross = toStorage(quantity.times(unitPrice))
  const rawDiscount = toStorage(line.discount ?? 0)
  const discount = line.priceIncludesVat && rawDiscount.greaterThan(0)
    ? toStorage(rawDiscount.div(rate.plus(1)))
    : rawDiscount

  if (discount.greaterThan(gross.abs())) {
    throw new RangeError('Line discount exceeds the line amount.')
  }

  const taxableAmount = toStorage(gross.minus(discount))
  const vatAmount = toStorage(taxableAmount.times(rate))

  return {
    gross,
    discount,
    taxableAmount,
    vatRate: rate,
    vatAmount,
    lineTotal: toStorage(taxableAmount.plus(vatAmount)),
    vatCategory: line.vatCategory,
  }
}

export interface DocumentInput {
  lines: TaxableLineInput[]
  /** Header discount, spread across lines in proportion to their taxable amount. */
  headerDiscount?: Money | string | number
  /** Round the payable total to this increment. `0` (default) means no rounding. */
  roundTo?: Money | string | number
  exemptionReasons?: Partial<Record<VatCategory, { code: string; en: string; ar: string }>>
}

/**
 * Compute a whole document.
 *
 * A header discount is allocated over the lines rather than posted as its own negative line,
 * because ZATCA requires the tax breakdown to reflect the discounted taxable base per category,
 * and because a discount that only exists at header level makes the VAT return unreconcilable.
 */
export function computeDocument(input: DocumentInput): DocumentTotals {
  const base = input.lines.map(computeLine)
  const headerDiscount = toStorage(input.headerDiscount ?? 0)

  let lines = base
  if (headerDiscount.greaterThan(0)) {
    const taxableAmounts = base.map((l) => l.taxableAmount)
    const totalTaxable = sum(taxableAmounts)
    if (headerDiscount.greaterThan(totalTaxable)) {
      throw new RangeError('Header discount exceeds the document total.')
    }
    const shares = allocate(headerDiscount, taxableAmounts)
    lines = base.map((line, i) => {
      const taxableAmount = toStorage(line.taxableAmount.minus(shares[i]))
      const vatAmount = toStorage(taxableAmount.times(line.vatRate))
      return {
        ...line,
        discount: toStorage(line.discount.plus(shares[i])),
        taxableAmount,
        vatAmount,
        lineTotal: toStorage(taxableAmount.plus(vatAmount)),
      }
    })
  }

  const grossTotal = toStorage(sum(lines.map((l) => l.gross)))
  const discountTotal = toStorage(sum(lines.map((l) => l.discount)))
  const taxableTotal = toHalala(sum(lines.map((l) => l.taxableAmount)))

  // Group by (category, rate) and compute VAT on the *group* total, which is what ZATCA
  // validates against. Summing rounded line VAT can differ by a halala on long invoices.
  const groups = new Map<string, { category: VatCategory; rate: Money; taxable: Money }>()
  for (const line of lines) {
    const key = `${line.vatCategory}:${line.vatRate.toString()}`
    const existing = groups.get(key)
    if (existing) existing.taxable = existing.taxable.plus(line.taxableAmount)
    else groups.set(key, { category: line.vatCategory, rate: line.vatRate, taxable: line.taxableAmount })
  }

  const breakdown: VatBreakdownRow[] = [...groups.values()].map((g) => {
    const taxable = toHalala(g.taxable)
    const reason = input.exemptionReasons?.[g.category] ?? DEFAULT_EXEMPTION_REASON[g.category]
    return {
      category: g.category,
      categoryCode: VAT_CATEGORY_CODE[g.category],
      rate: g.rate,
      taxableAmount: taxable,
      vatAmount: toHalala(taxable.times(g.rate)),
      exemptionReasonCode: reason?.code,
      exemptionReasonEn: reason?.en,
      exemptionReasonAr: reason?.ar,
    }
  })
  breakdown.sort((a, b) => a.categoryCode.localeCompare(b.categoryCode))

  const vatTotal = toHalala(sum(breakdown.map((b) => b.vatAmount)))
  const grandTotal = toHalala(taxableTotal.plus(vatTotal))

  const roundTo = money(input.roundTo ?? 0)
  let payableTotal = grandTotal
  let roundingAdjustment = ZERO
  if (roundTo.greaterThan(0)) {
    payableTotal = toHalala(grandTotal.div(roundTo).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(roundTo))
    roundingAdjustment = toHalala(payableTotal.minus(grandTotal))
  }

  return {
    lines,
    grossTotal,
    discountTotal,
    taxableTotal,
    vatTotal,
    grandTotal,
    roundingAdjustment,
    payableTotal,
    breakdown,
  }
}

// ── VAT return (ZATCA Form 12) ────────────────────────────────────────────────────────────

export interface VatReturnSourceRow {
  direction: 'SALE' | 'PURCHASE'
  category: VatCategory
  taxableAmount: Money | string | number
  vatAmount: Money | string | number
  /** Imports subject to the reverse charge mechanism appear in boxes 8 and 9. */
  isImport?: boolean
  reverseCharge?: boolean
  /** Credit/debit notes carry negative amounts and land in the adjustment boxes. */
  isAdjustment?: boolean
}

/**
 * The boxes of the ZATCA VAT return (Form 12), in the order the portal shows them.
 * Box 15 is the net amount due; a negative figure is a refund claim.
 */
export interface VatReturn {
  box1: { taxable: Money; vat: Money } // Standard rated sales
  box2: { taxable: Money; vat: Money } // Private healthcare / education to citizens
  box3: { taxable: Money; vat: Money } // Zero rated domestic sales
  box4: { taxable: Money; vat: Money } // Exports
  box5: { taxable: Money; vat: Money } // Exempt sales
  box6: { taxable: Money; vat: Money } // Total sales
  box7: { taxable: Money; vat: Money } // Standard rated domestic purchases
  box8: { taxable: Money; vat: Money } // Imports subject to VAT paid at customs
  box9: { taxable: Money; vat: Money } // Imports under the reverse charge mechanism
  box10: { taxable: Money; vat: Money } // Zero rated purchases
  box11: { taxable: Money; vat: Money } // Exempt purchases
  box12: { taxable: Money; vat: Money } // Total purchases
  box13: Money // Total VAT due for the period
  box14: Money // Corrections from previous periods
  box15: Money // Net VAT due (positive = payable, negative = refundable)
}

const emptyBox = () => ({ taxable: ZERO, vat: ZERO })

/**
 * Map source documents to return boxes.
 *
 * Deliberately mechanical: every riyal in the return traces to an invoice line, so the
 * drill-down in the UI can show exactly which documents make up a box. `box2` needs a
 * tenant-level flag for qualifying healthcare/education supplies and stays zero for the
 * ordinary SME — see DECISIONS.md D-021.
 */
export function buildVatReturn(rows: VatReturnSourceRow[], priorPeriodCorrections: Money | string | number = 0): VatReturn {
  const r: VatReturn = {
    box1: emptyBox(), box2: emptyBox(), box3: emptyBox(), box4: emptyBox(), box5: emptyBox(),
    box6: emptyBox(), box7: emptyBox(), box8: emptyBox(), box9: emptyBox(), box10: emptyBox(),
    box11: emptyBox(), box12: emptyBox(), box13: ZERO, box14: ZERO, box15: ZERO,
  }

  const add = (box: { taxable: Money; vat: Money }, taxable: Money, vat: Money) => {
    box.taxable = box.taxable.plus(taxable)
    box.vat = box.vat.plus(vat)
  }

  for (const row of rows) {
    const taxable = money(row.taxableAmount)
    const vat = money(row.vatAmount)

    if (row.direction === 'SALE') {
      if (row.category === 'STANDARD') add(r.box1, taxable, vat)
      else if (row.category === 'ZERO_RATED') add(row.isImport ? r.box4 : r.box3, taxable, vat)
      else if (row.category === 'EXEMPT') add(r.box5, taxable, vat)
      // OUT_OF_SCOPE supplies are not reported on the return at all.
    } else {
      if (row.reverseCharge) add(r.box9, taxable, vat)
      else if (row.isImport) add(r.box8, taxable, vat)
      else if (row.category === 'STANDARD') add(r.box7, taxable, vat)
      else if (row.category === 'ZERO_RATED') add(r.box10, taxable, vat)
      else if (row.category === 'EXEMPT') add(r.box11, taxable, vat)
    }
  }

  add(r.box6, r.box1.taxable.plus(r.box2.taxable).plus(r.box3.taxable).plus(r.box4.taxable).plus(r.box5.taxable),
    r.box1.vat.plus(r.box2.vat).plus(r.box3.vat).plus(r.box4.vat).plus(r.box5.vat))
  add(r.box12,
    r.box7.taxable.plus(r.box8.taxable).plus(r.box9.taxable).plus(r.box10.taxable).plus(r.box11.taxable),
    r.box7.vat.plus(r.box8.vat).plus(r.box9.vat).plus(r.box10.vat).plus(r.box11.vat))

  r.box13 = toHalala(r.box6.vat.minus(r.box12.vat))
  r.box14 = toHalala(priorPeriodCorrections)
  r.box15 = toHalala(r.box13.plus(r.box14))

  for (const key of ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10', 'box11', 'box12'] as const) {
    r[key].taxable = toHalala(r[key].taxable)
    r[key].vat = toHalala(r[key].vat)
  }

  return r
}

/** Box labels for the UI and the printed worksheet. */
export const VAT_RETURN_LABELS: Record<string, { en: string; ar: string }> = {
  box1: { en: 'Standard rated sales', ar: 'المبيعات الخاضعة للنسبة الأساسية' },
  box2: { en: 'Private healthcare / education supplied to citizens', ar: 'الخدمات الصحية والتعليمية الخاصة للمواطنين' },
  box3: { en: 'Zero rated domestic sales', ar: 'المبيعات المحلية الخاضعة لنسبة الصفر' },
  box4: { en: 'Exports', ar: 'الصادرات' },
  box5: { en: 'Exempt sales', ar: 'المبيعات المعفاة' },
  box6: { en: 'Total sales', ar: 'إجمالي المبيعات' },
  box7: { en: 'Standard rated domestic purchases', ar: 'المشتريات المحلية الخاضعة للنسبة الأساسية' },
  box8: { en: 'Imports subject to VAT paid at customs', ar: 'الواردات الخاضعة للضريبة المسددة في الجمارك' },
  box9: { en: 'Imports subject to the reverse charge mechanism', ar: 'الواردات الخاضعة لآلية الاحتساب العكسي' },
  box10: { en: 'Zero rated purchases', ar: 'المشتريات الخاضعة لنسبة الصفر' },
  box11: { en: 'Exempt purchases', ar: 'المشتريات المعفاة' },
  box12: { en: 'Total purchases', ar: 'إجمالي المشتريات' },
  box13: { en: 'Total VAT due for the period', ar: 'إجمالي الضريبة المستحقة عن الفترة' },
  box14: { en: 'Corrections from previous periods', ar: 'تصحيحات من فترات سابقة' },
  box15: { en: 'Net VAT due', ar: 'صافي الضريبة المستحقة' },
}
