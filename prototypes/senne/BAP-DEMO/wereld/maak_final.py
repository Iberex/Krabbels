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
LEVEL1_X = 7650          # zo ver schuiven de modellen van level 1 op (gras begint in Figma op x 7650)


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

# ---------------------------------------------------------------- waar je kan staan (x0, x1, loopvlak)
# "achterTot": een hoog blok dat achter een lager platform begint (daar staat de ladder voor);
# tot die x is het geen muur, zodat je eronder kan doorlopen naar de ladder.
VLAKKEN = [
    # tutorial
    {"x0": 0, "x1": 1920, "y": 975}, {"x0": 1920, "x1": 2490, "y": 975}, {"x0": 2790, "x1": 3360, "y": 975},
    {"x0": 3660, "x1": 4230, "y": 855}, {"x0": 4530, "x1": 7140, "y": 975}, {"x0": 5160, "x1": 5340, "y": 765},
    {"x0": 6840, "x1": 7680, "y": 735, "achterTot": 7140},
    # level 1
    {"x0": 7650, "x1": 8250, "y": 735}, {"x0": 8550, "x1": 10470, "y": 735},
    {"x0": 10170, "x1": 12090, "y": 495, "achterTot": 10470}, {"x0": 12390, "x1": 14010, "y": 615},
    {"x0": 14310, "x1": 14730, "y": 615}, {"x0": 15030, "x1": 16950, "y": 735},
    {"x0": 16650, "x1": 17280, "y": 495, "achterTot": 16950},
]
# de tekeningen waar je over loopt of klimt
BRUGGEN = [{"x": 2490, "y": 975}, {"x": 8250, "y": 735}, {"x": 14010, "y": 615}]          # 300 breed, 60 hoog
HELLINGEN = [[3360, 975, 3660, 855], [4230, 855, 4530, 975], [12090, 495, 12390, 615], [14730, 615, 15030, 735]]
LADDERS = [{"x": 6985, "boven": 735, "onder": 975}, {"x": 10315, "boven": 495, "onder": 735},
           {"x": 16795, "boven": 495, "onder": 735}]
json.dump({"naam": "Krabbels · level 1", "breedte": BREEDTE, "hoogte": 1080, "camMin": 0,
           "spawn": {"x": 150}, "overgang": 7660, "level1x": LEVEL1_X, "deur": {"x0": 16950, "x1": 17130},
           "tegels": 9, "tegelBreedte": 1920, "vlakken": VLAKKEN, "bruggen": BRUGGEN, "hellingen": HELLINGEN,
           "ladders": LADDERS},
          open(W_DIR + "/final.json", "w"), separators=(",", ":"))
print("final.json geschreven")
