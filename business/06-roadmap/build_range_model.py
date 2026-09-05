#!/usr/bin/env python3
"""Generate range-model.xlsx — the economics of the product range, not just the flagship.

The flagship model in 03-economics/ answers "can one pad pay for one customer". This answers
the question that actually decides the business: "what does a customer cohort look like once
there is more than one thing to buy".

Tabs:
  SKUs            every product, its COGS build-up and contribution
  Attach          what adding a sticker sheet to an order is worth, vs a price rise
  Cohort          100 customers over 12 months at a given repeat rate
  Repeat Sensitivity   blended CAC headroom as repeat rate varies — the decisive table
  Sequencing      the wave plan with its gates

Run:  python3 business/06-roadmap/build_range_model.py
"""

import pathlib

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

INK, ACCENT, RED, LIGHT, GREY = "1F3A2E", "C8763C", "9B2C2C", "F2EDE4", "667269"
H1 = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
H2 = Font(name="Calibri", size=11, bold=True, color=INK)
BODY = Font(name="Calibri", size=10)
MUTED = Font(name="Calibri", size=9, italic=True, color=GREY)
BIG = Font(name="Calibri", size=12, bold=True, color=ACCENT)
FILL_HEAD = PatternFill("solid", fgColor=INK)
FILL_SUB = PatternFill("solid", fgColor=LIGHT)
FILL_IN = PatternFill("solid", fgColor="FFF8E1")
THIN = Side(style="thin", color="D4CFC4")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")
SAR, PCT = "#,##0.00", "0.0%"


def title(ws, t, sub, span=8):
    c = ws.cell(row=1, column=1, value=t)
    c.font = Font(name="Calibri", size=15, bold=True, color=INK)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    s = ws.cell(row=2, column=1, value=sub)
    s.font = MUTED
    s.alignment = WRAP
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
    ws.row_dimensions[2].height = 30


