# Zet alles wat nodig is om de demo na te bouwen in 3-design/export-demo/: beelden per scherm, losse stukken,
# 3D-modellen, level.json met alle maten en regels, en referentiefoto's. Opnieuw draaien na een wijziging.
import json, math, os, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
Image.MAX_IMAGE_PIXELS = None
W = os.path.dirname(os.path.abspath(__file__))
UIT = os.path.abspath(f"{W}/../../3-design/export-demo")
shutil.rmtree(UIT, ignore_errors=True)
for m in ("achtergrond", "voorgrond", "tekeningen", "logo", "3d", "fotos", "referentie"):
    os.makedirs(f"{UIT}/{m}")
wereld = json.load(open(f"{W}/wereld.json"))
level1 = json.load(open(f"{W}/level1.json"))
RGBA = lambda p: Image.open(p).convert("RGBA")
S = 1920
EIND = {"start": {"x": 150, "y": 442},
        "vlakken": [{"x0": 0, "x1": 790, "y": 442, "achterTot": 1920}, {"x0": 1072, "x1": 1920, "y": 559, "achterTot": 1920},
                    {"x0": 0, "x1": 572, "y": 799}, {"x0": 870, "x1": 1920, "y": 799}],
        "bruggen": [{"x": 570, "y": 799}], "hellingen": [[782, 442, 1080, 559]],
        "ladders": [{"x": 1567, "boven": 559, "onder": 799}], "ankers": [[570, 799], [870, 799], [782, 442], [1080, 559]]}


# ------------------------------------------------------------ tekeningen (zelfde vormen als in wereld.js)
def boog(x0, y0):
    stuk = [[(0, 0), (0, 0), (30, -60), (150, -60)], [(150, -60), (270, -60), (300, 0), (300, 0)]]
    uit = []
    for a, b, c, d in stuk:
        for i in range(1 if uit else 0, 21):
            t = i / 20; u = 1 - t
            m = [u**3 * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t**3 * d[k] for k in (0, 1)]
            uit.append((x0 + m[0], y0 + m[1]))
    return uit


def obstakels(w, rand):
    """alle brug-, helling- en laddertekeningen: (naam, soort, [lijnen met punten])"""
    anker = lambda x, y: (x, y if x < rand else y + 5)
    uit = [("brug", [boog(*anker(b["x"], b["y"]))]) for b in w["bruggen"]]
    uit += [("helling", [[anker(ax, ay), anker(bx, by)]]) for ax, ay, bx, by in w["hellingen"]]
    for l in w["ladders"]:
        tut = l["x"] < rand
        kop, sport = l["boven"] + (-30 if tut else -10), l["boven"] + (19 if tut else 39)
        lijnen = [[(l["x"] + dx, kop), (l["x"] + dx, l["onder"] - 5)] for dx in (-60, 60)]
        lijnen += [[(l["x"] - 70, sport + 60 * i), (l["x"] + 70, sport + 60 * i)] for i in range(4)]
        uit.append(("ladder", lijnen))
    return sorted(uit, key=lambda o: min(p[0] for lijn in o[1] for p in lijn))


def doek(punten, marge=32):
    xs, ys = [p[0] for p in punten], [p[1] for p in punten]
    x0, y0 = int(min(xs)) - marge, int(min(ys)) - marge
    return x0, y0, int(max(xs)) + marge - x0, int(max(ys)) + marge + 8 - y0


def met_schaduw(beeld, dy=5, vaag=5, sterk=0.28):
    a = beeld.getchannel("A").filter(ImageFilter.GaussianBlur(vaag)).point(lambda v: int(v * sterk))
    s = Image.new("RGBA", beeld.size, (0, 0, 0, 0)); zwart = Image.new("RGBA", beeld.size, (0, 0, 0, 255))
    s.paste(zwart, (0, dy), a)
    s.alpha_composite(beeld)
    return s


def sjabloon(lijnen, x0, y0, bw, bh, f=3):
    """wit papieren strookje met stippen: dit staat er al voor Puntje tekent"""
    im = Image.new("RGBA", (bw * f, bh * f)); d = ImageDraw.Draw(im)
    P = lambda p: ((p[0] - x0) * f, (p[1] - y0) * f)
    rond = lambda p, r, kleur: d.ellipse([P(p)[0] - r * f, P(p)[1] - r * f, P(p)[0] + r * f, P(p)[1] + r * f], fill=kleur)
    for punten in lijnen:
        d.line([P(p) for p in punten], fill="#f4f3ef", width=20 * f, joint="curve")
        for p in (punten[0], punten[-1]):
            rond(p, 10, "#f4f3ef")
    for punten in lijnen:
        over = 0
        for (ax, ay), (bx, by) in zip(punten, punten[1:]):
            l = math.hypot(bx - ax, by - ay)
            while over <= l:
                rond((ax + (bx - ax) * over / l, ay + (by - ay) * over / l), 5, "#2e2e2e")
                over += 25
            over -= l
    return met_schaduw(im.resize((bw, bh), Image.LANCZOS))


