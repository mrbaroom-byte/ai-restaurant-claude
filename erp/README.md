# Nakhla ERP

A small-business ERP for Saudi Arabia. Double-entry accounting, ZATCA Phase 2 e-invoicing,
inventory with recipes, a tablet point of sale that works offline, and payroll that produces a
WPS file the bank will accept — in Arabic and English, both first-class.

Built for a business of five to fifty people across one to five branches: usable by an owner who
has never seen a ledger, auditable by an accountant who has seen too many.

---

## What it does

**The ledger is the spine.** Every business event — a sale, a receipt, a stock count, a payroll
run — posts a balanced journal entry through one engine. No module writes to the ledger itself.
An entry that does not balance is refused by the domain, and again by a PostgreSQL trigger, so a
bug in one layer cannot corrupt the books on its own.

**Posted documents are immutable.** An invoice is reversed or credit-noted, never edited. The
database enforces this, not just the application.

**ZATCA Phase 2, in full.** UBL 2.1 generation, the ICV/PIH hash chain, the nine-tag TLV QR, an
XAdES-B cryptographic stamp signed with a secp256k1 key, a PKCS#10 CSR built from scratch, the
four-step onboarding flow, and both submission models — clearance for B2B, reporting for B2C.
ZATCA's warnings and errors are stored whole and shown on the invoice. Nothing is swallowed.

**Money never touches a float.** `NUMERIC(18,4)` in the database, `Decimal` in the domain, two
decimals only at the point a human reads or pays it.

---

## Getting started

Fifteen minutes, most of it waiting for Docker.

```sh
git clone <this repository>
cd erp

cp .env.example .env
# Generate the key that encrypts ZATCA keys, IBANs and backups:
echo "ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"" >> .env

docker compose up -d db redis storage
npm install
npm run db:deploy      # apply migrations
npm run db:seed        # demo tenant with a month of trading
npm run dev
```

Open <http://localhost:3000>. The seed prints eight sign-ins, one per role; the password is the
same for all of them and is printed too.

Sign in as `owner@nakhla.sa` first. The Owner and Accountant roles require two-factor
authentication, so you will be asked to scan a QR into an authenticator app before you can reach
anything else. That is deliberate — those two roles can move money and close the books.

### Without Docker

Point `DATABASE_URL` at any PostgreSQL 16 and run the same commands. Redis is optional: without
it the background worker falls back to a database sweep, which still submits every invoice to
ZATCA, just on a timer rather than immediately.

---

## The demo tenant

A two-branch Jeddah restaurant, seeded through the same code paths the application uses — the
seed fails loudly if the books it produces do not balance.

- Chart of accounts: 73 accounts, Arabic and English, with every posting role mapped
- Two branches with Saudi National Addresses, two warehouses, twelve fiscal periods
- A menu with a chicken mandi recipe, five raw materials, two price lists
- Two suppliers, two customers, five employees with encrypted identity numbers and IBANs
- A ZATCA device with a generated key and CSR
- A goods receipt, a production run, a posted tax invoice with a cryptographic stamp, and a part
  payment

---

## Running the checks

```sh
npm run lint          # ESLint, including rules that keep floats and Prisma out of the domain
npm run typecheck
npm test              # 345 tests: unit and integration
npm run test:coverage
npm run test:e2e      # Playwright, at 1280px and 390px, in Arabic
```

The integration tests need PostgreSQL — they exercise the row-locked sequence, the deferred
balance trigger and the idempotent POS replay, none of which exist without a database.

Three operational checks are also worth running, and CI runs all three:

```sh
npm run db:seed                    # fails if the seeded books do not balance
npm run stock:rebuild              # fails if a stock balance disagrees with its movements
npx tsx scripts/backup.ts --verify # dumps, encrypts, restores, and checks the trial balance
```

---

## How it is put together

```
src/
  lib/           the domain core: pure functions, no I/O, no Prisma, no Next
    money.ts       decimal arithmetic and the allocator that never loses a halala
    accounting/    chart of accounts, the posting engine, one builder per document type
    tax/           VAT computation and the Form 12 return
    zatca/         UBL, canonical XML, hashing, TLV QR, XAdES-B, CSR, the Fatoora client
    inventory/     weighted-average and FIFO valuation, landed cost, BOM explosion
    payroll/       GOSI, overtime, end of service, WPS
    crypto/        AES-256-GCM vault, scrypt passwords, TOTP
    rbac.ts        the permission matrix the API, the UI and the tests all read
  server/
    services/      the only code that touches both the domain and the database
    actions/       server actions behind the UI
    jobs/          the BullMQ worker and its sweep fallback
  app/             Next.js routes: the UI and /api/v1
```

