import { expect, test, type Page } from '@playwright/test'
import { blockExternalRequests, statePath } from './helpers'

/**
 * Each test raises the invoice it needs.
 *
 * Reusing whatever happened to be first in the list made these tests depend on each other and
 * on which browser project ran before them — a credit note issued by one run changed what the
 * next one found. A test that creates its own document says the same thing every time.
 */
async function createPostedInvoice(page: Page, quantity = '4'): Promise<{ id: string; number: string }> {
  const [branches, items, parties] = await Promise.all([
    page.request.get('/api/v1/branches').then((r) => r.json()),
    page.request.get('/api/v1/items?q=SVC-CATERING').then((r) => r.json()),
    page.request.get('/api/v1/parties?role=customer').then((r) => r.json()),
  ])

  const branch = branches.data[0]
  // A service line needs no stock, so the test does not depend on what is in the warehouse.
  const item = items.data.find((i: { sku: string }) => i.sku === 'SVC-CATERING')
  const customer = parties.data.find((p: { vatNumber: string | null }) => p.vatNumber)

  expect(branch, 'the seed should provide a branch').toBeTruthy()
  expect(item, 'the seed should provide the catering service item').toBeTruthy()
  expect(customer, 'the seed should provide a VAT-registered customer').toBeTruthy()

  const created = await page.request.post('/api/v1/invoices', {
    data: {
      branchId: branch.id,
      partyId: customer.id,
      kind: 'STANDARD',
      date: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          descriptionEn: 'Event catering service',
          descriptionAr: 'خدمة تقديم الطعام للمناسبات',
          quantity,
          unitPrice: item.sellingPrice,
        },
      ],
    },
  })
  expect(created.status(), await created.text()).toBe(201)

  const draft = await created.json()
  const posted = await page.request.post(`/api/v1/invoices/${draft.id}/post`)
  expect(posted.status(), await posted.text()).toBe(200)

  const body = await posted.json()
  return { id: body.id, number: body.number }
}

test.describe('the invoice a customer receives', () => {
  test.use({ storageState: statePath('owner') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('shows the Arabic title, the VAT number, the QR and the tax lines', async ({ page }) => {
    const invoice = await createPostedInvoice(page)

    await page.goto(`/invoices/${invoice.id}`)
    await page.locator('#main').waitFor({ state: 'visible' })

    // ZATCA requires the document title in Arabic on the printed invoice.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('فاتورة ضريبية')

    // The seller's VAT registration number.
    await expect(page.locator('.num', { hasText: '300000000000003' }).first()).toBeVisible()

    // The QR is rendered from the value embedded in the signed XML.
    const qr = page.locator('img[alt*="رمز الاستجابة"]')
    await expect(qr).toBeVisible()
    expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/)

    // Every tax line is shown, not just the total.
    await expect(page.getByText('المبلغ الخاضع للضريبة').first()).toBeVisible()
    await expect(page.getByText('إجمالي ضريبة القيمة المضافة').first()).toBeVisible()
    await expect(page.getByText('الإجمالي مع الضريبة').first()).toBeVisible()
  })

  test('offers the signed UBL document for download', async ({ page }) => {
    const invoice = await createPostedInvoice(page)

    const response = await page.request.get(`/api/v1/invoices/${invoice.id}/xml`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/xml')

    const xml = await response.text()
    expect(xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')
    expect(xml).toContain('<ds:X509Certificate>')
    expect(xml).toContain(invoice.number)
    expect(xml).toContain('ICV')
    expect(xml).toContain('PIH')
    // A standard invoice is a clearance document, type 388.
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>')
  })

  test('a credit note reverses the invoice and the books still balance', async ({ page }) => {
    const before = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(before.balanced).toBe(true)

    const invoice = await createPostedInvoice(page)

    const created = await page.request.post(`/api/v1/invoices/${invoice.id}/credit-note`, {
      data: { reason: 'إرجاع البضاعة', date: new Date().toISOString() },
    })
    expect(created.status(), await created.text()).toBe(201)

    const note = await created.json()
    expect(note.documentType).toBe('CREDIT_NOTE')
    expect(note.icv).toBeGreaterThan(0)
    // The note credits exactly what the invoice charged.
    expect(note.payableTotal).toBe((await (await page.request.get(`/api/v1/invoices/${invoice.id}`)).json()).payableTotal)

    const after = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(after.balanced).toBe(true)
  })

  test('a credit note with no reason is refused, because ZATCA requires one', async ({ page }) => {
    const invoice = await createPostedInvoice(page)

    const response = await page.request.post(`/api/v1/invoices/${invoice.id}/credit-note`, { data: { reason: '' } })
    expect(response.status()).toBe(422)
    expect(JSON.stringify(await response.json())).toContain('reason')
  })

  test('an invoice cannot be credited twice for the same goods', async ({ page }) => {
    const invoice = await createPostedInvoice(page)

    const first = await page.request.post(`/api/v1/invoices/${invoice.id}/credit-note`, {
      data: { reason: 'إرجاع كامل' },
    })
    expect(first.status()).toBe(201)

    const second = await page.request.post(`/api/v1/invoices/${invoice.id}/credit-note`, {
      data: { reason: 'مرة أخرى' },
    })
    expect(second.status()).toBe(409)
    expect(JSON.stringify(await second.json())).toContain('credited in full')
  })

  test('the ZATCA counter advances by one for every document issued', async ({ page }) => {
    const first = await createPostedInvoice(page)
    const second = await createPostedInvoice(page)

    const [a, b] = await Promise.all([
      page.request.get(`/api/v1/invoices/${first.id}`).then((r) => r.json()),
      page.request.get(`/api/v1/invoices/${second.id}`).then((r) => r.json()),
    ])

    expect(b.icv).toBe(a.icv + 1)
    // The chain links: the second invoice's previous hash is the first invoice's hash.
    expect(b.pih).toBe(a.invoiceHash)
  })
})

test.describe('the VAT return', () => {
  test.use({ storageState: statePath('owner') })

  test('reconciles to its source documents', async ({ page }) => {
    const year = new Date().getUTCFullYear()
    const response = await page.request.get(`/api/v1/reports/vat-return?from=${year}-01-01&to=${year}-12-31`)
    expect(response.status()).toBe(200)
    const body = await response.json()

    const salesVat = body.sources
      .filter((source: { kind: string }) => source.kind === 'SALE')
      .reduce((sum: number, source: { vat: string }) => sum + Number(source.vat), 0)

    expect(Number(body.boxes.box6.vat)).toBeCloseTo(salesVat, 2)
    expect(Number(body.boxes.box15.amount)).toBeCloseTo(
      Number(body.boxes.box13.amount) + Number(body.boxes.box14.amount),
      2,
    )
  })
})