def header(ws, row, heads, widths):
    for i, h in enumerate(heads, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = H1
        c.fill = FILL_HEAD
        c.alignment = CENTER
        c.border = BOX
    ws.row_dimensions[row].height = 30
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def note(ws, row, text, span=8, warn=False):
    c = ws.cell(row=row, column=1, value=text)
    c.font = Font(name="Calibri", size=9, italic=True,
                  color=RED if warn else GREY, bold=warn)
    c.alignment = WRAP
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    ws.row_dimensions[row].height = 32


# --------------------------------------------------------------------- SKUs
SKUS = [
    # name, price, unit cost, ships separately?, role
    ("Sticker sheets",      17,  3.00, False, "Attach only. No extra shipping, artwork already paid for."),
    ("Postcard set",        27,  7.00, True,  "Entry price and a gifting occasion."),
    ("Core pad (39)",       39, 17.50, True,  "The proposition at the low test price."),
    ("Core pad (49)",       49, 17.50, True,  "The proposition at the premium test price."),
    ("Ages 3-5 edition",    37, 17.50, True,  "Unlocks the younger sibling."),
    ("Ages 9-12 edition",   47, 18.50, True,  "Answers 'my older child called it babyish'."),
    ("Gift bundle",         89, 27.00, True,  "Pad + stickers + pencils."),
    ("Activity kit",       149, 55.00, True,  "The only SKU whose contribution carries a real CAC."),
]


def sheet_skus(wb):
    ws = wb.active
    ws.title = "SKUs"
    title(ws, "The range — contribution by SKU",
          "VAT-inclusive prices. Costs are PLACEHOLDERS pending quotes; the flagship figures "
          "match 03-economics. 'Attach' SKUs ride an existing parcel, which is why their thin "
          "margin still beats a price rise.", span=9)
    header(ws, 4,
           ["SKU", "Price inc VAT", "Net revenue", "Unit cost", "Shipping subsidy",
            "Payment fee", "Returns", "CONTRIBUTION", "Role"],
           [22, 13, 13, 11, 15, 12, 10, 15, 52])
    for i, (name, price, cost, ships, role) in enumerate(SKUS):
        r = 5 + i
        ws.cell(row=r, column=1, value=name).font = BODY
        ws.cell(row=r, column=2, value=price)
        ws.cell(row=r, column=3, value=f"=B{r}/1.15")
        ws.cell(row=r, column=4, value=cost)
        ws.cell(row=r, column=5, value=7.0 if ships else 0.0)
        ws.cell(row=r, column=6, value=f"=IF(E{r}=0,0,B{r}*0.025+1)")
        ws.cell(row=r, column=7, value=f"=0.04*(D{r}+IF(E{r}=0,0,22))")
        ws.cell(row=r, column=8, value=f"=C{r}-D{r}-E{r}-F{r}-G{r}")
        n = ws.cell(row=r, column=9, value=role)
        n.font = MUTED
        n.alignment = WRAP
        for c in range(1, 10):
            cell = ws.cell(row=r, column=c)
            cell.border = BOX
            if c not in (1, 9):
                cell.font = BODY
            if 2 <= c <= 8:
                cell.number_format = SAR
                cell.alignment = RIGHT
        ws.cell(row=r, column=8).font = BIG
        ws.cell(row=r, column=8).fill = FILL_SUB
        ws.row_dimensions[r].height = 24
    note(ws, 14,
         "Sticker sheets carry no shipping subsidy and no payment fee because they attach to an "
         "order that already pays both. That is the whole argument for launching them first: the "
         "cheapest possible test of whether a customer will buy twice, on artwork already paid for.",
         span=9)
    note(ws, 16,
         "The activity kit is the only line whose contribution can absorb a realistic acquisition "
         "cost. If paid advertising is ever going to work for this business, it works on this SKU "
         "and not on the pad. It is also the SKU blocked on SASO/SABER conformity for the pencils.",
         span=9, warn=True)


# --------------------------------------------------------------------- attach
def sheet_attach(wb):
    ws = wb.create_sheet("Attach")
    title(ws, "Attach rate vs. a price rise",
          "Two ways to raise contribution per order. One costs conversion; the other does not.",
          span=7)
    header(ws, 4, ["Lever", "Change", "Contribution/order", "vs baseline", "Conversion cost",
                   "Verdict", ""], [34, 20, 18, 14, 22, 30, 4])

    rows = [
        ("Baseline: core pad @ 39", "—", "='SKUs'!H7", "", "—", "The problem case"),
        ("Raise price to 49", "+SAR 10", "='SKUs'!H8", "=C6-C5",
         "Real — this is what the price cell measures", "Worth testing, costs conversion"),
        ("Attach stickers to 30% of orders", "+30% x sticker contribution",
         "=C5+0.3*'SKUs'!H5", "=C7-C5", "None — same parcel, same checkout",
         "Free contribution. Do this first."),
        ("Attach stickers to 50% of orders", "+50% x sticker contribution",
         "=C5+0.5*'SKUs'!H5", "=C8-C5", "None", "Needs the offer designed into the page"),
        ("Charge shipping in full", "15 -> 22", "=C5+7", "=C9-C5",
         "Real, and untested", "Largest single controllable leak"),
        ("Move the order to the bundle", "39 -> 89", "='SKUs'!H11", "=C10-C5",
         "Real — a much bigger ask", "The offer paid ads could afford"),
    ]
    for i, (lever, change, contrib, delta, cost, verdict) in enumerate(rows):
        r = 5 + i
        ws.cell(row=r, column=1, value=lever).font = BODY
        ws.cell(row=r, column=2, value=change).font = MUTED
        ws.cell(row=r, column=3, value=contrib).number_format = SAR
        if delta:
            ws.cell(row=r, column=4, value=delta).number_format = SAR
        ws.cell(row=r, column=5, value=cost).font = MUTED
        v = ws.cell(row=r, column=6, value=verdict)
        v.font = Font(name="Calibri", size=10, bold=True, color=ACCENT)
        v.alignment = WRAP
        for c in range(1, 7):
            ws.cell(row=r, column=c).border = BOX
            ws.cell(row=r, column=c).alignment = (RIGHT if c in (3, 4) else WRAP)
        ws.row_dimensions[r].height = 30

    note(ws, 12,
         "Read rows 7 and 6 against each other. Attaching stickers to 30% of orders adds "
         "contribution with ZERO conversion cost, because the customer has already decided to "
         "buy and the parcel is already being shipped. A price rise adds more per order and "
         "costs conversion on every order. Do the free one first, then test the priced one.",
         span=7)
    note(ws, 14,
         "This is why the range is sequenced stickers-first rather than second-title-first. The "
         "cheapest contribution in the business is the SKU that rides an order you already won.",
         span=7)


# --------------------------------------------------------------------- cohort
def sheet_cohort(wb):
    ws = wb.create_sheet("Cohort")
    title(ws, "100 customers, 12 months",
          "What a cohort is worth once there is more than one thing to buy. Edit the yellow "
          "assumptions; everything else follows.", span=6)

    ws.cell(row=4, column=1, value="ASSUMPTIONS").font = H2
    inputs = [
        ("Cohort size", 100, "customers acquired in month 0"),
        ("Repeat rate within 12 months", 0.25, "the number that decides the business", PCT),
        ("Second purchases per repeater", 1.4, "some buy twice more"),
        ("Sticker attach rate", 0.30, "share of orders adding stickers", PCT),
        ("Blended CAC actually paid", 25.00, "from the paid test"),
    ]
    refs = {}
    for i, item in enumerate(inputs):
        label, val, hint = item[0], item[1], item[2]
        fmt = item[3] if len(item) > 3 else SAR
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        c = ws.cell(row=r, column=3, value=val)
        c.fill, c.border, c.alignment = FILL_IN, BOX, CENTER
        c.number_format = fmt
        c.font = Font(name="Calibri", size=10, bold=True)
        h = ws.cell(row=r, column=4, value=hint)
        h.font = MUTED
        ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=6)
        refs[label] = f"C{r}"
    for col, w in zip("ABCDEF", [26, 16, 14, 20, 16, 20]):
        ws.column_dimensions[col].width = w

    ws.cell(row=11, column=1, value="COHORT VALUE").font = H2
    lines = [
        ("First orders", "=C5"),
        ("First-order contribution (core pad @ 49)", "=B12*'SKUs'!H8"),
        ("Sticker attach on first orders", "=B12*C8*'SKUs'!H5"),
        ("Repeat customers", "=C5*C6"),
        ("Repeat orders", "=B15*C7"),
        ("Repeat-order contribution", "=B16*'SKUs'!H8"),
        ("Sticker attach on repeat orders", "=B16*C8*'SKUs'!H5"),
        ("TOTAL 12-MONTH CONTRIBUTION", "=B13+B14+B17+B18"),
        ("Acquisition cost paid (first orders only)", "=B12*C9"),
        ("NET COHORT VALUE", "=B19-B20"),
        ("Contribution per acquired customer", "=B19/C5"),
        ("Effective CAC headroom per customer", "=B19/C5"),
    ]
    for i, (label, formula) in enumerate(lines):
        r = 12 + i
        lc = ws.cell(row=r, column=1, value=label)
        lc.font = H2 if label.isupper() else BODY
        v = ws.cell(row=r, column=2, value=formula)
        v.number_format = "#,##0" if "orders" in label.lower() or "customers" in label.lower() else SAR
        v.alignment = RIGHT
        v.border = BOX
        if label.isupper():
            v.font, v.fill = BIG, FILL_SUB
        ws.row_dimensions[r].height = 20

    note(ws, 25,
         "The last row is the point. First-order economics say you can afford roughly SAR 14 of "
         "CAC on a core pad. Cohort economics — with a 25% repeat rate and a 30% sticker attach "
         "— say you can afford considerably more, because the second order carries no "
         "acquisition cost at all. That difference is the entire argument for building a range.",
         span=6)
    note(ws, 27,
         "Do not spend against cohort economics until you have MEASURED the repeat rate. "
         "Spending a projected lifetime value you have not yet observed is the most common way a "
         "small physical-product business runs out of cash while its spreadsheet looks healthy.",
         span=6, warn=True)


