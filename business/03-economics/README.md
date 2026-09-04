# Pilot economics

| File | What it is |
|------|-----------|
| `build_model.py` | Regenerates the workbook. Run it after editing the script, not the xlsx. |
| `unit-economics.xlsx` | The live model. Six tabs; yellow cells are inputs. |
| `pricing-decision-rule.md` | How the launch price is chosen, and what the model already tells you |

Run: `python3 business/03-economics/build_model.py`

## Every number in it is a placeholder

The seeded values are plausible, not quoted. The two most consequential — the print cost per
unit and the domestic shipping cost — are also the two most likely to be wrong, and the model
is very sensitive to both. Get three quotes for each before you believe any output.

## What the model already says, at the seeded assumptions

This is the most important output of the whole economics workstream, and it lands before you
have spent anything:

| Offer | Contribution | Margin on net revenue | Max CAC (keeping 30%) | Landing conversion needed to pay for its own ads |
|-------|-------------|----------------------|----------------------|--------------------------------------------------|
| Core pad @ SAR 39 | 5.86 | 17.3% | 4.10 | **39.0%** |
| Core pad @ SAR 49 | 14.30 | 33.6% | 10.01 | **16.0%** |
| Gift bundle @ SAR 79 | 29.76 | 43.3% | 20.83 | **7.7%** |
| Gift bundle @ SAR 89 | 38.21 | 49.4% | 26.74 | **6.0%** |

*At SAR 1.60 per qualified click, VAT-inclusive prices, SAR 22 shipping cost against SAR 15
charged, 4% returns, and a 1,000-unit print cost of SAR 11/unit.*

**Read the last column.** Cold-traffic conversion on a new brand's product page is typically low
single digits. A required rate of 39% is not a stretch target — it is the model saying the core
pad at SAR 39 cannot be sold profitably through paid advertising, at all, under these
assumptions. At SAR 49 it is still out of reach. Only the bundle gets close.

This does not mean stop. It means three specific things:

1. **Paid ads cannot be the primary launch channel for the core pad.** The brief's own
   acquisition sequence leans on creator seeding, founder preorder and organic demonstration —
   that is the channel the arithmetic supports. Paid traffic's job in September is to *test the
   message*, which is a research cost, not an acquisition strategy.
2. **The bundle is not an upsell, it is the unit that works.** Design the offer so the bundle is
   the obvious choice, and treat the single pad as the entry price rather than the volume seller.
3. **Shipping is the largest single controllable leak.** The SAR 7 subsidy costs more than the
   entire payment-processing line and, at SAR 39, more than the printing of two sheets. Test
   charging it in full, and test a free-shipping threshold that pushes the basket to the bundle.

### The three levers, in order of effect

Change these on the Assumptions tab and watch the Break-even tab move. That comparison *is* the
pricing decision.

| Lever | Effect on core-pad contribution | What it costs |
|-------|-------------------------------|---------------|
| Charge shipping in full (15 → 22) | +SAR 7.00 per order | Conversion. Test it — do not assume it is fatal. |
| Launch at 49 rather than 39 | +SAR 8.45 per order | Conversion. This is exactly what the price cell measures. |
| Shift the mix to the bundle | +SAR 15–24 per order | Higher COGS, and SASO/SABER obligations if it adds pencils or stickers |

## The pilot cannot be cash-positive, and should not be planned as if it could

At the base scenario — 250 units sold from a 500-unit run, 20% bundle mix — the model returns
roughly **SAR 4,300 of contribution against SAR 23,250 of spend.** Breaking even on cash would
need around **1,337 units**, nearly three times the print run.

That is not a broken plan. It is what a validation pilot *is*: SAR 22,000 buys a language bank,
a tested prototype, a cultural review, a working store, real product media, first reviews and an
operational dry run. Those are the assets. Profit is a later question, and it lives with
repeat purchase, a wider range and a basket bigger than one pad.

State this out loud before you start, because the alternative is discovering it in November and
mistaking a normal pilot for a failure.

## Where the model plugs into the gates

- **Gate 5 (economics)** is computed on the **Break-even** tab. Enter the CAC you actually
  observed in the paid test; the verdict cell resolves.
- **Gate 4 (paid intent)** takes its threshold from the same tab: the required conversion rate.
  Copy it into the sprint workbook's *Paid Test* tab **before the test finishes**, not after.
- The **Budget Tracker** tab splits the SAR 22,000 into the ~SAR 11,000 that buys evidence and
  the ~SAR 11,000 that is only committed once the evidence says go. Protecting that split is
  what makes stopping at the gate review survivable.
