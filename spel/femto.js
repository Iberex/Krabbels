// =====================================================================
// femto.js - Femto Bolt as camera for the Krabbels demo (v2).
//
// The skeletons come from krabbels-femto/bridge/skeleton_bridge.py (Azure Kinect Body Tracking
// on the depth image, NVIDIA GPU) over ws://localhost:8765. They are converted to the same
// shape as a MediaPipe PoseLandmarker result, so pose.js (Tracker) does the gestures.
//
// What the depth camera adds over a webcam:
//   - Real 3D positions (metres). Where you stand in the room = where your silhouette stands on
//     the wall, and the silhouette has your real size (main.js passes scale: W to pose.js).
//     Two children holding hands are drawn holding hands.
//   - Play zone in metres: people outside it (passers-by, the audience) are ignored.
//   - A One Euro filter per joint: steady when you stand still, fast when you move.
//
// Play area = the strip of the room that maps onto the full screen width. Set it once in
// Kalibratie: stand at the left edge of the projection and press [, at the right edge press ].
// (\ clears it.) It is remembered in localStorage. URL options override it:
//   ?bron=webcam        use the webcam + MediaPipe instead
//   ?achter=1           camera stands BEHIND the players, facing the projection wall (no mirror)
//                       default: camera stands IN FRONT of the players (selfie mirror)
//   ?min=0.6&max=4.5    play zone: distance from the camera (metres)
//   ?breedte=3.5        width of the play area (metres) = full screen width
//   ?midden=0           middle of the play area, metres to the right as the camera sees it
//   ?brug=ws://host:port
// =====================================================================
import { POSE } from "./pose.js";

const params = new URLSearchParams(location.search);
const num = (k, d) => {
  const v = parseFloat(params.get(k));
  return Number.isFinite(v) ? v : d;
};
export const USE_FEMTO = params.get("bron") !== "webcam";
// Camera behind the players: it already sees the room "as the players see it", so nothing may be
// mirrored. pose.js always mirrors (x -> 1 - x), so x is pre-flipped here to cancel that out.
export const CAMERA_BEHIND = params.get("achter") === "1";
const URL_BRIDGE = params.get("brug") || "ws://localhost:8765";

const ZONE_KEY = "krabbels-femto-zone";
function loadZone() {
  try {
    return JSON.parse(localStorage.getItem(ZONE_KEY)) || {};
  } catch {
    return {};
  }
}
export const ZONE = {
  min: num("min", 0.6), // metres from the camera
  max: num("max", 4.5),
  width: 3.5, // metres of room = full screen width
  centre: 0, // metres, camera x
  left: null, // calibrated edges (camera x, metres), or null
  right: null,
  source: "standaard",
};
function applyZone() {
  const z = loadZone();
  ZONE.left = z.left ?? null;
  ZONE.right = z.right ?? null;
  if (ZONE.left !== null && ZONE.right !== null && Math.abs(ZONE.right - ZONE.left) >= 1) {
    ZONE.width = Math.abs(ZONE.right - ZONE.left);
    ZONE.centre = (ZONE.left + ZONE.right) / 2;
    ZONE.source = "gekalibreerd";
  } else {
    ZONE.width = 3.5;
    ZONE.centre = 0;
    ZONE.source = "standaard";
  }
  if (params.has("breedte")) ZONE.width = num("breedte", ZONE.width), (ZONE.source = "url");
  if (params.has("midden")) ZONE.centre = num("midden", ZONE.centre), (ZONE.source = "url");
}
applyZone();

// Kalibratie: "I am standing at the left / right edge of the projection now".
// side: "left" | "right" | "clear". Returns a short message for the screen.
export function calibrate(side) {
  const z = loadZone();
  if (side === "clear") {
    localStorage.removeItem(ZONE_KEY);
    applyZone();
    return "afstelling gewist";
  }
  const b = femto.real[0];
  if (!b) return "niemand gezien";
  // The screen's left edge is the camera's left when the camera stands behind the players.
  const camSide = CAMERA_BEHIND ? side : side === "left" ? "right" : "left";
  z[camSide] = b.x;
  localStorage.setItem(ZONE_KEY, JSON.stringify(z));
  applyZone();
  return `${side === "left" ? "linkerrand" : "rechterrand"} = ${b.x.toFixed(2)} m`;
}
export function zoneLabel() {
  const edges = ZONE.left !== null || ZONE.right !== null ? `links ${fmt(ZONE.left)} · rechts ${fmt(ZONE.right)} · ` : "";
  return `speelveld (${ZONE.source}): ${edges}breedte ${ZONE.width.toFixed(2)} m · midden ${ZONE.centre.toFixed(2)} m · ${ZONE.min}–${ZONE.max} m van de camera`;
}
const fmt = (v) => (v === null ? "?" : v.toFixed(2) + " m");

if (USE_FEMTO) {
  // The One Euro filter below already smooths without lag, and x is in real metres:
  // no extra smoothing or sideways gain in pose.js.
  POSE.smoothing = 1;
  POSE.xGain = 1;
}

// MediaPipe landmark index -> bridge joint name (fallbacks after the first)
const MAP = {
  0: ["nose", "head"],
  11: ["shoulder_left"], 12: ["shoulder_right"],
  13: ["elbow_left"], 14: ["elbow_right"],
  15: ["wrist_left", "hand_left"], 16: ["wrist_right", "hand_right"],
  23: ["hip_left"], 24: ["hip_right"],
  25: ["knee_left"], 26: ["knee_right"],
  27: ["ankle_left"], 28: ["ankle_right"],
};

