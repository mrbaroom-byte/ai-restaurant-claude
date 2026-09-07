# Nakhla ERP — user guide

Written for the person who runs the business, not the person who installed the software. Each
section says what the screen is for, what to do on it, and what the system will refuse to let you
do.

---

## Signing in

Your email and the password the owner set for you. If you are the Owner or the Accountant you
will also be asked for a six-digit code from an authenticator app — those two roles can move
money and close the books, so a password alone is not enough.

The first time you sign in as one of those roles the system shows you a QR code. Scan it with
Google Authenticator or any similar app, type the code it shows, and you are in. You cannot reach
anything else until this is done.

**Switching language.** Top right, "العربية" or "English". Everything switches — labels, reports,
printed invoices — and the layout flips direction. Your choice is remembered.

---

## The dashboard

What the business looks like this morning.

- **Cash position** — what is in the tills and the bank right now, from the ledger, not from a
  bank feed.
- **Sales today, this month, this year** — net of VAT and net of credit notes, so it is
  comparable with last year's figure beside it.
- **Receivables and payables** — what customers owe you and what you owe suppliers. Select the
  receivables figure to see who, and how late.
- **Items below reorder level** — what to buy before you run out.
- **ZATCA status** — how many invoices are cleared, reported, waiting, or rejected. **If this
  shows rejections, deal with them today.** A simplified invoice must reach ZATCA within
  24 hours.
- **Documents expiring soon** — Iqamas within 90 days of expiry.

---

## Issuing an invoice

**Sales → Tax invoices → new.**

Pick the customer, add lines, and post. Two kinds:

- **Tax invoice** (فاتورة ضريبية) for a business customer. Their name, VAT number and address are
  required — ZATCA rejects a standard invoice without them.
- **Simplified tax invoice** (فاتورة ضريبية مبسطة) for a walk-in customer. No buyer details
  needed.

A draft has no effect on anything. **Post** is the moment it becomes real: it takes the next
invoice number, takes the goods out of stock, posts to the ledger, and signs the invoice for
ZATCA — all together, or not at all.

### After posting

The invoice screen shows the QR your customer can scan, the ZATCA counter, and the submission
status. **Print** produces the invoice as your customer should receive it: the Arabic title, your
VAT number, every tax line, and the QR. **XML** downloads the signed document; once ZATCA has
cleared it, this gives you ZATCA's copy, which is the legal one.

### What you cannot do

**You cannot edit or delete a posted invoice.** This is not the system being awkward — ZATCA
reads a missing invoice number as a deleted invoice, and a gap in the sequence is the first thing
an auditor looks for.

To correct one, issue a **credit note**: on the invoice, select *Issue credit note* and say why.
The credit note reverses the ledger, the VAT and the stock exactly, and both documents stay in
the books so anyone can see what happened.

ZATCA requires a reason on every credit note. The system will not let you leave it blank.

---

## Taking money at the till

**Point of sale.**

Open a session with the cash you are starting with in the drawer. Tap items to add them, use
**+** and **−** to change quantities, and choose how the customer paid.

**If the internet drops, keep selling.** Each sale is saved on the tablet before anything is sent
to the server. A banner tells you that you are offline and how many sales are waiting. When the
connection returns they are sent automatically, and each one becomes a simplified tax invoice.

Sending the same sale twice is not possible — every sale carries its own key, so if a sale is
sent again after a timeout it resolves to the same invoice rather than a second one.

If a price changed while the till was offline, the price list wins and the difference is recorded
so you can see it at close.

**Closing the session.** Count the cash and enter it. The system compares it with what the till
took. A difference is posted — a shortage as an expense, an overage as income. Neither is
quietly absorbed.

---

## Stock

**Inventory → Items** is what you buy and sell. **Stock balances** is how much you have and what
it is worth.

Stock moves by itself: selling an item takes it out, a credit note puts it back, a production run
turns components into a finished good. You do not post stock movements by hand for ordinary
trading.

