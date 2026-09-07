# Acceptance criteria

Each criterion from §9 of the brief, how it is verified, and — where it is not fully verifiable
in this build — exactly what is missing and why.

Run everything with:

```sh
npm test            # 371 unit and integration tests
npm run test:e2e    # 93 end-to-end tests, at 1280px and 390px, in Arabic
npm run db:seed && npm run stock:rebuild && npx tsx scripts/backup.ts --verify
```

---

## 1. The trial balance always nets to zero ✅

Checked at five levels, so a failure anywhere is caught by the layer above:

| Level | Where |
|---|---|
| Domain | `tests/unit/invariants.test.ts` runs a full trading month — purchase, sale, receipt, supplier payment with bank charges, stock shortage, payroll for five, till variance, production — and asserts the trial balance after **every single step** |
| Database | migration `20260907150000` adds a deferred trigger that rejects an unbalanced entry at commit, and a check constraint that rejects a two-sided or negative line. Verified against a live PostgreSQL |
| Persistence | `tests/integration/ledger.test.ts` re-checks after every posting, per branch and over three different date windows |
| Seed | `prisma/seed.ts` fails loudly if the books it produces do not balance |
| End to end | every e2e test that moves money re-reads `/api/v1/reports/trial-balance` and asserts `balanced` |

## 2. B2B invoice → cleared → QR and stamp → payment → correct GL ⚠️ partly

**Verified.** Posting a standard invoice allocates a gap-free number, issues the stock, posts
AR / revenue / VAT output / COGS / inventory, claims the ZATCA chain link and signs — in one
transaction (`tests/integration/zatca.test.ts`). The signed UBL carries the ICV, the PIH, the
XAdES-B signature and the certificate; the QR decodes back to the seller's VAT number and the
invoice totals. Clearance is exercised against a stubbed ZATCA endpoint, including the cleared
copy being stored and ZATCA's warnings surfaced rather than swallowed. The payment then clears
the receivable, debits the bank and leaves VAT output credited — asserted account by account in
`tests/integration/payment-payroll.test.ts` — and the invoice moves to `SETTLED`. The e2e suite
does the same through the browser, including the printed layout: the Arabic title, the VAT
number, every tax line, and the QR rendered from the value inside the signed XML.

**Not verified.** Clearance against ZATCA's *live sandbox*. That needs a real VAT registration
and a Fatoora portal account to obtain a CSID; this build has neither. The client, the CSR, the
signing and both submission models are implemented and tested against the specification's own
structures — the generated CSR is parsed and verified by OpenSSL in the test suite — and
`docs/ZATCA-SANDBOX.md` walks through the four onboarding steps with the exact output at each.
What remains untested is ZATCA's own response to a real submission.

**Not built.** Server-side PDF rendering. Documents print from the browser with a print
stylesheet, which produces a correct PDF through the print dialogue but is not a generated file.

## 3. POS sale offline → reconnect → in the ledger and the ZATCA queue exactly once ✅

`tests/e2e/pos.spec.ts` opens a till, takes the connection away with
`context.setOffline(true)`, rings up two sales against the IndexedDB queue, restores the
connection, and asserts that exactly two simplified tax invoices exist — not four, however many
times the queue is drained — each with a ZATCA submission and a counter value, with the trial
balance still netting to zero.

At the service level, `tests/integration/zatca.test.ts` replays the same batch twice and gets
`CREATED, CREATED` then `DUPLICATE, DUPLICATE`, with two POS sales and two invoices in the
database rather than four. It also proves the server re-prices a sale rung up at a stale price
and records the conflict for the session close report.

## 4. A credit note fully reverses an invoice's GL, VAT and stock ✅

`tests/unit/invariants.test.ts` credits a two-line invoice with a header discount and a mixed
tax breakdown, and asserts that receivables, VAT output, inventory and COGS are all back to
exactly zero — while revenue and returns both stay standing, so the P&L still shows gross sales.
`tests/integration/zatca.test.ts` does the same against the database and re-checks the stock
balance and its value. A partial credit is covered too, and an invoice cannot be credited beyond
what it carried: the limit is the original quantity less what previous notes already took.

## 5. A locked period rejects any posting into it ✅

`tests/unit/invariants.test.ts` closes January, then asserts that posting into it is refused
with a message naming the period — `The period 2026-01-01 to 2026-01-31 is closed.` — while
February still accepts, and that a reversal cannot slip into the closed month either.
`tests/integration/ledger.test.ts` repeats it against the database. The message exists in both
languages, and the Fiscal periods screen closes and reopens a month.

