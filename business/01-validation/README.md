# Validation sprint — Sept 7–30, 2026

The brief's own conclusion: **the next irreversible decision is this sprint, not the visual
identity and not the print order.** Everything here is field-ready. Print it, run it, fill in
the workbook.

## What the sprint has to answer

Five questions, in dependency order. Each later step is only worth running if the earlier one
did not already kill the idea.

| # | Step | Sample | Method | Decides |
|---|------|--------|--------|---------|
| 1 | Parent depth | 12 parents, children 4–9 | 30-min interviews, Riyadh + Jeddah, Arabic/English, Saudi/resident mix | The words, anxieties, occasions and proof needs |
| 2 | Child use | 15 children + parent debrief | Observed 15–20 min prototype session | Difficulty, delight, independence, prompt clarity |
| 3 | Quant check | 150–250 qualified parents | Mobile survey with forced trade-offs | Ranking of learning / screen-light / culture / giftability / price |
| 4 | Paid intent | 2 landing cells | Creative-learning lead vs culture lead, identical product and spend | Which message earns qualified intent |
| 5 | Price | Randomized inside the winning message | SAR 39 vs 49, pad vs bundle | Contribution per visitor, preorder quality |

## Files

| File | Use |
|------|-----|
| `01-screener.md` | Recruit the right 12 parents and 15 children. Print, or paste into a form. |
| `02-parent-interview-guide.md` | The 30-minute session, verbatim, AR/EN, with the traps to avoid |
| `03-child-playtest-protocol.md` | Observation sheet + scoring for the prototype session |
| `04-survey-instrument.md` | Full quant questionnaire with forced trade-offs |
| `05-decision-gates.md` | The thresholds, and what to do when each one fails |
| `analysis/build_workbook.py` | Generates `sprint-workbook.xlsx` — tabs for every instrument |
| `fieldpack/build_fieldpack.py` | Generates `fieldpack.pdf` — **the paper you carry into the sessions** |

## Print this before Monday

`fieldpack/fieldpack.pdf` — 50 pages, single-sided on plain A4:

- **Parental consent, Arabic and English** — signed before any child session. No consent, no session.
- **Consent to record**, bilingual, for the parent interviews, with a deletion log
- Screener with the quota tables
- Facilitator's card — the interview abridged to what you glance at mid-session
- 12 language-bank capture sheets, one per parent
- 15 × 2 observation sheets — sheet A during the session, sheet B after
- Incentive and receipt log

> **The consent forms are drafts and need legal review before use.** They make specific promises
> — data deleted after the write-up, no marketing list, no child's face or name, deletion on
> request up to 30 September. Those promises are only worth making if you keep them, which is
> why sheet B carries a "recording scheduled for deletion" tick and the recording consent
> carries a deletion log. Saudi personal-data obligations (PDPL) apply to all of it.

## Sequencing

```
Sun 6 Sep    Recruit against the screener; book 12 + 15 slots; print 3 prototypes
Mon 7 – Fri 11 Sep   Parent interviews, Riyadh (6) — debrief same day, every day
Sat 12 – Wed 16 Sep  Parent interviews, Jeddah (6) + child sessions begin
Thu 17 – Fri 18 Sep  Remaining child sessions; language bank written up
Sat 19 Sep   Survey fielded; landing cells go live with identical spend
Sun 27 Sep   Survey closes at n>=150 qualified
Mon 28 – Tue 29 Sep  Price cell inside the winning message
Wed 30 Sep   Gate review. Decision to fund the print proof, or not.
```

## Four rules that make the difference

1. **Debrief the same day.** A session you write up three days later has become an anecdote.
   Fifteen minutes after each interview, fill the language-bank row while the parent's exact
   words are still exact.

2. **Capture words, not scores.** The single most valuable output of steps 1–2 is a bank of
   verbatim parent phrases. Your product page will be written out of that bank, not out of
   this repo's copy drafts. A parent's own sentence outperforms your best line every time.

3. **Never show and tell in the same breath.** Show the prototype with no explanation and let
   them tell you what it is. The moment you explain it, you have destroyed the only chance you
   get to find out what it communicates on its own.

4. **Record disconfirmation.** Write down every objection, hesitation and polite deflection in
   the parent's own words. A sprint that produces only encouragement has failed — it means you
   led, and you will find out in November at full production cost.

## What "qualified" means

Consistently, across every step and in the paid tests:

> A parent living in Saudi Arabia, with at least one child aged 4–9, who has bought a physical
> children's product online in the last 6 months.

Do not loosen this to hit a sample size. A survey padded with unqualified respondents will
produce a confident number that is about the wrong people, and it will read exactly like a
real result.
