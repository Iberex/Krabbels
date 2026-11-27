// =====================================================================
// Krabbels – Draw and Play (the drawing demo + the level game, together)
// Pick 1 or 2 players. Every player draws a Krabbel on the screen; the
// drawing flies into Krabbelland and comes to life. Then step back: your
// body casts a shadow onto the page, and for a Krabbel a shadow is solid
// ground. Make the right shape with your arms (bridge, ramp or ladder) in
// the right spot, and your Krabbels cross the gap. Six levels, then a
// sticker of your own Krabbels, then back to the attract screen.
// Webcam + MediaPipe Pose Landmarker (up to 2 people), drawn on one canvas.
// Nothing is uploaded: drawings and stickers stay in this browser tab.
// =====================================================================

import { Krabbel, makeStickers } from "./krabbel.js";
import { initDrawing, openDrawing, closeDrawing, updateDrawing, drawingIdleTime } from "./drawing.js";

// ---------------------------------------------------------------------
// CONFIG: every tuning value lives here.
// Units: "W" = fraction of the screen width, "H" = fraction of the
// screen height, "band" = fraction of the play band height.
// ---------------------------------------------------------------------
const CONFIG = {
  // --- Screen layout ---
  playBand: { top: 0.2, bottom: 0.8 }, // H. All action stays in this band. Its bottom is the floor line.

  // --- Shadow ---
  shadowTorso: 0.24, // band. On-screen shoulder-to-hip length. Scales the whole shadow (same size near or far).
  shadowAlpha: 0.5, // 0..1. The platforms stay readable through the shadow.
  xGain: 1.25, // How far the shadow moves per step you take. >1 = less walking needed.
  legToTorso: 1.6, // Leg length guess (× torso) to put the feet on the floor when your ankles are out of view.
  smoothing: 0.4, // 0..1. Landmark smoothing (exponential moving average). Lower = calmer but laggier.
  scaleSmoothing: 0.05, // 0..1. How fast the shadow size adapts when you walk closer or further away.
  measureSmoothing: 0.05, // 0..1. How fast your measured shoulder height / arm length adapt.
  minVisibility: 0.5, // 0..1. Landmarks below this visibility count as "not seen".

  // --- Gestures (angles in degrees) ---
  bridgeMaxAngle: 20, // Wrist line within 0..this from horizontal = BRIDGE.
  rampMinAngle: 25, // Wrist line between these = RAMP (up or down).
  rampMaxAngle: 65,
  ladderMinAngle: 70, // Both shoulder-to-wrist lines steeper than this, wrists above the head = LADDER.
  straightTolerance: 35, // How far each arm may point away from the wrist line and still be "one straight line".
  minArmSpread: 2.0, // Wrists at least this many shoulder-widths apart for BRIDGE / RAMP (arms stretched).
  holdMs: 300, // A gesture counts after being held this long.
  releaseMs: 200, // ...and stops counting after being gone this long (ignores one-frame glitches).
  rampDirectionMatters: true, // false = any ramp solves step_up and step_down.

  // --- Obstacles & ledges ---
  zoneWidth: 0.16, // W. Width of the "stand here" zone of an obstacle.
  gapSpan: 0.85, // Gap width as a fraction of your arm span (wrist to wrist).
  rampWidth: 0.75, // Horizontal size of a ramp step, fraction of your arm span.
  rampRise: 0.4, // Height difference of a ramp step, fraction of your arm span.
  reachFactor: 0.95, // "reach" ledges sit at this fraction of your raised-hands height.
  minSpan: 0.15, // W. Clamp the measured arm span, so levels always fit.
  maxSpan: 0.32, // W
  ladderInset: 0.025, // W. The ladder stands this far in front of the cliff wall.
  freezeOnRelease: true, // Shape dropped mid-crossing: true = characters pause, false = they walk back.

  // --- Hints (seconds a character has been waiting at an obstacle) ---
  hintPoseAfter: 6, // A ghost of the required pose pulses in the zone.
  hintZoneAfter: 12, // The zone glows on the floor line.
  hintPlankAfter: 20, // A helper plank appears, so nobody gets stuck.

  // --- Players ---
  maxPlayers: 2, // shadows tracked at the same time (2-player mode)

  // --- Characters (the drawn Krabbels) ---
  walkSpeed: 0.07, // W per second.
  walkSpeedStep: 0.01, // + and - keys.
  followGap: 0.12, // W. Distance between the two characters.
  edgeMargin: 0.012, // W. They stop this far from a ledge edge.
  krabbel: {
    size: 0.22, // H. Long side of the drawing in the world (about floor-to-shoulder of the shadow). Above ~0.24 heads get cut off on the high ladder ledges.
    legLength: 0.25, // × size. Stick legs (only for drawings without legs of their own).
    jumpHeight: 0.35, // × size. Happy hops.
    wobble: 0.018, // jelly wobble strength
    breathe: 0.03, // idle breathing (±3 %)
  },

  // --- The child's drawing comes first: never doubled eyes or legs ---
  eyes: "child", // "child" = only the googly eyes the child stuck on with the eye tool · "auto" = two eyes placed automatically · "off"
  legs: {
    mode: "auto", // "auto" = drawn legs swing, one stick hops, otherwise stick legs are added · "always" = always stick legs · "never" = never add stick legs
    scanUp: 0.7, // look this far up from the bottom (fraction of the height) for the hip, where drawn legs join the body
    maxWidth: 0.28, // a drawn leg is at most this wide (fraction of the body width)
    minLength: 0.1, // drawn legs are at least this long (fraction of the height); shorter = just a bumpy bottom
    footZone: 0.12, // wider bits in the lowest part (fraction of the height) count as drawn feet
    swing: 0.35, // radians. How far drawn legs swing while walking.
  },
  fillInside: true, // outline drawings get a paper-white inside, behind the strokes
  fillColor: "#fffdf4",

  // --- Drawing screen (see drawing.js) ---
  drawing: {
    size: 1024, // px. The drawing canvas is size × size internally, scaled to fit.
    colors: ["#f2614c", "#fdc73a", "#4cc38a", "#22b2b5", "#335ce0", "#8b6cf0", "#ff8ab3", "#1f2340"], // coral, yellow, green, teal, blue, purple, pink, dark ink
    startColor: 7, // index into colors
    brushSizes: [9, 20, 38], // brush radius in canvas px (of 1024)
    startBrush: 1,
    eraserScale: 1.6, // eraser = brush × this
    smoothing: 0.5, // 0..1. Higher = smoother lines, but they trail the finger a bit more.
    pencilPressure: true, // Apple Pencil: press harder = thicker line
    hintRadius: 0.34, // dotted hint circle, fraction of the sheet
    cropPadding: 20, // px around the drawing when it becomes a Krabbel
    minInkPixels: 80, // fewer drawn pixels than this = empty (the check button shakes)
    idleResetMs: 90000, // nobody touches the sheet this long: back to the attract screen
    eyeTool: true, // the googly eye button in the toolbar
    eyeSizes: [34, 58], // googly eye radius in canvas px: small (first brush button) and big (the other two)
  },
  timer: {
    enabled: false, // a shrinking circle; when it runs out, the drawing is sent
    seconds: 90,
    startOnFirstStroke: true,
  },
  flight: {
    lift: 0.45, // seconds: the drawing lifts off the paper
    fly: 1.15, // seconds: flying into the world
    arc: 0.28, // H. How high the flight curves.
    sparkleEvery: 0.028, // seconds between trail sparkles
    nextDrawingDelay: 2.4, // seconds of watching it come to life before player 2 draws
  },

  // --- Stickers (one per player, for the printer later) ---
  sticker: {
    download: true, // download a colour + a black-and-white PNG per Krabbel at the end
    size: 900, // px, about the long side of the colour PNG
    border: 0.05, // × size. Thick white cut-out border.
    outline: 4, // px. Thin dark cut line.
    bwWidth: 384, // px. Black-and-white PNG width (384 = 58 mm thermal printer, 203 dpi).
    bwMode: "dither", // "dither" or "threshold"
    bwThreshold: 150,
    bwGamma: 1.4,
    bwArtOutline: 1.5,
  },

  // --- Flow (seconds unless "Ms") ---
  attractEnterMs: 1000, // After drawing: stand in view this long to start level 1 (or tap play).
  idleResetMs: 20000, // Nobody in view this long during a level: back to the attract screen (not in debug mode).
  readyResetMs: 60000, // Drawings done but nobody steps in or taps play this long: back to the attract screen.
  levelFadeTime: 0.5,
  levelBadgeTime: 1.4, // How long the level number shows at the start of a level.
  introTime: 3, // Level 1 intro: wave, then look at the exit.
  crackTime: 0.9,
  stickerTime: 7,

  // --- Look (Krabbelland) ---
  colors: {
    paper: "#fbfaf4", // notebook paper
    grid: "rgba(84, 168, 205, 0.5)", // blue graph-paper lines
    ink: "#1f2340", // text and pencil lines
    floor: "#fdfcf6", // the torn paper strip at the bottom
    ledges: ["#fdc73a", "#4cc38a", "#ff8ab3", "#8b6cf0"], // coloured paper, used in turn (or set color on a ledge)
    shadow: "#2a2f4a", // the player's shadow (and the solid shadow bridges)
    glow: "#fdc73a", // warm glow around a solved shape
    star: "#fdc73a", // crayon star
    tape: "rgba(236, 222, 178, 0.85)", // masking tape (helper plank, cards)
    logo: "#2f6fd8", // KRABBELS letters
    doodles: ["#f04e45", "#fdc73a", "#4cc38a", "#ff8ab3", "#335ce0", "#8b6cf0"], // background doodles + confetti
  },

  // --- Camera & rendering ---
  showCameraAtStart: false, // The webcam image under the paper world (M toggles it).
  cameraOpacity: 0.25, // 0..1. Brightness of the webcam image when shown.
  cameraWidth: 1280, // Requested webcam resolution (the browser picks the closest).
  cameraHeight: 720,
  maxPixelRatio: 2, // Lower to 1 if FPS is low on a retina screen.

  // --- MediaPipe (pinned version) ---
  visionBundleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
  wasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  // "lite" is fastest. Swap "lite" for "full" (both places) for better tracking at 2.5 m, but lower FPS.
  modelUrl:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

// ---------------------------------------------------------------------
// TEXT: every string that can appear on screen, in Dutch (the audience is
// Flemish children aged 6–12; the camera / model messages are for the team).
// The debug overlay (D) stays in English.
// ---------------------------------------------------------------------
const TEXT = {
  stepIn: "Kom erin!",
  waitCamera: "Even geduld… mag de camera aan?",
  loadingModel: "Even geduld…",
  noCamera:
    "<strong>Geen camera beschikbaar.</strong><br>Open de pagina via <em>http://localhost</em> of <em>http://127.0.0.1</em> (Live Server). Browsers blokkeren de camera op file:// en op gewone http-netwerkadressen.",
  cameraStopped: "<strong>De camera is gestopt.</strong><br>Herlaad de pagina om opnieuw te proberen.",
  cameraFailed: "<strong>De camera start niet.</strong>",
  cameraBlocked: "<strong>De camera werd geblokkeerd.</strong><br>Klik op het camera-icoon in de adresbalk, sta de camera toe en herlaad de pagina.",
  cameraMissing: "<strong>Geen camera gevonden.</strong><br>Sluit een webcam aan en herlaad de pagina.",
  cameraBusy: "<strong>De camera wordt door een andere app gebruikt</strong> (Zoom, Teams, FaceTime…).<br>Sluit die app en herlaad de pagina.",
  modelFailed: "<strong>Het bewegingsmodel kon niet laden.</strong><br>Controleer de internetverbinding (het model komt van een CDN) en herlaad.",
  detectError: "<strong>Fout bij het volgen van bewegingen.</strong>",
  stickerError: "<strong>De sticker kon niet gemaakt worden.</strong>",
  frameError: "<strong>Er ging iets mis.</strong><br>Druk op D voor meer info.",
};

// ---------------------------------------------------------------------
// LEVELS: each level is one static scene, defined as data.
//
// ledges: the pieces of ground, left to right. The characters walk on them.
//   h      height above the floor line:
//            "floor"         on the floor line
//            "low" / "high"  just below / above shoulder height (for ramps)
//            "shoulder"      the player's shoulder height (for bridges)
//            "reach"         the player's raised-hands height (for ladders)
//            or a number:    fraction of the play band height (0..1)
//   w      width, fraction of the screen width. The last ledge has no w:
//          it fills the rest of the screen and holds the exit door.
//   float  true = a floating slab instead of a pillar down to the floor.
//   color  optional paper colour of the cap, e.g. "#3fae84" (default: CONFIG.colors.ledges in turn).
//
// obstacles: what lies between ledge i and ledge i+1 (one fewer than ledges).
//   type     "gap" | "step_up" | "step_down" | "cliff"
//   gesture  optional, overrides the default (gap → bridge, step_up → ramp_up,
//            step_down → ramp_down, cliff → ladder)
//   w        optional width (fraction of W). Default: based on the player's arm span.
//   zoneAt   optional centre of the stand-here zone (fraction of W).
//            Default: the middle of the obstacle (the ladder spot for cliffs).
//
// Heights are measured from the player(s) at the start of every level, so a
// small and a tall player can both solve every level. With two players the
// smaller measurements are used, so both can solve every obstacle.
// ---------------------------------------------------------------------
const LEVELS = [
  {
    name: "Bridge",
    ledges: [{ h: "shoulder", w: 0.2 }, { h: "shoulder", w: 0.16 }, { h: "shoulder" }],
    obstacles: [{ type: "gap" }, { type: "gap" }],
  },
  {
    name: "Ramp",
    ledges: [{ h: "low", w: 0.25 }, { h: "high", w: 0.2 }, { h: "low" }],
    obstacles: [{ type: "step_up" }, { type: "step_down" }],
  },
  {
    name: "Ladder",
    ledges: [{ h: "floor", w: 0.3 }, { h: "shoulder", w: 0.3 }, { h: "reach" }],
    obstacles: [{ type: "cliff" }, { type: "cliff" }],
  },
  {
    name: "Ladder + bridge",
    ledges: [{ h: "floor", w: 0.3 }, { h: "reach", w: 0.14 }, { h: "reach" }],
    obstacles: [{ type: "cliff" }, { type: "gap" }],
  },
  {
    name: "Bridge + ramp",
    ledges: [{ h: "low", w: 0.25 }, { h: "low", w: 0.12 }, { h: "high" }],
    obstacles: [{ type: "gap" }, { type: "step_up" }],
  },
  {
    name: "The big gap",
    ledges: [{ h: "shoulder", w: 0.2 }, { h: "shoulder", w: 0.07, float: true }, { h: "shoulder" }],
    obstacles: [{ type: "gap" }, { type: "gap" }],
  },
];

// ---------------------------------------------------------------------
// CHARACTERS: the Krabbels are the players' drawings (state.krabbels).
// These scribble colours are only used for the waving Krabbel on the attract
// screen and when a level is started with a key without drawings (testing).
// ---------------------------------------------------------------------
const DEFAULT_COLORS = ["#335ce0", "#f04e45"];

// Gestures
const G = { NONE: "none", BRIDGE: "bridge", RAMP_UP: "ramp_up", RAMP_DOWN: "ramp_down", LADDER: "ladder" };
const DEFAULT_GESTURE = { gap: G.BRIDGE, step_up: G.RAMP_UP, step_down: G.RAMP_DOWN, cliff: G.LADDER };
const GESTURE_LABEL = { none: "–", bridge: "BRIDGE", ramp_up: "RAMP ↗", ramp_down: "RAMP ↘", ladder: "LADDER" };

// MediaPipe landmark indices used for the shadow
const JOINTS = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
};

