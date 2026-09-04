#!/usr/bin/env python3
"""Generate sprint-workbook.xlsx — the data-capture and scoring workbook for the
September validation sprint.

Tabs:
  Instructions   how to use the workbook, and the order to fill it in
  Language Bank  one row per parent interview (step 1)
  Play-tests     one row per child session (step 2), with live gate arithmetic
  Survey Raw     paste-target for the exported survey data (step 3)
  BestWorst      best-worst scoring for the forced trade-offs
  Paid Test      landing cell results and the derived Gate 4 number (steps 4-5)
  Gate Review    the six gates, scored, for the 30 September decision

Run:  python3 business/01-validation/analysis/build_workbook.py
"""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

INK = "1F3A2E"
ACCENT = "C8763C"
LIGHT = "F2EDE4"
GREY = "6B7280"

H1 = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
H2 = Font(name="Calibri", size=11, bold=True, color=INK)
BODY = Font(name="Calibri", size=10)
MUTED = Font(name="Calibri", size=9, italic=True, color=GREY)

FILL_HEAD = PatternFill("solid", fgColor=INK)
FILL_SUB = PatternFill("solid", fgColor=LIGHT)
FILL_INPUT = PatternFill("solid", fgColor="FFFDF5")

THIN = Side(style="thin", color="D4CFC4")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


def header(ws, row, headers, widths=None):
    """Write a styled header row and set column widths."""
    for i, text in enumerate(headers, start=1):
        c = ws.cell(row=row, column=i, value=text)
        c.font = H1
        c.fill = FILL_HEAD
        c.alignment = CENTER
        c.border = BOX
    ws.row_dimensions[row].height = 34
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def note(ws, row, text, span=6):
    c = ws.cell(row=row, column=1, value=text)
    c.font = MUTED
    c.alignment = WRAP
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    ws.row_dimensions[row].height = 28


def title(ws, text, subtitle, span=8):
    c = ws.cell(row=1, column=1, value=text)
    c.font = Font(name="Calibri", size=16, bold=True, color=INK)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    s = ws.cell(row=2, column=1, value=subtitle)
    s.font = MUTED
    s.alignment = WRAP
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
    ws.row_dimensions[1].height = 24
    ws.row_dimensions[2].height = 30


def input_rows(ws, first, last, ncols):
    for r in range(first, last + 1):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            cell.fill = FILL_INPUT
            cell.border = BOX
            cell.alignment = WRAP
            cell.font = BODY
        ws.row_dimensions[r].height = 30


# --------------------------------------------------------------------------
def sheet_instructions(wb):
    ws = wb.active
    ws.title = "Instructions"
    title(ws, "Validation sprint workbook",
          "Sept 7-30, 2026. Fill the tabs in order. Yellow cells are for you; "
          "white cells calculate themselves. Nothing here is a forecast - every number "
          "is something you observed.")
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 86

    rows = [
        ("1", "Language Bank",
         "One row per parent interview, filled within an hour of the session. The four counted "
         "outputs at the bottom are what the gate review argues about: unprompted screen "
         "mentions, correct unaided product identification, median unanchored price guess, and "
         "objections repeated 3+ times."),
        ("2", "Play-tests",
         "One row per child session. Gate 2 calculates live at the bottom. Watch the "
         "bleed-through column - a single Yes means re-spec the paper before proofing."),
        ("3", "Survey Raw",
         "Paste the survey export here, one respondent per row, keeping the column order from "
         "04-survey-instrument.md. Do not clean it in place; keep the raw export intact."),
        ("4", "BestWorst",
         "Enter the most/least counts per attribute from Section B. Scores compute "
         "automatically on a -1 to +1 scale. Check the ranking against the constant-sum result "
         "before trusting it."),
        ("5", "Paid Test",
         "Landing cell results. Enter your CPC and the max allowable CAC from the economics "
         "model, and the required conversion rate - the Gate 4 threshold - is derived for you. "
         "Set that number BEFORE the test finishes."),
        ("6", "Gate Review",
         "The 30 September decision. Enter each gate's observed value; pass/fail is computed. "
         "Fill it in before the meeting discusses what to do about the results."),
    ]
    r = 4
    for num, name, desc in rows:
        ws.cell(row=r, column=2, value=f"{num}. {name}").font = H2
        c = ws.cell(row=r, column=3, value=desc)
        c.font = BODY
        c.alignment = WRAP
        ws.cell(row=r, column=2).fill = FILL_SUB
        ws.row_dimensions[r].height = 46
        r += 1

    r += 1
    ws.cell(row=r, column=2, value="Standing rule").font = H2
    c = ws.cell(row=r, column=3,
                value="A failed gate changes the plan. It does not get solved with more ad "
                      "spend. Agree the thresholds in writing before the data arrives - a "
                      "threshold negotiated after you have seen the result is not a threshold.")
    c.font = Font(name="Calibri", size=10, bold=True, color=ACCENT)
    c.alignment = WRAP
    ws.row_dimensions[r].height = 46


