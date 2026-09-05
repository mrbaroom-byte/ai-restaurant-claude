#!/usr/bin/env python3
"""Generate brand-guidelines.html (and PDF) from tokens.json.

The contrast table is COMPUTED at build time, not typed. A guidelines document that claims
accessibility it has not measured is worse than none, because everyone downstream trusts it.

Run:  python3 business/00-strategy/identity/build_guidelines.py
"""

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
BUSINESS = HERE.parents[1]
sys.path.insert(0, str(BUSINESS))
from lib.render import ensure_fonts, font_face_css, render_pdf  # noqa: E402

FONT_DIR = HERE / "fonts"
T = json.loads((HERE / "tokens.json").read_text(encoding="utf-8"))
CFG = json.loads((BUSINESS / "brand.config.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- contrast
def _lum(hx):
    c = [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    l1, l2 = sorted([_lum(a), _lum(b)], reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def all_colours():
    out = {}
    for grp in ("core", "accent", "neutral"):
        for k, v in T["colour"][grp].items():
            out[k] = v["hex"]
    return out


# ---------------------------------------------------------------- blocks
def swatches():
    html = ""
    for grp, label in (("core", "Core"), ("accent", "Accent"), ("neutral", "Neutral")):
        html += f'<h3>{label}</h3><div class="swatches">'
        for k, v in T["colour"][grp].items():
            name_ar = v.get("name_ar", "")
            name_en = v.get("name_en", k.title())
            dark = _lum(v["hex"]) < 0.4
            html += (
                f'<div class="sw"><div class="chip" style="background:{v["hex"]};'
                f'color:{"#FAF7F1" if dark else "#1F2D27"}">{v["hex"]}</div>'
                f'<div class="swb"><b class="ar">{name_ar}</b><span>{name_en}</span>'
                f'<p>{v["use"]}</p></div></div>'
            )
        html += "</div>"
    return html


def contrast_table():
    C = all_colours()
    grounds = [("paper", "Paper"), ("white", "Sheet white"), ("green", "Palm green"),
               ("ink", "Ink"), ("clay", "Clay")]
    texts = ["ink", "green", "terracotta", "soft", "muted", "white", "paper", "sky", "rose"]
    head = "".join(f"<th>{lbl}</th>" for _, lbl in grounds)
    rows = ""
    for t in texts:
        cells = ""
        for g, _ in grounds:
            if t == g:
                cells += '<td class="na">—</td>'
                continue
            r = contrast(C[t], C[g])
            if r >= 4.5:
                cls, tag = "pass", "AA"
            elif r >= 3.0:
                cls, tag = "large", "AA large"
            else:
                cls, tag = "fail", "no"
            cells += (f'<td class="{cls}"><b>{r:.1f}</b><span>{tag}</span></td>')
        rows += f'<tr><th class="rh">{t}</th>{cells}</tr>'
    return f'<table class="contrast"><thead><tr><th></th>{head}</tr></thead><tbody>{rows}</tbody></table>'


def type_scale():
    rows = ""
    for k, v in T["type"]["scale"].items():
        style = (f'font-size:{v["size"]};font-weight:{v["weight"]};'
                 f'letter-spacing:{v.get("tracking", "0")};'
                 f'text-transform:{v.get("case", "none")}')
        rows += (f'<tr><td class="tk">{k}</td>'
                 f'<td><div class="ar" style="{style}">لوّن. اكتشف. أبدع.</div>'
                 f'<div style="{style};opacity:.55">Color. Discover. Create.</div></td>'
                 f'<td class="tm">{v["size"]}<br>{v["weight"]}</td>'
                 f'<td class="tu">{v["use"]}</td></tr>')
    return f'<table class="type">{rows}</table>'


def lst(items, cls=""):
    return f'<ul class="{cls}">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


MARK = (HERE / "mark.svg").read_text(encoding="utf-8").split("?>")[-1]
MARK_REV = (HERE / "mark-reversed.svg").read_text(encoding="utf-8").split("?>")[-1]

EXPLORATIONS = [
    ("01-window", "Window and mark", "On-concept — the page and the child's mark. The strongest of the six generated, but the interior squiggle is loose where the rest is geometric."),
    ("02-frond", "Palm frond", "Warm, but reads as a sunburst as much as a frond, and botanical marks are crowded in this category."),
    ("03-arch", "Arch", "<b>Rejected.</b> Reads as a mihrab. The editorial rules bar religious architecture as a brand device, and this is not a judgement to make late."),
    ("04-page", "Lifting page", "Abstract to the point of saying nothing. Reads as a bird or a sail before it reads as paper."),
    ("05-strokes", "Four strokes", "Clean, distinctive, holds small. The least literal and the most ownable — worth testing against the proposal."),
    ("06-sprout", "Stepped sprout", "Growth without the usual softness. Credible, but growth metaphors are heavily worked in education branding."),
]


def build():
    print("Fonts:")
    ensure_fonts(FONT_DIR)
    C = all_colours()

    explorations = "".join(
        f'<figure class="ex"><img src="mark-explorations/{f}.svg" alt="{n}">'
        f'<figcaption><b>{n}</b>{d}</figcaption></figure>'
        for f, n, d in EXPLORATIONS
    )

    html = f"""<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brand guidelines — {CFG['masterbrand']['arabic']}</title>
<style>
{font_face_css(FONT_DIR)}
@page {{ size: A4; margin: 14mm; }}
:root {{
  --ink:{C['ink']}; --green:{C['green']}; --paper:{C['paper']}; --white:{C['white']};
  --terracotta:{C['terracotta']}; --clay:{C['clay']}; --sky:{C['sky']}; --rose:{C['rose']};
  --sand:{C['sand']}; --soft:{C['soft']}; --muted:{C['muted']}; --line:{C['line']};
  color-scheme: light;
}}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--paper); color:var(--ink);
  font-family:'Tajawal',system-ui,sans-serif; font-size:16px; line-height:1.7; }}
.wrap {{ max-width:1080px; margin:0 auto; padding:0 24px 80px }}
section {{ padding:44px 0; border-top:1px solid var(--line) }}
section:first-of-type {{ border-top:0 }}
h1 {{ font-size:clamp(2rem,6vw,3.2rem); font-weight:800; letter-spacing:-.01em; margin:0 0 8px; line-height:1.15 }}
h2 {{ font-size:1.5rem; font-weight:800; margin:0 0 6px; color:var(--green) }}
h3 {{ font-size:1rem; font-weight:700; margin:26px 0 10px; text-transform:uppercase;
  letter-spacing:.09em; color:var(--soft); font-size:.8rem }}
p {{ margin:0 0 14px; max-width:68ch }}
.ar {{ direction:rtl; text-align:right; unicode-bidi:isolate }}
.en {{ display:block; color:var(--muted); font-size:.86em }}
.lede {{ font-size:1.1rem; color:var(--soft); max-width:62ch }}
.eyebrow {{ font-size:.72rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:var(--terracotta); margin:0 0 10px }}
.status {{ background:#FDF3E9; border-inline-start:4px solid var(--terracotta);
  border-radius:0 10px 10px 0; padding:18px 22px; margin:20px 0 0 }}
.status b {{ color:#8A4A1E }}

/* logo */
.logo-row {{ display:flex; gap:36px; align-items:center; flex-wrap:wrap; margin:22px 0 }}
.lock {{ display:flex; align-items:center; gap:14px }}
.lock svg {{ width:64px; height:64px; flex:0 0 auto }}
.wm {{ line-height:1 }}
.wm b {{ display:block; font-size:2.4rem; font-weight:800; letter-spacing:-.01em }}
.wm span {{ display:block; font-size:.72rem; font-weight:500;
  letter-spacing:.34em; text-transform:uppercase; color:var(--muted); margin-top:7px }}
.onGreen {{ background:var(--green); padding:22px 26px; border-radius:14px }}
.onGreen .wm b {{ color:var(--paper) }} .onGreen .wm span {{ color:rgba(250,247,241,.72) }}
.sizes {{ display:flex; gap:26px; align-items:flex-end; margin:18px 0 }}
.sizes div {{ text-align:center; font-size:.7rem; color:var(--muted) }}
.sizes svg {{ display:block; margin:0 auto 6px }}
.clear {{ position:relative; display:inline-block; padding:34px; background:
  repeating-linear-gradient(45deg,#fff,#fff 8px,#F4F0E8 8px,#F4F0E8 16px);
  border:1px dashed var(--line); border-radius:12px }}

/* swatches */
.swatches {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px }}
.sw {{ background:var(--white); border:1px solid var(--line); border-radius:12px; overflow:hidden }}
.chip {{ height:76px; display:flex; align-items:flex-end; padding:9px 12px;
  font-size:.72rem; font-weight:700; direction:ltr; letter-spacing:.06em }}
.swb {{ padding:12px 14px }}
.swb b {{ font-size:1rem }} .swb span {{ display:block; font-size:.72rem;
  color:var(--muted); letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px }}
.swb p {{ font-size:.8rem; color:var(--soft); margin:0; line-height:1.55 }}

/* contrast */
.contrast {{ width:100%; border-collapse:collapse; margin:14px 0; font-size:.82rem }}
.contrast th {{ background:var(--ink); color:var(--paper); padding:9px 8px; font-weight:700;
  font-size:.72rem; text-transform:uppercase; letter-spacing:.06em }}
.contrast .rh {{ background:var(--clay); color:var(--ink); text-align:left }}
.contrast td {{ border:1px solid var(--line); padding:8px; text-align:center; background:var(--white) }}
.contrast td b {{ display:block; font-size:.95rem }}
.contrast td span {{ font-size:.62rem; text-transform:uppercase; letter-spacing:.06em }}
.contrast .pass {{ background:#EAF3EE; color:#17513A }}
.contrast .large {{ background:#FDF3E9; color:#8A4A1E }}
.contrast .fail {{ background:#FBEDED; color:#8C2F2F }}
.contrast .na {{ background:#F6F4EF; color:var(--muted) }}

/* type */
.type {{ width:100%; border-collapse:collapse; margin:14px 0 }}
.type td {{ border-bottom:1px solid var(--line); padding:14px 10px; vertical-align:middle }}
.tk {{ width:80px; font-size:.7rem; text-transform:uppercase; letter-spacing:.1em; color:var(--terracotta); font-weight:700 }}
.tm {{ width:70px; font-size:.7rem; color:var(--muted); text-align:center }}
.tu {{ width:200px; font-size:.78rem; color:var(--soft) }}

ul {{ margin:0 0 14px; padding-inline-start:22px; max-width:70ch }}
li {{ margin-bottom:7px }}
.no li::marker {{ color:#8C2F2F }}

/* explorations */
.exs {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; margin-top:18px }}
.ex {{ margin:0; background:var(--white); border:1px solid var(--line); border-radius:12px; overflow:hidden }}
.ex img {{ width:100%; aspect-ratio:1; object-fit:contain; padding:20px; box-sizing:border-box; display:block }}
.ex figcaption {{ padding:12px 15px; border-top:1px solid var(--line); font-size:.8rem;
  color:var(--soft); line-height:1.55 }}
.ex figcaption b {{ display:block; color:var(--ink); font-size:.9rem; margin-bottom:3px }}

/* applications */
.apps {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:16px; margin-top:16px }}
.app {{ border:1px solid var(--line); border-radius:14px; overflow:hidden; background:var(--white) }}
.app .art {{ height:190px; display:flex; align-items:center; justify-content:center; padding:20px }}
.app .cap {{ padding:12px 15px; border-top:1px solid var(--line); font-size:.78rem; color:var(--soft) }}
.cover {{ background:var(--paper); flex-direction:column; text-align:center; gap:8px }}
.cover .t {{ font-size:1.5rem; font-weight:800; color:var(--green) }}
.cover .s {{ font-size:.68rem; letter-spacing:.2em; text-transform:uppercase; color:var(--muted) }}
.band {{ background:var(--green); color:var(--paper); flex-direction:column; gap:6px }}
.band .t {{ font-size:1.2rem; font-weight:800 }}
.sticker {{ background:var(--clay); gap:10px }}
.sticker i {{ width:52px; height:52px; border-radius:50%; background:var(--white);
  display:flex; align-items:center; justify-content:center }}
.sticker i svg {{ width:30px; height:30px }}
@media print {{ body {{ background:#fff }} section {{ break-inside:avoid }} }}
</style></head>
<body><div class="wrap">

<section>
  <p class="eyebrow">Brand guidelines · v{T['_version']} · {T['_dated']}</p>
  <h1><span class="ar">{CFG['masterbrand']['arabic']}</span><span class="en" style="font-size:1.4rem">{CFG['masterbrand']['latin']} — identity system</span></h1>
  <p class="lede"><span class="ar">{CFG['descriptor']['ar']}</span><span class="en">{CFG['descriptor']['en']}</span></p>
  <div class="status"><b>Status: a proposal for parent language testing, not a locked identity.</b>
  The decision brief forbids locking the name, logo, palette or font system before the
  Sept 7–18 sessions. Everything here is versioned and swappable in one command
  (<code>rename-brand.sh</code>). Put it in front of parents; do not print it on anything yet.</div>
</section>

<section>
  <h2>Principles</h2>
  {lst(T['principles'])}
</section>

<section>
  <h2>The mark</h2>
  <p>A sheet whose top corner has come away, holding the space a child fills. It is the product
  described in one shape: tear-out, single-sided, and the child's mark is the point.</p>
  <div class="logo-row">
    <div class="lock">{MARK}<div class="wm"><b class="ar">{CFG['masterbrand']['arabic']}</b><span>{CFG['masterbrand']['latin']}</span></div></div>
    <div class="lock onGreen">{MARK_REV}<div class="wm"><b class="ar">{CFG['masterbrand']['arabic']}</b><span>{CFG['masterbrand']['latin']}</span></div></div>
  </div>

  <h3>It has to hold at 16px</h3>
  <div class="sizes">
    <div>{MARK.replace('<svg', '<svg width="16" height="16"')}16</div>
    <div>{MARK.replace('<svg', '<svg width="24" height="24"')}24</div>
    <div>{MARK.replace('<svg', '<svg width="40" height="40"')}40</div>
    <div>{MARK.replace('<svg', '<svg width="72" height="72"')}72</div>
    <div>{MARK.replace('<svg', '<svg width="120" height="120"')}120</div>
  </div>
  <p>Minimum {T['logo']['minimum_size']['print_mm']}mm in print,
  {T['logo']['minimum_size']['screen_px']}px on screen for the lockup, and
  {T['logo']['minimum_size']['mark_only_px']}px for the mark alone.</p>

  <h3>Clear space</h3>
  <div class="clear">{MARK.replace('<svg', '<svg width="72" height="72"')}</div>
  <p>{T['logo']['clearspace']}</p>

  <h3>Never</h3>
  {lst(T['logo']['misuse'], 'no')}
</section>

<section>
  <h2>Colour</h2>
  <p>{T['colour']['rules'][0]}</p>
  {swatches()}
  <h3>Rules</h3>
  {lst(T['colour']['rules'][1:])}
</section>

<section>
  <h2>Contrast — measured, not asserted</h2>
  <p>Computed at build time from the tokens. <b>AA</b> clears 4.5:1 for body text;
  <b>AA large</b> clears 3:1 for text at 24px, or 19px bold, and for icons.
  Anything marked <b>no</b> must never carry text.</p>
  {contrast_table()}
  <p class="lede" style="font-size:.92rem">Auditing this found a real defect in work already
  shipped: the English secondary line sat at 2.4–2.9:1 across the landing pages, emails,
  prototype sheets and field-pack forms. It is the second reading of every bilingual line in the
  system, so it was the worst possible place to be unreadable. Fixed to
  <code>{C['muted']}</code> at 4.7:1.</p>
</section>

<section>
  <h2>Type</h2>
  <p><b>{T['type']['family']['name']}</b> — {T['type']['family']['why']}</p>
  {type_scale()}
  <h3>Bilingual rules</h3>
  {lst(T['type']['bilingual_rules'])}
</section>

<section>
  <h2>Applications</h2>
  <div class="apps">
    <div class="app"><div class="art cover">
      <div class="t ar">{CFG['flagship']['ar']}</div>
      <div class="s">{CFG['flagship']['en']}</div>
      {MARK.replace('<svg', '<svg width="34" height="34"')}
    </div><div class="cap">Pad cover — mark small, title leading, paper ground</div></div>

    <div class="app"><div class="art band">
      <div class="t ar">{CFG['promise']['ar']}</div>
      <div style="font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;opacity:.75">{CFG['promise']['en']}</div>
    </div><div class="cap">Packaging band — the one place green may dominate</div></div>

    <div class="app"><div class="art sticker">
      <i>{MARK}</i>
      <div style="font-weight:800;color:#6F5B3E" class="ar">أحسنت!<span class="en" style="color:#7A6A56">Well done</span></div>
    </div><div class="cap">Completion sticker — clay ground, mark in a white disc</div></div>
  </div>
</section>

<section>
  <h2>Marks considered</h2>
  <p>Six generated explorations, kept so the reasoning is visible rather than lost. They are
  exploration, not candidates: the proposal above is hand-drawn on an 8-unit grid, which is the
  one asset where provenance has to be unambiguous.</p>
  <div class="exs">{explorations}</div>
</section>

<section>
  <h2>What to test on 7 September</h2>
  <p>Show the six marks on one card, no colour, no name, and ask what kind of company each
  sounds like <i>before</i> saying what yours does. Then the disqualifying question: is there any
  of these you would not buy from? Negative reactions are far more diagnostic than preferences.</p>
  <p>Two specific questions this system cannot answer on its own:</p>
  {lst([
    "Does the mark read as a page, or as a chart? The interior stroke is confident, which is the point, but confidence and 'analytics icon' are neighbours.",
    "Does palm green read as warm or as institutional? It anchors the system, and the brief warns against ceremonial-only associations.",
  ])}
</section>

</div></body></html>"""

    out = HERE / "brand-guidelines.html"
    out.write_text(html, encoding="utf-8")
    print(f"Wrote {out.relative_to(BUSINESS.parent)}  ({len(html)//1024} KB)")
    pdf = HERE / "brand-guidelines.pdf"
    if render_pdf(out, pdf):
        print(f"Wrote {pdf.relative_to(BUSINESS.parent)}  ({pdf.stat().st_size//1024} KB)")


if __name__ == "__main__":
    build()
