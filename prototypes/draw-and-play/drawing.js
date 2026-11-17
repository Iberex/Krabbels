// =====================================================================
// The drawing screen (from the Drawing Life demo): a sheet of paper with
// crayon strokes and big icon tools. No text: 6-year-olds can't read.
//
//   initDrawing(CONFIG, { onDone, onClose })  once
//   openDrawing({ player, players })          a fresh sheet for a player
//   closeDrawing()                            hide it
//   updateDrawing(dt)                         every frame (timer)
//   drawingIdleTime()                         seconds since the last touch
//
// onDone(crop, sheetRect) gets the cropped drawing (see cropDrawing in
// krabbel.js) and where the sheet is on screen, for the flight animation.
// crop.eyes holds the googly eyes the child stuck on ([{ x, y, r }] in crop
// px). They are kept apart from the strokes: always round and crisp, the
// eraser doesn't touch them, and undo works for them too.
// =====================================================================

import { cropDrawing } from "./krabbel.js";

const $ = (id) => document.getElementById(id);
const drawScreen = $("drawScreen");
const drawCanvas = $("drawCanvas");
const dctx = drawCanvas.getContext("2d");
const eyeCanvas = $("eyeCanvas"); // the googly eyes, on top of the strokes
const ectx = eyeCanvas.getContext("2d");
const eyeBtn = $("eyeBtn");
const toolbar = $("toolbar");
const doneBtn = $("doneBtn");
const eraserBtn = $("eraserBtn");
const hintEl = $("hint");
const timerEl = $("timer");
const timerFill = $("timerFill");
const playerBadge = $("playerBadge");

let C = null; // CONFIG.drawing
let T = null; // CONFIG.timer
let S = 1024; // canvas size
let handlers = {};
let isOpen = false;
let idle = 0; // seconds since the last touch
const timer = { running: false, left: 0 };

const pad = {
  history: [], // strokes, clears and googly-eye changes, replayed for undo
  stroke: null, // the stroke being drawn
  pointerId: null,
  rect: null,
  smooth: null,
  color: null,
  brush: 0,
  tool: "crayon", // crayon | eraser | eyes
  eyes: [], // googly eyes on the sheet: { x, y, r } in canvas px
  drag: null, // an eye being placed or moved
  penAt: -1e9, // last time an Apple Pencil touched the sheet (palm rejection)
};

// --- Small helpers ------------------------------------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

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

function shade(hex, amount) {
  const f = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = hexRgb(hex);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// --- Public -------------------------------------------------------------
export function initDrawing(config, { onDone, onClose }) {
  C = config.drawing;
  T = config.timer;
  S = C.size;
  handlers = { onDone, onClose };
  drawCanvas.width = eyeCanvas.width = S;
  drawCanvas.height = eyeCanvas.height = S;
  $("hintCircle").setAttribute("r", String(C.hintRadius * 100));
  pad.color = C.colors[C.startColor];
  pad.brush = C.startBrush;
  buildToolbar();
  closeDrawing();
}

export function openDrawing({ player = 1, players = 1 } = {}) {
  newDrawing();
  playerBadge.hidden = players < 2;
  playerBadge.querySelectorAll(".figure").forEach((el, i) => {
    el.hidden = i >= players;
    el.classList.toggle("current", i === player - 1);
  });
  drawScreen.classList.remove("hidden");
  isOpen = true;
  idle = 0;
  if (T.enabled && !T.startOnFirstStroke) startTimer();
}

export function closeDrawing() {
  drawScreen.classList.add("hidden");
  isOpen = false;
  pad.stroke = null;
  pad.pointerId = null;
  pad.drag = null;
  stopTimer();
}

export function updateDrawing(dt) {
  if (!isOpen) return;
  idle += dt;
  if (!timer.running) return;
  timer.left -= dt;
  const u = clamp(timer.left / T.seconds, 0, 1);
  timerFill.setAttribute("r", (18 * u).toFixed(2));
  timerEl.classList.toggle("hurry", timer.left < 10);
  if (timer.left <= 0) {
    stopTimer();
    submit(); // an empty sheet just shakes; the timer waits for the next stroke
  }
}

export function drawingIdleTime() {
  return isOpen ? idle : 0;
}

// --- The sheet ----------------------------------------------------------
function newDrawing() {
  pad.history = [];
  pad.stroke = null;
  pad.pointerId = null;
  pad.drag = null;
  pad.tool = "crayon";
  pad.eyes = [];
  dctx.clearRect(0, 0, S, S);
  renderEyes();
  hintEl.classList.remove("faded");
  stopTimer();
  refreshToolbar();
}

// The green check: crop and hand over. An empty sheet gives a gentle shake instead.
function submit() {
  if (!isOpen) return;
  if (pad.stroke) finishStroke();
  const crop = cropDrawing(drawCanvas, { padding: C.cropPadding, minPixels: C.minInkPixels });
  if (!crop) {
    shake(doneBtn);
    return;
  }
  crop.eyes = pad.eyes.map((e) => ({ x: e.x - crop.box.x, y: e.y - crop.box.y, r: e.r }));
  const rect = drawCanvas.getBoundingClientRect();
  closeDrawing();
  handlers.onDone(crop, rect);
}

function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth; // restart the animation
  el.classList.add("shake");
}