// ---------------------------------------------------------------------
// DOM + canvas setup
// ---------------------------------------------------------------------
const video = document.getElementById("webcam");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");
// On top of everything: a drawing flying into the world, with its sparkle trail.
const fxCanvas = document.getElementById("fx");
const fctx = fxCanvas.getContext("2d");
const modeScreen = document.getElementById("modeScreen");
const playBtn = document.getElementById("playBtn");

// The shadow is drawn opaque on its own canvas, then copied semi-transparent,
// so overlapping body parts don't show darker seams.
const shadowCanvas = document.createElement("canvas");
const sctx = shadowCanvas.getContext("2d");

// Static layers, painted once: the paper background (on resize) and the
// paper scenery of the current level (at level start).
const bgLayer = document.createElement("canvas");
const bgCtx = bgLayer.getContext("2d");
const sceneLayer = document.createElement("canvas");
const sceneCtx = sceneLayer.getContext("2d");
const blobCache = new Map(); // painted scribble bodies and crayon stars, per colour and size

let W = 0; // canvas size in CSS pixels
let H = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const [c, cx] of [
    [canvas, ctx],
    [shadowCanvas, sctx],
    [bgLayer, bgCtx],
    [sceneLayer, sceneCtx],
    [fxCanvas, fctx],
  ]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  blobCache.clear();
  renderBackground();
}
window.addEventListener("resize", () => {
  resize();
  for (const p of people) if (!p.present) p.measure = defaultMeasure();
  // Levels are built in pixels: rebuild the current one for the new size (e.g. after going fullscreen).
  if (state.mode === "draw" || state.mode === "ready") buildLobby();
  else if (level) startLevel(state.levelIndex, false);
  else renderScene(null);
});

const floorY = () => CONFIG.playBand.bottom * H;
const bandTop = () => CONFIG.playBand.top * H;
const bandHeight = () => floorY() - bandTop();

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const deg = (rad) => (rad * 180) / Math.PI;
const random = (min, max) => min + Math.random() * (max - min);
const vis = (lm) => lm.visibility ?? 1; // a missing score counts as visible

// Angle between two vectors, in degrees.
function angleBetween(u, v) {
  const d = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
  return deg(Math.acos(clamp(d, -1, 1)));
}

// ---------------------------------------------------------------------
// On-screen messages (loading / errors)
// ---------------------------------------------------------------------
const messages = {}; // key -> { text, isError }

function setMessage(key, text, isError = false) {
  if (text) messages[key] = { text, isError };
  else delete messages[key];

  const list = Object.values(messages);
  messageEl.innerHTML = list.map((m) => m.text).join("<br><br>");
  messageEl.classList.toggle("visible", list.length > 0);
  messageEl.classList.toggle("error", list.some((m) => m.isError));
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const state = {
  mode: "attract", // attract | draw | ready | levelIn | intro | play | levelOut | crack | sticker
  modeTime: 0, // seconds in the current mode
  withIntro: false, // play the level 1 intro after the level badge
  levelIndex: 0,
  stars: 0, // obstacles solved on the first try
  walkSpeed: CONFIG.walkSpeed,
  players: 1, // chosen on the attract screen: 1 or 2
  krabbels: [], // the players' drawings, come to life (player 1 first)
  drawingsDone: 0, // in "draw": how many players have sent their drawing
  nextDrawingAt: 0, // in "draw": modeTime when the sheet comes back for the next player (0 = not waiting)
  presentTime: 0, // ready screen: how long someone has been in view
  absentTime: 0, // ready screen / level: how long nobody has been in view
  crack: null, // crack lines for the final effect
  cameraOn: false,
  modelReady: false,
  debug: false,
  showCamera: CONFIG.showCameraAtStart,
  time: 0,
  fps: 0,
  lastError: null, // last error caught in the game loop (shown in debug)
};

// The tracked players (up to CONFIG.maxPlayers). A person keeps their slot
// from frame to frame, so each shadow keeps its own gesture timing.
function newPerson() {
  return {
    present: false,
    lms: null, // smoothed landmarks (normalized camera coordinates)
    camX: 0.5, // hip centre in camera coordinates, to recognise the same person next frame
    scale: null, // camera pixels -> screen pixels
    footCamY: null, // y of the feet in camera pixels
    body: null, // screen positions of the JOINTS (mirrored, feet on the floor)
    centerX: 0, // screen x of the body centre
    rawGesture: G.NONE,
    gesture: { candidate: G.NONE, since: 0, stable: G.NONE, lostSince: 0 }, // with hold / release timing
    measure: null, // { S: shoulder height, armLen, shoulderW } in screen px
  };
}
const people = Array.from({ length: CONFIG.maxPlayers }, newPerson);
const anyPresent = () => people.some((p) => p.present);

let level = null; // the current built level (see buildLevel)
let characters = [];
let particles = [];
let popups = []; // rising stars
let flights = []; // drawings on their way into the world
let fxParticles = []; // their sparkle trail (drawn on the fx canvas, above the drawing screen)
let attractKrabbel = null; // the waving scribble on the attract screen

// ---------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------
async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setMessage("camera", TEXT.noCamera, true);
    return;
  }

  setMessage("camera", TEXT.waitCamera);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: CONFIG.cameraWidth },
        height: { ideal: CONFIG.cameraHeight },
        facingMode: "user",
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    state.cameraOn = true;
    setMessage("camera", null);

    // E.g. the camera is unplugged or taken by another app.
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      state.cameraOn = false;
      setMessage("camera", TEXT.cameraStopped, true);
    });
  } catch (err) {
    console.error("Camera error:", err);
    let text = `${TEXT.cameraFailed}<br>${err.name}: ${err.message}`;
    if (err.name === "NotAllowedError") text = TEXT.cameraBlocked;
    else if (err.name === "NotFoundError") text = TEXT.cameraMissing;
    else if (err.name === "NotReadableError") text = TEXT.cameraBusy;
    setMessage("camera", text, true);
  }
}

// ---------------------------------------------------------------------
// Pose model (MediaPipe Tasks Vision)
// ---------------------------------------------------------------------
let landmarker = null;
let poseConnections = [];
let poseResult = null;
let lastVideoTime = -1;
let poseErrorShown = false;

async function initPose() {
  setMessage("model", TEXT.loadingModel);
  try {
    const { FilesetResolver, PoseLandmarker } = await import(CONFIG.visionBundleUrl);
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.wasmUrl);
    poseConnections = PoseLandmarker.POSE_CONNECTIONS || [];

    const options = (delegate) => ({
      baseOptions: { modelAssetPath: CONFIG.modelUrl, delegate },
      runningMode: "VIDEO",
      numPoses: CONFIG.maxPlayers,
    });

    // GPU is much faster; fall back to CPU if the GPU path is unavailable.
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options("GPU"));
    } catch (gpuErr) {
      console.warn("GPU delegate failed, using CPU:", gpuErr);
      landmarker = await PoseLandmarker.createFromOptions(fileset, options("CPU"));
    }

    state.modelReady = true;
    setMessage("model", null);
  } catch (err) {
    console.error("Model error:", err);
    setMessage("model", `${TEXT.modelFailed}<br><small>${err.message || err}</small>`, true);
  }
}

