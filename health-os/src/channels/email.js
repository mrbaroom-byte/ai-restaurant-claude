// Resend fallback. Used for the weekly review and for alerting when Telegram
// is not reachable - not for the daily nudges, which have to be two-way.

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.RESEND_TO);
}

export async function sendEmail(subject, text, { html = null } = {}) {
  if (!emailEnabled()) return { ok: false, skipped: true, reason: 'Resend is not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: String(process.env.RESEND_TO).split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true, id: (await res.json().catch(() => ({}))).id ?? null };
}
