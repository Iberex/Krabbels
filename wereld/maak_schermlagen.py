# Per levelscherm (1920 px): lucht + drie achtergrondlagen, met papiertextuur en diepte.
# Bronnen: de laagbeelden per level (assets/L1-L5), zon/wolken/bloemen (bron/gW.png, kW.png) en bron/papier.jpg.
# Elke laag is een eigen vel papier: eigen kreuk en korrel, een zachte slagschaduw op wat erachter ligt,
# en hoe verder weg, hoe meer ze naar de luchtkleur toe gaat (egaal, geen verloop).
import json, os
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
W = os.path.dirname(os.path.abspath(__file__))

KREUK = 1.25       # hoe sterk de kreuken van het papier te zien zijn
KORREL = 0.016    # fijne korrel
NEVEL = {"10": 0.14, "9": 0.06, "8": 0.0}                  # richting luchtkleur
SCHADUW = {"10": (12, 16, 0.26), "9": (18, 22, 0.34), "8": (24, 26, 0.40)}  # (omlaag px, vaagte, sterkte)

papier = np.array(Image.open(f"{W}/bron/papier.jpg").convert("L").resize((1920, 1280))).astype(np.float32)[:1080]
kreuk = (papier - np.array(Image.fromarray(papier.astype(np.uint8)).filter(ImageFilter.GaussianBlur(60))).astype(np.float32)) / 255
rng = np.random.default_rng(7)


def textuur(rgb, zaad):
    r = np.random.default_rng(zaad)
    k = np.roll(kreuk, (int(r.integers(1080)), int(r.integers(1920))), (0, 1))
    if zaad % 2:
        k = k[:, ::-1]
    korrel = np.array(Image.fromarray((r.random((1080, 1920)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32) / 255 - 0.5
    return np.clip(rgb * (1 + KREUK * k + KORREL * 4 * korrel)[..., None], 0, 255)


def laag_af(laag, naam, luchtkleur, zaad):
    a = np.array(laag).astype(np.float32)
    rgb, alfa = a[..., :3], a[..., 3] / 255
    rgb = rgb * (1 - NEVEL[naam]) + luchtkleur * NEVEL[naam]
    rgb = textuur(rgb, zaad)
    # slagschaduw van dit vel op alles erachter
    dy, vaag, sterk = SCHADUW[naam]
    s = Image.fromarray((alfa * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(vaag))
    s = np.roll(np.array(s).astype(np.float32) / 255, dy, axis=0)
    s[:dy] = 0
    s *= sterk
    uit_a = alfa + s * (1 - alfa)
    uit_rgb = rgb * (alfa / np.maximum(uit_a, 1e-4))[..., None]       # de schaduw zelf is zwart
    return Image.fromarray(np.dstack([uit_rgb, uit_a * 255]).astype(np.uint8))


g = np.array(Image.open(f"{W}/bron/gW.png").convert("RGB")).astype(np.float32)
k = np.array(Image.open(f"{W}/bron/kW.png").convert("RGB")).astype(np.float32)
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
    lucht = np.array(lucht.crop((x, 0, x + 1920, 1080))).astype(np.float32)
    luchtkleur = lucht.reshape(-1, 3).mean(axis=0)
    Image.fromarray(textuur(lucht, 100 + n).astype(np.uint8)).save(f"{W}/assets/achtergrond/L{n}_lucht.jpg", quality=90)
    for i, (naam, bg) in enumerate(zip(("10", "9", "8"), info["bg"])):          # bg[0] is de verste laag
        im = Image.open(f"{W}/assets/L{n}/{bg['bestand']}").convert("RGBA").resize((bg["breedte"], 1080))
        laag = Image.new("RGBA", (1920, 1080))
        x = bg["x0"]
        laag.paste(im.crop((max(0, -x), 0, max(0, -x) + 1920 - max(0, x), 1080)), (max(0, x), 0))
        if naam == "8" and n >= 2:
            j = n - 2
            laag.alpha_composite(wolken.crop(((j % 2) * 1920, (j // 2) * 1080, (j % 2) * 1920 + 1920, (j // 2) * 1080 + 1080)))
        laag_af(laag, naam, luchtkleur, n * 10 + i).save(f"{W}/assets/achtergrond/L{n}_{naam}.png", optimize=True)
    print("level", n, "klaar")
