import type { Metadata, Viewport } from 'next'
import { currentLocale } from '@/server/session'
import { direction } from '@/lib/i18n/config'
import { translator } from '@/lib/i18n/server'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nakhla ERP',
  description: 'KSA-ready business management: accounting, ZATCA e-invoicing, inventory, POS and payroll.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The POS runs on a tablet that must not zoom when a cashier double-taps a tile.
  maximumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale()
  const t = translator(locale)

  return (
    <html lang={locale} dir={direction(locale)}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded
                     focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          {t('app.name')}
        </a>
        {children}
      </body>
    </html>
  )
}
