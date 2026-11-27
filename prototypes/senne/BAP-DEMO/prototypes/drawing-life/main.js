// =====================================================================
// Krabbels – "Drawing Life" demo
// A child draws anything and presses the green check. The drawing lifts
// off the paper, flies into the paper world and pops to life as a
// Krabbel: the drawing exactly as made, plus googly eyes, stick legs and
// procedural animation (see krabbel.js). No generative AI. Everything
// runs in this browser tab; nothing is uploaded or stored on a server.
//
// Keys: D debug · N new drawing · C clear the world · S sticker of the newest Krabbel
// =====================================================================

import { Krabbel, cropDrawing, makeStickers, growMask, fillHoles } from "./krabbel.js";

// ---------------------------------------------------------------------
// CONFIG: every tuning value lives here.
// Units: "W" = fraction of the window width, "H" = fraction of the window height,
// "U" = fraction of min(H, 0.65 × W): sizes that must also fit an upright iPad.
// ---------------------------------------------------------------------
const CONFIG = {
  // --- Drawing screen ---
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
  },

  // --- Optional timer: a shrinking circle. When it runs out, the drawing is sent. ---
  timer: {
    enabled: false,
    seconds: 90,
    startOnFirstStroke: true, // false = starts when the drawing screen opens
  },

  // --- Krabbels ---
  autoEyes: true, // false = no googly eyes are added
  maxKrabbels: 8, // more than this: the oldest walks to the door, waves and leaves
  krabbel: {
    size: 0.14, // U. Long side of the drawing in the world.
    legLength: 0.28, // × size
    walkSpeed: 0.12, // U per second
    speedVariation: 0.25, // each Krabbel walks ± this much faster or slower
    gravity: 3.2, // U per second²
    jumpHeight: 0.45, // × size, above the higher of start and landing
    wobble: 0.018, // jelly wobble strength
    breathe: 0.03, // idle breathing (±3 %)
    flip: true, // mirror the drawing when it walks left
  },

  // --- What Krabbels do on their own ---
  behaviour: {
    pauseMin: 0.5, // seconds standing still between actions
    pauseMax: 2.2,
    jumpChance: 0.28, // chance per action: jump onto / off a platform
    lookChance: 0.2, // stop and look around
    waveChance: 0.05, // a happy hop
    minWalk: 0.08, // W. Shortest walk.
    maxRise: 0.25, // H. Highest step up a Krabbel jumps.
    maxJumpDistance: 0.3, // W
    takeoffDistance: 0.06, // W. Run-up next to a platform.
    exitTime: 1.0, // seconds to shrink into the door
  },

  // --- The paper world ---
  world: {
    groundY: 0.82, // H. Top of the long crayon ground platform (where the feet stand).
    groundX: [0.015, 0.985], // W. Left and right end of the ground.
    groundThickness: 0.07, // H
    groundColor: "#fdc73a",
    // Higher platforms. x, w: fraction of W; y: top, fraction of H.
    platforms: [
      { x: 0.1, w: 0.2, y: 0.6, color: "#4cc38a" },
      { x: 0.4, w: 0.17, y: 0.44, color: "#ff8ab3" },
      { x: 0.64, w: 0.15, y: 0.62, color: "#4cc38a" },
    ],
    platformThickness: 0.045, // H
    door: { x: 0.92, w: 0.12, h: 0.25 }, // x: centre, fraction of W. w, h: U.
    doodles: 30, // faint pencil doodles in the background
  },

  // --- "It comes to life" transition ---
  flight: {
    lift: 0.45, // seconds: the drawing lifts off the paper
    fly: 1.15, // seconds: flying into the world
    arc: 0.28, // H. How high the flight curves.
    sparkleEvery: 0.028, // seconds between trail sparkles
  },

  // --- Stickers (for the printer later) ---
  sticker: {
    size: 900, // px, about the long side of the colour PNG
    border: 0.05, // × size. Thick white cut-out border.
    outline: 4, // px. Thin dark cut line.
    bwWidth: 384, // px. Black-and-white PNG width (384 = 58 mm thermal printer, 203 dpi).
    bwMode: "dither", // "dither" or "threshold"
    bwThreshold: 150, // 0..255, for "threshold"
    bwGamma: 1.4, // > 1 = light crayon colours print darker
    bwArtOutline: 1.5, // px. Dark line around the drawing in the B/W version (0 = off).
    exportOnLeave: true, // export when a Krabbel leaves through the door
    download: true, // download the PNGs (false = only the on-screen preview)
    previewTime: 3, // seconds the sticker preview shows (stays in debug mode)
  },

  // --- Optional phase 2: scan a paper drawing with the camera ---
  enableScan: false,
  scan: {
    facingMode: "environment", // "environment" = back camera on an iPad, "user" = front / webcam
    frame: 0.72, // size of the square frame, fraction of the shorter screen side
    size: 1024, // px. The scan is processed at size × size.
    darkness: 0.22, // 0..1. How much darker than the paper a pixel must be to count as drawing.
    saturation: 0.3, // 0..1. Or how colourful (for light crayon colours).
    speckSize: 0.0002, // ink islands smaller than this fraction of the image are removed
    minDrawing: 0.002, // less ink than this fraction = "no drawing found"
    groupDistance: 0.015, // strokes closer than this (fraction of size) count as one drawing
    edgeIgnore: 0.03, // ignore this fraction along the frame edges (fingers, paper edge)
  },

  // --- Look (from the level prototype) ---
  colors: {
    paper: "#fbfaf4",
    grid: "rgba(84, 168, 205, 0.5)",
    ink: "#1f2340",
    glow: "#fdc73a",
    tape: "rgba(236, 222, 178, 0.85)",
    doodles: ["#f04e45", "#fdc73a", "#4cc38a", "#ff8ab3", "#335ce0", "#8b6cf0"],
  },
  maxPixelRatio: 2, // lower to 1 if the iPad gets slow
};

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const worldCanvas = $("world");
const wctx = worldCanvas.getContext("2d");
const fxCanvas = $("fx");
const fctx = fxCanvas.getContext("2d");
const drawScreen = $("drawScreen");
const drawCanvas = $("drawCanvas");
const dctx = drawCanvas.getContext("2d");
const toolbar = $("toolbar");
const doneBtn = $("doneBtn");
const eraserBtn = $("eraserBtn");
const hintEl = $("hint");
const timerEl = $("timer");
const timerFill = $("timerFill");
const worldUi = $("worldUi");
const stickerBtn = $("stickerBtn");
const scanScreen = $("scanScreen");
const scanVideo = $("scanVideo");
const debugInfo = $("debugInfo");
const stickerPanel = $("stickerPanel");
const messageEl = $("message");

// Static layers, painted once per resize: graph paper + doodles, and the platforms + door.
const bgLayer = document.createElement("canvas");
const bgCtx = bgLayer.getContext("2d");
const sceneLayer = document.createElement("canvas");
const sceneCtx = sceneLayer.getContext("2d");

