import QRCode from 'qrcode'
import { currentLocale, requirePrincipal } from '@/server/session'
import { translator } from '@/lib/i18n/server'
import { prisma } from '@/server/db'
import { TOTP_REQUIRED_ROLES, beginTotpEnrolment } from '@/server/services/auth'
import { EnrolTotp } from './enrol'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const principal = await requirePrincipal()
  const locale = await currentLocale()
  const t = translator(locale)

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: principal.userId },
    select: { email: true, totpEnabled: true, role: true },
  })

  const mandatory = TOTP_REQUIRED_ROLES.includes(principal.role)

  if (user.totpEnabled) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-lg font-semibold text-ink-900">{t('auth.totp')}</h1>
        <p className="card px-4 py-3 text-sm text-brand-800">
          {locale === 'ar'
            ? 'التحقق بخطوتين مفعّل على هذا الحساب.'
            : 'Two-factor authentication is switched on for this account.'}
        </p>
      </div>
    )
  }

  // The secret is generated fresh on each visit and only stored once a code proves the user
  // can read it, so an abandoned enrolment leaves nothing behind.
  const enrolment = await beginTotpEnrolment(principal.userId)
  const qrDataUrl = await QRCode.toDataURL(enrolment.otpauthUrl, { margin: 1, width: 200 })

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">{t('auth.totp')}</h1>

      {mandatory && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {locale === 'ar'
            ? 'هذا الدور يتطلب التحقق بخطوتين. أكمل الإعداد للمتابعة إلى بقية النظام.'
            : 'This role requires two-factor authentication. Finish the setup to reach the rest of the system.'}
        </p>
      )}

      <div className="card space-y-4 p-6">
        <ol className="list-decimal space-y-2 text-sm text-ink-700 ps-5">
          <li>
            {locale === 'ar'
              ? 'افتح تطبيق المصادقة على هاتفك (Google Authenticator أو ما يماثله).'
              : 'Open an authenticator app on your phone (Google Authenticator or similar).'}
          </li>
          <li>{locale === 'ar' ? 'امسح الرمز أدناه.' : 'Scan the code below.'}</li>
          <li>{t('auth.totpHint')}</li>
        </ol>

        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" width={200} height={200} />
          <code className="select-all rounded bg-ink-50 px-3 py-1.5 text-xs tracking-wider" dir="ltr">
            {enrolment.secret}
          </code>
        </div>

        <EnrolTotp
          secret={enrolment.secret}
          labels={{
            code: t('auth.totp'),
            submit: t('app.save'),
            hint: t('auth.totpHint'),
            invalid: t('auth.invalidTotp'),
          }}
        />
      </div>
    </div>
  )
}
