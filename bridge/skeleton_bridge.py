#!/usr/bin/env python3
"""
Femto Bolt skeleton bridge
==========================
Reads skeletons through the Orbbec K4A Wrapper (k4a.dll) + Azure Kinect Body Tracking SDK 1.1.2
(k4abt.dll) and sends them ~30 times per second as JSON over a WebSocket (default ws://localhost:8765).

Message format (text):
{
  "t": 1731170000.123,        unix time in seconds
  "status": "ok",             "ok" | "starting" | "no_camera" | "error"
  "text": "...",              human readable status (Dutch, shown in the game)
  "image_size": [640, 576],   size of the depth image (aspect ratio for joints2d)
  "fps": 30.1,                skeleton frames per second (measured in the bridge)
  "latency_ms": 21.0,         processing time in the bridge: from "capture received from the camera SDK"
                              to "this message leaves" (tracker + conversion)
  "bodies": [
    {"id": 1,
     "joints":     {"head": [x, y, z], ...},   metres, camera space: x right, y down, z away from camera
     "joints2d":   {"head": [u, v], ...},      0..1 on the depth/IR image, (0,0) = top left
     "confidence": {"head": 2, ...}}           0 = out of range, 1 = low (occluded/estimated), 2 = good
  ]
}

Camera image (optional): when a client sends the text "beeld", it also receives ~10 binary messages per
second with a JPEG of the IR image (320 px wide, grey). The IR image comes from the same sensor as the
depth image, so joints2d fits it exactly.

Usage:
  python skeleton_bridge.py                 with debug window (q or Esc = stop)
  python skeleton_bridge.py --no-preview    without debug window
  python skeleton_bridge.py --check         only check whether all DLLs and the model are found
  python skeleton_bridge.py --help          all options
"""

import argparse
import asyncio
import ctypes
import json
import logging
import logging.handlers
import os
import sys
import threading
import time
from ctypes import POINTER, Structure, byref, c_bool, c_char_p, c_float, c_int, c_int32, c_size_t, c_uint32, c_void_p

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# ---------------------------------------------------------------------------------------------
# Where the SDKs live. Override with environment variables K4A_BIN / K4ABT_ROOT or --k4a / --k4abt.
# ---------------------------------------------------------------------------------------------
K4A_CANDIDATES = [
    os.environ.get("K4A_BIN", ""),
    os.path.join(REPO, "sdk", "K4A-Wrapper", "bin"),
    r"C:\Femto\K4A-Wrapper\bin",
    r"C:\Program Files\OrbbecSDK K4A Wrapper\bin",
]
K4ABT_CANDIDATES = [
    os.environ.get("K4ABT_ROOT", ""),
    r"C:\Program Files\Azure Kinect Body Tracking SDK",
]
MODEL_NAMES = {"full": "dnn_model_2_0_op11.onnx", "lite": "dnn_model_2_0_lite_op11.onnx"}

# ---------------------------------------------------------------------------------------------
# k4a / k4abt constants (from k4atypes.h / k4abttypes.h)
# ---------------------------------------------------------------------------------------------
K4A_RESULT_SUCCEEDED = 0
K4A_WAIT_SUCCEEDED, K4A_WAIT_FAILED, K4A_WAIT_TIMEOUT = 0, 1, 2
K4A_IMAGE_FORMAT_COLOR_BGRA32 = 3
K4A_COLOR_RESOLUTION_OFF = 0
DEPTH_MODES = {"nfov": 2, "wfov": 3}      # NFOV_UNBINNED 640x576, WFOV_2X2BINNED 512x512
K4A_FRAMES_PER_SECOND_30 = 2
K4A_WIRED_SYNC_MODE_STANDALONE = 0
K4A_CALIBRATION_TYPE_DEPTH = 0