let W = 0; // window size in CSS pixels
let H = 0;
const U = () => Math.min(H, W * 0.65); // size unit that also fits an upright screen

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const random = (min, max) => min + Math.random() * (max - min);
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Small seeded random generator, so paper edges and doodles look the same every time.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// Darken (amount < 0) or lighten (amount > 0) a hex colour.
function shade(hex, amount) {
  const f = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = hexRgb(hex);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

function rgba(hex, alpha) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------
// On-screen messages (errors, camera). Tap to close.
// ---------------------------------------------------------------------
const messages = {}; // key -> { text, isError }
const messageTimers = {};

function setMessage(key, text, isError = false, hideAfterMs = 0) {
  clearTimeout(messageTimers[key]);
  if (text) messages[key] = { text, isError };
  else delete messages[key];
  if (text && hideAfterMs) messageTimers[key] = setTimeout(() => setMessage(key, null), hideAfterMs);

  const list = Object.values(messages);
  messageEl.innerHTML = list.map((m) => m.text).join("<br><br>");
  messageEl.classList.toggle("visible", list.length > 0);
  messageEl.classList.toggle("error", list.some((m) => m.isError));
}
messageEl.addEventListener("click", () => {
  for (const key of Object.keys(messages)) setMessage(key, null);
});

window.addEventListener("error", (e) => {
  setMessage("js", `<strong>Something went wrong.</strong><br>${e.message}<small>Press D for debug info.</small>`, true);
});
window.addEventListener("unhandledrejection", (e) => {
  setMessage("js", `<strong>Something went wrong.</strong><br>${e.reason?.message || e.reason}`, true);
});

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const state = {
  screen: "draw", // draw | world | scan
  debug: false,
  time: 0,
  fps: 0,
  lastError: null,
  timerLeft: CONFIG.timer.seconds,
  timerRunning: false,
  penAt: -1e9, // last time an Apple Pencil touched the sheet (palm rejection)
};

const world = {
  ground: null,
  platforms: [],
  surfaces: [], // ground + platforms, for walking and landing
  door: null,
  krabbels: [], // oldest first
  particles: [], // doodle confetti in the world
  nextId: 1,
};

const flights = []; // drawings on their way into the world
const fxParticles = []; // their sparkle trail (drawn on top of everything)
let fxDirty = false;

// ---------------------------------------------------------------------
// Canvas size
// ---------------------------------------------------------------------
function resize() {
  const oldW = W;
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const [c, g] of [
    [worldCanvas, wctx],
    [fxCanvas, fctx],
    [bgLayer, bgCtx],
    [sceneLayer, sceneCtx],
  ]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  renderBackground();
  buildWorld();

  // Krabbels are placed in pixels: put them back on the ground at the same relative spot.
  for (const k of world.krabbels) {
    configureKrabbel(k);
    k.placeAt(clamp(k.x * (oldW ? W / oldW : 1), world.ground.x0 + 10, world.ground.x1 - 10), world.ground.top);
    k.brain.plan = k.brain.leaving && !k.brain.exitT ? [{ leave: true }] : [];
  }
}
window.addEventListener("resize", resize);

// ---------------------------------------------------------------------
// The paper world: geometry
// ---------------------------------------------------------------------
function buildWorld() {
  const C = CONFIG.world;
  world.ground = {
    x0: C.groundX[0] * W,
    x1: C.groundX[1] * W,
    top: C.groundY * H,
    thickness: C.groundThickness * H,
    color: C.groundColor,
    isGround: true,
  };
  world.platforms = C.platforms.map((p) => ({
    x0: p.x * W,
    x1: (p.x + p.w) * W,
    top: p.y * H,
    thickness: C.platformThickness * H,
    color: p.color,
    isGround: false,
  }));
  world.surfaces = [world.ground, ...world.platforms];
  world.door = { x: C.door.x * W, y: world.ground.top, w: C.door.w * U(), h: C.door.h * U() };
  renderScene();
}

// For Krabbel's `ground` option: the first surface top crossed going down from yFrom to yTo at x.
function groundAt(x, yFrom, yTo) {
  let best = null;
  for (const s of world.surfaces) {
    if (x < s.x0 || x > s.x1) continue;
    if (s.top >= yFrom - 0.5 && s.top <= yTo + 0.5 && (best === null || s.top < best)) best = s.top;
  }
  return best;
}

function surfaceOf(k) {
  let best = world.ground;
  let bestD = Infinity;
  for (const s of world.surfaces) {
    if (k.x < s.x0 - 2 || k.x > s.x1 + 2) continue;
    const d = Math.abs(s.top - k.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Where a Krabbel may walk on a surface (on the ground: not into the door).
function walkBounds(k, s) {
  const m = Math.min(k.bodyWidth * 0.35, (s.x1 - s.x0) * 0.4);
  let a = s.x0 + m;
  let b = s.x1 - m;
  if (s.isGround) b = Math.min(b, world.door.x - world.door.w * 0.9 - k.bodyWidth * 0.3);
  if (b < a) a = b = (s.x0 + s.x1) / 2;
  return [a, b];
}

// ---------------------------------------------------------------------
// The paper world: drawing helpers (from the level prototype)
// ---------------------------------------------------------------------
const FONT = '"Fredoka", ui-rounded, system-ui, sans-serif';

// Little doodles: star, spiral, heart, zigzag, plus, circle, wave.
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

// Sparkle ticks around something nice.
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

// Graph paper on warm off-white, with faint pencil doodles.
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

  // Faint coloured pencil doodles
  g.globalAlpha = 0.3;
  for (let i = 0; i < CONFIG.world.doodles; i++) {
    const s = H * (0.01 + rnd() * 0.012);
    drawDoodle(g, rnd() * W, rnd() * H, s, Math.floor(rnd() * 7), C.doodles[i % C.doodles.length], rnd() * 6.28);
  }
  g.globalAlpha = 1;
}

// Platforms, ground and door, painted once.
function renderScene() {
  const g = sceneCtx;
  g.clearRect(0, 0, W, H);
  world.platforms.forEach((p, i) => drawCrayonSlab(g, p, 11 + i * 17));
  drawCrayonSlab(g, world.ground, 3);
  drawDoorShape(g, world.door);
}

// A closed, smooth path through wobbly points.
function smoothClosedPath(pts) {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  p.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    p.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  p.closePath();
  return p;
}

// Oil-pastel strokes, clipped to a shape.
function pastelTexture(g, clip, x, y, w, h, color, rnd) {
  g.save();
  g.clip(clip);
  g.lineCap = "round";
  const n = Math.min(1200, Math.round((w * h) / 450));
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

// A platform coloured in with wax crayon: wobbly edges, zigzag scribble, paper showing through.
function drawCrayonSlab(g, s, seed) {
  const rnd = seeded(seed);
  const { x0, x1, top } = s;
  const bot = top + s.thickness;
  const r = Math.min(16, s.thickness * 0.45);
  const pts = [];
  const add = (x, y, amp) => pts.push({ x: x + (rnd() - 0.5) * amp, y: y + (rnd() - 0.5) * amp });
  const corner = (cx, cy, a0) => {
    for (let a = a0; a < a0 + Math.PI / 2; a += 0.5) add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3);
  };
  for (let x = x0 + r; x < x1 - r; x += 12) add(x, top, 1.6); // top stays nearly flat: the feet stand on it
  corner(x1 - r, top + r, -Math.PI / 2);
  for (let y = top + r; y < bot - r; y += 10) add(x1, y, 5);
  corner(x1 - r, bot - r, 0);
  for (let x = x1 - r; x > x0 + r; x -= 12) add(x, bot, 5);
  corner(x0 + r, bot - r, Math.PI / 2);
  for (let y = bot - r; y > top + r; y -= 10) add(x0, y, 5);
  corner(x0 + r, top + r, Math.PI);
  const path = smoothClosedPath(pts);

  g.save();
  g.shadowColor = "rgba(31, 35, 64, 0.22)";
  g.shadowBlur = 14;
  g.shadowOffsetX = 3;
  g.shadowOffsetY = 6;
  g.fillStyle = s.color;
  g.fill(path);
  g.restore();

  pastelTexture(g, path, x0, top - 4, x1 - x0, bot - top + 8, s.color, rnd);

  // Zigzag scribble, like colouring in with a crayon
  g.save();
  g.clip(path);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = shade(s.color, -0.14);
  g.globalAlpha = 0.32;
  g.lineWidth = 2.2;
  g.beginPath();
  const h = bot - top;
  let x = x0 - h;
  g.moveTo(x, bot + 4);
  while (x < x1 + h) {
    x += 5 + rnd() * 5;
    g.lineTo(x + h * 0.55, top - 4 + (rnd() - 0.5) * 4);
    x += 5 + rnd() * 5;
    g.lineTo(x, bot + 4 + (rnd() - 0.5) * 4);
  }
  g.stroke();

  // Paper showing through where the wax skipped
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < ((x1 - x0) * h) / 90; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.fillRect(x0 + rnd() * (x1 - x0), top + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 1.5);
  }
  g.restore();

  // Crayon edge, twice and slightly off, like a hand-drawn line
  g.save();
  g.lineJoin = "round";
  g.strokeStyle = shade(s.color, -0.3);
  g.globalAlpha = 0.55;
  g.lineWidth = 2.5;
  g.stroke(path);
  g.translate(1.2, -0.8);
  g.globalAlpha = 0.3;
  g.lineWidth = 1.5;
  g.stroke(path);
  g.restore();

  // Light edge along the top, where the Krabbels walk
  g.strokeStyle = "rgba(255, 255, 255, 0.5)";
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x0 + r, top + 3);
  g.lineTo(x1 - r, top + 3);
  g.stroke();
}

// The door to the real world: a white paper door, swung open, with warm light behind it.
function drawDoorShape(g, d) {
  const ink = CONFIG.colors.ink;
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
  g.strokeStyle = ink;
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.stroke();
  g.fillStyle = ink;
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

function drawDoorGlow(g) {
  const d = world.door;
  const pulse = 0.5 + Math.sin(state.time * 3) * 0.2;
  const cx = d.x;
  const cy = d.y - d.h / 2;
  const glow = g.createRadialGradient(cx, cy, d.w * 0.3, cx, cy, d.h * 1.1);
  glow.addColorStop(0, rgba(CONFIG.colors.glow, pulse));
  glow.addColorStop(1, rgba(CONFIG.colors.glow, 0));
  g.fillStyle = glow;
  g.fillRect(cx - d.h * 1.2, cy - d.h * 1.2, d.h * 2.4, d.h * 2.4);
}

// ---------------------------------------------------------------------
// Doodle particles (sparkle trail, confetti)
// ---------------------------------------------------------------------
function spawnDoodle(list, x, y, opts = {}) {
  const life = opts.life ?? random(0.6, 1.1);
  list.push({
    x,
    y,
    vx: opts.vx ?? random(-60, 60),
    vy: opts.vy ?? random(-60, 30),
    g: opts.g ?? 120,
    size: opts.size ?? random(5, 11) * (U() / 900),
    type: opts.type ?? pickOne([0, 0, 1, 4]), // stars, spirals, plus signs
    color: opts.color ?? pickOne(CONFIG.colors.doodles),
    rot: random(0, 6.28),
    spin: random(-5, 5),
    life,
    maxLife: life,
  });
}

function burst(list, x, y, count, speed = 260) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random(-0.2, 0.2);
    const v = random(0.5, 1) * speed * (U() / 900);
    spawnDoodle(list, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 300, type: Math.floor(random(0, 7)), life: random(0.7, 1.2) });
  }
}