## 6. Payroll for five employees ✅ (one caveat)

`tests/integration/payment-payroll.test.ts` runs payroll for the five seeded employees and
asserts: Saudis carry an employee GOSI contribution and non-Saudis do not while their employer
still does; every payslip accrues end of service; the run is a draft with no ledger effect until
posted; the posting balances, with net pay credited to accrued salaries and both halves of GOSI
credited as one liability; and the WPS file has one employer record and five employee records
with control totals that agree, and every IBAN passing the mod-97 check the bank itself runs.

`tests/unit/payroll.test.ts` covers the arithmetic in detail: the GOSI ceiling and floor,
overtime at 150%, unpaid leave at the daily rate, and the Article 84–87 end-of-service scale
including every resignation band. The e2e suite drives the whole thing from the Payroll screen.

**Caveat.** The file validates against the documented Mudad/SARIE CSV layout, not against one
specific bank's template — layouts differ between banks, so the column order is a template
(`MUDAD_CSV_TEMPLATE`) rather than a constant. See DECISIONS.md D-037.

## 7. The VAT return matches the source invoices to the halala ✅

`tests/integration/reports.test.ts` asserts that box 6 equals the sum of the sales documents
behind it, that box 12 equals the sum of the purchases, that box 13 is the difference and box 15
adds the corrections — and, separately, that box 6 equals the VAT output account in the ledger.
A credit note reduces box 1 and the return still reconciles. `tests/unit/vat.test.ts` builds 137
invoices with awkward amounts and checks the return against their sum. The e2e suite checks the
same through the API.

## 8. Arabic flips to RTL with no clipped text at 1280px and 390px ✅

`tests/e2e/rtl.spec.ts` visits twenty screens at both widths and measures every leaf text element
for overflow, ignoring only what is clipped by design — screen-reader-only content and
deliberate ellipsis truncation. It also asserts the page never scrolls sideways (wide tables
scroll inside their own container), that switching to English flips the direction back, and that
every figure resolves to left-to-right inside a right-to-left page, because a number read the
wrong way is a different number.

This found three real layout faults, all fixed: tables without a scroll container at 390px.

## 9. A cashier cannot reach any accounting endpoint ✅

Three independent checks, none of which is "the menu item is hidden":

- `tests/e2e/authorization.spec.ts` signs in as the cashier against the running server and
  asserts every accounting endpoint returns **403** with the permission named in the message,
  while `/api/v1/invoices` still returns 200 — the cashier can do their own job.
- `tests/unit/api-contract.test.ts` reads each route handler's source and asserts it guards with
  the permission the published contract says it does. It also asserts that no read-only role
  holds any write permission. This test caught three endpoints that were documented but not
  implemented.
- `tests/unit/rbac.test.ts` walks every accounting, payroll, purchasing, HR and settings
  permission and asserts the cashier holds none of them.

The auditor is covered the same way: reads allowed, every write refused.

## 10. Restore from backup completes and passes the trial-balance check ✅

`scripts/backup.ts --verify` dumps the database, gzips it, encrypts it with AES-256-GCM,
restores the archive into a scratch database, and runs the trial-balance check against the
restored copy. It is in CI, and it has been run against this build:

```
Backing up to backups/nakhla-2026-09-07T15-25-34-657Z.sql.gz.enc
  wrote 40 KiB, encrypted with AES-256-GCM
  verified: restored 4 invoices, trial balance nets to zero at 8493.61 SAR
```

---

## Summary

| # | Criterion | Status |
|---|---|---|
| 1 | Trial balance nets to zero | ✅ |
| 2 | B2B invoice → cleared → payment → GL | ⚠️ everything but live ZATCA clearance and generated PDFs |
| 3 | Offline POS posts exactly once | ✅ |
| 4 | Credit note fully reverses | ✅ |
| 5 | Locked period rejects postings | ✅ |
| 6 | Payroll: GOSI, EOSB, WPS, balanced GL | ✅ WPS against the documented layout, not one bank's |
| 7 | VAT return matches source documents | ✅ |
| 8 | Arabic RTL, no clipping, both widths | ✅ |
| 9 | Cashier shut out of accounting | ✅ |
| 10 | Backup restores and still balances | ✅ |
