#!/usr/bin/env python3
"""Generate the transactional email set — HTML and plain text, plus a preview gallery.

Every email a customer receives between the founder preorder (Nov 1) and the first review
request. Gate 6's twenty-order dry run tests these, so they have to exist before Nov 5.

Written for email clients, not browsers: table layout, inline styles, no external CSS, no
webfonts, 600px max. Arabic first with English beneath, dir="rtl" on the document.

Merge tags use {{double_brace}}. Map them to your platform's syntax in one pass — the mapping
table is in README.md. Anything unmapped will ship to a customer as literal braces, so the
build prints every tag it emitted for you to check against.

Run:  python3 business/04-launch/emails/build_emails.py
"""

import html
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
BUSINESS = HERE.parents[1]
CONFIG = json.loads((BUSINESS / "brand.config.json").read_text(encoding="utf-8"))

BRAND_AR = CONFIG["masterbrand"]["arabic"]
BRAND_EN = CONFIG["masterbrand"]["latin"]

INK = "#1f2d27"
SOFT = "#4a5a52"
MUTED = "#667269"
LINE = "#e5ded1"
PAPER = "#faf7f1"
ACCENT = "#1f6b4a"
WARM = "#c8763c"

# Arabic-safe stacks only. No webfonts: many clients strip them, and a font that fails to
# load on an Arabic email is not a cosmetic problem.
FONT = "'Segoe UI', Tahoma, Arial, sans-serif"


# --------------------------------------------------------------------------- shell
def shell(preheader, blocks, footer_note=""):
    return f"""<!doctype html>
<html lang="ar" dir="rtl" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>{BRAND_AR}</title>
<!--[if mso]><style>body,table,td{{font-family:Tahoma,Arial,sans-serif !important}}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:{PAPER};">
<div style="display:none;font-size:1px;color:{PAPER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAPER};">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid {LINE};border-radius:12px;overflow:hidden;">

  <tr><td style="padding:22px 28px;border-bottom:1px solid {LINE};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="right" style="font-family:{FONT};font-size:19px;font-weight:bold;color:{INK};">{BRAND_AR}</td>
      <td align="left" dir="ltr" style="font-family:{FONT};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};">{BRAND_EN}</td>
    </tr></table>
  </td></tr>

  {blocks}

  <tr><td style="padding:22px 28px;background:#fcfaf6;border-top:1px solid {LINE};">
    <p style="margin:0 0 8px;font-family:{FONT};font-size:12px;line-height:1.6;color:{MUTED};">
      {footer_note or 'تصلك هذه الرسالة لأنك طلبت من متجرنا.'}
    </p>
    <p style="margin:0 0 8px;font-family:{FONT};font-size:11px;line-height:1.7;color:{MUTED};">
      السجل التجاري: {{{{cr_number}}}} · {{{{contact_email}}}}<br>
      <a href="{{{{returns_url}}}}" style="color:{SOFT};">سياسة الإرجاع</a> ·
      <a href="{{{{privacy_url}}}}" style="color:{SOFT};">الخصوصية</a> ·
      <a href="{{{{correction_url}}}}" style="color:{SOFT};">تصحيح خطأ في المحتوى</a>
    </p>
    <p style="margin:0;font-family:{FONT};font-size:11px;color:{MUTED};" dir="ltr">
      <a href="{{{{unsubscribe_url}}}}" style="color:{MUTED};">إلغاء الاشتراك · Unsubscribe</a>
    </p>
  </td></tr>

</table>
<p style="margin:14px 0 0;font-family:{FONT};font-size:11px;color:{MUTED};">الأسعار شاملة ضريبة القيمة المضافة · Prices include VAT</p>
</td></tr>
</table>
</body>
</html>"""


def block(inner, pad="26px 28px", bg="#ffffff"):
    return f'<tr><td style="padding:{pad};background:{bg};">{inner}</td></tr>'


