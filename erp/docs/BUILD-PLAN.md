# Build plan

Each module ships runnable and tested before the next begins. "Tested" means the domain logic has
unit tests that pass with no infrastructure, and the persistence path has an integration test that
runs against the Postgres service in CI.

| # | Module | Key deliverables | Gate before moving on |
|---|---|---|---|
| M1 | Core & settings | Tenant/branch/user/role, gap-free sequences, audit log, RLS | sequence concurrency test; RBAC matrix test |
| M2 | CoA & GL | KSA SME CoA, posting engine, periods, FX, bank rec | trial balance nets to zero; locked period rejects |
| M3 | Contacts | Party (customer+supplier), National Address, aging, statements | aging bucket test |
| M4 | Sales | Quote→SO→DN→Invoice→Credit note, price lists, VAT categories | credit note reverses GL+VAT+stock exactly |
| M5 | ZATCA | UBL 2.1, hash chain, TLV QR, XAdES-B, CSR/CSID, clearance+reporting | TLV/hash vectors match ZATCA spec samples |
| M6 | Purchasing | PO→GRN→Bill→Debit note, expenses, landed cost, WHT | landed cost changes WAVG correctly |
| M7 | Inventory | Items, warehouses, WAVG/FIFO, BOM/production, lots | valuation property tests |
| M8 | POS | Touch UI, tenders, sessions, offline queue, ESC/POS | offline replay posts exactly once |
| M9 | HR & payroll | GOSI, OT, EOSB, leave, WPS export, payslips | payroll GL balances; WPS validates |
| M10 | Reporting | TB, P&L, BS, CF, VAT return, aging, dashboard | VAT return = Σ source invoices |
| M11 | Integrations | REST API + OpenAPI, webhooks, WhatsApp/email, backups | restore passes trial balance |

## Sequencing notes

* M5 depends only on M4's invoice shape, so the ZATCA domain library (hashing, TLV, UBL, signing)
  is written as a standalone, dependency-free package and unit-tested against the specification's
  own sample vectors before any HTTP call exists.
* M8 reuses M4's invoice posting path verbatim — a POS sale *is* a simplified tax invoice. There is
  no second sales ledger.
* M9's payroll posting goes through the same posting engine as everything else.