function updateParticles(list, dt) {
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
    p.vx *= Math.exp(-1.5 * dt);
    p.rot += p.spin * dt;
    p.life -= dt;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
}

function drawParticles(g, list) {
  for (const p of list) {
    g.globalAlpha = clamp((p.life / p.maxLife) * 1.6, 0, 1);
    drawDoodle(g, p.x, p.y, p.size, p.type, p.color, p.rot);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Krabbels in the world
// ---------------------------------------------------------------------
function krabbelSize() {
  return Math.max(60, CONFIG.krabbel.size * U());
}

// Sizes and speeds depend on the window size, so they are set here (and again on resize).
function configureKrabbel(k) {
  const kc = CONFIG.krabbel;
  k.opts.walkSpeed = kc.walkSpeed * U() * k.brain.speed;
  k.opts.gravity = kc.gravity * U();
  k.setSize(krabbelSize());
}

function createKrabbel(image, x) {
  const kc = CONFIG.krabbel;
  const k = new Krabbel(image, {
    x,
    y: world.ground.top,
    size: krabbelSize(),
    legLength: kc.legLength,
    walkSpeed: kc.walkSpeed * U(),
    gravity: kc.gravity * U(),
    jumpHeight: kc.jumpHeight,
    wobble: kc.wobble,
    breathe: kc.breathe,
    flip: kc.flip,
    autoEyes: CONFIG.autoEyes,
    ink: CONFIG.colors.ink,
    ground: groundAt,
    maxPixelRatio: CONFIG.maxPixelRatio,
    popIn: true,
  });
  k.id = world.nextId++;
  k.brain = {
    wait: 0.4, // seconds until the next own idea
    plan: [], // steps to do in order: { walk }, { jump }, { wave }, { leave }, { exit }
    leaving: false,
    exitT: 0,
    speed: 1 + random(-1, 1) * kc.speedVariation,
  };
  configureKrabbel(k);
  return k;
}

function addKrabbel(k) {
  world.krabbels.push(k);
  const r = k.bodyRect();
  burst(world.particles, r.x + r.w / 2, r.y + r.h / 2, 16);

  // Busy world: the oldest Krabbel says goodbye.
  let staying = world.krabbels.filter((o) => !o.brain.leaving);
  while (staying.length > CONFIG.maxKrabbels) {
    startLeaving(staying[0]);
    staying = staying.slice(1);
  }
}

function startLeaving(k) {
  k.brain.leaving = true;
  k.brain.plan = [{ leave: true }];
  k.stop();
}

// Every frame, before k.update(): decide what a Krabbel does next.
function think(k, dt) {
  const b = k.brain;

  // Going through the door: shrink into the light, then gone.
  if (b.exitT > 0) {
    b.exitT += dt;
    const u = clamp(b.exitT / CONFIG.behaviour.exitTime, 0, 1);
    k.scale = 1 - u * u;
    k.alpha = 1 - u * u * u;
    if (u >= 1) k.gone = true;
    return;
  }
  if (k.busy) return;
  if (b.plan.length) return runStep(k, b.plan.shift());
  if (b.leaving) return; // (the plan always ends with "exit")

  b.wait -= dt;
  if (b.wait > 0) return;
  b.wait = random(CONFIG.behaviour.pauseMin, CONFIG.behaviour.pauseMax);

  const B = CONFIG.behaviour;
  const surf = surfaceOf(k);
  const r = Math.random();
  if (r < B.jumpChance) {
    const options = jumpOptions(k, surf);
    if (options.length) return planJump(k, pickOne(options));
  } else if (r < B.jumpChance + B.lookChance) {
    return k.lookAround();
  } else if (r < B.jumpChance + B.lookChance + B.waveChance) {
    return k.wave();
  }
  walkSomewhere(k, surf);
}

function runStep(k, step) {
  if (step.walk !== undefined) k.walkTo(step.walk);
  else if (step.jump) k.jump(step.jump);
  else if (step.wave) k.wave();
  else if (step.leave) planLeave(k);
  else if (step.exit) {
    k.brain.exitT = 0.0001;
    k.walkTo(world.door.x + world.door.w * 0.15);
    if (CONFIG.sticker.exportOnLeave) setTimeout(() => exportSticker(k, "leave"), 0);
  }
}

// Walk left or right; near an edge it turns around.
function walkSomewhere(k, surf) {
  const [a, b] = walkBounds(k, surf);
  const minD = CONFIG.behaviour.minWalk * W;
  let x = random(a, b);
  if (Math.abs(x - k.x) < minD) x = k.x + (x >= k.x ? 1 : -1) * minD;
  if (x < a || x > b) x = k.x - (x - k.x); // no room that way: turn around
  k.walkTo(clamp(x, a, b));
}

// All jumps that are possible from where k stands: onto a platform, off it, or across.
function jumpOptions(k, s) {
  const B = CONFIG.behaviour;
  const out = [];
  const [sa, sb] = walkBounds(k, s);
  for (const p of world.surfaces) {
    if (p === s) continue;
    const rise = s.top - p.top; // > 0: p is higher
    if (rise > B.maxRise * H) continue;
    const [pa, pb] = walkBounds(k, p);
    for (const dir of [-1, 1]) {
      let takeoff;
      let land;
      if (rise < 0 && p.x0 < s.x0 && p.x1 > s.x1) {
        // Hop down off the edge onto the wide surface below
        takeoff = dir > 0 ? s.x1 - 3 : s.x0 + 3;
        land = takeoff + dir * B.takeoffDistance * W;
      } else {
        // Jump onto the near end of p, with a run-up
        land = dir > 0 ? pa : pb;
        takeoff = clamp(land - dir * B.takeoffDistance * W, sa, sb);
        if (rise > 0 && takeoff > p.x0 - 4 && takeoff < p.x1 + 4) continue; // never start underneath it
      }
      if (land < pa || land > pb) continue;
      if ((land - takeoff) * dir <= 0) continue;
      if (Math.abs(land - takeoff) > B.maxJumpDistance * W) continue;
      if (rise < 0 && land > s.x0 - 2 && land < s.x1 + 2) continue;
      out.push({ takeoff, land, p, rise });
    }
  }
  return out;
}

function planJump(k, o) {
  k.brain.plan = [
    { walk: o.takeoff },
    { jump: { toX: o.land, toY: o.p.top, height: Math.max(0, o.rise) + k.size * CONFIG.krabbel.jumpHeight } },
  ];
}

// Leaving: down to the ground (if needed), walk to the door, wave, go in.
function planLeave(k) {
  const surf = surfaceOf(k);
  const steps = [];
  if (!surf.isGround) {
    const down = jumpOptions(k, surf).filter((o) => o.p.isGround);
    down.sort((a, b) => b.land - a.land); // the side closest to the door
    const o = down[0] || { takeoff: surf.x1 - 3, land: surf.x1 + 0.05 * W, p: world.ground, rise: world.ground.top - surf.top };
    steps.push({ walk: o.takeoff }, { jump: { toX: o.land, toY: world.ground.top, height: k.size * CONFIG.krabbel.jumpHeight } });
  }
  steps.push({ walk: world.door.x - world.door.w * 0.25 }, { wave: true }, { exit: true });
  k.brain.plan.unshift(...steps);
}

function updateWorld(dt) {
  for (const k of world.krabbels) {
    think(k, dt);
    k.update(dt);
    if (k.y > H * 2) k.placeAt(clamp(k.x, world.ground.x0 + 20, world.ground.x1 - 20), world.ground.top); // fell off the world
  }
  world.krabbels = world.krabbels.filter((k) => !k.gone);
  updateParticles(world.particles, dt);
}

function drawWorld() {
  const g = wctx;
  g.drawImage(bgLayer, 0, 0, W, H);
  drawDoorGlow(g);
  g.drawImage(sceneLayer, 0, 0, W, H);
  for (const k of world.krabbels) k.draw(g);
  drawParticles(g, world.particles);
  if (state.debug) drawWorldDebug(g);
}

function clearWorld() {
  for (const k of world.krabbels) {
    const r = k.bodyRect();
    burst(world.particles, r.x + r.w / 2, r.y + r.h / 2, 10, 200);
  }
  world.krabbels = [];
}

// Tap a Krabbel: it waves back.
worldCanvas.addEventListener("pointerdown", (e) => {
  if (state.screen !== "world") return;
  for (let i = world.krabbels.length - 1; i >= 0; i--) {
    const k = world.krabbels[i];
    if (k.brain.leaving || !k.hitTest(e.clientX, e.clientY)) continue;
    k.brain.plan = [];
    k.wave();
    return;
  }
});

// ---------------------------------------------------------------------
// Transition: the drawing lifts off, flies into the world and pops to life
// ---------------------------------------------------------------------
function launchFlight(crop, sheetRect) {
  const k = sheetRect.width / CONFIG.drawing.size;
  const b = crop.box;
  const from = { x: sheetRect.left + (b.x + b.w / 2) * k, y: sheetRect.top + (b.y + b.h / 2) * k, w: b.w * k, h: b.h * k };
  const g = world.ground;
  const x = random(lerp(g.x0, g.x1, 0.12), Math.min(lerp(g.x0, g.x1, 0.7), world.door.x - world.door.w * 2));
  const krabbel = createKrabbel(crop.canvas, x);
  const r = krabbel.bodyRect();
  const to = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
  flights.push({ img: crop.canvas, from, to, t: 0, trailT: 0, krabbel });
}

function flightPose(f) {
  const { lift, fly } = CONFIG.flight;
  const lifted = { x: f.from.x, y: f.from.y - 18 };
  if (f.t < lift) {
    const u = easeOut(f.t / lift);
    return { x: f.from.x, y: f.from.y - 18 * u, w: f.from.w * (1 + 0.06 * u), h: f.from.h * (1 + 0.06 * u), rot: -0.05 * u, lift: u };
  }
  const u = clamp((f.t - lift) / fly, 0, 1);
  const e = easeInOut(u);
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
        spawnDoodle(fxParticles, p.x + random(-0.3, 0.3) * p.w, p.y + random(-0.3, 0.3) * p.h);
      }
    }
    if (f.t >= CONFIG.flight.lift + CONFIG.flight.fly) {
      flights.splice(i, 1);
      addKrabbel(f.krabbel); // pop!
    }
  }
  updateParticles(fxParticles, dt);
}

