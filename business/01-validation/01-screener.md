# Recruitment screener — parents and children

Goal: 12 parents for depth interviews, 15 children for play-test sessions (a child's parent
may also be one of the 12 — but no more than 5 overlaps, or the child sessions inherit the
interview's framing).

Field this as a short mobile form. Keep it under 2 minutes or completion collapses.

---

## Part 1 — Qualification (all must pass)

**Q1. Do you live in Saudi Arabia?**
هل تقيم في المملكة العربية السعودية؟
- Yes / نعم → continue
- No / لا → **terminate**

**Q2. Do you have a child aged between 4 and 9?**
هل لديك طفل يتراوح عمره بين ٤ و٩ سنوات؟
- Yes / نعم → continue
- No / لا → **terminate**

**Q3. In the last 6 months, have you bought a physical product for your child online — a toy, book, activity or game — and had it delivered?**
خلال الأشهر الستة الماضية، هل اشتريت عبر الإنترنت منتجًا ملموسًا لطفلك — لعبة أو كتاب أو نشاط — ووصلك بالتوصيل؟
- Yes / نعم → continue
- No / لا → **terminate**

> Q3 is the one people will want to relax. Don't. A parent who has never bought a children's
> product online cannot tell you what would make them trust an unknown brand's product page,
> which is half of what the sprint is for.

**Q4. Do you or anyone in your household work in any of the following?**
هل تعمل أنت أو أحد أفراد أسرتك في أي من المجالات التالية؟
- Marketing, advertising or market research / التسويق أو الإعلان أو أبحاث السوق → **terminate**
- Publishing, printing or children's product design / النشر أو الطباعة أو تصميم منتجات الأطفال → **terminate**
- None of these / لا شيء مما سبق → continue

---

## Part 2 — Quota variables (record, do not screen on)

**Q5. Which city do you live in?** — أي مدينة تسكن فيها؟
Riyadh / Jeddah / Dammam–Khobar / Other (specify)

**Q6. How old is the child you would most likely buy an activity product for?**
كم عمر الطفل الذي غالبًا ستشتري له منتج نشاط؟
4 / 5 / 6 / 7 / 8 / 9

**Q7. Are you the child's mother, father, or another guardian?**
هل أنت والدة الطفل أم والده أم ولي أمر آخر؟

**Q8. At home, which language do you and your child mostly speak together?**
ما اللغة التي تتحدثها مع طفلك في البيت غالبًا؟
Arabic mostly / Arabic and English about equally / English mostly / Another language

**Q9. Are you a Saudi citizen or a resident of Saudi Arabia?**
هل أنت مواطن سعودي أم مقيم في المملكة؟

**Q10. Roughly how much have you spent in one go on a children's book or activity product in the last year?**
تقريبًا، كم أنفقت مرة واحدة على كتاب أو منتج نشاط للأطفال خلال السنة الماضية؟
Under SAR 25 / SAR 25–49 / SAR 50–99 / SAR 100+ / Don't remember

> Q10 is a quota variable, **not** a qualifier and **not** a price signal. Past spend is a poor
> predictor of willingness to pay for a new format, and screening it out would hand you a
> sample that agrees with your price because you selected for it.

---

## Quotas across the 12 parent interviews

| Variable | Target | Why |
|----------|--------|-----|
| City | 6 Riyadh, 6 Jeddah | The brief's two-city paid test needs matching qualitative grounding |
| Child age | ≥7 with a child aged 5–8; keep 2 at ages 4 or 9 | 5–8 is the locked primary; the edges test whether the age claim is too broad |
| Parent role | ≥4 fathers | Children's-product research over-recruits mothers by default and then mistakes it for the market |
| Home language | ≥4 "Arabic mostly", ≥3 "about equally" | The product is Arabic-first; the sample must be too |
| Nationality | ≥8 Saudi citizens, ≥3 residents | The brief positions the brand as open to every family living in the Kingdom |
| Past spend | ≥3 in the "under SAR 25" bands | Otherwise you interview only people who were always going to say SAR 49 is fine |

## Quotas across the 15 child sessions

| Variable | Target |
|----------|--------|
| Age | 3 aged 4, 4 aged 5, 4 aged 6–7, 4 aged 8–9 |
| Gender | Roughly balanced |
| Prior coloring habit | ≥4 children who do **not** color regularly at home |

> That last row is the one people skip. Children who already love coloring will enjoy your
> prototype and tell you nothing. The children who don't are the ones who reveal whether the
> creative prompts are doing any work.

---

## Consent and incentives

**Incentive:** SAR 100–150 gift card per completed parent interview; SAR 100 per child session
(paid to the parent). Budgeted inside the SAR 2,500 validation line — see `03-economics/`.

**Consent — required before any child session:**

- [ ] Written parental consent, in Arabic and English, obtained **before** the session
- [ ] Explicit, separately-ticked permission for photography or video, if you intend to record
- [ ] Recording is optional — a refusal must not disqualify the participant
- [ ] Child's assent asked directly, in their own words, and honoured immediately if they
      decline or want to stop partway
- [ ] No child's face, full name, school or identifying detail used in any marketing, ever,
      without a separate written release signed for that specific use
- [ ] Personal data stored on one device, deleted after the sprint write-up, never emailed
      onward, and never merged into a marketing list
- [ ] A parent may withdraw their data at any point up to the gate review; say so out loud

> These are not formalities. You are asking to observe children for commercial research, and
> the same parents you are recruiting are the ones who will judge whether this brand is
> trustworthy. Get professional advice on Saudi personal-data obligations (PDPL) before
> collecting anything, and collect the minimum that answers the question.
