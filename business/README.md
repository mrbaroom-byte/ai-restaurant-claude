# Saudi creative-learning brand — build pack

Everything needed to execute the decision brief *Saudi Parent Demand & Sentiment* (4 Sept 2026),
from the September validation sprint to the 15 November launch.

**Working name: مرسم / Marsam — a placeholder, not a decision.** The brief says do not lock the
name before parent language testing. Every asset reads from `brand.config.json`, so locking it
later costs one command: `./business/rename-brand.sh "Name" "الاسم"`.

---

## Start here

You are at **day 0**. The brief is dated today, and its own conclusion is that the next
irreversible decision is the September validation sprint — not the visual identity, and not the
production order. Interviews start in three days.

| If you have… | Read |
|---|---|
| 5 minutes | `00-strategy/locked-decisions.md` — what is settled, what is open, what decides the rest |
| 30 minutes | That, plus `03-economics/README.md` — the finding that shapes the whole plan |
| This week | `05-operations/calendar.md` — three external questions to send before Sept 6 |
| Before Monday | Print `01-validation/fieldpack/fieldpack.pdf` and `02-product/prototype/prototype-dummy.pdf` |

---

## What is in here

```
brand.config.json          Working name, prices, locked/unlocked decisions
rename-brand.sh            Swap the masterbrand name across every asset in one command

00-strategy/
  locked-decisions.md      One page: locked, not locked, the gates, the five risks
  brand-identity-options.md  Six name candidates as interview stimuli, with trade-offs
  claim-discipline.md      Approved/banned language, the correction protocol, sign-off

01-validation/             THE SPRINT — Sept 7-30
  README.md                How to run it, and the four rules that decide whether it works
  01-screener.md           Recruitment, quotas, consent for child sessions
  02-parent-interview-guide.md   30 minutes, verbatim, AR/EN
  03-child-playtest-protocol.md  Observation sheet + what failure looks like
  04-survey-instrument.md  Forced trade-offs, proposition test, objection sizing
  05-decision-gates.md     Six gates, the thresholds, and the stop rule
  analysis/build_workbook.py → sprint-workbook.xlsx  (7 tabs, live gate arithmetic)
  fieldpack/build_fieldpack.py → fieldpack.pdf  (50 pages: consent forms, screener,
                              facilitator card, 12 capture sheets, 15x2 observation sheets)

02-product/
  20-sheet-content-plan.md Full editorial spec, all 20 sheets, bilingual
  sheets.json              The 20 sheets as data — single source of truth
  illustrator-brief.md     Commissioning pack. THE CRITICAL-PATH GAP.
  printer-brief.md         RFQ for three printers + the acceptance test
  quality-checklist.md     Safety, print quality, the marker test, sign-off
  art/build_prompts.py     Prompts derived from sheets.json; 20 generated SVGs
  art/ASSESSMENT.md        Sheet-by-sheet verdict on the generated art — read before using it
  prototype/build_prototype.py → prototype-template.pdf  (illustrator + printer layout)
                              → prototype-dummy.pdf     (paper and format test pad)
                              → prototype-art.pdf       (generated art — research stimuli)

03-economics/
  build_model.py           → unit-economics.xlsx  (6 tabs, live formulas)
  README.md                What the model already says — read this early
  pricing-decision-rule.md How the launch price gets chosen

04-launch/
  landing/build.py         → a/ b/ c/  three cells, generated, parity-checked
  product-page-copy.md     Full PDP deck, bilingual, six trust blocks
  ad-creative-briefs.md    Discover → Consider → Trust → Share
  creator-seeding-kit.md   Nov 1-10, and the disclosure rules
  emails/build_emails.py   → 7 transactional emails, bilingual, HTML + plain text
                             (preorder, shipping, delivered, review, correction, delay)

05-operations/
  compliance-checklist.md  SBC, MoC, ZATCA, KFNL, SASO/SABER, PDPL, SAIP
  launch-runbook.md        Store build, the 20-order dry run, when things go wrong
  calendar.md              Day by day, 4 Sept → 15 Nov
```

## Regenerate the built files

