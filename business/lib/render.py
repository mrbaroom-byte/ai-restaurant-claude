"""Shared rendering helpers: Arabic web fonts and HTML-to-PDF.

Both the product prototype and the validation field pack need the same two things — an
Arabic-capable font embedded in the document so output does not depend on the machine
rendering it, and a Chromium that turns page-sized HTML into a real PDF. This module holds
that once.

Fonts are Tajawal, under the SIL Open Font License. They are fetched into a gitignored cache
at build time rather than vendored, so the repo carries no font binaries.
"""

import base64
import pathlib
import sys
import urllib.request

FONTS = {
    "Tajawal-Regular.ttf": "https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1rzY.ttf",
    "Tajawal-Bold.ttf": "https://fonts.gstatic.com/s/tajawal/v12/Iurf6YBj_oCad4k1l4qkLrY.ttf",
}
FONT_WEIGHTS = {"Tajawal-Regular.ttf": 400, "Tajawal-Bold.ttf": 700}
MIN_FONT_BYTES = 10_000

ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def ensure_fonts(cache_dir):
    """Download the fonts into cache_dir if they are not already there. Returns the path."""
    cache = pathlib.Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    for name, url in FONTS.items():
        path = cache / name
        if path.exists() and path.stat().st_size > MIN_FONT_BYTES:
            continue
        print(f"  fetching {name} …")
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
        except Exception as exc:
            sys.exit(f"Could not fetch {name}: {exc}\n"
                     f"Download it manually into {cache} and re-run.")
        if len(data) < MIN_FONT_BYTES:
            sys.exit(f"{name} came back too small ({len(data)} bytes) — that is an error page, "
                     f"not a font. Check network access and re-run.")
        path.write_bytes(data)
    return cache


def font_face_css(cache_dir):
    """Base64-embedded @font-face rules, so the PDF renders identically anywhere."""
    cache = pathlib.Path(cache_dir)
    rules = []
    for name, weight in FONT_WEIGHTS.items():
        b64 = base64.b64encode((cache / name).read_bytes()).decode()
        rules.append(
            "@font-face{font-family:'Tajawal';font-style:normal;font-weight:%d;"
            "src:url(data:font/ttf;base64,%s) format('truetype');}" % (weight, b64)
        )
    return "\n".join(rules)


def find_chromium():
    """Locate a Chromium binary without downloading one.

    Playwright's bundled-browser path is version-pinned and often does not match the build
    that is actually installed, so glob for it rather than hard-coding a version.
    """
    roots = ("/opt/pw-browsers", str(pathlib.Path.home() / ".cache/ms-playwright"))
    patterns = ("chromium-*/chrome-linux/chrome",
                "chromium_headless_shell-*/chrome-linux/headless_shell")
    for root in roots:
        base = pathlib.Path(root)
        if not base.is_dir():
            continue
        for pattern in patterns:
            found = sorted(base.glob(pattern))
            if found:
                return str(found[-1])
    return None


def render_pdf(html_path, pdf_path):
    """Render a page-sized HTML file to PDF at its own @page size.

    Returns True on success. Failure is not fatal — the HTML is still printable by hand —
    so this reports what to do instead rather than raising.
    """
    manual = ("Open the HTML and print to PDF at A4, 100% scale, no margins.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(f"  playwright not installed — skipping PDF. {manual}")
        return False

    exe = find_chromium()
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        except Exception as exc:
            print(f"  could not launch Chromium ({exc.__class__.__name__}) — skipping PDF. "
                  f"{manual}")
            return False
        page = browser.new_page()
        page.goto(pathlib.Path(html_path).resolve().as_uri(), wait_until="networkidle")
        page.pdf(path=str(pdf_path), format="A4", print_background=True,
                 margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                 prefer_css_page_size=True)
        browser.close()
    return True
