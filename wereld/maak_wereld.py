# Schrijft wereld.json. De wereld is exact het Figma-frame "final_foreground": 9 schermen van 1920 px
# (start, 3 x tutorial, level 1 t/m 5). Elk scherm heeft zijn eigen achtergrond: assets/achtergrond/scherm_0..8.jpg
# (de frames Title Screen, tutorial_level en level_1..5_final zonder voorgrond).
import json, os
MAP = os.path.dirname(os.path.abspath(__file__))

SCHERM = 1920
RAND = 7660          # de papierrand van de tutorial (40 px breed), op de grens tussen scherm 4 en 5
START = 7650         # hier begint de voorgrond van de levels (gras in final_foreground)

# platformen (x0, x1, loopvlak)
platformen = [(0, 1920, 975), (1920, 2490, 975), (2790, 3360, 975), (3660, 4230, 855), (4530, 7140, 975),
              (5160, 5340, 765), (6840, 7680, 735)]
platformen += [(START + a, START + b, y) for a, b, y in
               ((0, 600, 735), (900, 2820, 735), (2520, 4440, 495), (4740, 6360, 615), (6660, 7080, 615),
                (7380, 9300, 735), (9000, 9630, 495))]
# een hoog blok dat achter een lager platform begint is tot daar geen muur (daar staat de ladder)
achter = {6840: 7140, START + 2520: START + 2820, START + 9000: START + 9300}
vlakken = [dict({"x0": a, "x1": b, "y": y}, **({"achterTot": achter[a]} if a in achter else {})) for a, b, y in platformen]

bruggen = [{"x": 2490, "y": 975}, {"x": START + 600, "y": 735}, {"x": START + 6360, "y": 615}]
hellingen = [[3360, 975, 3660, 855], [4230, 855, 4530, 975], [START + 4440, 495, START + 4740, 615],
             [START + 7080, 615, START + 7380, 735]]
ladders = [{"x": 6985, "boven": 735, "onder": 975}, {"x": START + 2665, "boven": 495, "onder": 735},
           {"x": START + 9145, "boven": 495, "onder": 735}]
ankers = [[x, y] for x, y in ((2490, 975), (2790, 975), (3360, 975), (3660, 855), (4230, 855), (4530, 975), (5100, 975),
                              (5400, 975), (5970, 975), (6270, 975), (6840, 975), (7140, 735))]
ankers += [[START + x, y] for x, y in ((600, 735), (900, 735), (1320, 735), (1620, 735), (2520, 735), (2820, 495),
           (3240, 495), (3540, 495), (4440, 495), (4740, 615), (5160, 615), (5460, 615), (6360, 615), (6660, 615),
           (7080, 615), (7380, 735), (8280, 735), (8580, 735), (9000, 735), (9300, 495))]

breedte = 9 * SCHERM
levels = [{"nr": n, "x": (3 + n) * SCHERM} for n in range(1, 6)]    # level 1 = scherm 5, enz.
deur = json.load(open(f"{MAP}/level1.json"))["deur"]
json.dump({"breedte": breedte, "hoogte": 1080, "scherm": SCHERM, "schermen": 9, "rand": RAND, "start": START,
           "levels": levels, "deur": {"x0": START + deur["x0"], "x1": START + deur["x1"]},
           "vlakken": vlakken, "bruggen": bruggen, "hellingen": hellingen, "ladders": ladders, "ankers": ankers},
          open(f"{MAP}/wereld.json", "w"), separators=(",", ":"))
print("breedte", breedte, "deur", START + deur["x0"], START + deur["x1"])
