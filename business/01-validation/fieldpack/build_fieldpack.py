#!/usr/bin/env python3
"""Generate fieldpack.pdf — the paper a researcher carries into the September sessions.

The instruments in 01-validation/ are written to be read. This turns them into forms to be
filled: consent to be signed before a child is observed, one capture sheet per parent, one
observation sheet per child, and a log for the incentives.

Contents
  1   Cover and daily checklist
  2   Parental consent — child session (Arabic)
  3   Parental consent — child session (English)
  4   Consent to record — parent interview (bilingual, one page)
  5   Screener, one page
  6-7 Facilitator's interview guide, abridged to what you glance at mid-session
  8+  Language bank capture sheet x12  (one per parent)
      Child observation sheet x15      (one per child)
      Incentive and receipt log

IMPORTANT: the consent forms are drafts. Saudi personal-data obligations (PDPL) apply to
everything collected here, and the sessions involve children. Have these reviewed by a legal
advisor before the first session, and adjust to whatever you actually intend to do with the
data. The promises in them are only worth making if you keep them.

Run:  python3 business/01-validation/fieldpack/build_fieldpack.py
"""

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
VALIDATION = HERE.parent
BUSINESS = VALIDATION.parent

sys.path.insert(0, str(BUSINESS))
from lib.render import ensure_fonts, font_face_css, render_pdf  # noqa: E402

FONT_DIR = HERE / "fonts"

N_PARENTS = 12
N_CHILDREN = 15


# ---------------------------------------------------------------- reusable bits
def field(label, sub="", width="100%", height="9mm"):
    return (f'<div class="f" style="width:{width}"><div class="fbox" style="height:{height}"></div>'
            f'<span class="flab">{label}{f"<i>{sub}</i>" if sub else ""}</span></div>')


def tick(text, sub=""):
    return f'<label class="tick"><span class="box"></span><span>{text}'\
           f'{f"<i>{sub}</i>" if sub else ""}</span></label>'


def page(cls, inner, footer=""):
    return (f'<section class="page {cls}"><div class="safe">{inner}'
            f'<div class="pfoot">{footer}</div></div></section>')


# ---------------------------------------------------------------- pages
def cover():
    return page("cover", f"""
<div class="chead">
  <p class="ceyebrow">حزمة العمل الميدانية<span>Field pack</span></p>
  <h1>سبرنت التحقق<span>Validation sprint</span></h1>
  <p class="cdates">٧ – ٣٠ سبتمبر ٢٠٢٦ · 7–30 September 2026</p>
</div>

<div class="cbox">
  <h2>Before you leave the house</h2>
  {tick("Prototype pad, unbranded", "one per session, plus a spare")}
  {tick("Three colouring media on the table", "wax crayons, colored pencils, felt-tip markers")}
  {tick("Consent forms — signed BEFORE any child session", "no consent, no session")}
  {tick("Timer, visible to you and not to the child")}
  {tick("This pack, with blank sheets for every booked session")}
  {tick("Incentive gift cards, and the receipt log")}
  {tick("A second identical sheet the child can keep")}
</div>

<div class="cbox warn">
  <h2>The four rules</h2>
  <ol>
    <li><b>Debrief the same day.</b> Fifteen minutes after each session, while the words are still exact. A session written up three days later has become an anecdote.</li>
    <li><b>Capture words, not scores.</b> The product page will be written out of the verbatim bank, not out of the draft copy.</li>
    <li><b>Never show and tell in the same breath.</b> You get one uncontaminated reveal per parent. Explain nothing until they have told you what it is.</li>
    <li><b>Record disconfirmation.</b> A sprint that produces only encouragement has failed — it means you led, and you find out in November at full production cost.</li>
  </ol>
</div>

<p class="cnote">Qualified throughout: a parent living in Saudi Arabia, with at least one child aged 4–9,
who has bought a physical children's product online in the last 6 months.
<b>Do not loosen this to hit a sample size.</b></p>
""")


CONSENT_INTRO_AR = """أنت مدعو مع طفلك للمشاركة في جلسة قصيرة لتجربة نموذج أولي لمنتج نشاط للأطفال.
الهدف هو معرفة كيف يستخدم الأطفال المنتج فعليًا، وما إذا كان مناسبًا لأعمارهم."""

CONSENT_INTRO_EN = """You and your child are invited to take part in a short session testing an
early prototype of a children's activity product. The purpose is to learn how children actually
use it, and whether it suits their age."""