// Run pose detection once per new webcam frame.
function detectPose(now) {
  if (!landmarker || !state.cameraOn || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  try {
    poseResult = landmarker.detectForVideo(video, now);
    processPose();
  } catch (err) {
    console.error("Pose detection error:", err);
    if (!poseErrorShown) {
      poseErrorShown = true;
      setMessage("detect", `${TEXT.detectError}<br>${err.message || err}`, true);
    }
  }
}

// ---------------------------------------------------------------------
// The players' shadows
// ---------------------------------------------------------------------

// Match the detected poses to the player slots, then smooth each one. Called per detection.
function processPose() {
  const minVis = CONFIG.minVisibility;
  let found = ((poseResult && poseResult.landmarks) || []).filter((raw) => vis(raw[11]) >= minVis && vis(raw[12]) >= minVis);

  // In 1-player mode only the closest person casts a shadow (not a parent walking by).
  const allowed = state.mode === "attract" ? CONFIG.maxPlayers : Math.min(state.players, CONFIG.maxPlayers);
  const torso = (raw) => Math.abs((raw[23].y + raw[24].y) / 2 - (raw[11].y + raw[12].y) / 2);
  if (found.length > allowed) found = found.sort((a, b) => torso(b) - torso(a)).slice(0, allowed);

  // Every person keeps their slot: choose the assignment with the smallest jump in position.
  const hipX = (raw) => (raw[23].x + raw[24].x) / 2;
  const cost = (p, raw) => (p.present ? Math.abs(p.camX - hipX(raw)) : 0.5);
  let best = null;
  const options = found.length === 2 ? [[0, 1], [1, 0]] : found.length === 1 ? people.map((_, i) => [i]) : [[]];
  for (const slots of options) {
    if (slots.some((i) => i >= people.length)) continue;
    const c = slots.reduce((sum, slot, i) => sum + cost(people[slot], found[i]), 0);
    if (!best || c < best.c) best = { slots, c };
  }
  people.forEach((p, slot) => {
    const i = best.slots.indexOf(slot);
    if (i >= 0) {
      updatePerson(p, found[i]);
    } else {
      p.present = false;
      p.rawGesture = G.NONE;
    }
  });
}

function updatePerson(person, raw) {
  if (!person.present || !person.lms) {
    // Just appeared: start from the raw landmarks, no smoothing lag.
    person.lms = raw.map((l) => ({ x: l.x, y: l.y, v: vis(l) }));
    person.scale = null;
    person.footCamY = null;
  } else {
    // Exponential moving average on every landmark.
    const s = CONFIG.smoothing;
    raw.forEach((l, i) => {
      const p = person.lms[i];
      p.x += (l.x - p.x) * s;
      p.y += (l.y - p.y) * s;
      p.v += (vis(l) - p.v) * s;
    });
  }
  person.present = true;
  person.camX = (raw[23].x + raw[24].x) / 2;
  computeBody(person);
  measureBody(person);
  person.rawGesture = detectGesture(person.body);
}

// Map the smoothed landmarks to the screen:
// - mirrored, horizontal position follows where the player stands,
// - scaled to a fixed torso size (so distance to the camera doesn't matter),
// - feet standing on the floor line.
function computeBody(person) {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const L = person.lms;
  const cam = (i) => ({ x: L[i].x * vw, y: L[i].y * vh });
  const minVis = CONFIG.minVisibility;

  const hipMid = mid(cam(23), cam(24));
  const torsoCam = Math.max(1, dist(mid(cam(11), cam(12)), hipMid));

  const targetScale = (CONFIG.shadowTorso * bandHeight()) / torsoCam;
  person.scale = person.scale === null ? targetScale : lerp(person.scale, targetScale, CONFIG.scaleSmoothing);

  const anklesSeen = L[27].v >= minVis && L[28].v >= minVis;
  const footTarget = anklesSeen ? Math.max(cam(27).y, cam(28).y) : hipMid.y + CONFIG.legToTorso * torsoCam;
  person.footCamY = person.footCamY === null ? footTarget : lerp(person.footCamY, footTarget, 0.2);

  const mirroredX = 1 - (L[23].x + L[24].x) / 2;
  const centerX = clamp(W / 2 + (mirroredX - 0.5) * W * CONFIG.xGain, 0, W);
  const s = person.scale;
  const floor = floorY();
  const toScreen = (p) => ({ x: centerX - (p.x - hipMid.x) * s, y: floor - (person.footCamY - p.y) * s });

  const b = {};
  for (const [name, i] of Object.entries(JOINTS)) b[name] = toScreen(cam(i));

  // Legs out of view: let them hang straight down to the floor.
  for (const side of ["l", "r"]) {
    const knee = side === "l" ? 25 : 26;
    const ankle = side === "l" ? 27 : 28;
    if (L[knee].v < minVis || L[ankle].v < minVis) {
      const hip = b[side + "Hip"];
      b[side + "Knee"] = { x: hip.x, y: (hip.y + floor) / 2 };
      b[side + "Ankle"] = { x: hip.x, y: floor };
    }
  }

  person.body = b;
  person.centerX = (b.lShoulder.x + b.rShoulder.x + b.lHip.x + b.rHip.x) / 4;
}

// Default body measurements, used before anyone has been seen.
function defaultMeasure() {
  const T = CONFIG.shadowTorso * bandHeight();
  return { S: (CONFIG.legToTorso + 1) * T, armLen: 1.1 * T, shoulderW: 0.75 * T };
}

// Slowly follow the player's shoulder height and arm length on screen.
function measureBody(person) {
  const b = person.body;
  const S = floorY() - (b.lShoulder.y + b.rShoulder.y) / 2;
  const armLen = Math.max(
    dist(b.lShoulder, b.lElbow) + dist(b.lElbow, b.lWrist),
    dist(b.rShoulder, b.rElbow) + dist(b.rElbow, b.rWrist)
  );
  const shoulderW = dist(b.lShoulder, b.rShoulder);
  const m = person.measure;
  const k = CONFIG.measureSmoothing;
  m.S = lerp(m.S, S, k);
  m.armLen = lerp(m.armLen, armLen, k);
  m.shoulderW = lerp(m.shoulderW, shoulderW, k);
}

// The measurements a level is built from. Two players: the smaller of both,
// so either of them can reach every ledge and span every gap.
function levelMeasure() {
  const seen = people.filter((p) => p.present).map((p) => p.measure);
  const list = seen.length ? seen : [people[0].measure];
  const min = (key) => Math.min(...list.map((m) => m[key]));
  return { S: min("S"), armLen: min("armLen"), shoulderW: min("shoulderW") };
}

// ---------------------------------------------------------------------
// Gestures (from shoulders 11/12 and wrists 15/16, in screen space)
// ---------------------------------------------------------------------
function detectGesture(b) {
  const arms = [
    { sh: b.lShoulder, wr: b.lWrist },
    { sh: b.rShoulder, wr: b.rWrist },
  ];

  // LADDER: both arms up, steep, wrists above the head.
  const isUp = (a) => {
    const rise = a.sh.y - a.wr.y;
    return rise > 0 && deg(Math.atan2(rise, Math.abs(a.wr.x - a.sh.x))) > CONFIG.ladderMinAngle && a.wr.y < b.nose.y;
  };
  if (arms.every(isUp)) return G.LADDER;

  // BRIDGE / RAMP: arms stretched out in one straight line.
  const [left, right] = arms[0].wr.x < arms[1].wr.x ? arms : [arms[1], arms[0]]; // by screen x
  const shoulderW = Math.max(1, dist(b.lShoulder, b.rShoulder));
  if (dist(left.wr, right.wr) < CONFIG.minArmSpread * shoulderW) return G.NONE;

  const line = { x: right.wr.x - left.wr.x, y: right.wr.y - left.wr.y }; // left wrist -> right wrist
  const rightArm = { x: right.wr.x - right.sh.x, y: right.wr.y - right.sh.y };
  const leftArm = { x: left.wr.x - left.sh.x, y: left.wr.y - left.sh.y };
  const tol = CONFIG.straightTolerance;
  if (angleBetween(rightArm, line) > tol || angleBetween(leftArm, { x: -line.x, y: -line.y }) > tol) return G.NONE;

  const angle = deg(Math.atan2(Math.abs(line.y), Math.abs(line.x)));
  if (angle <= CONFIG.bridgeMaxAngle) return G.BRIDGE;
  if (angle >= CONFIG.rampMinAngle && angle <= CONFIG.rampMaxAngle) {
    return line.y < 0 ? G.RAMP_UP : G.RAMP_DOWN; // right hand higher = rising to the right
  }
  return G.NONE;
}

// A gesture becomes "stable" after holdMs, and drops after releaseMs without it.
function updateGestures(now) {
  for (const person of people) updateGesture(person, now);
}

function updateGesture(person, now) {
  const gesture = person.gesture;
  const raw = person.present ? person.rawGesture : G.NONE;
  if (raw !== gesture.candidate) {
    gesture.candidate = raw;
    gesture.since = now;
  }
  if (raw === gesture.stable) {
    gesture.lostSince = 0;
  } else {
    if (!gesture.lostSince) gesture.lostSince = now;
    if (now - gesture.lostSince >= CONFIG.releaseMs) gesture.stable = G.NONE;
  }
  if (raw !== G.NONE && raw !== gesture.stable && now - gesture.since >= CONFIG.holdMs) {
    gesture.stable = raw;
    gesture.lostSince = 0;
  }
}

function gestureMatches(have, need) {
  if (have === need) return true;
  const ramps = [G.RAMP_UP, G.RAMP_DOWN];
  return !CONFIG.rampDirectionMatters && ramps.includes(have) && ramps.includes(need);
}

// ---------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------

// Turn a LEVELS entry into pixel geometry, using the player's measurements.
function buildLevel(index) {
  const def = LEVELS[index];
  const m = levelMeasure();
  const floor = floorY();
  const bandH = bandHeight();
  const span = clamp(2 * m.armLen + m.shoulderW, CONFIG.minSpan * W, CONFIG.maxSpan * W);
  const reach = m.S + m.armLen * CONFIG.reachFactor;

  const heightOf = (h) => {
    let px;
    if (typeof h === "number") px = h * bandH;
    else if (h === "floor") px = 0;
    else if (h === "low") px = m.S - (CONFIG.rampRise * span) / 2;
    else if (h === "high") px = m.S + (CONFIG.rampRise * span) / 2;
    else if (h === "reach") px = reach;
    else px = m.S; // "shoulder"
    return h === "floor" ? 0 : clamp(px, 0.1 * bandH, bandH);
  };
  const obstacleWidth = (o) => {
    if (o.w !== undefined) return o.w * W;
    if (o.type === "gap") return CONFIG.gapSpan * span;
    if (o.type === "step_up" || o.type === "step_down") return CONFIG.rampWidth * span;
    return 0; // cliff: a straight wall
  };

  // Everything except the last ledge has a fixed width; shrink it all if it doesn't fit.
  let fixed = 0;
  def.ledges.slice(0, -1).forEach((l) => (fixed += (l.w ?? 0.2) * W));
  def.obstacles.forEach((o) => (fixed += obstacleWidth(o)));
  const fit = Math.min(1, (W * 0.85) / fixed);

  const ledges = [];
  const obstacles = [];
  let x = 0;
  def.ledges.forEach((l, i) => {
    const last = i === def.ledges.length - 1;
    const w = last ? W - x : (l.w ?? 0.2) * W * fit;
    const h = heightOf(l.h);
    const color = l.color || CONFIG.colors.ledges[i % CONFIG.colors.ledges.length];
    ledges.push({ x0: x, x1: x + w, top: floor - h, float: !!l.float, color });
    x += w;
    if (!last) {
      const ow = obstacleWidth(def.obstacles[i]) * fit;
      obstacles.push({ def: def.obstacles[i], x0: x, x1: x + ow });
      x += ow;
    }
  });

  const margin = CONFIG.edgeMargin * W;
  obstacles.forEach((o, i) => {
    const a = ledges[i];
    const b = ledges[i + 1];
    o.type = o.def.type;
    o.gesture = o.def.gesture || DEFAULT_GESTURE[o.type];
    o.a = a;
    o.b = b;
    let zoneCenter;
    if (o.type === "cliff") {
      // Wait in front of the ladder, climb it, step onto the higher ledge.
      o.ladderX = a.x1 - CONFIG.ladderInset * W;
      o.path = [
        { x: o.ladderX - margin, y: a.top },
        { x: o.ladderX, y: a.top },
        { x: o.ladderX, y: b.top },
        { x: b.x0 + margin, y: b.top },
      ];
      zoneCenter = o.ladderX;
    } else {
      // Walk from edge to edge along the bridge / ramp.
      o.path = [
        { x: a.x1 - margin, y: a.top },
        { x: a.x1, y: a.top },
        { x: b.x0, y: b.top },
        { x: b.x0 + margin, y: b.top },
      ];
      zoneCenter = (a.x1 + b.x0) / 2;
    }
    if (o.def.zoneAt !== undefined) zoneCenter = o.def.zoneAt * W;
    const zw = (CONFIG.zoneWidth * W) / 2;
    o.zone = [zoneCenter - zw, zoneCenter + zw];
    o.pathLen = pathLength(o.path);
    Object.assign(o, {
      waitTime: 0, // seconds a character waited here without a solution (drives the hints)
      solved: false, // right now: right shape in the right spot (or helper plank)
      inZone: false,
      shapeOk: false,
      everSolved: false,
      helper: false, // helper plank appeared
      dropped: false, // shape dropped while someone was crossing
      crossedBy: 0,
      done: false,
    });
  });

  const lastLedge = ledges[ledges.length - 1];
  const doorH = Math.max(0.14 * H, krabbelPx() * (1 + CONFIG.krabbel.legLength) * 1.15); // the Krabbels fit through
  const door = { x: W - 0.07 * W, y: lastLedge.top, w: Math.max(0.045 * W, doorH * 0.36), h: doorH };
  return { index, def, ledges, obstacles, door, span };
}

function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

// Point at distance d along a path, plus whether that bit is vertical (climbing).
function pointOnPath(path, d) {
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1], path[i]);
    if (d <= seg || i === path.length - 1) {
      const t = seg ? clamp(d / seg, 0, 1) : 1;
      const p = path[i - 1];
      const q = path[i];
      return { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), climbing: Math.abs(q.x - p.x) < 1 };
    }
    d -= seg;
  }
  return { ...path[path.length - 1], climbing: false };
}

function startLevel(index, withIntro) {
  closeDrawing();
  flights = [];
  fxParticles = [];
  state.levelIndex = index;
  state.withIntro = withIntro;
  level = buildLevel(index);
  renderScene(level);
  particles = [];
  popups = [];
  const ks = ensureKrabbels();
  characters = ks.map((k, i) => {
    const x = slotX(i, ks.length);
    if (k.size !== krabbelPx()) k.setSize(krabbelPx());
    k.placeAt(x, level.ledges[0].top);
    k.scale = 1;
    k.alpha = 1;
    k.facing = 1;
    return {
      k, // the Krabbel (the player's drawing come to life)
      index: i,
      x,
      y: level.ledges[0].top,
      ledge: 0, // index of the ledge it walks on
      state: "walk", // walk | wait | cross | exit | gone
      obstacle: null, // obstacle it waits at / crosses
      pathDist: 0,
      moving: false,
      climbing: false,
      exitT: 0,
      waitT: 0, // seconds waiting at the current obstacle (for the "!" marks)
      waved: false, // level 1 intro
    };
  });
  setMode("levelIn");
  showUi();
}

function setMode(mode) {
  state.mode = mode;
  state.modeTime = 0;
}

function goAttract() {
  closeDrawing();
  level = null;
  characters = [];
  state.krabbels = [];
  flights = [];
  fxParticles = [];
  renderScene(null);
  state.presentTime = 0;
  setMode("attract");
  showUi();
}

