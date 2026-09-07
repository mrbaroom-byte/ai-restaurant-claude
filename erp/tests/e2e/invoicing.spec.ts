import { expect, test } from '@playwright/test'
import { blockExternalRequests, statePath } from './helpers'

test.describe('the invoice a customer receives', () => {
  test.use({ storageState: statePath('owner') })

  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page)
  })

  test('shows the Arabic title, the VAT number, the QR and the tax lines', async ({ page }) => {
    await page.goto('/invoices')

    await page.locator('table a[href^="/invoices/"]').first().click()
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

    const list = await page.request.get('/api/v1/invoices?pageSize=20')
    const { data } = await list.json()
    const posted = data.find((invoice: { status: string }) => invoice.status !== 'DRAFT')
    expect(posted, 'the seed should have posted an invoice').toBeTruthy()

    const response = await page.request.get(`/api/v1/invoices/${posted.id}/xml`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/xml')

    const xml = await response.text()
    expect(xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')
    expect(xml).toContain('<ds:X509Certificate>')
    expect(xml).toContain('ICV')
    expect(xml).toContain('PIH')
  })

  test('a credit note reverses the invoice and the books still balance', async ({ page }) => {

    const before = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(before.balanced).toBe(true)

    const list = await page.request.get('/api/v1/invoices?pageSize=20')
    const { data } = await list.json()
    const target = data.find(
      (invoice: { status: string; documentType: string }) =>
        invoice.status !== 'DRAFT' && invoice.documentType === 'TAX_INVOICE',
    )

    const created = await page.request.post(`/api/v1/invoices/${target.id}/credit-note`, {
      data: { reason: 'إرجاع البضاعة', date: new Date().toISOString() },
    })
    expect(created.status()).toBe(201)
    const note = await created.json()
    expect(note.documentType).toBe('CREDIT_NOTE')
    expect(note.icv).toBeGreaterThan(0)

    const after = await (await page.request.get('/api/v1/reports/trial-balance')).json()
    expect(after.balanced).toBe(true)
  })

  test('a credit note with no reason is refused, because ZATCA requires one', async ({ page }) => {

    const list = await page.request.get('/api/v1/invoices?pageSize=20')
    const { data } = await list.json()
    const target = data.find(
      (invoice: { status: string; documentType: string }) =>
        invoice.status !== 'DRAFT' && invoice.documentType === 'TAX_INVOICE',
    )

    const response = await page.request.post(`/api/v1/invoices/${target.id}/credit-note`, { data: { reason: '' } })
    expect(response.status()).toBe(422)
    expect(JSON.stringify(await response.json())).toContain('reason')
  })
})

test.describe('the VAT return', () => {
  test.use({ storageState: statePath('owner') })

  test('reconciles to its source documents', async ({ page }) => {

    const response = await page.request.get('/api/v1/reports/vat-return?from=2026-01-01&to=2026-12-31')
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