PROCESSING_MODES = {"gpu": 0, "cpu": 1, "cuda": 2, "tensorrt": 3, "directml": 4}
ORIENTATIONS = {"default": 0, "clockwise90": 1, "counterclockwise90": 2, "flip180": 3}
K4ABT_JOINT_COUNT = 32

# Joint index -> name used by the game (same names as sources/webcam.js produces)
JOINTS = {
    0: "pelvis", 2: "chest", 3: "neck",
    5: "shoulder_left", 6: "elbow_left", 7: "wrist_left", 8: "hand_left",
    12: "shoulder_right", 13: "elbow_right", 14: "wrist_right", 15: "hand_right",
    18: "hip_left", 19: "knee_left", 20: "ankle_left",
    22: "hip_right", 23: "knee_right", 24: "ankle_right",
    26: "head", 27: "nose",
}
BONES = [("head", "neck"), ("neck", "chest"), ("chest", "pelvis"),
         ("neck", "shoulder_left"), ("shoulder_left", "elbow_left"), ("elbow_left", "wrist_left"),
         ("neck", "shoulder_right"), ("shoulder_right", "elbow_right"), ("elbow_right", "wrist_right"),
         ("pelvis", "hip_left"), ("hip_left", "knee_left"), ("knee_left", "ankle_left"),
         ("pelvis", "hip_right"), ("hip_right", "knee_right"), ("knee_right", "ankle_right")]


class k4a_device_configuration_t(Structure):
    _fields_ = [("color_format", c_int), ("color_resolution", c_int), ("depth_mode", c_int),
                ("camera_fps", c_int), ("synchronized_images_only", c_bool),
                ("depth_delay_off_color_usec", c_int32), ("wired_sync_mode", c_int),
                ("subordinate_delay_off_master_usec", c_uint32), ("disable_streaming_indicator", c_bool)]


class k4a_float3_t(Structure):
    _fields_ = [("x", c_float), ("y", c_float), ("z", c_float)]


class k4a_float2_t(Structure):
    _fields_ = [("x", c_float), ("y", c_float)]


class k4a_quaternion_t(Structure):
    _fields_ = [("w", c_float), ("x", c_float), ("y", c_float), ("z", c_float)]


class k4abt_joint_t(Structure):
    _fields_ = [("position", k4a_float3_t), ("orientation", k4a_quaternion_t), ("confidence_level", c_int)]


class k4abt_skeleton_t(Structure):
    _fields_ = [("joints", k4abt_joint_t * K4ABT_JOINT_COUNT)]


class k4abt_tracker_configuration_t(Structure):
    _fields_ = [("sensor_orientation", c_int), ("processing_mode", c_int),
                ("gpu_device_id", c_int32), ("model_path", c_char_p)]


# k4a_calibration_t is ~1032 bytes; we only pass it around, so an opaque buffer is enough.
CalibrationBuffer = ctypes.c_ubyte * 4096

log = logging.getLogger("bridge")


class BridgeError(Exception):
    pass


# ---------------------------------------------------------------------------------------------
# DLL loading
# ---------------------------------------------------------------------------------------------
def first_existing(paths, filename):
    for p in paths:
        if p and os.path.isfile(os.path.join(p, filename)):
            return p
    return None


def find_sdks(args):
    k4a_bin = first_existing([args.k4a] + K4A_CANDIDATES if args.k4a else K4A_CANDIDATES, "k4a.dll")
    bt_roots = [args.k4abt] + K4ABT_CANDIDATES if args.k4abt else K4ABT_CANDIDATES
    bt_bin = bt_tools = None
    for root in bt_roots:
        if not root:
            continue
        rel = os.path.join(root, "sdk", "windows-desktop", "amd64", "release", "bin")
        tools = os.path.join(root, "tools")
        if os.path.isfile(os.path.join(rel, "k4abt.dll")):
            bt_bin, bt_tools = rel, tools
            break
        if os.path.isfile(os.path.join(tools, "k4abt.dll")):
            bt_bin, bt_tools = tools, tools
            break
    model = None
    if bt_bin:
        for d in (bt_bin, bt_tools):
            p = os.path.join(d, MODEL_NAMES[args.model])
            if os.path.isfile(p):
                model = p
                break
    return k4a_bin, bt_bin, bt_tools, model