// Only the buttons of the current screen are visible.
function showUi() {
  modeScreen.classList.toggle("hidden", state.mode !== "attract");
  playBtn.classList.toggle("hidden", state.mode !== "ready");
}

// ---------------------------------------------------------------------
// Drawing → Krabbels (the Drawing Life part)
// ---------------------------------------------------------------------
const krabbelPx = () => Math.max(40, CONFIG.krabbel.size * H);

// Where Krabbel i of n stands at the start of a level (i = 0 walks in front).
// Both stay on the first ledge; with big drawings they overlap a little.
function slotX(i, n) {
  const half = krabbelPx() * 0.4;
  const gap = CONFIG.followGap * W;
  const ledge = level.ledges[0];
  const front = Math.min(ledge.x1 - CONFIG.edgeMargin * W - half * 0.5, CONFIG.edgeMargin * W * 2 + half + (n - 1) * gap);
  return Math.max(krabbelPx() * 0.55, front - i * gap);
}

// eyes: the googly eyes the child stuck on ([{ x, y, r }] in image px), or "auto" for our own scribbles.
function makeKrabbel(image, x, y, popIn, eyes = "auto") {
  const kc = CONFIG.krabbel;
  const L = CONFIG.legs;
  return new Krabbel(image, {
    x,
    y,
    size: krabbelPx(),
    legLength: kc.legLength,
    jumpHeight: kc.jumpHeight,
    wobble: kc.wobble,
    breathe: kc.breathe,
    gravity: 2.6 * H,
    walkSpeed: CONFIG.walkSpeed * W,
    eyes: CONFIG.eyes === "child" ? eyes : CONFIG.eyes,
    legs: L.mode,
    legDetect: { scanUp: L.scanUp, maxWidth: L.maxWidth, minLength: L.minLength, footZone: L.footZone },
    legSwing: L.swing,
    fillInside: CONFIG.fillInside ? CONFIG.fillColor : null,
    ink: CONFIG.colors.ink,
    maxPixelRatio: CONFIG.maxPixelRatio,
    popIn,
  });
}

// Started with a key without drawings (testing): coloured scribbles instead.
function ensureKrabbels() {
  if (!state.krabbels.length) {
    state.krabbels = DEFAULT_COLORS.slice(0, state.players).map((color) => makeKrabbel(scribbleBody(color, 60).canvas, 0, 0, false));
  }
  return state.krabbels;
}

// The attract screen: 1 or 2 players.
function chooseMode(players) {
  state.players = clamp(players, 1, CONFIG.maxPlayers);
  state.krabbels = [];
  state.drawingsDone = 0;
  state.nextDrawingAt = 0;
  state.stars = 0;
  setMode("draw");
  buildLobby();
  openDrawing({ player: 1, players: state.players });
  showUi();
}

// While drawing, level 1 is the backdrop; the Krabbels wait on its first ledge.
function buildLobby() {
  level = buildLevel(0);
  renderScene(level);
  characters = [];
  state.krabbels.forEach((k, i) => {
    if (k.size !== krabbelPx()) k.setSize(krabbelPx());
    k.placeAt(slotX(i, state.players), level.ledges[0].top);
  });
}

// The green check on the drawing screen (drawing.js). The drawing is already cropped.
function onDrawingDone(crop, sheetRect) {
  const i = state.drawingsDone++;
  launchFlight(crop, sheetRect, i);
  if (state.drawingsDone < state.players) {
    const f = CONFIG.flight;
    state.nextDrawingAt = state.modeTime + f.lift + f.fly + f.nextDrawingDelay;
  }
}

// The drawing lifts off the sheet, flies onto the first ledge and pops to life there.
function launchFlight(crop, sheetRect, index) {
  const k = sheetRect.width / CONFIG.drawing.size;
  const b = crop.box;
  const from = { x: sheetRect.left + (b.x + b.w / 2) * k, y: sheetRect.top + (b.y + b.h / 2) * k, w: b.w * k, h: b.h * k };
  const krabbel = makeKrabbel(crop.canvas, slotX(index, state.players), level.ledges[0].top, true, crop.eyes || []);
  const r = krabbel.bodyRect();
  const to = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
  flights.push({ img: flightImage(krabbel), from, to, t: 0, trailT: 0, krabbel });
}

// What flies: the drawing (filled in) with the googly eyes the child stuck on.
function flightImage(k) {
  const c = document.createElement("canvas");
  c.width = k.image.width;
  c.height = k.image.height;
  const g = c.getContext("2d");
  g.drawImage(k.image, 0, 0);
  if (CONFIG.eyes !== "child") return c;
  for (const e of k.eyeList) {
    g.fillStyle = "#ffffff";
    g.strokeStyle = CONFIG.colors.ink;
    g.lineWidth = Math.max(2, e.r * 0.13);
    g.beginPath();
    g.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#111111";
    g.beginPath();
    g.arc(e.x, e.y + e.r * 0.2, e.r * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function flightPose(f) {
  const { lift, fly } = CONFIG.flight;
  const lifted = { x: f.from.x, y: f.from.y - 18 };
  if (f.t < lift) {
    const u = 1 - (1 - f.t / lift) ** 2;
    return { x: f.from.x, y: f.from.y - 18 * u, w: f.from.w * (1 + 0.06 * u), h: f.from.h * (1 + 0.06 * u), rot: -0.05 * u, lift: u };
  }
  const u = clamp((f.t - lift) / fly, 0, 1);
  const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  const c = { x: (lifted.x + f.to.x) / 2, y: Math.min(lifted.y, f.to.y) - CONFIG.flight.arc * H };
  const q = 1 - e;
  return {
    x: q * q * lifted.x + 2 * q * e * c.x + e * e * f.to.x,
    y: q * q * lifted.y + 2 * q * e * c.y + e * e * f.to.y,
    w: lerp(f.from.w * 1.06, f.to.w, e),
    h: lerp(f.from.h * 1.06, f.to.h, e),
    rot: -0.05 * (1 - u) + Math.sin(u * Math.PI * 3) * 0.16 * (1 - u),
    lift: 1 - e,
  };
}

function updateFlights(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t += dt;
    if (f.t > CONFIG.flight.lift) {
      f.trailT -= dt;
      while (f.trailT <= 0) {
        f.trailT += CONFIG.flight.sparkleEvery;
        const p = flightPose(f);
        const life = random(0.6, 1.1);
        fxParticles.push({
          x: p.x + random(-0.3, 0.3) * p.w,
          y: p.y + random(-0.3, 0.3) * p.h,
          vx: random(-60, 60),
          vy: random(-60, 30),
          size: random(5, 11) * (H / 900),
          type: [0, 0, 1, 4][Math.floor(random(0, 4))], // stars, spirals, plus signs
          color: CONFIG.colors.doodles[Math.floor(random(0, CONFIG.colors.doodles.length))],
          rot: random(0, 6.28),
          spin: random(-5, 5),
          life,
          maxLife: life,
        });
      }
    }
    if (f.t >= CONFIG.flight.lift + CONFIG.flight.fly) {
      flights.splice(i, 1);
      state.krabbels.push(f.krabbel); // pop!
      burst(f.to.x, f.to.y, CONFIG.colors.doodles, 16);
    }
  }
  for (const p of fxParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 120 * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
  }
  fxParticles = fxParticles.filter((p) => p.life > 0);
}

let fxDirty = false;
function drawFx() {
  if (!flights.length && !fxParticles.length && !fxDirty) return;
  fctx.clearRect(0, 0, W, H);
  for (const p of fxParticles) {
    fctx.globalAlpha = clamp((p.life / p.maxLife) * 1.6, 0, 1);
    drawDoodle(fctx, p.x, p.y, p.size, p.type, p.color, p.rot);
  }
  fctx.globalAlpha = 1;
  for (const f of flights) {
    const p = flightPose(f);
    fctx.save();
    fctx.translate(p.x, p.y);
    fctx.rotate(p.rot);
    fctx.shadowColor = "rgba(31, 35, 64, 0.3)";
    fctx.shadowBlur = 26 * p.lift;
    fctx.shadowOffsetY = 16 * p.lift;
    fctx.drawImage(f.img, -p.w / 2, -p.h / 2, p.w, p.h);
    fctx.restore();
  }
  fxDirty = flights.length > 0 || fxParticles.length > 0;
}

// One sticker per Krabbel (colour + black and white), downloaded for the printer.
function exportStickers() {
  if (!CONFIG.sticker.download) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  state.krabbels.forEach((k, i) => {
    try {
      const { color, bw } = makeStickers(k, CONFIG.sticker);
      setTimeout(() => downloadCanvas(color, `krabbel-${stamp}-player${i + 1}-color.png`), i * 800);
      setTimeout(() => downloadCanvas(bw, `krabbel-${stamp}-player${i + 1}-bw.png`), i * 800 + 400);
    } catch (err) {
      console.error("Sticker error:", err);
      setMessage("sticker", `${TEXT.stickerError}<br>${err.message}`, true);
    }
  });
}

function downloadCanvas(c, name) {
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}

// ---------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------
function updateFlow(dt) {
  state.modeTime += dt;

  switch (state.mode) {
    case "attract":
      // Waiting for a tap on 1 or 2 players. The scribble on the floor waves now and then.
      if (attractKrabbel && !attractKrabbel.busy && Math.random() < dt / 3) attractKrabbel.wave();
      if (attractKrabbel) attractKrabbel.update(dt);
      break;
    case "draw": {
      // The next player's sheet comes back after watching the last drawing come to life.
      if (state.nextDrawingAt && state.modeTime >= state.nextDrawingAt) {
        state.nextDrawingAt = 0;
        openDrawing({ player: state.drawingsDone + 1, players: state.players });
      }
      const allLanded = state.drawingsDone >= state.players && !flights.length;
      if (allLanded && state.krabbels.every((k) => k.introT < 0)) {
        state.presentTime = 0;
        setMode("ready");
        showUi();
      }
      if (drawingIdleTime() * 1000 >= CONFIG.drawing.idleResetMs) goAttract();
      break;
    }
    case "ready":
      // Everyone drew: step in (or tap play) to start level 1.
      state.presentTime = anyPresent() ? state.presentTime + dt : 0;
      for (const k of state.krabbels) if (!k.busy && Math.random() < dt / 2.5) k.wave();
      if (state.presentTime * 1000 >= CONFIG.attractEnterMs) startLevel(0, true);
      break;
    case "levelIn":
      if (state.modeTime >= CONFIG.levelBadgeTime) setMode(state.withIntro ? "intro" : "play");
      break;
    case "intro":
      updateIntro();
      if (state.modeTime >= CONFIG.introTime) setMode("play");
      break;
    case "play":
      updateObstacles(dt);
      for (const c of characters) updateCharacter(c, dt);
      if (characters.every((c) => c.state === "gone")) {
        setMode(state.levelIndex === LEVELS.length - 1 ? "crack" : "levelOut");
        if (state.mode === "crack") state.crack = makeCrack(level.door.x, level.door.y - level.door.h / 2);
      }
      break;
    case "levelOut":
      if (state.modeTime >= CONFIG.levelFadeTime) startLevel(state.levelIndex + 1, false);
      break;
    case "crack":
      if (state.modeTime >= CONFIG.crackTime) {
        setMode("sticker");
        exportStickers();
      }
      break;
    case "sticker":
      if (state.modeTime >= CONFIG.stickerTime) goAttract();
      break;
  }

  // Outside "play" the Krabbels still breathe, blink and wobble.
  if (state.mode !== "play" && state.mode !== "attract") {
    if (characters.length) for (const c of characters) c.k.update(dt);
    else for (const k of state.krabbels) k.update(dt);
  }

  // Nobody in view for a while (ready screen or a level): back to the attract screen.
  // Not while drawing: the child stands at the screen, maybe out of the camera's view.
  // The ready screen waits longer, so fresh drawings aren't thrown away too soon.
  const watching = state.cameraOn && state.modelReady && !state.debug;
  const idleModes = !["attract", "draw", "sticker"].includes(state.mode);
  if (idleModes && watching && !anyPresent()) {
    state.absentTime += dt;
    const limit = state.mode === "ready" ? CONFIG.readyResetMs : CONFIG.idleResetMs;
    if (state.absentTime * 1000 >= limit) goAttract();
  } else {
    state.absentTime = 0;
  }
}

// Level 1 intro: the Krabbels wave at the players, then look at the exit door.
function updateIntro() {
  const t = state.modeTime / CONFIG.introTime;
  for (const c of characters) {
    if (!c.waved && t > 0.15 + c.index * 0.1) {
      c.waved = true;
      c.k.wave();
    }
    if (t >= 0.6) c.k.lookAt(1, -0.15, 0.2);
  }
}

// Is each obstacle solved right now? Also drives the hint timers.
function updateObstacles(dt) {
  for (const o of level.obstacles) {
    if (o.done) {
      o.solved = false;
      continue;
    }
    // Any player can solve it: the right shape, held by someone standing in the zone.
    const inZone = (p) => p.present && p.centerX >= o.zone[0] && p.centerX <= o.zone[1];
    const shapeOk = (p) => gestureMatches(p.gesture.stable, o.gesture);
    o.inZone = people.some(inZone);
    o.shapeOk = people.some(shapeOk);
    o.solved = o.helper || people.some((p) => inZone(p) && shapeOk(p));

    if (o.solved && !o.everSolved) {
      o.everSolved = true;
      celebrateSolve(o);
    }

    // Someone is stuck here (waiting, or paused mid-crossing): count towards the hints.
    const stuck = characters.some((c) => c.obstacle === o && (c.state === "wait" || c.state === "cross"));
    if (stuck && !o.solved) {
      o.waitTime += dt;
      if (o.waitTime >= CONFIG.hintPlankAfter) o.helper = true;
    }
  }
}

function updateCharacter(c, dt) {
  const speed = state.walkSpeed * W;
  const leader = c.index > 0 ? characters[c.index - 1] : null; // the one walking in front
  const followGap = CONFIG.followGap * W;
  c.moving = false;
  c.climbing = false;

  if (c.state === "walk") {
    const ledge = level.ledges[c.ledge];
    const onLast = c.ledge === level.ledges.length - 1;
    const edgeX = onLast ? level.door.x : level.obstacles[c.ledge].path[0].x;
    let target = edgeX;
    if (leader && leader.state !== "gone" && leader.ledge === c.ledge) target = Math.min(target, leader.x - followGap);
    if (c.x < target) {
      c.x = Math.min(target, c.x + speed * dt);
      c.moving = true;
    }
    c.y = ledge.top;
    if (c.x >= edgeX - 0.5) {
      if (onLast) {
        c.state = "exit";
        c.exitT = 0;
      } else {
        c.state = "wait";
        c.obstacle = level.obstacles[c.ledge];
        c.waitT = 0;
      }
    }
  } else if (c.state === "wait") {
    const o = c.obstacle;
    c.waitT += dt;
    // One after the other: the one in front must be off the obstacle with room to land.
    const landingX = o.path[o.path.length - 1].x;
    const room =
      !leader ||
      leader.state === "gone" ||
      leader.ledge > c.ledge + 1 ||
      (leader.ledge === c.ledge + 1 && leader.x - followGap >= landingX);
    if (o.solved && room) {
      c.state = "cross";
      c.pathDist = 0;
    }
  } else if (c.state === "cross") {
    const o = c.obstacle;
    if (o.solved) {
      c.pathDist += speed * dt;
      c.moving = true;
    } else {
      // Shape dropped mid-crossing: pause in place (or walk back).
      o.dropped = true;
      if (!CONFIG.freezeOnRelease) {
        c.pathDist = Math.max(0, c.pathDist - speed * dt);
        c.moving = true;
        if (c.pathDist === 0) c.state = "wait";
      }
    }
    const p = pointOnPath(o.path, c.pathDist);
    c.x = p.x;
    c.y = p.y;
    c.climbing = p.climbing && c.moving;

    if (c.pathDist >= o.pathLen) {
      c.ledge++;
      c.state = "walk";
      c.obstacle = null;
      c.k.boing();
      o.crossedBy++;
      if (o.crossedBy === characters.length) obstacleDone(o);
    }
  } else if (c.state === "exit") {
    c.exitT += dt;
    if (c.exitT >= 0.5) c.state = "gone";
  }

  // The Krabbel follows the character: it sees the movement and walks, wobbles and blinks by itself.
  const k = c.k;
  k.x = c.x;
  if (!k.airborne) k.y = c.y; // during a happy hop it handles its own height
  if (!c.moving || c.climbing) {
    const look = lookDirection(c);
    k.lookAt(look.x, look.y, 0.15);
  }
  if (c.state === "exit") k.scale = Math.max(0, 1 - c.exitT / 0.5);
  k.update(dt);
}

// Right shape in the right place for the first time: everybody cheers.
function celebrateSolve(o) {
  for (const c of characters) {
    if ((c.state === "walk" || c.state === "wait") && !c.k.airborne) c.k.jump({ height: c.k.size * CONFIG.krabbel.jumpHeight });
  }
  const [p, q] = snapLine(o);
  for (let i = 0; i < 20; i++) {
    const t = Math.random();
    burst(lerp(p.x, q.x, t), lerp(p.y, q.y, t), CONFIG.colors.doodles, 1);
  }
}

// Both characters made it across.
function obstacleDone(o) {
  o.done = true;
  if (!o.helper && !o.dropped) {
    state.stars++;
    const end = o.path[o.path.length - 1];
    popups.push({ x: end.x, y: end.y - krabbelPx() * 1.7, life: 1.2 });
    burst(end.x, end.y - krabbelPx() * 1.3, CONFIG.colors.doodles, 16);
  }
}

function burst(x, y, colors, count) {
  for (let i = 0; i < count; i++) {
    const angle = random(-Math.PI, 0);
    const speed = random(0.1, 0.4) * H;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.8, 1.4),
      maxLife: 1.4,
      size: random(5, 9), // a little doodle
      type: Math.floor(random(0, 7)),
      rot: random(0, Math.PI * 2),
      spin: random(-6, 6),
      color: colors[i % colors.length],
    });
  }
}