def consent_ar():
    return page("form rtl", f"""
<h1 class="ftitle">نموذج موافقة ولي الأمر<span class="sub">جلسة تجربة مع طفل</span></h1>
<p class="lead">{CONSENT_INTRO_AR}</p>

<h2>ما الذي سيحدث</h2>
<ul class="plain">
  <li>تستغرق الجلسة من ١٥ إلى ٢٠ دقيقة.</li>
  <li>يجرّب طفلك النموذج ويلوّن كما يحب. لا يوجد صواب وخطأ، وليست اختبارًا لطفلك.</li>
  <li>نسجّل ملاحظات مكتوبة عن كيفية استخدامه: كم استمر، وهل احتاج مساعدة، وماذا قال.</li>
  <li>بعد الجلسة نسألك خمسة أسئلة قصيرة عمّا شاهدت.</li>
</ul>

<h2>حقوقك وحقوق طفلك</h2>
<ul class="plain">
  <li><b>المشاركة تطوعية بالكامل.</b> يمكنك الانسحاب في أي لحظة دون أن تذكر سببًا.</li>
  <li>نسأل طفلك مباشرةً إن كان يرغب بالمشاركة، وإذا رفض أو أراد التوقف في أي وقت، نتوقف فورًا.</li>
  <li>يمكنك طلب حذف بياناتكم في أي وقت حتى ٣٠ سبتمبر ٢٠٢٦.</li>
  <li>الرفض لا يؤثر على أي شيء، ويبقى مبلغ المكافأة مستحقًا لك.</li>
</ul>

<h2>البيانات</h2>
<ul class="plain">
  <li>لا نجمع اسم طفلك الكامل ولا اسم مدرسته ولا أي بيانات تعريفية عنه.</li>
  <li>تُحفظ الملاحظات على جهاز واحد، وتُستخدم لتطوير المنتج فقط.</li>
  <li><b>تُحذف الملاحظات والتسجيلات بعد كتابة التقرير</b>، ولا تُضاف إلى أي قائمة تسويقية.</li>
  <li>لا نشارك بياناتكم مع أي جهة أخرى.</li>
</ul>

<h2>التصوير — اختياري تمامًا</h2>
<p class="hint">الموافقة على التصوير ليست شرطًا للمشاركة. الرفض لا يغيّر شيئًا.</p>
{tick("أوافق على تصوير يدي طفلي والورقة فقط، دون وجهه، لأغراض البحث الداخلي.")}
{tick("لا أوافق على أي تصوير.")}
<p class="hint"><b>استخدام أي صورة في التسويق يتطلب إذنًا منفصلًا ومكتوبًا لتلك الحالة تحديدًا.</b>
لن يُستخدم وجه طفلك أو اسمه في أي مادة تسويقية إطلاقًا.</p>

<h2>الموافقة</h2>
{tick("قرأت ما سبق وفهمته، وأوافق على مشاركة طفلي.")}
<div class="frow">
  {field("اسم ولي الأمر", "", "48%")}
  {field("صلة القرابة", "", "48%")}
</div>
<div class="frow">
  {field("عمر الطفل", "", "22%")}
  {field("التاريخ", "", "30%")}
  {field("التوقيع", "", "44%")}
</div>
<div class="frow">{field("وسيلة تواصل (اختياري)", "لطلب حذف البيانات لاحقًا", "100%")}</div>
""", "مسودة — تحتاج مراجعة قانونية قبل الاستخدام · Draft — needs legal review before use")


def consent_en():
    return page("form", f"""
<h1 class="ftitle">Parental consent<span class="sub">Child prototype session</span></h1>
<p class="lead">{CONSENT_INTRO_EN}</p>

<h2>What will happen</h2>
<ul class="plain">
  <li>The session takes 15–20 minutes.</li>
  <li>Your child tries the prototype and colours however they like. There is no right or wrong, and this is not a test of your child.</li>
  <li>We take written notes on how they used it: how long, whether they needed help, and what they said.</li>
  <li>Afterwards we ask you five short questions about what you saw.</li>
</ul>

<h2>Your rights, and your child's</h2>
<ul class="plain">
  <li><b>Taking part is entirely voluntary.</b> You may withdraw at any moment without giving a reason.</li>
  <li>We ask your child directly whether they want to take part. If they decline, or want to stop at any point, we stop immediately.</li>
  <li>You may ask us to delete your data at any time up to 30 September 2026.</li>
  <li>Declining changes nothing, and the incentive is still yours.</li>
</ul>

<h2>Data</h2>
<ul class="plain">
  <li>We do not collect your child's full name, school, or any identifying details.</li>
  <li>Notes are kept on one device and used only to improve the product.</li>
  <li><b>Notes and any recordings are deleted after the write-up</b>, and are never added to a marketing list.</li>
  <li>We do not share your data with anyone else.</li>
</ul>

<h2>Photography — entirely optional</h2>
<p class="hint">Consenting to photography is not a condition of taking part. Declining changes nothing.</p>
{tick("I consent to photographs of my child's hands and the page only, with no face, for internal research.")}
{tick("I do not consent to any photography.")}
<p class="hint"><b>Any marketing use of an image requires separate written permission for that specific
use.</b> Your child's face and name will never appear in marketing material.</p>

<h2>Consent</h2>
{tick("I have read and understood the above, and I consent to my child taking part.")}
<div class="frow">
  {field("Parent / guardian name", "", "48%")}
  {field("Relationship to child", "", "48%")}
</div>
<div class="frow">
  {field("Child's age", "", "22%")}
  {field("Date", "", "30%")}
  {field("Signature", "", "44%")}
</div>
<div class="frow">{field("Contact (optional)", "so you can request deletion later", "100%")}</div>
""", "Draft — needs legal review before use · مسودة — تحتاج مراجعة قانونية")


