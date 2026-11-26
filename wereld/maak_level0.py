import json, os, sys, shutil
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src = sys.argv[1]
W_DIR = os.path.dirname(os.path.abspath(__file__))
out = W_DIR + "/assets/L0"
os.makedirs(out, exist_ok=True)

def vrij(blad):
    g = np.array(Image.open(f"{src}/g{blad}.png").convert("RGB")).astype(np.float32)
    k = np.array(Image.open(f"{src}/k{blad}.png").convert("RGB")).astype(np.float32)
    a = np.clip(1 - (g - k).mean(axis=2) / 245.0, 0, 1)
    c = np.where(a[..., None] > 0.003, k / np.maximum(a[..., None], 0.003), 0)
    return np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)

A, B = vrij("A"), vrij("B")
tegel = lambda blad, kol, t: Image.fromarray(blad[t * 1080:(t + 1) * 1080, kol * 1920:(kol + 1) * 1920])
for t in range(3):
    tegel(A, 0, t).save(f"{out}/grond_{t}.png", optimize=True)
    Image.new("RGBA", (1920, 1080)).save(f"{out}/achter_{t}.png")
for naam, blad, kol in (("bg1", A, 1), ("bg2", B, 0), ("bg3", B, 1)):
    im = Image.new("RGBA", (5760, 1080))
    for t in range(3):
        im.paste(tegel(blad, kol, t), (t * 1920, 0))
    im.save(f"{out}/{naam}.png", optimize=True)
# lucht: grijs papier met 50% #333333 erover, zoals in Figma
bd = np.array(Image.open(f"{src}/bd.png").convert("RGB")).astype(np.float32)
Image.fromarray((bd * 0.5 + 0x33 * 0.5).astype(np.uint8)).save(f"{out}/backdrop.png", optimize=True)

# ondergrond uit de blokken zelf
BLOKKEN = [(0, 750, 570), (870, 750, 570), (1740, 630, 570), (2610, 750, 2610), (4920, 510, 840), (3240, 540, 180)]
top = []
for x in range(0, 5760, 2):
    y = [by for bx, by, bw in BLOKKEN if bx <= x < bx + bw]
    top.append(min(y) if y else -1)
bg = [{"bestand": f"bg{i}.png", "x0": 0, "breedte": 5760, "snelheid": s, "schaal": 1}
      for i, s in ((3, 0.1), (2, 0.3), (1, 0.5))]
json.dump({"naam": "Tutorial", "breedte": 5760, "hoogte": 1080, "frameOffset": 0, "camMin": 0, "stap": 2,
           "tegels": 3, "tegelBreedte": 1920, "backdrop": {"bestand": "backdrop.png", "snelheid": 0},
           "bg": bg, "spawn": {"x": 150}, "plafond": [{"x0": 4110, "x1": 4290, "y": 600}],
           "modellen": ["voorgrond", "decor"], "top": top},
          open(f"{W_DIR}/level0.json", "w"), separators=(",", ":"))
print("ok")
