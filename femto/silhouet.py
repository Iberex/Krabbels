import itertools
import math
import os
import time

import cv2
import numpy as np
import pykinect_azure as pykinect

FEMTO_MAP = r"C:\FemtoBT"
ACHTERGROND = 255                  # waarde in de body index map waar niemand staat
ANDERE_KLEUR = (255, 120, 0)       # blauw (BGR): mensen die geen speler zijn

# Plaatsen voor spelers. De game kiest later zelf of ze 1 of 2 spelers gebruikt.
MAX_SPELERS = 2
SPELER_KLEUREN = [
    (0, 140, 255),                 # oranje (BGR): speler 1
    (80, 220, 80),                 # groen (BGR): speler 2
]
WACHTTIJD = 1.0                    # seconden uit beeld voor een plaats vrijkomt
MAX_SPRONG = 600                   # mm: verder dan dit kan een speler niet "springen" tussen twee beelden
ID_BONUS = 200                     # mm: hetzelfde nummer van de tracker telt alsof je zoveel dichter staat
TOON_IDS = True                    # toon het nummer van de tracker bovenaan (handig om te testen)

os.environ["PATH"] = FEMTO_MAP + os.pathsep + os.environ["PATH"]
os.add_dll_directory(FEMTO_MAP)

pykinect.initialize_libraries(
    module_k4a_path=os.path.join(FEMTO_MAP, "k4a.dll"),
    module_k4abt_path=os.path.join(FEMTO_MAP, "k4abt.dll"),
    track_body=True,
)

config = pykinect.default_configuration
config.color_resolution = pykinect.K4A_COLOR_RESOLUTION_720P
config.depth_mode = pykinect.K4A_DEPTH_MODE_NFOV_UNBINNED
config.camera_fps = pykinect.K4A_FRAMES_PER_SECOND_30

device = pykinect.start_device(config=config)

tracker_config = pykinect.k4abt_tracker_default_configuration
tracker_config.processing_mode = pykinect.K4ABT_TRACKER_PROCESSING_MODE_GPU_CUDA
tracker = pykinect.start_body_tracker(model_type=pykinect.K4ABT_DEFAULT_MODEL)
print("Body tracking gestart. Druk op q of Esc in een venster om te stoppen.")

# Elke plaats is leeg (None) of {"id": nummer van de tracker, "pos": (x, z) in mm, "laatst_gezien": tijd}
plaatsen = [None] * MAX_SPELERS


def zoek_mensen(body_frame, diepte, body_map):
    """Geeft {id: {"index", "afstand", "pos"}} voor iedereen in beeld."""
    mensen = {}

    for i in range(body_frame.get_num_bodies()):
        pixels = diepte[(body_map == i) & (diepte > 0)]
        if pixels.size == 0:
            continue

        # Het bekken uit het skelet: waar de persoon staat, in mm (x = links/rechts, z = afstand)
        bekken = body_frame.get_body_skeleton(i).joints[pykinect.K4ABT_JOINT_PELVIS].position.xyz

        mensen[body_frame.get_body_id(i)] = {
            "index": i,                     # nummer in de body_map van dit beeld
            "afstand": np.median(pixels),
            "pos": (bekken.x, bekken.z),
        }

    return mensen


