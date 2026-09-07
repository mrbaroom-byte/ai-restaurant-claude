import type { Config } from 'tailwindcss'

/**
 * Tailwind is configured for logical properties throughout — `ms-*`/`me-*` rather than
 * `ml-*`/`mr-*`, `text-start` rather than `text-left` — so the same class list lays out
 * correctly in both Arabic and English without a second stylesheet.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tajawal for Arabic, Inter for Latin; the browser picks per glyph.
        sans: ['Inter', 'Tajawal', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        arabic: ['Tajawal', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // A palm-green accent, muted enough to sit under dense financial tables all day.
        brand: {
          50: '#f1f7f2', 100: '#dcebde', 200: '#bcd8c1', 300: '#90bd99',
          400: '#639d70', 500: '#437f52', 600: '#2f6540', 700: '#275135',
          800: '#22412c', 900: '#1d3625',
        },
        ink: {
          50: '#f7f8f8', 100: '#eeeff1', 200: '#d8dbe0', 300: '#b5bbc4',
          400: '#8b94a1', 500: '#6c7686', 600: '#565e6d', 700: '#474d59',
          800: '#3d424b', 900: '#363a41',
        },
      },
      gridTemplateColumns: { sidebar: '16rem 1fr' },
    },
  },
  plugins: [],
} satisfies Config