function updateEffects(dt) {
  for (const p of particles) {
    // Paper flutters: light gravity, air drag, spinning.
    p.vy = Math.min(p.vy + H * 0.9 * dt, H * 0.25);
    p.vx *= 0.98;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const s of popups) {
    s.y -= H * 0.06 * dt;
    s.life -= dt;
  }
  popups = popups.filter((s) => s.life > 0);
}

function makeCrack(x, y) {
  const lines = [];
  for (let i = 0; i < 11; i++) {
    let angle = (i / 11) * Math.PI * 2 + random(-0.2, 0.2);
    let px = x;
    let py = y;
    const pts = [{ x: px, y: py }];
    const step = (random(0.5, 1) * Math.max(W, H)) / 9;
    for (let s = 0; s < 9; s++) {
      angle += random(-0.4, 0.4);
      px += Math.cos(angle) * step;
      py += Math.sin(angle) * step;
      pts.push({ x: px, y: py });
    }
    lines.push(pts);
  }
  return lines;
}

// ---------------------------------------------------------------------
// Draw (Krabbelland: graph paper, coloured paper, scribbles, wobble eyes)
// The static parts (paper background, paper scenery) are painted once
// into offscreen layers; every frame only copies those and draws what moves.
// ---------------------------------------------------------------------
const FONT = '"Fredoka", system-ui, sans-serif';
const DISPLAY_FONT = '"Lilita One", "Fredoka", system-ui, sans-serif';

// Small seeded random generator, so paper edges and doodles look the same every time.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Darken (amount < 0) or lighten (amount > 0) a hex colour.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

// Little doodles (like the styleboard): star, spiral, heart, zigzag, plus, circle, wave.
function drawDoodle(g, x, y, s, type, color, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = color;
  g.lineWidth = Math.max(2, s * 0.2);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  if (type === 0) {
    for (let i = 0; i <= 10; i++) {
      const r = i % 2 ? s * 0.45 : s;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else if (type === 1) {
    for (let a = 0; a < Math.PI * 5; a += 0.3) {
      const r = (s * a) / (Math.PI * 5);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else if (type === 2) {
    g.moveTo(0, s * 0.8);
    g.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.5, -s * 0.9, 0, -s * 0.3);
    g.bezierCurveTo(s * 0.5, -s * 0.9, s * 1.2, -s * 0.1, 0, s * 0.8);
  } else if (type === 3) {
    g.moveTo(-s, 0);
    for (let i = 1; i <= 4; i++) g.lineTo(-s + (i * s) / 2, i % 2 ? -s * 0.4 : s * 0.4);
  } else if (type === 4) {
    g.moveTo(-s, 0);
    g.lineTo(s, 0);
    g.moveTo(0, -s);
    g.lineTo(0, s);
  } else if (type === 5) {
    g.arc(0, 0, s * 0.6, 0, Math.PI * 2);
  } else {
    g.moveTo(-s, 0);
    g.quadraticCurveTo(-s / 2, -s * 0.6, 0, 0);
    g.quadraticCurveTo(s / 2, s * 0.6, s, 0);
  }
  g.stroke();
  g.restore();
}

// A piece of masking tape.
function drawTape(g, x, y, w, h, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = CONFIG.colors.tape;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
}

// Sparkle ticks around something nice (like around the stars in the slides).
function drawSparkles(g, x, y, r, seed) {
  const rnd = seeded(seed);
  const colors = ["#ff8ab3", "#4cc38a"];
  g.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6 + rnd() * 0.5;
    const cx = x + Math.cos(a) * r;
    const cy = y + Math.sin(a) * r;
    const s = r * 0.13;
    g.strokeStyle = colors[i % 2];
    g.lineWidth = Math.max(2, s * 0.35);
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const b = a - 0.9 + k * 0.9;
      g.moveTo(cx + Math.cos(b) * s * 0.4, cy + Math.sin(b) * s * 0.4);
      g.lineTo(cx + Math.cos(b) * s * 1.3, cy + Math.sin(b) * s * 1.3);
    }
    g.stroke();
  }
}

// --- Background layer: graph paper and faint doodles --------------------
function renderBackground() {
  const g = bgCtx;
  const C = CONFIG.colors;
  const rnd = seeded(7);
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);

  // Paper fibres
  for (let i = 0; i < (W * H) / 900; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255, 255, 255, 0.5)" : "rgba(120, 120, 100, 0.05)";
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1);
  }

  // Graph paper grid
  const cell = Math.max(18, Math.round(H * 0.042));
  g.strokeStyle = C.grid;
  g.lineWidth = 1.6;
  g.beginPath();
  for (let x = cell / 2; x < W; x += cell) {
    g.moveTo(x, 0);
    g.lineTo(x, H);
  }
  for (let y = cell / 2; y < H; y += cell) {
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  g.stroke();

  // A few faint coloured doodles above the floor
  const floorLine = CONFIG.playBand.bottom * H;
  g.globalAlpha = 0.3;
  for (let i = 0; i < 28; i++) {
    const s = H * (0.01 + rnd() * 0.012);
    drawDoodle(g, rnd() * W, rnd() * floorLine * 0.92, s, Math.floor(rnd() * 7), C.doodles[i % C.doodles.length], rnd() * 6.28);
  }
  g.globalAlpha = 1;
}

// --- Scene layer: paper blocks, floor, door ------------------------------
// Rebuilt at the start of every level (or with just the floor on the attract screen).
function renderScene(lvl) {
  const g = sceneCtx;
  const floor = floorY();
  g.clearRect(0, 0, W, H);
  if (lvl) {
    lvl.ledges.forEach((l, i) => {
      if (l.float) drawFloatCard(g, l);
      else if (l.top < floor - 1) drawPaperBlock(g, l, i);
    });
  }
  drawFloorPaper(g);
  if (lvl) drawDoorShape(g, lvl.door);
}

// A vertical torn paper edge from y0 to y1 (the gaps are "torn").
function tornEdge(p, x, y0, y1, rnd) {
  const steps = Math.max(2, Math.round(Math.abs(y1 - y0) / 8));
  for (let i = 1; i <= steps; i++) p.lineTo(x + (rnd() - 0.5) * 5, y0 + ((y1 - y0) * i) / steps);
}

// Oil-pastel strokes, clipped to a shape.
function pastelTexture(g, clip, x, y, w, h, color, rnd) {
  g.save();
  g.clip(clip);
  g.lineCap = "round";
  const n = Math.min(400, Math.round((w * h) / 500));
  for (let i = 0; i < n; i++) {
    const sx = x + rnd() * w;
    const sy = y + rnd() * h;
    const len = 10 + rnd() * 26;
    g.strokeStyle = rnd() < 0.5 ? shade(color, 0.18) : shade(color, -0.1);
    g.globalAlpha = 0.18 + rnd() * 0.22;
    g.lineWidth = 3 + rnd() * 5;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + len * 0.8, sy - len * 0.5);
    g.stroke();
  }
  g.restore();
}

// A ledge: a block of coloured paper with torn sides, standing on the floor.
function drawPaperBlock(g, l, i) {
  const rnd = seeded(Math.round(l.x0) * 7 + i * 131);
  const r = Math.min(16, (l.x1 - l.x0) * 0.12);
  const bottom = floorY() + 24;
  const p = new Path2D();
  p.moveTo(l.x0, bottom);
  tornEdge(p, l.x0, bottom, l.top + r, rnd);
  p.quadraticCurveTo(l.x0, l.top, l.x0 + r, l.top);
  p.lineTo(l.x1 - r, l.top);
  p.quadraticCurveTo(l.x1, l.top, l.x1, l.top + r);
  tornEdge(p, l.x1, l.top + r, bottom, rnd);
  p.closePath();

  g.save();
  g.shadowColor = "rgba(31, 35, 64, 0.25)";
  g.shadowBlur = 16;
  g.shadowOffsetX = 4;
  g.shadowOffsetY = 6;
  g.fillStyle = l.color;
  g.fill(p);
  g.restore();
  pastelTexture(g, p, l.x0, l.top, l.x1 - l.x0, bottom - l.top, l.color, rnd);

  // Light edge along the top, where the characters walk
  g.strokeStyle = "rgba(255, 255, 255, 0.45)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(l.x0 + r, l.top + 2.5);
  g.lineTo(l.x1 - r, l.top + 2.5);
  g.stroke();
}

