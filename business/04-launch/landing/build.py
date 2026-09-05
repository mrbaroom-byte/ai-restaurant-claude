#!/usr/bin/env python3
"""Generate the three landing-page cells from one shared template.

A message test is only valid if the cells are identical apart from the message. Hand-editing
three HTML files guarantees they drift, so they are generated instead: everything below the
hero comes from one string, and only MESSAGE_CELLS differs.

Output:  landing/a/index.html   Cell A - creative-learning lead  (recommended)
         landing/b/index.html   Cell B - culture lead
         landing/c/index.html   Cell C - screen-balance lead

Run:  python3 business/04-launch/landing/build.py
"""

import difflib
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
CONFIG = json.loads((HERE.parents[1] / "brand.config.json").read_text(encoding="utf-8"))

BRAND_AR = CONFIG["masterbrand"]["arabic"]
BRAND_EN = CONFIG["masterbrand"]["latin"]
PRICE = CONFIG["pricing_test"]["founder_preorder"]

# ---------------------------------------------------------------------------
# THE ONLY THING THAT DIFFERS BETWEEN CELLS
# ---------------------------------------------------------------------------
MESSAGE_CELLS = {
    "a": {
        "name": "Creative-learning lead",
        "hero_ar": "وقت إبداعي يعلّم",
        "hero_en": "Creative time that teaches",
        "sub_ar": "عشرون ورقة إبداعية بعيدة عن الشاشة، مستوحاة من السعودية، لأعمار ٥–٨.",
        "sub_en": "Twenty screen-light creative sheets inspired by Saudi Arabia, for ages 5–8.",
        "hypothesis": "Learning value plus ease will create the broadest qualified intent.",
    },
    "b": {
        "name": "Culture lead",
        "hero_ar": "اكتشف السعودية، لونًا بلون",
        "hero_en": "Discover Saudi Arabia, one color at a time",
        "sub_ar": "رحلة إبداعية ثنائية اللغة بين الأماكن والطبيعة والعادات، لأعمار ٥–٨.",
        "sub_en": "A bilingual creative journey through places, nature and traditions, for ages 5–8.",
        "hypothesis": "Cultural connection will create stronger differentiation.",
    },
    "c": {
        "name": "Screen-balance lead",
        "hero_ar": "إجابة أفضل لـ«أنا ملليت»",
        "hero_en": 'A better answer to "I\'m bored"',
        "sub_ar": "افتح الدفتر. اختر صفحة. أبدع بدون شاشة ثانية. لأعمار ٥–٨.",
        "sub_en": "Open the pad. Choose a page. Create without another screen. Ages 5–8.",
        "hypothesis": "Relief and convenience will improve conversion.",
    },
}