def consent_recording():
    return page("form", f"""
<h1 class="ftitle">Consent to record<span class="sub">Parent interview · موافقة على التسجيل</span></h1>

<div class="two">
  <div class="col rtl">
    <h2>بالعربية</h2>
    <p>نودّ تسجيل صوت المقابلة فقط، حتى لا ننشغل بالكتابة أثناء حديثك.</p>
    <ul class="plain">
      <li>التسجيل صوتي فقط، بدون فيديو.</li>
      <li>يُستخدم لكتابة الملاحظات فقط، ثم <b>يُحذف بعد كتابة التقرير</b>.</li>
      <li>لا يُشارك مع أي جهة خارجية.</li>
      <li>يمكنك الرفض، وسنكتب الملاحظات يدويًا — لا فرق في المكافأة.</li>
      <li>يمكنك طلب إيقاف التسجيل في أي لحظة.</li>
    </ul>
  </div>
  <div class="col">
    <h2>In English</h2>
    <p>We would like to record audio of the interview only, so we are not writing while you talk.</p>
    <ul class="plain">
      <li>Audio only — no video.</li>
      <li>Used only to write up notes, then <b>deleted after the write-up</b>.</li>
      <li>Never shared outside the project.</li>
      <li>You may decline and we will take notes by hand — the incentive is unaffected.</li>
      <li>You may ask us to stop recording at any moment.</li>
    </ul>
  </div>
</div>

<div class="cbox">
{tick("I consent to audio recording · أوافق على التسجيل الصوتي")}
{tick("I do not consent — please take written notes · لا أوافق — يُرجى الكتابة يدويًا")}
</div>

<div class="frow">
  {field("Name · الاسم", "", "40%")}
  {field("Date · التاريخ", "", "26%")}
  {field("Signature · التوقيع", "", "30%")}
</div>

<p class="hint">If the parent declines, note it and take notes by hand. A refusal must never
affect the session or the incentive. Record the refusal on the capture sheet so the write-up
knows why there is no audio.</p>

<div class="cbox warn">
  <h2>Deletion log — fill this in when you delete</h2>
  <p class="hint">The promise above is only worth making if you keep it. Record the date the
  recording and notes for this participant were actually deleted.</p>
  <div class="frow">
    {field("Participant ID", "", "30%")}
    {field("Recording deleted on", "", "34%")}
    {field("Deleted by", "", "34%")}
  </div>
</div>
""", "Draft — needs legal review before use")


