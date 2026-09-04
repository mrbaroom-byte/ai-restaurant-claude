# Compliance and operator checklist

> **Read this first.** The items below name the authorities and the questions to put to them.
> Requirements, thresholds and processes change, and several depend on your specific legal
> entity and product format. **Confirm every line with the authority itself and take
> professional tax and legal advice before selling.** Nothing here is legal advice, and none of
> it should be treated as current without checking.
>
> The brief lists three operator checks before selling — SBC e-commerce documentation, King
> Fahad National Library registration, and ZATCA VAT. This expands them and adds the ones a
> printed children's product picks up along the way.

---

## 1 · Entity and commercial registration

**Authority:** Saudi Business Center (SBC) / Ministry of Commerce

- [ ] Legal entity established and commercial registration obtained
- [ ] The CR covers the activity you are actually doing — retail and/or e-commerce, and
      publishing if the format requires it. **Ask explicitly whether your product's format
      counts as publishing**; a printed pad may or may not, and the answer changes what else
      you need.
- [ ] E-commerce documentation requirements for your entity type confirmed with SBC
- [ ] National Address registered
- [ ] Any store-platform verification completed (Salla, Zid and similar require CR details)

**Why it is on the landing page:** the CR number appears in the footer of the test pages as
`[CR NUMBER]`. Saudi e-commerce rules require a seller to be identifiable, and the brief's own
trust research puts "is this seller reliable?" among the questions a product page has to answer
before checkout. **Replace that placeholder before the page takes a real order.**

---

## 2 · Consumer protection and e-commerce obligations

**Authority:** Ministry of Commerce

- [ ] Terms of sale published and reachable from every page
- [ ] Return and refund policy published, in Arabic, stating the statutory right to return —
      **confirm the current period and the exceptions with MoC**
- [ ] Total price shown VAT-inclusive, with shipping disclosed before payment
- [ ] Delivery window stated before checkout and honoured
- [ ] Working contact channel published and actually monitored
- [ ] Maroof registration — **check whether it applies to your store and platform**
- [ ] No misleading claims (this is a legal requirement as well as the discipline in
      `00-strategy/claim-discipline.md`)

---

## 3 · Tax

**Authority:** ZATCA

- [ ] VAT registration status determined for your turnover. **The commonly cited mandatory and
      voluntary registration thresholds change — confirm the current figures and how they apply
      to a new entity with ZATCA directly.**
- [ ] Consumer prices displayed **VAT-inclusive** — the economics model treats SAR 39 and 49 as
      inclusive, so if that assumption is wrong every contribution figure changes
- [ ] E-invoicing (Fatoora) obligations confirmed — whether they apply to you now, and which
      phase and technical requirements
- [ ] Your store platform's invoicing output actually meets those requirements
- [ ] Records retained as required

> Get an accountant. This is the section where a wrong assumption compounds silently for months,
> and the cost of professional advice is small against the SAR 22,000 pilot.

---

## 4 · Printed-material registration

**Authority:** King Fahad National Library (KFNL)

- [ ] **Ask KFNL directly whether this format requires legal deposit and/or an ISBN.** A
      children's activity pad sits near the boundary between a publication and a printed
      product, and the answer determines whether you need a number printed on the cover before
      the print run.
- [ ] If required: legal-deposit number obtained **before printing**
- [ ] If required: ISBN obtained and printed on the cover
- [ ] Any publication approval requirements for the final format confirmed
- [ ] Deposit copies supplied after printing, if required

> **Sequence matters.** If a number must appear on the cover, you cannot discover that after the
> run is printed. Ask in early September, not in October — this is on the critical path to the
> 1–15 October print-proof window, and it is the single most likely item here to delay the launch.

---

## 5 · Product conformity — the one most often missed

**Authority:** SASO, via the SABER platform

The base pad is printed paper. **The gift bundle is not**, if it adds pencils, crayons or
stickers — those are separate products with their own conformity obligations, and they are
usually imported.

