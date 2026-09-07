/**
 * Sales invoices: creation, posting, and credit notes.
 *
 * Posting an invoice is one transaction that does five things and either does all of them or
 * none: allocate a gap-free number, freeze the totals, issue the stock, post the ledger, and
 * assign the ZATCA chain values with a submission queued behind them. If any step fails the
 * number is released and nothing reaches the books.
 */
import { randomUUID } from 'node:crypto'
import {
  type VatCategory,
  computeDocument,
} from '@/lib/tax/vat'
import { buildCreditNotePosting, buildSalesInvoicePosting } from '@/lib/accounting/documents'
import { INITIAL_PIH, nextChainLink } from '@/lib/zatca/hash'
import { money, qtyToDb, toDb } from '@/lib/money'
import { allocateNumber } from './sequence'
import { moveStock } from './inventory'
import { post } from './posting'
import { signInvoice } from './zatca'
import type { Tx } from '../db'

export class InvoiceError extends Error {
  readonly code: string
  readonly messageAr: string
  constructor(code: string, en: string, ar: string) {
    super(en)
    this.name = 'InvoiceError'
    this.code = code
    this.messageAr = ar
  }
}

export interface DraftLineInput {
  itemId?: string
  descriptionEn: string
  descriptionAr?: string
  unitCode?: string
  quantity: string | number
  unitPrice: string | number
  discount?: string | number
  vatCategory?: VatCategory
  /**
   * Whether `unitPrice` includes VAT. Defaults to the item's own pricing convention, which is
   * what a till or an order screen sends. Callers working from already-computed exclusive
   * amounts — a credit note off a posted invoice, for instance — pass `false` explicitly.
   */
  priceIncludesVat?: boolean
  warehouseId?: string
  modifiers?: unknown
}

export interface CreateInvoiceParams {
  tenantId: string
  branchId: string
  partyId?: string
  kind: 'STANDARD' | 'SIMPLIFIED'
  date: Date
  dueDate?: Date
  supplyDate?: Date
  currencyCode?: string
  exchangeRate?: string | number
  isExport?: boolean
  headerDiscount?: string | number
  paymentMeansCode?: string
  notes?: string
  lines: DraftLineInput[]
  userId?: string
}

/** Recompute a draft's totals from its lines. Called on every edit and again at posting. */
export async function computeTotals(tx: Tx, tenantId: string, lines: DraftLineInput[], headerDiscount?: string | number) {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { vatRate: true, roundingIncrement: true, vatRegistered: true },
  })

  const itemIds = lines.map((l) => l.itemId).filter((id): id is string => !!id)
  const items = itemIds.length
    ? await tx.item.findMany({
        where: { id: { in: itemIds }, tenantId },
        select: { id: true, vatCategory: true, priceIncludesVat: true },
      })
    : []
  const itemById = new Map(items.map((i) => [i.id, i]))

  return computeDocument({
    lines: lines.map((line) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined
      const category = (line.vatCategory ?? item?.vatCategory ?? 'STANDARD') as VatCategory
      return {
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        // An unregistered business charges no VAT at all, whatever the item says.
        vatCategory: tenant.vatRegistered ? category : 'OUT_OF_SCOPE',
        vatRate: tenant.vatRate.toString(),
        priceIncludesVat: line.priceIncludesVat ?? item?.priceIncludesVat ?? false,
      }
    }),
    headerDiscount,
    roundTo: tenant.roundingIncrement.toString(),
  })
}

