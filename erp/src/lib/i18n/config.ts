/**
 * Bilingual configuration.
 *
 * Arabic is the default because the business, its invoices and its regulator all work in
 * Arabic; English is there for the expatriate manager and the export customer. Both are
 * first-class: there is no "translated" language here, and every label, enum and printed
 * document exists in both.
 */
export const LOCALES = ['ar', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ar'

export const LOCALE_DIRECTION: Record<Locale, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' }

export const LOCALE_LABEL: Record<Locale, string> = { ar: 'العربية', en: 'English' }

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

export function direction(locale: Locale): 'rtl' | 'ltr' {
  return LOCALE_DIRECTION[locale]
}

/**
 * Money for display.
 *
 * Arabic uses Western digits here deliberately: Saudi accounting practice, bank statements and
 * the ZATCA portal all use them, and a printed invoice has to be comparable with those.
 */
export function formatMoney(value: string | number, locale: Locale, currency = 'SAR'): string {
  const amount = Number(value)
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return locale === 'ar' ? `${formatted} ${currency === 'SAR' ? 'ر.س' : currency}` : `${currency} ${formatted}`
}

export function formatQuantity(value: string | number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
    maximumFractionDigits: 3,
  }).format(Number(value))
}

/** Gregorian date, in the locale's own format. */
export function formatDate(value: Date | string, locale: Locale): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'Asia/Riyadh',
  }).format(date)
}

/**
 * Hijri date. Printed documents show it beside the Gregorian one, which is what a Saudi
 * reader expects and what several government forms require.
 */
export function formatHijri(value: Date | string, locale: Locale = 'ar'): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-SA-u-ca-islamic-umalqura', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Riyadh',
  }).format(date)
}

/** Both calendars, the way a printed invoice shows them. */
export function formatDualDate(value: Date | string, locale: Locale): string {
  return `${formatDate(value, locale)} — ${formatHijri(value, locale)}`
}
