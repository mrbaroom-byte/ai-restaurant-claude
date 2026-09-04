#!/usr/bin/env python3
"""Generate unit-economics.xlsx - the live contribution model for the pilot.

Every seeded number is a PLACEHOLDER to be replaced with a real quote. The model is built
out of linked formulas, not typed results, so replacing an assumption updates every
downstream number including the Gate 5 verdict.

Tabs:
  Assumptions   every input in one place (yellow = you edit)
  COGS          per-unit cost build-up, by print quantity
  Unit Economics contribution at each price point, VAT-inclusive
  Break-even    max allowable CAC and the required conversion rate (feeds Gate 4)
  Pilot P&L     three demand scenarios against the SAR 22,000 budget
  Budget Tracker plan vs actual on the seven budget lines

Run:  python3 business/03-economics/build_model.py
"""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

INK = "1F3A2E"
ACCENT = "C8763C"
RED = "9B2C2C"
LIGHT = "F2EDE4"
GREY = "6B7280"

H1 = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
H2 = Font(name="Calibri", size=11, bold=True, color=INK)
BODY = Font(name="Calibri", size=10)
MUTED = Font(name="Calibri", size=9, italic=True, color=GREY)
NUM = Font(name="Calibri", size=10)
BIG = Font(name="Calibri", size=12, bold=True, color=ACCENT)

FILL_HEAD = PatternFill("solid", fgColor=INK)
FILL_SUB = PatternFill("solid", fgColor=LIGHT)
FILL_INPUT = PatternFill("solid", fgColor="FFF8E1")

THIN = Side(style="thin", color="D4CFC4")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")

SAR = '#,##0.00'
PCT = '0.0%'


def title(ws, text, sub, span=8):
    c = ws.cell(row=1, column=1, value=text)
    c.font = Font(name="Calibri", size=16, bold=True, color=INK)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    s = ws.cell(row=2, column=1, value=sub)
    s.font = MUTED
    s.alignment = WRAP
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
    ws.row_dimensions[1].height = 22
    ws.row_dimensions[2].height = 32


def header(ws, row, headers, widths=None):
    for i, t in enumerate(headers, start=1):
        c = ws.cell(row=row, column=i, value=t)
        c.font = H1
        c.fill = FILL_HEAD
        c.alignment = CENTER
        c.border = BOX
    ws.row_dimensions[row].height = 30
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w


def note(ws, row, text, span=8, warn=False):
    c = ws.cell(row=row, column=1, value=text)
    c.font = Font(name="Calibri", size=9, italic=True,
                  color=RED if warn else GREY, bold=warn)
    c.alignment = WRAP
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    ws.row_dimensions[row].height = 30


def inp(ws, row, label, value, unit, hint, fmt=SAR, label_span=3):
    ws.cell(row=row, column=1, value=label).font = BODY
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=label_span)
    c = ws.cell(row=row, column=label_span + 1, value=value)
    c.fill = FILL_INPUT
    c.border = BOX
    c.alignment = CENTER
    c.font = Font(name="Calibri", size=10, bold=True)
    c.number_format = fmt
    u = ws.cell(row=row, column=label_span + 2, value=unit)
    u.font = MUTED
    h = ws.cell(row=row, column=label_span + 3, value=hint)
    h.font = MUTED
    h.alignment = WRAP
    ws.merge_cells(start_row=row, start_column=label_span + 3,
                   end_row=row, end_column=label_span + 6)
    ws.row_dimensions[row].height = 26
    return f"{get_column_letter(label_span + 1)}{row}"


