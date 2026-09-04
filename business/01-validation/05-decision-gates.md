# Decision gates — what must be true before the print order

Six gates. **All six must pass before the full print run is placed.** The brief's own framing:
these are proposed management thresholds, not published benchmarks — so agree them in writing
*before* the data arrives, and date the agreement. A threshold negotiated after you have seen
the result is not a threshold.

The rule behind every row: **a failed gate changes the plan. It does not get solved with more
ad spend.**

---

| # | Gate | Threshold | Measured by | If it fails |
|---|------|-----------|-------------|-------------|
| 1 | **Relevance** | ≥70% of qualified survey respondents rate the winning proposition 4–5 / 5 | Survey C1, top-2-box | Revise the proposition. Do not buy more traffic against a message parents rated 3. |
| 2 | **Child engagement** | Most play-test children complete a 15-minute session without repeated adult rescue (3+ interventions) | Play-test observation sheets | Simplify line art, prompt language, or difficulty cues. Re-test with 5 children before proceeding. |
| 3 | **Cultural trust** | No recurring accuracy or representation concern after independent review and parent testing | Cultural reviewer sign-off + interview Q12/Q16 + survey D1 | Correct the content and re-proof. A recurring concern is a content defect, not a messaging problem. |
| 4 | **Paid intent** | Pre-agreed qualified lead/preorder target met **in both** Riyadh and Jeddah audiences | Landing test, `03-economics/` | Narrow the segment or cut the print quantity. One city passing is a niche, not a launch. |
| 5 | **Economics** | Positive contribution after product, packaging, payment, shipping subsidy, returns and test CAC | `03-economics/unit-economics.xlsx` | Raise basket value, reduce COGS, or stop. |
| 6 | **Operations** | Print sample, packing, delivery and support flow pass a 20-order dry run | `05-operations/launch-runbook.md` | Delay the launch. Do not damage the first reviews — they are irreplaceable. |

---

## Setting the Gate 4 number

The brief is deliberately silent on the paid-intent figure and says why: **set it only after
unit economics and traffic quality are defined.** So derive it, don't pick it.

1. Open `03-economics/unit-economics.xlsx`, tab **Break-even**.
2. Read the maximum CAC the launch price can carry at target contribution.
3. Convert to a landing-page conversion rate at your observed CPC:
   `required CVR = CPC ÷ max allowable CAC`
4. **Gate 4 = that CVR, achieved in both city audiences, on a minimum of 200 qualified clicks
   per cell.**

Below ~200 clicks per cell you cannot distinguish a real difference from noise, and a gate you
cannot measure is not a gate. If the budget will not buy 400 qualified clicks, run one city
properly rather than two badly, and record that Gate 4 was passed on a narrower basis.

---

## Reading the message test honestly

Three outcomes, three different decisions:

- **A (creative-learning) wins clearly** → the brief's hypothesis holds. Lead with it
  everywhere; culture becomes the reason-to-believe layer, as designed.
- **B (culture) wins clearly** → the emotional order in `00-strategy/locked-decisions.md`
  is **wrong**, and that is a finding worth more than the test cost. Culture leads, and the
  evergreen-vs-event risk becomes your primary concern rather than a secondary one — re-check
  survey E2 before committing inventory.
- **No clear winner** → the most likely outcome, and the one people handle worst. Do **not**
  declare the recommended cell the winner by default. It means the *message* is not the lever;
  the levers are proof and price. Move the spend to the trust blocks and run the price cell.

Statistical honesty: with a few hundred clicks per cell you can detect a large difference and
nothing smaller. Report the confidence interval, not just the point estimate. "A beat B by 0.4
points" on 200 clicks is not a result.

---

## What a failed gate is actually telling you

| Failure | The tempting reading | The honest reading |
|---------|---------------------|--------------------|
| Relevance under 70% | "The creative was weak" | Parents understood the offer and did not want it enough |
| Children disengage in 6 minutes | "They were tired" | The product does not hold attention; the session-length claim is unsupported |
| One city passes, one fails | "Average it out" | You have a city-sized market; plan and print for that |
| Contribution negative at SAR 39 | "Volume will fix it" | Volume multiplies a negative number |
| Cultural concern raised twice | "Just two people" | Two in twelve is 17%, and these are the reviewers who post publicly |

---

## The stop rule

If **Gate 5 (economics) fails at both SAR 39 and SAR 49, with the bundle**, stop. Do not print.

That is the one gate that cannot be fixed downstream by better copy, better photography or a
better message, because it is arithmetic. A product that cannot carry its own CAC at any price
the market will accept is not a launch that needs more work — it is a different product, or a
different channel, and either way the SAR 6,500 print line stays unspent.

Stopping at the end of September costs roughly SAR 10,500 of the SAR 22,000 and leaves you with
a validated language bank, a tested prototype, a cultural review and a working store. Printing
into a failed gate costs the full budget and leaves you with inventory.

---

## Gate review — 30 September

One meeting. One decision. Before it, fill the **Gate Review** tab of
`01-validation/analysis/sprint-workbook.xlsx` — every gate gets a pass/fail and the number
behind it, entered before anyone discusses what to do.

Sign-off required from: the founder, the cultural/editorial reviewer (Gate 3 only), and one
person who is willing to argue the other side. If nobody in the room is arguing against the
print order, the review has not happened yet.

**Output:** either a signed decision to fund the print proof and pilot run, with the quantity
written down — or a dated, specific list of what has to change before the question is asked again.
