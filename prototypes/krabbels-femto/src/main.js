// =====================================================================
// Krabbels - COMPARISON Femto vs webcam (MediaPipe)
//
// A little doodle character walks over blocks. At every gap it waits.
// The player stands in front of the camera and holds the arms sideways: the arms
// become a bridge over the gap. Hold it -> a plank appears -> the character walks on.
//
// Keys: T test · U results · X clear results · W switch source · SPACE bridge (manual)
//       F full screen · R restart
// =====================================================================

import { cam, startCamera, SOURCE_NAME, OTHER_SOURCE } from './camera.js';
import { drawPreview } from './cameraView.js';
import { startTest, updateTest, toggleResults, clearResults } from './metrics.js';

const GAME = {
  groundY: 0.79,        // top of the blocks, fraction of the screen height
  holdS: 1.2,           // how long the bridge must be held
  walkSpeed: 0.22,      // screen widths per second
  gapMin: 0.11, gapMax: 0.14,       // gap width, in screen widths
  blockMin: 0.22, blockMax: 0.36,   // block width, in screen widths
  gapOnScreen: 0.45,    // where the current gap sits on screen (0 = left, 1 = right)
  metresToScreen: 0.42, // 1 metre of body = this many screen widths (arm ~0.6 m -> ~0.25)
  bridgeSlack: 0.012,   // wrists may stop this far short of the gap edge
};

const COLORS = {
  bg: '#faf8f3', block: '#e6e3dc', ink: '#222', player: '#9db0e3',
  bridge: '#35c759', plank: '#d9b77a', bar: '#3b7be8',
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

let W = 0, H = 0, U = 0;  // screen size in CSS px, U = size unit (keeps proportions on odd screens)
let world;

// --------------------------------------------------------------------------------------------
// World
function newWorld() {
  const blocks = [{ x0: -2, x1: 0.42 }];
  const w = { blocks, planks: new Set(), gap: 0, hold: 0, camX: 0, char: null };
  ensureBlocks(w, 4);
  w.char = { x: gapOf(w, 0).x0 - 0.03, state: 'wait', target: 0, step: 0 };
  w.camX = targetCam(w);
  return w;
}

function ensureBlocks(w, ahead) {
  while (w.blocks.length < w.gap + ahead + 2) {
    const last = w.blocks[w.blocks.length - 1];
    const x0 = last.x1 + rand(GAME.gapMin, GAME.gapMax);
    w.blocks.push({ x0, x1: x0 + rand(GAME.blockMin, GAME.blockMax) });
  }
}

const gapOf = (w, i) => ({ x0: w.blocks[i].x1, x1: w.blocks[i + 1].x0 });
const targetCam = (w) => {
  const g = gapOf(w, w.gap);
  return (g.x0 + g.x1) / 2 - GAME.gapOnScreen;
};
const rand = (a, b) => a + Math.random() * (b - a);
const toScreen = (x) => (x - world.camX) * W;

function placePlank() {
  if (world.char.state !== 'wait') return;
  world.planks.add(world.gap);
  world.hold = 0;
  world.gap++;
  ensureBlocks(world, 4);
  world.char.state = 'walk';
  world.char.target = gapOf(world, world.gap).x0 - 0.03;
}

// --------------------------------------------------------------------------------------------
// Update
function update(dt) {
  const w = world, c = w.char;
  const groundY = GAME.groundY * H;

  if (c.state === 'walk') {
    c.x += GAME.walkSpeed * dt;
    c.step += dt * 9;
    if (c.x >= c.target) {
      c.x = c.target;
      c.state = 'wait';
    }
  }
  w.camX += (targetCam(w) - w.camX) * (1 - Math.exp(-dt * 3));

  // Does any player span the current gap with a bridge pose?
  const g = gapOf(w, w.gap);
  const gx0 = toScreen(g.x0), gx1 = toScreen(g.x1);
  let spanning = false;
  for (const p of cam.players) {
    const f = figure(p, groundY);
    p._figure = f;
    const lo = Math.min(f.wl[0], f.wr[0]), hi = Math.max(f.wl[0], f.wr[0]);
    p._spans = p.bridge && lo <= gx0 + GAME.bridgeSlack * W && hi >= gx1 - GAME.bridgeSlack * W;
    spanning ||= p._spans;
  }
  if (c.state === 'wait' && spanning) {
    w.hold += dt / GAME.holdS;
    if (w.hold >= 1) placePlank();
  } else {
    w.hold = Math.max(0, w.hold - dt * 2);
  }
}

// Player skeleton (metres, relative to the neck) -> screen. The shoulders sit on the block tops,
// so stretched arms lie exactly on the "road" and can bridge the gap.
function figure(p, groundY) {
  const S = GAME.metresToScreen * U;
  const ax = p.u * W;
  const pt = (n) => (p.joints[n] ? [ax + p.joints[n][0] * S, groundY + p.joints[n][1] * S] : null);
  return { pt, S, wl: pt('wrist_left'), wr: pt('wrist_right') };
}

// --------------------------------------------------------------------------------------------
// Draw
function draw(t) {
  const groundY = GAME.groundY * H;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // blocks
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = COLORS.ink;
  for (const b of world.blocks) {
    const x0 = toScreen(b.x0), x1 = toScreen(b.x1);
    if (x1 < -10 || x0 > W + 10) continue;
    ctx.fillStyle = COLORS.block;
    ctx.fillRect(x0, groundY, x1 - x0, H - groundY + 5);
    sketchLine(x0, groundY, x1, groundY, b.x0);
    sketchLine(x0, groundY, x0, H + 5, b.x0 + 1);
    sketchLine(x1, groundY, x1, H + 5, b.x1);
  }
  // planks
  for (const i of world.planks) {
    const g = gapOf(world, i);
    const x0 = toScreen(g.x0) - 0.008 * W, x1 = toScreen(g.x1) + 0.008 * W;
    ctx.fillStyle = COLORS.plank;
    ctx.fillRect(x0, groundY - 7, x1 - x0, 9);
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, groundY - 7, x1 - x0, 9);
  }

  // prompt + hold bar above the current gap
  if (world.char.state === 'wait') {
    const g = gapOf(world, world.gap);
    const cx = (toScreen(g.x0) + toScreen(g.x1)) / 2;
    const fs = Math.round(0.022 * U);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(world.hold > 0 ? 'Houd vast!' : 'Armen opzij!', cx, groundY - 0.29 * H);
    const bw = 0.11 * U, bh = Math.max(12, 0.014 * U), by = groundY - 0.29 * H + fs * 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - bw / 2, by, bw, bh);
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(cx - bw / 2, by, bw * Math.min(1, world.hold), bh);
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - bw / 2, by, bw, bh);
  }

  // players (behind the character, like in a shadow play)
  for (const p of cam.players) drawPlayer(p);

  drawCharacter(toScreen(world.char.x), groundY, world.char, t);
}