def getekend(lijnen, x0, y0, bw, bh, zaad, f=3):
    """de potloodlijn die Puntje tekent (daar loop en klim je over)"""
    a = zaad
    def r():
        nonlocal a
        a = (a * 16807) % 2147483647
        return a / 2147483647
    im = Image.new("RGBA", (bw * f, bh * f)); d = ImageDraw.Draw(im)
    P = lambda x, y: ((x - x0) * f, (y - y0) * f)
    for punten in lijnen:
        d.line([P(*p) for p in punten], fill=(51, 51, 51, 255), width=11 * f, joint="curve")
        for (ax, ay), (bx, by) in zip(punten, punten[1:]):
            l = math.hypot(bx - ax, by - ay) or 1
            nx, ny = -(by - ay) / l, (bx - ax) / l
            for _ in range(int(l * 1.6)):
                t, dd = r(), (r() - 0.5) * 17
                alfa, straal = int((0.45 + r() * 0.55) * 255), 0.8 + r() * 1.7
                cx, cy = P(ax + (bx - ax) * t + nx * dd, ay + (by - ay) * t + ny * dd)
                d.ellipse([cx - straal * f, cy - straal * f, cx + straal * f, cy + straal * f], fill=(51, 51, 51, alfa))
    return im.resize((bw, bh), Image.LANCZOS)


def ankerbeeld(tutorial, f=4):
    im = Image.new("RGBA", (72 * f, 80 * f)); d = ImageDraw.Draw(im)
    rond = lambda r, kleur: d.ellipse([(36 - r) * f, (36 - r) * f, (36 + r) * f, (36 + r) * f], fill=kleur)
    rond(24 if tutorial else 14, "#333333" if tutorial else "#ff821c")
    if not tutorial:
        rond(6, "#ffe482")
    return met_schaduw(im.resize((72, 80), Image.LANCZOS))


ank = {True: ankerbeeld(True), False: ankerbeeld(False)}
ank[True].save(f"{UIT}/tekeningen/anker_tutorial.png"); ank[False].save(f"{UIT}/tekeningen/anker_level.png")


def maak_tekeningen(w, rand, voor):
    lijst, teller = [], {}
    for i, (soort, lijnen) in enumerate(obstakels(w, rand)):
        teller[soort] = teller.get(soort, 0) + 1
        naam = f"{voor}{soort}_{teller[soort]}"
        x0, y0, bw, bh = doek([p for l in lijnen for p in l])
        s, t = sjabloon(lijnen, x0, y0, bw, bh), getekend(lijnen, x0, y0, bw, bh, 11 + i * 97)
        s.save(f"{UIT}/tekeningen/{naam}_sjabloon.png"); t.save(f"{UIT}/tekeningen/{naam}_getekend.png")
        lijst.append({"naam": naam, "soort": soort, "x": x0, "y": y0, "breedte": bw, "hoogte": bh,
                      "sjabloon": f"tekeningen/{naam}_sjabloon.png", "getekend": f"tekeningen/{naam}_getekend.png",
                      "lijnen": [[[round(px, 1), round(py, 1)] for px, py in l] for l in lijnen]})
    return lijst


tek = maak_tekeningen(wereld, wereld["rand"], "")
tek_eind = maak_tekeningen(EIND, 0, "eind_")
ankers = [{"x": x, "y": y if x < wereld["rand"] else y + 5, "beeld": f"tekeningen/anker_{'tutorial' if x < wereld['rand'] else 'level'}.png"} for x, y in wereld["ankers"]]
ankers_eind = [{"x": x, "y": y + 5, "beeld": "tekeningen/anker_level.png"} for x, y in EIND["ankers"]]

# ------------------------------------------------------------ achtergronden
for i in range(4):
    shutil.copy(f"{W}/assets/achtergrond/scherm_{i}.jpg", f"{UIT}/achtergrond/scherm_{i}.jpg")
for n in range(1, 6):
    for naam in ("lucht.jpg", "10.png", "9.png", "8.png"):
        shutil.copy(f"{W}/assets/achtergrond/L{n}_{naam}", f"{UIT}/achtergrond/level{n}_{naam}")