# ---------------------------------------------------------------- Assumptions
def sheet_assumptions(wb):
    ws = wb.active
    ws.title = "Assumptions"
    title(ws, "Assumptions — every input lives here",
          "Yellow cells are yours to edit. Every seeded number is a PLACEHOLDER, not a quote. "
          "Replace them as real numbers arrive and the whole model follows.", span=9)
    for col, w in zip("ABCDEFGHI", [30, 14, 10, 12, 10, 20, 16, 16, 16]):
        ws.column_dimensions[col].width = w

    r = 4
    ws.cell(row=r, column=1, value="PRICING (VAT-inclusive, as displayed)").font = H2
    ws.cell(row=r, column=1).fill = FILL_SUB
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    refs = {}
    r += 1
    refs['vat'] = inp(ws, r, "VAT rate", 0.15, "", "Saudi standard rate. Consumer prices must be displayed VAT-inclusive.", PCT); r += 1
    refs['p39'] = inp(ws, r, "Core pad — price cell 1", 39, "SAR", "Also the founder preorder price"); r += 1
    refs['p49'] = inp(ws, r, "Core pad — price cell 2", 49, "SAR", "The premium test price"); r += 1
    refs['p79'] = inp(ws, r, "Gift bundle — price cell 1", 79, "SAR", ""); r += 1
    refs['p89'] = inp(ws, r, "Gift bundle — price cell 2", 89, "SAR", ""); r += 1

    r += 1
    ws.cell(row=r, column=1, value="PRODUCT COST — replace with printer quotes").font = H2
    ws.cell(row=r, column=1).fill = FILL_SUB
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    r += 1
    refs['print300'] = inp(ws, r, "Print cost/unit @ 300", 18.00, "SAR", "PLACEHOLDER — quote required"); r += 1
    refs['print500'] = inp(ws, r, "Print cost/unit @ 500", 14.00, "SAR", "PLACEHOLDER — quote required"); r += 1
    refs['print750'] = inp(ws, r, "Print cost/unit @ 750", 12.00, "SAR", "PLACEHOLDER — quote required"); r += 1
    refs['print1000'] = inp(ws, r, "Print cost/unit @ 1,000", 11.00, "SAR", "PLACEHOLDER — quote required"); r += 1
    refs['print1500'] = inp(ws, r, "Print cost/unit @ 1,500", 9.50, "SAR", "PLACEHOLDER — quote required"); r += 1
    refs['pack'] = inp(ws, r, "Packaging: polybag, insert card, mailer", 3.50, "SAR", "Giftability sits here — do not cut it first"); r += 1
    refs['handling'] = inp(ws, r, "Inbound handling and storage/unit", 1.00, "SAR", ""); r += 1
    refs['pickpack'] = inp(ws, r, "Pick and pack labour/unit", 2.00, "SAR", "Your time is a cost even if you do not invoice it"); r += 1
    refs['bundleadd'] = inp(ws, r, "Gift bundle add-on cost (pencils, stickers)", 9.50, "SAR", "Adds SASO/SABER obligations — see compliance checklist"); r += 1

    r += 1
    ws.cell(row=r, column=1, value="FULFILMENT AND FEES").font = H2
    ws.cell(row=r, column=1).fill = FILL_SUB
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    r += 1
    refs['shipcost'] = inp(ws, r, "Actual domestic shipping cost/order", 22.00, "SAR", "PLACEHOLDER — get courier quotes"); r += 1
    refs['shipcharge'] = inp(ws, r, "Shipping charged to customer", 15.00, "SAR", "Set to 0 to model free shipping; the subsidy is the difference"); r += 1
    refs['payrate'] = inp(ws, r, "Payment gateway %", 0.025, "", "mada/card. Confirm with your provider", PCT); r += 1
    refs['payfix'] = inp(ws, r, "Payment gateway fixed fee/order", 1.00, "SAR", ""); r += 1
    refs['returns'] = inp(ws, r, "Return / refund rate", 0.04, "", "Assume the product comes back unsaleable", PCT); r += 1
    refs['platform'] = inp(ws, r, "Store platform monthly fee", 250.00, "SAR", "Fixed cost — sits in Pilot P&L, not in unit contribution"); r += 1

    r += 1
    ws.cell(row=r, column=1, value="MARKETING AND TARGETS").font = H2
    ws.cell(row=r, column=1).fill = FILL_SUB
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    r += 1
    refs['cpc'] = inp(ws, r, "Cost per qualified click", 1.60, "SAR", "MEASURE THIS in the first 48 hours; do not assume it"); r += 1
    refs['retain'] = inp(ws, r, "Contribution retained after CAC", 0.30, "", "0% = break-even on acquisition. 30% keeps a margin for the pilot.", PCT); r += 1

    note(ws, r + 1,
         "The two numbers most likely to be wrong are the print quote and the shipping cost, and "
         "they are the two with the largest effect on whether this works. Get three quotes for "
         "each before you trust any output of this model.", span=9, warn=True)
    return refs


