/**
 * Demo seed.
 *
 * Creates one tenant — a two-branch Jeddah restaurant — with the default chart of accounts,
 * a user for every role, a menu with recipes, suppliers and customers, employees, and a few
 * days of real trading so that every report has something in it on first login.
 *
 * This is the *only* place fake data is created. Nothing in `src/` invents a record.
 *
 * Run with: pnpm db:seed
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CHART_OF_ACCOUNTS, REQUIRED_ROLES } from '../src/lib/accounting/accounts'
import { DEFAULT_SEQUENCES } from '../src/lib/sequence'
import { hashPassword } from '../src/lib/crypto/password'
import { encrypt } from '../src/lib/crypto/vault'
import { generateStampKeyPair, buildCsr, stripCertificateArmour } from '../src/lib/zatca/csr'
import { computeDocument } from '../src/lib/tax/vat'
import { buildSupplierBillPosting, buildPaymentPosting } from '../src/lib/accounting/documents'
import { toDb, money } from '../src/lib/money'

const prisma = new PrismaClient()

const TENANT_ID = '0195c000-0000-7000-8000-000000000001'
const VAT_NUMBER = '300000000000003'

/** Demo passwords are printed at the end; they are for a local demo only. */
const DEMO_PASSWORD = 'NakhlaDemo2026!'

function log(step: string) {
  process.stdout.write(`  ${step}\n`)
}

/**
 * A throwaway self-signed certificate so the demo tenant can sign invoices offline.
 * A real tenant replaces this by completing onboarding in Settings → ZATCA; the row is
 * marked SANDBOX so the UI shows the "not yet onboarded" banner.
 */