```bash
python3 business/01-validation/analysis/build_workbook.py   # sprint workbook
python3 business/03-economics/build_model.py                # economics model
python3 business/04-launch/landing/build.py                 # three landing cells
python3 business/02-product/prototype/build_prototype.py --mode all    # the printable pad
python3 business/01-validation/fieldpack/build_fieldpack.py            # the field pack
python3 business/04-launch/emails/build_emails.py                     # transactional emails
```

The landing build **fails loudly** if the cells drift apart below the hero — a message test whose
cells differ in more than the message cannot attribute its result.

---

## The three things worth knowing before you read anything else

### 1 · The economics are tighter than the brief implies

The model, at placeholder assumptions, says the core pad at **SAR 39 needs a 39% landing-page
conversion rate** to pay for its own advertising. At SAR 49 it needs 16%. Cold traffic to a new
brand converts in low single digits.

That is not a reason to stop. It is three specific instructions: **paid ads cannot be the primary
launch channel**, the **bundle is the unit that works** rather than an upsell, and **shipping
subsidy is the largest controllable leak** — SAR 7 per order, more than the entire
payment-processing line. The brief's creator-led, founder-preorder, organic-demonstration
sequence is the channel the arithmetic supports. Full working in `03-economics/README.md`.

### 2 · The pilot is not supposed to be profitable

At 250 units sold from a 500-unit run, the model returns roughly SAR 4,300 of contribution
against SAR 23,250 of spend. Cash break-even needs around 1,337 units — nearly three times the
run.

That is what a validation pilot *is*. SAR 22,000 buys a language bank, a tested prototype, a
cultural review, a working store, real product media, first reviews and an operational dry run.
Say this out loud before you start, or you will mistake a normal pilot for a failure in December.

### 3 · Illustration is the one thing you cannot do yourself in September

Everything else in this pack is executable by one person. Twenty pieces of original black line
art are not, and nothing in the SAR 22,000 budget covers them — the SAR 3,500 prototype line is
for print tests, not for finished illustration.

`prototype-art.pdf` now carries machine-generated line art, which is enough to test engagement
with children in September — but `art/ASSESSMENT.md` records the honest verdict: 11 of 20 sheets
are usable as stimuli, 9 need redrawing, and the two craft sheets carry invented motifs where the
content plan demands reference-based work. The generator is good at categories and poor at
specific named places, which is exactly the half that carries the cultural claim.

`prototype-template.pdf` closes as much of the remaining gap as is honest: the full A4 layout with every
sheet's typography, prompts, difficulty icon and safe margin finalised, and the art direction
printed inside each empty illustration area. An illustrator draws into it; a printer quotes
against it. `prototype-dummy.pdf` is printable **today** for the paper tests — bleed-through,
tear-out, trim — but it tests the paper, not the drawings.

Commission in the first week (`02-product/illustrator-brief.md`), style-test three sheets before
committing to twenty, and price it before the print-run maths is settled.

### 4 · Roughly half the budget is only committed if the evidence says go

About SAR 11,000 buys the evidence (validation, cultural review, prototype, tests). The other
SAR 11,000 — the print run and the store build — is only spent after the 30 September gate
review. Protecting that split is what makes stopping survivable rather than catastrophic.

**The stop rule:** if Gate 5 (economics) fails at both SAR 39 and SAR 49 including the bundle,
do not print. That is the one gate no copy, photography or message can fix, because it is
arithmetic — volume multiplies a negative number.

---

## What this pack does not do

- **It does not validate demand.** The brief is a secondary-research synthesis, and nothing here
  should be presented internally or externally as validated parent demand until the sprint has
  run. Population statistics use age bands that only partly overlap 5–8; the cited literacy study
  is a 100-parent convenience sample; marketplace catalog depth proves competition, not demand.
- **It does not lock the brand.** Name, logo, palette and fonts stay open until parent language
  testing, exactly as the brief instructs.
- **It is not legal, tax or regulatory advice.** `05-operations/compliance-checklist.md` names
  the authorities and the questions to ask them. Confirm everything with the authority itself
  and take professional advice.
- **Every fact in the 20-sheet plan is a draft awaiting the independent cultural review.** Facts
  written for a 5-year-old have to be both simple and true, which is exactly the combination that
  produces confident errors.

---

## The one-line version

Build a useful thing first, make it joyful always, let Saudi Arabia be what it is made of — and
spend SAR 11,000 finding out whether parents agree before spending the other SAR 11,000 acting
as if they do.
