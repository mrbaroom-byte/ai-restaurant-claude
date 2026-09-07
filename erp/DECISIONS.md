# Decisions

Every place the specification left a choice open, or where a regulatory figure could not be
verified from an authoritative source at build time. The rule the brief set is followed
throughout: choose what a Saudi SME accountant would expect, expose the uncertain number as a
setting with the best-known default, and write it down here.

Anything marked **⚑ verify** is a figure or a format that should be confirmed against the
current published source before the system goes live. None of them are hard-coded; each is a
tenant setting or a configurable template.

---

## Business context

**D-001 — The brackets in the brief were left unfilled, so the build targets a restaurant.**
The repository is `ai-restaurant-claude`, and the F&B path exercises the widest surface: recipes
and production, VAT-inclusive menu pricing, a touch POS with modifiers and table sessions, and
simplified invoices at volume. The demo tenant is a two-branch Jeddah restaurant. Nothing in the
code is restaurant-specific — the POS is a tenant toggle, and a trading company that never turns
it on gets an ERP with no POS in it.

**D-002 — Two branches, ten staff, SAR, VAT-registered.** The demo seed uses VAT number
`300000000000003`, which is the shape ZATCA's own examples use (fifteen digits, starting and
ending in 3). It is not a real registration.

---

## Money and arithmetic

**D-003 — Money is `NUMERIC(18,4)`, presented and settled at two decimals.**
Four decimal places in storage so that a fifty-line invoice does not drift by a halala; rounding
to halalas happens once, at the document total. Quantities are `NUMERIC(18,6)` because a recipe
measures grams of a kilo.

**D-004 — Rounding is half-up.** It is what a Saudi accountant does by hand and what ZATCA's
own worked examples show. Banker's rounding would be defensible statistically and surprising in
an audit.

**D-005 — A header discount is allocated across the lines, not posted as its own negative line.**
ZATCA requires the tax breakdown to reflect the discounted taxable base per category, and a
discount that exists only at header level cannot be reconciled back to the VAT return. The
remainder from rounding the allocation goes to the largest line.

**D-006 — VAT is computed on the category group total, not by summing rounded line VAT.**
On a long invoice the two differ by a halala, and ZATCA validates the group figure.

**D-007 — Payable rounding is off by default.** Some businesses round the cash total to the
nearest five or ten halalas. It is a tenant setting (`roundingIncrement`), and when it is on the
difference posts to its own account (7300) rather than being absorbed into revenue, so the VAT
return still ties to the invoices.

---

## Accounting

**D-008 — The chart of accounts uses 1xxx–9xxx as the brief specified**, with 7xxx for other
income and expense including FX, and 9xxx for zakat. Reports group by the code prefix, so a
tenant who adds account 6310 gets it in operating expenses without touching a mapping table.

**D-009 — Postings address accounts by semantic role, not by code.** A tenant can renumber
their chart without breaking the posting engine. The roles the engine cannot work without are
listed in `REQUIRED_ROLES` and the seed fails if any is unmapped.

**D-010 — Sales returns are credited to their own account (4300), not debited against revenue.**
The P&L then shows gross sales and returns separately, which is what an owner asks for when
returns rise.

**D-011 — Cash flow is presented by the direct method.** A small business wants to know what
came in and what went out. An indirect reconciliation from profit is what a lender asks for, and
can be added later without changing the ledger.

**D-012 — A period is closed, not locked, by month-end.** `CLOSED` and `LOCKED` both refuse a
posting; the difference is who can reopen. The engine treats them identically and the message
names which one is in the way.

---

## ZATCA e-invoicing

**D-013 — QR tags 1–7 carry UTF-8 text; tags 8 and 9 carry raw binary.** ⚑ verify
The hash and the signature travel as their base64 *strings*, while the public key and ZATCA's
signature over the certificate travel as raw DER bytes. This follows ZATCA's own SDK. The
encoder in `src/lib/zatca/tlv.ts` is a single function; if a future specification revision
changes the convention, that is the only place to change.

**D-014 — The certificate digest in `xades:SignedSignatureProperties` is the SHA-256 of the
base64 certificate *text*, then base64-encoded.** ⚑ verify
This double encoding is a genuine quirk of the specification rather than a mistake here. It is
isolated in `certificateDigest()`.

**D-015 — Certificate template names are settings, not constants.** ⚑ verify
`TSTZATCA-Code-Signing` for sandbox, `PREZATCA-Code-Signing` for simulation,
`ZATCA-Code-Signing` for production. A template rename by ZATCA is a settings change.