export async function createDraft(tx: Tx, params: CreateInvoiceParams) {
  if (params.lines.length === 0) {
    throw new InvoiceError('NO_LINES', 'An invoice needs at least one line.', 'الفاتورة تحتاج إلى سطر واحد على الأقل.')
  }
  if (params.kind === 'STANDARD' && !params.partyId) {
    throw new InvoiceError(
      'NO_BUYER',
      'A standard tax invoice must name the buyer. Use a simplified invoice for a walk-in customer.',
      'الفاتورة الضريبية يجب أن تحدد المشتري. استخدم فاتورة مبسطة للعميل غير المسجل.',
    )
  }

  for (const [i, line] of params.lines.entries()) {
    if (money(line.quantity).lessThanOrEqualTo(0)) {
      throw new InvoiceError(
        'BAD_QUANTITY',
        `Line ${i + 1} has a quantity of ${line.quantity}. Every line needs a positive quantity.`,
        `السطر ${i + 1} بكمية ${line.quantity}. كل سطر يحتاج كمية موجبة.`,
      )
    }
  }

  const totals = await computeTotals(tx, params.tenantId, params.lines, params.headerDiscount)

  const invoice = await tx.invoice.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      partyId: params.partyId,
      uuid: randomUUID(),
      kind: params.kind,
      documentType: 'TAX_INVOICE',
      status: 'DRAFT',
      date: params.date,
      dueDate: params.dueDate,
      supplyDate: params.supplyDate,
      currencyCode: params.currencyCode ?? 'SAR',
      exchangeRate: (params.exchangeRate ?? 1).toString(),
      isExport: params.isExport ?? false,
      taxableTotal: toDb(totals.taxableTotal),
      discountTotal: toDb(totals.discountTotal),
      vatTotal: toDb(totals.vatTotal),
      roundingAdjustment: toDb(totals.roundingAdjustment),
      payableTotal: toDb(totals.payableTotal),
      paymentMeansCode: params.paymentMeansCode,
      notes: params.notes,
      createdBy: params.userId,
      lines: {
        create: params.lines.map((line, i) => ({
          tenantId: params.tenantId,
          lineNo: i + 1,
          itemId: line.itemId,
          descriptionEn: line.descriptionEn,
          descriptionAr: line.descriptionAr,
          unitCode: line.unitCode ?? 'PCE',
          quantity: qtyToDb(line.quantity),
          // Always stored exclusive of VAT, whatever the item's pricing convention, so the
          // line, the ledger and the UBL document can never disagree.
          unitPrice: toDb(totals.lines[i].gross.div(money(line.quantity))),
          discount: toDb(totals.lines[i].discount),
          vatCategory: totals.lines[i].vatCategory,
          vatRate: totals.lines[i].vatRate.toString(),
          taxableAmount: toDb(totals.lines[i].taxableAmount),
          vatAmount: toDb(totals.lines[i].vatAmount),
          lineTotal: toDb(totals.lines[i].lineTotal),
          warehouseId: line.warehouseId,
          modifiers: line.modifiers as never,
        })),
      },
    },
    include: { lines: true },
  })

  return invoice
}

export interface PostInvoiceResult {
  invoiceId: string
  number: string
  icv: number
  entryId: string
  submissionId: string
  costOfSales: string
}

/**
 * Post a draft invoice.
 *
 * Everything happens in the caller's transaction: the number, the stock, the ledger, the ZATCA
 * chain values and the cryptographic stamp. Signing in particular has to be here rather than in
 * the submission worker — the next invoice's PIH is this invoice's hash, so leaving the chain
 * open between posting and signing would let a second invoice claim a previous hash that does
 * not exist yet.
 */