def screener():
    return page("form", f"""
<h1 class="ftitle">Screener<span class="sub">Every question, every time — never trust an earlier qualification</span></h1>

<h2>Qualify — all four must pass</h2>
<table class="q">
<tr><td class="qn">S1</td><td>Do you live in Saudi Arabia?<i>هل تقيم في المملكة العربية السعودية؟</i></td><td class="yn">Y / N</td><td class="term">N → stop</td></tr>
<tr><td class="qn">S2</td><td>Do you have a child aged 4–9?<i>هل لديك طفل بين ٤ و٩ سنوات؟</i></td><td class="yn">Y / N</td><td class="term">N → stop</td></tr>
<tr><td class="qn">S3</td><td>In the last 6 months, have you bought a physical children's product online and had it delivered?<i>خلال ٦ أشهر، هل اشتريت منتجًا ملموسًا لطفلك عبر الإنترنت ووصلك؟</i></td><td class="yn">Y / N</td><td class="term">N → stop</td></tr>
<tr><td class="qn">S4</td><td>Do you or a household member work in marketing, research, publishing, or children's products?<i>هل تعمل أنت أو أحد أفراد أسرتك في التسويق أو الأبحاث أو النشر أو منتجات الأطفال؟</i></td><td class="yn">Y / N</td><td class="term">Y → stop</td></tr>
</table>
<p class="hint">S3 is the one people want to relax. Don't. A parent who has never bought a
children's product online cannot tell you what would make them trust an unknown brand's
product page — which is half of what the sprint is for.</p>

<h2>Record — quota variables, not qualifiers</h2>
<div class="frow">
  {field("City", "Riyadh / Jeddah / Dammam–Khobar / other", "50%")}
  {field("Child's age", "4 5 6 7 8 9", "22%")}
  {field("Parent role", "mother / father / other", "26%")}
</div>
<div class="frow">
  {field("Home language", "Arabic mostly / both / English mostly / other", "40%")}
  {field("Saudi or resident", "", "26%")}
  {field("Most spent at once on a children's book/activity, last year", "&lt;25 / 25–49 / 50–99 / 100+ / don't recall", "32%")}
</div>
<p class="hint">Past spend is a quota variable, <b>not</b> a qualifier and <b>not</b> a price
signal. Screening on it hands you a sample that agrees with your price because you selected for it.</p>

<h2>Quotas across the 12 parents</h2>
<table class="grid">
<tr><th>Variable</th><th>Target</th><th>Why</th></tr>
<tr><td>City</td><td>6 Riyadh, 6 Jeddah</td><td>Matches the two-city paid test</td></tr>
<tr><td>Child age</td><td>≥7 with a child 5–8; keep 2 at ages 4 or 9</td><td>The edges test whether the age claim is too broad</td></tr>
<tr><td>Parent role</td><td>≥4 fathers</td><td>This research over-recruits mothers, then mistakes it for the market</td></tr>
<tr><td>Home language</td><td>≥4 "Arabic mostly", ≥3 "both"</td><td>The product is Arabic-first; the sample must be too</td></tr>
<tr><td>Nationality</td><td>≥8 citizens, ≥3 residents</td><td>Open to every family living in the Kingdom</td></tr>
<tr><td>Past spend</td><td>≥3 in the under-SAR-25 bands</td><td>Otherwise you only interview people who were always going to say 49 is fine</td></tr>
</table>

<h2>Child sessions — 15</h2>
<table class="grid">
<tr><td>Age spread</td><td>3 aged 4 · 4 aged 5 · 4 aged 6–7 · 4 aged 8–9</td></tr>
<tr><td>Gender</td><td>Roughly balanced</td></tr>
<tr><td><b>Prior colouring habit</b></td><td><b>≥4 children who do NOT colour regularly at home</b> — the ones who already love colouring will enjoy it and tell you nothing</td></tr>
</table>
""")


def facilitator_guide():
    return page("form", f"""
<h1 class="ftitle">Facilitator's card<span class="sub">30-minute parent interview — what you glance at mid-session</span></h1>

<div class="cbox warn">
  <b>Do not bring:</b> the brand name, a logo, a price, a pitch, or the word "educational".<br>
  <b>Silence is a tool.</b> After an answer finishes, wait three full seconds. The honest half arrives in that gap.<br>
  <b>Every "nice" gets one follow-up:</b> <i>what makes it that?</i> Then stop — twice is interrogation.
</div>

<h2 class="stage">1 · The last purchase — 6 min <i>real behaviour, real occasions, real disappointment</i></h2>
<ol class="qs">
  <li>Tell me about the last non-screen activity or toy you bought. <b>What happened after it arrived?</b><i>حدثني عن آخر نشاط أو لعبة غير إلكترونية اشتريتها. وش صار بعد ما وصلت؟</i></li>
  <li>Where did you buy it, and what made you pick that one?<i>من وين اشتريتها، ووش خلاك تختارها؟</i></li>
  <li>Did your child actually use it? How many times? <i>(If it stopped — what happened?)</i></li>
  <li>Was there anything that disappointed you when you saw it in person?<i>هل فيه شيء خيّب ظنك لما شفتها على الطبيعة؟</i></li>
  <li>Was there an occasion, or an ordinary day?</li>
</ol>

<h2 class="stage">2 · The screen tension — 5 min <i>do NOT say "screens" first</i></h2>
<ol class="qs" start="6">
  <li>Walk me through a normal weekday afternoon. What is your child doing?</li>
  <li>Anything you'd like to change about that?</li>
  <li><i>Only if they raise screens themselves:</i> tell me more.</li>
  <li>When your child says "I'm bored," what actually happens next?<i>لما يقول طفلك «أنا ملليت»، وش يصير بعدها؟</i></li>
</ol>
<p class="hint"><b>Counted variable:</b> did they raise screens unprompted? This is the cleanest
test of the primary-buyer hypothesis in the whole sprint. If you say the word first, every
parent performs concern, because they know it is the socially correct answer.</p>

<h2 class="stage">3 · Worth paying for — 5 min</h2>
<ol class="qs" start="10">
  <li>When does a colouring or activity product feel <i>educational enough</i> to be worth paying for?</li>
  <li>And when does one feel like just filler?</li>
  <li>What makes Saudi-themed children's products feel authentic — or clichéd, or too ceremonial?</li>
</ol>
""", "Facilitator's card · page 1 of 2")