# --------------------------------------------------------------------- sensitivity
def sheet_sensitivity(wb):
    ws = wb.create_sheet("Repeat Sensitivity")
    title(ws, "CAC headroom as repeat rate varies",
          "The decisive table. Read down the column that matches your observed repeat rate — "
          "not the one you hope for.", span=7)
    header(ws, 4, ["Repeat rate", "Repeat orders per 100", "Total contribution",
                   "Per acquired customer", "Max CAC at 30% retained", "Verdict", ""],
           [14, 20, 18, 20, 22, 42, 4])
    for i, rate in enumerate([0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]):
        r = 5 + i
        ws.cell(row=r, column=1, value=rate).number_format = PCT
        ws.cell(row=r, column=2, value=f"=100*A{r}*Cohort!$C$7")
        ws.cell(row=r, column=3,
                value=f"=(100+B{r})*'SKUs'!$H$8+(100+B{r})*Cohort!$C$8*'SKUs'!$H$5")
        ws.cell(row=r, column=4, value=f"=C{r}/100")
        ws.cell(row=r, column=5, value=f"=D{r}*0.7")
        verdict = ws.cell(row=r, column=6, value=(
            "Single-transaction business. Gift positioning, accept the CAC." if rate < 0.10 else
            "Marginal. Paid acquisition still will not work." if rate < 0.20 else
            "The range is working. Paid becomes arguable." if rate < 0.40 else
            "Masterbrand thesis proved. Build the subscription."))
        verdict.font = Font(name="Calibri", size=9, bold=(rate >= 0.20),
                            color=ACCENT if rate >= 0.20 else GREY)
        verdict.alignment = WRAP
        for c in range(1, 7):
            ws.cell(row=r, column=c).border = BOX
            if c in (3, 4, 5):
                ws.cell(row=r, column=c).number_format = SAR
                ws.cell(row=r, column=c).alignment = RIGHT
            elif c == 2:
                ws.cell(row=r, column=c).number_format = "#,##0"
                ws.cell(row=r, column=c).alignment = RIGHT
            elif c == 1:
                ws.cell(row=r, column=c).alignment = CENTER
        ws.cell(row=r, column=5).font = BIG
        ws.row_dimensions[r].height = 26

    note(ws, 15,
         "Compare column E against the cost per acquisition you actually observe. At 0% repeat "
         "the business must be acquired one customer at a time forever, which the flagship "
         "economics say is not affordable. Every row down this table is the range doing its job.",
         span=7)
    note(ws, 17,
         "GATE FOR WAVE TWO: at least 20% of the flagship's buyers purchase the second title "
         "within 8 weeks, without a discount. Below that, stop extending the range and either "
         "fix the flagship or accept that this is a gifting business and price it accordingly.",
         span=7, warn=True)