The layering is enforced, not merely intended: ESLint forbids the domain core from importing
Prisma or Next, and a test asserts that every documented endpoint guards with the permission it
publishes.

For the reasoning behind the shape of it, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/ERD.md`](docs/ERD.md). Every assumption and every regulatory figure that could not be
verified from source is written down in [`DECISIONS.md`](DECISIONS.md), with the ones worth
double-checking marked.

---

## ZATCA onboarding

Settings → ZATCA walks through it in four numbered steps:

1. **Generate a certificate request.** Creates a secp256k1 key pair and a CSR carrying the EGS
   unit's identifiers. The private key never leaves the server and is stored encrypted.
2. **Request the compliance CSID**, using the OTP from the taxpayer's own Fatoora portal.
3. **Run the compliance checks.** One sample invoice per type the CSR enabled.
4. **Request the production CSID.** Only once the checks pass.

Each step shows what ZATCA actually replied, so a taxpayer who gets stuck at step 3 can see which
check failed rather than "onboarding failed". A full sandbox walkthrough is in
[`docs/ZATCA-SANDBOX.md`](docs/ZATCA-SANDBOX.md).

A tenant cannot issue tax invoices before at least the compliance CSID is in place. That is not a
limitation to work around: an invoice issued outside the chain can never be made continuous
afterwards.

---

## The API

`/api/v1`, validated by Zod, documented in [`docs/openapi.json`](docs/openapi.json) — generated
from the same schemas the handlers use, so the spec cannot drift. CI fails if it is stale.

Authenticate with the session token from `POST /api/v1/auth/login`, or with a long-lived API key.
An API key carries explicit permissions rather than a role's whole set, so a key for a
stock-taking app cannot post a journal entry.

```sh
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cashier@nakhla.sa","password":"..."}' | jq -r .token)

curl localhost:3000/api/v1/invoices -H "Authorization: Bearer $TOKEN"
```

---

## Deploying

One image, three run modes. `docker-compose.prod.yml` brings up the database, Redis, the web
process, the worker and a nightly backup that verifies its own restore.

```sh
cp .env.example .env    # and fill it in
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Put a TLS terminator in front of `app`; nothing in the compose file listens on a public
interface by itself.

**Connect as a non-owner role.** The migration creates `nakhla_app` and applies the row-level
security policies to it. Connecting as the table owner bypasses them, which loses one of the two
layers of tenant isolation.

### Data residency

Nothing in the application assumes a region, so residency is a deployment decision. For a Saudi
business handling Saudi personal data under the PDPL, run the host and the object store inside
Saudi Arabia — the major providers all have a Riyadh or Dammam region, and `S3_REGION` in
`.env.example` defaults to `me-south-1`. The nightly backup is encrypted before it leaves the
host, so the bucket never holds readable personal data.

### Backups

`scripts/backup.ts` dumps, gzips, encrypts with AES-256-GCM under `ENCRYPTION_KEY`, and uploads.
With `--verify` it then restores the archive into a scratch database and checks the trial balance
still nets to zero. The production compose file runs it nightly with `--verify`, because a backup
nobody has restored is a hope rather than a backup.

**Back up `ENCRYPTION_KEY` separately from the database.** Losing it means losing the ZATCA
private keys, the employee IBANs and identity numbers, and every backup archive.

---

## Security

- OWASP ASVS L2 as the target. Parameterised queries throughout; Prisma or explicit bind
  parameters, never string interpolation.
- Passwords: scrypt at N=2^17, with the parameters stored alongside the hash so they can be
  raised later.
- Two-factor: TOTP, mandatory for Owner and Accountant, enrolled at first sign-in.
- Sessions are opaque random tokens stored as a hash, so a database dump cannot be replayed as a
  login.
- Encrypted at rest: ZATCA private keys and CSIDs, IBANs, identity numbers, TOTP secrets,
  webhook secrets, and the backup archive.
- Tenant isolation twice over: every query is scoped in the application, and PostgreSQL
  row-level security enforces it again.
- The audit log redacts key material and personal identifiers on the way in, so it can be handed
  to an auditor whole.
- A strict Content-Security-Policy, and no third-party script, font or analytics anywhere — an
  e2e test blocks every outbound request and the application still works.

Report a security issue privately rather than through the issue tracker.

---

## User guides

- [English](docs/guide/en.md)
- [العربية](docs/guide/ar.md)

---

## Licence

MIT. See [`LICENSE`](../LICENSE).