shutil.copy(f"{W}/assets/achtergrond/eind_achter.jpg", f"{UIT}/achtergrond/eind_achter.jpg")
LAGEN_TUT = [("bg3", 0.65, [(1680, 910), (660, 345), (4977, 345)]), ("bg2", 0.75, [(1280, 880), (2700, 810), (4216, 789)]),
             ("bg1", 0.85, [(240, 1260), (2810, 1260), (4490, 1150)])]
blokken = []
for laag, snelheid, rij in LAGEN_TUT:
    for k, (x, bw) in enumerate(rij):
        bron = f"{W}/assets/achtergrond/tut_{laag}_{k}.png"
        doel = f"achtergrond/tutorialblok_{laag}_{k}.png"
        shutil.copy(bron, f"{UIT}/{doel}")
        X = x + S
        blokken.append({"beeld": doel, "x": X - 30, "y": 225, "snelheid": snelheid,
                        "camRef": max(0, min(5760, X + bw / 2 - 960))})

# ------------------------------------------------------------ voorgrond (zonder tekeningen), per scherm en als geheel
strook = Image.new("RGBA", (wereld["breedte"], 1080))
for i in range(4):
    strook.alpha_composite(RGBA(f"{W}/assets/F/blok_{i}.png"), (i * S, 0))
for soort in ("achter", "grond"):
    for i in range(level1["tegels"]):
        t = RGBA(f"{W}/assets/L1/{soort}_{i}.png")
        x = wereld["start"] + i * level1["tegelBreedte"]
        strook.alpha_composite(t.crop((0, 0, min(t.width, wereld["breedte"] - x), 1080)), (x, 0))
for i in range(9):
    strook.crop((i * S, 0, (i + 1) * S, 1080)).save(f"{UIT}/voorgrond/scherm_{i}.png", optimize=True)
for i in range(3):
    shutil.copy(f"{W}/assets/F/logo_{i}.png", f"{UIT}/logo/logo_wiggle_{i}.png")