// A floating platform: a paper card taped to the page.
function drawFloatCard(g, l) {
  const h = 0.04 * H;
  const w = l.x1 - l.x0;
  const p = new Path2D();
  if (p.roundRect) p.roundRect(l.x0, l.top, w, h, 8);
  else p.rect(l.x0, l.top, w, h);
  g.save();
  g.shadowColor = "rgba(31, 35, 64, 0.25)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 6;
  g.fillStyle = l.color;
  g.fill(p);
  g.restore();
  pastelTexture(g, p, l.x0, l.top, w, h, l.color, seeded(Math.round(l.x0)));
  drawTape(g, l.x0 + 4, l.top + h * 0.2, h * 1.2, h * 0.45, -0.7);
  drawTape(g, l.x1 - 4, l.top + h * 0.2, h * 1.2, h * 0.45, 0.7);
}

// The floor: a torn strip of notebook paper. The shadow's feet stand on its edge.
function drawFloorPaper(g) {
  const C = CONFIG.colors;
  const f = floorY();
  const rnd = seeded(99);
  const edge = [];
  for (let x = -10; x <= W + 10; x += 10) edge.push({ x, y: f + (rnd() - 0.5) * 3 });

  const p = new Path2D();
  p.moveTo(-10, H + 10);
  for (const q of edge) p.lineTo(q.x, q.y);
  p.lineTo(W + 10, H + 10);
  p.closePath();

  g.save();
  g.shadowColor = "rgba(31, 35, 64, 0.2)";
  g.shadowBlur = 16;
  g.shadowOffsetY = -3;
  g.fillStyle = C.floor;
  g.fill(p);
  g.restore();

  // Ruled lines, like a notebook page
  g.save();
  g.clip(p);
  g.strokeStyle = C.grid;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let y = f + H * 0.045; y < H; y += H * 0.045) {
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  g.stroke();
  g.restore();

  // Pencil line along the torn edge
  g.strokeStyle = rgba(C.ink, 0.5);
  g.lineWidth = 2;
  g.beginPath();
  edge.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.stroke();
}

// The door to the real world: an open paper door with warm light behind it.
function drawDoorShape(g, d) {
  const C = CONFIG.colors;
  const x = d.x - d.w / 2;
  const y = d.y - d.h;
  const light = g.createLinearGradient(0, y, 0, d.y);
  light.addColorStop(0, "#fff6cf");
  light.addColorStop(1, "#fdc73a");
  g.fillStyle = light;
  g.fillRect(x, y, d.w, d.h);

  // The door leaf, swung open towards us
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - d.w * 0.45, y - d.h * 0.06);
  g.lineTo(x - d.w * 0.45, d.y + d.h * 0.04);
  g.lineTo(x, d.y);
  g.closePath();
  g.fillStyle = "#fdfcf6";
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.stroke();
  g.fillStyle = C.ink;
  g.beginPath();
  g.arc(x - d.w * 0.36, y + d.h * 0.55, 3, 0, Math.PI * 2);
  g.fill();

  // Wobbly pencil frame
  const rnd = seeded(5);
  g.lineWidth = 2.5;
  for (let k = 0; k < 2; k++) {
    const j = () => (rnd() - 0.5) * 3;
    g.beginPath();
    g.moveTo(x + j(), d.y);
    g.lineTo(x + j(), y + j());
    g.lineTo(x + d.w + j(), y + j());
    g.lineTo(x + d.w + j(), d.y);
    g.stroke();
  }
  drawSparkles(g, d.x, y + d.h * 0.4, d.h * 0.75, 3);
}

function drawDoorGlow() {
  const d = level.door;
  const pulse = 0.5 + Math.sin(state.time * 3) * 0.2;
  const cx = d.x;
  const cy = d.y - d.h / 2;
  const glow = ctx.createRadialGradient(cx, cy, d.w * 0.3, cx, cy, d.h * 1.1);
  glow.addColorStop(0, rgba(CONFIG.colors.glow, pulse));
  glow.addColorStop(1, rgba(CONFIG.colors.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - d.h * 1.2, cy - d.h * 1.2, d.h * 2.4, d.h * 2.4);
}

// --- Every frame --------------------------------------------------------
function draw() {
  ctx.save();
  ctx.fillStyle = CONFIG.colors.paper;
  ctx.fillRect(0, 0, W, H);
  if (state.mode === "crack") {
    // Screen shake
    const k = (1 - state.modeTime / CONFIG.crackTime) * 14;
    ctx.translate(random(-k, k), random(-k, k));
  }

  ctx.drawImage(bgLayer, 0, 0, W, H);
  if (state.showCamera && state.cameraOn && video.readyState >= 2) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    ctx.save();
    ctx.globalAlpha = CONFIG.cameraOpacity;
    ctx.translate(W, 0); // mirror
    ctx.scale(-1, 1);
    ctx.drawImage(video, (W - vw * scale) / 2, (H - vh * scale) / 2, vw * scale, vh * scale);
    ctx.restore();
  }
  if (level) drawDoorGlow();
  ctx.drawImage(sceneLayer, 0, 0, W, H);

  // The world: paper, scenery, the players' shadows, the solid shadow bridges and the Krabbels.
  const inLevel = state.mode !== "attract" && level;
  drawShadow();
  if (inLevel) {
    for (const o of level.obstacles) drawSnap(o);
    if (characters.length) for (const c of characters) drawCharacter(c);
    else for (const k of state.krabbels) k.draw(ctx); // drawing / ready: waiting on the first ledge
  } else {
    drawAttract();
  }
  ctx.restore();

  // Interface and feedback: always on top of the shadow, so it stays readable.
  if (inLevel) {
    drawZoneHints();
    drawPoseHints();
    if (state.mode === "intro" && state.modeTime > CONFIG.introTime * 0.6) drawExitArrow();
    if (state.mode === "ready") drawReady();
    else if (state.mode !== "draw") drawHud();
  }
  drawEffects();
  drawOverlays();
  if (state.debug) drawDebug();
}

// The two points of the platform an obstacle needs (edge to edge, or the ladder).
function snapLine(o) {
  if (o.type === "cliff") return [{ x: o.ladderX, y: floorY() }, { x: o.ladderX, y: o.b.top - 6 }];
  return [
    { x: o.a.x1, y: o.a.top },
    { x: o.b.x0, y: o.b.top },
  ];
}

// The snapped platform. For a Krabbel a shadow is solid ground: a solved
// shape becomes a solid shadow plank with a warm glow. The helper is a strip
// of masking tape. Faint while a character is paused on it.
function drawSnap(o) {
  const paused = characters.some((c) => c.state === "cross" && c.obstacle === o);
  if (o.done || (!o.solved && !paused)) return;
  const C = CONFIG.colors;
  const alpha = o.solved ? 1 : 0.35;
  const [p, q] = snapLine(o);

  const segs = [];
  if (o.type === "cliff") {
    const half = 0.014 * W;
    segs.push([{ x: p.x - half, y: p.y }, { x: q.x - half, y: q.y }]);
    segs.push([{ x: p.x + half, y: p.y }, { x: q.x + half, y: q.y }]);
    for (let y = p.y - 14; y > q.y + 4; y -= 0.035 * H) segs.push([{ x: p.x - half, y }, { x: p.x + half, y }]);
  } else {
    segs.push([p, q]);
  }

  const k = o.type === "cliff" ? 0.6 : 1; // ladders are thinner
  const passes = o.helper
    ? [
        [C.tape, 1, 18 * k],
        ["rgba(150, 130, 80, 0.35)", 1, 2],
      ]
    : [
        [C.glow, 0.35, 28 * k],
        [C.shadow, 0.9, 12 * k],
        [C.glow, 1, 3],
      ];
  ctx.save();
  ctx.lineCap = "round";
  for (const [color, a, width] of passes) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * a;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [s, e] of segs) {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function line(p, q) {
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

// Hint 2: a yellow highlighter stroke marks the stand-here zone on the floor.
function drawZoneHints() {
  const floor = floorY();
  const C = CONFIG.colors;
  for (const o of level.obstacles) {
    if (o.done || o.solved || o.waitTime < CONFIG.hintZoneAfter) continue;
    const pulse = 0.75 + Math.sin(state.time * 5) * 0.25;
    const zw = o.zone[1] - o.zone[0];
    const glow = ctx.createLinearGradient(0, floor - 0.12 * H, 0, floor);
    glow.addColorStop(0, rgba(C.glow, 0));
    glow.addColorStop(1, rgba(C.glow, pulse * 0.45));
    ctx.fillStyle = glow;
    ctx.fillRect(o.zone[0], floor - 0.12 * H, zw, 0.12 * H);
    ctx.save();
    ctx.globalAlpha = pulse * 0.75;
    ctx.strokeStyle = C.glow;
    ctx.lineWidth = 0.035 * H;
    ctx.lineCap = "round";
    line({ x: o.zone[0] + 12, y: floor + 0.025 * H }, { x: o.zone[1] - 12, y: floor + 0.02 * H });
    ctx.restore();
  }
}

// Hint 1: a ghost of the required pose, drawn in pencil, pulses in the zone.
function drawPoseHints() {
  for (const o of level.obstacles) {
    if (o.done || o.solved || o.waitTime < CONFIG.hintPoseAfter) continue;
    const alpha = 0.45 + Math.sin(state.time * 4) * 0.3;
    const m = levelMeasure();
    const T = CONFIG.shadowTorso * bandHeight();
    const dims = { T, S: m.S, armLen: m.armLen };
    drawPoseFigure((o.zone[0] + o.zone[1]) / 2, floorY(), o.gesture, dims, alpha, true, CONFIG.colors.ink);
  }
}

// Stick figure of a gesture, standing on `floor`. Used for the pose hint and the debug icon.
function drawPoseFigure(x, floor, g, dims, alpha, dashed, color) {
  const { T, S, armLen } = dims;
  const shY = floor - S;
  const hipY = shY + T;
  const half = 0.375 * T;
  const dirs = {
    [G.BRIDGE]: [
      [-1, 0],
      [1, 0],
    ],
    [G.RAMP_UP]: [
      [-0.77, 0.64],
      [0.77, -0.64],
    ],
    [G.RAMP_DOWN]: [
      [-0.77, -0.64],
      [0.77, 0.64],
    ],
    [G.LADDER]: [
      [-0.2, -0.98],
      [0.2, -0.98],
    ],
    [G.NONE]: [
      [-0.2, 0.98],
      [0.2, 0.98],
    ],
  }[g];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, T * 0.06);
  ctx.lineCap = "round";
  if (dashed) ctx.setLineDash([8, 8]);
  ctx.beginPath();
  // legs, torso
  ctx.moveTo(x - half * 0.6, floor);
  ctx.lineTo(x, hipY);
  ctx.lineTo(x + half * 0.6, floor);
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, shY);
  // shoulders + arms
  ctx.moveTo(x - half, shY);
  ctx.lineTo(x + half, shY);
  ctx.moveTo(x - half, shY);
  ctx.lineTo(x - half + dirs[0][0] * armLen, shY + dirs[0][1] * armLen);
  ctx.moveTo(x + half, shY);
  ctx.lineTo(x + half + dirs[1][0] * armLen, shY + dirs[1][1] * armLen);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, shY - T * 0.45, T * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// The players' shadows: thick rounded capsules + a head, in one flat colour.
// All shadows go on one canvas first, so where two players overlap it isn't darker.
function drawShadow() {
  const shown = people.filter((p) => p.present && p.body);
  if (!shown.length) return;
  sctx.clearRect(0, 0, W, H);
  for (const p of shown) drawShadowBody(p.body);

  // Copy it semi-transparent, cut off at the floor line so the feet stand flat on it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, floorY());
  ctx.clip();
  ctx.globalAlpha = CONFIG.shadowAlpha;
  ctx.drawImage(shadowCanvas, 0, 0, W, H);
  ctx.restore();
}

function drawShadowBody(b) {
  const T = CONFIG.shadowTorso * bandHeight();
  sctx.fillStyle = CONFIG.colors.shadow;
  sctx.strokeStyle = CONFIG.colors.shadow;
  sctx.lineCap = "round";
  sctx.lineJoin = "round";
  const capsule = (pts, width) => {
    sctx.lineWidth = width;
    sctx.beginPath();
    sctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) sctx.lineTo(p.x, p.y);
    sctx.stroke();
  };

  // Torso: a filled shape through shoulders and hips, with rounded edges.
  sctx.lineWidth = T * 0.3;
  sctx.beginPath();
  sctx.moveTo(b.lShoulder.x, b.lShoulder.y);
  sctx.lineTo(b.rShoulder.x, b.rShoulder.y);
  sctx.lineTo(b.rHip.x, b.rHip.y);
  sctx.lineTo(b.lHip.x, b.lHip.y);
  sctx.closePath();
  sctx.fill();
  sctx.stroke();

  capsule([b.lShoulder, b.lElbow, b.lWrist], T * 0.2);
  capsule([b.rShoulder, b.rElbow, b.rWrist], T * 0.2);
  capsule([b.lHip, b.lKnee, b.lAnkle], T * 0.26);
  capsule([b.rHip, b.rKnee, b.rAnkle], T * 0.26);
  const neck = mid(b.lShoulder, b.rShoulder);
  capsule([neck, { x: b.nose.x, y: b.nose.y }], T * 0.18);
  sctx.beginPath();
  sctx.arc(b.nose.x, b.nose.y - T * 0.08, T * 0.32, 0, Math.PI * 2);
  sctx.fill();
}