- [ ] Confirm whether the bundled items fall under a technical regulation (toys and similar
      children's products commonly do)
- [ ] If so: supplier conformity documentation obtained **before importing or bundling**
- [ ] Required certificates issued through SABER before the goods move
- [ ] Any required marking present on the item or its packaging
- [ ] Age marking on your packaging consistent with the 5–8 positioning everywhere else

> This is the item that stops a shipment at customs after you have paid for it. It is easy to
> design around — sourcing already-certified items, or launching the bundle later — and
> expensive to fix retrospectively. Decide before you commit to the bundle SKU, not after.
> `03-economics/` shows the bundle is the offer that actually carries its own acquisition cost,
> so this check is on the critical path for the offer you most want to sell.

---

## 6 · Personal data

**Authority:** SDAIA / the Personal Data Protection Law (PDPL)

You collect personal data from the first preorder form onward, and you collect it about
**children's parents** for a **children's product** — a context where getting it wrong is
reputationally worse than the legal exposure alone.

- [ ] Privacy policy published in Arabic, saying what you collect and why
- [ ] Consent collected separately for marketing, with a working unsubscribe from the first
      message — the landing form does this; make sure the backend honours it
- [ ] Research data from the September sprint kept separate from any marketing list, and
      **deleted after the write-up** as promised in the consent form
- [ ] Interview and play-test recordings deleted as promised, on the date promised
- [ ] No child's name, face, school or identifying detail stored or used without a separate
      signed release for that specific use
- [ ] Confirm current PDPL obligations for your business — including any registration,
      data-transfer and breach-notification requirements

> The consent forms in `01-validation/fieldpack/fieldpack.pdf` make specific promises: data
> deleted after the write-up, never added to a marketing list, no child's face or name, deletion
> on request up to 30 September. **Have them reviewed by a legal advisor before the first
> session**, and adjust them to what you actually intend to do. Keeping those promises is both
> the obligation and the reason those parents will trust the brand later — which is why the
> recording consent carries a deletion log and each observation sheet carries a deletion tick.

---

## 7 · Payments and platform

- [ ] Payment provider supports **mada** and cards; Apple Pay if the platform allows
- [ ] Fees confirmed in writing and entered into `03-economics/unit-economics.xlsx` — the model
      seeds 2.5% + SAR 1.00, and a different rate changes every contribution figure
- [ ] Settlement timing understood (it affects cash flow, not contribution)
- [ ] Refund mechanics tested end to end, with a real refund, before launch
- [ ] Chargeback process understood

---

## 8 · Intellectual property

**Authority:** SAIP

- [ ] Trademark search on the chosen masterbrand name, in the relevant classes, **before any
      spend on identity** — see `00-strategy/brand-identity-options.md`
- [ ] Illustrator contract assigns the artwork to you in writing, for all the uses you intend
      including future extensions
- [ ] Every motif traced to a licensed or original reference, recorded in the production file
- [ ] Photography and video rights cleared, including creator content you intend to re-share
- [ ] No third-party trademark, official symbol or protected emblem anywhere in the product

---

## Sequencing — what blocks what

```
NOW (early Sept)   Ask KFNL about legal deposit / ISBN    → blocks the print files
NOW                SAIP trademark search                  → blocks identity spend
NOW                Confirm SASO/SABER for bundle items    → blocks the bundle SKU
Before the store   CR + e-commerce docs + Maroof check    → blocks taking real orders
Before the store   Privacy policy + PDPL consent flow     → blocks collecting a single email
Before the store   ZATCA position + VAT-inclusive pricing → blocks the price test being valid
Before launch      Refund tested end to end with real money
```

**The three at the top are the ones to start this week.** Each has an external response time you
do not control, and each can stop the 1–15 October print window if it arrives late.

---

## Sign-off before the first real order

| Area | Confirmed with | Date | By |
|------|----------------|------|-----|
| Entity and CR / e-commerce documentation | SBC / MoC | | |
| Consumer protection and returns policy | MoC | | |
| VAT position and e-invoicing | ZATCA + accountant | | |
| Legal deposit / ISBN | KFNL | | |
| Product conformity for bundled items | SASO / SABER | | |
| Personal data | Legal advisor | | |
| Trademark | SAIP | | |

**No row unsigned when the store opens.**