function drawFx() {
  if (!flights.length && !fxParticles.length && !fxDirty) return;
  const g = fctx;
  g.clearRect(0, 0, W, H);
  drawParticles(g, fxParticles);
  for (const f of flights) {
    const p = flightPose(f);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.shadowColor = "rgba(31, 35, 64, 0.3)";
    g.shadowBlur = 26 * p.lift;
    g.shadowOffsetY = 16 * p.lift;
    g.drawImage(f.img, -p.w / 2, -p.h / 2, p.w, p.h);
    g.restore();
  }
  fxDirty = flights.length > 0 || fxParticles.length > 0;
}

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------
function showScreen(name) {
  state.screen = name;
  drawScreen.classList.toggle("hidden", name !== "draw");
  worldUi.classList.toggle("hidden", name !== "world");
  scanScreen.hidden = name !== "scan";
}

function openDrawing(fresh) {
  if (fresh) newDrawing();
  showScreen("draw");
  if (CONFIG.timer.enabled && !CONFIG.timer.startOnFirstStroke) startTimer();
}

// The green check: crop, fly, pop. An empty sheet gives a gentle shake instead.
function submitDrawing() {
  if (state.screen !== "draw") return false;
  if (pad.stroke) finishStroke();
  const crop = cropDrawing(drawCanvas, { padding: CONFIG.drawing.cropPadding, minPixels: CONFIG.drawing.minInkPixels });
  if (!crop) {
    shake(doneBtn);
    return false;
  }
  launchFlight(crop, drawCanvas.getBoundingClientRect());
  newDrawing();
  showScreen("world");
  return true;
}

