# Transactional emails

Seven emails covering the founder preorder through the first review request.
Gate 6's twenty-order dry run tests these, so they have to work before **5 November**.

```
python3 business/04-launch/emails/build_emails.py
```

Open `index.html` for the preview gallery. Each email builds to a `.html` and a `.txt`.

## The set

| # | Email | Trigger | Notes |
|---|-------|---------|-------|
| 01 | Preorder confirmation | On preorder, **within one minute** | States plainly that nothing has been charged. A parent messaging to ask whether the order went through is the Gate 6 failure signal. |
| 02 | Shipping confirmation | When the courier collects **and tracking is live** | Never send before tracking updates. A dead tracking number is worse than no email. |
| 03 | Delivered — how to start | On delivery, or 24h after the expected date | The highest-value email in the set. |
| 04 | Review request | 7–10 days after delivery. **Once.** | Explicitly invites negative reviews. |
| 05 | Correction notice | When the cultural review confirms a printed error | Sent to **everyone** who bought the affected run. |
| 06 | Founder window closing | 48h before the founder price ends. Once. | Only valid if the end date was published when the window opened. |
| 07 | Delay notice | **The moment you know**, not when you have a fix | Offers an immediate full refund. |

### Why 03 matters more than it looks

A pad that sits in its packaging for three weeks produces no review, no photo and no repeat
purchase — and `03-economics/` shows repeat purchase is the one thing that fixes the model.
This email's job is to get one sheet torn out this week, so it gives four concrete steps and
one instruction most parents get wrong: **tear out a single sheet, don't hand over the pad.**

### Why 04 invites criticism

"If you didn't like it, say so. We publish every review as written." That costs some stars and
buys the thing a new brand cannot otherwise get — reviews a parent believes. It is also the only
version consistent with `00-strategy/claim-discipline.md`, which bans presenting solicited or
incentivised content as organic. **Never offer anything in exchange for a review or a change to
one.**

### Why 05 exists before you have made an error

The product page promises a correction protocol. A promise with no drafted mechanism gets
improvised badly under pressure, in public, on the worst day. This email is written now, calm,
so that on that day the only work is filling in the sheet number.

It also does the thing that is hard to do in the moment: it says what was wrong, what is right,
how you found out, and that a corrected sheet is already coming **without the customer asking**.

## Before you send anything

- [ ] **Map every merge tag.** The build prints all 28 it emitted. Unmapped tags reach customers
      as literal `{{braces}}`.
- [ ] Replace `{{cr_number}}`, `{{contact_email}}` and the policy URLs — the CR number is a
      disclosure requirement, not decoration (`05-operations/compliance-checklist.md`)
- [ ] `{{unsubscribe_url}}` works, one click, and actually unsubscribes
- [ ] From-name and reply-to are a **monitored** mailbox — 03 and 07 explicitly invite replies
- [ ] SPF, DKIM and DMARC configured on the sending domain
- [ ] Send each one to yourself and read it on a phone, in Arabic, on mobile data
- [ ] Check the Arabic renders in Gmail, Apple Mail and Outlook — Outlook is the one that breaks
- [ ] Confirm your platform sends the plain-text part alongside the HTML

### Merge tag mapping

Map `{{tag}}` to your platform's syntax in one pass. The build prints the full list.

| Group | Tags |
|-------|------|
| Customer | `first_name`, `city` |
| Order | `order_number`, `product_name`, `price`, `founder_price`, `regular_price` |
| Shipping | `carrier`, `tracking_number`, `tracking_url`, `delivery_window`, `new_delivery_window`, `delay_reason` |
| Correction | `sheet_number`, `sheet_title`, `incorrect_text`, `correct_text`, `how_found`, `reviewer_name` |
| Links | `product_url`, `review_url`, `correction_url`, `returns_url`, `privacy_url`, `unsubscribe_url` |
| Business | `cr_number`, `contact_email` |
| Timing | `window_end_date` |

## Transactional vs marketing — the line that matters

Emails **01, 02, 03, 05, 07** are transactional: they concern an order the customer placed, or
a product they bought. **04 and 06 are marketing**, and need the marketing consent collected at
the point of signup, with a working unsubscribe.

Do not blur these. Sending 06 to someone who only ever placed an order, without marketing
consent, is a consent problem — and in a category built on parent trust, a bad one. See PDPL in
`05-operations/compliance-checklist.md` and get professional advice.

**The correction notice (05) is the deliberate exception**: it goes to everyone who bought the
affected run, consent or not, because it concerns the safety and accuracy of a product they
already own. Its footer says so.

## What is deliberately absent

No countdown timers, no "only 3 left", no invented review counts, no re-send of the review
request, no second reminder on the founder window. The page they came from promises a brand
that does not manufacture urgency, and the inbox is where that promise is easiest to break.

Email 06 ends with *"if the timing isn't right, that's fine — we won't send a second reminder."*
Keep that promise; it is worth more than the second send would earn.

## Design constraints — do not "improve" these away

Email clients are not browsers. This set is table-laid out with inline styles, 600px max, and
**no webfonts** — many clients strip them, and a font that fails to load on an Arabic email is
not a cosmetic problem. The stack is `Segoe UI, Tahoma, Arial`, all of which carry Arabic on the
platforms that matter, with an Outlook conditional forcing Tahoma.

The plain-text part is **derived from the rendered HTML** by the build, so it cannot drift out of
sync the way a hand-maintained text version always does.