// Where a character wants to look: forward while walking, up while climbing,
// at the player while waiting. The wobble eyes spring towards this.
function lookDirection(c) {
  if (c.climbing) return { x: 0, y: -1 };
  if (c.moving) return { x: 1, y: 0 };
  // At the nearest player (where their head is)
  let person = null;
  for (const p of people) if (p.present && (!person || Math.abs(p.centerX - c.x) < Math.abs(person.centerX - c.x))) person = p;
  if (person) {
    const dx = person.centerX - c.x;
    const dy = floorY() - person.measure.S - c.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  return { x: 0, y: 0.3 };
}

function drawCharacter(c) {
  if (c.state === "gone") return;
  c.k.draw(ctx);

  // "!" marks when a Krabbel arrives at a gap and asks for help
  if (c.state === "wait" && c.waitT < 1.2) {
    const r = c.k.bodyRect();
    const R = c.k.size * 0.55;
    const cx = c.x - c.k.size * 0.15;
    const cy = r.y + r.h * 0.45;
    ctx.strokeStyle = CONFIG.colors.ink;
    ctx.lineWidth = Math.max(2, c.k.size * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const a of [-2.2, -1.75, -1.3]) {
      ctx.moveTo(cx + Math.cos(a) * R * 1.3, cy + Math.sin(a) * R * 1.3);
      ctx.lineTo(cx + Math.cos(a) * R * 1.65, cy + Math.sin(a) * R * 1.65);
    }
    ctx.stroke();
  }
}

// A Krabbel's body: a coloured scribble ball, painted once per colour and size.
function scribbleBody(color, radius) {
  const r = Math.max(3, Math.round(radius)); // tiny characters (shrinking into the door) reuse a small body, scaled down
  const key = `${color}|${r}`;
  let body = blobCache.get(key);
  if (body) return body;

  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
  const size = Math.ceil(r * 2.4 + 6);
  const c = document.createElement("canvas");
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const cx = size / 2;
  const cy = size / 2;
  const rnd = seeded(r * 31 + parseInt(color.slice(1), 16));

  // A soft fill, so the body reads as one ball
  g.fillStyle = rgba(color, 0.3);
  g.beginPath();
  g.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  g.fill();

  g.lineCap = "round";
  g.lineJoin = "round";
  // A random point inside the ball (uniform over the disc)
  const inside = (max) => {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * max;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  };

  // The tangle: curves between random points inside the ball, in two tones
  for (const [tone, loops, width, alpha] of [
    [color, 55, 0.075, 0.9],
    [shade(color, -0.35), 22, 0.045, 0.75],
  ]) {
    g.strokeStyle = tone;
    g.lineWidth = Math.max(1.2, r * width);
    g.globalAlpha = alpha;
    let p = inside(r * 0.85);
    g.beginPath();
    g.moveTo(p.x, p.y);
    for (let i = 0; i < loops; i++) {
      const ctrl = inside(r * 0.95);
      p = inside(r * 0.85);
      g.quadraticCurveTo(ctrl.x, ctrl.y, p.x, p.y);
    }
    g.stroke();
  }

  // A few wobbly laps around the edge give it its round shape
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.2, r * 0.07);
  g.globalAlpha = 0.95;
  g.beginPath();
  for (let a = 0; a <= Math.PI * 4.3; a += 0.25) {
    const rr = r * (0.86 + rnd() * 0.12);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  body = { canvas: c, size, r };
  blobCache.set(key, body);
  return body;
}

// Intro: dotted pencil arrow from the Krabbels to the exit door.
function drawExitArrow() {
  const from = characters[0];
  const d = level.door;
  const y = Math.min(from.y, d.y) - 0.12 * H;
  ctx.save();
  ctx.strokeStyle = rgba(CONFIG.colors.ink, 0.75);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -state.time * 40;
  ctx.beginPath();
  ctx.moveTo(from.x + 0.04 * W, y);
  ctx.lineTo(d.x - 0.02 * W, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(d.x - 0.035 * W, y - 14);
  ctx.lineTo(d.x - 0.015 * W, y);
  ctx.lineTo(d.x - 0.035 * W, y + 14);
  ctx.stroke();
  ctx.restore();
}

// Doodle confetti ("sparkles!") and rising crayon stars.
function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    drawDoodle(ctx, p.x, p.y, p.size, p.type, p.color, p.rot);
  }
  for (const s of popups) {
    ctx.globalAlpha = clamp(s.life, 0, 1);
    drawStar(s.x, s.y, 0.04 * H);
  }
  ctx.globalAlpha = 1;
}

function starPath(g, x, y, radius) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.48;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  g.closePath();
}

// The yellow crayon star (as in the slides), painted once per size.
function drawStar(x, y, radius) {
  const R = Math.max(4, Math.round(radius));
  const key = `star|${R}`;
  let star = blobCache.get(key);
  if (!star) {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
    const size = Math.ceil(R * 2.3);
    const c = document.createElement("canvas");
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const color = CONFIG.colors.star;
    starPath(g, size / 2, size / 2, R);
    g.fillStyle = color;
    g.fill();
    g.save();
    g.clip();
    const rnd = seeded(R);
    g.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      const sx = rnd() * size;
      const sy = rnd() * size;
      g.strokeStyle = rnd() < 0.5 ? shade(color, 0.35) : shade(color, -0.12);
      g.globalAlpha = 0.4;
      g.lineWidth = Math.max(1.5, R * 0.08);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + R * 0.4, sy - R * 0.25);
      g.stroke();
    }
    g.restore();
    starPath(g, size / 2, size / 2, R);
    g.strokeStyle = shade(color, -0.2);
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1.5, R * 0.06);
    g.lineJoin = "round";
    g.stroke();
    star = { canvas: c, size };
    blobCache.set(key, star);
  }
  const s = star.size * (radius / R);
  ctx.drawImage(star.canvas, x - s / 2, y - s / 2, s, s);
}

// An off-white paper card with a soft shadow (and optionally a piece of tape on top).
function paperCard(x, y, w, h, color = "#fdfcf6", tape = true) {
  ctx.save();
  ctx.shadowColor = "rgba(31, 35, 64, 0.22)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;
  roundRectPath(ctx, x, y, w, h, Math.min(10, h * 0.2));
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  if (tape) drawTape(ctx, x + w / 2, y + 2, Math.min(w * 0.5, h * 0.9), h * 0.22, -0.04);
}