def sheet_language_bank(wb):
    ws = wb.create_sheet("Language Bank")
    title(ws, "Parent depth interviews - language bank",
          "12 parents. Fill each row within an hour of the session, in the parent's own words. "
          "Your summary of what they meant is worth far less than the sentence they actually said.",
          span=12)
    cols = ["#", "Date", "City", "Child age", "Parent role", "Home language",
            "VERBATIM: what they said it was (Q13)", "VERBATIM: useful-vs-filler line (Q10/11)",
            "Unanchored price guess SAR (Q14)", "Screens raised unprompted? (Y/N)",
            "Top objection", "Proof demanded (Q18)", "Deal-breaker (Q19)",
            "Best single sentence", "Your confidence 1-5"]
    widths = [4, 10, 10, 8, 10, 12, 34, 34, 12, 12, 26, 26, 24, 34, 10]
    header(ws, 4, cols, widths)
    input_rows(ws, 5, 16, len(cols))
    for i in range(12):
        ws.cell(row=5 + i, column=1, value=i + 1).alignment = CENTER

    yn = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
    ws.add_data_validation(yn)
    yn.add(f"J5:J16")
    conf = DataValidation(type="list", formula1='"1,2,3,4,5"', allow_blank=True)
    ws.add_data_validation(conf)
    conf.add("O5:O16")

    r = 18
    ws.cell(row=r, column=1, value="COUNTED OUTPUTS").font = H2
    outputs = [
        ("Parents who raised screens unprompted (of 12)", '=COUNTIF(J5:J16,"Y")'),
        ("Median unanchored price guess (SAR)", "=IFERROR(MEDIAN(I5:I16),\"\")"),
        ("Range of price guesses", '=IFERROR(MIN(I5:I16)&" - "&MAX(I5:I16),"")'),
        ("Mean founder confidence (1-5)", "=IFERROR(ROUND(AVERAGE(O5:O16),2),\"\")"),
        ("Interviews completed", "=COUNTA(B5:B16)"),
    ]
    for i, (label, formula) in enumerate(outputs):
        rr = r + 1 + i
        lc = ws.cell(row=rr, column=1, value=label)
        lc.font = BODY
        ws.merge_cells(start_row=rr, start_column=1, end_row=rr, end_column=8)
        vc = ws.cell(row=rr, column=9, value=formula)
        vc.font = Font(name="Calibri", size=11, bold=True, color=ACCENT)
        vc.alignment = CENTER
        vc.fill = FILL_SUB
        vc.border = BOX

    note(ws, r + 7,
         "Objections repeated three or more times are the fifth counted output - code them by "
         "hand from column K. Three of twelve is 25% of your sample, and it is the objection "
         "that will appear in your reviews.", span=12)