function drawPlayer(p) {
  const f = p._figure;
  if (!f) return;
  const { pt, S } = f;
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = Math.max(3, 0.006 * U);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = (names) => {
    const pts = names.map(pt).filter(Boolean);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  path(['wrist_left', 'elbow_left', 'shoulder_left', 'neck', 'shoulder_right', 'elbow_right', 'wrist_right']);
  path(['neck', 'pelvis']);
  path(['ankle_left', 'knee_left', 'hip_left', 'pelvis', 'hip_right', 'knee_right', 'ankle_right']);
  const head = pt('head') || pt('nose');
  if (head) {
    ctx.beginPath();
    ctx.arc(head[0], head[1], 0.1 * S, 0, Math.PI * 2);
    ctx.stroke();
  }
  // bridge line between the wrists
  if (p.bridge) {
    ctx.strokeStyle = COLORS.bridge;
    ctx.lineWidth = Math.max(5, 0.008 * U);
    ctx.beginPath();
    ctx.moveTo(f.wl[0], f.wl[1]);
    ctx.lineTo(f.wr[0], f.wr[1]);
    ctx.stroke();
    ctx.fillStyle = COLORS.player;
    for (const q of [f.wl, f.wr]) {
      ctx.beginPath();
      ctx.arc(q[0], q[1], 0.008 * U, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCharacter(x, groundY, c, t) {
  const r = 0.028 * U, leg = 0.016 * U;
  const bob = c.state === 'walk' ? Math.abs(Math.sin(c.step)) * 0.004 * U : 0;
  const cy = groundY - leg - r - bob;
  const swing = c.state === 'walk' ? Math.sin(c.step) * 0.006 * U : 0;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.25, cy + r * 0.9);
  ctx.lineTo(x - r * 0.25 + swing, groundY);
  ctx.moveTo(x + r * 0.25, cy + r * 0.9);
  ctx.lineTo(x + r * 0.25 - swing, groundY);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // eyes, looking ahead (blink now and then)
  const blink = (t / 1000) % 4 < 0.12;
  for (const ex of [0.05, 0.55]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + ex * r, cy - 0.02 * r, 0.27 * r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    if (blink) ctx.fillRect(x + ex * r - 0.25 * r, cy - 0.04 * r, 0.5 * r, 0.06 * r);
    else ctx.arc(x + ex * r + 0.08 * r, cy, 0.17 * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// slightly wobbly line, the same every frame (seeded by the block position)
function sketchLine(x0, y0, x1, y1, seed) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 60));
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const j = i === n ? 0 : Math.sin(seed * 97 + i * 12.9898) * 1.2;
    ctx.lineTo(x0 + (x1 - x0) * k + (y1 !== y0 ? j : 0), y0 + (y1 - y0) * k + (y1 === y0 ? j : 0));
  }
  ctx.stroke();
}

// --------------------------------------------------------------------------------------------
// HUD: source · status · per player: arm angle + confidence (screen-left / screen-right)
function updateHud() {
  let txt = `${SOURCE_NAME} · ${cam.statusText}`;
  if (cam.connected) {
    if (!cam.players.length) txt += ' · niemand in beeld';
    cam.players.forEach((p, i) => {
      const a = (arm) => `${Math.round(arm.angle)}° ${Math.round(arm.conf * 100)}%`;
      txt += ` · speler ${i + 1}: ${a(p.screenLeft)} / ${a(p.screenRight)}${p.bridge ? ' ✓' : ''}`;
    });
  }
  if (hud.textContent !== txt) hud.textContent = txt;
}

// --------------------------------------------------------------------------------------------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  U = Math.min(W, H * 1.7);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function onKey(e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); placePlank(); }
  else if (k === 't') startTest();
  else if (k === 'u') toggleResults();
  else if (k === 'x') clearResults();
  else if (k === 'r') world = newWorld();
  else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } else if (k === 'w') {
    const q = new URLSearchParams(location.search);
    q.set('bron', OTHER_SOURCE);
    location.search = q.toString();
  }
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  update(dt);
  draw(t);
  updateHud();
  drawPreview();
  updateTest(t);
  requestAnimationFrame(frame);
}

resize();
world = newWorld();
window.addEventListener('resize', resize);
window.addEventListener('keydown', onKey);
document.title = `Krabbels vergelijking · ${SOURCE_NAME}`;
startCamera();
requestAnimationFrame(frame);
