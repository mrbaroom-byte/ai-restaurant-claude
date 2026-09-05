#!/usr/bin/env python3
"""Generate the print-ready prototype of the flagship pad, straight from sheets.json.

Two outputs, for two different jobs:

  --mode template  (default)  The production layout: every sheet's typography, prompts,
                              difficulty icon, numbering and safe margins, finalised, with
                              the illustration area left empty and the art direction printed
                              inside it. This is what the ILLUSTRATOR draws into, and what the
                              printer quotes against.

  --mode dummy                The same pages with placeholder geometric line art in the
                              illustration area, so a physical pad can be printed and used for
                              the PAPER AND FORMAT tests: marker bleed-through, tear-out,
                              crayon behaviour, trim, drop test.

WHAT THE DUMMY IS NOT: it does not test subject appeal, difficulty of the real line art, or
whether children engage with the actual drawings. Those need commissioned illustration. The
placeholder art is deliberately generic geometry — inventing "Arabian-style" motifs is exactly
the cliche the content plan bans, and fake Al-Qatt or Sadu patterns would violate the editorial
rule that every motif comes from genuine reference.

Fonts: Tajawal (SIL Open Font License), fetched once into a gitignored cache and embedded in
the HTML so the PDF renders identically with no network.

Run:
    python3 business/02-product/prototype/build_prototype.py            # template
    python3 business/02-product/prototype/build_prototype.py --mode dummy
    python3 business/02-product/prototype/build_prototype.py --mode both --no-pdf
"""

import argparse
import json
import math
import pathlib
import random
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PRODUCT = HERE.parent
BUSINESS = PRODUCT.parent
FONT_DIR = HERE / "fonts"

sys.path.insert(0, str(BUSINESS))
from lib.render import ARABIC_DIGITS, ensure_fonts, font_face_css, render_pdf  # noqa: E402
PILLAR_AR = {
    "nature": "الطبيعة والأرض", "architecture": "العمارة والأماكن", "craft": "الحِرف والصناعة",
    "everyday": "الحياة اليومية", "contemporary": "اليوم والغد", "finale": "صفحتك أنت",
}
PILLAR_EN = {
    "nature": "Nature and land", "architecture": "Architecture and places", "craft": "Craft and making",
    "everyday": "Everyday life", "contemporary": "Today and tomorrow", "finale": "Your own page",
}


# --------------------------------------------------------------------------- placeholder art
def placeholder_art(seed, difficulty):
    """Generic geometric line art for the paper/format test dummy.

    Deliberately abstract. Density tracks the sheet's difficulty rating so the dummy exercises
    the same range of ink coverage the real art will, which is what the marker bleed-through
    test actually depends on.
    """
    rng = random.Random(seed)
    w, h = 600, 640
    shapes = []
    density = {0: 3, 1: 7, 2: 14, 3: 26}.get(difficulty, 12)

    pad = 16  # keep every shape clear of the trim edge
    for _ in range(density):
        kind = rng.choice(("circle", "poly", "arc", "grid"))
        cx, cy = rng.uniform(90, w - 90), rng.uniform(90, h - 90)
        # Clamp the radius so no shape runs off the sheet — ink at the trim edge reads as a
        # printing fault rather than a design choice, even on a test dummy.
        r = min(rng.uniform(34, 108), cx - pad, w - pad - cx, cy - pad, h - pad - cy)
        if r < 18:
            continue
        if kind == "circle":
            shapes.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}"/>')
        elif kind == "poly":
            n = rng.randint(3, 7)
            rot = rng.uniform(0, math.tau)
            pts = " ".join(
                f"{cx + r * math.cos(rot + i * math.tau / n):.1f},"
                f"{cy + r * math.sin(rot + i * math.tau / n):.1f}" for i in range(n)
            )
            shapes.append(f'<polygon points="{pts}"/>')
        elif kind == "arc":
            shapes.append(
                f'<path d="M{cx - r:.1f},{cy:.1f} A{r:.1f},{r * rng.uniform(.4, 1):.1f} 0 0 1 '
                f'{cx + r:.1f},{cy:.1f}"/>'
            )
        else:
            step = r / rng.randint(2, 4)
            for i in range(int(r / step)):
                shapes.append(
                    f'<rect x="{cx - r + i * step:.1f}" y="{cy - r + i * step:.1f}" '
                    f'width="{2 * (r - i * step):.1f}" height="{2 * (r - i * step):.1f}"/>'
                )
    return (f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" '
            f'fill="none" stroke="#111" stroke-width="2.2" stroke-linejoin="round">'
            + "".join(shapes) + "</svg>")


