// =====================================================================
// femto.js - Femto Bolt as camera for the Krabbels testdemo.
//
// The skeletons come from krabbels-femto/bridge/skeleton_bridge.py (Azure Kinect Body Tracking
// on the depth image, NVIDIA GPU) over ws://localhost:8765. They are converted to the same
// shape as a MediaPipe PoseLandmarker result, so pose.js (Tracker) works unchanged.
//
// URL options:
//   ?bron=webcam        use the webcam + MediaPipe instead (old behaviour)
//   ?achter=0           camera stands IN FRONT of the players (selfie mirror, old behaviour)
//                       default: camera stands BEHIND the players, facing the projection wall
//   ?min=0.8&max=4.5    play zone: only people between these distances (metres) from the camera
//   ?brug=ws://host:port
// =====================================================================

const params = new URLSearchParams(location.search);
export const USE_FEMTO = params.get("bron") !== "webcam";
// Camera behind the players: what it sees is already "as the players see it", so it must NOT be
// mirrored. pose.js always mirrors (x -> 1 - x), so we pre-flip here to cancel that out.
export const CAMERA_BEHIND = params.get("achter") !== "0";

export const ZONE = {
  min: parseFloat(params.get("min") ?? "0.6"), // metres from the camera
  max: parseFloat(params.get("max") ?? "4.5"),
};
const URL_BRIDGE = params.get("brug") || "ws://localhost:8765";

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
  result: null, // { landmarks: [...] } like MediaPipe, null = nothing new
  seq: 0, // +1 per new skeleton frame
  imageSize: [640, 576],
  image: null, // ImageBitmap of the IR image (for the C preview)
  bodies: 0, // bodies seen by the camera (before zone filter)
  inZone: 0,
  fps: 0,
  latencyMs: 0,
  // fake <video> for Tracker.update (it only reads the size)
  get video() {
    return { videoWidth: this.imageSize[0], videoHeight: this.imageSize[1] };
  },
};

function toLandmarks(body) {
  const J2 = body.joints2d || {}, C = body.confidence || {};
  const head = J2.head || J2.neck || [0.5, 0.2];
  const out = [];
  for (let i = 0; i < 33; i++) {
    let p = null, c = 0;
    for (const name of MAP[i] || []) {
      if (J2[name]) {
        p = J2[name];
        c = (C[name] ?? 0) / 2; // bridge: 0 none, 1 low (estimated), 2 good -> 0, 0.5, 1
        break;
      }
    }
    if (!p) p = head;
    // Joints the tracker could only estimate (e.g. the face, seen from behind) still have a sensible
    // position thanks to the depth model: count "low" as just visible enough (0.5 = POSE.minVisibility).
    const x = CAMERA_BEHIND ? 1 - p[0] : p[0];
    out.push({ x, y: p[1], z: 0, visibility: MAP[i] ? c : 0 });
  }
  return out;
}

function inZone(body) {
  const pel = body.joints && (body.joints.pelvis || body.joints.neck);
  if (!pel) return false;
  const z = pel[2]; // metres, straight ahead from the camera
  return z >= ZONE.min && z <= ZONE.max;
}

export function startFemto() {
  let everConnected = false;
  let n = 0, t0 = performance.now();

  function connect() {
    const ws = new WebSocket(URL_BRIDGE);
    ws.binaryType = "blob";
    ws.onopen = () => {
      everConnected = true;
      ws.send("beeld"); // also send the IR image (for the C preview)
    };
    ws.onmessage = async (ev) => {
      if (typeof ev.data !== "string") {
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
      if (msg.image_size) femto.imageSize = msg.image_size;
      femto.latencyMs = msg.latency_ms ?? 0;
      const all = msg.bodies || [];
      const zone = all.filter(inZone);
      femto.bodies = all.length;
      femto.inZone = zone.length;
      femto.result = { landmarks: zone.map(toLandmarks) };
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
        : "Geen Femto-brug op " + URL_BRIDGE + ". Start de demo met start_demo.bat.";
      setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  }
  connect();
}