// Level number (top left) and stars for first-try solves (top right).
function drawHud() {
  const C = CONFIG.colors;
  const s = 0.075 * H;

  ctx.save();
  ctx.translate(24 + s / 2, 24 + s / 2);
  ctx.rotate(-0.05);
  paperCard(-s / 2, -s / 2, s, s, C.star);
  ctx.fillStyle = C.ink;
  ctx.font = `${Math.round(s * 0.62)}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(state.levelIndex + 1), 0, s * 0.06);
  ctx.restore();

  ctx.font = `600 ${Math.round(s * 0.55)}px ${FONT}`;
  const label = String(state.stars);
  const lw = ctx.measureText(label).width + s * 1.35;
  ctx.save();
  ctx.translate(W - 24 - lw / 2, 24 + s / 2);
  ctx.rotate(0.03);
  paperCard(-lw / 2, -s / 2, lw, s);
  drawStar(-lw / 2 + s * 0.5, 0, s * 0.3);
  ctx.fillStyle = C.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, -lw / 2 + s * 0.9, s * 0.04);
  ctx.restore();
}

// The KRABBELS logo: chunky blue letters, the two B's have wobble eyes and a smile.
function drawLogo(cx, baseY, size) {
  const C = CONFIG.colors;
  const letters = "KRABBELS".split("");
  ctx.font = `${Math.round(size)}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const widths = letters.map((ch) => ctx.measureText(ch).width * 0.95);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  let lastLetter = null;
  letters.forEach((ch, i) => {
    const w = widths[i];
    const lx = x + w / 2;
    const ly = baseY + Math.sin(state.time * 2 + i * 0.7) * size * 0.015;
    const rot = Math.sin(i * 1.9) * 0.07;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(31, 35, 64, 0.18)";
    ctx.fillText(ch, 3, 6);
    ctx.fillStyle = C.logo;
    ctx.fillText(ch, 0, 0);
    if (ch === "B" && (i === 3 || i === 4)) {
      const look = { x: Math.sin(state.time * 0.9 + i) * 0.7, y: 0.2 };
      const er = size * 0.085;
      for (const side of [-1, 1]) {
        const ex = side * er * 1.1;
        const ey = -size * 0.48;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.arc(ex + look.x * er * 0.45, ey + look.y * er * 0.45, er * 0.52, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = Math.max(2, size * 0.025);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, -size * 0.3, size * 0.07, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.restore();
    lastLetter = { x: lx, y: ly, w };
    x += w;
  });
  // The pencil stick figure sits on the S and waves
  drawStickFigure(lastLetter.x + lastLetter.w * 0.05, baseY - size * 0.68, size * 0.55);
}

// The little pencil stick figure from the slides.
function drawStickFigure(x, seatY, s) {
  const ink = "#2b2b2b";
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const headY = seatY - s * 0.72;
  const hr = s * 0.15;
  // body: a hatched rectangle
  const bw = s * 0.2;
  const bh = s * 0.38;
  const by = headY + hr + s * 0.04;
  ctx.fillStyle = "rgba(160, 160, 160, 0.35)";
  ctx.fillRect(x - bw / 2, by, bw, bh);
  ctx.strokeRect(x - bw / 2, by, bw, bh);
  ctx.beginPath();
  // head
  ctx.arc(x, headY, hr, 0, Math.PI * 2);
  // hair spikes
  for (const a of [-0.5, 0, 0.5]) {
    ctx.moveTo(x + Math.sin(a) * hr, headY - Math.cos(a) * hr);
    ctx.lineTo(x + Math.sin(a) * hr * 1.9, headY - Math.cos(a) * hr * 1.9);
  }
  // legs dangling over the letter, swinging a little
  const swing = Math.sin(state.time * 3) * s * 0.05;
  ctx.moveTo(x - bw * 0.3, by + bh);
  ctx.lineTo(x - bw * 0.35 + swing, seatY + s * 0.12);
  ctx.moveTo(x + bw * 0.3, by + bh);
  ctx.lineTo(x + bw * 0.35 - swing, seatY + s * 0.12);
  // arms: one resting, one waving
  ctx.moveTo(x - bw / 2, by + bh * 0.25);
  ctx.lineTo(x - bw * 1.3, by + bh * 0.85);
  const wave = -1.0 + Math.sin(state.time * 8) * 0.35;
  const hx = x + bw / 2 + Math.cos(wave) * s * 0.28;
  const hy = by + bh * 0.2 + Math.sin(wave) * s * 0.28;
  ctx.moveTo(x + bw / 2, by + bh * 0.2);
  ctx.lineTo(hx, hy);
  for (const f of [-0.5, 0, 0.5]) {
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(wave + f) * s * 0.07, hy + Math.sin(wave + f) * s * 0.07);
  }
  ctx.stroke();
  // face
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(x - hr * 0.35, headY - hr * 0.1, Math.max(1, s * 0.015), 0, Math.PI * 2);
  ctx.arc(x + hr * 0.35, headY - hr * 0.1, Math.max(1, s * 0.015), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, headY + hr * 0.1, hr * 0.45, 0.3, Math.PI - 0.3);
  ctx.stroke();
  ctx.restore();
}

// Attract screen: the KRABBELS logo, the 1 / 2 player buttons (HTML), and a waving Krabbel.
function drawAttract() {
  drawLogo(W / 2, bandTop() + H * 0.12, Math.min(0.17 * H, W * 0.11));
  const k = attractKrabbel;
  if (!k) return;
  if (k.size !== krabbelPx() * 0.75) k.setSize(krabbelPx() * 0.75);
  if (!k.airborne) {
    k.x = W / 2;
    k.y = floorY();
  }
  k.draw(ctx);
}

// Ready: everyone drew. A "Kom erin!" card, with a ring that fills while someone stands in view.
function drawReady() {
  const C = CONFIG.colors;
  const x = W / 2;
  ctx.font = `600 ${Math.round(H * 0.05)}px ${FONT}`;
  const text = TEXT.stepIn;
  const lw = ctx.measureText(text).width + H * 0.07;
  const lh = H * 0.085;
  ctx.save();
  ctx.translate(x, bandTop() + H * 0.02);
  ctx.rotate(-0.03);
  paperCard(-lw / 2, -lh / 2, lw, lh);
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 3);
  ctx.restore();

  // One pencil figure per player inside the ring (for children who can't read yet)
  const cy = bandTop() + H * 0.2;
  const R = H * 0.085;
  const dims = { T: R * 0.32, S: R * 0.95, armLen: R * 0.34 };
  for (let i = 0; i < state.players; i++) {
    const fx = x + (i - (state.players - 1) / 2) * R * 0.75;
    drawPoseFigure(fx, cy + R * 0.62, G.NONE, dims, 0.85, false, C.ink);
  }
  ctx.strokeStyle = rgba(C.ink, 0.2);
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(x, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = clamp((state.presentTime * 1000) / CONFIG.attractEnterMs, 0, 1);
  if (progress > 0) {
    ctx.strokeStyle = C.glow;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
}

// Fades, level star, crack and sticker (drawn without screen shake).
function drawOverlays() {
  const t = state.modeTime;
  const C = CONFIG.colors;
  if (state.mode === "levelIn") {
    ctx.fillStyle = rgba(C.paper, 1 - clamp(t / CONFIG.levelFadeTime, 0, 1));
    ctx.fillRect(0, 0, W, H);
    // The crayon star with the level number pops in, then fades out at the end.
    const pop = Math.min(1, t / 0.25);
    const out = clamp((CONFIG.levelBadgeTime - t) / 0.3, 0, 1);
    const R = 0.14 * H * (0.6 + 0.4 * pop);
    const cx = W / 2;
    const cy = H * 0.42;
    ctx.save();
    ctx.globalAlpha = out;
    drawStar(cx, cy, R);
    drawSparkles(ctx, cx, cy, R * 1.15, 11);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = R * 0.06;
    ctx.lineJoin = "round";
    ctx.font = `${Math.round(R * 0.85)}px ${DISPLAY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(String(state.levelIndex + 1), cx, cy + R * 0.1);
    ctx.fillText(String(state.levelIndex + 1), cx, cy + R * 0.1);
    ctx.restore();
  } else if (state.mode === "levelOut") {
    ctx.fillStyle = rgba(C.paper, clamp(t / CONFIG.levelFadeTime, 0, 1));
    ctx.fillRect(0, 0, W, H);
  } else if (state.mode === "crack") {
    const p = clamp(t / CONFIG.crackTime, 0, 1);
    ctx.fillStyle = `rgba(255, 255, 255, ${(1 - p) * 0.5})`;
    ctx.fillRect(0, 0, W, H);
    for (const [color, width, offset] of [
      ["#ffffff", 3, 1.5],
      [C.ink, 3, 0],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (const pts of state.crack) {
        const n = Math.max(1, Math.floor(p * 1.6 * pts.length));
        ctx.beginPath();
        ctx.moveTo(pts[0].x + offset, pts[0].y + offset);
        for (const q of pts.slice(1, n)) ctx.lineTo(q.x + offset, q.y + offset);
        ctx.stroke();
      }
    }
  } else if (state.mode === "sticker") {
    drawSticker(t);
  }
}

// Sticker preview of the players' Krabbels (the PNGs are downloaded for the printer).
function drawSticker(t) {
  const C = CONFIG.colors;
  const appear = clamp(t / 0.4, 0, 1);
  const leave = clamp((CONFIG.stickerTime - t) / 0.4, 0, 1);
  const a = Math.min(appear, leave);
  ctx.fillStyle = rgba(C.paper, 0.85 * a);
  ctx.fillRect(0, 0, W, H);

  const cw = Math.min(0.42 * W, 0.6 * H);
  const ch = cw * 1.1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.06 + (1 - appear) * 0.3);
  ctx.scale(0.7 + 0.3 * appear, 0.7 + 0.3 * appear);

  // White die-cut sticker with a drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(31, 35, 64, 0.3)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 32);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Inner graph paper
  const m = cw * 0.05;
  ctx.save();
  roundRectPath(ctx, -cw / 2 + m, -ch / 2 + m, cw - 2 * m, ch - 2 * m, 22);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const cell = cw / 14;
  for (let gx = -cw / 2; gx < cw / 2; gx += cell) {
    ctx.moveTo(gx, -ch / 2);
    ctx.lineTo(gx, ch / 2);
  }
  for (let gy = -ch / 2; gy < ch / 2; gy += cell) {
    ctx.moveTo(-cw / 2, gy);
    ctx.lineTo(cw / 2, gy);
  }
  ctx.stroke();
  ctx.restore();
  drawTape(ctx, 0, -ch / 2 + 4, cw * 0.3, ch * 0.06, 0.03);

  // Small logo text at the top
  ctx.font = `${Math.round(cw * 0.09)}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.logo;
  ctx.fillText("KRABBELS", 0, -ch * 0.32);

  // The players' own Krabbels, standing still (rendered once from the full-size drawing)
  const ks = state.krabbels;
  ks.forEach((k, i) => {
    const img = k.still || (k.still = k.renderStill(360));
    const s = Math.min((cw * (ks.length === 1 ? 0.55 : 0.38)) / img.width, (ch * 0.42) / img.height);
    const x = ks.length === 1 ? 0 : (i - 0.5) * cw * 0.42;
    const feetY = ch * 0.17;
    ctx.drawImage(img, x - (img.width * s) / 2, feetY - img.height * s, img.width * s, img.height * s);
  });

  // Stars earned
  ctx.font = `600 ${Math.round(cw * 0.1)}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.ink;
  ctx.fillText(String(state.stars), cw * 0.02, ch * 0.33);
  drawStar(-cw * 0.07, ch * 0.33, cw * 0.065);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawDebug() {
  const floor = floorY();

  // Play band
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  line({ x: 0, y: bandTop() }, { x: W, y: bandTop() });
  ctx.setLineDash([]);

  // Obstacle zones + solve state
  if (level) {
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    for (const o of level.obstacles) {
      const zx = o.zone[0];
      const zw = o.zone[1] - o.zone[0];
      ctx.strokeStyle = o.done ? "rgba(255,255,255,0.2)" : o.solved ? "#5dff8f" : o.inZone ? "#ffd23f" : "#ff6b6b";
      ctx.lineWidth = 2;
      ctx.strokeRect(zx, floor + 6, zw, 0.06 * H);
      ctx.fillStyle = "#ffffff";
      const status = o.done ? "done" : o.solved ? (o.helper ? "HELPER" : "SOLVED") : `${o.inZone ? "zone ✓" : "zone ✗"} ${o.shapeOk ? "shape ✓" : "shape ✗"}`;
      ctx.fillText(`${o.type} → ${GESTURE_LABEL[o.gesture]}`, zx + zw / 2, floor + 22);
      ctx.fillText(`${status}  wait ${o.waitTime.toFixed(1)}s`, zx + zw / 2, floor + 38);
    }
  }

  // The Krabbels: mask outline, eyes, detected hip row and leg pieces
  for (const k of characters.length ? characters.map((c) => c.k) : state.krabbels) k.drawDebug(ctx);

  // Skeletons (smoothed, mapped), one colour per player slot
  const bones = [
    ["lShoulder", "rShoulder"],
    ["lShoulder", "lElbow"],
    ["lElbow", "lWrist"],
    ["rShoulder", "rElbow"],
    ["rElbow", "rWrist"],
    ["lShoulder", "lHip"],
    ["rShoulder", "rHip"],
    ["lHip", "rHip"],
    ["lHip", "lKnee"],
    ["lKnee", "lAnkle"],
    ["rHip", "rKnee"],
    ["rKnee", "rAnkle"],
  ];
  const slotColors = ["#7ad7ff", "#ff9de0"];
  people.forEach((person, slot) => {
    if (!person.present || !person.body) return;
    const b = person.body;
    ctx.strokeStyle = slotColors[slot % slotColors.length];
    ctx.lineWidth = 2;
    for (const [p, q] of bones) line(b[p], b[q]);
    for (const p of Object.values(b)) {
      ctx.fillStyle = slotColors[slot % slotColors.length];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#ffd23f";
    line({ x: person.centerX, y: floor - 10 }, { x: person.centerX, y: floor + 10 });
  });

  // Status + gesture icons
  const m = levelMeasure();
  const lines = [
    `camera: ${state.cameraOn ? "on" : "off"}  model: ${state.modelReady ? "ready" : "…"}  fps: ${state.fps}  mode: ${state.mode}  players: ${state.players}`,
    ...people.map(
      (p, i) =>
        `P${i + 1}: ${p.present ? "seen" : "–"}  x ${Math.round(p.centerX)}  raw ${GESTURE_LABEL[p.rawGesture]}  held ${GESTURE_LABEL[p.gesture.stable]}`
    ),
    `level from: shoulder ${Math.round(m.S)}px  arm ${Math.round(m.armLen)}px  speed ${state.walkSpeed.toFixed(2)}`,
    `krabbels ${state.krabbels.length}  flying ${flights.length}  last error: ${state.lastError || "none"}`,
    `D debug  M camera  N next  1-6 level  R restart  0 attract  +/- speed`,
  ];
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(12, H - 12 - lines.length * 18 - 16, 560, lines.length * 18 + 16);
  ctx.font = "13px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  lines.forEach((l, i) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(l, 22, H - 12 - (lines.length - i) * 18 + 4);
  });
  people.forEach((p, i) => {
    const x0 = 580 + i * 96;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x0, H - 112, 90, 100);
    drawPoseFigure(x0 + 45, H - 22, p.gesture.stable, { T: 18, S: 47, armLen: 20 }, p.present ? 1 : 0.3, false, slotColors[i % slotColors.length]);
  });
}

// ---------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "d") {
    state.debug = !state.debug;
  } else if (key === "m") {
    state.showCamera = !state.showCamera;
  } else if (key === "n") {
    if (!level || state.mode === "draw" || state.mode === "ready") startLevel(0, false);
    else if (state.levelIndex < LEVELS.length - 1) startLevel(state.levelIndex + 1, false);
    else {
      setMode("crack");
      state.crack = makeCrack(level.door.x, level.door.y - level.door.h / 2);
    }
  } else if (key >= "1" && key <= "9" && Number(key) <= LEVELS.length) {
    startLevel(Number(key) - 1, false);
  } else if (key === "0") {
    goAttract();
  } else if (key === "r") {
    if (level) startLevel(state.levelIndex, false);
    else startLevel(0, true);
  } else if (key === "+" || key === "=") {
    state.walkSpeed = Math.min(0.5, state.walkSpeed + CONFIG.walkSpeedStep);
  } else if (key === "-" || key === "_") {
    state.walkSpeed = Math.max(0.01, state.walkSpeed - CONFIG.walkSpeedStep);
  }
});

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;

function frame(now) {
  // Clamp dt so a hidden tab or a slow frame doesn't teleport everything.
  const elapsed = (now - lastTime) / 1000;
  const dt = Math.min(0.05, elapsed);
  lastTime = now;
  state.time += dt;

  fpsFrames++;
  fpsTime += elapsed;
  if (fpsTime >= 0.5) {
    state.fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  // A drawing or update error must never freeze the installation: log it and keep running.
  try {
    detectPose(now);
    updateGestures(now);
    updateFlow(dt);
    updateFlights(dt);
    updateEffects(dt);
    updateDrawing(dt);
    draw();
    drawFx();
  } catch (err) {
    if (state.lastError !== err.message) {
      console.error("Frame error:", err);
      setMessage("frame", TEXT.frameError, true);
    }
    state.lastError = err.message;
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------
// Start: attract screen right away; camera and model load in parallel.
// ---------------------------------------------------------------------
resize();
for (const p of people) p.measure = defaultMeasure();
setMessage("boot", null); // clears the initial "Loading…" text
initDrawing(CONFIG, { onDone: onDrawingDone, onClose: goAttract });
document.getElementById("onePlayer").addEventListener("click", () => chooseMode(1));
document.getElementById("twoPlayers").addEventListener("click", () => chooseMode(2));
playBtn.addEventListener("click", () => {
  if (state.mode === "ready") startLevel(0, true);
});
attractKrabbel = makeKrabbel(scribbleBody(DEFAULT_COLORS[0], 60).canvas, W / 2, floorY(), false);
goAttract();
requestAnimationFrame(frame);
initCamera();
initPose();
