# Generated artwork — sheet-by-sheet assessment

Twenty line-art sheets generated from the descriptions in `sheets.json` (Recraft V4.1, vector
mode, SVG output). Assessed against the seven editorial rules in `20-sheet-content-plan.md`
and the difficulty ladder.

## What this artwork is for

**Research stimuli and art direction.** It is good enough to put in front of a child and learn
something real: whether the pad holds attention, whether the difficulty ladder is right, whether
children notice the discovery prompts, which page they reach for first. That is what the
September child sessions could not test with the geometric dummy.

It also gives a commissioned illustrator something concrete to react to, which is faster than
reacting to prose.

## What it is not

**Production art.** Three reasons, in order of seriousness:

1. **Rule 5 is broken on the craft sheets.** Sheets 12 (Al-Qatt Al-Asiri) and 13 (Sadu) depict
   living craft traditions with real, documented motif vocabularies. The patterns here are
   invented geometry that *reads* as plausible. That is precisely the "invented Arabian-style
   pattern" the content plan bans, and on a brand positioned as culturally rooted it is the
   worst possible place to be approximately right.
2. **The named heritage sites are architecturally wrong** — see the table. Rijal Almaa, the
   rawasheen of Al-Balad, At-Turaif and Hegra are real, specific, photographed places. A child
   who has visited will notice.
3. **Provenance and rights are unresolved** for machine-generated artwork in a product being
   sold. That is a question for the illustrator contract and legal advice, not an assumption.

`illustrator-brief.md` stands unchanged. Commission the twenty.

---

## Verdict by sheet

### Usable as stimuli — 11 sheets

| # | Sheet | Read |
|---|-------|------|
| 1 | Arabian Oryx | Correct anatomy, generous closed shapes, good for a five-year-old. The strongest easy page. |
| 2 | Date palms | Bunches and fronds separate cleanly; the "colour each bunch differently" prompt works. |
| 5 | Red Sea reef | Excellent density. Exactly the "reward page" the plan describes. |
| 7 | Taif roses | Roses, terraces, hands and basket all present and colourable. |
| 8 | Rijal Almaa | Strong stacked-village composition and banding — but see the accuracy note below. |
| 12 | Al-Qatt Al-Asiri | Visually the best pattern page in the set. Motifs invented — see rule 5. |
| 15 | Arabic coffee | Dallah, cups and dates read correctly. Good easy page. |
| 16 | A day at the souq | Good density and figures; awning architecture is generic. |
| 17 | Falconry | Excellent falcon, clear feather shapes, glove reads correctly. |
| 19 | Toward space | Astronauts, module and Earth window all clear. |
| 20 | My Saudi Arabia | Clean border, centre genuinely blank. Exactly to spec. |

### Needs redraw — 9 sheets

| # | Sheet | What is wrong |
|---|-------|---------------|
| 3 | Al-Ahsa oasis | Tropical/coconut palms, not date palms. Wrong tree in a sheet about a date-palm oasis. |
| 4 | Edge of the World | Rock strata read as stacked pillows rather than cliff layers. The geology prompt is unsupported by the picture. |
| 6 | Farasan Islands | Generic wading birds and generic trees; mangroves not recognisable. Passable but says nothing specific. |
| 9 | Rawasheen of Al-Balad | **Flat lattice panels, not projecting wooden roshan bays.** The whole point of a roshan is that it juts out from the wall. Architecturally wrong. |
| 10 | At-Turaif, Diriyah | Reads as a generic walled compound; the stepped Najdi parapets became a spiky crown. |
| 11 | Hegra, AlUla | The carved tomb facade is lost entirely — a rounded rock with a door. The sheet's fact is about carving, so the picture contradicts it. |
| 13 | Sadu weaving | The ground loom reads as a table. Weaving barely present, motifs invented. |
| 14 | Pottery and palm weaving | Reads as a generic kitchen bench. Pottery-making not legible. |
| 18 | Riyadh today | A generic anywhere skyline with a tram. Nothing identifies Riyadh. |

**The pattern in those failures is worth noting:** the generator is good at *categories*
(an oryx, a falcon, a reef, roses) and poor at *specific named places and specific craft
traditions* — which is exactly the half of the content that carries the brand's cultural claim.
That is not a prompting problem to solve with more attempts; it is the reason the illustrator
brief asks for reference-based work.

---

## How to use this in the sprint

**Print `prototype/prototype-art.pdf` for the child sessions.** It is a real pad: Arabic-first
discovery facts, creative prompts, difficulty icons, tear-out layout, and now artwork children
can actually colour. The play-test protocol's engagement questions become answerable.

**Two adjustments to how you read the results:**

- Treat "which page did they pick first?" as a finding about *subject appeal*, which transfers
  to the real pad. Treat "was the line art too hard?" as provisional, since the final art will
  differ.
- The nine redraw sheets are still worth testing. A child disengaging from sheet 18 tells you
  something about a generic skyline, which is useful even though sheet 18 will be redrawn.

**Do not** show this artwork to a printer as production files, put it on the product page, or
use it in any paid creative. `prototype-dummy.pdf` remains the right file for paper tests, since
its density is controlled rather than incidental.

## Reproducing or extending

```bash
python3 business/02-product/art/build_prompts.py            # see the prompts
python3 business/02-product/art/build_prompts.py --json     # manifest
python3 business/02-product/prototype/build_prototype.py --mode art
```

Prompts are derived from `sheets.json`, so they cannot drift from the content plan. Style is held
constant across all twenty and density is driven by each sheet's difficulty rating — which is
what makes the printed difficulty icons honest rather than decorative.
