#!/usr/bin/env python3
"""
Fake bridge: sends a made-up skeleton on ws://localhost:8765, in the same format as
bridge/skeleton_bridge.py. Lets you test the game (?bron=femto) on any computer without a Femto.
The figure slowly raises its arms to the side, holds them, and lowers them again.

  pip install websockets        (once)
  python tools/nep_brug.py
"""
import asyncio
import json
import math
import random
import time

from websockets.asyncio.server import broadcast, serve

clients = set()


def skeleton(t):
    # arm angle: down (-80) -> sideways (0) -> hold -> down, 10 s cycle
    c = t % 10
    angle = -80 + 80 * min(1, c / 2) if c < 6 else -80 * min(1, (c - 6) / 2)
    a = math.radians(angle)
    sway = 0.15 * math.sin(t * 0.3)
    J = {"neck": [sway, -0.45, 2.5], "head": [sway, -0.65, 2.5], "chest": [sway, -0.3, 2.5], "pelvis": [sway, 0.05, 2.5]}
    for side, s in (("left", 1), ("right", -1)):      # camera space: person's left = +x seen from the camera
        sh = [sway + s * 0.18, -0.42, 2.5]
        el = [sh[0] + s * 0.28 * math.cos(a), sh[1] - 0.28 * math.sin(a), 2.5]
        wr = [el[0] + s * 0.26 * math.cos(a), el[1] - 0.26 * math.sin(a), 2.5]
        hip = [sway + s * 0.1, 0.05, 2.5]
        J.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"wrist_{side}": wr, f"hand_{side}": wr,
                  f"hip_{side}": hip, f"knee_{side}": [hip[0], 0.48, 2.5], f"ankle_{side}": [hip[0], 0.9, 2.5]})
    J["nose"] = J["head"]
    noise = lambda v: [x + random.gauss(0, 0.004) for x in v]
    J = {k: [round(x, 4) for x in noise(v)] for k, v in J.items()}
    # simple pinhole projection to 0..1 on a 640x576 image
    J2 = {k: [round(0.5 + 504 * v[0] / v[2] / 640, 4), round(0.5 + 504 * v[1] / v[2] / 576, 4)] for k, v in J.items()}
    return {"id": 1, "joints": J, "joints2d": J2, "confidence": {k: 2 for k in J}}


async def handler(ws):
    clients.add(ws)
    try:
        async for _ in ws:
            pass
    finally:
        clients.discard(ws)


async def main():
    async with serve(handler, "localhost", 8765):
        print("nep-brug op ws://localhost:8765 (Ctrl+C = stoppen)")
        while True:
            t0 = time.perf_counter()
            msg = {"t": time.time(), "status": "ok", "text": "verbonden (nep-brug)", "image_size": [640, 576],
                   "fps": 30, "latency_ms": 0, "bodies": [skeleton(time.time())]}
            msg["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            broadcast(clients, json.dumps(msg))
            await asyncio.sleep(1 / 30)


if __name__ == "__main__":
    asyncio.run(main())