export async function postInvoice(
  tx: Tx,
  params: { tenantId: string; invoiceId: string; userId?: string; settlement?: 'RECEIVABLE' | 'CASH' | 'BANK' },
): Promise<PostInvoiceResult> {
  const invoice = await tx.invoice.findFirst({
    where: { id: params.invoiceId, tenantId: params.tenantId },
    include: { lines: true, branch: { select: { code: true } } },
  })
  if (!invoice) throw new InvoiceError('NOT_FOUND', 'Invoice not found.', 'الفاتورة غير موجودة.')
  if (invoice.status !== 'DRAFT') {
    throw new InvoiceError(
      'ALREADY_POSTED',
      `Invoice ${invoice.number ?? invoice.id} is already ${invoice.status.toLowerCase()} and cannot be posted again.`,
      `الفاتورة ${invoice.number ?? ''} مرحّلة بالفعل ولا يمكن ترحيلها مرة أخرى.`,
    )
  }

  const kind = invoice.kind === 'SIMPLIFIED' ? 'SIMPLIFIED_INVOICE' : 'INVOICE'
  const number = await allocateNumber(tx, {
    tenantId: params.tenantId,
    branchId: invoice.branchId,
    kind,
    date: invoice.date,
    branchCode: invoice.branch.code,
  })

  // Issue the stock and accumulate the cost of sales.
  let costOfSales = money(0)
  for (const line of invoice.lines) {
    if (!line.itemId || !line.warehouseId) continue
    const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId }, select: { kind: true } })
    if (item.kind === 'SERVICE') continue

    const movement = await moveStock(tx, {
      tenantId: params.tenantId,
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      kind: 'ISSUE',
      date: invoice.date,
      quantity: line.quantity.toString(),
      source: 'SALES_INVOICE',
      sourceId: invoice.id,
      reference: number,
      userId: params.userId,
    })
    costOfSales = costOfSales.plus(money(movement.costAmount))
    await tx.invoiceLine.update({ where: { id: line.id }, data: { unitCost: movement.unitCost } })
  }

  const totals = {
    lines: [],
    grossTotal: money(invoice.taxableTotal.toString()).plus(money(invoice.discountTotal.toString())),
    discountTotal: money(invoice.discountTotal.toString()),
    taxableTotal: money(invoice.taxableTotal.toString()),
    vatTotal: money(invoice.vatTotal.toString()),
    grandTotal: money(invoice.taxableTotal.toString()).plus(money(invoice.vatTotal.toString())),
    roundingAdjustment: money(invoice.roundingAdjustment.toString()),
    payableTotal: money(invoice.payableTotal.toString()),
    breakdown: [],
  }

  const posted = await post(
    tx,
    buildSalesInvoicePosting({
      context: {
        tenantId: params.tenantId,
        branchId: invoice.branchId,
        date: invoice.date,
        reference: number,
        partyId: invoice.partyId ?? undefined,
      },
      totals,
      costOfSales,
      settlement: params.settlement ?? (invoice.kind === 'SIMPLIFIED' ? 'CASH' : 'RECEIVABLE'),
      source: invoice.kind === 'SIMPLIFIED' ? 'POS_SALE' : 'SALES_INVOICE',
    }),
    params.userId,
  )

  // Claim the next link in the ZATCA chain, under a row lock on the certificate.
  const chain = await claimChainLink(tx, params.tenantId, invoice.branchId)

  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      number,
      status: 'POSTED',
      issuedAt: new Date(),
      entryId: posted.entryId,
      costOfSales: toDb(costOfSales),
      icv: chain.icv,
      pih: chain.pih,
      updatedBy: params.userId,
    },
  })

  // Sign now, so the chain link this invoice claimed is closed before any other invoice can
  // claim the next one.
  await signInvoice(tx, params.tenantId, invoice.id)

  const submission = await tx.zatcaSubmission.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: invoice.id,
      mode: invoice.kind === 'SIMPLIFIED' ? 'REPORTING' : 'CLEARANCE',
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  })

  return {
    invoiceId: invoice.id,
    number,
    icv: chain.icv,
    entryId: posted.entryId,
    submissionId: submission.id,
    costOfSales: toDb(costOfSales),
  }
}

/**
 * Take the next ICV and PIH for a branch's EGS unit.
 *
 * The certificate row is locked for the rest of the transaction, so two tills posting at the
 * same instant queue rather than both claiming the same counter value. The counter advances
 * from what is stored; the previous hash comes from the last invoice signed on this device,
 * and signing happens in this same transaction, so the chain is never left half-open.
 */
