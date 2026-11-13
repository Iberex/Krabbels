#!/usr/bin/env python3
"""
Optional: download MediaPipe (+ pose model) into vendor/mediapipe, so the webcam test also works
without internet. src/sources/webcam.js uses this local copy when it exists, else the CDN.

  python tools/haal_mediapipe.py
"""
import os
import urllib.request

VERSION = "1.1.1"   # keep equal to VERSION in src/sources/webcam.js
CDN = f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{VERSION}"
MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vendor", "mediapipe")

FILES = {
    "vision_bundle.mjs": f"{CDN}/vision_bundle.mjs",
    "pose_landmarker_full.task": MODEL,
}
for name in ("vision_wasm_internal", "vision_wasm_nosimd_internal", "vision_wasm_module_internal"):
    for ext in (".js", ".wasm"):
        FILES[f"wasm/{name}{ext}"] = f"{CDN}/wasm/{name}{ext}"

for rel, url in FILES.items():
    dst = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        urllib.request.urlretrieve(url, dst)
        print(f"ok   {rel} ({os.path.getsize(dst) // 1024} kB)")
    except Exception as e:  # some wasm variants do not exist in every version
        print(f"skip {rel} ({e})")
print("klaar:", OUT)
