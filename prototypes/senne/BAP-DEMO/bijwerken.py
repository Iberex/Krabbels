#!/usr/bin/env python3
# Copies the newest version of every part of Krabbels into this website and
# adds a small "← overzicht" link to every page. Run again after a change:
#   python3 bijwerken.py
import shutil, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # the bachelorproef folder
PARTS = {
    # target folder       : source folder
    "wireframes": "3-design/wireframes/site",
    "prototypes/drawing-life": "5-demos/Drawing Life",
    "prototypes/main-game": "5-demos/Main Game",
    "prototypes/draw-and-play": "5-demos/Draw and Play",
    "testdemo": "5-demos/Testdemo",
    "demo-stijl": "5-demos/Demo-v2",
    "ux-demo": "5-demos/UX-demo",
    "wereld": "5-demos/Wereld",
}
SKIP = shutil.ignore_patterns(".git", ".DS_Store", "v2", "*.zip", ".claude")

LINK = (
    '<a class="krabbels-overzicht" href="{up}" title="Terug naar het overzicht">← overzicht</a>'
    '<style>.krabbels-overzicht{{position:fixed;left:12px;bottom:12px;z-index:99999;'
    "font:600 13px/1 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;"
    "background:rgba(34,34,34,.72);padding:8px 12px;border-radius:999px;text-decoration:none;opacity:.55}}"
    ".krabbels-overzicht:hover{{opacity:1}}</style>"
)

for target, source in PARTS.items():
    src, dst = ROOT / source, HERE / target
    if not src.exists():
        print("niet gevonden:", source)
        continue
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=SKIP)
    up = "../" * (target.count("/") + 1)
    for page in dst.glob("*.html"):
        html = page.read_text(encoding="utf-8")
        if "krabbels-overzicht" not in html:
            html = re.sub(r"</body>", LINK.format(up=up) + "\n</body>", html, count=1, flags=re.I)
            if "krabbels-overzicht" not in html:  # page without </body>
                html += "\n" + LINK.format(up=up)
            page.write_text(html, encoding="utf-8")
    print("bijgewerkt:", target)