async function claimChainLink(tx: Tx, tenantId: string, branchId: string): Promise<{ icv: number; pih: string }> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; lastIcv: number; lastInvoiceHash: string | null }>>(
    `SELECT id, "lastIcv", "lastInvoiceHash"
       FROM zatca_certificates
      WHERE "tenantId" = $1::uuid
        AND ("branchId" = $2::uuid OR "branchId" IS NULL)
      ORDER BY "branchId" NULLS LAST
      LIMIT 1
      FOR UPDATE`,
    tenantId,
    branchId,
  )

  if (rows.length === 0) {
    throw new InvoiceError(
      'NO_CSID',
      'This branch has no ZATCA device registered. Complete onboarding in Settings → ZATCA before invoicing.',
      'لا يوجد جهاز مسجل لدى هيئة الزكاة والضريبة لهذا الفرع. أكمل الربط من الإعدادات ← فاتورة قبل إصدار الفواتير.',
    )
  }

  const certificate = rows[0]
  const link = nextChainLink(
    certificate.lastIcv > 0
      ? { icv: certificate.lastIcv, pih: '', invoiceHash: certificate.lastInvoiceHash ?? INITIAL_PIH }
      : null,
  )

  await tx.$executeRawUnsafe(
    `UPDATE zatca_certificates SET "lastIcv" = $1, "updatedAt" = now() WHERE id = $2::uuid`,
    link.icv,
    certificate.id,
  )

  return { icv: link.icv, pih: link.pih }
}

export interface CreditNoteParams {
  tenantId: string
  invoiceId: string
  date: Date
  reason: string
  /** Omit to credit the whole invoice; supply line ids and quantities for a partial. */
  lines?: Array<{ invoiceLineId: string; quantity: string | number }>
  restock?: boolean
  userId?: string
}

/**
 * Issue a credit note against a posted invoice.
 *
 * A credit note reverses the invoice's ledger, VAT and stock effects exactly. It never edits
 * the invoice, which stays in the books as issued — that is what makes the pair auditable.
 */
