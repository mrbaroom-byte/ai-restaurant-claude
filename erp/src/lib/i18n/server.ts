/**
 * Server-side translation.
 *
 * A thin lookup over the JSON catalogues rather than a runtime i18n framework: the app is
 * two languages with a fixed key set, the parity test guarantees neither falls behind, and a
 * missing key should be visible in development rather than silently rendering the key name.
 */
import ar from '@/messages/ar.json'
import en from '@/messages/en.json'
import { type Locale, DEFAULT_LOCALE, direction, isLocale } from './config'

const CATALOGUES: Record<Locale, unknown> = { ar, en }

export type Translator = (key: string) => string

export function translator(locale: Locale): Translator {
  const catalogue = CATALOGUES[locale]
  const fallback = CATALOGUES[DEFAULT_LOCALE]

  return (key: string) => {
    const resolved = lookup(catalogue, key) ?? lookup(fallback, key)
    if (resolved === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(`Missing translation for "${key}" in ${locale}.`)
      }
      return key
    }
    return resolved
  }
}

function lookup(catalogue: unknown, key: string): string | undefined {
  let node: unknown = catalogue
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

export { DEFAULT_LOCALE, direction, isLocale }
export type { Locale }