# ---------------------------------------------------------------- COGS
def sheet_cogs(wb, a):
    ws = wb.create_sheet("COGS")
    title(ws, "Cost of goods per unit, by print quantity",
          "Landed cost of one pad in a box, before shipping and payment fees. "
          "The print-run decision reads off this table.", span=7)
    header(ws, 4, ["Print quantity", "Print/unit", "Packaging", "Handling",
                   "Pick & pack", "COGS/unit", "Total product cost"],
           [16, 14, 14, 14, 14, 16, 20])

    qtys = [(300, 'print300'), (500, 'print500'), (750, 'print750'),
            (1000, 'print1000'), (1500, 'print1500')]
    for i, (q, key) in enumerate(qtys):
        r = 5 + i
        ws.cell(row=r, column=1, value=q).alignment = CENTER
        ws.cell(row=r, column=2, value=f"=Assumptions!{a[key]}")
        ws.cell(row=r, column=3, value=f"=Assumptions!{a['pack']}")
        ws.cell(row=r, column=4, value=f"=Assumptions!{a['handling']}")
        ws.cell(row=r, column=5, value=f"=Assumptions!{a['pickpack']}")
        ws.cell(row=r, column=6, value=f"=SUM(B{r}:E{r})")
        ws.cell(row=r, column=7, value=f"=B{r}*A{r}")
        for c in range(1, 8):
            cell = ws.cell(row=r, column=c)
            cell.border = BOX
            cell.font = NUM
            if c > 1:
                cell.number_format = SAR
                cell.alignment = RIGHT
        ws.cell(row=r, column=6).font = Font(name="Calibri", size=10, bold=True, color=ACCENT)
        ws.cell(row=r, column=6).fill = FILL_SUB

    ws.cell(row=11, column=1, value="Gift bundle COGS (at 1,000 units)").font = H2
    ws.merge_cells(start_row=11, start_column=1, end_row=11, end_column=5)
    c = ws.cell(row=11, column=6, value=f"=F8+Assumptions!{a['bundleadd']}")
    c.number_format = SAR
    c.font = BIG
    c.fill = FILL_SUB
    c.border = BOX
    c.alignment = RIGHT

    note(ws, 13,
         "The unit price at 1,500 will always look better than at 500. That is the printer's "
         "cost curve, not your demand. Print to preorder evidence — unsold inventory is the most "
         "expensive way to buy a lower unit cost.", span=7)
    note(ws, 15,
         "Pick-and-pack labour is included deliberately. Founders routinely price at zero because "
         "they pack the boxes themselves, then discover the model never worked once anyone else "
         "had to be paid to do it.", span=7)