# --------------------------------------------------------------------- sequencing
def sheet_sequencing(wb):
    ws = wb.create_sheet("Sequencing")
    title(ws, "Waves and gates", "Nothing in a later wave is funded until the gate above it "
                                 "passes.", span=6)
    header(ws, 4, ["When", "What", "Why now", "Gate before the next wave", "Blocked on", ""],
           [14, 30, 44, 40, 30, 4])
    rows = [
        ("Nov 2026", "Flagship launch", "The proposition", "20-order dry run passed; first reviews real", "—"),
        ("Jan 2027", "Sticker sheets", "Cheapest repeat test; artwork already paid for", "Any repeat purchase at all", "Confirm stickers are not toy-classified"),
        ("Feb 2027", "Postcards", "Entry price, gifting, a child mails the marketing", "", "—"),
        ("Feb 2027", "Founding Day capsule", "Captures the spike without becoming an occasion brand", "", "Dated, limited, never restocked"),
        ("Apr 2027", "Title 2 — Nature and Animals", "Lowest cultural risk, strongest proven artwork", "≥20% of flagship buyers buy within 8 weeks, no discount", "Illustration commission"),
        ("Jul 2027", "Activity kit", "The only SKU whose contribution carries a real CAC", "", "SASO/SABER for pencils — settle BEFORE scheduling"),
        ("Sep 2027", "Ages 3-5 edition", "Unlocks the younger sibling", "", "—"),
        ("Q4 2027", "Title 3 + second capsule", "Cadence of two titles a year", "", "—"),
        ("2028", "Ages 9-12, titles 4-5, educator pilot", "Extends lifetime rather than finding new customers", "Repeat rate >40% sustained", "Procurement cycles are slow"),
        ("2029", "Subscription", "Solves acquisition permanently", "", "Only above ~40% repeat, or it is a churn machine"),
    ]
    for i, row in enumerate(rows):
        r = 5 + i
        for c, val in enumerate(row, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.border = BOX
            cell.alignment = WRAP
            cell.font = H2 if c == 2 else (MUTED if c in (3, 5) else BODY)
            if c == 4 and val:
                cell.font = Font(name="Calibri", size=9, bold=True, color=ACCENT)
        ws.row_dimensions[r].height = 34
    note(ws, 16,
         "The Apr 2027 gate is the real one. Everything before it reuses artwork you have "
         "already paid for; everything after it commits new illustration money. If the existing "
         "customer list will not buy a second title at full price, the range thesis is wrong and "
         "no amount of further range will fix it.", span=6, warn=True)


def main():
    wb = Workbook()
    sheet_skus(wb)
    sheet_attach(wb)
    sheet_cohort(wb)
    sheet_sensitivity(wb)
    sheet_sequencing(wb)
    out = pathlib.Path(__file__).resolve().parent / "range-model.xlsx"
    wb.save(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
