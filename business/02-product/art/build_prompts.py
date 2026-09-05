#!/usr/bin/env python3
"""Derive one image-generation prompt per sheet from sheets.json.

The prompts live here, next to the sheet data, so they are reviewable, reproducible and
cannot drift from the content plan. Generation itself happens through the image tool; this
script only emits the prompts and the manifest.

Style is held constant across all twenty so the pad reads as one pad. Density tracks each
sheet's difficulty rating, which is what makes the difficulty icons honest.

Run:  python3 business/02-product/art/build_prompts.py            # print prompts
      python3 business/02-product/art/build_prompts.py --json     # manifest for the tool call
"""

import argparse
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
PRODUCT = HERE.parent

STYLE = (
    "Black and white line art coloring book page for children aged 5 to 8. "
    "Clean bold black outlines only, uniform line weight, no shading, no grey tones, "
    "no cross-hatching, no colour fill, no text or lettering anywhere, pure white background, "
    "closed shapes suitable for colouring in, generous white margin. "
)

# Density language per difficulty rating, so the printed difficulty icons mean something.
DENSITY = {
    0: "Almost empty page: only a decorative border, the centre left completely blank. ",
    1: "Very simple: a few large generous shapes, minimal background detail, easy for a five-year-old. ",
    2: "Moderate detail: a clear main subject with a simple supporting background. ",
    3: "Densely detailed scene filling the whole page, many separate small shapes to colour. ",
}

# Subject prompts. Written from the art direction in sheets.json, expanded with the concrete
# visual description a generator needs. Kept deliberately plain: where a real craft tradition
# or a specific building is involved, the description stays generic rather than inventing
# motif detail, because an invented motif is the failure mode the content plan bans.
SUBJECTS = {
    1: "A single Arabian oryx standing in profile on open desert ground, long straight horns, "
       "calm posture, low sand dunes suggested behind it, a few simple desert plants at its feet.",
    2: "Three date palm trees of different heights with heavy hanging bunches of dates, "
       "long separated frond strokes a child can colour one by one, a low woven basket at the base.",
    3: "A dense palm grove seen from inside, tall palms overhead, a narrow water channel running "
       "through the foreground, two small figures walking along the channel.",
    4: "A dramatic desert cliff edge in strong horizontal bands of rock strata, a wide empty sky "
       "above, one tiny figure standing well back from the edge for scale.",
    5: "An underwater coral reef packed with coral heads, sea fans, and many different fish of "
       "varying sizes swimming among them, filling the entire page.",
    6: "A mangrove shoreline with wading birds standing in shallow water, one bird mid-step with "
       "wings half open, a single gazelle standing at the treeline behind.",
    7: "A rose bush in full bloom in the foreground with many open roses, terraced hillside fields "
       "behind, two hands picking a single rose into a woven basket.",
    8: "A hillside village of stacked stone tower houses rising up a slope, each storey banded with "
       "horizontal decorative stripes, small square windows in a repeating rhythm.",
    9: "The tall facade of a traditional Hejazi coral-stone house, three storeys of carved wooden "
       "bay windows that project outward from the wall like wooden boxes, each with a latticed "
       "screen front, a simple wooden door at street level.",
    10: "Thick mud-brick walls of an old desert town, stepped triangular parapets along the top, "
        "small triangular ventilation openings in the walls, date palms rising behind.",
    11: "A single large tomb facade carved directly into a free-standing sandstone rock outcrop in "
        "the desert, a simple doorway at its base, one bird perched on the top for scale.",
    12: "An interior wall covered floor to ceiling in bold geometric painted patterns made of "
        "repeating triangles, chevrons and bands, with a woman's hand at the edge holding a brush "
        "mid-stroke. Pattern only, no pictorial imagery.",
    13: "A low ground loom with a partly woven band of cloth stretched across it, the geometric "
        "woven stripe pattern running off the edge of the page, a spindle and ball of wool beside it.",
    14: "A craft workbench holding clay pots at three stages of making, coiled woven palm-frond "
        "baskets and mats stacked beside them, two hands shaping a pot on the bench.",
    15: "A tall long-spouted Arabic coffee pot on a tray with several small handleless cups arranged "
        "around it and a dish of dates beside them, seen from slightly above.",
    16: "A lively covered market street with wooden stalls, open sacks of spices in the foreground, "
        "rolls of folded fabric, stacked brass pots, hanging woven baskets overhead, and shoppers of "
        "different ages walking between the stalls.",
    17: "A falcon at rest perched on a gloved hand, wings folded, seen in profile with clear feather "
        "shapes, open sky behind, a second falcon flying small in the distance.",
    18: "A modern city skyline of clean geometric tower blocks, a raised metro train crossing the "
        "foreground on a viaduct, street trees and small figures walking at ground level.",
    19: "Two astronauts floating inside a space station module surrounded by equipment panels, a "
        "large round window showing the curve of Earth below.",
    20: "An empty rectangular decorative border frame made of simple repeating geometric shapes, "
        "with the entire centre of the page left completely blank and white.",
}


def build():
    sheets = json.loads((PRODUCT / "sheets.json").read_text(encoding="utf-8"))["sheets"]
    out = []
    for s in sheets:
        n = s["n"]
        out.append({
            "index": n,
            "sheet": n,
            "title_en": s["en"],
            "title_ar": s["ar"],
            "difficulty": s["difficulty"],
            "pillar": s["pillar"],
            "prompt": STYLE + DENSITY[s["difficulty"]] + "Subject: " + SUBJECTS[n],
            "verify": s["verify"],
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit the manifest as JSON")
    ap.add_argument("--only", help="comma-separated sheet numbers")
    args = ap.parse_args()

    items = build()
    if args.only:
        want = {int(x) for x in args.only.split(",")}
        items = [i for i in items if i["sheet"] in want]

    if args.json:
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return

    for i in items:
        dots = "●" * i["difficulty"] if i["difficulty"] else "○"
        print(f"\n--- Sheet {i['sheet']:>2} · {i['title_en']} · {dots}")
        print(i["prompt"])


if __name__ == "__main__":
    main()