# ---------------------------------------------------------------- Unit econ
def sheet_unit(wb, a):
    ws = wb.create_sheet("Unit Economics")
    title(ws, "Contribution per order",
          "VAT-inclusive prices, net revenue backed out at the standard rate. "
          "Contribution is what is left to pay for acquisition and everything fixed.", span=9)
    header(ws, 4, ["Offer", "Price (inc VAT)", "VAT", "Net revenue", "COGS",
                   "Shipping subsidy", "Payment fees", "Returns reserve", "CONTRIBUTION"],
           [18, 15, 11, 14, 12, 16, 14, 15, 17])

    # rows: (label, price ref, cogs formula source)
    rows = [
        ("Core pad @ 39", a['p39'], "COGS!F8"),
        ("Core pad @ 49", a['p49'], "COGS!F8"),
        ("Gift bundle @ 79", a['p79'], "COGS!F11"),
        ("Gift bundle @ 89", a['p89'], "COGS!F11"),
    ]
    for i, (label, pref, cogs) in enumerate(rows):
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.cell(row=r, column=2, value=f"=Assumptions!{pref}")
        ws.cell(row=r, column=3, value=f"=B{r}-B{r}/(1+Assumptions!{a['vat']})")
        ws.cell(row=r, column=4, value=f"=B{r}/(1+Assumptions!{a['vat']})")
        ws.cell(row=r, column=5, value=f"={cogs}")
        ws.cell(row=r, column=6,
                value=f"=MAX(0,Assumptions!{a['shipcost']}-Assumptions!{a['shipcharge']})")
        ws.cell(row=r, column=7,
                value=f"=B{r}*Assumptions!{a['payrate']}+Assumptions!{a['payfix']}")
        ws.cell(row=r, column=8,
                value=f"=Assumptions!{a['returns']}*(E{r}+Assumptions!{a['shipcost']})")
        ws.cell(row=r, column=9, value=f"=D{r}-E{r}-F{r}-G{r}-H{r}")
        for c in range(1, 10):
            cell = ws.cell(row=r, column=c)
            cell.border = BOX
            cell.font = NUM
            if c > 1:
                cell.number_format = SAR
                cell.alignment = RIGHT
        ws.cell(row=r, column=9).font = BIG
        ws.cell(row=r, column=9).fill = FILL_SUB
        ws.row_dimensions[r].height = 22

    r = 10
    ws.cell(row=r, column=1, value="Contribution margin on net revenue").font = H2
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    for i in range(4):
        c = ws.cell(row=r, column=4 + i, value=f"=IFERROR(I{5+i}/D{5+i},\"\")")
        c.number_format = PCT
        c.alignment = CENTER
        c.border = BOX
        c.font = Font(name="Calibri", size=10, bold=True)
    for i, lbl in enumerate(["pad@39", "pad@49", "bundle@79", "bundle@89"]):
        c = ws.cell(row=r + 1, column=4 + i, value=lbl)
        c.font = MUTED
        c.alignment = CENTER

    note(ws, 13,
         "READ THIS BEFORE ANYTHING ELSE: at SAR 39 with a subsidised shipping charge, "
         "contribution is thin enough that almost nothing is left to pay for acquiring the "
         "customer. That is not a modelling artefact — it is the central economic problem of a "
         "single low-priced physical product shipped one at a time.", span=9, warn=True)
    note(ws, 15,
         "Three levers, in order of how much they move the number: (1) charge shipping in full "
         "rather than subsidising it, (2) launch at 49 rather than 39, (3) move volume into the "
         "bundle. The paid test tells you what each one costs in conversion. Change the "
         "Assumptions tab and watch this table — that comparison IS the pricing decision.", span=9)
    note(ws, 17,
         "The founder preorder at SAR 39 is a deliberate loss-leader against a thin contribution: "
         "you are buying first reviews and operational proof, not margin. Budget it as marketing "
         "spend, cap the quantity, and do not let it become the launch price by default.", span=9)