function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth; // restart the animation
  el.classList.add("shake");
}

// ---------------------------------------------------------------------
// Drawing pad: crayon strokes, undo, eraser
// ---------------------------------------------------------------------
const S = CONFIG.drawing.size;
drawCanvas.width = S;
drawCanvas.height = S;
$("hintCircle").setAttribute("r", String(CONFIG.drawing.hintRadius * 100));

const pad = {
  history: [], // strokes, scanned images and clears, replayed for undo
  stroke: null, // the stroke being drawn
  pointerId: null,
  rect: null,
  smooth: null,
  color: CONFIG.drawing.colors[CONFIG.drawing.startColor],
  brush: CONFIG.drawing.startBrush,
  eraser: false,
};

function newDrawing() {
  pad.history = [];
  pad.stroke = null;
  pad.pointerId = null;
  pad.eraser = false;
  dctx.clearRect(0, 0, S, S);
  hintEl.classList.remove("faded");
  stopTimer();
  refreshToolbar();
}

// --- Crayon brush: grainy, rough-edged stamps + a few waxy streaks ---
const stampCache = new Map();

function getStamp(color, R, variant) {
  const key = `${color}|${R}|${variant}`;
  let c = stampCache.get(key);
  if (c) return c;
  const size = R * 2 + 4;
  c = makeCanvas(size, size);
  const g = c.getContext("2d");
  const rnd = seeded(hashString(key));
  const [cr, cg, cb] = hexRgb(color);
  const bumps = Array.from({ length: 12 }, () => 0.78 + rnd() * 0.22); // rough edge
  const edgeAt = (a) => {
    const f = (a / (Math.PI * 2)) * 12;
    const i = Math.floor(f);
    return lerp(bumps[i % 12], bumps[(i + 1) % 12], f - i);
  };
  const n = Math.round(R * R * 1.5) + 20;
  const dot = Math.max(1, R * 0.11);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const e = edgeAt(a) * R;
    const d = Math.sqrt(rnd()) * e;
    const t = d / e;
    const v = (rnd() - 0.5) * 34;
    const alpha = (0.3 + rnd() * 0.5) * (1 - t * t * 0.55);
    g.fillStyle = `rgba(${clamp(cr + v, 0, 255) | 0}, ${clamp(cg + v, 0, 255) | 0}, ${clamp(cb + v, 0, 255) | 0}, ${alpha.toFixed(3)})`;
    const ds = dot * (0.5 + rnd());
    g.fillRect(size / 2 + Math.cos(a) * d - ds / 2, size / 2 + Math.sin(a) * d - ds / 2, ds, ds);
  }
  stampCache.set(key, c);
  return c;
}

function radiusAt(st, p) {
  let r = st.radius;
  if (st.pen && CONFIG.drawing.pencilPressure) r *= 0.55 + 0.9 * clamp(p.p, 0, 1);
  return r;
}

// Every stroke has its own seed, so replaying it (undo) gives exactly the same pixels.
function beginStroke(st) {
  st.rnd = seeded(st.seed);
  st.carry = 0;
  st.streaks = [0, 1, 2].map(() => ({
    off: (st.rnd() - 0.5) * 1.3,
    tone: shade(st.color, st.rnd() < 0.5 ? 0.25 : -0.2),
    alpha: 0.15 + st.rnd() * 0.15,
  }));
}

function stampAt(g, st, x, y, r) {
  if (st.eraser) {
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    return;
  }
  const R = Math.max(2, Math.round(r / 2) * 2);
  const stamp = getStamp(st.color, R, Math.floor(st.rnd() * 4));
  const j = R * 0.1;
  g.drawImage(stamp, x - stamp.width / 2 + (st.rnd() - 0.5) * j, y - stamp.height / 2 + (st.rnd() - 0.5) * j);
}

function strokeDot(g, st, p) {
  stampAt(g, st, p.x, p.y, radiusAt(st, p));
  st.carry = Math.max(1, radiusAt(st, p) * 0.28);
}