export async function createCreditNote(tx: Tx, params: CreditNoteParams) {
  const invoice = await tx.invoice.findFirst({
    where: { id: params.invoiceId, tenantId: params.tenantId },
    include: { lines: true, branch: { select: { code: true } } },
  })
  if (!invoice) throw new InvoiceError('NOT_FOUND', 'Invoice not found.', 'الفاتورة غير موجودة.')
  if (invoice.status === 'DRAFT') {
    throw new InvoiceError(
      'NOT_POSTED',
      'A draft invoice has no ledger effect to credit. Delete it instead.',
      'الفاتورة المسودة ليس لها أثر محاسبي. احذفها بدلاً من إصدار إشعار دائن.',
    )
  }
  if (!params.reason?.trim()) {
    throw new InvoiceError(
      'NO_REASON',
      'ZATCA requires a reason on every credit note.',
      'تشترط هيئة الزكاة والضريبة ذكر سبب الإشعار الدائن.',
    )
  }

  // What has already been credited, line by line. An invoice can be credited more than once —
  // three items returned this week and two the next — but never for more than it carried, so
  // the limit is the original quantity less what previous notes already took.
  const alreadyCredited = await creditedQuantities(tx, params.tenantId, invoice.id)

  const requestedLines =
    params.lines ??
    invoice.lines
      .map((line) => ({
        invoiceLineId: line.id,
        quantity: money(line.quantity.toString()).minus(alreadyCredited.get(line.id) ?? money(0)).toString(),
      }))
      .filter((line) => money(line.quantity).greaterThan(0))

  if (requestedLines.length === 0) {
    throw new InvoiceError(
      'FULLY_CREDITED',
      `Invoice ${invoice.number} has already been credited in full.`,
      `الفاتورة ${invoice.number} تم إصدار إشعار دائن بكامل قيمتها من قبل.`,
    )
  }

  const creditedLines = requestedLines.map((requested) => {
    const original = invoice.lines.find((l) => l.id === requested.invoiceLineId)
    if (!original) throw new InvoiceError('BAD_LINE', 'A credited line does not belong to this invoice.', 'أحد أسطر الإشعار لا ينتمي لهذه الفاتورة.')

    const remaining = money(original.quantity.toString()).minus(alreadyCredited.get(original.id) ?? money(0))
    if (money(requested.quantity).greaterThan(remaining)) {
      throw new InvoiceError(
        'OVER_CREDIT',
        `Cannot credit ${requested.quantity} of ${original.descriptionEn}; only ${remaining.toFixed(3)} of the invoiced quantity has not been credited yet.`,
        `لا يمكن إصدار إشعار دائن بكمية ${requested.quantity} من ${original.descriptionEn}؛ المتبقي غير المُشعَر به ${remaining.toFixed(3)} فقط.`,
      )
    }
    if (money(requested.quantity).lessThanOrEqualTo(0)) {
      throw new InvoiceError(
        'BAD_QUANTITY',
        `A credit note line needs a positive quantity; ${original.descriptionEn} was given ${requested.quantity}.`,
        `سطر الإشعار الدائن يحتاج كمية موجبة؛ الصنف ${original.descriptionEn} أُعطي ${requested.quantity}.`,
      )
    }
    return { original, quantity: requested.quantity }
  })

  const totals = await computeTotals(
    tx,
    params.tenantId,
    creditedLines.map(({ original, quantity }) => ({
      itemId: original.itemId ?? undefined,
      descriptionEn: original.descriptionEn,
      descriptionAr: original.descriptionAr ?? undefined,
      quantity,
      unitPrice: original.unitPrice.toString(),
      // Pro-rate the original line's discount over the credited quantity.
      discount: money(original.discount.toString())
        .times(money(quantity))
        .div(money(original.quantity.toString()))
        .toString(),
      vatCategory: original.vatCategory as VatCategory,
      // The stored unit price is already exclusive of VAT; backing it out again would
      // credit the customer less than they were charged.
      priceIncludesVat: false,
    })),
  )

  const number = await allocateNumber(tx, {
    tenantId: params.tenantId,
    branchId: invoice.branchId,
    kind: 'CREDIT_NOTE',
    date: params.date,
    branchCode: invoice.branch.code,
  })

  // Return the goods to stock at the cost they left at, so inventory value is restored exactly.
  let costOfSales = money(0)
  if (params.restock !== false) {
    for (const { original, quantity } of creditedLines) {
      if (!original.itemId || !original.warehouseId) continue
      const item = await tx.item.findUniqueOrThrow({ where: { id: original.itemId }, select: { kind: true } })
      if (item.kind === 'SERVICE') continue

      const movement = await moveStock(tx, {
        tenantId: params.tenantId,
        itemId: original.itemId,
        warehouseId: original.warehouseId,
        kind: 'RECEIPT',
        date: params.date,
        quantity,
        unitCost: original.unitCost.toString(),
        source: 'CREDIT_NOTE',
        sourceId: invoice.id,
        reference: number,
        userId: params.userId,
      })
      costOfSales = costOfSales.plus(money(movement.costAmount))
    }
  }

  const chain = await claimChainLink(tx, params.tenantId, invoice.branchId)

  const creditNote = await tx.invoice.create({
    data: {
      tenantId: params.tenantId,
      branchId: invoice.branchId,
      partyId: invoice.partyId,
      uuid: randomUUID(),
      number,
      kind: invoice.kind,
      documentType: 'CREDIT_NOTE',
      originalInvoiceId: invoice.id,
      correctionReason: params.reason,
      status: 'POSTED',
      date: params.date,
      issuedAt: new Date(),
      currencyCode: invoice.currencyCode,
      exchangeRate: invoice.exchangeRate,
      taxableTotal: toDb(totals.taxableTotal),
      discountTotal: toDb(totals.discountTotal),
      vatTotal: toDb(totals.vatTotal),
      roundingAdjustment: toDb(totals.roundingAdjustment),
      payableTotal: toDb(totals.payableTotal),
      costOfSales: toDb(costOfSales),
      icv: chain.icv,
      pih: chain.pih,
      createdBy: params.userId,
      lines: {
        create: creditedLines.map(({ original, quantity }, i) => ({
          tenantId: params.tenantId,
          lineNo: i + 1,
          itemId: original.itemId,
          descriptionEn: original.descriptionEn,
          descriptionAr: original.descriptionAr,
          unitCode: original.unitCode,
          quantity: qtyToDb(quantity),
          unitPrice: original.unitPrice,
          discount: toDb(totals.lines[i].discount),
          vatCategory: totals.lines[i].vatCategory,
          vatRate: totals.lines[i].vatRate.toString(),
          taxableAmount: toDb(totals.lines[i].taxableAmount),
          vatAmount: toDb(totals.lines[i].vatAmount),
          lineTotal: toDb(totals.lines[i].lineTotal),
          unitCost: original.unitCost,
          warehouseId: original.warehouseId,
        })),
      },
    },
  })

  const posted = await post(
    tx,
    buildCreditNotePosting({
      context: {
        tenantId: params.tenantId,
        branchId: invoice.branchId,
        date: params.date,
        reference: number,
        partyId: invoice.partyId ?? undefined,
      },
      totals,
      costOfSales,
      settlement: invoice.kind === 'SIMPLIFIED' ? 'CASH' : 'RECEIVABLE',
    }),
    params.userId,
  )

  await tx.invoice.update({ where: { id: creditNote.id }, data: { entryId: posted.entryId } })

  await signInvoice(tx, params.tenantId, creditNote.id)

  await tx.zatcaSubmission.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: creditNote.id,
      mode: invoice.kind === 'SIMPLIFIED' ? 'REPORTING' : 'CLEARANCE',
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
  })

  return { creditNoteId: creditNote.id, number, entryId: posted.entryId }
}