# ---------------------------------------------------------------- Break-even
def sheet_breakeven(wb, a):
    ws = wb.create_sheet("Break-even")
    title(ws, "Maximum allowable CAC, and the conversion rate it demands",
          "This tab produces the Gate 4 threshold. Copy the required conversion rate into the "
          "sprint workbook's Paid Test tab BEFORE the paid test finishes.", span=8)
    header(ws, 4, ["Offer", "Contribution", "Max CAC at break-even",
                   "Max CAC at target retention", "Cost per click",
                   "Required conversion rate", "Clicks per order", "Ad spend per order"],
           [18, 15, 20, 22, 14, 20, 15, 17])

    for i, label in enumerate(["Core pad @ 39", "Core pad @ 49",
                               "Gift bundle @ 79", "Gift bundle @ 89"]):
        r = 5 + i
        src = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.cell(row=r, column=2, value=f"='Unit Economics'!I{src}")
        ws.cell(row=r, column=3, value=f"=B{r}")
        ws.cell(row=r, column=4, value=f"=B{r}*(1-Assumptions!{a['retain']})")
        ws.cell(row=r, column=5, value=f"=Assumptions!{a['cpc']}")
        ws.cell(row=r, column=6, value=f"=IFERROR(E{r}/D{r},\"n/a\")")
        ws.cell(row=r, column=7, value=f"=IFERROR(D{r}/E{r},\"n/a\")")
        ws.cell(row=r, column=8, value=f"=D{r}")
        for c in range(1, 9):
            cell = ws.cell(row=r, column=c)
            cell.border = BOX
            cell.font = NUM
            cell.alignment = RIGHT if c > 1 else Alignment(vertical="center")
            if c in (2, 3, 4, 5, 8):
                cell.number_format = SAR
            if c == 6:
                cell.number_format = '0.00%'
            if c == 7:
                cell.number_format = '#,##0'
        ws.cell(row=r, column=6).font = BIG
        ws.cell(row=r, column=6).fill = FILL_SUB
        ws.row_dimensions[r].height = 22

    note(ws, 10,
         "HOW TO READ COLUMN F: it is the landing-page conversion rate you must achieve for the "
         "offer to pay for its own advertising. If it reads 8%, you need 8 preorders per 100 "
         "qualified clicks — and typical cold-traffic conversion on a new brand's product page "
         "is low single digits. A required rate far above that is the model telling you the "
         "offer cannot carry paid acquisition at that price.", span=8, warn=True)
    note(ws, 12,
         "If the required rate is out of reach at every price point, paid acquisition is not your "
         "channel at launch, and the answer is not a bigger budget. It is organic and creator-led "
         "distribution, a higher basket, or a different product. Better to know that in September "
         "for the cost of a test than in December for the cost of a print run.", span=8)

    r = 14
    ws.cell(row=r, column=1, value="GATE 5 — ECONOMICS").font = H2
    ws.cell(row=r, column=1).fill = FILL_SUB
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    ws.cell(row=r + 1, column=1,
            value="Threshold: positive contribution after product, packaging, payment, shipping "
                  "subsidy, returns AND test CAC.").font = BODY
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=8)

    ws.cell(row=r + 2, column=1, value="Actual CAC observed in the paid test (enter):").font = BODY
    ws.merge_cells(start_row=r + 2, start_column=1, end_row=r + 2, end_column=3)
    cac = ws.cell(row=r + 2, column=4, value=25.00)
    cac.fill = FILL_INPUT
    cac.border = BOX
    cac.number_format = SAR
    cac.alignment = CENTER
    cac.font = Font(name="Calibri", size=11, bold=True)

    ws.cell(row=r + 3, column=1, value="Contribution after CAC, by offer:").font = H2
    ws.merge_cells(start_row=r + 3, start_column=1, end_row=r + 3, end_column=3)
    for i in range(4):
        c = ws.cell(row=r + 4, column=1 + i * 2, value=["pad@39", "pad@49", "bundle@79", "bundle@89"][i])
        c.font = MUTED
        c.alignment = CENTER
        v = ws.cell(row=r + 5, column=1 + i * 2, value=f"=B{5+i}-$D${r+2}")
        v.number_format = SAR
        v.font = BIG
        v.fill = FILL_SUB
        v.border = BOX
        v.alignment = CENTER

    verdict = ws.cell(row=r + 7, column=1,
                      value=f'=IF(MAX(B5:B8)-D{r+2}>0,'
                            f'"GATE 5: PASSES on at least one offer — launch at the offer with the '
                            f'highest contribution per visitor",'
                            f'"GATE 5: FAILS at every price point — DO NOT PRINT")')
    verdict.font = Font(name="Calibri", size=12, bold=True, color=RED)
    verdict.alignment = WRAP
    verdict.fill = FILL_SUB
    verdict.border = BOX
    ws.merge_cells(start_row=r + 7, start_column=1, end_row=r + 7, end_column=8)
    ws.row_dimensions[r + 7].height = 34

    note(ws, r + 9,
         "THE STOP RULE: if contribution after CAC is negative at both 39 and 49 including the "
         "bundle, stop. This is the one gate no copy, photography or message can fix, because it "
         "is arithmetic — volume multiplies a negative number. Stopping here leaves the SAR 6,500 "
         "print line unspent and you keep the language bank, the prototype, the cultural review "
         "and a working store.", span=8, warn=True)