**D-016 — Canonical XML is generated directly rather than canonicalised afterwards.**
Most hash mismatches come from a C14N pass over loosely generated XML. Because this system
generates the invoice itself, the serialiser emits C14N 1.1-conformant bytes in the first place:
no declaration, expanded empty elements, namespaces on the root in prefix order, sorted
attributes. The one deviation from a general C14N implementation is that an element in a
namespace not declared at the root is never emitted — the UBL invoice has a closed namespace set,
so that is exhaustive for this document type.

**D-017 — An invoice is signed inside the transaction that posts it.**
The next invoice's PIH is this invoice's hash. Signing later — in the submission worker, say —
would leave the chain open between posting and signing, and a second invoice could claim a
previous hash that did not exist yet. This was found by an integration test, not by reasoning.

**D-018 — A tenant must complete at least the compliance CSID before issuing tax invoices.**
Posting refuses with a message naming the Settings screen. The alternative — issuing unsigned
invoices and back-filling — produces a chain that can never be made continuous.

**D-019 — A ZATCA validation rejection is terminal; only transport and 5xx failures retry.**
Retrying a rejection burns the 24-hour reporting window and hides the problem from the user. The
rejection is stored whole, with ZATCA's own error codes, and shown on the invoice.

**D-020 — A cleared invoice is stored twice: as signed and as ZATCA returned it.**
The cleared copy is the legal document, and it is what the PDF and the XML download serve.

**D-021 — The invoice line stores a VAT-exclusive unit price**, whatever the item's pricing
convention. A menu priced at 45.00 including VAT stores 39.13. UBL's `cbc:PriceAmount` is
exclusive, the ledger works in exclusive amounts, and storing the till's inclusive price made
the signed XML disagree with the posted invoice — caught by an integration test, fixed at the
root, and guarded by a check that refuses to sign an invoice whose recomputed totals differ from
what was posted.

---

## VAT

**D-022 — The VAT return is built from invoice and bill lines, not from GL balances.**
ZATCA's boxes split by tax category and the ledger does not. An integration test proves the
return agrees with the VAT output account to the halala.

**D-023 — Box 2 (private healthcare and education supplied to citizens) is always zero.**
It needs a tenant-level flag for qualifying supplies, which an ordinary SME does not have. When
one does, the flag belongs on the item, and the mapping is a two-line change in
`buildVatReturn`.

**D-024 — Out-of-scope supplies are not reported on the return at all**, which is why the
category exists separately from zero-rated.

**D-025 — Default exemption reason codes.** ⚑ verify
`VATEX-SA-32` for exports, `VATEX-SA-29` for financial services, and a placeholder for
out-of-scope. ZATCA rejects a non-standard category with no reason, so a default is better than
a blank; each is overridable per line.

**D-026 — An unregistered tenant charges no VAT at all**, whatever an item says. `vatRegistered`
is a tenant flag and it overrides the item's category.

---

## Inventory

**D-027 — Weighted average is the default; FIFO is available and locks after the first movement.**
Most Saudi SMEs already use weighted average and can explain it. Switching mid-life would restate
every historical cost of sale, so `valuationLocked` prevents it.

**D-028 — Negative stock is refused by default.** `allowNegativeStock` turns it on for a
business that genuinely sells ahead of receiving; the issue is then valued at the last known
cost and flagged, so somebody reconciles rather than discovering it at year end.

**D-029 — Landed cost is allocated by value by default**, with quantity and weight offered. Value
is what an auditor expects; weight is what a container freight bill actually follows.

**D-030 — BOM wastage grosses the component up.** A recipe calling for 1 kg of usable onion with
20% trim consumes 1.25 kg. The alternative reading — consume 1 kg and write 0.2 kg off — makes
the recipe cost wrong.

**D-031 — `stock_balances` is a cache of `stock_movements`.** The movements are append-only and
the balance is rebuildable; `pnpm stock:rebuild` recomputes it and reports drift, and CI runs it.

---

## Payroll

**D-032 — GOSI rates are settings with 9.75% employee / 11.75% employer for Saudis and 2%
employer for non-Saudis as defaults.** ⚑ verify
These are the figures the brief gave. They have changed within the working life of most Saudi
SMEs and the 2024 reform introduced a stepped schedule for new entrants, so every rate, the
ceiling and the floor are editable per tenant and are **stamped onto each payroll run**: a
historical payslip recomputes with the rates that applied when it was produced.

**D-033 — The contributory wage is basic plus housing, capped at SAR 45,000 and floored at
SAR 1,500 for Saudis.** ⚑ verify Transport and other allowances are excluded.

