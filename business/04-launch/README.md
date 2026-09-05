# Launch assets

| File | What it is |
|------|-----------|
| `landing/build.py` | Generates the three test cells from one template, and **fails loudly** if they drift |
| `landing/a/index.html` | Cell A — creative-learning lead *(the brief's recommended lead)* |
| `landing/b/index.html` | Cell B — culture lead |
| `landing/c/index.html` | Cell C — screen-balance lead |
| `product-page-copy.md` | Full PDP copy deck, bilingual, with the trust blocks |
| `ad-creative-briefs.md` | Video scripts and carousel briefs for each acquisition stage |
| `creator-seeding-kit.md` | The creator brief, disclosure rules, and what to send |
| `emails/build_emails.py` | Generates the 7 transactional emails — HTML, plain text, preview gallery |

Build: `python3 business/04-launch/landing/build.py`

## The pages are generated, not hand-written — on purpose

A message test is only valid if the cells are identical apart from the message. Three
hand-maintained HTML files drift within a day, and once they drift you cannot attribute the
result to the message. So everything below the hero comes from one template string, and the
build script diffs the output and **exits with an error** if any cell differs beyond the two
legitimate identifiers (the hidden attribution field and the footer's cell label).

If you need to change the page, change `build.py` and re-run it. Never edit
`a/index.html` directly.

## Before these pages take a single real click

- [ ] Set `ENDPOINT` in the page script to your form handler or store — until then submissions
      are only logged to the console, which is enough to rehearse but **not** to run the test
- [ ] Replace `[CR NUMBER]` and `[EMAIL]` in the footer — required disclosure, see
      `05-operations/compliance-checklist.md`
- [ ] Link real returns, privacy, shipping and correction-protocol pages
- [ ] Replace the product placeholder with **real printed-prototype photography** — the trust
      section promises "never renders alone", and breaking that promise on the page that makes
      it is the worst possible first impression
- [ ] Confirm the preorder consent text matches what you actually do with the data (PDPL)
- [ ] Check the Arabic on a real device, at real size, with a native reader

## What is deliberately absent

No review count, no "join 2,000 parents", no stock counter, no countdown timer. The page has an
explicit **"We're new, and we won't pretend otherwise"** block instead.

This is not modesty, it is the strategy. The brief identifies trust as the thing that has to
replace physical inspection, and the fastest way to lose it is a social-proof claim a parent can
tell is invented. Saying "we haven't sold anything yet, here is a real printed prototype and an
independent cultural review" is a stronger position than a number nobody believes — and it is
the only version consistent with `00-strategy/claim-discipline.md`.

## Running the test

1. **Message test first.** Cells A vs B, identical spend, identical audiences, both cities.
   Price held constant at SAR 39 across both. Minimum 200 qualified clicks per cell.
2. **Then the price cell**, inside the winning message only. SAR 39 vs 49, pad vs bundle.
3. Cell C is a reserve. Run it only if A and B tie and you have budget left — the screen-balance
   angle is the brief's third hypothesis and worth a read, but it is not what the SAR 2,500 test
   line is for.

Every event fires with the cell attached, so the message test can be read without a join. Scroll
depth is instrumented because it separates the two failure modes that look identical in a
conversion number: *the hero lost them* (no scroll) versus *the page lost them* (scrolled, did
not convert). Those need opposite fixes.