# ---------------------------------------------------------------- Pilot P&L
def sheet_pnl(wb, a):
    ws = wb.create_sheet("Pilot P&L")
    title(ws, "Pilot P&L — three demand scenarios",
          "Against a 500-unit print run at the SAR 49 core price. Change the unit numbers to "
          "match your actual preorder evidence before the print decision.", span=6)
    header(ws, 4, ["Line", "Pessimistic", "Base", "Optimistic", "Note"],
           [34, 15, 15, 15, 46])

    units = [(120, 250, 420)]
    bundle_share = 0.20

    rows = [
        ("Units sold (of a 500 print run)", 120, 250, 420, "The pessimistic case is the one to plan cash against"),
        ("— of which gift bundle", None, None, None, f"Assumed {int(bundle_share*100)}% bundle mix"),
        ("Net revenue", None, None, None, "VAT excluded"),
        ("Contribution before fixed costs", None, None, None, "From the Unit Economics tab"),
        ("Ad spend", 2500, 2500, 2500, "The budgeted paid test and launch line"),
        ("Platform fees (3 months)", None, None, None, "Store subscription"),
        ("Print run cost (500 units)", None, None, None, "Paid up front, whether or not it sells"),
        ("Validation + cultural review + prototype", 8500, 8500, 8500, "Spent before any revenue"),
        ("Store, content, contingency", 4500, 4500, 4500, ""),
        ("PILOT RESULT", None, None, None, "Cash position at the end of the pilot"),
        ("Unsold inventory (units)", None, None, None, "Not a loss yet — but it is cash you cannot spend"),
    ]

    for i, (label, p, b, o, hint) in enumerate(rows):
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = H2 if label.isupper() else BODY
        h = ws.cell(row=r, column=5, value=hint)
        h.font = MUTED
        h.alignment = WRAP
        for c in range(1, 6):
            ws.cell(row=r, column=c).border = BOX
        ws.row_dimensions[r].height = 22

    # formulas by column B/C/D
    for col, base_units in zip("BCD", [120, 250, 420]):
        ws[f"{col}5"] = base_units
        ws[f"{col}6"] = f"=ROUND({col}5*{bundle_share},0)"
        ws[f"{col}7"] = (f"=({col}5-{col}6)*'Unit Economics'!D6"
                         f"+{col}6*'Unit Economics'!D7")
        ws[f"{col}8"] = (f"=({col}5-{col}6)*'Unit Economics'!I6"
                         f"+{col}6*'Unit Economics'!I7")
        ws[f"{col}9"] = 2500
        ws[f"{col}10"] = f"=Assumptions!{a['platform']}*3"
        ws[f"{col}11"] = "=COGS!G6"
        ws[f"{col}12"] = 8500
        ws[f"{col}13"] = 4500
        ws[f"{col}14"] = f"={col}8-{col}9-{col}10-{col}11-{col}12-{col}13"
        ws[f"{col}15"] = f"=500-{col}5"
        for r in range(5, 16):
            cell = ws[f"{col}{r}"]
            cell.number_format = SAR if r not in (5, 6, 15) else '#,##0'
            cell.alignment = RIGHT
            cell.font = NUM
        ws[f"{col}14"].font = BIG
        ws[f"{col}14"].fill = FILL_SUB

    note(ws, 17,
         "The print run cost sits BELOW the contribution line on purpose: it is spent before the "
         "first sale and it does not come back. That is why the pilot result can be negative even "
         "when every unit sold made money — and why the print quantity is the most consequential "
         "number on this page.", span=6)
    note(ws, 19,
         "'Unsold inventory' is not a loss on the day the pilot ends — the pads keep. But it is "
         "cash you cannot spend on the next decision, and the brief's guidance is explicit: "
         "smaller first run, replenish only on evidence.", span=6)
    note(ws, 21,
         "Fixed costs here total roughly SAR 15,500 before a single pad ships. Against a pilot "
         "ceiling of SAR 25,000 that is the real constraint on print quantity — not the printer's "
         "minimum order.", span=6)