def sheet_playtests(wb):
    ws = wb.create_sheet("Play-tests")
    title(ws, "Child play-test sessions",
          "15 children, 15-20 minutes each. Gate 2 computes at the bottom: most children "
          "complete 15 minutes without repeated adult rescue (3 or more interventions).",
          span=12)
    cols = ["#", "Child age", "Colors at home? (Y/N)", "Min to first disengagement",
            "Adult rescues (count)", "Pages attempted", "Pages completed",
            "Noticed discovery prompt? (Y/N)", "Acted on creative prompt? (Y/N)",
            "First page picked (sheet #)", "Media used", "MARKER BLEED-THROUGH? (Y/N)",
            "Tore sheet out OK? (Y/N)", "Wanted to keep/show? (Y/N)", "Verbatim quote"]
    widths = [4, 9, 12, 14, 12, 11, 11, 14, 14, 12, 14, 16, 12, 13, 40]
    header(ws, 4, cols, widths)
    input_rows(ws, 5, 19, len(cols))
    for i in range(15):
        ws.cell(row=5 + i, column=1, value=i + 1).alignment = CENTER

    yn = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
    ws.add_data_validation(yn)
    for col in ("C", "H", "I", "L", "M", "N"):
        yn.add(f"{col}5:{col}19")

    r = 21
    ws.cell(row=r, column=1, value="GATE 2 ARITHMETIC").font = H2
    outputs = [
        ("Sessions completed", "=COUNT(D5:D19)"),
        ("Children reaching 15 min without repeated rescue",
         "=SUMPRODUCT((D5:D19>=15)*(E5:E19<3)*(D5:D19<>\"\"))"),
        ("% passing (Gate 2 needs a clear majority)",
         '=IFERROR(TEXT(SUMPRODUCT((D5:D19>=15)*(E5:E19<3)*(D5:D19<>""))/COUNT(D5:D19),"0%"),"")'),
        ("Median minutes to first disengagement", '=IFERROR(MEDIAN(D5:D19),"")'),
        ("% who noticed a discovery prompt",
         '=IFERROR(TEXT(COUNTIF(H5:H19,"Y")/COUNTA(H5:H19),"0%"),"")'),
        ("% who acted on a creative prompt",
         '=IFERROR(TEXT(COUNTIF(I5:I19,"Y")/COUNTA(I5:I19),"0%"),"")'),
        ("ANY marker bleed-through? (any Yes = re-spec paper)",
         '=IF(COUNTIF(L5:L19,"Y")>0,"YES - RE-SPEC PAPER","none observed")'),
    ]
    for i, (label, formula) in enumerate(outputs):
        rr = r + 1 + i
        lc = ws.cell(row=rr, column=1, value=label)
        lc.font = BODY
        ws.merge_cells(start_row=rr, start_column=1, end_row=rr, end_column=9)
        vc = ws.cell(row=rr, column=10, value=formula)
        vc.font = Font(name="Calibri", size=11, bold=True, color=ACCENT)
        vc.alignment = CENTER
        vc.fill = FILL_SUB
        vc.border = BOX
        ws.merge_cells(start_row=rr, start_column=10, end_row=rr, end_column=12)

    note(ws, r + 9,
         "If the discovery-prompt or creative-prompt percentages come back low, that is a "
         "positioning failure rather than a design nit: 'creative time that teaches' is the "
         "lead message, and if the teaching is invisible in use the message is unsupported.",
         span=12)