def facilitator_guide_2():
    return page("form", f"""
<h2 class="stage big">4 · The reveal — 7 min</h2>
<div class="cbox warn">
  <b>Hand over the prototype. Say nothing. Start the timer. Wait.</b><br>
  Do not narrate, correct, or answer questions with information. Reflect them back: "what would you expect?"
</div>
<ol class="qs" start="13">
  <li>What do you think this is, and who is it for?<i>وش تتوقع هذا الشيء، ولمن؟</i></li>
  <li>What would you expect to pay for it?<i>كم تتوقع سعره؟</i></li>
  <li>What would your child do with it — alone, with you, as a gift? What would stop them?</li>
  <li>Anything here that feels wrong, missing, or not quite right?<i>فيه شيء يحس غلط أو ناقص؟</i></li>
  <li><i>(Point at one discovery prompt)</i> What do you make of this bit?</li>
</ol>
<p class="hint"><b>The number in Q14 is only clean once.</b> Say nothing after they answer except
"thank you" — no "interesting", no eyebrows. React and it is contaminated for that parent and
for the whole price analysis.</p>

<h2 class="stage">5 · Buying it online — 4 min</h2>
<ol class="qs" start="18">
  <li>Imagine you saw this online from a brand you've never heard of. What would you need to see before buying?</li>
  <li>What would make you close the page immediately?<i>وش يخليك تسكر الصفحة على طول؟</i></li>
  <li>Where would you expect to come across something like this?</li>
</ol>
<p class="hint">Q19 is usually more actionable than Q18. This section writes the product page.</p>

<h2 class="stage">6 · Names — 1 min, last, optional</h2>
<p>Six candidates on one card, Arabic-first, no logo, no colour.</p>
<ol class="qs" start="21">
  <li>What kind of company does each sound like? <i>(before saying what yours does)</i></li>
  <li>Any you'd <i>not</i> buy from, or that sounds off?</li>
</ol>
<p class="hint">Record the negatives. Ignore the preferences. Parents are polite about names and
honest about products.</p>

<h2 class="stage">Close</h2>
<p class="big-q">"Is there anything I should have asked you about and didn't?"<i>«فيه شيء كان المفروض أسأل عنه وما سألت؟»</i></p>
<p class="hint">Then pay the incentive, thank them, and stop talking about the product.</p>
""", "Facilitator's card · page 2 of 2")


def language_bank_sheet(i):
    return page("form capture", f"""
<h1 class="ftitle">Language bank<span class="sub">Parent {i} of {N_PARENTS} — fill within an hour of the session</span></h1>
<div class="frow">
  {field("Date", "", "18%")}{field("City", "", "20%")}{field("Child age", "", "14%")}
  {field("Parent role", "", "22%")}{field("Home language", "", "22%")}
</div>

<h2>Verbatim — their words, not your summary</h2>
{field("What they said it was (Q13)", "", "100%", "16mm")}
{field("The useful-vs-filler line (Q10/11)", "", "100%", "16mm")}
{field("Best single sentence — the one good enough to become copy", "", "100%", "16mm")}

<h2>Counted</h2>
<div class="frow">
  {field("Unanchored price guess (Q14) — SAR", "", "34%")}
  {field("Screens raised unprompted?", "Y / N", "30%")}
  {field("Identified it unaided?", "Y / N", "32%")}
</div>

<h2>Objections and proof</h2>
{field("Top objection — what would actually stop the purchase", "", "100%", "13mm")}
{field("Proof demanded before buying (Q18)", "", "100%", "13mm")}
{field("Deal-breaker — what closes the page (Q19)", "", "100%", "13mm")}

<div class="frow">
  {field("Audio recorded?", "Y / N / declined", "34%")}
  {field("Incentive paid", "", "30%")}
  {field("Your confidence they'd buy", "1 2 3 4 5", "32%")}
</div>

<p class="hint">Transfer to the <b>Language Bank</b> tab of sprint-workbook.xlsx the same day.
After all 12, count: screens raised unprompted, unaided identification, median price guess, and
objections appearing three or more times. Those four numbers are what the gate review argues about.</p>
""", f"Language bank · parent {i}")


