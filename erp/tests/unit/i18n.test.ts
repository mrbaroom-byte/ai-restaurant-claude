import { describe, expect, it } from 'vitest'
import ar from '@/messages/ar.json'
import en from '@/messages/en.json'
import { ROLE_LABELS } from '@/lib/rbac'
import { DEFAULT_EXEMPTION_REASON, VAT_RETURN_LABELS } from '@/lib/tax/vat'
import { DEFAULT_CHART_OF_ACCOUNTS } from '@/lib/accounting/accounts'
import { formatDualDate, formatHijri, formatMoney, direction } from '@/lib/i18n/config'

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
}

const ARABIC = /[؀-ۿ]/

describe('message catalogues', () => {
  it('have exactly the same keys, so neither language can silently fall behind', () => {
    const arKeys = flatten(ar).sort()
    const enKeys = flatten(en).sort()

    expect(arKeys.filter((k) => !enKeys.includes(k)), 'keys only in Arabic').toEqual([])
    expect(enKeys.filter((k) => !arKeys.includes(k)), 'keys only in English').toEqual([])
    expect(arKeys.length).toBeGreaterThan(150)
  })

  it('have no empty strings', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value.trim(), `${path} is empty`).not.toBe('')
        return
      }
      for (const [key, child] of Object.entries(value as object)) walk(child, `${path}.${key}`)
    }
    walk(ar, 'ar')
    walk(en, 'en')
  })

  it('use real Arabic, not the English string copied across', () => {
    const arValues: Array<[string, string]> = []
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        arValues.push([path, value])
        return
      }
      for (const [key, child] of Object.entries(value as object)) walk(child, `${path}.${key}`)
    }
    walk(ar, '')

    // A handful of entries are proper nouns that stay in Latin script.
    const latinByDesign = new Set(['pos.stcPay', 'pos.applePay'])
    for (const [path, value] of arValues) {
      if (latinByDesign.has(path.replace(/^\./, ''))) continue
      expect(ARABIC.test(value), `${path} is not in Arabic: "${value}"`).toBe(true)
    }
  })

  it('use the accounting register a Saudi reader expects', () => {
    // Not literal translations: these are the terms on a real Saudi invoice and ledger.
    expect(ar.invoice.taxInvoice).toBe('فاتورة ضريبية')
    expect(ar.invoice.simplifiedTaxInvoice).toBe('فاتورة ضريبية مبسطة')
    expect(ar.invoice.creditNote).toBe('إشعار دائن')
    expect(ar.nav.purchaseOrders).toBe('أوامر الشراء')
    expect(ar.nav.inventory).toBe('المخزون')
    expect(ar.reports.trialBalance).toBe('ميزان المراجعة')
  })
})

describe('domain labels', () => {
  it('name every account in both languages', () => {
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      expect(account.nameEn.trim()).not.toBe('')
      expect(ARABIC.test(account.nameAr), `${account.code} ${account.nameAr}`).toBe(true)
    }
  })

  it('name every role and VAT return box in both languages', () => {
    for (const label of Object.values(ROLE_LABELS)) {
      expect(ARABIC.test(label.ar)).toBe(true)
      expect(label.en.trim()).not.toBe('')
    }
    for (const [box, label] of Object.entries(VAT_RETURN_LABELS)) {
      expect(ARABIC.test(label.ar), box).toBe(true)
      expect(label.en.trim(), box).not.toBe('')
    }
  })

  it('give every VAT exemption reason an Arabic text, which ZATCA prints', () => {
    for (const [category, reason] of Object.entries(DEFAULT_EXEMPTION_REASON)) {
      if (category === 'STANDARD') {
        expect(reason).toBeNull()
        continue
      }
      expect(ARABIC.test(reason!.ar), category).toBe(true)
      expect(reason!.code).toMatch(/^VATEX-SA-/)
    }
  })
})

describe('formatting', () => {
  it('lays Arabic out right to left and English left to right', () => {
    expect(direction('ar')).toBe('rtl')
    expect(direction('en')).toBe('ltr')
  })

  it('uses Western digits in Arabic, as Saudi accounting does', () => {
    const arabic = formatMoney('1234.5', 'ar')
    expect(arabic).toContain('1,234.50')
    expect(arabic).toContain('ر.س')
    expect(formatMoney('1234.5', 'en')).toBe('SAR 1,234.50')
  })

  it('prints the Hijri date beside the Gregorian one', () => {
    const dual = formatDualDate(new Date('2026-03-15T09:00:00Z'), 'ar')
    expect(dual).toContain('—')
    // 15 March 2026 falls in Ramadan 1447.
    expect(formatHijri(new Date('2026-03-15T09:00:00Z'), 'ar')).toContain('1447')
  })
})