function demoCertificate(privateKeyPem: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nakhla-seed-'))
  try {
    const keyPath = join(dir, 'key.pem')
    const certPath = join(dir, 'cert.pem')
    writeFileSync(keyPath, privateKeyPem)
    execFileSync('openssl', [
      'req', '-new', '-x509', '-key', keyPath, '-sha256', '-days', '365', '-out', certPath,
      '-subj', '/C=SA/O=Nakhla Demo/OU=Sandbox/CN=TSTZATCA-Code-Signing',
    ])
    return readFileSync(certPath, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Empty every table so the seed is repeatable.
 *
 * A cascading delete of the tenant will not do: several foreign keys are deliberately
 * RESTRICT — a bank account must not disappear because somebody removed an account — which is
 * correct for production and inconvenient for a seed. Truncating is honest about what this is.
 */
async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  log(`reset ${tables.length} tables`)
}

async function main() {
  process.stdout.write('\nSeeding the Nakhla demo tenant\n\n')

  await resetDatabase()

  // ── Tenant, addresses, branches ────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      legalNameEn: 'Nakhla Restaurants Establishment',
      legalNameAr: 'مؤسسة نخلة للمطاعم',
      tradeNameEn: 'Nakhla',
      tradeNameAr: 'نخلة',
      crNumber: '4030123456',
      vatNumber: VAT_NUMBER,
      vatRegistered: true,
      vatRate: '0.15',
      posEnabled: true,
      molEstablishmentId: '1234567',
      roundingIncrement: '0',
      defaultLocale: 'ar',
    },
  })
  log('tenant')

  const jeddahAddress = await prisma.address.create({
    data: {
      tenantId: tenant.id,
      buildingNumber: '3245',
      street: 'طريق الأمير سلطان',
      district: 'الروضة',
      city: 'جدة',
      postalCode: '23434',
      additionalNumber: '7712',
      region: 'منطقة مكة المكرمة',
    },
  })
  const riyadhAddress = await prisma.address.create({
    data: {
      tenantId: tenant.id,
      buildingNumber: '8891',
      street: 'طريق الملك فهد',
      district: 'العليا',
      city: 'الرياض',
      postalCode: '12212',
      additionalNumber: '3320',
      region: 'منطقة الرياض',
    },
  })

  const jeddah = await prisma.branch.create({
    data: { tenantId: tenant.id, code: 'JED', nameEn: 'Jeddah — Al Rawdah', nameAr: 'جدة — الروضة', addressId: jeddahAddress.id, phone: '+966126000000' },
  })
  const riyadh = await prisma.branch.create({
    data: { tenantId: tenant.id, code: 'RUH', nameEn: 'Riyadh — Al Olaya', nameAr: 'الرياض — العليا', addressId: riyadhAddress.id, phone: '+966114000000' },
  })
  log('2 branches')

  const jeddahStore = await prisma.warehouse.create({
    data: { tenantId: tenant.id, branchId: jeddah.id, code: 'JED-MAIN', nameEn: 'Jeddah main store', nameAr: 'مستودع جدة الرئيسي' },
  })
  const riyadhStore = await prisma.warehouse.create({
    data: { tenantId: tenant.id, branchId: riyadh.id, code: 'RUH-MAIN', nameEn: 'Riyadh main store', nameAr: 'مستودع الرياض الرئيسي' },
  })
  log('2 warehouses')

  // ── Chart of accounts ──────────────────────────────────────────────────────────────────
  const accountIdByCode = new Map<string, string>()
  // Parents first, so a child always finds its parent.
  for (const seed of [...DEFAULT_CHART_OF_ACCOUNTS].sort((a, b) => a.code.localeCompare(b.code))) {
    const account = await prisma.account.create({
      data: {
        tenantId: tenant.id,
        code: seed.code,
        nameEn: seed.nameEn,
        nameAr: seed.nameAr,
        type: seed.type,
        parentId: seed.parent ? accountIdByCode.get(seed.parent) : undefined,
        postable: seed.postable,
        role: seed.role,
      },
    })
    accountIdByCode.set(seed.code, account.id)
  }
  for (const role of REQUIRED_ROLES) {
    const exists = await prisma.account.findFirst({ where: { tenantId: tenant.id, role } })
    if (!exists) throw new Error(`Seed produced a chart of accounts with no account for the role ${role}`)
  }
  log(`${accountIdByCode.size} accounts, all required roles mapped`)

  // ── Fiscal periods ─────────────────────────────────────────────────────────────────────
  const year = new Date().getUTCFullYear()
  for (let m = 0; m < 12; m += 1) {
    await prisma.fiscalPeriod.create({
      data: {
        tenantId: tenant.id,
        name: `${year}-${String(m + 1).padStart(2, '0')}`,
        startsOn: new Date(Date.UTC(year, m, 1)),
        endsOn: new Date(Date.UTC(year, m + 1, 0)),
        status: 'OPEN',
      },
    })
  }
  log(`12 fiscal periods for ${year}`)

  // ── Number sequences: per branch for documents, tenant-wide for journals ───────────────
  for (const branch of [jeddah, riyadh]) {
    for (const seq of DEFAULT_SEQUENCES) {
      if (seq.kind === 'JOURNAL_ENTRY') continue
      await prisma.sequence.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, kind: seq.kind, prefix: seq.prefix,
          resetYearly: seq.resetYearly, padding: seq.padding, year, gapFree: seq.gapFree,
        },
      })
    }
    // The posting service allocates a journal number per branch.
    await prisma.sequence.create({
      data: {
        tenantId: tenant.id, branchId: branch.id, kind: 'JOURNAL_ENTRY', prefix: `JV${branch.code}`,
        resetYearly: true, padding: 6, year, gapFree: true,
      },
    })
  }
  log('number sequences for both branches')

  // ── Users, one per role ────────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const users = [
    { email: 'owner@nakhla.sa', nameEn: 'Faisal Al Nakhla', nameAr: 'فيصل النخلة', role: 'OWNER', branchIds: [] as string[] },
    { email: 'manager.jed@nakhla.sa', nameEn: 'Omar Al Ghamdi', nameAr: 'عمر الغامدي', role: 'MANAGER', branchIds: [jeddah.id] },
    { email: 'accountant@nakhla.sa', nameEn: 'Huda Al Zahrani', nameAr: 'هدى الزهراني', role: 'ACCOUNTANT', branchIds: [] },
    { email: 'sales@nakhla.sa', nameEn: 'Khalid Al Harbi', nameAr: 'خالد الحربي', role: 'SALES', branchIds: [jeddah.id] },
    { email: 'store@nakhla.sa', nameEn: 'Ravi Kumar', nameAr: 'رافي كومار', role: 'STOREKEEPER', branchIds: [jeddah.id] },
    { email: 'cashier@nakhla.sa', nameEn: 'Sara Al Otaibi', nameAr: 'سارة العتيبي', role: 'CASHIER', branchIds: [jeddah.id] },
    { email: 'hr@nakhla.sa', nameEn: 'Noura Al Qahtani', nameAr: 'نورة القحطاني', role: 'HR', branchIds: [] },
    { email: 'auditor@nakhla.sa', nameEn: 'External Auditor', nameAr: 'المراجع الخارجي', role: 'AUDITOR', branchIds: [] },
  ]
  for (const user of users) {
    await prisma.user.create({
      data: { tenantId: tenant.id, ...user, passwordHash, status: 'ACTIVE', locale: 'ar' },
    })
  }
  log(`${users.length} users`)

  // ── Units, categories, items ───────────────────────────────────────────────────────────
  const uoms = await Promise.all([
    prisma.unitOfMeasure.create({ data: { tenantId: tenant.id, code: 'EA', nameEn: 'Each', nameAr: 'حبة', uneceCode: 'PCE' } }),
    prisma.unitOfMeasure.create({ data: { tenantId: tenant.id, code: 'KG', nameEn: 'Kilogram', nameAr: 'كيلوجرام', uneceCode: 'KGM' } }),
    prisma.unitOfMeasure.create({ data: { tenantId: tenant.id, code: 'L', nameEn: 'Litre', nameAr: 'لتر', uneceCode: 'LTR' } }),
  ])
  const [each, kilo, litre] = uoms

  const categories = await Promise.all([
    prisma.itemCategory.create({ data: { tenantId: tenant.id, nameEn: 'Main courses', nameAr: 'الأطباق الرئيسية' } }),
    prisma.itemCategory.create({ data: { tenantId: tenant.id, nameEn: 'Beverages', nameAr: 'المشروبات' } }),
    prisma.itemCategory.create({ data: { tenantId: tenant.id, nameEn: 'Raw materials', nameAr: 'المواد الخام' } }),
  ])
  const [mains, drinks, rawMaterials] = categories

  const rawItems = [
    { sku: 'RAW-CHICKEN', nameEn: 'Fresh chicken', nameAr: 'دجاج طازج', uomId: kilo.id, cost: '14.50' },
    { sku: 'RAW-RICE', nameEn: 'Basmati rice', nameAr: 'أرز بسمتي', uomId: kilo.id, cost: '9.20' },
    { sku: 'RAW-SPICE', nameEn: 'Mandi spice mix', nameAr: 'بهارات المندي', uomId: kilo.id, cost: '38.00' },
    { sku: 'RAW-ORANGE', nameEn: 'Oranges', nameAr: 'برتقال', uomId: kilo.id, cost: '6.75' },
    { sku: 'RAW-OIL', nameEn: 'Cooking oil', nameAr: 'زيت طهي', uomId: litre.id, cost: '11.00' },
  ]
  const rawByS = new Map<string, string>()
  for (const raw of rawItems) {
    const item = await prisma.item.create({
      data: {
        tenantId: tenant.id, sku: raw.sku, nameEn: raw.nameEn, nameAr: raw.nameAr,
        kind: 'RAW_MATERIAL', categoryId: rawMaterials.id, uomId: raw.uomId,
        sellingPrice: '0', lastCost: raw.cost, reorderLevel: '20', vatCategory: 'STANDARD',
      },
    })
    rawByS.set(raw.sku, item.id)
  }

  const menuItems = [
    { sku: 'MENU-MANDI-C', barcode: '6281000000017', nameEn: 'Chicken Mandi', nameAr: 'مندي دجاج', categoryId: mains.id, price: '45.00' },
    { sku: 'MENU-KABSA-L', barcode: '6281000000024', nameEn: 'Lamb Kabsa', nameAr: 'كبسة لحم', categoryId: mains.id, price: '68.00' },
    { sku: 'MENU-JUICE-O', barcode: '6281000000031', nameEn: 'Fresh orange juice', nameAr: 'عصير برتقال طازج', categoryId: drinks.id, price: '18.00' },
    { sku: 'MENU-WATER', barcode: '6281000000048', nameEn: 'Mineral water 600ml', nameAr: 'مياه معدنية ٦٠٠ مل', categoryId: drinks.id, price: '3.00' },
  ]
  const menuById = new Map<string, string>()
  for (const menu of menuItems) {
    const item = await prisma.item.create({
      data: {
        tenantId: tenant.id, sku: menu.sku, barcode: menu.barcode, nameEn: menu.nameEn, nameAr: menu.nameAr,
        kind: 'FINISHED_GOOD', categoryId: menu.categoryId, uomId: each.id,
        sellingPrice: menu.price, priceIncludesVat: true, vatCategory: 'STANDARD', reorderLevel: '0',
      },
    })
    menuById.set(menu.sku, item.id)
  }

  await prisma.item.create({
    data: {
      tenantId: tenant.id, sku: 'SVC-CATERING', nameEn: 'Event catering service', nameAr: 'خدمة تقديم الطعام للمناسبات',
      kind: 'SERVICE', uomId: each.id, sellingPrice: '2500.00', vatCategory: 'STANDARD',
    },
  })
  log(`${rawItems.length + menuItems.length + 1} items`)

  // ── A recipe, so production and food cost work out of the box ──────────────────────────
  const mandiBom = await prisma.billOfMaterials.create({
    data: {
      tenantId: tenant.id, itemId: menuById.get('MENU-MANDI-C')!,
      nameEn: 'Chicken Mandi recipe', nameAr: 'وصفة مندي الدجاج', outputQuantity: '1',
      lines: {
        create: [
          { tenantId: tenant.id, itemId: rawByS.get('RAW-CHICKEN')!, quantityPer: '0.350', wastageRate: '0.08' },
          { tenantId: tenant.id, itemId: rawByS.get('RAW-RICE')!, quantityPer: '0.250', wastageRate: '0.02' },
          { tenantId: tenant.id, itemId: rawByS.get('RAW-SPICE')!, quantityPer: '0.015' },
          { tenantId: tenant.id, itemId: rawByS.get('RAW-OIL')!, quantityPer: '0.030' },
        ],
      },
    },
  })
  log('1 bill of materials (chicken mandi)')

  // ── Price lists ────────────────────────────────────────────────────────────────────────
  const retailList = await prisma.priceList.create({
    data: { tenantId: tenant.id, nameEn: 'Menu prices', nameAr: 'أسعار القائمة', includesVat: true, isDefault: true },
  })
  const wholesaleList = await prisma.priceList.create({
    data: { tenantId: tenant.id, nameEn: 'Corporate catering', nameAr: 'أسعار الشركات', includesVat: false },
  })
  for (const menu of menuItems) {
    await prisma.priceListItem.create({
      data: { tenantId: tenant.id, priceListId: retailList.id, itemId: menuById.get(menu.sku)!, price: menu.price },
    })
    await prisma.priceListItem.create({
      data: {
        tenantId: tenant.id, priceListId: wholesaleList.id, itemId: menuById.get(menu.sku)!,
        price: money(menu.price).div('1.15').times('0.85').toFixed(4), minQuantity: '20',
      },
    })
  }
  log('2 price lists')

  // ── Parties ────────────────────────────────────────────────────────────────────────────
  const supplierAddress = await prisma.address.create({
    data: { tenantId: tenant.id, buildingNumber: '2100', street: 'شارع الملك عبدالعزيز', district: 'البلد', city: 'جدة', postalCode: '22233', additionalNumber: '5510' },
  })
  const poultrySupplier = await prisma.party.create({
    data: {
      tenantId: tenant.id, code: 'SUP-0001', nameEn: 'Al Waha Poultry Company', nameAr: 'شركة الواحة للدواجن',
      isSupplier: true, vatNumber: '310000000000003', crNumber: '4030555111',
      addressId: supplierAddress.id, phone: '+966126111222', whatsapp: '+966501112233', paymentTermDays: 30,
    },
  })
  const groceries = await prisma.party.create({
    data: {
      tenantId: tenant.id, code: 'SUP-0002', nameEn: 'Jeddah Wholesale Foods', nameAr: 'جدة للمواد الغذائية بالجملة',
      isSupplier: true, vatNumber: '320000000000003', paymentTermDays: 15,
    },
  })
  const corporateCustomer = await prisma.party.create({
    data: {
      tenantId: tenant.id, code: 'CUS-0001', nameEn: 'Red Sea Trading Company', nameAr: 'شركة البحر الأحمر للتجارة',
      isCustomer: true, vatNumber: '311111111111113', crNumber: '4030999888',
      paymentTermDays: 30, creditLimit: '50000', priceListId: wholesaleList.id, whatsapp: '+966555443322',
      addressId: (await prisma.address.create({
        data: { tenantId: tenant.id, buildingNumber: '1200', street: 'شارع التحلية', district: 'الأندلس', city: 'جدة', postalCode: '23326', additionalNumber: '4410' },
      })).id,
    },
  })
  const walkIn = await prisma.party.create({
    data: { tenantId: tenant.id, code: 'CUS-0002', nameEn: 'Walk-in customer', nameAr: 'عميل نقدي', isCustomer: true },
  })
  log('4 parties')

  // ── ZATCA device ───────────────────────────────────────────────────────────────────────
  const keys = generateStampKeyPair()
  const egsInfo = {
    commonName: 'NAKHLA-JED-01',
    organizationName: 'Nakhla Restaurants Establishment',
    organizationalUnitName: 'Jeddah Branch',
    serialNumber: '1-NakhlaERP|2-1.0.0|3-JED-01',
    vatNumber: VAT_NUMBER,
    invoiceType: '1100',
    registeredAddress: 'Prince Sultan Road, Al Rawdah, Jeddah 23434',
    businessCategory: 'Restaurants',
  }
  const csr = buildCsr(egsInfo, keys.privateKeyPem, 'sandbox')
  const demoCert = demoCertificate(keys.privateKeyPem)

  await prisma.zatcaCertificate.create({
    data: {
      tenantId: tenant.id,
      branchId: jeddah.id,
      environment: 'SANDBOX',
      egsSerial: egsInfo.serialNumber,
      commonName: egsInfo.commonName,
      invoiceType: egsInfo.invoiceType,
      privateKeyEnc: encrypt(keys.privateKeyPem),
      csrPem: csr.pem,
      // A self-signed stand-in so the demo can sign offline. Replaced by the real CSID
      // when the user completes onboarding against the Fatoora portal.
      complianceCertEnc: encrypt(stripCertificateArmour(demoCert)),
      complianceSecretEnc: encrypt(randomBytes(24).toString('base64')),
      status: 'ACTIVE',
    },
  })
  log('ZATCA device registered for Jeddah (sandbox, self-signed stand-in)')

  // ── Employees ──────────────────────────────────────────────────────────────────────────
  const employees = [
    { employeeNumber: 'EMP-001', nameEn: 'Ahmed Al Qahtani', nameAr: 'أحمد القحطاني', identityNumber: '1098765432', nationality: 'Saudi', isSaudi: true, jobTitleEn: 'Branch manager', jobTitleAr: 'مدير الفرع', basic: '8000', housing: '2000', transport: '500', iban: 'SA0380000000608010167519' },
    { employeeNumber: 'EMP-002', nameEn: 'Ravi Kumar', nameAr: 'رافي كومار', identityNumber: '2345678901', nationality: 'Indian', isSaudi: false, jobTitleEn: 'Head chef', jobTitleAr: 'رئيس الطهاة', basic: '4500', housing: '1125', transport: '300', iban: 'SA4420000001234567891234' },
    { employeeNumber: 'EMP-003', nameEn: 'Sara Al Otaibi', nameAr: 'سارة العتيبي', identityNumber: '1123456789', nationality: 'Saudi', isSaudi: true, jobTitleEn: 'Cashier', jobTitleAr: 'كاشير', basic: '4000', housing: '1000', transport: '400', iban: 'SA6980000204608016212908' },
    { employeeNumber: 'EMP-004', nameEn: 'Mohammed Hassan', nameAr: 'محمد حسن', identityNumber: '2987654321', nationality: 'Egyptian', isSaudi: false, jobTitleEn: 'Waiter', jobTitleAr: 'نادل', basic: '3200', housing: '800', transport: '250', iban: 'SA0950000000012345678910' },
    { employeeNumber: 'EMP-005', nameEn: 'Noura Al Harbi', nameAr: 'نورة الحربي', identityNumber: '1555666777', nationality: 'Saudi', isSaudi: true, jobTitleEn: 'Accountant', jobTitleAr: 'محاسبة', basic: '9000', housing: '2250', transport: '600', iban: 'SA8510000012345678901234' },
  ]
  for (const e of employees) {
    await prisma.employee.create({
      data: {
        tenantId: tenant.id, branchId: jeddah.id, employeeNumber: e.employeeNumber,
        nameEn: e.nameEn, nameAr: e.nameAr,
        identityNumber: encrypt(e.identityNumber),
        nationality: e.nationality, isSaudi: e.isSaudi,
        jobTitleEn: e.jobTitleEn, jobTitleAr: e.jobTitleAr, department: 'Operations',
        hireDate: new Date(Date.UTC(year - 3, 0, 15)),
        basicSalary: e.basic, housingAllowance: e.housing, transportAllowance: e.transport,
        iban: encrypt(e.iban),
        iqamaExpiry: e.isSaudi ? null : new Date(Date.UTC(year + 1, 5, 30)),
        status: 'ACTIVE',
      },
    })
  }
  log(`${employees.length} employees`)

  // ── Bank account ───────────────────────────────────────────────────────────────────────
  await prisma.bankAccount.create({
    data: {
      tenantId: tenant.id, accountId: accountIdByCode.get('1120')!,
      nameEn: 'Al Rajhi current account', nameAr: 'الحساب الجاري - الراجحي',
      bankName: 'Al Rajhi Bank', iban: encrypt('SA0380000000608010167519'),
    },
  })

  await seedTrading({ tenantId: tenant.id, branchId: jeddah.id, warehouseId: jeddahStore.id, accountIdByCode, rawByS, menuById, poultrySupplier: poultrySupplier.id, corporateCustomer: corporateCustomer.id, year })

  process.stdout.write('\nDone.\n\n')
  process.stdout.write(`  Sign in at http://localhost:3000 with any of:\n`)
  for (const user of users) process.stdout.write(`    ${user.email.padEnd(26)} ${user.role}\n`)
  process.stdout.write(`\n  Password for all demo users: ${DEMO_PASSWORD}\n`)
  process.stdout.write(`  Tenant VAT number: ${VAT_NUMBER}\n\n`)
  void [riyadhStore, groceries, walkIn, mandiBom]
}

