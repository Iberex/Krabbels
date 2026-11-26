# Per levelscherm (1920 px): lucht + drie achtergrondlagen (met zon/wolken/bloemen op de voorste), uit de bestaande exports
import json
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
import os, sys
W = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else "."   # map met gW.png / kW.png (zon, wolken, bloemen op grijs en zwart)
g = np.array(Image.open(f"{SRC}/gW.png").convert("RGB")).astype(np.float32)
k = np.array(Image.open(f"{SRC}/kW.png").convert("RGB")).astype(np.float32)
a = np.clip(1 - (g - k).mean(axis=2) / 245.0, 0, 1)
c = np.where(a[..., None] > 0.003, k / np.maximum(a[..., None], 0.003), 0)
wolken = Image.fromarray(np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8))
for n in range(1, 6):
    info = json.load(open(f"{W}/level{n}.json"))
    b = info["backdrop"]
    bestand = "backdrop.png" if n == 2 else b["bestand"]
    bw = 3840 if n == 2 else b.get("breedte", 1920)
    lucht = Image.open(f"{W}/assets/L{n}/{bestand}").convert("RGB").resize((bw, 1080))
    x = -b.get("x0", 0)
    lucht = lucht.crop((x, 0, x + 1920, 1080))
    lucht.save(f"{W}/assets/achtergrond/L{n}_lucht.jpg", quality=90)
    samen = lucht.convert("RGBA")
    for naam, bg in zip(("10", "9", "8"), info["bg"]):          # bg[0] is de verste laag
        im = Image.open(f"{W}/assets/L{n}/{bg['bestand']}").convert("RGBA").resize((bg["breedte"], 1080))
        laag = Image.new("RGBA", (1920, 1080))
        x = bg["x0"]
        laag.paste(im.crop((max(0, -x), 0, max(0, -x) + 1920 - max(0, x), 1080)), (max(0, x), 0))
        if naam == "8" and n >= 2:
            i = n - 2
            laag.alpha_composite(wolken.crop(((i % 2) * 1920, (i // 2) * 1080, (i % 2) * 1920 + 1920, (i // 2) * 1080 + 1080)))
        laag.save(f"{W}/assets/achtergrond/L{n}_{naam}.png", optimize=True)
        samen.alpha_composite(laag)
print("klaar")
