# ERD — Nakhla ERP

Every table carries: `id uuid pk`, `tenant_id uuid`, `created_at`, `created_by`, `updated_at`,
`updated_by`, and `deleted_at` (soft delete permitted **only** while a document is in `DRAFT`).
Money is `NUMERIC(18,4)`; quantity is `NUMERIC(18,6)`.

## Core & settings

```mermaid
erDiagram
  Tenant ||--o{ Branch : has
  Tenant ||--o{ User : has
  Tenant ||--o{ Sequence : has
  Tenant ||--o{ AuditLog : records
  Branch ||--o{ Warehouse : hosts
  User }o--|| Role : "has"
  Role ||--o{ RolePermission : grants
  Permission ||--o{ RolePermission : "in"
  User ||--o{ Session : opens
```

## Ledger

```mermaid
erDiagram
  Account ||--o{ Account : "parent of"
  Account ||--o{ JournalLine : "posted to"
  JournalEntry ||--|{ JournalLine : contains
  JournalEntry }o--|| FiscalPeriod : "falls in"
  JournalEntry }o--o| JournalEntry : "reverses"
  Branch ||--o{ JournalLine : "cost centre"
  Currency ||--o{ ExchangeRate : quoted
  BankAccount ||--o{ BankTransaction : holds
  BankTransaction }o--o| JournalLine : "matched to"
```

`JournalEntry.status ∈ {DRAFT, POSTED, REVERSED}`. Constraint: sum(debit) = sum(credit) per entry,
checked in the domain **and** by a deferred DB trigger (`assert_entry_balanced`).

## Sales, purchasing, parties

```mermaid
erDiagram
  Party ||--o{ PartyContact : has
  Party ||--o{ Address : has
  Party ||--o{ Invoice : "billed"
  Quotation ||--o{ SalesOrder : becomes
  SalesOrder ||--o{ DeliveryNote : fulfilled_by
  SalesOrder ||--o{ Invoice : invoiced_by
  Invoice ||--|{ InvoiceLine : contains
  Invoice ||--o{ CreditNote : "credited by"
  Invoice ||--o{ ZatcaSubmission : submitted
  Payment ||--o{ PaymentAllocation : allocates
  Invoice ||--o{ PaymentAllocation : settled_by
  PurchaseOrder ||--o{ GoodsReceipt : received_by
  GoodsReceipt ||--o{ SupplierBill : billed_by
  SupplierBill ||--o{ DebitNote : "debited by"
  Party ||--o{ Expense : "paid to"
```

## Inventory & production

```mermaid
erDiagram
  Item }o--|| ItemCategory : in
  Item }o--|| UnitOfMeasure : "stock uom"
  Item ||--o{ PriceListItem : priced
  PriceList ||--o{ PriceListItem : contains
  Item ||--o{ StockMovement : moves
  Warehouse ||--o{ StockMovement : at
  Item ||--o{ StockBalance : "balance per warehouse"
  StockCount ||--o{ StockCountLine : contains
  BillOfMaterials ||--|{ BomLine : contains
  ProductionOrder }o--|| BillOfMaterials : uses
  Item ||--o{ StockLot : "batch/expiry"
```

`StockMovement` is append-only and is the sole source of `StockBalance` (kept as a materialised
running balance, rebuildable by `pnpm stock:rebuild`).

## POS, HR, platform

```mermaid
erDiagram
  PosSession ||--o{ PosSale : contains
  PosSale ||--|| Invoice : "is a simplified invoice"
  Employee ||--o{ Attendance : logs
  Employee ||--o{ LeaveRequest : requests
  Employee ||--o{ Payslip : paid_by
  PayrollRun ||--|{ Payslip : contains
  Employee ||--o{ Loan : owes
  Attachment }o--o| Invoice : "polymorphic owner"
  Webhook ||--o{ WebhookDelivery : attempts
  ApiKey }o--|| Tenant : scoped
  Notification }o--|| User : "for"
```

## Key invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Σ debit = Σ credit per journal entry | domain + DB trigger + `tests/unit/posting.test.ts` |
| I2 | Trial balance nets to zero for any tenant, any date | `tests/unit/invariants.test.ts` |
| I3 | Tax-invoice numbers are gap-free per (tenant, type, branch, year) | row-locked `Sequence` + test |
| I4 | `ZatcaSubmission.icv` strictly increments; `pih` = hash of previous invoice | `tests/unit/zatca-chain.test.ts` |
| I5 | Posted documents are immutable | status guard + audit log + test |
| I6 | Nothing posts into a `CLOSED` fiscal period | posting engine + test |
| I7 | Stock balance = Σ movements, per (item, warehouse) | rebuild command + test |
