# Gebruik: python maak_final.py <map met de Figma-exports van final_foreground>
# Rekent de exports (pagina grijs 245 en pagina zwart) om naar transparante PNG's in assets/F/,
# maakt de drie wiggle-versies van het logo en schrijft final.json.
import json, os, sys
import numpy as np
from PIL import Image
import cv2
Image.MAX_IMAGE_PIXELS = None
src = sys.argv[1]
W_DIR = os.path.dirname(os.path.abspath(__file__))
out = W_DIR + "/assets/F"
os.makedirs(out, exist_ok=True)
BREEDTE = 17280
LEVEL1_X = 7620          # zo ver schuift level 1 op in final_foreground


def vrij(naam):
    g = np.array(Image.open(f"{src}/g{naam}.png").convert("RGB")).astype(np.float32)
    k = np.array(Image.open(f"{src}/k{naam}.png").convert("RGB")).astype(np.float32)
    a = np.clip(1 - (g - k).mean(axis=2) / 245.0, 0, 1)
    c = np.where(a[..., None] > 0.003, k / np.maximum(a[..., None], 0.003), 0)
    return np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)


lijst = [(s, t) for s in ("blok", "gids") for t in range(9)]
bladen = [vrij(f"S{i}") for i in range(3)]
for n, (soort, t) in enumerate(lijst):
    blad, j = bladen[n // 6], n % 6
    y, x = (j // 2) * 1080, (j % 2) * 1920
    Image.fromarray(blad[y:y + 1080, x:x + 1920]).save(f"{out}/{soort}_{t}.png", optimize=True)

ex = vrij("X")
rand = ex[0:1080, 1400:1560]                      # gescheurde papierstrook, x = 7600
Image.fromarray(rand).save(f"{out}/rand.png", optimize=True)
logo = ex[0:320, 0:1280]                          # logo, linksboven op (320, 200)


def wiebel(beeld, zaad, sterkte=2.4, cel=13):
    """zelfde 'kokende lijn' als de Krabbel: elke versie wiebelt net anders."""
    h, w = beeld.shape[:2]
    rng = np.random.default_rng(zaad)
    veld = lambda: cv2.resize(rng.uniform(-1, 1, (h // cel + 2, w // cel + 2)).astype(np.float32), (w, h),
                              interpolation=cv2.INTER_CUBIC) * sterkte
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    voor = beeld.astype(np.float32)
    voor[..., :3] *= voor[..., 3:] / 255          # voorvermenigvuldigd, anders krijg je donkere randjes
    uit = cv2.remap(voor, xs + veld(), ys + veld(), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    a = uit[..., 3:]
    uit[..., :3] = np.where(a > 0.5, uit[..., :3] * 255 / np.maximum(a, 0.5), 0)
    return np.clip(uit, 0, 255).astype(np.uint8)


for i in range(3):
    Image.fromarray(wiebel(logo, 11 + i * 977)).save(f"{out}/logo_{i}.png", optimize=True)

# ondergrond: tutorialblokken (x, y, breedte) + de ondergrond van level 1, 7620 px opgeschoven
BLOKKEN = [(0, 975, 1920), (1920, 975, 570), (2790, 975, 570), (3660, 855, 570), (4530, 975, 2610),
           (6840, 735, 840), (5160, 765, 180)]
l1 = json.load(open(W_DIR + "/level1.json"))
top = []
for x in range(0, BREEDTE, 2):
    y = [by for bx, by, bw in BLOKKEN if bx <= x < bx + bw]
    i = (x - LEVEL1_X) // 2
    if 15 <= i < len(l1["top"]) and l1["top"][i] != -1:
        y.append(l1["top"][i])
    top.append(min(y) if y else -1)
json.dump({"naam": "Krabbels · level 1", "breedte": BREEDTE, "hoogte": 1080, "camMin": 0, "stap": 2,
           "spawn": {"x": 150}, "overgang": 7660, "level1x": LEVEL1_X, "deur": {"x0": 16950, "x1": 17130},
           "tegels": 9, "tegelBreedte": 1920, "top": top},
          open(W_DIR + "/final.json", "w"), separators=(",", ":"))
gaten, s = [], None
for i, t in enumerate(top + [0]):
    if t == -1 and s is None: s = i * 2
    if t != -1 and s is not None: gaten.append((s, i * 2)); s = None
print("gaten", gaten)