**D-034 — Overtime is 150% of the hourly rate computed on the full wage**, not on basic alone.
That is the reading Saudi labour offices apply to Article 107. The 240-hour divisor (30 days ×
8 hours) is common practice rather than statute, so it is a setting.

**D-035 — End of service follows Articles 84–87**: half a month per year for the first five
years, a full month thereafter, pro-rated for part years. Resignation pays nothing under two
years, one third to five, two thirds to ten, and in full at ten. Article 81 resignations, and a
woman resigning within six months of marriage or three months of childbirth, pay in full.

**D-036 — The monthly accrual is the movement in the *full* award, not the resignation-adjusted
figure.** The liability the business carries is what it would owe on termination.

**D-037 — The WPS file follows the common Mudad/SARIE CSV layout, and the column order is a
template.** ⚑ verify
Bank layouts differ. `MUDAD_CSV_TEMPLATE` is the default; a bank that wants a different order,
delimiter or line ending is a settings change, not a code change. Validation is strict —
mod-97 IBAN check, Iqama format, duplicate-account detection — because a file the bank rejects
costs the employees their salary date.

---

## Security and access

**D-038 — Passwords use scrypt from Node's own crypto**, at N=2^17, r=8, p=1. No native
dependency to compile, which matters for a business deploying on whatever host they have. The
stored form carries its parameters so they can be raised later and old hashes still verify.

**D-039 — TOTP is mandatory for Owner and Accountant, but enrolment happens at first sign-in.**
A brand-new Owner has no authenticator to read a code from; locking them out of their own books
on day one is a support call, not security. They sign in with the password once and cannot reach
anything except the enrolment screen until it is done. Once enrolled, the code is always
required.

**D-040 — Row-level security *and* application-level tenant scoping.** The migration creates a
`nakhla_app` role that the policies apply to; the migration role owns the tables and is exempt.
Production must connect as `nakhla_app`, which `.env.example` says.

**D-041 — An API key carries explicit permissions, never a role's whole set.** It is created
with the `AUDITOR` role as a floor and its permissions listed individually, so a key for a
stock-taking app cannot post a journal entry.

**D-042 — The audit log redacts on the way in.** Key material, IBANs and identity numbers are
replaced with `[redacted]` before storage, so the log can be handed to an auditor whole.

---

## Data protection (PDPL)

**D-043 — Encrypted at rest: ZATCA private keys and CSIDs, employee IBANs and identity numbers,
webhook secrets, TOTP secrets, and the backup archive.** AES-256-GCM under a single
`ENCRYPTION_KEY`. Losing that key means losing those values, which `.env.example` says plainly.

**D-044 — Employee data access is logged**, and the audit log viewer is a permission of its own
(`audit.view`) rather than something every manager has.

**D-045 — Data residency is a deployment decision, not a code one.** The README says where to
put the host and the bucket; nothing in the application assumes a region.

---

## Scope actually delivered

The brief describes eleven modules. What is built and tested end to end:

| Module | State |
|---|---|
| M1 Core & settings | Tenant, branches, users, roles, gap-free sequences, audit log, RLS |
| M2 CoA & GL | Full: posting engine, periods, FX on settlement, trial balance |
| M3 Contacts | Party model, National Address, aging, statements as data |
| M4 Sales | Invoice, credit note, payments, price lists, VAT categories |
| M5 ZATCA | Full: UBL, hash chain, TLV QR, XAdES-B, CSR, onboarding, clearance and reporting |
| M6 Purchasing | Bills, landed cost, withholding tax, expenses — model and postings |
| M7 Inventory | Full: WAVG/FIFO, BOM, production, movements, rebuild |
| M8 POS | Session, tenders, offline queue and idempotent replay, till variance |
| M9 HR & payroll | Full: GOSI, overtime, EOSB, payslips, WPS, balanced posting |
| M10 Reporting | Trial balance, P&L, balance sheet, cash flow, VAT return, aging, dashboard |
| M11 Integrations | REST API + OpenAPI, health, encrypted backup with verified restore |

**Not built, and named rather than implied.** These have data models and postings but no
dedicated screen: quotation → sales order → delivery note as separate documents, purchase order
→ goods receipt as a screen flow, bank statement import and reconciliation UI, stock count
sessions UI, recurring invoices, the customer payment portal, WhatsApp and email dispatch,
outbound webhooks, and scheduled report email. Server-side PDF rendering is not implemented
either — every document prints from the browser with a print stylesheet, which produces a
correct PDF via the print dialogue but is not the same as a generated file. Each is additive:
the ledger, the tax engine and the ZATCA chain they would post through are finished and tested.
