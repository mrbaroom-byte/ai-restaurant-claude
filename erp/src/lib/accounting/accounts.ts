/**
 * Default KSA SME chart of accounts.
 *
 * Numbering follows the convention a Saudi SME accountant expects:
 *   1xxx assets · 2xxx liabilities · 3xxx equity · 4xxx revenue · 5xxx COGS · 6xxx expenses
 *   7xxx other income/expense (incl. FX) · 9xxx zakat & tax
 *
 * Codes marked `system` are referenced by the posting engine by role and cannot be deleted.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

/** Which side increases the account. Drives the trial balance and every report sign. */
export const NORMAL_BALANCE: Record<AccountType, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
}

/**
 * Semantic roles the posting engine resolves instead of hard-coding account codes, so a tenant
 * can renumber their chart without breaking postings.
 */
export type AccountRole =
  | 'CASH_ON_HAND'
  | 'BANK'
  | 'ACCOUNTS_RECEIVABLE'
  | 'INVENTORY'
  | 'INVENTORY_IN_TRANSIT'
  | 'VAT_INPUT'
  | 'PREPAID_EXPENSE'
  | 'ACCOUNTS_PAYABLE'
  | 'VAT_OUTPUT'
  | 'VAT_PAYABLE'
  | 'ACCRUED_SALARIES'
  | 'GOSI_PAYABLE'
  | 'WITHHOLDING_TAX_PAYABLE'
  | 'EOSB_PROVISION'
  | 'ZAKAT_PROVISION'
  | 'CUSTOMER_DEPOSITS'
  | 'SHARE_CAPITAL'
  | 'RETAINED_EARNINGS'
  | 'CURRENT_YEAR_EARNINGS'
  | 'SALES_REVENUE'
  | 'SALES_RETURNS'
  | 'SALES_DISCOUNTS'
  | 'OTHER_INCOME'
  | 'COGS'
  | 'INVENTORY_ADJUSTMENT'
  | 'PRODUCTION_VARIANCE'
  | 'SALARIES_EXPENSE'
  | 'GOSI_EXPENSE'
  | 'EOSB_EXPENSE'
  | 'RENT_EXPENSE'
  | 'UTILITIES_EXPENSE'
  | 'GENERAL_EXPENSE'
  | 'BANK_CHARGES'
  | 'FX_GAIN'
  | 'FX_LOSS'
  | 'ROUNDING'
  | 'SUSPENSE'
  | 'ZAKAT_EXPENSE'

export interface AccountSeed {
  code: string
  nameEn: string
  nameAr: string
  type: AccountType
  parent?: string
  /** Postable accounts accept journal lines; group accounts only aggregate children. */
  postable: boolean
  role?: AccountRole
}