/**
 * A few days of trading, so the dashboard, the trial balance and the VAT return have data.
 * Every posting goes through the same builders the application uses.
 */
async function seedTrading(args: {
  tenantId: string
  branchId: string
  warehouseId: string
  accountIdByCode: Map<string, string>
  rawByS: Map<string, string>
  menuById: Map<string, string>
  poultrySupplier: string
  corporateCustomer: string
  year: number
}) {
  const { post } = await import('../src/server/services/posting')
  const { moveStock } = await import('../src/server/services/inventory')
  const { createDraft, postInvoice } = await import('../src/server/services/invoice')

  const day = (d: number) => new Date(Date.UTC(args.year, new Date().getUTCMonth(), d))

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, args.tenantId)

    // 1. Receive raw materials from the poultry supplier.
    const purchases = [
      { sku: 'RAW-CHICKEN', quantity: '120', unitCost: '14.50' },
      { sku: 'RAW-RICE', quantity: '200', unitCost: '9.20' },
      { sku: 'RAW-SPICE', quantity: '15', unitCost: '38.00' },
      { sku: 'RAW-ORANGE', quantity: '80', unitCost: '6.75' },
      { sku: 'RAW-OIL', quantity: '60', unitCost: '11.00' },
    ]
    let goodsValue = money(0)
    for (const line of purchases) {
      const movement = await moveStock(tx, {
        tenantId: args.tenantId,
        itemId: args.rawByS.get(line.sku)!,
        warehouseId: args.warehouseId,
        kind: 'RECEIPT',
        date: day(2),
        quantity: line.quantity,
        unitCost: line.unitCost,
        source: 'GOODS_RECEIPT',
        reference: 'GRN-JED-DEMO-1',
      })
      goodsValue = goodsValue.plus(money(movement.costAmount))
    }

    const billTotals = computeDocument({
      lines: purchases.map((p) => ({ quantity: p.quantity, unitPrice: p.unitCost, vatCategory: 'STANDARD' as const })),
    })
    await post(tx, buildSupplierBillPosting({
      context: { tenantId: args.tenantId, branchId: args.branchId, date: day(2), reference: 'BILL-DEMO-1', partyId: args.poultrySupplier },
      totals: billTotals,
      inventoryAmount: billTotals.taxableTotal,
    }))

    // 2. Produce 40 portions of chicken mandi from the recipe.
    const finishedGoods = args.menuById.get('MENU-MANDI-C')!
    const { explodeBom } = await import('../src/lib/inventory/valuation')
    const components = explodeBom(
      [
        { itemId: args.rawByS.get('RAW-CHICKEN')!, quantityPer: '0.350', wastageRate: '0.08' },
        { itemId: args.rawByS.get('RAW-RICE')!, quantityPer: '0.250', wastageRate: '0.02' },
        { itemId: args.rawByS.get('RAW-SPICE')!, quantityPer: '0.015' },
        { itemId: args.rawByS.get('RAW-OIL')!, quantityPer: '0.030' },
      ],
      '40',
    )
    let consumed = money(0)
    for (const component of components) {
      const movement = await moveStock(tx, {
        tenantId: args.tenantId, itemId: component.itemId, warehouseId: args.warehouseId,
        kind: 'ISSUE', date: day(3), quantity: component.quantity.toString(),
        source: 'PRODUCTION', reference: 'PRD-JED-DEMO-1',
      })
      consumed = consumed.plus(money(movement.costAmount))
    }
    await moveStock(tx, {
      tenantId: args.tenantId, itemId: finishedGoods, warehouseId: args.warehouseId,
      kind: 'RECEIPT', date: day(3), quantity: '40',
      unitCost: consumed.div(40).toFixed(4),
      source: 'PRODUCTION', reference: 'PRD-JED-DEMO-1',
    })
    const { buildProductionPosting } = await import('../src/lib/accounting/documents')
    await post(tx, buildProductionPosting({
      context: { tenantId: args.tenantId, branchId: args.branchId, date: day(3), reference: 'PRD-JED-DEMO-1' },
      componentsCost: consumed,
      outputValue: consumed,
    }))

    // 3. Opening stock of the bought-in drinks. A restaurant does not make its own bottled
    //    water, and a till cannot sell what the warehouse does not hold.
    const boughtIn = [
      { sku: 'MENU-JUICE-O', quantity: '60', unitCost: '4.10' },
      { sku: 'MENU-WATER', quantity: '480', unitCost: '0.95' },
      { sku: 'MENU-KABSA-L', quantity: '25', unitCost: '31.50' },
    ]
    let openingValue = money(0)
    for (const line of boughtIn) {
      const movement = await moveStock(tx, {
        tenantId: args.tenantId,
        itemId: args.menuById.get(line.sku)!,
        warehouseId: args.warehouseId,
        kind: 'OPENING',
        date: day(1),
        quantity: line.quantity,
        unitCost: line.unitCost,
        source: 'OPENING_BALANCE',
        reference: 'OPENING',
      })
      openingValue = openingValue.plus(money(movement.costAmount))
    }
    // Opening stock is capital introduced, not a purchase: inventory against owner's equity.
    await post(tx, {
      tenantId: args.tenantId,
      branchId: args.branchId,
      date: day(1),
      source: 'OPENING_BALANCE',
      reference: 'OPENING',
      memoEn: 'Opening stock',
      memoAr: 'مخزون افتتاحي',
      lines: [
        { role: 'INVENTORY', debit: openingValue, memoEn: 'Opening stock', memoAr: 'مخزون افتتاحي' },
        { role: 'SHARE_CAPITAL', credit: openingValue, memoEn: 'Capital introduced', memoAr: 'رأس مال مقدّم' },
      ],
    })

    // 4. A corporate catering invoice, posted through the real path.
    const invoice = await createDraft(tx, {
      tenantId: args.tenantId,
      branchId: args.branchId,
      partyId: args.corporateCustomer,
      kind: 'STANDARD',
      date: day(5),
      dueDate: day(5 + 30),
      lines: [
        {
          itemId: finishedGoods, descriptionEn: 'Chicken Mandi', descriptionAr: 'مندي دجاج',
          quantity: '25', unitPrice: '45.00', warehouseId: args.warehouseId, unitCode: 'PCE',
        },
      ],
      paymentMeansCode: '42',
    })
    const posted = await postInvoice(tx, { tenantId: args.tenantId, invoiceId: invoice.id })

    // 5. The customer pays half of it.
    const half = money(invoice.payableTotal.toString()).div(2)
    await post(tx, buildPaymentPosting({
      context: { tenantId: args.tenantId, branchId: args.branchId, date: day(12), reference: 'RCT-DEMO-1', partyId: args.corporateCustomer },
      direction: 'RECEIPT',
      amount: half,
      account: 'BANK',
    }))
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidTotal: toDb(half), status: 'PARTIALLY_SETTLED' } })

    log(`demo trading posted (invoice ${posted.number}, ICV ${posted.icv})`)
  }, { timeout: 60_000 })

  // Prove the seeded books balance before anyone logs in.
  const totals = await prisma.journalLine.aggregate({
    where: { tenantId: args.tenantId },
    _sum: { debit: true, credit: true },
  })
  const debit = money(totals._sum.debit?.toString() ?? 0)
  const credit = money(totals._sum.credit?.toString() ?? 0)
  if (!debit.equals(credit)) {
    throw new Error(`Seed produced an unbalanced ledger: debits ${debit.toFixed(2)} vs credits ${credit.toFixed(2)}`)
  }
  log(`trial balance checks out: ${debit.toFixed(2)} SAR on both sides`)
}

main()
  .catch((error) => {
    process.stderr.write(`\nSeed failed: ${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
