"""Subsets the site fonts to the characters Nuskha actually shows, and builds the EPUB font.

Sources are the full fonts from github.com/google/fonts (downloaded to .cache/fonts). The
@fontsource "arabic" files can't be used: they lack «)» and «[», which breaks bracket
mirroring in right-to-left text. The characters kept are every character in
public/data/catalog.json and in src/, plus digits and punctuation. Shaping features are
kept, so ligatures and mark positioning still work.

    python3 scripts/build-fonts.py      (needs fontTools and brotli)

Re-run after the catalog is refreshed, so new titles don't fall back to a system font.

The EPUB font (public/fonts/Amiri-Regular.ttf) is Amiri with every Arabic letter and all its
OpenType features, but without the Latin, Greek and Cyrillic the books don't use. It stays a TTF:
older readers (Kindle, Adobe) don't read woff2.
"""

import json
import re
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "fonts"
OUT = ROOT / "src" / "assets" / "fonts"
LICENSES = ROOT / "public" / "fonts"
GOOGLE_FONTS = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# Always included: ASCII punctuation and digits, «», Arabic-Indic digits, Arabic punctuation, ۞,
# ZWNJ/ZWJ/bidi marks, dashes, …, ﴾﴿, ﷺ ﷻ ﷽ (in volume labels). Latin letters only in the text font (Amiri sets Arabic titles).
PUNCT = "U+0020-0040,U+005B-0060,U+007B-007E,U+00A0,U+00AB,U+00BB,U+060C,U+061B,U+061F,U+0660-066D,U+06DE,U+200C-200F,U+2013,U+2014,U+2026,U+FD3E,U+FD3F,U+FDFA,U+FDFB,U+FDFD"
LATIN = "U+0041-005A,U+0061-007A"

# output file: (source path in google/fonts, variable-font axes to pin, code points always kept)
FONTS = {
    "amiri-400.woff2": ("amiri/Amiri-Regular.ttf", None, PUNCT),
    "noto-naskh-arabic-400.woff2": ("notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf", {"wght": 400}, f"{PUNCT},{LATIN}"),
}
# Arabic blocks, presentation forms, punctuation, digits, Latin for numbers and the odd word.
BOOK_FONT = "U+0020-007E,U+00A0-00FF,U+0600-06FF,U+0750-077F,U+08A0-08FF,U+2000-206F,U+FB50-FDFF,U+FE70-FEFF,U+25CC"
LICENSE_FILES = {"OFL-Amiri.txt": "amiri/OFL.txt", "OFL-NotoNaskhArabic.txt": "notonaskharabic/OFL.txt"}


def fetch(path: str) -> Path:
    local = CACHE / path.replace("%5B", "[").replace("%5D", "]")
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {path}")
        urllib.request.urlretrieve(f"{GOOGLE_FONTS}/{path}", local)
    return local


def catalog_text() -> str:
    c = json.loads((ROOT / "public/data/catalog.json").read_text("utf-8"))
    parts = [name for _, name in c["cats"]]
    for key in ("name", "fullName", "deathLabel"):
        parts += c["authors"][key]
    for key in ("title", "editor", "publisher", "edition"):
        parts += c["books"][key]
    return "".join(parts)


def ui_text() -> str:
    files = [ROOT / "index.html", *(ROOT / "src").rglob("*.svelte"), *(ROOT / "src").rglob("*.ts")]
    return "".join(re.sub(r"[\x00-\x7f]", "", f.read_text("utf-8")) for f in files)


def main() -> None:
    text = "".join(sorted(set(catalog_text() + ui_text())))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, axes, extra) in FONTS.items():
        opts = subset.Options()
        # fontTools' default list (init/medi/fina, rlig, mark, kern, …) without fractions;
        # no stylistic sets or swashes, which Nuskha doesn't use.
        opts.layout_features = [f for f in opts.layout_features if f not in ("frac", "numr", "dnom")]
        opts.flavor = "woff2"
        opts.hinting = False
        opts.desubroutinize = True
        opts.name_IDs = ["*"]  # keep the copyright and licence names (OFL)
        font = TTFont(fetch(src))
        if axes:
            font = instancer.instantiateVariableFont(font, axes)
        s = subset.Subsetter(opts)
        s.populate(text=text, unicodes=subset.parse_unicodes(extra))
        s.subset(font)
        out = OUT / name
        subset.save_font(font, str(out), opts)
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB")

    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = TTFont(fetch(FONTS["amiri-400.woff2"][0]))
    s = subset.Subsetter(opts)
    s.populate(unicodes=subset.parse_unicodes(BOOK_FONT))
    s.subset(font)
    out = LICENSES / "Amiri-Regular.ttf"
    LICENSES.mkdir(parents=True, exist_ok=True)
    font.save(str(out))
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB (EPUB font)")

    LICENSES.mkdir(parents=True, exist_ok=True)
    for name, src in LICENSE_FILES.items():
        (LICENSES / name).write_bytes(fetch(src).read_bytes())


if __name__ == "__main__":
    main()