def sheet_survey_raw(wb):
    ws = wb.create_sheet("Survey Raw")
    title(ws, "Survey export - paste target",
          "Paste the raw export here, one respondent per row, column order per "
          "04-survey-instrument.md. Keep this tab raw; do any cleaning in a copy.", span=10)
    cols = ["Resp ID", "City", "Child age", "Home language", "Saudi/Resident",
            "A1 purchases 6mo", "A2 times used", "A3 books at home", "A4 screen hrs",
            "A5 bought Saudi-themed", "B5 Learn", "B5 Screen", "B5 Culture", "B5 Gift",
            "B5 Price", "Cell shown (A/B/C)", "C1 relevance 1-5", "C2 difference 1-5",
            "C3 what they'd get (text)", "C4 first question (text)",
            "D2 top objection", "E1 self/gift", "E2 occasion", "E3 fair price band",
            "E4 too expensive", "E5 doubt quality", "E6 opt-in"]
    widths = [9, 10, 8, 12, 12, 10, 10, 10, 10, 12, 8, 8, 8, 8, 8, 10, 10, 10, 34, 34,
              20, 12, 16, 12, 12, 12, 9]
    header(ws, 4, cols, widths)
    for r in range(5, 40):
        for c in range(1, len(cols) + 1):
            ws.cell(row=r, column=c).border = BOX
            ws.cell(row=r, column=c).font = BODY

    r = 42
    ws.cell(row=r, column=1, value="GATE 1 - RELEVANCE").font = H2
    ws.cell(row=r + 1, column=1,
            value="Threshold: >=70% of qualified respondents rate the WINNING proposition 4-5 of 5.").font = BODY
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=8)

    cells = [("A", "Creative-learning lead"), ("B", "Culture lead"), ("C", "Screen balance")]
    hdr_row = r + 3
    for i, h in enumerate(["Cell", "Lead", "n", "Top-2-box (4-5)", "% top-2-box"], start=1):
        c = ws.cell(row=hdr_row, column=i, value=h)
        c.font = H2
        c.fill = FILL_SUB
        c.border = BOX
        c.alignment = CENTER
    for i, (code, label) in enumerate(cells):
        rr = hdr_row + 1 + i
        ws.cell(row=rr, column=1, value=code).alignment = CENTER
        ws.cell(row=rr, column=2, value=label).font = BODY
        ws.cell(row=rr, column=3, value=f'=COUNTIF($P$5:$P$400,"{code}")')
        ws.cell(row=rr, column=4,
                value=f'=COUNTIFS($P$5:$P$400,"{code}",$Q$5:$Q$400,">=4")')
        ws.cell(row=rr, column=5, value=f'=IFERROR(TEXT(D{rr}/C{rr},"0%"),"")')
        for cc in range(1, 6):
            ws.cell(row=rr, column=cc).border = BOX
            ws.cell(row=rr, column=cc).fill = FILL_SUB

    note(ws, hdr_row + 5,
         "With n=150 across three cells you have ~50 per cell - enough to see a large "
         "difference, not a small one. If the cells land within a few points of each other, the "
         "honest finding is 'message did not differentiate', and the decision passes to the "
         "paid test.", span=10)


def sheet_bestworst(wb):
    ws = wb.create_sheet("BestWorst")
    title(ws, "Forced trade-offs - best/worst scoring",
          "Enter the counts from Section B1-B4. Score = (most - least) / times shown, on a "
          "-1 to +1 scale. Cross-check the ranking against the Section B5 constant sum.", span=8)
    cols = ["Attribute", "Code", "Times shown", "Chosen MOST", "Chosen LEAST",
            "Score (-1 to +1)", "Rank"]
    widths = [40, 10, 13, 13, 13, 15, 8]
    header(ws, 4, cols, widths)

    attrs = [
        ("It has clear learning value", "LEARN", 3),
        ("It keeps my child busy without a screen", "SCREEN", 3),
        ("The content reflects Saudi Arabia", "CULTURE", 2),
        ("It looks good enough to give as a gift", "GIFT", 3),
        ("My child can use it without my help", "ALONE", 2),
        ("The paper and printing feel premium", "QUALITY", 3),
        ("The Arabic comes first, not as a translation", "ARABIC", 2),
        ("The price is low", "PRICE", 3),
    ]
    for i, (label, code, shown) in enumerate(attrs):
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.cell(row=r, column=2, value=code).alignment = CENTER
        ws.cell(row=r, column=3, value=shown).alignment = CENTER
        ws.cell(row=r, column=4).fill = FILL_INPUT
        ws.cell(row=r, column=5).fill = FILL_INPUT
        ws.cell(row=r, column=6,
                value=f"=IFERROR(ROUND((D{r}-E{r})/(C{r}*$B$16),3),\"\")")
        ws.cell(row=r, column=7, value=f"=IFERROR(RANK(F{r},$F$5:$F$12),\"\")")
        for c in range(1, 8):
            ws.cell(row=r, column=c).border = BOX
            if c >= 6:
                ws.cell(row=r, column=c).font = Font(name="Calibri", size=10, bold=True,
                                                     color=ACCENT)
                ws.cell(row=r, column=c).alignment = CENTER
        ws.row_dimensions[r].height = 20

    ws.cell(row=16, column=1, value="Respondents who completed Section B (enter):").font = H2
    ws.merge_cells(start_row=16, start_column=1, end_row=16, end_column=1)
    n = ws.cell(row=16, column=2, value=150)
    n.fill = FILL_INPUT
    n.border = BOX
    n.font = Font(name="Calibri", size=11, bold=True)
    n.alignment = CENTER

    note(ws, 18,
         "PRICE is in the pool as the calibration anchor. If 'the price is low' outranks LEARN "
         "and SCREEN, you do not have a premium proposition, and no amount of message testing "
         "will create one - that is a product and positioning finding, not a copy problem.",
         span=8)


