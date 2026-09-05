# Generated line art

Twenty SVG coloring sheets generated from `../sheets.json`.

| | |
|---|---|
| `build_prompts.py` | Derives one prompt per sheet from the sheet data. Style constant, density from difficulty. |
| `sheets/*.svg` | The generated artwork — editable vector, not raster |
| `ASSESSMENT.md` | **Read this.** Sheet-by-sheet verdict: 11 usable as stimuli, 9 needing redraw. |

**Status: research stimuli and art direction, not production art.** Sheets 12 and 13 carry
invented motifs where the content plan requires reference-based work, four named heritage sites
are architecturally wrong, and rights for machine-generated artwork in a product being sold are
unresolved. `../illustrator-brief.md` stands.

Why SVG matters: the output is editable vector, so a designer can correct the roshan geometry on
sheet 9 or the strata on sheet 4 directly rather than starting over — and it scales to print
without resolution loss, which is what `../printer-brief.md` specifies.

```bash
python3 business/02-product/prototype/build_prototype.py --mode art   # → prototype-art.pdf
```
