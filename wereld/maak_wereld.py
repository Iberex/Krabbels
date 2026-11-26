# Schrijft wereld.json: de hele wereld als een stuk (start + tutorial uit final_foreground, daarna level 1-5).
# Alle platformen, bruggen, hellingen, ladders en ankers staan in wereld-pixels.
import json, os
MAP = os.path.dirname(os.path.abspath(__file__))

START = 7650                      # hier begint level 1 (gras in final_foreground)
RAND = 7660                       # de papierrand van de tutorial (40 px breed)
OVERLAP = 62                      # de aarde staat 30 px van elk einde: zo veel schuiven de levels in elkaar, zonder spleet

# per level: platformen (x0, x1, loopvlak) uit het gras van Figma, en de tekeningen; x vanaf het begin van het level
LEVEL_1_2 = {
    "platformen": [(0, 600, 735), (900, 2820, 735), (2520, 4440, 495), (4740, 6360, 615), (6660, 7080, 615),
                   (7380, 9300, 735), (9000, 9660, 495)],
    "bruggen": [(600, 735), (6360, 615)],
    "hellingen": [(4440, 495, 4740, 615), (7080, 615, 7380, 735)],
    "ladders": [(2665, 495, 735), (9145, 495, 735)],
    "ankers": [(600, 735), (900, 735), (1320, 735), (1620, 735), (2520, 735), (2820, 495), (3240, 495), (3540, 495),
               (4440, 495), (4740, 615), (5160, 615), (5460, 615), (6360, 615), (6660, 615), (7080, 615),
               (7380, 735), (8280, 735), (8580, 735), (9000, 735), (9300, 495)],
}
LEVELS = [
    dict(LEVEL_1_2, naam="bos"),
    dict(LEVEL_1_2, naam="weide"),
    {"naam": "meer", "platformen": [(0, 1920, 495), (2220, 3840, 615)], "bruggen": [],
     "hellingen": [(1920, 495, 2220, 615)], "ladders": [],
     "ankers": [(1920, 495), (2220, 615), (2640, 615), (2940, 615)]},
    {"naam": "dorp", "platformen": [(0, 1620, 615), (1920, 2340, 615), (2640, 4560, 735)], "bruggen": [(1620, 615)],
     "hellingen": [(2340, 615, 2640, 735)], "ladders": [],
     "ankers": [(1620, 615), (1920, 615), (2340, 615), (2640, 735)]},
    {"naam": "bergen", "platformen": [(0, 1920, 735), (1620, 2280, 495)], "bruggen": [], "hellingen": [],
     "ladders": [(1765, 495, 735)], "ankers": [(900, 735), (1200, 735), (1620, 735), (1920, 495)]},
]
# tutorial (loopvlakken en tekeningen uit final_foreground)
vlakken = [{"x0": a, "x1": b, "y": y} for a, b, y in
           ((0, 1920, 975), (1920, 2490, 975), (2790, 3360, 975), (3660, 4230, 855), (4530, 7140, 975), (5160, 5340, 765))]
vlakken.append({"x0": 6840, "x1": 7680, "y": 735, "achterTot": 7140})
bruggen = [{"x": 2490, "y": 975}]
hellingen = [[3360, 975, 3660, 855], [4230, 855, 4530, 975]]
ladders = [{"x": 6985, "boven": 735, "onder": 975}]
ankers = [[x, y] for x, y in ((2490, 975), (2790, 975), (3360, 975), (3660, 855), (4230, 855), (4530, 975), (5100, 975),
                              (5400, 975), (5970, 975), (6270, 975), (6840, 975), (7140, 735))]

levels, off = [], START
for nr, L in enumerate(LEVELS, 1):
    info = json.load(open(f"{MAP}/level{nr}.json"))
    b = info["breedte"]
    p = L["platformen"]
    for x0, x1, y in p:
        v = {"x0": off + x0, "x1": off + x1, "y": y}
        # begint dit hoge blok achter een lager platform, dan is het tot daar geen muur (daar staat de ladder)
        achter = [ox1 for ox0, ox1, oy in p if oy > y and ox0 < x0 < ox1]
        if achter:
            v["achterTot"] = off + max(achter)
        vlakken.append(v)
    bruggen += [{"x": off + x, "y": y} for x, y in L["bruggen"]]
    hellingen += [[off + a, ay, off + c, cy] for a, ay, c, cy in L["hellingen"]]
    ladders += [{"x": off + x, "boven": bv, "onder": od} for x, bv, od in L["ladders"]]
    ankers += [[off + x, y] for x, y in L["ankers"]]
    levels.append({"nr": nr, "naam": L["naam"], "x": off, "breedte": b})
    off += b - OVERLAP

deur = json.load(open(f"{MAP}/level5.json"))["deur"]
laatste = levels[-1]["x"]
json.dump({"breedte": off + OVERLAP, "hoogte": 1080, "rand": RAND, "levels": levels,
           "deur": {"x0": laatste + deur["x0"], "x1": laatste + deur["x1"]},
           "vlakken": vlakken, "bruggen": bruggen, "hellingen": hellingen, "ladders": ladders, "ankers": ankers},
          open(f"{MAP}/wereld.json", "w"), separators=(",", ":"))
print("breedte", off + OVERLAP, "levels", [(l["nr"], l["x"]) for l in levels])
print("hoge blokken met ladderplek", [(v["x0"], v["achterTot"]) for v in vlakken if "achterTot" in v])