TEMPLATE = """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{hero_ar} · {brand_ar}</title>
<meta name="description" content="{sub_ar}">
<meta name="robots" content="noindex">
<!-- TEST CELL {cell_upper} — {cell_name}. Hypothesis: {hypothesis} -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root {{
    --ink:      #1f2d27;
    --ink-soft: #4a5a52;
    --muted:    #5f6b64;
    --paper:    #faf7f1;
    --card:     #ffffff;
    --line:     #e5ded1;
    --accent:   #1f6b4a;
    --accent-d: #17513a;
    --warm:     #c8763c;
    --warm-bg:  #fdf3e9;
    --radius:   14px;
    --shadow:   0 1px 2px rgba(31,45,39,.05), 0 8px 24px rgba(31,45,39,.06);
    color-scheme: light;
  }}
  * {{ box-sizing: border-box; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Tajawal", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 17px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }}
  .wrap {{ max-width: 1080px; margin: 0 auto; padding: 0 20px; }}
  .en {{
    direction: ltr; text-align: left;
    font-size: .84em; color: var(--muted); line-height: 1.55;
    display: block; margin-top: .35em;
  }}
  h1, h2, h3 {{ line-height: 1.25; margin: 0 0 .4em; font-weight: 800; letter-spacing: -.01em; }}
  h1 {{ font-size: clamp(2rem, 6vw, 3.4rem); }}
  h2 {{ font-size: clamp(1.4rem, 3.6vw, 2rem); }}
  h3 {{ font-size: 1.12rem; font-weight: 700; }}
  p  {{ margin: 0 0 1em; }}
  section {{ padding: clamp(48px, 8vw, 88px) 0; }}
  .rule {{ border: 0; border-top: 1px solid var(--line); margin: 0; }}

  /* ---- header ---- */
  header {{
    position: sticky; top: 0; z-index: 30;
    background: rgba(250,247,241,.92);
    backdrop-filter: saturate(1.4) blur(8px);
    border-bottom: 1px solid var(--line);
  }}
  .bar {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; }}
  .logo {{ font-weight: 800; font-size: 1.3rem; letter-spacing: -.02em; }}
  .logo small {{ display: block; font-size: .62rem; font-weight: 500; color: var(--muted);
                 letter-spacing: .1em; text-transform: uppercase; }}

  /* ---- buttons ---- */
  .btn {{
    display: inline-block; background: var(--accent); color: #fff;
    padding: 15px 30px; border-radius: 999px; text-decoration: none;
    font-weight: 700; font-size: 1.02rem; border: 0; cursor: pointer;
    transition: background .15s ease, transform .15s ease;
  }}
  .btn:hover {{ background: var(--accent-d); transform: translateY(-1px); }}
  .btn.small {{ padding: 11px 22px; font-size: .92rem; }}
  .btn.ghost {{ background: transparent; color: var(--accent); border: 1.5px solid var(--accent); }}
  .btn.ghost:hover {{ background: var(--accent); color: #fff; }}

  /* ---- hero ---- */
  .hero {{ padding: clamp(44px, 7vw, 84px) 0 clamp(36px, 5vw, 64px); }}
  .hero-grid {{ display: grid; grid-template-columns: 1.05fr .95fr; gap: clamp(28px, 5vw, 60px); align-items: center; }}
  .hero p.lede {{ font-size: clamp(1.05rem, 2.2vw, 1.25rem); color: var(--ink-soft); max-width: 34ch; }}
  .cta-row {{ display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 26px; }}
  .cta-note {{ font-size: .84rem; color: var(--muted); margin: 12px 0 0; }}

  /* ---- the pad illustration (placeholder for real product photography) ---- */
  .pad {{
    background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 22px; position: relative;
  }}
  .pad-inner {{
    aspect-ratio: 210 / 297; border: 1px dashed var(--line); border-radius: 6px;
    display: grid; place-content: center; text-align: center; gap: 6px;
    background: repeating-linear-gradient(45deg, #fff, #fff 12px, #fdfbf7 12px, #fdfbf7 24px);
    color: var(--muted); font-size: .9rem; padding: 20px;
  }}
  .pad-tag {{
    position: absolute; inset-inline-start: -10px; top: 22px; background: var(--warm);
    color: #fff; font-size: .74rem; font-weight: 700; padding: 6px 14px; border-radius: 999px;
  }}

  /* ---- proof bar ---- */
  .proofbar {{ background: var(--warm-bg); border-block: 1px solid var(--line); }}
  .proofbar ul {{ list-style: none; margin: 0; padding: 22px 0; display: grid;
                  grid-template-columns: repeat(4, 1fr); gap: 8px 24px; }}
  .proofbar li {{ font-size: .93rem; font-weight: 500; position: relative; padding-inline-start: 22px; }}
  .proofbar li::before {{ content: "◆"; position: absolute; inset-inline-start: 0; color: var(--warm); font-size: .7em; top: .35em; }}

  /* ---- cards ---- */
  .cards {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 34px; }}
  .card {{ background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
           padding: 26px 24px; box-shadow: var(--shadow); }}
  .card .num {{ font-size: .72rem; font-weight: 700; color: var(--warm); letter-spacing: .12em; }}
  .card p {{ font-size: .96rem; color: var(--ink-soft); margin-bottom: 0; }}

  /* ---- sheets grid ---- */
  .sheets {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 32px; }}
  .sheet {{
    aspect-ratio: 210 / 297; background: var(--card); border: 1px solid var(--line);
    border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between;
    padding: 10px; font-size: .74rem; color: var(--ink-soft);
  }}
  .sheet b {{ font-size: .82rem; color: var(--ink); font-weight: 700; line-height: 1.35; }}
  .sheet .n {{ color: var(--muted); font-size: .68rem; }}
  .sheet .d {{ color: var(--warm); letter-spacing: .08em; }}

  /* ---- trust table ---- */
  .trust {{ margin-top: 30px; border: 1px solid var(--line); border-radius: var(--radius);
            overflow: hidden; background: var(--card); }}
  .trust-row {{ display: grid; grid-template-columns: 1fr 1.35fr; gap: 0; border-bottom: 1px solid var(--line); }}
  .trust-row:last-child {{ border-bottom: 0; }}
  .trust-q {{ padding: 18px 22px; font-weight: 700; background: #fcfaf6; }}
  .trust-a {{ padding: 18px 22px; color: var(--ink-soft); font-size: .95rem; }}

  /* ---- honesty block ---- */
  .honest {{ background: var(--card); border: 1px solid var(--line); border-inline-start: 4px solid var(--warm);
             border-radius: var(--radius); padding: 28px 30px; }}

  /* ---- preorder ---- */
  .order {{ background: var(--accent); color: #fff; }}
  .order h2 {{ color: #fff; }}
  .order .wrap {{ display: grid; grid-template-columns: 1fr 1fr; gap: clamp(24px, 4vw, 52px); align-items: start; }}
  .order p {{ color: rgba(255,255,255,.86); }}
  .order .en {{ color: rgba(255,255,255,.6); }}
  .price {{ font-size: 2.6rem; font-weight: 800; }}
  .price small {{ font-size: .9rem; font-weight: 500; opacity: .8; }}
  form {{ background: var(--card); border-radius: var(--radius); padding: 26px; color: var(--ink); }}
  label {{ display: block; font-weight: 700; font-size: .9rem; margin-bottom: 6px; }}
  input, select {{
    width: 100%; padding: 13px 15px; border: 1.5px solid var(--line); border-radius: 10px;
    font: inherit; font-size: .98rem; margin-bottom: 16px; background: #fff; color: var(--ink);
  }}
  input:focus, select:focus {{ outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }}
  .consent {{ display: flex; gap: 10px; align-items: flex-start; font-size: .84rem;
              color: var(--ink-soft); margin-bottom: 18px; font-weight: 400; }}
  .consent input {{ width: auto; margin: 3px 0 0; flex-shrink: 0; }}
  form .btn {{ width: 100%; }}
  .formnote {{ font-size: .78rem; color: var(--muted); margin: 12px 0 0; text-align: center; }}
  .thanks {{ display: none; text-align: center; padding: 30px 10px; }}
  .thanks.on {{ display: block; }}
  form.done .fields {{ display: none; }}

  /* ---- faq ---- */
  details {{ background: var(--card); border: 1px solid var(--line); border-radius: 10px;
             padding: 16px 20px; margin-bottom: 10px; }}
  details[open] {{ border-color: var(--accent); }}
  summary {{ font-weight: 700; cursor: pointer; list-style: none; }}
  summary::-webkit-details-marker {{ display: none; }}
  summary::after {{ content: "+"; float: inline-end; color: var(--warm); font-weight: 800; }}
  details[open] summary::after {{ content: "−"; }}
  details p {{ margin: 12px 0 0; color: var(--ink-soft); font-size: .95rem; }}

  footer {{ background: #fff; border-top: 1px solid var(--line); padding: 40px 0;
            font-size: .85rem; color: var(--muted); }}
  footer a {{ color: var(--ink-soft); }}

  @media (max-width: 900px) {{
    .hero-grid, .order .wrap {{ grid-template-columns: 1fr; }}
    .cards {{ grid-template-columns: 1fr; }}
    .proofbar ul {{ grid-template-columns: repeat(2, 1fr); }}
    .sheets {{ grid-template-columns: repeat(3, 1fr); }}
    .trust-row {{ grid-template-columns: 1fr; }}
    .trust-q {{ padding-bottom: 4px; }}
  }}
  @media (max-width: 520px) {{
    .sheets {{ grid-template-columns: repeat(2, 1fr); }}
    .proofbar ul {{ grid-template-columns: 1fr; }}
  }}
</style>
</head>
<body data-cell="{cell}">

<header>
  <div class="wrap bar">
    <div class="logo">{brand_ar}<small>{brand_en} · {descriptor_en}</small></div>
    <a class="btn small" href="#order" data-ev="nav_cta">احجز نسختك<span class="en">Preorder</span></a>
  </div>
</header>

<!-- ============ HERO — THE ONLY BLOCK THAT VARIES BY CELL ============ -->
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <h1>{hero_ar}<span class="en">{hero_en}</span></h1>
      <p class="lede">{sub_ar}<span class="en">{sub_en}</span></p>
      <div class="cta-row">
        <a class="btn" href="#sheets" data-ev="hero_primary">شاهد الأوراق العشرين<span class="en">Explore all 20 sheets</span></a>
        <a class="btn ghost" href="#order" data-ev="hero_secondary">احجز نسختك<span class="en">Preorder</span></a>
      </div>
      <p class="cta-note">صُنع لأيدٍ فضولية. متجذّر في الوطن.<span class="en">Made for curious hands. Rooted in home.</span></p>
    </div>
    <div class="pad">
      <span class="pad-tag">٢٠ ورقة · 20 sheets</span>
      <div class="pad-inner">
        <strong>صورة المنتج الحقيقي</strong>
        <span>Real product photography goes here — flip-through video,<br>macro paper shot, scale-in-hand. Never renders only.</span>
      </div>
    </div>
  </div>
</section>
<!-- ============ END OF CELL-SPECIFIC CONTENT ============ -->

<div class="proofbar">
  <div class="wrap">
    <ul>
      <li>أعمار ٥–٨ <span class="en">Ages 5–8</span></li>
      <li>ورق فاخر بوجه واحد <span class="en">Single-sided premium paper</span></li>
      <li>أسئلة ثنائية اللغة، العربية أولًا <span class="en">Arabic-first bilingual prompts</span></li>
      <li>أوراق قابلة للفصل والتعليق <span class="en">Tear-out display pages</span></li>
    </ul>
  </div>
</div>

<section>
  <div class="wrap">
    <h2>ثلاث طبقات في كل ورقة<span class="en">Three layers on every sheet</span></h2>
    <p style="max-width:56ch;color:var(--ink-soft)">ليست دفتر تلوين، ولا ورقة واجبات. كل ورقة تُلوَّن، وتُلاحَظ، ويُتحدَّث عنها.
      <span class="en">Not a coloring book, and not a worksheet. Every sheet is colored, noticed, and talked about.</span></p>
    <div class="cards">
      <div class="card">
        <div class="num">٠١ — DISCOVER</div>
        <h3>سؤال اكتشاف واحد</h3>
        <p>معلومة قصيرة أو سؤال ملاحظة على كل ورقة، بالعربية أولًا. يجعل الوقت مفيدًا دون أن يتحول إلى درس.
          <span class="en">One short discovery fact or observation prompt per sheet, Arabic first — so the time is visibly purposeful without becoming a lesson.</span></p>
      </div>
      <div class="card">
        <div class="num">٠٢ — CREATE</div>
        <h3>دعوة مفتوحة للإبداع</h3>
        <p>أضف، تخيّل، صمّم، احكِ. الطفل لا يملأ الفراغات فقط، بل يضيف شيئًا من عنده.
          <span class="en">Add, imagine, design, tell. An open-ended prompt on selected pages, so the child is not only filling in.</span></p>
      </div>
      <div class="card">
        <div class="num">٠٣ — TOGETHER</div>
        <h3>سؤال صغير للحديث معًا</h3>
        <p>على سبع أوراق فقط، سؤال اختياري تتحدثون فيه معًا. اختياري تمامًا — الطفل يستطيع أن يكمل وحده.
          <span class="en">On seven sheets only, an optional prompt to talk about together. Entirely optional — a child can finish alone.</span></p>
      </div>
    </div>
  </div>
</section>

<hr class="rule">

<section id="sheets">
  <div class="wrap">
    <h2>الأوراق العشرون<span class="en">All twenty sheets</span></h2>
    <p style="max-width:56ch;color:var(--ink-soft)">طبيعة، وأماكن، وحِرَف، وحياة يومية، وسعودية اليوم والغد — وورقة أخيرة فارغة تمامًا.
      <span class="en">Nature, places, craft, everyday life, and the Saudi Arabia of today and tomorrow — ending with one page left completely open.</span></p>
    <div class="sheets">{sheets}</div>
    <p class="cta-note" style="margin-top:22px">الأرقام تدل على مستوى التفصيل: ● سهل · ●● متوسط · ●●● مفصّل
      <span class="en">Circles show detail level: ● easy · ●● medium · ●●● detailed. Every sheet is single-sided, so the back stays clean for display.</span></p>
  </div>
</section>

<hr class="rule">

<section>
  <div class="wrap">
    <h2>قبل أن تشتري من علامة لا تعرفها<span class="en">Before you buy from a brand you don't know</span></h2>
    <div class="trust">
      <div class="trust-row">
        <div class="trust-q">هل يناسب طفلي؟<span class="en">Is it right for my child?</span></div>
        <div class="trust-a">أساسًا لأعمار ٥–٨. كل ورقة تحمل أيقونة صعوبة، والجلسة الواحدة تستغرق ١٥–٢٠ دقيقة تقريبًا. أغلب الأطفال في هذا العمر يكملون ورقة بمفردهم.
          <span class="en">Primarily ages 5–8. Every sheet carries a difficulty icon; one session runs roughly 15–20 minutes. Most children this age can complete a sheet independently.</span></div>
      </div>
      <div class="trust-row">
        <div class="trust-q">هل سيبدو كالصور؟<span class="en">Will it look like the photos?</span></div>
        <div class="trust-a">فيديو تصفّح كامل، وصورة قريبة للورق، وصورة بحجم اليد — من نموذج مطبوع حقيقي، لا من تصميم رقمي.
          <span class="en">Full flip-through video, a macro shot of the paper, and a scale-in-hand photo — from a real printed prototype, never renders alone.</span></div>
      </div>
      <div class="trust-row">
        <div class="trust-q">هل العربية والمحتوى دقيقان؟<span class="en">Are the Arabic and the culture accurate?</span></div>
        <div class="trust-a">كل ورقة راجعها مختص تحرير ومراجعة ثقافية مستقلة، ونعلن اسمه. وإذا وجدت خطأ، نصححه ونعيد طباعة الورقة ونرسلها لكل من اشترى — مجانًا.
          <span class="en">Every sheet is reviewed by a named independent editorial and cultural reviewer. If you find an error, we correct it, reprint the sheet, and send it free to everyone who bought that run.</span></div>
      </div>
      <div class="trust-row">
        <div class="trust-q">هل البائع موثوق؟<span class="en">Is this seller reliable?</span></div>
        <div class="trust-a">رقم السجل التجاري ووسيلة تواصل مباشرة في أسفل الصفحة، مع مدة الشحن وسياسة الإرجاع والاسترجاع مكتوبة بوضوح.
          <span class="en">Commercial registration and a direct contact in the footer, with the shipping window and the return and refund policy stated plainly.</span></div>
      </div>
      <div class="trust-row">
        <div class="trust-q">هل الدفع آمن؟<span class="en">Is checkout safe?</span></div>
        <div class="trust-a">دفع آمن عبر مدى والبطاقات، ورسوم الشحن معلنة قبل الدفع — بدون مفاجآت في آخر خطوة.
          <span class="en">Secure checkout with mada and cards, with shipping shown before payment — no surprises at the last step.</span></div>
      </div>
    </div>
  </div>
</section>

<hr class="rule">

<section>
  <div class="wrap" style="max-width:760px">
    <div class="honest">
      <h2 style="font-size:1.35rem">نحن جديدون، ولن ندّعي غير ذلك<span class="en">We're new, and we won't pretend otherwise</span></h2>
      <p>ليس لدينا آلاف التقييمات بعد، لأننا لم نبِع بعد. ما لدينا: نموذج مطبوع حقيقي جرّبه أطفال، ومراجعة ثقافية مستقلة، وسعر تأسيسي لمن يطلب أولًا — ونشر كل تقييم كما هو، بصورة موثّقة من عملية شراء حقيقية.
        <span class="en">We don't have thousands of reviews, because we haven't sold anything yet. What we do have: a real printed prototype tested with children, an independent cultural review, a founder price for those who order first — and a commitment to publish every review as written, with a verified photo from a real purchase.</span></p>
      <p style="margin-bottom:0">لن نستخدم عدّادات مخزون وهمية، ولا تقييمات مدفوعة معروضة كآراء عملاء. أي محتوى برعاية سيُعلَن أنه إعلان.
        <span class="en">No fake stock counters, and no paid content presented as customer reviews. Any sponsored content will be labelled as an ad.</span></p>
    </div>
  </div>
</section>

<section class="order" id="order">
  <div class="wrap">
    <div>
      <h2>احجز نسختك التأسيسية<span class="en">Reserve a founder copy</span></h2>
      <div class="price">{price} ريال <small>شامل الضريبة · VAT included</small></div>
      <p>سعر تأسيسي بعدد محدود، لمن يطلب قبل الإطلاق. الشحن داخل المملكة، والتسليم في نوفمبر ٢٠٢٦.
        <span class="en">A limited founder price for orders placed before launch. Shipping within Saudi Arabia, delivery November 2026.</span></p>
      <p style="font-size:.9rem">لن يُخصم أي مبلغ الآن. سنراسلك حين تصبح النسخ جاهزة، ويمكنك التراجع في أي وقت.
        <span class="en">Nothing is charged now. We'll contact you when copies are ready, and you can change your mind at any point.</span></p>
    </div>
    <form id="preorder" novalidate>
      <div class="fields">
        <input type="hidden" name="cell" value="{cell}">
        <input type="hidden" name="price_tested" value="{price}">
        <label for="name">الاسم <span class="en">Name</span></label>
        <input id="name" name="name" type="text" autocomplete="name" required>

        <label for="email">البريد الإلكتروني <span class="en">Email</span></label>
        <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required>

        <label for="city">المدينة <span class="en">City</span></label>
        <select id="city" name="city" required>
          <option value="">اختر…</option>
          <option value="riyadh">الرياض · Riyadh</option>
          <option value="jeddah">جدة · Jeddah</option>
          <option value="dammam">الدمام والخبر · Dammam–Khobar</option>
          <option value="other">مدينة أخرى · Another city</option>
        </select>

        <label for="age">عمر الطفل <span class="en">Child's age</span></label>
        <select id="age" name="child_age" required>
          <option value="">اختر…</option>
          <option>4</option><option>5</option><option>6</option>
          <option>7</option><option>8</option><option>9</option>
          <option value="other">عمر آخر · Another age</option>
        </select>

        <label class="consent">
          <input type="checkbox" name="consent" required>
          <span>أوافق على التواصل معي بخصوص هذا المنتج فقط. يمكنني إلغاء الاشتراك في أي وقت.
            <span class="en">I agree to be contacted about this product only. I can unsubscribe at any time.</span></span>
        </label>

        <button class="btn" type="submit" data-ev="preorder_submit">احجز نسختي<span class="en">Reserve my copy</span></button>
        <p class="formnote">لن نشارك بياناتك مع أي جهة أخرى.<span class="en">We will not share your details with anyone.</span></p>
      </div>
      <div class="thanks" id="thanks">
        <h3>تم الحجز 🎉<span class="en">You're on the list</span></h3>
        <p style="color:var(--ink-soft)">سنراسلك حين تصبح النسخ جاهزة. شكرًا لثقتك المبكرة.
          <span class="en">We'll be in touch when copies are ready. Thank you for the early trust.</span></p>
      </div>
    </form>
  </div>
</section>

<section>
  <div class="wrap" style="max-width:820px">
    <h2>أسئلة متكررة<span class="en">Questions parents ask</span></h2>
    <details><summary>ما الفرق بينه وبين دفتر تلوين عادي؟<span class="en">How is this different from an ordinary coloring book?</span></summary>
      <p>كل ورقة تحمل سؤال اكتشاف قصير ودعوة إبداعية مفتوحة، والأوراق بوجه واحد وقابلة للفصل حتى يعلّقها الطفل. الهدف أن يضيف الطفل شيئًا، لا أن يملأ الفراغات فقط.
        <span class="en">Every sheet carries a short discovery prompt and an open-ended creative invitation, and sheets are single-sided and tear-out so a child can display the finished work. The aim is for the child to add something, not only to fill in.</span></p></details>
    <details><summary>هل يناسب عمر ٤ أو ٩ سنوات؟<span class="en">Will it suit a 4- or 9-year-old?</span></summary>
      <p>صُمّم أساسًا لأعمار ٥–٨. طفل في الرابعة سيستمتع بالأوراق الأسهل مع مساعدة، وطفل في التاسعة سيجد الأوراق المفصّلة مناسبة — لكننا لا ندّعي أن مستوى واحدًا يناسب الجميع بالتساوي.
        <span class="en">It is designed primarily for ages 5–8. A four-year-old will enjoy the easier sheets with help, and a nine-year-old will find the detailed sheets suitable — but we won't claim one difficulty fits every age equally.</span></p></details>
    <details><summary>هل الأقلام مرفقة؟<span class="en">Are pencils included?</span></summary>
      <p>ليست مرفقة مع الدفتر الأساسي. الورق يناسب الأقلام الخشبية وأقلام الشمع وأقلام التلوين اللبادية.
        <span class="en">Not with the core pad. The paper suits colored pencils, wax crayons and felt-tip markers.</span></p></details>
    <details><summary>متى يصل الطلب؟<span class="en">When will it arrive?</span></summary>
      <p>الحجوزات التأسيسية تُشحن في نوفمبر ٢٠٢٦. سنراسلك بتاريخ الشحن المحدد قبل الإرسال.
        <span class="en">Founder reservations ship in November 2026. We'll email you a confirmed shipping date before dispatch.</span></p></details>
    <details><summary>ماذا لو لم يعجبني؟<span class="en">What if I don't like it?</span></summary>
      <p>سياسة الإرجاع مكتوبة بالكامل في أسفل الصفحة، وتشمل حقك في الإرجاع خلال المدة النظامية.
        <span class="en">The full return policy is linked in the footer, including your statutory right to return.</span></p></details>
  </div>
</section>

<footer>
  <div class="wrap">
    <p><strong>{brand_ar} · {brand_en}</strong> — {descriptor_ar} · {descriptor_en}</p>
    <p>
      <!-- REQUIRED BEFORE THIS PAGE TAKES REAL ORDERS. See 05-operations/compliance-checklist.md -->
      السجل التجاري: <span data-todo>[CR NUMBER]</span> ·
      البريد: <a href="mailto:[EMAIL]">[EMAIL]</a> ·
      <a href="#">سياسة الإرجاع والاسترجاع</a> ·
      <a href="#">سياسة الخصوصية</a> ·
      <a href="#">الشحن والتوصيل</a> ·
      <a href="#">تصحيح خطأ في المحتوى</a>
    </p>
    <p style="font-size:.78rem;opacity:.75">الأسعار شاملة ضريبة القيمة المضافة.<span class="en">Prices include VAT. Test page — cell {cell_upper}.</span></p>
  </div>
</footer>

<script>
(function () {{
  "use strict";
  var CELL = document.body.dataset.cell;

  // --- analytics -----------------------------------------------------------
  // Replace `track` with your real analytics call. Every event carries the cell
  // so the message test can be read without a separate join.
  function track(name, extra) {{
    var payload = Object.assign({{ event: name, cell: CELL }}, extra || {{}});
    (window.dataLayer = window.dataLayer || []).push(payload);
    if (typeof window.gtag === "function") window.gtag("event", name, payload);
    if (console && console.debug) console.debug("[track]", payload);
  }}

  track("page_view");

  document.querySelectorAll("[data-ev]").forEach(function (el) {{
    el.addEventListener("click", function () {{ track(el.dataset.ev); }});
  }});

  // Scroll depth — tells you whether the hero or the page lost them.
  var marks = [25, 50, 75, 100], seen = {{}};
  window.addEventListener("scroll", function () {{
    var h = document.documentElement;
    var pct = (h.scrollTop + window.innerHeight) / h.scrollHeight * 100;
    marks.forEach(function (m) {{
      if (pct >= m && !seen[m]) {{ seen[m] = 1; track("scroll_" + m); }}
    }});
  }}, {{ passive: true }});

  document.querySelectorAll("details").forEach(function (d) {{
    d.addEventListener("toggle", function () {{
      if (d.open) track("faq_open", {{ q: d.querySelector("summary").textContent.trim().slice(0, 40) }});
    }});
  }});

  // --- preorder form -------------------------------------------------------
  // TODO before going live: point ENDPOINT at your form handler or store.
  // Until then submissions are logged locally and the thank-you state still shows,
  // which is enough to rehearse the page but NOT enough to run the paid test.
  var ENDPOINT = "";

  var form = document.getElementById("preorder");
  form.addEventListener("submit", function (e) {{
    e.preventDefault();
    if (!form.checkValidity()) {{ form.reportValidity(); track("preorder_invalid"); return; }}

    var data = Object.fromEntries(new FormData(form).entries());
    track("preorder_submit_valid", {{ city: data.city, child_age: data.child_age }});

    function done() {{
      form.classList.add("done");
      document.getElementById("thanks").classList.add("on");
      track("preorder_success", {{ city: data.city }});
    }}

    if (!ENDPOINT) {{ console.warn("No ENDPOINT set — submission not sent.", data); done(); return; }}

    fetch(ENDPOINT, {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      body: JSON.stringify(data)
    }}).then(function (r) {{
      if (!r.ok) throw new Error("HTTP " + r.status);
      done();
    }}).catch(function (err) {{
      console.error(err);
      track("preorder_error");
      alert("تعذّر إرسال الطلب. حاول مرة أخرى.\\nSomething went wrong. Please try again.");
    }});
  }});
}}());
</script>
</body>
</html>
"""