shutil.copy(f"{W}/assets/F/rand.png", f"{UIT}/logo/papierrand.png")
shutil.copy(f"{W}/bron/papier.jpg", f"{UIT}/logo/papiertextuur.jpg")
g = np.array(Image.open(f"{W}/bron/eind_g.png").convert("RGB")).astype(np.float32)
k = np.array(Image.open(f"{W}/bron/eind_k.png").convert("RGB")).astype(np.float32)
a = np.clip(1 - (g - k).mean(axis=2) / 245.0, 0, 1)
c = np.where(a[..., None] > 0.003, k / np.maximum(a[..., None], 0.003), 0)
eind_voor = Image.fromarray(np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8))
ew, eh = eind_voor.size
eind_voor = eind_voor.crop(((ew - S) // 2, (eh - 1080) // 2, (ew - S) // 2 + S, (eh - 1080) // 2 + 1080))
eind_voor.save(f"{UIT}/voorgrond/eindscherm.png", optimize=True)

# ------------------------------------------------------------ 3D-modellen
MODELLEN = {"voorgrond_levelfinal": "tutorialblokken", "gidsen_levelfinal": "tekeningen_wereld", "gidsen_leveleind": "tekeningen_eind",
            "grond_level1": "grond", "gras_level1": "gras", "water_level1": "water", "ravijn_level1": "ravijn", "decor_level1": "decor"}
for bron, naam in MODELLEN.items():
    shutil.copy(f"{W}/models/{bron}.glb", f"{UIT}/3d/{naam}.glb")

# ------------------------------------------------------------ foto's: zo ziet het eruit
def zet(beeld, stuk, x, y):
    sx, sy = max(0, -x), max(0, -y)
    if x + stuk.width > 0 and x < beeld.width:
        beeld.alpha_composite(stuk.crop((sx, sy, min(stuk.width, beeld.width - x), min(stuk.height, beeld.height - y))), (max(0, x), max(0, y)))


foto = Image.new("RGBA", (wereld["breedte"], 1080), "white")
for i in range(4):
    zet(foto, RGBA(f"{W}/assets/achtergrond/scherm_{i}.jpg"), i * S, 0)
for b in blokken:
    zet(foto, RGBA(f"{UIT}/{b['beeld']}"), int(b["x"]), b["y"])
for n in range(1, 6):
    x = (3 + n) * S
    for naam in ("lucht.jpg", "10.png", "9.png", "8.png"):
        zet(foto, RGBA(f"{W}/assets/achtergrond/L{n}_{naam}"), x, 0)
foto.alpha_composite(strook)
zet(foto, RGBA(f"{W}/assets/F/logo_0.png"), 320, 200)
for t in tek:
    zet(foto, RGBA(f"{UIT}/{t['sjabloon']}"), t["x"], t["y"])
for p in ankers:
    zet(foto, ank["tutorial" in p["beeld"]], p["x"] - 36, p["y"] - 36)
zet(foto, RGBA(f"{W}/assets/F/rand.png"), wereld["rand"] - 60, 0)
foto.convert("RGB").save(f"{UIT}/fotos/wereld_volledig.png", optimize=True)
for i in range(9):
    foto.crop((i * S, 0, (i + 1) * S, 1080)).convert("RGB").save(f"{UIT}/fotos/scherm_{i}.png", optimize=True)
foto.resize((wereld["breedte"] // 8, 135), Image.LANCZOS).convert("RGB").save(f"{UIT}/fotos/overzicht_klein.jpg", quality=90)
shutil.copy(f"{W}/assets/achtergrond/eind.jpg", f"{UIT}/fotos/eindscherm.jpg")

# ------------------------------------------------------------ alle maten en regels
json.dump({
    "uitleg": "Alle coordinaten in Figma-pixels: x naar rechts, y naar beneden, scherm 1920x1080.",
    "wereld": {"breedte": wereld["breedte"], "hoogte": 1080, "schermbreedte": S, "schermen": [
        {"nr": 0, "naam": "start", "x": 0}, {"nr": 1, "naam": "tutorial 1", "x": 1920}, {"nr": 2, "naam": "tutorial 2", "x": 3840},
        {"nr": 3, "naam": "tutorial 3", "x": 5760}, {"nr": 4, "naam": "level 1 bos", "x": 7680}, {"nr": 5, "naam": "level 2 weide", "x": 9600},
        {"nr": 6, "naam": "level 3 molen", "x": 11520}, {"nr": 7, "naam": "level 4 dorp", "x": 13440}, {"nr": 8, "naam": "level 5 bergen", "x": 15360}]},
    "lagenvolgorde_van_achter_naar_voor": ["achtergrond", "voorgrond", "logo (enkel scherm 0)", "tekeningen en ankers", "papierrand", "Krabbel"],
    "logo": {"x": 320, "y": 200, "beelden": [f"logo/logo_wiggle_{i}.png" for i in range(3)], "wiggle": {"volgorde": [0, 1, 2, 1], "beelden_per_seconde": 10}},
    "papierrand": {"beeld": "logo/papierrand.png", "x": wereld["rand"] - 60, "y": 0},
    "tutorialblokken": {"formule": "x_op_wereld = x + (1 - snelheid) * (min(camera_x, 5760) - camRef)", "stukken": blokken},
    "levelachtergrond": {"per_level": ["level{n}_lucht.jpg", "level{n}_10.png", "level{n}_9.png", "level{n}_8.png"], "level_n_staat_op_x": "(3 + n) * 1920"},
    "camera": {
        "tutorial": "volgt de Krabbel: camera_x = begrens(krabbel_x - 730, 0, 5760), vloeiend (factor 6 per seconde)",
        "levels": "staat stil per scherm (7680, 9600, 11520, 13440, 15360); schuift pas door als de Krabbel de rand 10 px voorbij is, ook terug",
        "schuiven_seconden_vertrek_aankomst": {"voorgrond": [0, 1.25], "laag8": [0.08, 1.42], "laag9": [0.18, 1.6], "laag10": [0.28, 1.78], "lucht_vloeit_over": [0.2, 1.6]},
        "easing": "ease-in-out cubic", "eerste_keer": "van de tutorial naar level 1 schuiven alle lagen samen"},
    "loopvlakken": wereld["vlakken"], "loopvlakken_uitleg": "x0..x1 op hoogte y; met achterTot is het tot die x geen muur (ladderplek)",
    "bruggen": wereld["bruggen"], "brug_uitleg": "boog 300 breed, 60 hoog, vanaf (x, y)",
    "hellingen_x0_y0_x1_y1": wereld["hellingen"], "ladders": wereld["ladders"],
    "tekeningen": tek, "ankers": ankers, "deur": {"x0": wereld["deur"]["x0"], "x1": wereld["deur"]["x1"], "loopvlak": 495},
    "bewegen": {"lopen_px_per_s": 520, "sprongsnelheid": 1320, "zwaartekracht": 3200, "klimmen_px_per_s": 330, "zonder_springen_op_te_lopen": 40},
    "eindscherm": {"achtergrond": "achtergrond/eind_achter.jpg", "voorgrond": "voorgrond/eindscherm.png", "foto": "fotos/eindscherm.jpg",
                   "overgang": "door de deur: 0.75 s krimpen en wit worden, dan verschijnt het eindscherm", **EIND,
                   "opbouw_3d": {"uitleg": "kopieen uit grond.glb en gras.glb (het platform van 600 resp. 1920 breed), verschoven in px; dy = omhoog, diepte = schaalfactor van Z",
                                 "platformen": [{"model": "600 breed (x 0)", "dx": -30, "dy": -64, "diepte": 1}, {"model": "1920 breed (x 900)", "dx": -30, "dy": -64, "diepte": 1},
                                                {"model": "1920 breed", "dx": -2026, "dy": 293, "diepte": 0.55}, {"model": "1920 breed", "dx": 170, "dy": 176, "diepte": 0.65}],
                                 "opgetilde_aarde": "vertices lager dan Y 0.85 nog 4 eenheden omlaag, anders komt de donkere onderband in beeld",
                                 "water": {"model": "water.glb, het water bij x 570", "dx": -30, "dy": -64}, "deur": "uit decor.glb, linkerkant op x 60, onderkant op y 442"},
                   "tekeningen": tek_eind, "ankers": ankers_eind},
    "3d": {"eenheden": "1 eenheid = 100 px; X = x/100, Y = (1080 - y)/100, voorkant +Z", "modellen": {f"3d/{v}.glb": k for k, v in MODELLEN.items()},
           "plaatsing": {"tutorialblokken, tekeningen_wereld": "x = 0", "grond, gras, water, ravijn, decor": f"x = {wereld['start']} (decor: enkel laag6 en laag7 tonen)",
                         "tekeningen_eind": "x = 0 op het eindscherm; de rest van het eindscherm is opgebouwd uit grond/gras/water/decor (zie referentie/game3d.js)"}},
    "krabbel": "De Krabbel is de tekening van het kind: hier niet geleverd (het spel gebruikt enkel een placeholder in code).",
}, open(f"{UIT}/level.json", "w"), indent=1, ensure_ascii=False)

open(f"{UIT}/LEESMIJ.md", "w").write("""# Krabbels · export voor de demo

Alles om de wereld na te bouwen. Stand: eindversie van de speelbare wereld (5-demos/Wereld).

## Begin hier
1. `fotos/wereld_volledig.png`: zo ziet het eruit (17280 x 1080, 9 schermen naast elkaar). `fotos/scherm_0-8.png` per scherm, `fotos/eindscherm.jpg`.
2. `level.json`: alle maten en regels (schermen, lagenvolgorde, camera, loopvlakken, bruggen/hellingen/ladders, tekeningen, ankers, deur, beweging, eindscherm, 3D).
3. `referentie/`: de werkende code (game.js = spel + 2D, game3d.js = 3D, wereld.js = camera, tekeningen, eindscherm). Overnemen mag en is sneller dan opnieuw bouwen.

## Mappen
- `achtergrond/`: `scherm_0-3.jpg` (start en tutorial), `tutorialblok_*.png` (grijze blokken met parallax),
  `level1-5_lucht.jpg` + `_10/_9/_8.png` (ver naar dichtbij), `eind_achter.jpg`
- `voorgrond/`: `scherm_0-8.png` en `eindscherm.png`, doorzichtig: platformen, water, ravijnen, potloden, deur. Zonder tekeningen, ankers, logo en papierrand.
- `tekeningen/`: per brug/helling/ladder een `_sjabloon.png` (stippellijn, staat er al) en `_getekend.png` (potloodlijn die Puntje tekent), plus de ankers. Plaats en punten staan in level.json.
- `logo/`: 3 wiggle-beelden, papierrand, papiertextuur
- `3d/`: de Blender-modellen (glb), enkel nodig voor de 3D-weergave

## Lagen (achter naar voor)
achtergrond, voorgrond, logo (scherm 0), tekeningen en ankers, papierrand (x 7600), Krabbel.

## Camera
Start en tutorial: volgt de Krabbel. Levels: staat stil per scherm en schuift pas door als de Krabbel de rand voorbij is;
de achtergrondlagen komen na de voorgrond aan (tijden in level.json). Na de deur: het eindscherm, een vast scherm.

## Niet inbegrepen
De Krabbel zelf: dat is de tekening van het kind (het spel gebruikt een placeholder in game.js). Geen Puntje, geen geluid,
geen camera- of gebarenbesturing, geen iPad-tekenscherm.
""")

for f in ("game.js", "game3d.js", "wereld.js", "index.html", "style.css"):
    shutil.copy(f"{W}/{f}", f"{UIT}/referentie/{f}")
print("klaar:", UIT)