def sheet_paid_test(wb):
    ws = wb.create_sheet("Paid Test")
    title(ws, "Paid intent test - and the derived Gate 4 threshold",
          "The brief sets no paid-intent number on purpose: derive it from unit economics and "
          "traffic quality. Do that here, and do it BEFORE the test finishes.", span=9)

    ws.cell(row=4, column=1, value="STEP 1 - DERIVE THE THRESHOLD").font = H2
    inputs = [
        ("Max allowable CAC at target contribution (SAR)", 10.01,
         "COPY IT from 03-economics/unit-economics.xlsx, tab Break-even - do not leave "
         "this placeholder. Seeded here with the core pad at SAR 49."),
        ("Observed cost per qualified click (SAR)", 1.60,
         "Measure it in the first 48 hours; do not assume it"),
    ]
    for i, (label, val, hint) in enumerate(inputs):
        r = 5 + i
        ws.cell(row=r, column=1, value=label).font = BODY
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
        c = ws.cell(row=r, column=5, value=val)
        c.fill = FILL_INPUT
        c.border = BOX
        c.alignment = CENTER
        c.font = Font(name="Calibri", size=11, bold=True)
        h = ws.cell(row=r, column=6, value=hint)
        h.font = MUTED
        ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=9)

    r = 8
    ws.cell(row=r, column=1,
            value="GATE 4 THRESHOLD: required conversion rate = CPC / max CAC").font = H2
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    c = ws.cell(row=r, column=5, value="=IFERROR(TEXT(E6/E5,\"0.00%\"),\"\")")
    c.font = Font(name="Calibri", size=12, bold=True, color=ACCENT)
    c.fill = FILL_SUB
    c.border = BOX
    c.alignment = CENTER
    ws.cell(row=r + 1, column=1,
            value="Must be met in BOTH city audiences, on a minimum of 200 qualified clicks per "
                  "cell. Below ~200 you cannot distinguish a real difference from noise, and a "
                  "gate you cannot measure is not a gate.").font = MUTED
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=9)
    ws.row_dimensions[r + 1].height = 30

    ws.cell(row=11, column=1, value="STEP 2 - RESULTS BY CELL AND CITY").font = H2
    cols = ["Cell", "Message lead", "City", "Spend SAR", "Qualified clicks",
            "Preorders / leads", "CVR", "CAC SAR", "Passes gate?"]
    widths = [7, 26, 12, 12, 15, 16, 11, 11, 14]
    header(ws, 12, cols, widths)

    rows = [("A", "Creative time that teaches", "Riyadh"),
            ("A", "Creative time that teaches", "Jeddah"),
            ("B", "Discover Saudi Arabia", "Riyadh"),
            ("B", "Discover Saudi Arabia", "Jeddah")]
    for i, (cell, msg, city) in enumerate(rows):
        r = 13 + i
        ws.cell(row=r, column=1, value=cell).alignment = CENTER
        ws.cell(row=r, column=2, value=msg).font = BODY
        ws.cell(row=r, column=3, value=city).font = BODY
        for c in (4, 5, 6):
            ws.cell(row=r, column=c).fill = FILL_INPUT
        ws.cell(row=r, column=7, value=f'=IFERROR(TEXT(F{r}/E{r},"0.00%"),"")')
        ws.cell(row=r, column=8, value=f'=IFERROR(ROUND(D{r}/F{r},2),"")')
        ws.cell(row=r, column=9,
                value=f'=IF(OR(E{r}="",F{r}=""),"",IF(AND(E{r}>=200,F{r}/E{r}>=$E$6/$E$5),'
                      f'"PASS","FAIL"))')
        for c in range(1, 10):
            ws.cell(row=r, column=c).border = BOX
            ws.cell(row=r, column=c).alignment = CENTER if c != 2 else WRAP

    r = 18
    ws.cell(row=r, column=1, value="GATE 4 VERDICT").font = H2
    v = ws.cell(row=r, column=5,
                value='=IF(COUNTIF(I13:I16,"PASS")=0,"",'
                      'IF(COUNTIF(I13:I16,"FAIL")>0,"NOT PASSED IN ALL CELLS","PASSED"))')
    v.font = Font(name="Calibri", size=12, bold=True, color=ACCENT)
    v.fill = FILL_SUB
    v.border = BOX
    v.alignment = CENTER
    ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=9)

    note(ws, 20,
         "One city passing is a niche, not a launch: narrow the segment or cut the print "
         "quantity rather than averaging the two together. If neither message clearly wins, do "
         "NOT declare cell A the winner by default - it means the message is not the lever, and "
         "the spend should move to proof and price.", span=9)

    ws.cell(row=23, column=1, value="STEP 3 - PRICE CELL, INSIDE THE WINNING MESSAGE").font = H2
    cols2 = ["Price point", "Offer", "Qualified clicks", "Preorders", "CVR",
             "Net revenue/order SAR", "Contribution/order SAR", "Contribution per visitor SAR"]
    header(ws, 24, cols2, [13, 16, 15, 12, 11, 18, 20, 24])
    price_rows = [("SAR 39", "Core pad"), ("SAR 49", "Core pad"),
                  ("SAR 79", "Gift bundle"), ("SAR 89", "Gift bundle")]
    for i, (p, offer) in enumerate(price_rows):
        r = 25 + i
        ws.cell(row=r, column=1, value=p).alignment = CENTER
        ws.cell(row=r, column=2, value=offer).font = BODY
        for c in (3, 4, 6, 7):
            ws.cell(row=r, column=c).fill = FILL_INPUT
        ws.cell(row=r, column=5, value=f'=IFERROR(TEXT(D{r}/C{r},"0.00%"),"")')
        ws.cell(row=r, column=8, value=f'=IFERROR(ROUND(G{r}*D{r}/C{r},2),"")')
        for c in range(1, 9):
            ws.cell(row=r, column=c).border = BOX
            ws.cell(row=r, column=c).alignment = CENTER if c != 2 else WRAP

    note(ws, 30,
         "THE PRICE DECISION RULE: the winner is the highest contribution per qualified visitor "
         "in column H - not the highest conversion rate, and not the price parents said they "
         "preferred. A higher price is acceptable only when the extra unit margin more than "
         "offsets the conversion loss and the return/refund risk.", span=8)