# The 20 sheets come from 02-product/sheets.json — the single source of truth shared with
# the print prototype, so the site and the product can never drift apart.
_SHEET_DATA = json.loads(
    (HERE.parents[1] / "02-product" / "sheets.json").read_text(encoding="utf-8")
)["sheets"]
SHEETS = [(s["ar"], s["en"], s["difficulty"]) for s in _SHEET_DATA]
if len(SHEETS) != 20:
    raise SystemExit(f"Expected 20 sheets in sheets.json, found {len(SHEETS)}.")

ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def render_sheets():
    out = []
    for i, (ar, en, diff) in enumerate(SHEETS, start=1):
        dots = "●" * diff if diff else "○"
        out.append(
            f'<div class="sheet"><span class="n">{str(i).translate(ARABIC_DIGITS)} · {i}</span>'
            f'<b>{ar}<span class="en">{en}</span></b>'
            f'<span class="d">{dots}</span></div>'
        )
    return "\n      ".join(out)


def main():
    sheets_html = render_sheets()
    for cell, m in MESSAGE_CELLS.items():
        html = TEMPLATE.format(
            cell=cell,
            cell_upper=cell.upper(),
            cell_name=m["name"],
            hypothesis=m["hypothesis"],
            hero_ar=m["hero_ar"],
            hero_en=m["hero_en"],
            sub_ar=m["sub_ar"],
            sub_en=m["sub_en"],
            brand_ar=BRAND_AR,
            brand_en=BRAND_EN,
            descriptor_ar=CONFIG["descriptor"]["ar"],
            descriptor_en=CONFIG["descriptor"]["en"],
            price=PRICE,
            sheets=sheets_html,
        )
        d = HERE / cell
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(html, encoding="utf-8")
        print(f"Wrote {d / 'index.html'}  ({m['name']})")

    verify()


