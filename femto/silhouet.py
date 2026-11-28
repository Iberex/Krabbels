import os

import cv2
import numpy as np
import pykinect_azure as pykinect

FEMTO_MAP = r"C:\FemtoBT"
ACHTERGROND = 255                  # waarde in de body index map waar niemand staat
SILHOUET_KLEUR = (0, 140, 255)     # oranje (OpenCV gebruikt BGR, niet RGB)

os.environ["PATH"] = FEMTO_MAP + os.pathsep + os.environ["PATH"]
os.add_dll_directory(FEMTO_MAP)

# Nu ook de Body Tracking SDK laden
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
print("Body tracking gestart. Druk op q in een venster om te stoppen.")


def maak_silhouetbeeld(diepte, body_map):
    # Dieptebeeld (millimeter) naar grijs: 0 m is zwart, 4 m en verder is wit
    grijs = cv2.convertScaleAbs(diepte, alpha=255 / 4000)
    beeld = cv2.cvtColor(grijs, cv2.COLOR_GRAY2BGR)

    # Waar iemand staat, meng je de grijze pixel met oranje
    iemand = body_map != ACHTERGROND
    beeld[iemand] = (0.3 * beeld[iemand] + 0.7 * np.array(SILHOUET_KLEUR)).astype(np.uint8)
    return beeld


while True:
    capture = device.update()
    body_frame = tracker.update()

    ret_kleur, kleur = capture.get_color_image()
    ret_diepte, diepte = capture.get_depth_image()
    ret_map, body_map = body_frame.get_body_index_map_image()

    if ret_kleur:
        cv2.imshow("Camera", kleur)
    if ret_diepte and ret_map:
        cv2.imshow("Silhouet", maak_silhouetbeeld(diepte, body_map))

    if cv2.waitKey(1) == ord("q"):
        break

cv2.destroyAllWindows()