// --- Crayon brush: grainy, rough-edged stamps + a few waxy streaks -------
const stampCache = new Map();

function getStamp(color, R, variant) {
  const key = `${color}|${R}|${variant}`;
  let c = stampCache.get(key);
  if (c) return c;
  const size = R * 2 + 4;
  c = document.createElement("canvas");
  c.width = c.height = size;
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
  if (st.pen && C.pencilPressure) r *= 0.55 + 0.9 * clamp(p.p, 0, 1);
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
    pad.eyes = [];
    return;
  }
  if (entry.type === "eyes") {
    pad.eyes = entry.eyes.map((e) => ({ ...e }));
    return;
  }
  beginStroke(entry);
  strokeDot(dctx, entry, entry.points[0]);
  for (let i = 1; i < entry.points.length; i++) strokeSegment(dctx, entry, entry.points[i - 1], entry.points[i]);
}

function undo() {
  if (pad.stroke || pad.drag || !pad.history.length) return;
  pad.history.pop();
  dctx.clearRect(0, 0, S, S);
  pad.eyes = [];
  for (const entry of pad.history) replay(entry);
  renderEyes();
}

function clearDrawing() {
  if (pad.stroke || pad.drag) return;
  if (pad.history.length && pad.history[pad.history.length - 1].type !== "clear") pad.history.push({ type: "clear" }); // undo brings it back
  dctx.clearRect(0, 0, S, S);
  pad.eyes = [];
  renderEyes();
}

// --- Googly eyes: tap to stick one on, drag to move it, tap it again to take it off ---
function renderEyes() {
  ectx.clearRect(0, 0, S, S);
  for (const e of pad.eyes) {
    ectx.fillStyle = "#ffffff";
    ectx.strokeStyle = "#1f2340";
    ectx.lineWidth = Math.max(2, e.r * 0.13);
    ectx.beginPath();
    ectx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ectx.fill();
    ectx.stroke();
    ectx.fillStyle = "#111111";
    ectx.beginPath();
    ectx.arc(e.x, e.y + e.r * 0.2, e.r * 0.5, 0, Math.PI * 2);
    ectx.fill();
    ectx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ectx.beginPath();
    ectx.arc(e.x - e.r * 0.17, e.y + e.r * 0.03, e.r * 0.14, 0, Math.PI * 2);
    ectx.fill();
  }
}

function saveEyes() {
  pad.history.push({ type: "eyes", eyes: pad.eyes.map((e) => ({ ...e })) });
}

function eyeDown(p) {
  const hit = [...pad.eyes].reverse().find((e) => Math.hypot(e.x - p.x, e.y - p.y) <= e.r * 1.15);
  const eye = hit || { x: p.x, y: p.y, r: C.eyeSizes[pad.brush === 0 ? 0 : 1] };
  if (!hit) pad.eyes.push(eye);
  pad.drag = { eye, isNew: !hit, start: p, dx: eye.x - p.x, dy: eye.y - p.y, moved: false };
  renderEyes();
}

function eyeMove(p) {
  const d = pad.drag;
  if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 10) d.moved = true;
  d.eye.x = clamp(p.x + d.dx, 0, S);
  d.eye.y = clamp(p.y + d.dy, 0, S);
  renderEyes();
}