def observation_sheet_a(i):
    """During the session. Deliberately one page with room to write — a form you cannot
    write on is worse than one more sheet of paper."""
    return page("form capture", f"""
<h1 class="ftitle">Child play-test <span class="side">A · during</span><span class="sub">Child {i} of {N_CHILDREN} · 15–20 minutes</span></h1>
<div class="frow">
  {field("Child ID", "", "18%")}{field("Age", "", "12%")}
  {field("Colours at home regularly?", "Y / N", "30%")}
  {field("Language", "", "18%")}{field("Date", "", "22%")}
</div>
<p class="hint">Hand it over and be quiet. Sit to the side, not across the table. If asked what
to do, answer once — "whatever you like" — and mark an <b>instruction request</b>. A second ask
is a <b>rescue</b>.</p>

<h2>Timeline — mark the clock</h2>
<table class="grid tl">
<tr><th>Moment</th><th>mm:ss</th><th>Note</th></tr>
<tr><td>First mark on paper</td><td></td><td>The lag before starting is a difficulty signal</td></tr>
<tr><td>First page turn</td><td></td><td></td></tr>
<tr><td>Chose a second page</td><td></td><td>Did they <i>want</i> another?</td></tr>
<tr><td>First unprompted words</td><td></td><td>Verbatim</td></tr>
<tr><td>First disengagement</td><td></td><td>Slumping, looking away, changing subject</td></tr>
<tr><td><b>Adult rescues — tally</b></td><td></td><td><b>3+ fails the gate for this child</b></td></tr>
<tr><td>Session end</td><td></td><td>Ended by child, or by timer?</td></tr>
</table>

<h2>Counted</h2>
<table class="grid tl">
<tr><td>Minutes to first disengagement</td><td></td><td>Pages attempted / completed</td><td></td></tr>
<tr><td>Noticed a discovery prompt?</td><td>Y / N</td><td>Acted on a creative prompt?</td><td>Y / N</td></tr>
<tr><td>Chose own page, or took the top one?</td><td></td><td>Which page first? (sheet #)</td><td></td></tr>
<tr><td>Media used</td><td>crayon / pencil / marker</td><td><b>MARKER BLEED-THROUGH?</b></td><td><b>Y / N</b></td></tr>
<tr><td>Tore a sheet out cleanly?</td><td>Y / N</td><td>Wanted to keep it / show someone?</td><td>Y / N</td></tr>
</table>

<h2>Three things they said, exactly</h2>
{field("1", "", "100%", "11mm")}
{field("2", "", "100%", "11mm")}
{field("3", "", "100%", "11mm")}
""", f"Play-test · child {i} · sheet A of B — turn over when the child finishes")


def observation_sheet_b(i):
    """After the session: your read, then the parent debrief."""
    return page("form capture", f"""
<h1 class="ftitle">Child play-test <span class="side">B · after</span><span class="sub">Child {i} of {N_CHILDREN} · complete before the next session</span></h1>

<h2>Your read, recorded at session end</h2>
<table class="grid tl">
<tr><th></th><th>Too easy</th><th>About right</th><th>Too hard</th></tr>
<tr><td>Line art density</td><td></td><td></td><td></td></tr>
<tr><td>Discovery prompt language</td><td></td><td></td><td></td></tr>
<tr><td>Creative prompt clarity</td><td></td><td></td><td></td></tr>
</table>
<div class="frow">{field("Would a child this age do this alone at home?", "yes / with a parent nearby / no", "100%")}</div>

<h2>Parent debrief — 5 minutes</h2>
<div class="frow">{field("1 · Was that what you expected to see?", "", "100%", "14mm")}</div>
<div class="frow">{field("2 · Did anything surprise you about how they used it?", "", "100%", "14mm")}</div>
<div class="frow">{field("3 · Would this hold them for 15 minutes at home, without you?", "", "100%", "14mm")}</div>
<div class="frow">
  {field("4 · Having watched that — what would you pay?", "SAR", "46%", "14mm")}
  {field("5 · What would you change?", "", "52%", "14mm")}
</div>

<p class="hint">Q4 is a <b>post-observation</b> price, and a different number from the interview's
unanchored guess. The gap between the two is itself a finding: if watching their own child use
it moves the number up, the product page's job is to manufacture that same experience with video.</p>

<h2>Same-day transfer</h2>
{tick("Row filled in the Play-tests tab of sprint-workbook.xlsx")}
{tick("Consent form filed; any recording scheduled for deletion")}
{tick("Incentive paid and logged")}
<div class="frow">
  {field("Anything that should change in the prototype before the next session", "", "100%", "16mm")}
</div>
""", f"Play-test · child {i} · sheet B of B")