export const DEFAULT_CHART_OF_ACCOUNTS: AccountSeed[] = [
  // ── 1000 Assets ────────────────────────────────────────────────────────────────────────
  { code: '1000', nameEn: 'Assets', nameAr: 'الأصول', type: 'ASSET', postable: false },
  { code: '1100', nameEn: 'Current Assets', nameAr: 'الأصول المتداولة', type: 'ASSET', parent: '1000', postable: false },
  { code: '1110', nameEn: 'Cash on Hand', nameAr: 'النقد في الصندوق', type: 'ASSET', parent: '1100', postable: true, role: 'CASH_ON_HAND' },
  { code: '1120', nameEn: 'Bank Accounts', nameAr: 'البنوك', type: 'ASSET', parent: '1100', postable: true, role: 'BANK' },
  { code: '1130', nameEn: 'Accounts Receivable', nameAr: 'الذمم المدينة', type: 'ASSET', parent: '1100', postable: true, role: 'ACCOUNTS_RECEIVABLE' },
  { code: '1135', nameEn: 'Allowance for Doubtful Debts', nameAr: 'مخصص الديون المشكوك في تحصيلها', type: 'ASSET', parent: '1100', postable: true },
  { code: '1140', nameEn: 'Inventory', nameAr: 'المخزون', type: 'ASSET', parent: '1100', postable: true, role: 'INVENTORY' },
  { code: '1145', nameEn: 'Goods in Transit', nameAr: 'بضاعة في الطريق', type: 'ASSET', parent: '1100', postable: true, role: 'INVENTORY_IN_TRANSIT' },
  { code: '1150', nameEn: 'VAT Input (Recoverable)', nameAr: 'ضريبة القيمة المضافة - المدخلات', type: 'ASSET', parent: '1100', postable: true, role: 'VAT_INPUT' },
  { code: '1160', nameEn: 'Prepaid Expenses', nameAr: 'مصروفات مدفوعة مقدماً', type: 'ASSET', parent: '1100', postable: true, role: 'PREPAID_EXPENSE' },
  { code: '1170', nameEn: 'Employee Advances', nameAr: 'سلف الموظفين', type: 'ASSET', parent: '1100', postable: true },
  { code: '1180', nameEn: 'Supplier Advances', nameAr: 'دفعات مقدمة للموردين', type: 'ASSET', parent: '1100', postable: true },
  { code: '1200', nameEn: 'Non-Current Assets', nameAr: 'الأصول غير المتداولة', type: 'ASSET', parent: '1000', postable: false },
  { code: '1210', nameEn: 'Furniture and Fixtures', nameAr: 'أثاث وتجهيزات', type: 'ASSET', parent: '1200', postable: true },
  { code: '1220', nameEn: 'Equipment', nameAr: 'معدات', type: 'ASSET', parent: '1200', postable: true },
  { code: '1230', nameEn: 'Vehicles', nameAr: 'سيارات', type: 'ASSET', parent: '1200', postable: true },
  { code: '1240', nameEn: 'Leasehold Improvements', nameAr: 'تحسينات على المأجور', type: 'ASSET', parent: '1200', postable: true },
  { code: '1290', nameEn: 'Accumulated Depreciation', nameAr: 'مجمع الإهلاك', type: 'ASSET', parent: '1200', postable: true },

  // ── 2000 Liabilities ───────────────────────────────────────────────────────────────────
  { code: '2000', nameEn: 'Liabilities', nameAr: 'الالتزامات', type: 'LIABILITY', postable: false },
  { code: '2100', nameEn: 'Current Liabilities', nameAr: 'الالتزامات المتداولة', type: 'LIABILITY', parent: '2000', postable: false },
  { code: '2110', nameEn: 'Accounts Payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', parent: '2100', postable: true, role: 'ACCOUNTS_PAYABLE' },
  { code: '2120', nameEn: 'VAT Output (Payable)', nameAr: 'ضريبة القيمة المضافة - المخرجات', type: 'LIABILITY', parent: '2100', postable: true, role: 'VAT_OUTPUT' },
  { code: '2125', nameEn: 'VAT Payable to ZATCA', nameAr: 'ضريبة القيمة المضافة المستحقة للهيئة', type: 'LIABILITY', parent: '2100', postable: true, role: 'VAT_PAYABLE' },
  { code: '2130', nameEn: 'Accrued Salaries', nameAr: 'رواتب مستحقة', type: 'LIABILITY', parent: '2100', postable: true, role: 'ACCRUED_SALARIES' },
  { code: '2140', nameEn: 'GOSI Payable', nameAr: 'التأمينات الاجتماعية المستحقة', type: 'LIABILITY', parent: '2100', postable: true, role: 'GOSI_PAYABLE' },
  { code: '2150', nameEn: 'Withholding Tax Payable', nameAr: 'ضريبة الاستقطاع المستحقة', type: 'LIABILITY', parent: '2100', postable: true, role: 'WITHHOLDING_TAX_PAYABLE' },
  { code: '2160', nameEn: 'Customer Deposits', nameAr: 'دفعات مقدمة من العملاء', type: 'LIABILITY', parent: '2100', postable: true, role: 'CUSTOMER_DEPOSITS' },
  { code: '2170', nameEn: 'Accrued Expenses', nameAr: 'مصروفات مستحقة', type: 'LIABILITY', parent: '2100', postable: true },
  { code: '2200', nameEn: 'Non-Current Liabilities', nameAr: 'الالتزامات غير المتداولة', type: 'LIABILITY', parent: '2000', postable: false },
  { code: '2210', nameEn: 'End of Service Benefits Provision', nameAr: 'مخصص مكافأة نهاية الخدمة', type: 'LIABILITY', parent: '2200', postable: true, role: 'EOSB_PROVISION' },
  { code: '2220', nameEn: 'Long Term Loans', nameAr: 'قروض طويلة الأجل', type: 'LIABILITY', parent: '2200', postable: true },
  { code: '2230', nameEn: 'Zakat Provision', nameAr: 'مخصص الزكاة', type: 'LIABILITY', parent: '2200', postable: true, role: 'ZAKAT_PROVISION' },

  // ── 3000 Equity ────────────────────────────────────────────────────────────────────────
  { code: '3000', nameEn: 'Equity', nameAr: 'حقوق الملكية', type: 'EQUITY', postable: false },
  { code: '3100', nameEn: 'Share Capital', nameAr: 'رأس المال', type: 'EQUITY', parent: '3000', postable: true, role: 'SHARE_CAPITAL' },
  { code: '3200', nameEn: "Partners' Current Account", nameAr: 'الحساب الجاري للشركاء', type: 'EQUITY', parent: '3000', postable: true },
  { code: '3300', nameEn: 'Statutory Reserve', nameAr: 'الاحتياطي النظامي', type: 'EQUITY', parent: '3000', postable: true },
  { code: '3400', nameEn: 'Retained Earnings', nameAr: 'الأرباح المبقاة', type: 'EQUITY', parent: '3000', postable: true, role: 'RETAINED_EARNINGS' },
  { code: '3500', nameEn: 'Current Year Earnings', nameAr: 'أرباح العام الحالي', type: 'EQUITY', parent: '3000', postable: true, role: 'CURRENT_YEAR_EARNINGS' },
  { code: '3600', nameEn: 'Drawings', nameAr: 'المسحوبات الشخصية', type: 'EQUITY', parent: '3000', postable: true },

  // ── 4000 Revenue ───────────────────────────────────────────────────────────────────────
  { code: '4000', nameEn: 'Revenue', nameAr: 'الإيرادات', type: 'REVENUE', postable: false },
  { code: '4100', nameEn: 'Sales Revenue', nameAr: 'إيرادات المبيعات', type: 'REVENUE', parent: '4000', postable: true, role: 'SALES_REVENUE' },
  { code: '4200', nameEn: 'Service Revenue', nameAr: 'إيرادات الخدمات', type: 'REVENUE', parent: '4000', postable: true },
  { code: '4300', nameEn: 'Sales Returns and Allowances', nameAr: 'مردودات المبيعات', type: 'REVENUE', parent: '4000', postable: true, role: 'SALES_RETURNS' },
  { code: '4400', nameEn: 'Sales Discounts', nameAr: 'خصم المبيعات', type: 'REVENUE', parent: '4000', postable: true, role: 'SALES_DISCOUNTS' },

  // ── 5000 Cost of sales ─────────────────────────────────────────────────────────────────
  { code: '5000', nameEn: 'Cost of Goods Sold', nameAr: 'تكلفة المبيعات', type: 'EXPENSE', postable: false },
  { code: '5100', nameEn: 'Cost of Goods Sold', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE', parent: '5000', postable: true, role: 'COGS' },
  { code: '5200', nameEn: 'Inventory Adjustment', nameAr: 'تسويات المخزون', type: 'EXPENSE', parent: '5000', postable: true, role: 'INVENTORY_ADJUSTMENT' },
  { code: '5300', nameEn: 'Production Variance', nameAr: 'انحرافات الإنتاج', type: 'EXPENSE', parent: '5000', postable: true, role: 'PRODUCTION_VARIANCE' },
  { code: '5400', nameEn: 'Freight In', nameAr: 'مصاريف نقل المشتريات', type: 'EXPENSE', parent: '5000', postable: true },

  // ── 6000 Operating expenses ────────────────────────────────────────────────────────────
  { code: '6000', nameEn: 'Operating Expenses', nameAr: 'المصروفات التشغيلية', type: 'EXPENSE', postable: false },
  { code: '6100', nameEn: 'Salaries and Wages', nameAr: 'الرواتب والأجور', type: 'EXPENSE', parent: '6000', postable: true, role: 'SALARIES_EXPENSE' },
  { code: '6110', nameEn: 'GOSI Employer Contribution', nameAr: 'حصة المنشأة في التأمينات', type: 'EXPENSE', parent: '6000', postable: true, role: 'GOSI_EXPENSE' },
  { code: '6120', nameEn: 'End of Service Benefits Expense', nameAr: 'مصروف مكافأة نهاية الخدمة', type: 'EXPENSE', parent: '6000', postable: true, role: 'EOSB_EXPENSE' },
  { code: '6130', nameEn: 'Employee Benefits', nameAr: 'مزايا الموظفين', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6200', nameEn: 'Rent', nameAr: 'الإيجارات', type: 'EXPENSE', parent: '6000', postable: true, role: 'RENT_EXPENSE' },
  { code: '6210', nameEn: 'Utilities', nameAr: 'الكهرباء والمياه', type: 'EXPENSE', parent: '6000', postable: true, role: 'UTILITIES_EXPENSE' },
  { code: '6220', nameEn: 'Telephone and Internet', nameAr: 'الهاتف والإنترنت', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6230', nameEn: 'Repairs and Maintenance', nameAr: 'الصيانة والإصلاح', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6240', nameEn: 'Marketing and Advertising', nameAr: 'التسويق والإعلان', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6250', nameEn: 'Government Fees and Licences', nameAr: 'الرسوم الحكومية والتراخيص', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6260', nameEn: 'Professional Fees', nameAr: 'أتعاب مهنية', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6270', nameEn: 'Delivery and Commission', nameAr: 'التوصيل والعمولات', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6280', nameEn: 'Depreciation', nameAr: 'الإهلاك', type: 'EXPENSE', parent: '6000', postable: true },
  { code: '6290', nameEn: 'Bank Charges', nameAr: 'مصاريف بنكية', type: 'EXPENSE', parent: '6000', postable: true, role: 'BANK_CHARGES' },
  { code: '6900', nameEn: 'General and Administrative', nameAr: 'مصروفات عمومية وإدارية', type: 'EXPENSE', parent: '6000', postable: true, role: 'GENERAL_EXPENSE' },

  // ── 7000 Other ─────────────────────────────────────────────────────────────────────────
  { code: '7000', nameEn: 'Other Income and Expense', nameAr: 'إيرادات ومصروفات أخرى', type: 'REVENUE', postable: false },
  { code: '7010', nameEn: 'Other Income', nameAr: 'إيرادات أخرى', type: 'REVENUE', parent: '7000', postable: true, role: 'OTHER_INCOME' },
  { code: '7100', nameEn: 'Foreign Exchange Gain', nameAr: 'أرباح فروق العملة', type: 'REVENUE', parent: '7000', postable: true, role: 'FX_GAIN' },
  { code: '7200', nameEn: 'Foreign Exchange Loss', nameAr: 'خسائر فروق العملة', type: 'EXPENSE', parent: '7000', postable: true, role: 'FX_LOSS' },
  { code: '7300', nameEn: 'Rounding Difference', nameAr: 'فروق التقريب', type: 'EXPENSE', parent: '7000', postable: true, role: 'ROUNDING' },
  { code: '7900', nameEn: 'Suspense', nameAr: 'حساب وسيط', type: 'ASSET', parent: '7000', postable: true, role: 'SUSPENSE' },

  // ── 9000 Zakat & tax ───────────────────────────────────────────────────────────────────
  { code: '9000', nameEn: 'Zakat and Tax', nameAr: 'الزكاة والضريبة', type: 'EXPENSE', postable: false },
  { code: '9100', nameEn: 'Zakat Expense', nameAr: 'مصروف الزكاة', type: 'EXPENSE', parent: '9000', postable: true, role: 'ZAKAT_EXPENSE' },
]

/** Roles the posting engine cannot operate without. Seeding verifies all of them exist. */
export const REQUIRED_ROLES: AccountRole[] = [
  'CASH_ON_HAND', 'BANK', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VAT_INPUT',
  'ACCOUNTS_PAYABLE', 'VAT_OUTPUT', 'RETAINED_EARNINGS', 'CURRENT_YEAR_EARNINGS',
  'SALES_REVENUE', 'SALES_RETURNS', 'COGS', 'INVENTORY_ADJUSTMENT',
  'SALARIES_EXPENSE', 'GOSI_EXPENSE', 'GOSI_PAYABLE', 'ACCRUED_SALARIES',
  'EOSB_EXPENSE', 'EOSB_PROVISION', 'FX_GAIN', 'FX_LOSS', 'ROUNDING',
]

export function accountByRole(role: AccountRole): AccountSeed {
  const found = DEFAULT_CHART_OF_ACCOUNTS.find((a) => a.role === role)
  if (!found) throw new Error(`Default chart of accounts has no account for role ${role}`)
  return found
}

/** A minimal resolver for tests and seeds: role → code, using the default chart. */
export function defaultRoleMap(): Record<AccountRole, string> {
  const map = {} as Record<AccountRole, string>
  for (const a of DEFAULT_CHART_OF_ACCOUNTS) if (a.role) map[a.role] = a.code
  return map
}
