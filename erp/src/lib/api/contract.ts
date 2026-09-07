/**
 * The REST contract, as Zod schemas.
 *
 * The route handlers validate against these and `pnpm openapi:generate` emits the OpenAPI
 * document from the same objects, so the published spec cannot drift from what the API
 * actually accepts.
 */
import { z } from 'zod'

export const uuid = z.string().uuid()
export const decimalString = z
  .union([z.string(), z.number()])
  .refine((v) => Number.isFinite(Number(v)), { message: 'Must be a number' })
  .transform((v) => String(v))

export const vatCategory = z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE'])

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    /** Message in the caller's language, ready to show a user. */
    message: z.string(),
    /** Field-level problems, when the request failed validation. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

// ── Auth ──────────────────────────────────────────────────────────────────────────────────

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
})

export const loginResponse = z.object({
  token: z.string(),
  expiresAt: z.string(),
  role: z.string(),
  tenantId: uuid,
})

// ── Parties ───────────────────────────────────────────────────────────────────────────────

export const partyRequest = z.object({
  code: z.string().min(1).max(32),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  isCustomer: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  vatNumber: z.string().regex(/^\d{15}$/).optional(),
  crNumber: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  paymentTermDays: z.number().int().min(0).max(365).default(0),
  creditLimit: decimalString.default('0'),
  address: z
    .object({
      buildingNumber: z.string(),
      street: z.string(),
      district: z.string(),
      city: z.string(),
      postalCode: z.string(),
      additionalNumber: z.string().optional(),
      region: z.string().optional(),
    })
    .optional(),
})

// ── Items ─────────────────────────────────────────────────────────────────────────────────

export const itemRequest = z.object({
  sku: z.string().min(1).max(64),
  barcode: z.string().optional(),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  kind: z.enum(['STOCK', 'SERVICE', 'BUNDLE', 'RAW_MATERIAL', 'FINISHED_GOOD']).default('STOCK'),
  uomCode: z.string().default('EA'),
  sellingPrice: decimalString.default('0'),
  priceIncludesVat: z.boolean().default(false),
  vatCategory: vatCategory.default('STANDARD'),
  reorderLevel: decimalString.default('0'),
})

// ── Invoices ──────────────────────────────────────────────────────────────────────────────

export const invoiceLineRequest = z.object({
  itemId: uuid.optional(),
  descriptionEn: z.string().min(1),
  descriptionAr: z.string().optional(),
  unitCode: z.string().default('PCE'),
  quantity: decimalString,
  unitPrice: decimalString,
  discount: decimalString.optional(),
  vatCategory: vatCategory.optional(),
  warehouseId: uuid.optional(),
})

export const invoiceRequest = z.object({
  branchId: uuid,
  partyId: uuid.optional(),
  kind: z.enum(['STANDARD', 'SIMPLIFIED']).default('STANDARD'),
  date: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  supplyDate: z.coerce.date().optional(),
  currencyCode: z.string().length(3).default('SAR'),
  isExport: z.boolean().default(false),
  headerDiscount: decimalString.optional(),
  paymentMeansCode: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(invoiceLineRequest).min(1),
})

export const creditNoteRequest = z.object({
  date: z.coerce.date().default(() => new Date()),
  reason: z.string().min(1, 'ZATCA requires a reason on every credit note.'),
  lines: z.array(z.object({ invoiceLineId: uuid, quantity: decimalString })).optional(),
  restock: z.boolean().default(true),
})

export const invoiceResponse = z.object({
  id: uuid,
  number: z.string().nullable(),
  uuid: uuid,
  status: z.string(),
  kind: z.string(),
  documentType: z.string(),
  date: z.string(),
  taxableTotal: z.string(),
  vatTotal: z.string(),
  payableTotal: z.string(),
  icv: z.number().nullable(),
  qrBase64: z.string().nullable(),
  zatcaStatus: z.string().nullable(),
})

// ── POS ───────────────────────────────────────────────────────────────────────────────────

export const posSyncRequest = z.object({
  sessionId: uuid,
  warehouseId: uuid,
  sales: z
    .array(
      z.object({
        idempotencyKey: uuid,
        soldAt: z.coerce.date(),
        tableCode: z.string().optional(),
        coverCount: z.number().int().positive().optional(),
        tipAmount: decimalString.optional(),
        tenders: z
          .array(
            z.object({
              method: z.enum(['CASH', 'MADA', 'VISA', 'MASTERCARD', 'APPLE_PAY', 'STC_PAY', 'CREDIT']),
              amount: decimalString,
            }),
          )
          .min(1),
        lines: z
          .array(
            z.object({
              itemId: uuid,
              quantity: decimalString,
              unitPrice: decimalString,
              discount: decimalString.optional(),
              modifiers: z
                .array(z.object({ code: z.string(), nameEn: z.string(), nameAr: z.string(), priceChange: decimalString.optional() }))
                .optional(),
            }),
          )
          .min(1),
      }),
    )
    .max(200),
})

export const posSyncResponse = z.object({
  results: z.array(
    z.object({
      idempotencyKey: uuid,
      status: z.enum(['CREATED', 'DUPLICATE', 'REJECTED']),
      invoiceId: uuid.optional(),
      invoiceNumber: z.string().optional(),
      conflictNote: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
})

// ── Reports ───────────────────────────────────────────────────────────────────────────────

export const reportQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: uuid.optional(),
})

export const trialBalanceResponse = z.object({
  balanced: z.boolean(),
  totalDebit: z.string(),
  totalCredit: z.string(),
  rows: z.array(
    z.object({
      accountCode: z.string(),
      accountNameEn: z.string(),
      accountNameAr: z.string(),
      debit: z.string(),
      credit: z.string(),
    }),
  ),
})

/** Every endpoint, with the permission it requires. Drives both routing and the OpenAPI doc. */
export const ENDPOINTS = [
  { method: 'POST', path: '/api/v1/auth/login', permission: null, summary: 'Sign in and receive a session token', request: loginRequest, response: loginResponse },
  { method: 'POST', path: '/api/v1/auth/logout', permission: null, summary: 'Revoke the current session' },
  { method: 'GET', path: '/api/v1/parties', permission: 'contacts.view', summary: 'List customers and suppliers' },
  { method: 'POST', path: '/api/v1/parties', permission: 'contacts.manage', summary: 'Create a customer or supplier', request: partyRequest },
  { method: 'GET', path: '/api/v1/items', permission: 'inventory.view', summary: 'List items, optionally by barcode' },
  { method: 'POST', path: '/api/v1/items', permission: 'inventory.manage', summary: 'Create an item', request: itemRequest },
  { method: 'GET', path: '/api/v1/invoices', permission: 'sales.view', summary: 'List invoices', response: invoiceResponse },
  { method: 'POST', path: '/api/v1/invoices', permission: 'sales.create', summary: 'Create a draft invoice', request: invoiceRequest, response: invoiceResponse },
  { method: 'GET', path: '/api/v1/invoices/{id}', permission: 'sales.view', summary: 'Read one invoice', response: invoiceResponse },
  { method: 'POST', path: '/api/v1/invoices/{id}/post', permission: 'sales.post', summary: 'Post a draft: number, stock, ledger, ZATCA', response: invoiceResponse },
  { method: 'POST', path: '/api/v1/invoices/{id}/credit-note', permission: 'sales.credit', summary: 'Issue a credit note', request: creditNoteRequest, response: invoiceResponse },
  { method: 'GET', path: '/api/v1/invoices/{id}/xml', permission: 'sales.view', summary: 'Download the signed UBL document' },
  { method: 'POST', path: '/api/v1/pos/sync', permission: 'pos.operate', summary: 'Replay offline point-of-sale sales', request: posSyncRequest, response: posSyncResponse },
  { method: 'GET', path: '/api/v1/reports/trial-balance', permission: 'accounting.view', summary: 'Trial balance', response: trialBalanceResponse },
  { method: 'GET', path: '/api/v1/reports/profit-loss', permission: 'accounting.view', summary: 'Profit and loss' },
  { method: 'GET', path: '/api/v1/reports/balance-sheet', permission: 'accounting.view', summary: 'Balance sheet' },
  { method: 'GET', path: '/api/v1/reports/vat-return', permission: 'accounting.view', summary: 'VAT return with source documents' },
  { method: 'GET', path: '/api/v1/reports/aging', permission: 'contacts.view', summary: 'Receivables or payables aging' },
] as const