def incentive_log():
    rows = "".join(
        '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>' for _ in range(20)
    )
    return page("form", f"""
<h1 class="ftitle">Incentive and receipt log<span class="sub">SAR 2,500 validation line — track it as you spend it</span></h1>
<p class="hint">Budgeted: SAR 100–150 per completed parent interview, SAR 100 per child session
(paid to the parent). A participant who withdraws is still paid.</p>
<table class="grid log">
<tr><th>Date</th><th>Participant ID</th><th>Session type</th><th>Amount SAR</th><th>Method</th><th>Received by (initials)</th></tr>
{rows}
</table>
<div class="frow">
  {field("Total paid", "", "32%")}
  {field("Against budget", "SAR 2,500", "32%")}
  {field("Remaining", "", "32%")}
</div>
<p class="hint">Transfer the total to the <b>Budget Tracker</b> tab of unit-economics.xlsx.
Roughly SAR 11,000 of the pilot buys the evidence; the other SAR 11,000 is only committed after
the 30 September gate review. Keeping that split intact is what makes stopping survivable.</p>
""", "Incentive log")


# ---------------------------------------------------------------- css
CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Tajawal', sans-serif; color: #1a2420; background: #8a8f8b; font-size: 10pt; }
.page { width: 210mm; height: 297mm; background: #fff; position: relative;
  page-break-after: always; break-after: page; overflow: hidden;
  margin: 0 auto 8mm; box-shadow: 0 2px 14px rgba(0,0,0,.28); }