function strokeSegment(g, st, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ra = radiusAt(st, a);
  const rb = radiusAt(st, b);
  let d = st.carry;
  while (d <= len) {
    const t = d / len;
    const r = lerp(ra, rb, t);
    stampAt(g, st, a.x + dx * t, a.y + dy * t, r);
    d += Math.max(1, r * 0.28);
  }
  st.carry = d - len;
  if (st.eraser) return;

  // Waxy streaks along the stroke (oil pastel)
  const nx = -dy / len;
  const ny = dx / len;
  g.lineCap = "round";
  g.lineWidth = Math.max(1, rb * 0.12);
  for (const s of st.streaks) {
    g.strokeStyle = s.tone;
    g.globalAlpha = s.alpha;
    g.beginPath();
    g.moveTo(a.x + nx * s.off * ra, a.y + ny * s.off * ra);
    g.lineTo(b.x + nx * s.off * rb, b.y + ny * s.off * rb);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function replay(entry) {
  if (entry.type === "clear") {
    dctx.clearRect(0, 0, S, S);
  } else if (entry.type === "image") {
    dctx.drawImage(entry.image, 0, 0, S, S);
  } else {
    beginStroke(entry);
    strokeDot(dctx, entry, entry.points[0]);
    for (let i = 1; i < entry.points.length; i++) strokeSegment(dctx, entry, entry.points[i - 1], entry.points[i]);
  }
}

function redrawAll() {
  dctx.clearRect(0, 0, S, S);
  for (const entry of pad.history) replay(entry);
}

function undo() {
  if (pad.stroke || !pad.history.length) return;
  pad.history.pop();
  redrawAll();
}

function clearDrawing() {
  if (pad.stroke) return;
  if (pad.history.length && pad.history[pad.history.length - 1].type !== "clear") pad.history.push({ type: "clear" }); // undo brings it back
  dctx.clearRect(0, 0, S, S);
}

function addImageToDrawing(image) {
  pad.history.push({ type: "image", image });
  dctx.drawImage(image, 0, 0, S, S);
  hintEl.classList.add("faded");
}

// --- Pointer input (mouse, touch, Apple Pencil) ---
function canvasPoint(e) {
  const r = pad.rect;
  return {
    x: ((e.clientX - r.left) * S) / r.width,
    y: ((e.clientY - r.top) * S) / r.height,
    p: e.pressure || 0.5,
  };
}

function addPoint(raw) {
  const st = pad.stroke;
  const k = 1 - CONFIG.drawing.smoothing;
  pad.smooth.x += (raw.x - pad.smooth.x) * k;
  pad.smooth.y += (raw.y - pad.smooth.y) * k;
  const p = { x: pad.smooth.x, y: pad.smooth.y, p: raw.p };
  const last = st.points[st.points.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
  st.points.push(p);
  strokeSegment(dctx, st, last, p);
}

function finishStroke(e) {
  const st = pad.stroke;
  if (!st) return;
  if (e) {
    // Catch up with the smoothing, so the line ends where the finger lifted.
    const raw = canvasPoint(e);
    const last = st.points[st.points.length - 1];
    if (Math.hypot(raw.x - last.x, raw.y - last.y) >= 1.2) {
      const p = { x: raw.x, y: raw.y, p: last.p };
      st.points.push(p);
      strokeSegment(dctx, st, last, p);
    }
  }
  pad.history.push(st);
  pad.stroke = null;
  pad.pointerId = null;
}

drawCanvas.addEventListener("pointerdown", (e) => {
  if (state.screen !== "draw" || pad.pointerId !== null) return; // one finger at a time
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.pointerType === "touch" && performance.now() - state.penAt < 2500) return; // palm while using the Pencil
  if (e.pointerType === "pen") state.penAt = performance.now();
  e.preventDefault();
  drawCanvas.setPointerCapture?.(e.pointerId);
  pad.pointerId = e.pointerId;
  pad.rect = drawCanvas.getBoundingClientRect();
  const p = canvasPoint(e);
  const base = CONFIG.drawing.brushSizes[pad.brush];
  const st = {
    type: "stroke",
    color: pad.color,
    radius: pad.eraser ? base * CONFIG.drawing.eraserScale : base,
    eraser: pad.eraser,
    pen: e.pointerType === "pen",
    seed: (Math.random() * 2 ** 31) | 0,
    points: [p],
  };
  pad.stroke = st;
  pad.smooth = { x: p.x, y: p.y };
  beginStroke(st);
  strokeDot(dctx, st, p);
  if (!st.eraser) {
    hintEl.classList.add("faded");
    if (CONFIG.timer.enabled && CONFIG.timer.startOnFirstStroke) startTimer();
  }
});

drawCanvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pad.pointerId || !pad.stroke) return;
  e.preventDefault();
  if (e.pointerType === "pen") state.penAt = performance.now();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of events.length ? events : [e]) addPoint(canvasPoint(ev));
});

for (const type of ["pointerup", "pointercancel"]) {
  drawCanvas.addEventListener(type, (e) => {
    if (e.pointerId === pad.pointerId) finishStroke(e);
  });
}

// iPad Safari: no page scrolling, rubber-banding or pinch zoom.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());

// --- Toolbar ---
function buildToolbar() {
  const colorsEl = $("colors");
  CONFIG.drawing.colors.forEach((color, i) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.setProperty("--c", color);
    b.setAttribute("aria-label", `Colour ${i + 1}`);
    b.innerHTML = "<span></span>";
    b.addEventListener("click", () => {
      pad.color = color;
      pad.eraser = false;
      refreshToolbar();
    });
    colorsEl.appendChild(b);
  });

  const sizesEl = $("sizes");
  const sizes = CONFIG.drawing.brushSizes;
  sizes.forEach((r, i) => {
    const b = document.createElement("button");
    b.className = "size";
    b.setAttribute("aria-label", `Brush ${i + 1}`);
    const dot = 18 + (64 * (r - sizes[0])) / Math.max(1, sizes[sizes.length - 1] - sizes[0]); // % of the button
    b.innerHTML = `<span style="width:${dot}%;height:${dot}%"></span>`;
    b.addEventListener("click", () => {
      pad.brush = i;
      refreshToolbar();
    });
    sizesEl.appendChild(b);
  });

  eraserBtn.addEventListener("click", () => {
    pad.eraser = !pad.eraser;
    refreshToolbar();
  });
  $("undoBtn").addEventListener("click", undo);
  $("clearBtn").addEventListener("click", clearDrawing);
  doneBtn.addEventListener("click", submitDrawing);
  $("closeBtn").addEventListener("click", () => showScreen("world"));
  $("newBtn").addEventListener("click", () => openDrawing(false));
  stickerBtn.addEventListener("click", exportNewest);
  doneBtn.addEventListener("animationend", () => doneBtn.classList.remove("shake"));
  stickerBtn.addEventListener("animationend", () => stickerBtn.classList.remove("shake"));

  const scanBtn = $("scanBtn");
  scanBtn.hidden = !CONFIG.enableScan;
  scanBtn.addEventListener("click", openScan);
  $("scanClose").addEventListener("click", closeScan);
  $("captureBtn").addEventListener("click", captureScan);
  timerEl.hidden = !CONFIG.timer.enabled;
  refreshToolbar();
}

function refreshToolbar() {
  toolbar.style.setProperty("--current", pad.color);
  document.querySelectorAll(".swatch").forEach((b, i) => {
    b.classList.toggle("selected", !pad.eraser && CONFIG.drawing.colors[i] === pad.color);
  });
  document.querySelectorAll(".size").forEach((b, i) => b.classList.toggle("selected", i === pad.brush));
  eraserBtn.classList.toggle("selected", pad.eraser);
}

// --- Timer: a yellow circle that shrinks ---
function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.timerLeft = CONFIG.timer.seconds;
}