**By default you cannot sell what you do not have.** The system refuses and tells you the
quantity available. If your business genuinely sells ahead of receiving, the owner can allow
negative stock in settings; the shortfall is then flagged so somebody reconciles it rather than
finding it at year end.

### Recipes

An item can have a bill of materials — a recipe. Producing forty portions of chicken mandi
consumes the chicken, rice, spice and oil in the right quantities and creates forty portions at
their real cost. Wastage is handled the way a kitchen thinks about it: a recipe needing one
kilo of usable onion with 20% trim consumes 1.25 kg.

---

## Employees and payroll

**Human resources → Employees** holds each person's contract, wage and documents. Identity numbers
and bank accounts are encrypted and shown masked — you can see the last few digits to check you
have the right person, not enough to copy them.

**Payroll** works out, for each employee:

- GOSI, at the rates in force, on basic plus housing only
- Overtime at 150% of the hourly rate
- Unpaid leave, at the daily rate
- Loan instalments and other deductions
- End-of-service accrual — half a month per year for the first five years, a full month after

The rates are recorded on each payroll run. An old payslip reprinted next year still shows the
rates that applied when it was produced.

The run produces a **WPS file** for your bank. The system checks every IBAN with the same
calculation the bank uses, checks every Iqama number, and refuses to produce a file it knows the
bank will reject — it names the employee and the problem instead.

---

## Reports

**Trial balance** — every account, and a line at the top saying whether it balances. It always
should; if it ever does not, that is a fault worth reporting.

**Profit and loss** — revenue, cost of sales, gross profit, expenses, net profit. Tick
*Comparative* to put last year's figures beside this year's.

**Balance sheet** — what you own, what you owe, and what is left. This year's profit is carried
into equity, so it balances before year end.

**VAT return** — the boxes of Form 12, ready to type into the ZATCA portal. Below them is every
invoice and bill that makes up the figures, so if a number looks wrong you can see which
document caused it. The total always equals the sum of the documents; that is checked
automatically.

**Aging** — who owes you, in 30-day buckets, biggest first. Switch to payables for what you owe.

---

## Month end

1. Check the dashboard's ZATCA panel is clear of rejections.
2. Run the VAT return for the month, check the drill-down, and file it in the ZATCA portal.
3. Look at the trial balance.
4. **Accounting → Fiscal periods**, close the month.

Once a period is closed nothing can be posted into it, and the system says which period is in the
way if someone tries. If a receipt turns up afterwards the Accountant can reopen the month —
that is recorded in the audit log.

---

## What each role can do

| Role | What they see |
|---|---|
| **Owner** | Everything, including settings, users and ZATCA onboarding |
| **Manager** | Runs a branch: sales, purchasing, stock, POS. Sees the accounts, cannot change them |
| **Accountant** | Owns the books: journal, periods, VAT, payroll posting. Never touches the till |
| **Sales** | Own quotes and invoices; can see stock and customers |
| **Storekeeper** | Receives goods, moves and counts stock. Cannot see costs or sell |
| **Cashier** | Their own till session. Nothing else |
| **HR** | Employees and payroll preparation, but cannot post payroll to the ledger |
| **Auditor** | Reads everything, writes nothing |

This is enforced on the server, not by hiding menu items. A cashier who types the address of the
trial balance is refused, and told which permission they are missing.

---

## When something goes wrong

Error messages name the problem and what to do about it. Some you will meet:

- *"The period 2026-01-01 to 2026-01-31 is closed."* — post to an open month, or ask the
  Accountant to reopen it.
- *"Only 5.000 in stock but 8.000 was requested."* — receive the goods first, or correct the
  quantity.
- *"You do not have permission to do this (accounting.view)."* — ask the owner for the
  permission named.
- *"ZATCA requires a reason on every credit note."* — say why you are crediting it.

If a message ends with a reference code, that is a fault rather than something you did. Give the
code to whoever supports your installation; it identifies the exact event in the log.