// Shared state read by main.js
export const femto = {
  connected: false,
  text: "verbinden met de Femto-brug...",
  result: null, // { landmarks: [...] } like MediaPipe
  seq: 0, // +1 per new skeleton frame
  image: null, // ImageBitmap of the IR image (only while wantImage(true))
  bodies: 0, // bodies seen by the camera (before the zone filter)
  inZone: 0,
  real: [], // bodies in the zone: [{ id, x, z }] metres (x right as the camera sees it, z = distance)
  fps: 0,
  latencyMs: 0,
  // Tracker.update reads the "video" size for the aspect ratio. Our x and y are both in metres
  // divided by ZONE.width, so the aspect ratio is 1.
  video: { videoWidth: 1, videoHeight: 1 },
};

// ---------------------------------------------------------------------
// One Euro filter (Casiez et al. 2012): low cut-off when slow (no jitter),
// higher cut-off when fast (no lag). Values in metres and seconds.
// ---------------------------------------------------------------------
const EURO = { minCutoff: 1.6, beta: 1.2, dCutoff: 1.0 };
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
class Euro {
  constructor() {
    this.x = null;
    this.dx = 0;
  }
  f(x, dt) {
    if (this.x === null) return (this.x = x);
    const dx = (x - this.x) / dt;
    this.dx += alpha(EURO.dCutoff, dt) * (dx - this.dx);
    const cutoff = EURO.minCutoff + EURO.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}
const filters = new Map(); // body id -> { t, joints: {name: [Euro, Euro, Euro]} }

function smoothBody(body, t) {
  let st = filters.get(body.id);
  if (!st || t - st.t > 0.5) st = { t, joints: {} };
  const dt = Math.max(1 / 120, Math.min(0.1, t - st.t || 1 / 30));
  st.t = t;
  filters.set(body.id, st);
  const out = {};
  for (const [name, p] of Object.entries(body.joints)) {
    const f = st.joints[name] || (st.joints[name] = [new Euro(), new Euro(), new Euro()]);
    out[name] = [f[0].f(p[0], dt), f[1].f(p[1], dt), f[2].f(p[2], dt)];
  }
  return out;
}

// 3D joints (metres) -> MediaPipe-like landmarks. Orthographic: x and y in metres / ZONE.width,
// so sizes and positions do not change with the distance to the camera.
function toLandmarks(body, J) {
  const C = body.confidence || {};
  const head = J.head || J.neck;
  const sx = CAMERA_BEHIND ? -1 : 1; // camera x points right in the image
  const out = [];
  for (let i = 0; i < 33; i++) {
    let p = null, c = 0;
    for (const name of MAP[i] || []) {
      if (J[name]) {
        p = J[name];
        c = (C[name] ?? 0) / 2; // bridge: 0 none, 1 low (estimated), 2 good -> 0, 0.5, 1
        break;
      }
    }
    if (!p) p = head;
    out.push({
      x: 0.5 + (sx * (p[0] - ZONE.centre)) / ZONE.width,
      y: 0.5 + p[1] / ZONE.width,
      z: p[2],
      // Joints the tracker could only estimate (e.g. the face, seen from behind) still get a sensible
      // position from the depth model: "low" (0.5) counts as just visible (POSE.minVisibility = 0.5).
      visibility: MAP[i] ? c : 0,
    });
  }
  // Solo: pose.js keeps the body with the lowest rank = closest to the middle of the play area.
  out.rank = Math.abs((J.pelvis || J.neck)[0] - ZONE.centre);
  return out;
}

function inZone(body) {
  const pel = body.joints && (body.joints.pelvis || body.joints.neck);
  if (!pel) return false;
  return pel[2] >= ZONE.min && pel[2] <= ZONE.max; // z = metres straight ahead from the camera
}

// ---------------------------------------------------------------------
let ws = null;
let imageWanted = false;

// Only ask the bridge for the IR image while it is shown (C): saves work in the bridge and here.
export function wantImage(on) {
  if (on === imageWanted) return;
  imageWanted = on;
  if (!on) femto.image = null;
  if (ws && ws.readyState === 1) ws.send(on ? "beeld" : "geen beeld");
}

export function startFemto() {
  let everConnected = false;
  let n = 0, t0 = performance.now();

  function connect() {
    ws = new WebSocket(URL_BRIDGE);
    ws.binaryType = "blob";
    ws.onopen = () => {
      everConnected = true;
      if (imageWanted) ws.send("beeld");
    };
    ws.onmessage = async (ev) => {
      if (typeof ev.data !== "string") {
        if (!imageWanted) return;
        try {
          femto.image = await createImageBitmap(ev.data);
        } catch {}
        return;
      }
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.status !== "ok") {
        femto.connected = false;
        femto.text = msg.text || msg.status;
        return;
      }
      femto.connected = true;
      femto.text = "verbonden";
      femto.latencyMs = msg.latency_ms ?? 0;
      const t = performance.now() / 1000;
      const all = msg.bodies || [];
      const zone = all.filter(inZone);
      femto.bodies = all.length;
      femto.inZone = zone.length;
      const smooth = zone.map((b) => [b, smoothBody(b, t)]);
      femto.real = smooth.map(([b, J]) => {
        const p = J.pelvis || J.neck;
        return { id: b.id, x: p[0], z: p[2] };
      });
      femto.result = { landmarks: smooth.map(([b, J]) => toLandmarks(b, J)) };
      for (const [id, st] of filters) if (t - st.t > 2) filters.delete(id);
      femto.seq++;
      n++;
      const now = performance.now();
      if (now - t0 >= 1000) {
        femto.fps = (n * 1000) / (now - t0);
        n = 0;
        t0 = now;
      }
    };
    ws.onclose = () => {
      femto.connected = false;
      femto.text = everConnected
        ? "Femto-brug kwijt, opnieuw verbinden..."
        : "Geen Femto-brug op " + URL_BRIDGE + ". Start de demo met start_demo_v2.bat.";
      setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  }
  connect();
}
