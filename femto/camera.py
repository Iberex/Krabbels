import os

import cv2
import pykinect_azure as pykinect

# De map uit stap 2, met de k4a.dll van Orbbec
FEMTO_MAP = r"C:\FemtoBT"

# Windows moet de DLL's in die map kunnen vinden
os.environ["PATH"] = FEMTO_MAP + os.pathsep + os.environ["PATH"]
os.add_dll_directory(FEMTO_MAP)

# Laad de k4a.dll van Orbbec, niet die uit C:\Program Files
pykinect.initialize_libraries(module_k4a_path=os.path.join(FEMTO_MAP, "k4a.dll"))

# Instellingen van de camera
config = pykinect.default_configuration
config.color_resolution = pykinect.K4A_COLOR_RESOLUTION_720P
config.depth_mode = pykinect.K4A_DEPTH_MODE_NFOV_UNBINNED
config.camera_fps = pykinect.K4A_FRAMES_PER_SECOND_30

device = pykinect.start_device(config=config)
print("Camera gestart. Druk op q in een venster om te stoppen.")

while True:
    # Wacht op een nieuwe opname van de camera
    capture = device.update()

    ret_kleur, kleur = capture.get_color_image()
    ret_diepte, diepte = capture.get_colored_depth_image()

    if ret_kleur:
        cv2.imshow("Camera", kleur)
    if ret_diepte:
        cv2.imshow("Diepte", diepte)

    if cv2.waitKey(1) == ord("q"):
        break

cv2.destroyAllWindows()
