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

# Elke plaats is leeg (None) of {"id": vast nummer van de persoon, "laatst_gezien": tijd}
plaatsen = [None] * MAX_SPELERS


def zoek_mensen(body_frame, diepte, body_map):
    """Geeft {vast id: (index in body_map, afstand in mm)} voor iedereen in beeld."""
    mensen = {}

    for i in range(body_frame.get_num_bodies()):
        pixels = diepte[(body_map == i) & (diepte > 0)]
        if pixels.size == 0:
            continue

        # Het id blijft hetzelfde zolang de persoon in beeld blijft, de index niet
        mensen[body_frame.get_body_id(i)] = (i, np.median(pixels))

    return mensen


def werk_plaatsen_bij(mensen, nu):
    """Wie er al was, houdt zijn plaats. Een vrije plaats gaat naar wie nieuw is."""
    for p, plaats in enumerate(plaatsen):
        if plaats is None:
            continue
        if plaats["id"] in mensen:
            plaats["laatst_gezien"] = nu
        elif nu - plaats["laatst_gezien"] > WACHTTIJD:
            plaatsen[p] = None     # te lang weg: de plaats komt vrij

    bezet = {plaats["id"] for plaats in plaatsen if plaats is not None}

    # Nieuwe mensen, dichtste eerst (als er twee tegelijk binnenkomen)
    nieuw = sorted((id for id in mensen if id not in bezet), key=lambda id: mensen[id][1])

    for p in range(MAX_SPELERS):
        if plaatsen[p] is None and nieuw:
            plaatsen[p] = {"id": nieuw.pop(0), "laatst_gezien": nu}


def maak_silhouetbeeld(diepte, body_map, mensen):
    grijs = cv2.convertScaleAbs(diepte, alpha=255 / 4000)
    beeld = cv2.cvtColor(grijs, cv2.COLOR_GRAY2BGR)

    # Eerst iedereen blauw
    iemand = body_map != ACHTERGROND
    beeld[iemand] = (0.3 * beeld[iemand] + 0.7 * np.array(ANDERE_KLEUR)).astype(np.uint8)

    # Daarna elke speler in zijn eigen kleur
    for p, plaats in enumerate(plaatsen):
        if plaats is None or plaats["id"] not in mensen:
            continue
        index, afstand = mensen[plaats["id"]]
        is_speler = body_map == index
        beeld[is_speler] = (0.3 * beeld[is_speler] + 0.7 * np.array(SPELER_KLEUREN[p])).astype(np.uint8)

    return beeld


def maak_masker(body_map, mensen, p):
    """Wit waar speler p staat, zwart elders."""
    masker = np.zeros(body_map.shape, dtype=np.uint8)
    plaats = plaatsen[p]
    if plaats is not None and plaats["id"] in mensen:
        index, afstand = mensen[plaats["id"]]
        masker[body_map == index] = 255
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
            if plaats is None:
                delen.append(f"S{p + 1}: wacht")
            elif plaats["id"] in mensen:
                delen.append(f"S{p + 1}: {mensen[plaats['id']][1] / 1000:.1f} m")
            else:
                delen.append(f"S{p + 1}: even weg")
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