def afstand_tussen(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def werk_plaatsen_bij(mensen, nu):
    """Elke speler houdt zijn plaats: wie het dichtst staat bij waar die speler net was."""
    bezet = [p for p, plaats in enumerate(plaatsen) if plaats is not None]

    # Probeer elke manier om de bezette plaatsen te verdelen over de mensen in beeld
    # (None = die speler is even niet te zien). Kies de verdeling met de kleinste sprongen.
    beste, beste_kost = {}, None
    for keuze in itertools.permutations(list(mensen) + [None] * len(bezet), len(bezet)):
        kost = 0
        mogelijk = True
        for p, id in zip(bezet, keuze):
            if id is None:
                kost += MAX_SPRONG
                continue
            sprong = afstand_tussen(plaatsen[p]["pos"], mensen[id]["pos"])
            if id == plaatsen[p]["id"]:
                kost += min(sprong, MAX_SPRONG) - ID_BONUS   # zelfde nummer: de tracker zegt "dit is hem"
            elif sprong > MAX_SPRONG:
                mogelijk = False                              # te ver weg om dezelfde persoon te zijn
                break
            else:
                kost += sprong
        if mogelijk and (beste_kost is None or kost < beste_kost):
            beste, beste_kost = dict(zip(bezet, keuze)), kost

    for p in bezet:
        id = beste.get(p)
        if id is not None:
            plaatsen[p].update(id=id, pos=mensen[id]["pos"], laatst_gezien=nu)
        elif nu - plaatsen[p]["laatst_gezien"] > WACHTTIJD:
            plaatsen[p] = None     # te lang weg: de plaats komt vrij

    # Wie nog geen plaats heeft, krijgt een vrije plaats (dichtste eerst)
    toegewezen = {id for id in beste.values() if id is not None}
    nieuw = sorted((id for id in mensen if id not in toegewezen), key=lambda id: mensen[id]["afstand"])

    for p in range(MAX_SPELERS):
        if plaatsen[p] is None and nieuw:
            id = nieuw.pop(0)
            plaatsen[p] = {"id": id, "pos": mensen[id]["pos"], "laatst_gezien": nu}


def speler_in_beeld(p, mensen):
    """Geeft de gegevens van speler p als die nu te zien is, anders None."""
    plaats = plaatsen[p]
    if plaats is None or plaats["id"] not in mensen:
        return None
    return mensen[plaats["id"]]


def maak_silhouetbeeld(diepte, body_map, mensen):
    grijs = cv2.convertScaleAbs(diepte, alpha=255 / 4000)
    beeld = cv2.cvtColor(grijs, cv2.COLOR_GRAY2BGR)

    # Eerst iedereen blauw
    iemand = body_map != ACHTERGROND
    beeld[iemand] = (0.3 * beeld[iemand] + 0.7 * np.array(ANDERE_KLEUR)).astype(np.uint8)

    # Daarna elke speler in zijn eigen kleur
    for p in range(MAX_SPELERS):
        speler = speler_in_beeld(p, mensen)
        if speler is None:
            continue
        is_speler = body_map == speler["index"]
        beeld[is_speler] = (0.3 * beeld[is_speler] + 0.7 * np.array(SPELER_KLEUREN[p])).astype(np.uint8)

    return beeld


def maak_masker(body_map, mensen, p):
    """Wit waar speler p staat, zwart elders."""
    masker = np.zeros(body_map.shape, dtype=np.uint8)
    speler = speler_in_beeld(p, mensen)
    if speler is not None:
        masker[body_map == speler["index"]] = 255
    return masker


vorige_tijd = time.perf_counter()
fps = 0.0

while True:
    capture = device.update()
    body_frame = tracker.update()

    ret_kleur, kleur = capture.get_color_image()
    ret_diepte, diepte = capture.get_depth_image()
    ret_map, body_map = body_frame.get_body_index_map_image()

    nu = time.perf_counter()
    fps = 0.9 * fps + 0.1 * (1 / (nu - vorige_tijd))
    vorige_tijd = nu

    if ret_kleur:
        cv2.imshow("Camera", kleur)

    if ret_diepte and ret_map:
        mensen = zoek_mensen(body_frame, diepte, body_map)
        werk_plaatsen_bij(mensen, nu)

        beeld = maak_silhouetbeeld(diepte, body_map, mensen)

        # Bovenaan: per speler de afstand, of "wacht" als zijn plaats leeg is
        delen = []
        for p, plaats in enumerate(plaatsen):
            speler = speler_in_beeld(p, mensen)
            if plaats is None:
                delen.append(f"S{p + 1}: wacht")
            elif speler is None:
                delen.append(f"S{p + 1}: even weg")
            else:
                id_tekst = f" (id {plaats['id']})" if TOON_IDS else ""
                delen.append(f"S{p + 1}: {speler['afstand'] / 1000:.1f} m{id_tekst}")
        tekst = f"{len(mensen)} in beeld   " + "   ".join(delen) + f"   {fps:.0f} FPS"
        cv2.putText(beeld, tekst, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.imshow("Silhouet", beeld)

        for p in range(MAX_SPELERS):
            cv2.imshow(f"Speler {p + 1}", maak_masker(body_map, mensen, p))

    toets = cv2.waitKey(1) & 0xFF
    if toets in (ord("q"), ord("Q"), 27):   # q, Q of Esc
        break

cv2.destroyAllWindows()
device.close()
