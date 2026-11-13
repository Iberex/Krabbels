// =====================================================================
// camera.js - one place that turns ANY source into players for the game.
//
//   ?bron=femto   (default)   sources/femto.js  (Femto Bolt depth + Azure Kinect Body Tracking via the bridge)
//   ?bron=webcam              sources/webcam.js (colour camera + MediaPipe Pose in Chrome)
//   ?spiegel=0                do not mirror (default: mirrored, like looking in a mirror)
//
// Both sources deliver bodies in the same format:
//   { id, joints: {name: [x,y,z] metres}, joints2d: {name: [u,v] 0..1}, confidence: {name: 0..1} }
// Everything after that (pose detection, metrics, drawing) is shared, so the comparison is fair.
// =====================================================================

const params = new URLSearchParams(location.search);
export const SOURCE = params.get('bron') === 'webcam' ? 'webcam' : 'femto';
export const SOURCE_NAME = SOURCE === 'webcam' ? 'Webcam + MediaPipe' : 'Femto (diepte)';
export const OTHER_SOURCE = SOURCE === 'webcam' ? 'femto' : 'webcam';
export const MIRROR = params.get('spiegel') !== '0';

export const POSE = {
  maxAngle: 25,        // arm counts as "sideways" when within this many degrees of horizontal
  minConfidence: 0.5,  // shoulder, elbow and wrist must be at least this sure
  minStretch: 0.75,    // shoulder-wrist distance >= 75% of upper arm + forearm (arm is stretched)
  maxPlayers: 2,
};

// Shared state the game reads every frame
export const cam = {
  connected: false,
  statusText: 'starten...',
  players: [],          // see makePlayer()
  imageSize: [640, 576],
  image: null,          // ImageBitmap (femto) or <video> (webcam) for the preview
  fps: 0,
  latencyMs: 0,
  frames: 0,            // total skeleton frames received
};

const frameListeners = [];
export const onFrame = (fn) => frameListeners.push(fn);

// --------------------------------------------------------------------------------------------
export async function startCamera() {
  const mod = SOURCE === 'webcam' ? await import('./sources/webcam.js') : await import('./sources/femto.js');
  let fpsCount = 0, fpsT0 = performance.now();

  mod.start({
    status({ connected, text }) {
      cam.connected = connected;
      cam.statusText = text;
      if (!connected) cam.players = [];
    },
    image(img) {
      cam.image = img;
    },
    frame(bodies, imageSize, latencyMs) {
      cam.frames++;
      fpsCount++;
      const now = performance.now();
      if (now - fpsT0 >= 1000) {
        cam.fps = (fpsCount * 1000) / (now - fpsT0);
        fpsCount = 0;
        fpsT0 = now;
      }
      if (imageSize) cam.imageSize = imageSize;
      cam.latencyMs = latencyMs;
      cam.players = bodies
        .map(makePlayer)
        .filter(Boolean)
        .sort((a, b) => a.u - b.u)          // player 1 = leftmost on screen
        .slice(0, POSE.maxPlayers);
      for (const fn of frameListeners) fn(cam.players, latencyMs);
    },
  });
}

// --------------------------------------------------------------------------------------------
// One body -> one player: mirrored, relative to the neck, with arm analysis.
function makePlayer(body) {
  const J = body.joints, C = body.confidence;
  const need = ['neck', 'shoulder_left', 'shoulder_right', 'elbow_left', 'elbow_right', 'wrist_left', 'wrist_right'];
  if (!need.every((n) => J[n])) return null;

  const sx = MIRROR ? -1 : 1;
  const neck = J.neck;
  const rel = {};
  for (const [name, p] of Object.entries(J)) rel[name] = [(p[0] - neck[0]) * sx, p[1] - neck[1], p[2] - neck[2]];

  // horizontal position on screen (0..1), from the 2D neck (or shoulder middle)
  const n2 = body.joints2d.neck || mid(body.joints2d.shoulder_left, body.joints2d.shoulder_right);
  if (!n2) return null;
  const u = MIRROR ? 1 - n2[0] : n2[0];

  const left = arm(rel, C, 'left');
  const right = arm(rel, C, 'right');
  // "screenLeft" = the arm that is on the left side of the screen
  const [screenLeft, screenRight] = left.wrist[0] <= right.wrist[0] ? [left, right] : [right, left];
  const bridge = left.ok && right.ok;

  return { id: body.id, u, joints: rel, joints2d: body.joints2d, confidence: C, left, right, screenLeft, screenRight, bridge };
}

function arm(rel, C, side) {
  const s = rel[`shoulder_${side}`], e = rel[`elbow_${side}`], w = rel[`wrist_${side}`];
  const dx = w[0] - s[0], dy = w[1] - s[1];
  // 0 deg = horizontal, -90 = hanging down, +90 = straight up (y points down in camera space)
  const angle = (Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI;
  const length = dist(s, e) + dist(e, w);
  const stretch = length > 0 ? dist(s, w) / length : 0;
  const conf = Math.min(C[`shoulder_${side}`] ?? 0, C[`elbow_${side}`] ?? 0, C[`wrist_${side}`] ?? 0);
  const ok = Math.abs(angle) <= POSE.maxAngle && conf >= POSE.minConfidence && stretch >= POSE.minStretch;
  return { angle, conf, stretch, length, ok, shoulder: s, wrist: w };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mid = (a, b) => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null);
