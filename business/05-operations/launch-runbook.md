# Launch runbook

Covers the store build, the Gate 6 dry run, launch day, and what to do when things go wrong.

---

## The 20-order dry run — Gate 6

**Nov 5–8, during the founder preorder.** Twenty real orders, packed and shipped for real, before
the public launch. The gate: *print sample, packing, delivery and support flow pass a 20-order
dry run.* This is the cheapest insurance in the whole plan.

### What you are actually testing

| Step | What must work | How you know it failed |
|------|----------------|------------------------|
| Order lands | Confirmation email fires, in Arabic, within a minute | A parent messaging to ask if the order went through |
| Invoice | VAT-compliant invoice issued and reaches the customer | ZATCA problem later, and a customer who cannot expense it |
| Pick and pack | 20 units packed in a sensible time, damage-free | Corner damage, creases, a pad packed upside down |
| Handover | Courier collects, tracking issued | Tracking that never updates |
| Transit | Arrives flat, undamaged, on the promised date | Bent corners — the most likely physical failure |
| Unboxing | Feels deliberate. This is the giftability the price rests on | A customer photo that looks cheap |
| Support | A question answered same-day, in Arabic | Two days of silence |
| **Return** | One real return processed end to end, refund actually issued | Discovering the refund path is broken with a real customer |
| Review | The customer is asked for a verified-photo review, once, politely | Nagging |

### Deliberately break something

Do not only test the happy path. In the twenty, engineer at least one of each:

- [ ] **One return, processed fully** — including the refund landing in the customer's account.
      Untested refund mechanics are the most common launch failure and the worst one to find
      publicly.
- [ ] **One support question** answered as a real customer would ask it
- [ ] **One address outside your two main cities** — delivery cost and time to a smaller city is
      a real number you currently do not have
- [ ] **One deliberately awkward pack** — check the drop test held in transit, not just on a desk

### Pass or delay

If a step fails, **delay the launch.** Gate 6 exists because the first fifty reviews of a new
brand cannot be bought back later, and a November launch that ships badly is worth less than a
December launch that ships well. That trade is the brief's own guidance and it does not need
re-litigating on 12 November when it is inconvenient.

---

## Store build — Oct 16–31

- [ ] Platform chosen; CR verification complete
- [ ] Product page live with **real printed-product photography**, not renders
- [ ] Flip-through video embedded
- [ ] All six trust blocks present, ordered by the survey's objection ranking
- [ ] FAQ live, ordered by survey D2
- [ ] Shipping cost and window shown before payment
- [ ] Returns, privacy, shipping and correction-protocol pages published in Arabic
- [ ] CR number and a monitored contact in the footer
- [ ] mada + cards tested with a real transaction, then refunded
- [ ] VAT-inclusive prices verified on the live page — not just in the admin
- [ ] Confirmation, shipping and delivery emails written in Arabic and tested
- [ ] Analytics firing; preorder events attributed to the winning cell
- [ ] Page checked on a real phone, on mobile data, by a native Arabic reader

---

## Customer support

**One monitored channel.** Two channels you answer slowly is worse than one you answer fast.

| Promise | Standard |
|---------|----------|
| First response | Same business day |
| Language | Arabic by default; English if they write in English |
| Voice | The way you would answer a friend's question about something you made |
| Accuracy concerns | Route to the correction protocol immediately — never argue |

### Canned answers to have ready before launch

- Will markers bleed through? → **the honest answer from your own paper test**
- Is it right for my 4-year-old / 9-year-old? → the honest answer, which includes "not equally"
- When will it arrive? → the real window
- Can I return it? → the policy, stated plainly, with no friction added
- Who made this and who checked it? → names, and the correction promise
- Do you ship outside Saudi Arabia? → decide this **before** launch, not in the inbox

---

## Launch day — 15 November

Controlled release. Not a countdown, not a stunt.

```
Morning     Final check: stock counted, page live, payments working, support staffed
            Post the flip-through video; email the founder-preorder list first
Midday      Creator posts go live (agreed in advance, not requested on the day)
Afternoon   Answer every comment personally, in Arabic
Evening     Reconcile: orders, failed payments, support queue, any delivery issue
```

**No paid spend on day one.** Let organic and creator traffic show you what the page actually
converts at before you buy traffic against an unproven number — and read
`03-economics/README.md` first, because at the seeded assumptions paid acquisition does not
carry the core pad at any tested price.

---

## The first week

Watch four things, daily:

| Signal | Acting on it |
|--------|--------------|
| Conversion on organic traffic | The real number your CAC ceiling has to live inside |
| Support questions repeating | Each repeat is a missing line on the product page — add it that day |
| Delivery exceptions | One bad courier week will produce your worst reviews |
| Review content | The **words** matter more than the stars; they rewrite your copy |

**Replenish only on evidence.** The brief is explicit and the economics agree: a smaller first
run with a fast reprint beats a big run and a warehouse.

---

## When something goes wrong

### A content or accuracy error is reported
Run the correction protocol in `00-strategy/claim-discipline.md`. Acknowledge within two business
days, route to the cultural reviewer — not to marketing — publish the correction, reprint the
sheet, and send it free to everyone who bought that run. Log it. **Do not defend the sheet while
you are still checking it.**

### Bleed-through complaints
This should have been caught in the play-tests and the acceptance test. If it reaches customers:
stop selling the affected run, replace for anyone who asks, fix the paper, and say what you are
doing. Do not tell a parent they used the wrong pen.

### Delivery failure
Refund or replace at your cost, immediately, before arguing with the courier. The margin on one
pad is not worth a public dispute, and it is a fraction of the cost of the review.

### A bad review
Answer it publicly, once, without defensiveness. Fix what it names. Never ask for it to be
removed and never offer anything in exchange for changing it. A well-answered bad review is
better trust proof than a five-star one, because it shows a parent what happens when something
goes wrong.

### Selling out
A good problem, handled badly by over-ordering the reprint. Take the reprint quantity from
actual sell-through rate and the printer's real lead time — not from the excitement of the week.