# ---------------------------------------------------------------- Budget
def sheet_budget(wb):
    ws = wb.create_sheet("Budget Tracker")
    title(ws, "SAR 22,000 pilot budget — plan vs actual",
          "The working allocation from the decision brief. Update Actual as you spend; "
          "variance and remaining budget compute themselves.", span=6)
    header(ws, 4, ["Use of funds", "Planned SAR", "Actual SAR", "Variance",
                   "% of budget", "Purpose"], [34, 14, 14, 14, 12, 44])

    lines = [
        ("Parent/child validation", 2500, "Recruiting, incentives, survey and prototype sessions"),
        ("Arabic/cultural/editorial review", 2500, "Accuracy, tone, bilingual copy and claims review"),
        ("Prototype refinement & samples", 3500, "Print tests, paper/binding trials, child-use iteration"),
        ("Initial local production", 6500, "Pilot print run; quantity set AFTER the gate review"),
        ("Store & launch content", 3000, "Product page, photography/video, customer-support setup"),
        ("Paid message/price tests", 2500, "Targeted traffic before and during preorder"),
        ("Contingency & operating fees", 1500, "Shipping tests, corrections, packaging, platform variance"),
    ]
    for i, (label, planned, purpose) in enumerate(lines):
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.cell(row=r, column=2, value=planned).number_format = SAR
        c = ws.cell(row=r, column=3)
        c.fill = FILL_INPUT
        c.number_format = SAR
        ws.cell(row=r, column=4, value=f"=IF(C{r}=\"\",\"\",C{r}-B{r})").number_format = SAR
        ws.cell(row=r, column=5, value=f"=B{r}/$B$12").number_format = PCT
        p = ws.cell(row=r, column=6, value=purpose)
        p.font = MUTED
        p.alignment = WRAP
        for cc in range(1, 7):
            ws.cell(row=r, column=cc).border = BOX
            if cc in (2, 3, 4):
                ws.cell(row=r, column=cc).alignment = RIGHT
        ws.row_dimensions[r].height = 24

    r = 12
    ws.cell(row=r, column=1, value="TOTAL").font = H2
    ws.cell(row=r, column=2, value="=SUM(B5:B11)").number_format = SAR
    ws.cell(row=r, column=3, value="=SUM(C5:C11)").number_format = SAR
    ws.cell(row=r, column=4, value="=IF(C12=0,\"\",C12-B12)").number_format = SAR
    for cc in range(1, 7):
        ws.cell(row=r, column=cc).border = BOX
        ws.cell(row=r, column=cc).fill = FILL_SUB
        ws.cell(row=r, column=cc).font = Font(name="Calibri", size=11, bold=True, color=ACCENT)
        if cc in (2, 3, 4):
            ws.cell(row=r, column=cc).alignment = RIGHT

    ws.cell(row=14, column=1, value="Pilot ceiling").font = BODY
    ws.cell(row=14, column=2, value=25000).number_format = SAR
    ws.cell(row=15, column=1, value="Headroom against ceiling").font = BODY
    ws.cell(row=15, column=2, value="=B14-B12").number_format = SAR
    ws.cell(row=16, column=1, value="Spent before the gate review (lines 1-3 + tests)").font = BODY
    ws.cell(row=16, column=2, value="=B5+B6+B7+B10").number_format = SAR
    ws.cell(row=17, column=1, value="At risk only if you print (lines 4-5 + contingency)").font = BODY
    ws.cell(row=17, column=2, value="=B8+B9+B11").number_format = SAR
    for r in (14, 15, 16, 17):
        ws.cell(row=r, column=2).alignment = RIGHT
        ws.cell(row=r, column=2).border = BOX
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=1)

    note(ws, 19,
         "Rows 16 and 17 are the shape of the whole plan: roughly SAR 11,000 buys you the "
         "evidence, and the remaining SAR 11,000 is only committed once the evidence says go. "
         "Keeping that split intact is what makes stopping at the gate review survivable rather "
         "than catastrophic.", span=6)
    note(ws, 21,
         "This is a working budget, not supplier quotations. Do not place the full production "
         "order until prototype, cultural review and preorder evidence meet the decision gates.",
         span=6)


def main():
    wb = Workbook()
    a = sheet_assumptions(wb)
    sheet_cogs(wb, a)
    sheet_unit(wb, a)
    sheet_breakeven(wb, a)
    sheet_pnl(wb, a)
    sheet_budget(wb)
    out = Path(__file__).resolve().parent / "unit-economics.xlsx"
    wb.save(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