def h(ar, en=""):
    out = (f'<h1 style="margin:0 0 6px;font-family:{FONT};font-size:22px;line-height:1.35;'
           f'font-weight:bold;color:{INK};">{ar}</h1>')
    if en:
        out += (f'<p dir="ltr" style="margin:0 0 16px;font-family:{FONT};font-size:13px;'
                f'color:{MUTED};text-align:left;">{en}</p>')
    return out


def p(ar, en="", size=15):
    out = (f'<p style="margin:0 0 12px;font-family:{FONT};font-size:{size}px;line-height:1.75;'
           f'color:{SOFT};">{ar}</p>')
    if en:
        out += (f'<p dir="ltr" style="margin:-6px 0 16px;font-family:{FONT};font-size:12px;'
                f'line-height:1.6;color:{MUTED};text-align:left;">{en}</p>')
    return out


def button(label_ar, label_en, url):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px;"><tr>
<td align="center" bgcolor="{ACCENT}" style="border-radius:999px;">
<a href="{url}" style="display:inline-block;padding:13px 32px;font-family:{FONT};font-size:15px;
font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;text-align:center;">{label_ar}<br>
<span dir="ltr" style="font-weight:normal;font-size:11px;opacity:.8;">{label_en}</span></a>
</td></tr></table>"""


def facts(rows):
    trs = "".join(
        f'<tr><td style="padding:9px 0;border-bottom:1px solid {LINE};font-family:{FONT};'
        f'font-size:13px;color:{MUTED};width:44%;">{k}</td>'
        f'<td style="padding:9px 0;border-bottom:1px solid {LINE};font-family:{FONT};'
        f'font-size:14px;color:{INK};font-weight:bold;">{v}</td></tr>'
        for k, v in rows
    )
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'border="0" style="margin:4px 0 16px;">{trs}</table>')


def callout(ar, en="", tone="warm"):
    bg, bar = ("#fdf3e9", WARM) if tone == "warm" else ("#f2f6f4", ACCENT)
    inner = (f'<p style="margin:0;font-family:{FONT};font-size:14px;line-height:1.7;'
             f'color:{SOFT};">{ar}</p>')
    if en:
        inner += (f'<p dir="ltr" style="margin:8px 0 0;font-family:{FONT};font-size:12px;'
                  f'line-height:1.6;color:{MUTED};text-align:left;">{en}</p>')
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:4px 0 16px;background:{bg};border-right:3px solid {bar};'
            f'border-radius:0 6px 6px 0;"><tr><td style="padding:14px 18px;">{inner}</td></tr></table>')


# --------------------------------------------------------------------------- emails
EMAILS = {}


def email(slug, **kw):
    EMAILS[slug] = kw


email(
    "01-preorder-confirmation",
    name="Preorder confirmation",
    when="Immediately on preorder. Must fire within one minute — a parent messaging to ask "
         "whether the order went through is the Gate 6 failure signal.",
    subject_ar="تم حجز نسختك 🎉",
    subject_en="Your copy is reserved",
    preheader="لم يُخصم أي مبلغ الآن. سنراسلك حين تصبح النسخ جاهزة.",
    blocks=(
        block(
            h("تم حجز نسختك", "Your copy is reserved")
            + p("شكرًا لك {{first_name}}. حجزنا لك نسخة من «ألوان السعودية» بالسعر التأسيسي.",
                "Thank you {{first_name}}. We've reserved you a copy of Colors of Saudi Arabia at the founder price.")
            + callout(
                "<b>لم يُخصم أي مبلغ الآن.</b> سنراسلك حين تصبح النسخ جاهزة للشحن، ويمكنك التراجع في أي وقت قبل الدفع.",
                "<b>Nothing has been charged.</b> We'll email you when copies are ready to ship, and you can change your mind at any point before payment.")
            + facts([
                ("رقم الحجز", "{{order_number}}"),
                ("المنتج", "{{product_name}}"),
                ("السعر التأسيسي", "{{price}} ريال شامل الضريبة"),
                ("التسليم المتوقع", "نوفمبر ٢٠٢٦"),
                ("المدينة", "{{city}}"),
            ])
            + p("سنراسلك مرة واحدة عند الشحن، ومرة عند الوصول. لا رسائل غير ذلك.",
                "We'll email you once when it ships and once when it arrives. Nothing else.")
        )
    ),
)

email(
    "02-shipping-confirmation",
    name="Shipping confirmation",
    when="When the courier collects and tracking is live. Never before — a tracking number "
         "that does not update yet is worse than no email.",
    subject_ar="طلبك في الطريق إليك",
    subject_en="Your order is on its way",
    preheader="رقم التتبع بالداخل، ومدة التوصيل المتوقعة.",
    blocks=(
        block(
            h("طلبك في الطريق", "Your order is on its way")
            + p("خرج طلبك من عندنا اليوم يا {{first_name}}.",
                "Your order left us today, {{first_name}}.")
            + facts([
                ("رقم الطلب", "{{order_number}}"),
                ("شركة الشحن", "{{carrier}}"),
                ("رقم التتبع", "{{tracking_number}}"),
                ("الوصول المتوقع", "{{delivery_window}}"),
            ])
            + button("تتبّع الشحنة", "Track", "{{tracking_url}}")
            + p("إذا تأخر الطلب عن الموعد المتوقع، راسلنا وسنتابعه بأنفسنا. لا نطلب منك أن تتابع شركة الشحن.",
                "If it runs late, write to us and we'll chase it ourselves. We won't ask you to chase the courier.")
        )
    ),
)

email(
    "03-delivered",
    name="Delivered — how to start",
    when="On delivery confirmation, or 24h after the expected date if no confirmation arrives. "
         "This is the email that decides whether the pad gets opened this week or next month.",
    subject_ar="وصلك الطلب — إليك كيف تبدأون",
    subject_en="It's arrived — here's how to start",
    preheader="ثلاث دقائق، وورقة واحدة. لا يحتاج تحضيرًا.",
    blocks=(
        block(
            h("وصلك الطلب", "It's arrived")
            + p("نتمنى أن يعجبك يا {{first_name}}. إليك أسهل طريقة للبداية:",
                "We hope you like it, {{first_name}}. Here's the easiest way to start:")
            + callout(
                "<b>١.</b> افصل ورقة واحدة فقط — لا تعطِ الدفتر كاملًا.<br>"
                "<b>٢.</b> اترك طفلك يختار الورقة بنفسه.<br>"
                "<b>٣.</b> اقرأ له سؤال الاكتشاف في الأسفل، ثم اتركه يشتغل.<br>"
                "<b>٤.</b> علّق الورقة حين ينتهي — الخلف نظيف تمامًا لهذا السبب.",
                "<b>1.</b> Tear out one sheet — don't hand over the whole pad.<br>"
                "<b>2.</b> Let your child pick the page.<br>"
                "<b>3.</b> Read the discovery prompt at the bottom aloud, then step back.<br>"
                "<b>4.</b> Put it up when they finish — the back is blank for exactly this reason.",
                tone="cool")
            + p("سبع أوراق تحمل سؤالًا صغيرًا للحديث معًا. اختياري تمامًا — الأوراق الباقية يكملها طفلك وحده.",
                "Seven sheets carry a small prompt to talk about together. Entirely optional — your child can finish the rest alone.")
            + p("وإذا لاحظت أي خطأ في معلومة أو في طريقة تمثيل شيء ما، أخبرنا. نصحّح، ونعيد طباعة الورقة، ونرسلها لكل من اشترى — مجانًا.",
                "And if you spot an error in a fact or in how something is represented, tell us. We correct it, reprint the sheet, and send it free to everyone who bought that run.")
            + button("أبلغنا عن خطأ", "Report an error", "{{correction_url}}")
        )
    ),
)

email(
    "04-review-request",
    name="Review request",
    when="7–10 days after delivery. Once. Never twice.",
    subject_ar="كيف كانت التجربة مع طفلك؟",
    subject_en="How did it go?",
    preheader="رأيك الصادق — حتى لو لم يعجبك.",
    blocks=(
        block(
            h("كيف كانت التجربة؟", "How did it go?")
            + p("مضى أسبوع تقريبًا يا {{first_name}}. نحن علامة جديدة، وأول التقييمات هي كل ما لدينا.",
                "It's been about a week, {{first_name}}. We're a new brand, and the first reviews are all we have.")
            + p("إن كان لديك دقيقتان، اكتب رأيك — وإن أمكن أرفق صورة لما أنجزه طفلك. الصور من عملية شراء حقيقية هي ما يساعد الأهالي الآخرين على القرار.",
                "If you have two minutes, write what you thought — and if you can, add a photo of what your child made. Photos from a real purchase are what help other parents decide.")
            + button("اكتب رأيك", "Leave a review", "{{review_url}}")
            + callout(
                "إذا لم يعجبك، اكتب ذلك. ننشر كل تقييم كما هو، ولا نطلب تعديله أو حذفه، ولا نقدّم شيئًا مقابل تغييره. "
                "وإذا كانت هناك مشكلة نستطيع حلها، راسلنا أولًا وسنحلها.",
                "If you didn't like it, say so. We publish every review as written, never ask for one to be changed or removed, "
                "and never offer anything in exchange. If there's a problem we can fix, write to us first and we will.")
        )
    ),
)

email(
    "05-correction-notice",
    name="Content correction notice",
    when="When the cultural or editorial review confirms an error in a printed sheet. Sent to "
         "everyone who bought the affected run, not only to whoever reported it.",
    subject_ar="تصحيح في إحدى الأوراق — ونرسل لك بديلًا",
    subject_en="A correction, and a replacement sheet",
    preheader="وجدنا خطأ في ورقة {{sheet_number}}. نرسل لك نسخة مصححة مجانًا.",
    blocks=(
        block(
            h("تصحيح، ونسخة بديلة في الطريق", "A correction, and a replacement on its way")
            + p("نكتب إليك لأننا وجدنا خطأ في الورقة رقم {{sheet_number}} — {{sheet_title}}.",
                "We're writing because we found an error on sheet {{sheet_number}} — {{sheet_title}}.")
            + facts([
                ("ما كان مكتوبًا", "{{incorrect_text}}"),
                ("الصحيح", "{{correct_text}}"),
                ("كيف عرفنا", "{{how_found}}"),
            ])
            + callout(
                "أوقفنا بيع الكمية المتأثرة، وأعدنا طباعة الورقة. <b>سنرسل لك نسخة مصححة مجانًا، بدون أن تطلبها ودون أي رسوم شحن.</b>",
                "We've stopped selling the affected stock and reprinted the sheet. <b>A corrected copy is on its way to you free, without you having to ask and with no shipping charge.</b>")
            + p("نعتذر عن الخطأ. المنتج يقدّم نفسه كمصدر دقيق عن السعودية للأطفال، وهذا يعني أن الدقة مسؤوليتنا وليست تفصيلًا.",
                "We're sorry. This product presents itself as an accurate source about Saudi Arabia for children, which makes accuracy our responsibility rather than a detail.")
            + p("راجع المحتوى: {{reviewer_name}}.",
                "Content reviewed by: {{reviewer_name}}.")
        )
    ),
    footer_note="تصلك هذه الرسالة لأنك اشتريت من الكمية المتأثرة. هذه رسالة تصحيح وليست رسالة تسويقية.",
)

email(
    "06-founder-window-closing",
    name="Founder window closing",
    when="48 hours before the founder price ends. Once. The end date must already have been "
         "published on the page when the window opened.",
    subject_ar="ينتهي السعر التأسيسي بعد يومين",
    subject_en="The founder price ends in two days",
    preheader="ينتهي {{window_end_date}}. بعدها يرجع السعر إلى {{regular_price}} ريال.",
    blocks=(
        block(
            h("ينتهي السعر التأسيسي بعد يومين", "Two days left at the founder price")
            + p("كنت قد أبديت اهتمامًا بـ«ألوان السعودية» يا {{first_name}}. السعر التأسيسي ينتهي {{window_end_date}}.",
                "You'd registered interest in Colors of Saudi Arabia, {{first_name}}. The founder price ends {{window_end_date}}.")
            + facts([
                ("السعر التأسيسي", "{{founder_price}} ريال"),
                ("السعر بعد ذلك", "{{regular_price}} ريال"),
                ("ينتهي", "{{window_end_date}}"),
            ])
            + button("احجز نسختك", "Reserve a copy", "{{product_url}}")
            + p("وإذا لم يكن الوقت مناسبًا، لا بأس — لن نرسل تذكيرًا ثانيًا.",
                "And if the timing isn't right, that's fine — we won't send a second reminder.")
        )
    ),
    footer_note="تصلك هذه الرسالة لأنك طلبت أن نخبرك عند الإطلاق.",
)

email(
    "07-delay-notice",
    name="Delay notice",
    when="The moment you know, not when you have a new date. A parent who finds out late "
         "tells other parents.",
    subject_ar="تأخير في طلبك — وما سنفعله",
    subject_en="Your order is delayed — and what we're doing",
    preheader="نعتذر. إليك السبب، والموعد الجديد، وخيارك.",
    blocks=(
        block(
            h("طلبك تأخر", "Your order is delayed")
            + p("نكتب إليك بمجرد أن عرفنا، لا بعد أن نجد حلًا.",
                "We're writing as soon as we knew, not after we'd found a solution.")
            + facts([
                ("رقم الطلب", "{{order_number}}"),
                ("السبب", "{{delay_reason}}"),
                ("الموعد الجديد", "{{new_delivery_window}}"),
            ])
            + callout(
                "إذا كان هذا لا يناسبك، ردّ على هذه الرسالة وسنعيد لك المبلغ كاملًا فورًا، بدون أي أسئلة. "
                "وإذا اخترت الانتظار، سنتحمل نحن أي فرق في تكلفة الشحن السريع.",
                "If that doesn't work for you, reply to this email and we'll refund you in full immediately, no questions. "
                "If you'd rather wait, any expedited shipping cost is on us.")
            + p("نعتذر عن ذلك.", "We're sorry.")
        )
    ),
    footer_note="تصلك هذه الرسالة لأن لديك طلبًا معنا.",
)


# --------------------------------------------------------------------------- plain text
def to_plain(html_doc, subject_ar, subject_en):
    """Derive the plain-text alternative from the rendered HTML.

    Every HTML email needs a text part — some clients show it, some filters weight it, and a
    missing one is a deliverability signal. Deriving it means it cannot drift from the HTML.
    """
    body = html_doc.split("</head>", 1)[1]
    body = re.sub(r"<style.*?</style>", "", body, flags=re.S)
    body = re.sub(r'<div style="display:none.*?</div>', "", body, flags=re.S)
    body = re.sub(r"<a [^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", r"\2 (\1)", body, flags=re.S)
    body = re.sub(r"<br\s*/?>", "\n", body)
    body = re.sub(r"</(p|h1|tr|table|td)>", "\n", body)
    body = re.sub(r"<[^>]+>", "", body)
    body = html.unescape(body)
    lines = [ln.strip() for ln in body.splitlines()]
    out, blank = [], False
    for ln in lines:
        if ln:
            out.append(ln)
            blank = False
        elif not blank:
            out.append("")
            blank = True
    return f"{subject_ar}\n{subject_en}\n{'=' * 40}\n\n" + "\n".join(out).strip() + "\n"


# --------------------------------------------------------------------------- gallery
def gallery(rendered):
    cards = ""
    for slug, meta in EMAILS.items():
        cards += f"""
    <article>
      <header>
        <h2>{meta['name']}</h2>
        <p class="slug">{slug}</p>
      </header>
      <dl>
        <dt>Subject</dt><dd class="ar">{meta['subject_ar']}<span>{meta['subject_en']}</span></dd>
        <dt>Preheader</dt><dd class="ar">{meta['preheader']}</dd>
        <dt>When</dt><dd>{meta['when']}</dd>
      </dl>
      <iframe src="{slug}.html" title="{meta['name']}" loading="lazy"></iframe>
      <p class="links"><a href="{slug}.html">open HTML</a> · <a href="{slug}.txt">plain text</a></p>
    </article>"""

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email set — preview</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ margin:0; padding:32px 20px; background:#f4f2ee; color:#1f2d27;
    font:15px/1.6 'Segoe UI', system-ui, sans-serif; }}
  .wrap {{ max-width:1180px; margin:0 auto; }}
  h1 {{ font-size:28px; margin:0 0 6px; }}
  .lede {{ color:#5f6b64; max-width:70ch; margin:0 0 8px; }}
  .note {{ background:#fdf3e9; border-left:3px solid #c8763c; padding:12px 16px;
    border-radius:0 6px 6px 0; font-size:13.5px; max-width:80ch; margin:16px 0 32px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:22px; }}
  article {{ background:#fff; border:1px solid #e5ded1; border-radius:12px; overflow:hidden;
    display:flex; flex-direction:column; }}
  header {{ padding:16px 18px 10px; }}
  h2 {{ font-size:16px; margin:0; }}
  .slug {{ margin:2px 0 0; font-size:11px; color:#667269; font-family:ui-monospace,monospace; }}
  dl {{ margin:0; padding:0 18px 12px; font-size:12.5px; }}
  dt {{ color:#667269; font-size:10px; text-transform:uppercase; letter-spacing:.08em; margin-top:9px; }}
  dd {{ margin:2px 0 0; color:#4a5a52; }}
  dd.ar {{ direction:rtl; text-align:right; font-size:14px; color:#1f2d27; }}
  dd.ar span {{ display:block; direction:ltr; text-align:left; font-size:11.5px; color:#667269; }}
  iframe {{ width:100%; height:520px; border:0; border-top:1px solid #e5ded1; background:#faf7f1; }}
  .links {{ margin:0; padding:10px 18px; font-size:12px; border-top:1px solid #e5ded1; }}
  a {{ color:#1f6b4a; }}
</style></head>
<body><div class="wrap">
  <h1>Transactional email set</h1>
  <p class="lede">{len(EMAILS)} emails covering the founder preorder through the first review
  request. Arabic-first, table layout, inline styles, no webfonts — built for email clients
  rather than browsers.</p>
  <p class="note"><b>Not ready to send.</b> Merge tags are <code>{{{{double_brace}}}}</code> and
  must be mapped to your platform's syntax, and the CR number, contact and policy URLs are still
  placeholders. See <code>README.md</code> for the mapping table and the send rules.</p>
  <div class="grid">{cards}
  </div>
</div></body></html>"""


# --------------------------------------------------------------------------- build
def main():
    rendered = {}
    for slug, meta in EMAILS.items():
        doc = shell(meta["preheader"], meta["blocks"], meta.get("footer_note", ""))
        (HERE / f"{slug}.html").write_text(doc, encoding="utf-8")
        (HERE / f"{slug}.txt").write_text(
            to_plain(doc, meta["subject_ar"], meta["subject_en"]), encoding="utf-8")
        rendered[slug] = doc
        print(f"Wrote {slug}.html + .txt  — {meta['name']}")

    (HERE / "index.html").write_text(gallery(rendered), encoding="utf-8")
    print(f"Wrote index.html — preview gallery")

    tags = sorted({t for doc in rendered.values() for t in re.findall(r"\{\{(\w+)\}\}", doc)})
    print(f"\n{len(tags)} merge tags emitted — map every one before sending:")
    for i in range(0, len(tags), 4):
        print("  " + "  ".join(f"{{{{{t}}}}}" for t in tags[i:i + 4]))
    print("\nUnmapped tags ship to customers as literal braces. Check against README.md.")


if __name__ == "__main__":
    main()