def load_dlls(k4a_bin, bt_bin, bt_tools):
    """Load the Orbbec k4a.dll FIRST (by full path). k4abt.dll imports "k4a.dll" by name; Windows then
    reuses the already loaded Orbbec version instead of Microsoft's (which does not know the Femto)."""
    if sys.platform != "win32":
        raise BridgeError("de brug werkt alleen op Windows (Femto + Body Tracking SDK)")
    for d in (k4a_bin, bt_bin, bt_tools):          # order = search order for dependencies
        if d and os.path.isdir(d):
            os.add_dll_directory(d)
    os.environ["PATH"] = os.pathsep.join(d for d in (k4a_bin, bt_bin, bt_tools) if d) + os.pathsep + os.environ["PATH"]
    k4a = ctypes.CDLL(os.path.join(k4a_bin, "k4a.dll"))
    k4abt = ctypes.CDLL(os.path.join(bt_bin, "k4abt.dll"))
    declare(k4a, k4abt)
    return k4a, k4abt


def declare(k4a, k4abt):
    H = c_void_p
    sig = [
        (k4a.k4a_device_get_installed_count, [], c_uint32),
        (k4a.k4a_device_open, [c_uint32, POINTER(H)], c_int),
        (k4a.k4a_device_close, [H], None),
        (k4a.k4a_device_get_serialnum, [H, c_char_p, POINTER(c_size_t)], c_int),
        (k4a.k4a_device_get_calibration, [H, c_int, c_int, c_void_p], c_int),
        (k4a.k4a_device_start_cameras, [H, POINTER(k4a_device_configuration_t)], c_int),
        (k4a.k4a_device_stop_cameras, [H], None),
        (k4a.k4a_device_get_capture, [H, POINTER(H), c_int32], c_int),
        (k4a.k4a_capture_release, [H], None),
        (k4a.k4a_capture_get_ir_image, [H], H),
        (k4a.k4a_image_get_buffer, [H], POINTER(ctypes.c_uint8)),
        (k4a.k4a_image_get_size, [H], c_size_t),
        (k4a.k4a_image_get_width_pixels, [H], c_int),
        (k4a.k4a_image_get_height_pixels, [H], c_int),
        (k4a.k4a_image_get_stride_bytes, [H], c_int),
        (k4a.k4a_image_release, [H], None),
        (k4a.k4a_calibration_3d_to_2d, [c_void_p, POINTER(k4a_float3_t), c_int, c_int,
                                        POINTER(k4a_float2_t), POINTER(c_int)], c_int),
        (k4abt.k4abt_tracker_create, [c_void_p, k4abt_tracker_configuration_t, POINTER(H)], c_int),
        (k4abt.k4abt_tracker_enqueue_capture, [H, H, c_int32], c_int),
        (k4abt.k4abt_tracker_pop_result, [H, POINTER(H), c_int32], c_int),
        (k4abt.k4abt_tracker_shutdown, [H], None),
        (k4abt.k4abt_tracker_destroy, [H], None),
        (k4abt.k4abt_frame_get_num_bodies, [H], c_uint32),
        (k4abt.k4abt_frame_get_body_skeleton, [H, c_uint32, POINTER(k4abt_skeleton_t)], c_int),
        (k4abt.k4abt_frame_get_body_id, [H, c_uint32], c_uint32),
        (k4abt.k4abt_frame_get_capture, [H], H),
        (k4abt.k4abt_frame_release, [H], None),
    ]
    for fn, argtypes, restype in sig:
        fn.argtypes, fn.restype = argtypes, restype