function stopTimer() {
  state.timerRunning = false;
  state.timerLeft = CONFIG.timer.seconds;
  timerFill.setAttribute("r", "18");
  timerEl.classList.remove("hurry");
}

function updateTimer(dt) {
  if (!state.timerRunning || state.screen !== "draw") return;
  state.timerLeft -= dt;
  const u = clamp(state.timerLeft / CONFIG.timer.seconds, 0, 1);
  timerFill.setAttribute("r", (18 * u).toFixed(2));
  timerEl.classList.toggle("hurry", state.timerLeft < 10);
  if (state.timerLeft <= 0) {
    stopTimer();
    submitDrawing(); // an empty sheet just shakes and the timer waits for the next stroke
  }
}

// ---------------------------------------------------------------------
// Stickers
// ---------------------------------------------------------------------
let previewTimer = 0;

function exportSticker(k, reason) {
  try {
    const { color, bw } = makeStickers(k, CONFIG.sticker);
    color.className = "color";
    bw.className = "bw";
    stickerPanel.replaceChildren(color, bw);
    stickerPanel.classList.add("filled");
    if (reason !== "leave") {
      stickerPanel.classList.add("show");
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => stickerPanel.classList.remove("show"), CONFIG.sticker.previewTime * 1000);
    }
    if (CONFIG.sticker.download) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadCanvas(color, `krabbel-${k.id}-${stamp}-color.png`);
      setTimeout(() => downloadCanvas(bw, `krabbel-${k.id}-${stamp}-bw.png`), 400);
    }
  } catch (err) {
    console.error("Sticker error:", err);
    setMessage("sticker", `<strong>The sticker could not be made.</strong><br>${err.message}`, true, 6000);
  }
}

function exportNewest() {
  const k = world.krabbels.filter((o) => !o.brain.leaving).pop();
  if (!k) return shake(stickerBtn);
  exportSticker(k, "button");
}

function downloadCanvas(canvas, name) {
  canvas.toBlob((blob) => {
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
// Optional phase 2: scan a paper drawing (CONFIG.enableScan)
// Needs good light and white or light paper.
// ---------------------------------------------------------------------
let scanStream = null;

async function openScan() {
  if (!CONFIG.enableScan) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setMessage(
      "scan",
      "<strong>The camera only works on a secure page.</strong><br>Open the demo via <em>http://localhost</em> on this computer, or via <em>https://</em> on the iPad. Plain <em>http://</em> over the network blocks the camera.",
      true
    );
    return;
  }
  document.documentElement.style.setProperty("--frame", `${CONFIG.scan.frame * 100}vmin`);
  showScreen("scan");
  setMessage("scan", "Waiting for camera permission…");
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: CONFIG.scan.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    scanVideo.srcObject = scanStream;
    await scanVideo.play();
    setMessage("scan", null);
  } catch (err) {
    console.error("Camera error:", err);
    closeScan();
    let text = `<strong>Could not start the camera.</strong><br>${err.name}: ${err.message}`;
    if (err.name === "NotAllowedError") {
      text = "<strong>Camera access was blocked.</strong><br>Allow the camera for this page (Safari: the <em>aA</em> menu → Website Settings → Camera), then try again.";
    } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
      text = "<strong>No camera found.</strong><br>Connect a camera and try again.";
    } else if (err.name === "NotReadableError") {
      text = "<strong>The camera is in use by another app</strong> (Zoom, Teams, FaceTime…).<br>Close it and try again.";
    }
    setMessage("scan", text, true);
  }
}

function closeScan() {
  if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
  scanStream = null;
  scanVideo.srcObject = null;
  if (state.screen === "scan") showScreen("draw");
}

function captureScan() {
  if (!scanVideo.videoWidth) return;
  const result = processScan(scanVideo);
  if (!result) {
    setMessage("scan", "<strong>No drawing found in the frame.</strong><br>Hold white paper flat inside the frame, in good light, and try again.", true, 5000);
    return;
  }
  closeScan();
  addImageToDrawing(result); // on the sheet, so the child sees it and presses the check
}

// 4-connected components of a 0/1 mask.
function labelComponents(mask, w, h) {
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || labels[p]) continue;
    let n = 0;
    let size = 0;
    stack[n++] = p;
    labels[p] = next;
    while (n) {
      const i = stack[--n];
      size++;
      const x = i % w;
      const visit = (j) => {
        if (mask[j] && !labels[j]) {
          labels[j] = next;
          stack[n++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < w * (h - 1)) visit(i + w);
    }
    sizes.push(size);
    next++;
  }
  return { labels, sizes };
}