# --------------------------------------------------------------------------- pages
def dots(difficulty):
    if difficulty == 0:
        return '<span class="dot open">○</span>'
    return "".join('<span class="dot">●</span>' for _ in range(difficulty))


ART_DIR = PRODUCT / "art" / "sheets"


def generated_art(n):
    """Inline the generated SVG for sheet n, scaled to fill the illustration area.

    Returns None when no file exists, so the art build degrades to the template's brief
    rather than producing a silently blank page.
    """
    matches = sorted(ART_DIR.glob(f"{n:02d}-*.svg"))
    if not matches:
        return None
    svg = matches[0].read_text(encoding="utf-8")
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^>]*>", "", svg)
    # Drop fixed dimensions so the viewBox drives scaling inside the flex container.
    svg = re.sub(r'(<svg\b[^>]*?)\swidth="[^"]*"', r"\1", svg, count=1)
    svg = re.sub(r'(<svg\b[^>]*?)\sheight="[^"]*"', r"\1", svg, count=1)
    svg = re.sub(r"(<svg\b)", r'\1 preserveAspectRatio="xMidYMid meet"', svg, count=1)
    return svg.strip()


def sheet_page(s, mode, brand_ar, brand_en):
    n = s["n"]
    if mode == "dummy":
        art = placeholder_art(n * 7919, s["difficulty"])
    elif mode == "art":
        art = generated_art(n)
        if art is None:
            art = (f'<div class="artbrief"><b>Sheet {n} — no artwork yet</b>'
                   f'<p>{s["art"]}</p></div>')
    else:
        art = (f'<div class="artbrief"><b>Sheet {n} — illustration area</b>'
               f'<p>{s["art"]}</p>'
               f'<p class="verify"><b>Verify before print:</b> {s["verify"]}</p></div>')

    talk = ""
    if s.get("talk"):
        talk = (f'<div class="talk"><span class="ticon">◆</span>'
                f'<span class="tar">{s["talk_ar"]}</span>'
                f'<span class="ten">{s["talk_en"]}</span></div>')

    return f"""
<section class="page sheet {mode}">
  <div class="safe">
    <header class="shead">
      <div class="diff" title="difficulty">{dots(s['difficulty'])}</div>
      <div class="pillar">{PILLAR_AR[s['pillar']]}<span>{PILLAR_EN[s['pillar']]}</span></div>
    </header>

    <div class="art">{art}</div>

    <div class="make"><span class="mar">{s['make_ar']}</span><span class="men">{s['make_en']}</span></div>

    <footer class="sfoot">
      <div class="fact">
        <p class="far">{s['fact_ar']}</p>
        <p class="fen">{s['fact_en']}</p>
      </div>
      {talk}
      <div class="num"><b>{str(n).translate(ARABIC_DIGITS)}</b><span>{n} / 20</span></div>
    </footer>
  </div>
</section>"""


def cover_page(brand_ar, brand_en, flagship_ar, flagship_en, descriptor_ar, mode):
    return f"""
<section class="page cover">
  <div class="safe">
    <div class="cbrand">{brand_ar}<span>{brand_en}</span></div>
    <div class="ctitle">
      <h1>{flagship_ar}</h1>
      <h2>{flagship_en}</h2>
      <p class="cpromise">لوّن. اكتشف. أبدع.<span>Color. Discover. Create.</span></p>
    </div>
    <div class="cspecs">
      <div><b>٢٠</b><span>ورقة قابلة للفصل<br>tear-out sheets</span></div>
      <div><b>٥–٨</b><span>سنوات<br>years</span></div>
      <div><b>A4</b><span>وجه واحد<br>single-sided</span></div>
    </div>
    <p class="cfoot">{descriptor_ar}<span>Working prototype — {mode} build. Not for sale. Brand name is a placeholder.</span></p>
  </div>
</section>"""