# ---------------------------------------------------------------------------------------------
# Camera + tracker loop (runs in its own thread)
# ---------------------------------------------------------------------------------------------
class Tracker:
    def __init__(self, args, k4a, k4abt, model_path, publish):
        self.a, self.k4a, self.k4abt, self.model_path = args, k4a, k4abt, model_path
        self.publish = publish          # publish(message_dict, ir_gray_uint8_or_None)
        self.stop = threading.Event()
        self.device = c_void_p()
        self.tracker = c_void_p()
        self.calibration = CalibrationBuffer()
        self.preview = None             # latest (ir, bodies) for the debug window

    # -- life cycle ---------------------------------------------------------------------------
    def run(self):
        while not self.stop.is_set():
            try:
                self.open()
                self.loop()
            except BridgeError as e:
                log.warning("%s - opnieuw proberen over 2 s", e)
                self.publish({"status": "no_camera", "text": str(e), "bodies": []}, None)
            except Exception:                                   # keep the bridge alive no matter what
                log.exception("onverwachte fout - opnieuw proberen over 2 s")
                self.publish({"status": "error", "text": "fout in de brug (zie bridge.log)", "bodies": []}, None)
            finally:
                self.close()
            self.stop.wait(2.0)

    def open(self):
        k4a, k4abt, a = self.k4a, self.k4abt, self.a
        self.publish({"status": "starting", "text": "camera zoeken...", "bodies": []}, None)
        if k4a.k4a_device_get_installed_count() == 0:
            raise BridgeError("geen Femto gevonden (USB-C kabel + stroom?)")
        if k4a.k4a_device_open(0, byref(self.device)) != K4A_RESULT_SUCCEEDED:
            raise BridgeError("camera openen mislukt (draait er nog een ander programma met de camera?)")
        size = c_size_t(64)
        serial = ctypes.create_string_buffer(64)
        k4a.k4a_device_get_serialnum(self.device, serial, byref(size))
        log.info("camera geopend: serienummer %s", serial.value.decode(errors="replace"))

        depth_mode = DEPTH_MODES[a.depth]
        if k4a.k4a_device_get_calibration(self.device, depth_mode, K4A_COLOR_RESOLUTION_OFF,
                                          self.calibration) != K4A_RESULT_SUCCEEDED:
            raise BridgeError("calibratie lezen mislukt")
        cfg = k4a_device_configuration_t(
            color_format=K4A_IMAGE_FORMAT_COLOR_BGRA32, color_resolution=K4A_COLOR_RESOLUTION_OFF,
            depth_mode=depth_mode, camera_fps=K4A_FRAMES_PER_SECOND_30, synchronized_images_only=False,
            depth_delay_off_color_usec=0, wired_sync_mode=K4A_WIRED_SYNC_MODE_STANDALONE,
            subordinate_delay_off_master_usec=0, disable_streaming_indicator=False)
        if k4a.k4a_device_start_cameras(self.device, byref(cfg)) != K4A_RESULT_SUCCEEDED:
            raise BridgeError("dieptecamera starten mislukt")
        log.info("dieptecamera gestart: %s @30fps", a.depth)

        self.publish({"status": "starting", "text": "body tracker starten (±10 s)...", "bodies": []}, None)
        log.info("body tracker starten (mode %s, model %s) - dit kan even duren...",
                 a.mode, os.path.basename(self.model_path))
        t0 = time.time()
        tcfg = k4abt_tracker_configuration_t(
            sensor_orientation=ORIENTATIONS[a.orientation], processing_mode=PROCESSING_MODES[a.mode],
            gpu_device_id=a.gpu, model_path=self.model_path.encode("mbcs"))
        if k4abt.k4abt_tracker_create(self.calibration, tcfg, byref(self.tracker)) != K4A_RESULT_SUCCEEDED:
            self.tracker = c_void_p()
            raise BridgeError(f"body tracker starten mislukt (mode {a.mode}). Probeer --mode directml of --mode cpu.")
        log.info("body tracker klaar na %.1f s", time.time() - t0)

    def close(self):
        if self.tracker:
            self.k4abt.k4abt_tracker_shutdown(self.tracker)
            self.k4abt.k4abt_tracker_destroy(self.tracker)
            self.tracker = c_void_p()
        if self.device:
            self.k4a.k4a_device_stop_cameras(self.device)
            self.k4a.k4a_device_close(self.device)
            self.device = c_void_p()

    # -- main loop ----------------------------------------------------------------------------
    def loop(self):
        k4a, k4abt = self.k4a, self.k4abt
        capture, frame = c_void_p(), c_void_p()
        fps_count, fps_t0, fps = 0, time.time(), 0.0
        log_t0 = time.time()
        pending = []                   # time stamps of enqueued captures (FIFO, same order as results)
        while not self.stop.is_set():
            r = k4a.k4a_device_get_capture(self.device, byref(capture), 1000)
            if r == K4A_WAIT_TIMEOUT:
                continue
            if r != K4A_WAIT_SUCCEEDED:
                raise BridgeError("camera reageert niet meer (kabel los?)")
            t_in = time.perf_counter()
            r = k4abt.k4abt_tracker_enqueue_capture(self.tracker, capture, 0)
            k4a.k4a_capture_release(capture)
            if r == K4A_WAIT_SUCCEEDED:
                pending.append(t_in)
            elif r == K4A_WAIT_FAILED:
                raise BridgeError("body tracker weigert beelden")

            # Pop every result that is ready (blocking a little when the queue is full).
            while pending:
                r = k4abt.k4abt_tracker_pop_result(self.tracker, byref(frame), 0 if len(pending) < 3 else 100)
                if r != K4A_WAIT_SUCCEEDED:
                    break
                t_start = pending.pop(0)
                try:
                    bodies = self.read_bodies(frame)
                    ir = self.read_ir(frame)
                finally:
                    k4abt.k4abt_frame_release(frame)

                fps_count += 1
                now = time.time()
                if now - fps_t0 >= 1.0:
                    fps, fps_count, fps_t0 = fps_count / (now - fps_t0), 0, now
                if now - log_t0 >= 30:
                    log.info("%.0f fps, %d lichaam/lichamen", fps, len(bodies))
                    log_t0 = now
                h, w = (ir.shape if ir is not None else (576, 640))
                msg = {"status": "ok", "text": "verbonden", "image_size": [w, h], "fps": round(fps, 1),
                       "latency_ms": round((time.perf_counter() - t_start) * 1000, 1), "bodies": bodies}
                self.publish(msg, ir)
                self.preview = (ir, bodies)

    def read_bodies(self, frame):
        k4a, k4abt = self.k4a, self.k4abt
        n = k4abt.k4abt_frame_get_num_bodies(frame)
        skeleton = k4abt_skeleton_t()
        p2, valid = k4a_float2_t(), c_int(0)
        w, h = (640, 576) if self.a.depth == "nfov" else (512, 512)
        bodies = []
        for i in range(n):
            if k4abt.k4abt_frame_get_body_skeleton(frame, i, byref(skeleton)) != K4A_RESULT_SUCCEEDED:
                continue
            joints, joints2d, conf = {}, {}, {}
            for idx, name in JOINTS.items():
                j = skeleton.joints[idx]
                pos = j.position
                joints[name] = [round(pos.x / 1000, 4), round(pos.y / 1000, 4), round(pos.z / 1000, 4)]
                conf[name] = min(int(j.confidence_level), 2)
                k4a.k4a_calibration_3d_to_2d(self.calibration, byref(pos), K4A_CALIBRATION_TYPE_DEPTH,
                                             K4A_CALIBRATION_TYPE_DEPTH, byref(p2), byref(valid))
                if valid.value:
                    joints2d[name] = [round(p2.x / w, 4), round(p2.y / h, 4)]
            bodies.append({"id": int(k4abt.k4abt_frame_get_body_id(frame, i)),
                           "joints": joints, "joints2d": joints2d, "confidence": conf})
        return bodies

    def read_ir(self, frame):
        k4a = self.k4a
        cap = self.k4abt.k4abt_frame_get_capture(frame)
        if not cap:
            return None
        try:
            img = k4a.k4a_capture_get_ir_image(cap)
            if not img:
                return None
            try:
                w, h = k4a.k4a_image_get_width_pixels(img), k4a.k4a_image_get_height_pixels(img)
                stride = k4a.k4a_image_get_stride_bytes(img)
                buf = k4a.k4a_image_get_buffer(img)
                raw = np.ctypeslib.as_array(buf, shape=(h * stride,)).view(np.uint16).reshape(h, stride // 2)[:, :w]
                return np.clip(raw.astype(np.float32) * (255.0 / self.a.ir_max), 0, 255).astype(np.uint8)
            finally:
                k4a.k4a_image_release(img)
        finally:
            k4a.k4a_capture_release(cap)


# ---------------------------------------------------------------------------------------------
# WebSocket server (asyncio, main thread)
# ---------------------------------------------------------------------------------------------
class Server:
    def __init__(self, args):
        self.a = args
        self.clients = set()
        self.image_clients = set()
        self.loop = None
        self.last_status = {"status": "starting", "text": "brug start...", "bodies": []}
        self.last_image_t = 0.0

    def publish(self, msg, ir):
        """Called from the tracker thread."""
        msg["t"] = round(time.time(), 3)
        text = json.dumps(msg, separators=(",", ":"))
        jpeg = None
        now = time.time()
        if ir is not None and self.image_clients and now - self.last_image_t >= 1.0 / self.a.image_fps:
            jpeg = encode_jpeg(ir, 320)
            self.last_image_t = now
        if msg.get("status") != "ok":
            self.last_status = msg
        if self.loop:
            self.loop.call_soon_threadsafe(self.broadcast, text, jpeg)

    def broadcast(self, text, jpeg):
        from websockets.asyncio.server import broadcast
        broadcast(self.clients, text)
        if jpeg is not None:
            broadcast(self.image_clients, jpeg)

    async def handler(self, ws):
        self.clients.add(ws)
        log.info("client verbonden: %s", ws.remote_address)
        try:
            await ws.send(json.dumps(self.last_status))
            async for message in ws:
                if message == "beeld":
                    self.image_clients.add(ws)
                    log.info("client wil camerabeeld: %s", ws.remote_address)
        except Exception:
            pass
        finally:
            self.clients.discard(ws)
            self.image_clients.discard(ws)
            log.info("client weg: %s", ws.remote_address)

    async def serve(self, stop_event):
        from websockets.asyncio.server import serve
        self.loop = asyncio.get_running_loop()
        async with serve(self.handler, self.a.host, self.a.port, max_size=2**20):
            log.info("WebSocket-server: ws://%s:%d", self.a.host, self.a.port)
            while not stop_event.is_set():
                await asyncio.sleep(0.2)


def encode_jpeg(gray, width):
    import cv2
    h, w = gray.shape
    small = cv2.resize(gray, (width, int(h * width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return buf.tobytes() if ok else None


def preview_loop(tracker, stop):
    """Optional debug window: IR image + skeleton. Runs in the main thread (OpenCV wants that)."""
    import cv2
    while not stop.is_set():
        if tracker.preview and tracker.preview[0] is not None:
            ir, bodies = tracker.preview
            img = cv2.cvtColor(ir, cv2.COLOR_GRAY2BGR)
            h, w = ir.shape
            for b in bodies:
                pts = {k: (int(u * w), int(v * h)) for k, (u, v) in b["joints2d"].items()}
                for a_, b_ in BONES:
                    if a_ in pts and b_ in pts:
                        cv2.line(img, pts[a_], pts[b_], (255, 140, 40), 3)
            cv2.putText(img, f"{len(bodies)} lichaam/lichamen", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.imshow("Femto skeleton bridge (q = stoppen)", img)
        if cv2.waitKey(15) & 0xFF in (ord("q"), 27):
            stop.set()
    cv2.destroyAllWindows()


# ---------------------------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Femto Bolt -> skeleton WebSocket bridge")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--mode", choices=sorted(PROCESSING_MODES), default="cuda",
                   help="rekenmodus van de body tracker (standaard cuda = NVIDIA)")
    p.add_argument("--gpu", type=int, default=0, help="nummer van de videokaart")
    p.add_argument("--model", choices=sorted(MODEL_NAMES), default="full", help="lite = sneller, minder nauwkeurig")
    p.add_argument("--depth", choices=sorted(DEPTH_MODES), default="nfov", help="nfov (640x576) of wfov (breder)")
    p.add_argument("--orientation", choices=sorted(ORIENTATIONS), default="default", help="hoe de camera gemonteerd is")
    p.add_argument("--ir-max", type=float, default=1500, help="IR-waarde die wit wordt in het voorbeeldbeeld")
    p.add_argument("--image-fps", type=float, default=10, help="hoe vaak per seconde het IR-beeld verstuurd wordt")
    p.add_argument("--no-preview", action="store_true", help="geen debugvenster")
    p.add_argument("--check", action="store_true", help="alleen nakijken of alles gevonden wordt")
    p.add_argument("--k4a", default="", help="map met k4a.dll van de Orbbec K4A Wrapper")
    p.add_argument("--k4abt", default="", help="installatiemap van de Azure Kinect Body Tracking SDK")
    return p.parse_args()


def setup_logging():
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    for h in (logging.StreamHandler(sys.stdout),
              logging.handlers.RotatingFileHandler(os.path.join(HERE, "bridge.log"), maxBytes=1_000_000,
                                                   backupCount=1, encoding="utf-8")):
        h.setFormatter(fmt)
        log.addHandler(h)


def main():
    args = parse_args()
    setup_logging()
    log.info("=== Femto skeleton bridge start (pid %d) ===", os.getpid())
    k4a_bin, bt_bin, bt_tools, model = find_sdks(args)
    log.info("k4a  : %s", k4a_bin or "NIET GEVONDEN")
    log.info("k4abt: %s", bt_bin or "NIET GEVONDEN")
    log.info("model: %s", model or "NIET GEVONDEN")
    missing = [n for n, v in (("Orbbec K4A Wrapper (k4a.dll)", k4a_bin),
                              ("Azure Kinect Body Tracking SDK (k4abt.dll)", bt_bin),
                              (f"model {MODEL_NAMES[args.model]}", model)) if not v]
    if missing:
        log.error("ontbreekt: %s. Zie README.md, stap 'Eenmalig installeren'.", ", ".join(missing))
        sys.exit(1)
    try:
        k4a, k4abt = load_dlls(k4a_bin, bt_bin, bt_tools)
    except (OSError, BridgeError) as e:
        log.error("DLL laden mislukt: %s", e)
        sys.exit(1)
    if args.check:
        log.info("alles gevonden en geladen. Camera's aangesloten: %d", k4a.k4a_device_get_installed_count())
        return

    server = Server(args)
    tracker = Tracker(args, k4a, k4abt, model, server.publish)
    stop = threading.Event()
    worker = threading.Thread(target=tracker.run, name="tracker", daemon=True)
    worker.start()
    net = threading.Thread(target=lambda: asyncio.run(server.serve(stop)), name="websocket", daemon=True)
    net.start()
    try:
        if args.no_preview:
            while not stop.is_set():
                time.sleep(0.5)
        else:
            preview_loop(tracker, stop)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        tracker.stop.set()
        worker.join(timeout=3)          # lets the tracker close the camera cleanly
        log.info("brug gestopt")


if __name__ == "__main__":
    main()