/**
 * How much of each invoice line has already been credited.
 *
 * Credit notes carry the original line's description and item, but not its id, so the match is
 * by line number — which is stable because a posted invoice's lines never change.
 */
async function creditedQuantities(tx: Tx, tenantId: string, invoiceId: string) {
  const notes = await tx.invoice.findMany({
    where: { tenantId, originalInvoiceId: invoiceId, status: { not: 'DRAFT' } },
    include: { lines: { select: { itemId: true, descriptionEn: true, quantity: true } } },
  })

  const original = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: { select: { id: true, itemId: true, descriptionEn: true } } },
  })

  const byLine = new Map<string, ReturnType<typeof money>>()
  for (const note of notes) {
    for (const noteLine of note.lines) {
      const match = original.lines.find(
        (line) =>
          (noteLine.itemId && line.itemId === noteLine.itemId) ||
          (!noteLine.itemId && line.descriptionEn === noteLine.descriptionEn),
      )
      if (!match) continue
      byLine.set(match.id, (byLine.get(match.id) ?? money(0)).plus(money(noteLine.quantity.toString())))
    }
  }
  return byLine
}

/** Outstanding balance on an invoice, used by the aging report and the payment screen. */
export async function outstandingAmount(tx: Tx, tenantId: string, invoiceId: string): Promise<string> {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, tenantId },
    select: { payableTotal: true, paidTotal: true },
  })
  const credits = await tx.invoice.aggregate({
    where: { tenantId, originalInvoiceId: invoiceId, status: { not: 'DRAFT' } },
    _sum: { payableTotal: true },
  })
  return toDb(
    money(invoice.payableTotal.toString())
      .minus(money(invoice.paidTotal.toString()))
      .minus(money(credits._sum.payableTotal?.toString() ?? 0)),
  )
}