function eyeUp() {
  const d = pad.drag;
  pad.drag = null;
  if (!d.isNew && !d.moved) pad.eyes = pad.eyes.filter((e) => e !== d.eye); // tapped again: take it off
  saveEyes();
  renderEyes();
}

// --- Pointer input (mouse, touch, Apple Pencil) --------------------------
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
  const k = 1 - C.smoothing;
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
  if (!isOpen || pad.pointerId !== null) return; // one finger at a time
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.pointerType === "touch" && performance.now() - pad.penAt < 2500) return; // palm while using the Pencil
  if (e.pointerType === "pen") pad.penAt = performance.now();
  e.preventDefault();
  drawCanvas.setPointerCapture?.(e.pointerId);
  idle = 0;
  pad.pointerId = e.pointerId;
  pad.rect = drawCanvas.getBoundingClientRect();
  const p = canvasPoint(e);
  if (pad.tool === "eyes") return eyeDown(p);
  const eraser = pad.tool === "eraser";
  const base = C.brushSizes[pad.brush];
  const st = {
    type: "stroke",
    color: pad.color,
    radius: eraser ? base * C.eraserScale : base,
    eraser,
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
    if (T.enabled && T.startOnFirstStroke) startTimer();
  }
});

drawCanvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pad.pointerId) return;
  if (pad.drag) return eyeMove(canvasPoint(e));
  if (!pad.stroke) return;
  e.preventDefault();
  idle = 0;
  if (e.pointerType === "pen") pad.penAt = performance.now();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of events.length ? events : [e]) addPoint(canvasPoint(ev));
});

for (const type of ["pointerup", "pointercancel"]) {
  drawCanvas.addEventListener(type, (e) => {
    if (e.pointerId !== pad.pointerId) return;
    if (pad.drag) {
      eyeUp();
      pad.pointerId = null;
    } else {
      finishStroke(e);
    }
  });
}

// iPad Safari: no page scrolling, rubber-banding or pinch zoom.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());

// --- Toolbar --------------------------------------------------------------
function buildToolbar() {
  const colorsEl = $("colors");
  C.colors.forEach((color, i) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.setProperty("--c", color);
    b.setAttribute("aria-label", `Colour ${i + 1}`);
    b.innerHTML = "<span></span>";
    b.addEventListener("click", () => {
      pad.color = color;
      pad.tool = "crayon";
      refreshToolbar();
    });
    colorsEl.appendChild(b);
  });

  const sizesEl = $("sizes");
  const sizes = C.brushSizes;
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
    pad.tool = pad.tool === "eraser" ? "crayon" : "eraser";
    refreshToolbar();
  });
  eyeBtn.addEventListener("click", () => {
    pad.tool = pad.tool === "eyes" ? "crayon" : "eyes";
    refreshToolbar();
  });
  eyeBtn.hidden = !C.eyeTool;
  $("undoBtn").addEventListener("click", undo);
  $("clearBtn").addEventListener("click", clearDrawing);
  doneBtn.addEventListener("click", submit);
  doneBtn.addEventListener("animationend", () => doneBtn.classList.remove("shake"));
  $("closeBtn").addEventListener("click", () => handlers.onClose());
  toolbar.addEventListener("pointerdown", () => (idle = 0));
  timerEl.hidden = !T.enabled;
}

function refreshToolbar() {
  toolbar.style.setProperty("--current", pad.color);
  document.querySelectorAll(".swatch").forEach((b, i) => {
    b.classList.toggle("selected", pad.tool === "crayon" && C.colors[i] === pad.color);
  });
  document.querySelectorAll(".size").forEach((b, i) => b.classList.toggle("selected", i === pad.brush));
  eraserBtn.classList.toggle("selected", pad.tool === "eraser");
  eyeBtn.classList.toggle("selected", pad.tool === "eyes");
  toolbar.classList.toggle("eye-mode", pad.tool === "eyes");
  drawCanvas.style.cursor = pad.tool === "eyes" ? "pointer" : "crosshair";
}

// --- Timer: a yellow circle that shrinks ----------------------------------
function startTimer() {
  if (timer.running) return;
  timer.running = true;
  timer.left = T.seconds;
}

function stopTimer() {
  timer.running = false;
  timer.left = T ? T.seconds : 0;
  timerFill.setAttribute("r", "18");
  timerEl.classList.remove("hurry");
}