def certificate_page():
    return """
<section class="page cert">
  <div class="safe">
    <div class="cert-frame">
      <p class="ceyebrow">شهادة إتمام<span>Certificate of Completion</span></p>
      <p class="cline">أتمّ / أتمّت</p>
      <div class="cfield"></div>
      <p class="cline">رحلته الإبداعية في ألوان السعودية<span>completed their creative journey through Colors of Saudi Arabia</span></p>
      <div class="csign">
        <div><div class="cfield sm"></div><span>التاريخ · Date</span></div>
        <div><div class="cfield sm"></div><span>توقيع أحد الوالدين · Parent's signature</span></div>
      </div>
    </div>
  </div>
</section>"""


def guide_page(sheets, mode):
    rows = "".join(
        f"<tr><td>{s['n']}</td><td class='ar'>{s['ar']}</td><td>{s['en']}</td>"
        f"<td>{PILLAR_EN[s['pillar']]}</td><td>{dots(s['difficulty'])}</td>"
        f"<td>{'yes' if s.get('talk') else ''}</td></tr>"
        for s in sheets
    )
    if mode == "art":
        warn = ("<p class='warn'><b>This is the ART build — generated artwork, for research "
                "stimuli and art direction only.</b> The line art was machine-generated from the "
                "descriptions in sheets.json. It is good enough to put in front of a child and "
                "learn something real about engagement and difficulty. It is NOT production art: "
                "several sheets are culturally or architecturally inaccurate, and sheets 12 and 13 "
                "depict living craft traditions whose motifs here are invented rather than drawn "
                "from reference. See art/ASSESSMENT.md for the sheet-by-sheet verdict.</p>")
    else:
        warn = ("" if mode == "template" else
            "<p class='warn'><b>This is the DUMMY build.</b> The illustration areas contain "
            "generic placeholder geometry for paper and format testing only — marker "
            "bleed-through, tear-out, crayon behaviour, trim and drop test. It does NOT test "
            "subject appeal or the difficulty of the real line art. Those need commissioned "
            "illustration; see illustrator-brief.md.</p>")
    mode_label = {"template": "Layout template",
                  "dummy": "Paper and format test dummy",
                  "art": "Generated artwork - research stimuli"}[mode]
    return f"""
<section class="page guide">
  <div class="safe">
    <h1>Production guide<span>{mode_label}</span></h1>
    {warn}
    <p class="warn"><b>Every fact in this pad is a draft awaiting the independent cultural and
    editorial review.</b> Nothing prints unverified. Sign off by sheet number using the log in
    20-sheet-content-plan.md.</p>
    <table>
      <thead><tr><th>#</th><th>Arabic</th><th>English</th><th>Pillar</th><th>Difficulty</th><th>Talk</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <div class="specs">
      <div><b>Trim</b>A4, 210 × 297 mm</div>
      <div><b>Safe margin</b>12 mm, all four edges</div>
      <div><b>Bleed</b>3 mm for the printer</div>
      <div><b>Printing</b>1/0, 100% K only — never rich black</div>
      <div><b>Stock</b>140–160 gsm uncoated, high bulk, matt</div>
      <div><b>Reverse</b>Blank — it is the display side</div>
      <div><b>Binding</b>Padded, clean single-sheet tear-out</div>
      <div><b>Arabic</b>Outline all text before output; proof on paper, not on screen</div>
    </div>
  </div>
</section>"""


CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Tajawal', sans-serif; color: #111; background: #8a8f8b;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  width: 210mm; height: 297mm; background: #fff; position: relative;
  page-break-after: always; break-after: page; overflow: hidden;
  margin: 0 auto 8mm; box-shadow: 0 2px 14px rgba(0,0,0,.28);
}
@media print { .page { margin: 0; box-shadow: none; } }
.safe {
  position: absolute; inset: 12mm; display: flex; flex-direction: column;
}
/* ---------- guides, only on the template build ---------- */
.sheet.art .art svg { width: 100%; height: 100%; }
.sheet.template .safe { outline: .3mm dashed #dfa06a; outline-offset: 0; }
.sheet.template .safe::after {
  content: "12 mm safe margin - nothing colourable outside this line";
  position: absolute; bottom: -8mm; left: 0; direction: ltr;
  font-size: 2.3mm; color: #dfa06a; letter-spacing: .04em;
}

/* ---------- sheet ---------- */
.shead { display: grid; grid-template-columns: 1fr 1fr; align-items: start;
  flex: 0 0 auto; padding-bottom: 2mm; }
.diff { grid-column: 1; direction: ltr; text-align: right; letter-spacing: .6mm;
  font-size: 4.4mm; color: #c8763c; }
.diff .open { color: #b9c2bd; }
.pillar { grid-column: 2; direction: rtl; text-align: left; font-size: 3.1mm;
  font-weight: 700; color: #6d7a73; overflow: hidden; }
.pillar span { display: block; direction: ltr; text-align: left; font-size: 2.4mm;
  font-weight: 400; color: #9aa5a0; letter-spacing: .04em; text-transform: uppercase;
  white-space: nowrap; }

.art { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch;
  justify-content: center; padding: 2mm 0 3mm; }
.art svg { width: 100%; height: 100%; }
.artbrief {
  width: 100%; border: .4mm dashed #c3cdc7; border-radius: 2mm;
  display: flex; flex-direction: column; justify-content: flex-start; gap: 2.5mm;
  padding: 8mm; direction: ltr; text-align: left; color: #6d7a73;
}
.artbrief b { color: #1f3a2e; font-size: 4mm; }
.artbrief p { margin: 0; font-size: 3.2mm; line-height: 1.55; max-width: 105mm; }
.artbrief .verify { color: #9b5a2c; font-size: 2.9mm; }

.make { flex: 0 0 auto; text-align: center; padding: 1mm 0 3mm; }
.make .mar { display: block; font-size: 5mm; font-weight: 700; color: #1f6b4a; }
.make .men { display: block; direction: ltr; font-size: 3.1mm; color: #939d98; margin-top: .8mm; }

.sfoot { flex: 0 0 auto; border-top: .35mm solid #dfe5e1; padding-top: 3.5mm; display: flex;
  align-items: flex-end; gap: 5mm; }
.fact { flex: 1 1 auto; min-width: 0; }
.far { margin: 0; font-size: 4mm; font-weight: 500; line-height: 1.5; }
.fen { margin: 1mm 0 0; direction: ltr; text-align: left; font-size: 2.9mm; color: #8b958f; line-height: 1.4; }
.talk { flex: 0 0 48mm; border-inline-start: .35mm solid #e6d9c8; padding-inline-start: 4mm; }
.talk .ticon { color: #c8763c; font-size: 2.6mm; }
.talk .tar { display: block; font-size: 3.2mm; font-weight: 700; color: #6b4a2c; }
.talk .ten { display: block; direction: ltr; text-align: left; font-size: 2.5mm; color: #a99a88; }
.num { flex: 0 0 14mm; text-align: center; }
.num b { display: block; font-size: 6mm; color: #1f3a2e; line-height: 1; }
.num span { display: block; direction: ltr; font-size: 2.4mm; color: #aab3ae; }

/* ---------- cover ---------- */
.cover .safe { justify-content: space-between; text-align: center; }
.cbrand { font-size: 7mm; font-weight: 700; color: #1f3a2e; }
.cbrand span { display: block; direction: ltr; font-size: 2.8mm; font-weight: 400;
  letter-spacing: .22em; text-transform: uppercase; color: #9aa5a0; margin-top: 1mm; }
.ctitle h1 { font-size: 18mm; margin: 0; color: #1f6b4a; line-height: 1.1; }
.ctitle h2 { font-size: 6mm; margin: 3mm 0 0; direction: ltr; font-weight: 400; color: #6d7a73; }
.cpromise { margin: 8mm 0 0; font-size: 5mm; font-weight: 700; color: #c8763c; }
.cpromise span { display: block; direction: ltr; font-size: 3mm; font-weight: 400; color: #b0a08e; margin-top: 1mm; }
.cspecs { display: flex; justify-content: center; gap: 14mm; }
.cspecs div { text-align: center; }
.cspecs b { display: block; font-size: 9mm; color: #1f3a2e; line-height: 1; }
.cspecs span { display: block; font-size: 2.8mm; color: #8b958f; margin-top: 1.5mm; line-height: 1.4; }
.cfoot { font-size: 3mm; color: #9aa5a0; margin: 0; }
.cfoot span { display: block; direction: ltr; font-size: 2.5mm; color: #b6bfba; margin-top: 1mm; }

/* ---------- certificate ---------- */
.cert .safe { align-items: center; justify-content: center; }
.cert-frame { border: .8mm solid #c8763c; border-radius: 3mm; padding: 18mm 14mm;
  width: 100%; text-align: center; }
.ceyebrow { font-size: 8mm; font-weight: 700; color: #1f6b4a; margin: 0 0 8mm; }
.ceyebrow span { display: block; direction: ltr; font-size: 3.2mm; font-weight: 400; color: #9aa5a0; }
.cline { font-size: 4.2mm; color: #4a5a52; margin: 0; }
.cline span { display: block; direction: ltr; font-size: 2.9mm; color: #a3ada8; margin-top: 1mm; }
.cfield { border-bottom: .4mm solid #cfd8d3; height: 12mm; margin: 4mm 0 6mm; }
.cfield.sm { height: 8mm; margin: 2mm 0 1.5mm; }
.csign { display: flex; gap: 10mm; margin-top: 12mm; }
.csign div { flex: 1; }
.csign span { font-size: 2.7mm; color: #a3ada8; }

/* ---------- guide ---------- */
.guide .safe { direction: ltr; text-align: left; }
.guide h1 { font-size: 7mm; color: #1f3a2e; margin: 0 0 1mm; }
.guide h1 span { display: block; font-size: 3.2mm; font-weight: 400; color: #8b958f; }
.warn { font-size: 3mm; line-height: 1.5; background: #fdf3e9; border-inline-start: 1mm solid #c8763c;
  padding: 3mm 4mm; margin: 3mm 0; color: #6b4a2c; }
.guide table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 2.9mm; }
.guide th { text-align: left; background: #1f3a2e; color: #fff; padding: 1.6mm 2mm; font-weight: 700; }
.guide td { border-bottom: .25mm solid #e6ebe8; padding: 1.4mm 2mm; }
.guide td.ar { direction: rtl; text-align: right; font-size: 3.2mm; }
.specs { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; margin-top: 5mm; font-size: 2.9mm; color: #4a5a52; }
.specs div { border-top: .25mm solid #e6ebe8; padding-top: 1.5mm; }
.specs b { display: block; color: #1f3a2e; font-size: 2.6mm; text-transform: uppercase; letter-spacing: .06em; }
"""


def build_html(mode, cfg, sheets):
    brand_ar = cfg["masterbrand"]["arabic"]
    brand_en = cfg["masterbrand"]["latin"]
    pages = [
        cover_page(brand_ar, brand_en, cfg["flagship"]["ar"], cfg["flagship"]["en"],
                   cfg["descriptor"]["ar"], mode),
        guide_page(sheets, mode),
    ]
    pages += [sheet_page(s, mode, brand_ar, brand_en) for s in sheets]
    pages.append(certificate_page())
    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>{cfg['flagship']['ar']} — {mode} prototype</title>
<style>
{font_face_css(FONT_DIR)}
{CSS}
</style>
</head>
<body>
{''.join(pages)}
</body>
</html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=("template", "dummy", "art", "both", "all"),
                    default="template")
    ap.add_argument("--no-pdf", action="store_true")
    args = ap.parse_args()

    cfg = json.loads((BUSINESS / "brand.config.json").read_text(encoding="utf-8"))
    sheets = json.loads((PRODUCT / "sheets.json").read_text(encoding="utf-8"))["sheets"]
    if len(sheets) != 20:
        sys.exit(f"Expected 20 sheets in sheets.json, found {len(sheets)}.")

    print("Fonts:")
    ensure_fonts(FONT_DIR)

    modes = {"both": ("template", "dummy"),
             "all": ("template", "dummy", "art")}.get(args.mode, (args.mode,))
    for mode in modes:
        html = build_html(mode, cfg, sheets)
        html_path = HERE / f"prototype-{mode}.html"
        html_path.write_text(html, encoding="utf-8")
        print(f"Wrote {html_path.relative_to(BUSINESS.parent)}  ({len(html) // 1024} KB, 23 pages)")
        if not args.no_pdf:
            pdf_path = HERE / f"prototype-{mode}.pdf"
            if render_pdf(html_path, pdf_path):
                print(f"Wrote {pdf_path.relative_to(BUSINESS.parent)}  "
                      f"({pdf_path.stat().st_size // 1024} KB)")

    print("\nPrint settings for the child sessions: A4, 100% scale (no 'fit to page'),\n"
          "no printer margins, single-sided, on the heaviest uncoated stock you have.")


if __name__ == "__main__":
    main()
