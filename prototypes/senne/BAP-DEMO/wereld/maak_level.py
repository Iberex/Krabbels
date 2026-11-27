# Gebruik: python maak_level.py <map> <nummer> <frameOffset> <bg-json>
# Rekent de twee Figma-exports (pagina grijs 245 en pagina zwart) om naar transparante PNG's en maakt levelN.json.
import sys, json, os
import numpy as np
from PIL import Image
map_, n, fo = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
bg = json.loads(sys.argv[4])
os.chdir(map_)
for k in sorted(f for f in os.listdir(".") if f.endswith("_k.png")):
    name = k[:-6]
    g = np.array(Image.open(name + ".png").convert("RGB")).astype(np.float32)
    b = np.array(Image.open(k).convert("RGB")).astype(np.float32)
    a = np.clip(1 - (g - b).mean(axis=2) / 245.0, 0, 1)
    col = np.where(a[..., None] > 0.003, b / np.maximum(a[..., None], 0.003), 0)
    Image.fromarray(np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)).save(name + ".png", optimize=True)
    os.remove(k)
tegels = len([f for f in os.listdir(".") if f.startswith("grond_")])
cat = np.concatenate([np.array(Image.open(f"grond_{i}.png"))[..., 3] for i in range(tegels)], axis=1)
W = cat.shape[1]
top = []
for x in range(0, W, 2):
    idx = np.where(cat[300:, x] > 230)[0]
    top.append(int(idx[0] + 300) if len(idx) else -1)
sm = []
for i in range(len(top)):
    w = top[max(0, i - 2):i + 3]
    if sum(1 for t in w if t == -1) >= 3: sm.append(-1)
    else: sm.append(min(t for t in w if t != -1))
spawn = next(i * 2 for i, t in enumerate(sm) if t != -1 and i * 2 > 150)
json.dump({"naam": f"Level {n}", "breedte": W, "hoogte": 1080, "frameOffset": fo, "camMin": 30, "stap": 2,
           "tegels": tegels, "tegelBreedte": W // tegels, "bg": bg, "spawn": {"x": 150}, "top": sm},
          open(f"../../level{n}.json", "w"), separators=(",", ":"))
gaps = []; ins = False
for i, t in enumerate(sm):
    if t == -1 and not ins: s = i * 2; ins = True
    if t != -1 and ins: gaps.append((s, i * 2)); ins = False
print("breedte", W, "gaten", gaps)