def verify():
    """A message test is only valid if the cells are identical apart from the message.

    Everything below the hero must match byte for byte once the two legitimate per-cell
    identifiers are normalised: the hidden form field that attributes a preorder, and the
    cell label in the footer. Anything else differing means the test cannot attribute a
    result to the message, so this fails loudly rather than warning.
    """
    marker = "<!-- ============ END OF CELL-SPECIFIC CONTENT ============ -->"
    bodies = {}
    for cell in MESSAGE_CELLS:
        text = (HERE / cell / "index.html").read_text(encoding="utf-8")
        below = text.split(marker, 1)[1]
        below = re.sub(r'name="cell" value="[abc]"', 'name="cell" value="X"', below)
        below = re.sub(r"cell [ABC]\.", "cell X.", below)
        bodies[cell] = below

    reference = bodies["a"]
    drifted = [c for c, v in bodies.items() if v != reference]
    if drifted:
        for c in drifted:
            diff = list(difflib.unified_diff(
                reference.splitlines(), bodies[c].splitlines(),
                fromfile="cell a", tofile=f"cell {c}", lineterm="", n=1))
            print("\n".join(diff[:40]))
        raise SystemExit(
            f"\nINVALID TEST: cells {drifted} differ below the hero. "
            "Fix the template — a message test with drifting cells cannot attribute its result."
        )
    print("\nVerified: below-hero content is identical across all three cells. "
          "The only variable is the message.")


if __name__ == "__main__":
    main()