// Camera frame -> drawing on a transparent background.
function processScan(video) {
  const C = CONFIG.scan;
  const N = C.size;
  const n = N * N;
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // The square frame on screen, in video pixels (the video is shown with object-fit: cover).
  const box = video.getBoundingClientRect();
  const cover = Math.max(box.width / vw, box.height / vh);
  const side = Math.min((C.frame * Math.min(box.width, box.height)) / cover, vw, vh);
  const c = makeCanvas(N, N);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, N, N);
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  const lumAt = (i) => (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;

  // 1. Paper colour per cell: the average of the brightest pixels (adaptive to uneven light).
  const G = 16;
  const cell = N / G;
  const paper = new Float32Array(G * G * 3);
  const paperLum = new Float32Array(G * G);
  const hist = new Uint32Array(64);
  for (let cy = 0; cy < G; cy++) {
    for (let cx = 0; cx < G; cx++) {
      const x0 = Math.floor(cx * cell);
      const x1 = Math.floor((cx + 1) * cell);
      const y0 = Math.floor(cy * cell);
      const y1 = Math.floor((cy + 1) * cell);
      hist.fill(0);
      let count = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        hist[lumAt((y * N + x) * 4) >> 2]++;
        count++;
      }
      let cut = 63;
      for (let b = 0, acc = 0; b < 64; b++) {
        acc += hist[b];
        if (acc >= count * 0.75) {
          cut = b;
          break;
        }
      }
      let r = 0;
      let gg = 0;
      let bb = 0;
      let m = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * N + x) * 4;
        if (lumAt(i) >> 2 < cut) continue;
        r += d[i];
        gg += d[i + 1];
        bb += d[i + 2];
        m++;
      }
      const j = cy * G + cx;
      paper[j * 3] = r / m;
      paper[j * 3 + 1] = gg / m;
      paper[j * 3 + 2] = bb / m;
      paperLum[j] = (0.299 * r + 0.587 * gg + 0.114 * bb) / m;
    }
  }
  // Cells that are mostly drawing look too dark: use the typical paper colour there.
  const sorted = Array.from(paperLum).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const typical = [0, 0, 0];
  let typicalN = 0;
  for (let j = 0; j < G * G; j++) {
    if (Math.abs(paperLum[j] - median) > median * 0.1) continue;
    for (let k = 0; k < 3; k++) typical[k] += paper[j * 3 + k];
    typicalN++;
  }
  for (let k = 0; k < 3; k++) typical[k] /= typicalN;
  const paperSat = (Math.max(...typical) - Math.min(...typical)) / Math.max(1, Math.max(...typical));
  if (median < 90 || paperSat > 0.35) return null; // no white or light paper in the frame
  for (let j = 0; j < G * G; j++) {
    if (paperLum[j] >= median * 0.8) continue;
    for (let k = 0; k < 3; k++) paper[j * 3 + k] = typical[k];
  }

  // 2. Divide by the paper colour (white paper becomes white), then score each pixel:
  //    dark enough or colourful enough = drawing.
  const alpha = new Uint8Array(n);
  const ink = new Uint8Array(n);
  const edge = Math.round(N * C.edgeIgnore);
  for (let y = 0; y < N; y++) {
    const gy = clamp(y / cell - 0.5, 0, G - 1);
    const ya = Math.floor(gy);
    const yb = Math.min(G - 1, ya + 1);
    const ty = gy - ya;
    for (let x = 0; x < N; x++) {
      const gx = clamp(x / cell - 0.5, 0, G - 1);
      const xa = Math.floor(gx);
      const xb = Math.min(G - 1, xa + 1);
      const tx = gx - xa;
      const p = y * N + x;
      const i = p * 4;
      const rgb = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const top = lerp(paper[(ya * G + xa) * 3 + k], paper[(ya * G + xb) * 3 + k], tx);
        const bottom = lerp(paper[(yb * G + xa) * 3 + k], paper[(yb * G + xb) * 3 + k], tx);
        rgb[k] = Math.min(255, (d[i + k] * 255) / Math.max(1, lerp(top, bottom, ty)));
        d[i + k] = rgb[k];
      }
      if (x < edge || y < edge || x >= N - edge || y >= N - edge) continue;
      const mx = Math.max(rgb[0], rgb[1], rgb[2]);
      const mn = Math.min(rgb[0], rgb[1], rgb[2]);
      const dark = 1 - (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const score = Math.max((dark - C.darkness) / 0.15 + 0.5, dark > 0.05 ? (sat - C.saturation) / 0.2 + 0.5 : 0);
      alpha[p] = clamp((score - 0.3) / 0.4, 0, 1) * 255; // soft edges
      if (score >= 0.5) ink[p] = 1;
    }
  }

  // 3. Remove specks.
  const islands = labelComponents(ink, N, N);
  const minSpeck = C.speckSize * n;
  for (let p = 0; p < n; p++) {
    if (ink[p] && islands.sizes[islands.labels[p]] < minSpeck) ink[p] = 0;
  }

  // 4. Keep the largest drawing: strokes close together form one group; keep the biggest group,
  //    plus everything inside it (eyes, a filled-in belly…).
  const groups = labelComponents(growMask(ink, N, N, Math.max(1, Math.round(N * C.groupDistance))), N, N);
  const inkPerGroup = new Float64Array(groups.sizes.length);
  for (let p = 0; p < n; p++) if (ink[p]) inkPerGroup[groups.labels[p]]++;
  let best = 0;
  for (let l = 1; l < inkPerGroup.length; l++) if (inkPerGroup[l] > inkPerGroup[best]) best = l;
  if (!best || inkPerGroup[best] < C.minDrawing * n) return null;
  if (inkPerGroup[best] > 0.6 * n) return null; // that's not a drawing on paper (no paper in view)

  const keep = fillHoles(groups.labels.map((l) => (l === best ? 1 : 0)), N, N);
  const nearInk = growMask(ink, N, N, 2); // soft edges only next to real strokes (no halo around removed specks)
  for (let p = 0; p < n; p++) d[p * 4 + 3] = keep[p] && nearInk[p] ? alpha[p] : 0;
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------
// Debug (D)
// ---------------------------------------------------------------------
function drawWorldDebug(g) {
  g.save();
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.strokeStyle = "#ff2bd6";
  for (const s of world.surfaces) {
    g.beginPath();
    g.moveTo(s.x0, s.top);
    g.lineTo(s.x1, s.top);
    g.stroke();
  }
  const d = world.door;
  g.strokeStyle = "#ff7a00";
  g.strokeRect(d.x - d.w / 2, d.y - d.h, d.w, d.h);
  g.setLineDash([]);
  g.font = `600 12px ${FONT}`;
  g.textAlign = "center";
  for (const k of world.krabbels) {
    k.drawDebug(g);
    const r = k.bodyRect();
    const step = k.brain.exitT ? "exit" : k.brain.plan[0] ? Object.keys(k.brain.plan[0])[0] : k.busy ? "busy" : "idle";
    const label = `#${k.id} ${k.brain.leaving ? "leaving · " : ""}${step}`;
    g.fillStyle = "rgba(0, 0, 0, 0.6)";
    const w = g.measureText(label).width + 10;
    g.fillRect(k.x - w / 2, r.y - 22, w, 17);
    g.fillStyle = "#ffffff";
    g.fillText(label, k.x, r.y - 9);
  }
  g.restore();
}

let debugTextT = 0;
function updateDebugInfo(dt) {
  if (!state.debug || (debugTextT -= dt) > 0) return;
  debugTextT = 0.25;
  const leaving = world.krabbels.filter((k) => k.brain.leaving).length;
  debugInfo.textContent = [
    `fps ${state.fps}   krabbels ${world.krabbels.length} (${leaving} leaving, max ${CONFIG.maxKrabbels})   flying ${flights.length}`,
    `screen ${state.screen}   strokes ${pad.history.length}   timer ${CONFIG.timer.enabled ? (state.timerRunning ? state.timerLeft.toFixed(0) + " s" : "waiting") : "off"}   scan ${CONFIG.enableScan ? "on" : "off"}`,
    `window ${W}×${H} @${Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio)}x   last error: ${state.lastError || "none"}`,
    `D debug · N new drawing · C clear world · S sticker`,
  ].join("\n");
}

// ---------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "d") {
    state.debug = !state.debug;
    document.body.classList.toggle("debug", state.debug);
    debugTextT = 0;
  } else if (key === "escape" && state.screen === "scan") {
    closeScan();
  } else if (state.screen === "scan") {
    return;
  } else if (key === "n") {
    openDrawing(true);
  } else if (key === "c") {
    clearWorld();
  } else if (key === "s") {
    exportNewest();
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
  const dt = Math.min(0.05, Math.max(0, elapsed));
  lastTime = now;
  state.time += dt;

  fpsFrames++;
  fpsTime += elapsed;
  if (fpsTime >= 0.5) {
    state.fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  // An update or drawing error must never freeze the installation: log it and keep running.
  try {
    updateTimer(dt);
    updateFlights(dt);
    updateWorld(dt);
    drawWorld();
    drawFx();
    updateDebugInfo(dt);
  } catch (err) {
    if (state.lastError !== err.message) {
      console.error("Frame error:", err);
      setMessage("frame", `<strong>Something went wrong.</strong><br>${err.message}<small>Press D for debug info.</small>`, true, 8000);
    }
    state.lastError = err.message;
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------
// Start on the drawing screen, with the (empty) world behind it.
// ---------------------------------------------------------------------
resize();
buildToolbar();
newDrawing();
showScreen("draw");
requestAnimationFrame(frame);
