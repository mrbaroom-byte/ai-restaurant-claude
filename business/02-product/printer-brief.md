# Printer brief and RFQ — pilot run

Send this to **at least three** local printers. Ask each for the same quantities so the quotes
are comparable, and ask each for a physical sample of a comparable job before you decide.

> The brief's own caveat, carried forward: the paper specification is a recommendation subject
> to local printer samples, marker tests, safety review and contribution-margin targets. If a
> printer tells you the spec is wrong for their press, that is information — get the reason.

---

## The job

| Item | Specification |
|------|---------------|
| Product | Children's creative activity pad |
| Trim size | A4, 210 × 297 mm |
| Extent | 20 single-sided sheets + 1 completion certificate + 1 printed cover |
| Printing | 1/0 (black only) on the 20 sheets; cover 4/0 |
| Stock — sheets | 140–160 gsm uncoated wood-free, high bulk, matt |
| Stock — cover | 250–300 gsm, matt laminate or soft-touch, printed one side |
| Backing | Greyboard / chipboard backing, minimum 1.5 mm |
| Binding | Padded (glued) top or side edge, clean single-sheet tear-out |
| Finishing | Trimmed four sides; no perforation unless the tear test fails without it |
| Packing | Shrink-wrapped or polybagged individually, boxed in tens |

### Quantities to quote

Quote each separately — the unit-cost curve between these is the input the print-run decision
needs, and it is the number most likely to change the plan.

- 300 units
- 500 units
- 750 units
- 1,000 units
- 1,500 units

Also quote: **one bound proof copy**, and **10 pre-production samples**.

---

## Non-negotiable requirements

1. **No show-through or bleed-through with a child's felt-tip marker.** This is the acceptance
   test, not a preference. Provide a sample sheet at the proposed stock and we will test it with
   markers before ordering. A stock that fails this is rejected regardless of price.
2. **Clean single-sheet tear-out** — one sheet at a time, straight, without tearing the sheet
   itself or pulling its neighbour. The pad must survive 20 tear-outs.
3. **The reverse of every sheet stays blank and clean** — no set-off, no scuffing. It is the
   display side.
4. **Child-safe materials** — inks and adhesives suitable for a children's product. Provide
   material declarations and any applicable conformity documentation.
5. **Consistent black density** across the run. Line art with weak or inconsistent black reads
   as cheap immediately, and "cheap-looking production" is a named top-five risk.

---

## Questions every quote must answer

- [ ] Unit price at each quantity, and where the cost breaks are
- [ ] Cost of one bound proof, and of 10 pre-production samples
- [ ] Lead time from approved files to delivered stock, at each quantity
- [ ] Which paper stocks you hold **in stock** vs. need to order, and the lead-time difference
- [ ] Can you supply a physical sample of a comparable job before we commit?
- [ ] What file format and specification do you need? (PDF/X standard, bleed, color profile)
- [ ] What is your reprint cost for a **single corrected sheet** across a completed run?
- [ ] Do you handle individual polybagging, or is that separate?
- [ ] Storage: can you hold finished stock, and at what cost?
- [ ] Minimum order for a reprint

> The single-sheet reprint question matters more than it looks. The correction protocol in
> `00-strategy/claim-discipline.md` commits you to reprinting a sheet if the cultural review
> finds an error after printing. Knowing that cost in advance turns a crisis into a line item.

---

## Files you will supply

- PDF/X-1a or PDF/X-4, one file per sheet plus a combined imposition file
- 3 mm bleed on all four edges; 12 mm internal safe margin
- All fonts embedded or outlined
- Black line art as 100% K only — **never rich black**, which will not hold a fine line
- Arabic text outlined to prevent any font substitution at RIP. **Verify Arabic shaping and
  diacritics on the physical proof, not on screen.** Arabic text breaking at output is a common,
  expensive and entirely preventable failure.

---

## The acceptance test — before the full run is released

Run this on the bound proof and on the 10 pre-production samples. Write down the result. Do not
release the run on a verbal assurance.

| Test | Method | Pass |
|------|--------|------|
| Marker bleed | Color a full sheet with a felt-tip marker, pressing hard | No visible ink on the reverse |
| Show-through | Hold a colored sheet to normal room light | Reverse still usable for display |
| Tear-out | Tear all 20 sheets, one at a time, from one pad | Every sheet clean; no neighbour pulled |
| Crayon and pencil | Color with wax crayon and colored pencil | No tearing, no pilling, color sits well |
| Black density | Compare 5 sheets from different points in the run | Consistent, dense, no grey lines |
| Arabic rendering | Read every Arabic line on the physical proof | Correct shaping, joining, diacritics — signed off by the Arabic reviewer |
| Trim accuracy | Measure 5 samples | Within tolerance; safe margins intact |
| Drop test | Drop a packed unit from 1 m in its shipping pack | No damage to corners or binding |

**Any bleed-through at all fails the paper**, not the print. Raise the stock weight and re-quote
rather than accepting it — the returns and one-star reviews cost more than the paper does, and
the first reviews of a new brand are irreplaceable.

---

## Before placing the order

- [ ] The gate review of 30 September passed **all six gates** (`01-validation/05-decision-gates.md`)
- [ ] The cultural and editorial sign-off log is complete for all 20 sheets
- [ ] Quantity chosen from **preorder evidence**, not from the unit-cost curve
- [ ] Legal deposit / ISBN requirements confirmed and any required numbers printed on the cover
      (`05-operations/compliance-checklist.md`)
- [ ] The acceptance test above passed on a physical proof you have held in your hands

> On quantity: the unit price at 1,500 will always look better than at 500. That is the
> printer's cost curve, not your demand. Print to the evidence you have. Unsold inventory is the
> most expensive way to buy a lower unit cost, and the brief's guidance is explicit — smaller
> first run, replenish only on evidence.