@media print { .page { margin: 0; box-shadow: none; } }
.safe { position: absolute; inset: 13mm 14mm 11mm; display: flex; flex-direction: column; }
.pfoot { margin-top: auto; padding-top: 3mm; border-top: .25mm solid #e6ebe8;
  font-size: 2.4mm; color: #667269; direction: ltr; text-align: left; }

h1.ftitle { font-size: 6.2mm; color: #1f3a2e; margin: 0 0 4mm; line-height: 1.2; }
h1.ftitle .side { float: right; font-size: 3mm; font-weight: 700; color: #fff;
  background: #c8763c; padding: 1mm 3mm; border-radius: 1mm; letter-spacing: .04em; }
h1.ftitle .sub { display: block; clear: both; font-size: 3mm; font-weight: 400; color: #5f6b64; margin-top: 1mm; }
h2 { font-size: 3.5mm; color: #1f6b4a; margin: 4mm 0 2mm; text-transform: uppercase;
  letter-spacing: .06em; border-bottom: .25mm solid #e6ebe8; padding-bottom: 1mm; }
h2.stage { text-transform: none; letter-spacing: 0; font-size: 4mm; color: #1f3a2e; }
h2.stage i { font-weight: 400; color: #667269; font-size: 2.9mm; }
h2.stage.big { font-size: 5mm; }
p { margin: 0 0 2mm; line-height: 1.5; }
.lead { font-size: 3.2mm; color: #4a5a52; }
.hint { font-size: 2.7mm; color: #5f6b64; line-height: 1.45; margin: 2mm 0; }
.big-q { font-size: 4mm; font-weight: 700; color: #1f3a2e; }
.big-q i { display: block; font-weight: 400; font-size: 3.2mm; color: #5f6b64; }

ul.plain { margin: 0 0 2mm; padding-inline-start: 5mm; }
ul.plain li { font-size: 3mm; line-height: 1.55; margin-bottom: 1mm; }
ol.qs { margin: 0 0 2mm; padding-inline-start: 6mm; }
ol.qs li { font-size: 3.1mm; line-height: 1.5; margin-bottom: 2mm; }
ol.qs i, ul.plain i { display: block; direction: rtl; text-align: right; color: #5f6b64;
  font-style: normal; font-size: 3mm; margin-top: .5mm; }

.rtl { direction: rtl; text-align: right; }
.rtl ol.qs i, .rtl ul.plain i { direction: ltr; text-align: left; }
.two { display: flex; gap: 6mm; }
.col { flex: 1; }

/* fields */
.frow { display: flex; gap: 3mm; margin-bottom: 2mm; }
.f { margin-bottom: 2mm; }
.fbox { border: .3mm solid #cfd8d3; border-radius: 1mm; background: #fdfdfb; }
.flab { display: block; font-size: 2.5mm; color: #5f6b64; margin-top: .8mm; }
.flab i { font-style: normal; color: #667269; }
.flab i::before { content: " · "; color: #cfd8d3; }
.tick { display: flex; gap: 2.5mm; align-items: flex-start; margin-bottom: 2mm; font-size: 3mm; line-height: 1.45; }
.tick .box { flex: 0 0 3.8mm; height: 3.8mm; border: .35mm solid #5f6b64; border-radius: .8mm; margin-top: .4mm; }
.tick i { display: block; font-style: normal; font-size: 2.7mm; color: #667269; }

/* boxes */
.cbox { border: .3mm solid #dfe5e1; border-radius: 2mm; padding: 4mm 5mm; margin-bottom: 3mm; background: #fbfcfb; }
.cbox.warn { background: #fdf3e9; border-color: #eccfae; }
.cbox h2 { margin-top: 0; border: 0; }
.cbox ol { margin: 0; padding-inline-start: 5mm; }
.cbox ol li { font-size: 2.9mm; line-height: 1.5; margin-bottom: 1.5mm; }

/* tables */
table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
.grid th { background: #1f3a2e; color: #fff; font-size: 2.6mm; text-align: left; padding: 1.5mm 2mm; font-weight: 700; }
.grid td { border: .25mm solid #e6ebe8; padding: 1.8mm 2mm; font-size: 2.8mm; vertical-align: top; }
.grid.tl td:nth-child(2), .grid.tl td:nth-child(4) { background: #fdfdfb; width: 22mm; }
.grid.log td { height: 6.5mm; }
.q td { border-bottom: .25mm solid #e6ebe8; padding: 2mm; font-size: 3mm; vertical-align: top; }
.q .qn { width: 8mm; color: #1f6b4a; font-weight: 700; }
.q .yn { width: 16mm; text-align: center; font-weight: 700; color: #4a5a52; }
.q .term { width: 18mm; font-size: 2.5mm; color: #9b5a2c; }
.q i { display: block; direction: rtl; text-align: right; font-style: normal; color: #5f6b64; font-size: 2.9mm; margin-top: .6mm; }

/* cover */
.cover .safe { justify-content: flex-start; }
.chead { text-align: center; margin-bottom: 6mm; }
.ceyebrow { font-size: 4mm; font-weight: 700; color: #c8763c; margin: 0; }
.ceyebrow span { display: block; direction: ltr; font-size: 2.6mm; font-weight: 400;
  letter-spacing: .2em; text-transform: uppercase; color: #7a6a56; margin-top: 1mm; }
.chead h1 { font-size: 13mm; color: #1f3a2e; margin: 4mm 0 0; line-height: 1.05; }
.chead h1 span { display: block; direction: ltr; font-size: 4.5mm; font-weight: 400; color: #5f6b64; margin-top: 2mm; }
.cdates { font-size: 3.2mm; color: #667269; margin-top: 3mm; }
.cnote { font-size: 2.9mm; color: #4a5a52; background: #f2f6f4; border-inline-start: 1mm solid #1f6b4a;
  padding: 3mm 4mm; border-radius: 0 1.5mm 1.5mm 0; }
"""


def build():
    print("Fonts:")
    ensure_fonts(FONT_DIR)

    pages = [cover(), consent_ar(), consent_en(), consent_recording(),
             screener(), facilitator_guide(), facilitator_guide_2()]
    pages += [language_bank_sheet(i) for i in range(1, N_PARENTS + 1)]
    for i in range(1, N_CHILDREN + 1):
        pages += [observation_sheet_a(i), observation_sheet_b(i)]
    pages.append(incentive_log())

    html = f"""<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><title>Validation sprint field pack</title>
<style>
{font_face_css(FONT_DIR)}
{CSS}
</style></head>
<body>
{''.join(pages)}
</body></html>"""

    html_path = HERE / "fieldpack.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"Wrote {html_path.relative_to(BUSINESS.parent)}  "
          f"({len(html) // 1024} KB, {len(pages)} pages)")

    pdf_path = HERE / "fieldpack.pdf"
    if render_pdf(html_path, pdf_path):
        print(f"Wrote {pdf_path.relative_to(BUSINESS.parent)}  "
              f"({pdf_path.stat().st_size // 1024} KB)")

    print(f"\n{len(pages)} pages: cover, 3 consent forms, screener, 2 facilitator cards, "
          f"{N_PARENTS} language-bank sheets, {N_CHILDREN}x2 observation sheets, incentive log.")
    print("Print single-sided on plain A4. The consent forms need legal review before use.")


if __name__ == "__main__":
    build()