def sheet_gate_review(wb):
    ws = wb.create_sheet("Gate Review")
    title(ws, "Gate review - 30 September 2026",
          "Fill in every observed value BEFORE the meeting discusses what to do about them. "
          "All six gates must pass before the full print order is placed.", span=6)
    cols = ["#", "Gate", "Threshold", "Observed", "Pass?", "If it fails"]
    widths = [4, 20, 44, 16, 12, 52]
    header(ws, 4, cols, widths)

    gates = [
        ("1", "Relevance", ">=70% of qualified respondents rate the winning proposition 4-5/5",
         "Revise the proposition. Do not buy more traffic against a message parents rated 3."),
        ("2", "Child engagement",
         "Most play-test children complete 15 min without repeated adult rescue",
         "Simplify line art, prompt language or difficulty cues. Re-test with 5 children."),
        ("3", "Cultural trust",
         "No recurring accuracy or representation concern after independent review",
         "Correct the content and re-proof. A recurring concern is a content defect."),
        ("4", "Paid intent", "Derived CVR threshold met in BOTH city audiences",
         "Narrow the segment or cut the print quantity. One city is a niche, not a launch."),
        ("5", "Economics",
         "Positive contribution after COGS, packaging, payment, shipping, returns and CAC",
         "Raise basket value, reduce COGS, or STOP. Volume multiplies a negative number."),
        ("6", "Operations", "Print sample, packing, delivery and support pass a 20-order dry run",
         "Delay the launch. Do not damage the first reviews - they are irreplaceable."),
    ]
    for i, (num, name, threshold, fail) in enumerate(gates):
        r = 5 + i
        ws.cell(row=r, column=1, value=num).alignment = CENTER
        ws.cell(row=r, column=2, value=name).font = H2
        ws.cell(row=r, column=3, value=threshold).font = BODY
        ws.cell(row=r, column=4).fill = FILL_INPUT
        ws.cell(row=r, column=5).fill = FILL_INPUT
        ws.cell(row=r, column=6, value=fail).font = MUTED
        for c in range(1, 7):
            ws.cell(row=r, column=c).border = BOX
            ws.cell(row=r, column=c).alignment = WRAP
        ws.row_dimensions[r].height = 44

    pf = DataValidation(type="list", formula1='"PASS,FAIL"', allow_blank=True)
    ws.add_data_validation(pf)
    pf.add("E5:E10")

    r = 12
    ws.cell(row=r, column=1, value="DECISION").font = H2
    d = ws.cell(row=r, column=3,
                value='=IF(COUNTA(E5:E10)<6,"Not all gates scored",'
                      'IF(COUNTIF(E5:E10,"FAIL")=0,"FUND THE PRINT PROOF AND PILOT RUN",'
                      '"DO NOT PRINT - "&COUNTIF(E5:E10,"FAIL")&" gate(s) failed"))')
    d.font = Font(name="Calibri", size=13, bold=True, color=ACCENT)
    d.fill = FILL_SUB
    d.border = BOX
    d.alignment = CENTER
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=6)
    ws.row_dimensions[r].height = 28

    note(ws, 14,
         "THE STOP RULE: if Gate 5 fails at BOTH SAR 39 and SAR 49, with the bundle, stop. That "
         "is the one gate no copy, photography or message can fix, because it is arithmetic. "
         "Stopping at the end of September costs roughly SAR 10,500 of the SAR 22,000 and leaves "
         "you a language bank, a tested prototype, a cultural review and a working store. "
         "Printing into a failed gate costs the full budget and leaves you inventory.", span=6)

    r = 17
    ws.cell(row=r, column=1, value="Sign-off").font = H2
    signers = [("Founder", ""), ("Cultural / editorial reviewer (Gate 3)", ""),
               ("Person arguing the other side", "")]
    for i, (role, _) in enumerate(signers):
        rr = r + 1 + i
        ws.cell(row=rr, column=1, value=role).font = BODY
        ws.merge_cells(start_row=rr, start_column=1, end_row=rr, end_column=2)
        for c in (3, 4):
            ws.cell(row=rr, column=c).fill = FILL_INPUT
            ws.cell(row=rr, column=c).border = BOX
        ws.cell(row=rr, column=3, value="").alignment = CENTER
    ws.cell(row=r + 4, column=1,
            value="If nobody in the room is arguing against the print order, the review has not "
                  "happened yet.").font = MUTED
    ws.merge_cells(start_row=r + 4, start_column=1, end_row=r + 4, end_column=6)


def main():
    wb = Workbook()
    sheet_instructions(wb)
    sheet_language_bank(wb)
    sheet_playtests(wb)
    sheet_survey_raw(wb)
    sheet_bestworst(wb)
    sheet_paid_test(wb)
    sheet_gate_review(wb)

    out = Path(__file__).resolve().parent / "sprint-workbook.xlsx"
    wb.save(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
