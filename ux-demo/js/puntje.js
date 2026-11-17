// =====================================================================
// Puntje als rig (wireframe, zonder stijl): lijf, gezicht, armen en beentjes
// bewegen apart. Elke animatie is een functie van de tijd die een pose geeft.
//
// Eenheden: 1 = 1 px bij schaal 1. Oorsprong = op de grond, tussen de voeten.
// Hoeken in graden. Armen: 0 = recht opzij (naar buiten), + = omhoog.
// =====================================================================

const INK = "#4a4a4f", PAPER = "#ffffff", SOFT = "#b5b5b5";
const R = {
  hip: 12, // hips: half the distance between the legs
  thigh: 22, shin: 22,
  coneH: 30, bodyW: 40, bodyH: 78, capH: 11,
  shoulderY: 22, // from the top of the body
  upper: 24, lower: 22,
  lw: 3.5,
};
export const PUNTJE_H = 22 + 22 + 78 + 11; // standing height (approx.)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const D = Math.PI / 180;

// --- the neutral pose -------------------------------------------------------------
export const BASE = {
  x: 0, // sideways shift
  air: 0, // height above the ground
  hipH: 40, // height of the hips (lower = knees bent)
  spread: 4, // extra distance between the feet
  footL: 0, footR: 0, // lift of each foot
  lean: 0, // body rotation (degrees, + = to the right)
  sy: 1, // squash & stretch (sy < 1 = squashed)
  aL: -70, eL: -10, aR: -70, eR: -10, // arms: shoulder + elbow
  handL: 0, handR: 0, // hand: 0 = dot, 1 = open (spread fingers)
  lookX: 0, lookY: 0, blink: 0, eyes: 1, // eyes: look (-1..1), blink 0..1, size
  happy: 0, // ^ ^ eyes
  brow: 0, browTilt: 0, // brows: raise (-1..1), tilt (+ = worried, - = angry)
  smile: 0.5, mouth: 0, // mouth: smile (-1..1), open (0..1)
  draw: 0, // length of the line Puntje draws (tekenen)
  prop: null, // { kind: "potlood", x, y, rot } in local coords
};

// Interpolate key poses: keys = [[time (0..1), {fields}], ...]. Missing fields keep their previous value.
export function keys(list, u) {
  u = ((u % 1) + 1) % 1;
  const full = [];
  let acc = { ...BASE };
  for (const [at, f] of list) { acc = { ...acc, ...f }; full.push([at, acc]); }
  let i = full.length - 1;
  for (let k = 0; k < full.length; k++) if (full[k][0] > u) { i = k - 1; break; }
  if (i < 0) return { ...full[0][1] };
  const [t0, a] = full[i], [t1, b] = full[(i + 1) % full.length];
  const span = (i + 1 < full.length ? t1 : t1 + 1) - t0;
  const f = smooth(clamp((u - t0) / (span || 1), 0, 1));
  const out = {};
  for (const k in a) out[k] = typeof a[k] === "number" && typeof b[k] === "number" ? lerp(a[k], b[k], f) : f < 0.5 ? a[k] : b[k];
  return out;
}

// Blink now and then (on top of any animation)
export function blinkAt(t, every = 3.1, off = 0) {
  const p = (t + off) % every;
  return p < 0.13 ? Math.sin((p / 0.13) * Math.PI) : 0;
}

// --- draw -------------------------------------------------------------------------
function leg(g, hx, hy, fx, fy, out) {
  // 2-bone IK, knee bends outward (front view, like the children's rig)
  const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), R.thigh + R.shin - 0.01);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((R.thigh * R.thigh + d * d - R.shin * R.shin) / (2 * R.thigh * d), -1, 1));
  const ka = a + b * out;
  const kx = hx + Math.cos(ka) * R.thigh, ky = hy + Math.sin(ka) * R.thigh;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
  g.beginPath(); g.moveTo(fx - 5 * -out, fy); g.lineTo(fx + 4 * -out, fy); g.stroke(); // little foot
}
function arm(g, sx, sy, side, a, e, open) {
  // side: -1 left, +1 right. 0° = horizontal outward, + = up
  const r1 = (-a) * D, r2 = (-(a + e)) * D;
  const ex = sx + side * Math.cos(r1) * R.upper, ey = sy + Math.sin(r1) * R.upper;
  const hx = ex + side * Math.cos(r2) * R.lower, hy = ey + Math.sin(r2) * R.lower;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  if (open > 0.5) {
    for (const s of [-0.6, 0, 0.6]) { const r = r2 + s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + side * Math.cos(r) * 7, hy + Math.sin(r) * 7); g.stroke(); }
  } else { g.beginPath(); g.arc(hx, hy, 4.2, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
  return [hx, hy];
}

// Draw Puntje with pose p, feet on (x, y), scale s.
export function drawPuntje(g, p, x, y, s = 1, { flip = false, ground = true } = {}) {
  g.save();
  g.translate(x + p.x * s, y);
  g.scale(flip ? -s : s, s);
  g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = R.lw; g.strokeStyle = INK;

  // shadow on the ground (stays on the ground)
  if (ground) {
    const k = clamp(1 - p.air / 120, 0.35, 1);
    g.save(); g.globalAlpha = 0.12 * k; g.fillStyle = INK;
    g.beginPath(); g.ellipse(0, 1, 26 * k, 4 * k, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // the line Puntje draws
  if (p.draw > 0) { g.save(); g.lineWidth = 4; g.beginPath(); g.moveTo(-10, 0); g.lineTo(-10 + p.draw, 0); g.stroke(); g.restore(); }

  const hipY = -p.air - p.hipH;
  // legs
  const fL = [-R.hip - p.spread, -p.air - p.footL], fR = [R.hip + p.spread, -p.air - p.footR];
  const lean = p.lean * D;
  const hipL = [-R.hip * Math.cos(lean), hipY - R.hip * Math.sin(lean) * -1 * 0], hipR = [R.hip * Math.cos(lean), hipY];
  leg(g, hipL[0], hipY, fL[0], fL[1], -1);
  leg(g, hipR[0], hipY, fR[0], fR[1], 1);

  // body (rotates and squashes around the hips)
  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  const sy = p.sy, sx = 1 / Math.sqrt(sy);
  g.scale(sx, sy);
  const W = R.bodyW, top = -R.bodyH - R.capH;
  // cone (the point) hangs below the hips
  g.beginPath(); g.moveTo(-W / 2, 0); g.lineTo(0, R.coneH); g.lineTo(W / 2, 0); g.closePath();
  g.fillStyle = PAPER; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-5, R.coneH - 8); g.lineTo(0, R.coneH); g.lineTo(5, R.coneH - 8); g.closePath(); g.fillStyle = INK; g.fill(); g.stroke();
  // body + cap
  g.beginPath(); g.rect(-W / 2, -R.bodyH, W, R.bodyH); g.fillStyle = PAPER; g.fill(); g.stroke();
  g.beginPath(); g.rect(-W / 2, top, W, R.capH); g.fill(); g.stroke();
  g.restore();

  // shoulders (in body space → world)
  const shY = -R.bodyH + R.shoulderY;
  const toWorld = (bx, by) => { const X = bx * sx, Y = by * sy; return [Math.cos(lean) * X - Math.sin(lean) * Y, hipY + Math.sin(lean) * X + Math.cos(lean) * Y]; };
  const sL = toWorld(-W / 2, shY), sR = toWorld(W / 2, shY);
  const handL = arm(g, sL[0], sL[1], -1, p.aL - p.lean, p.eL, p.handL);
  const handR = arm(g, sR[0], sR[1], 1, p.aR + p.lean, p.eR, p.handR);

  // face (on the body)
  g.save();
  g.translate(0, hipY); g.rotate(lean); g.scale(sx, sy);
  const fy = -R.bodyH + 34;
  const er = 6 * p.eyes;
  for (const side of [-1, 1]) {
    const ex = side * 9;
    if (p.happy > 0.5) { // ^ ^
      g.beginPath(); g.moveTo(ex - 5, fy + 2); g.lineTo(ex, fy - 3); g.lineTo(ex + 5, fy + 2); g.stroke();
    } else {
      const open = 1 - clamp(p.blink, 0, 1);
      g.save(); g.translate(ex, fy); g.scale(1, Math.max(0.08, open));
      g.beginPath(); g.arc(0, 0, er, 0, Math.PI * 2); g.fillStyle = PAPER; g.fill(); g.lineWidth = 2.6; g.stroke();
      g.beginPath(); g.arc(p.lookX * er * 0.45, p.lookY * er * 0.45, er * 0.5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      g.restore();
    }
    // brow
    const by = fy - er - 5 - p.brow * 4, tilt = p.browTilt * 4 * side;
    g.beginPath(); g.moveTo(ex - 5, by + tilt); g.lineTo(ex + 5, by - tilt); g.stroke();
  }
  // mouth
  const my = fy + 16;
  if (p.mouth > 0.15) {
    g.beginPath(); g.ellipse(0, my + 2, 5 + 2 * p.mouth, 3 + 5 * p.mouth, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
  } else {
    g.beginPath(); g.moveTo(-7, my); g.quadraticCurveTo(0, my + p.smile * 9, 7, my); g.stroke();
  }
  g.restore();

  // prop in a hand
  if (p.prop) potlood(g, p.prop === "hand" ? handR[0] : p.prop.x, p.prop === "hand" ? handR[1] : p.prop.y, p.prop.rot || 0);
  g.restore();
}

function potlood(g, x, y, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.lineWidth = 2.5; g.strokeStyle = INK; g.fillStyle = PAPER;
  g.beginPath(); g.rect(-4, -22, 8, 30); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-4, 8); g.lineTo(0, 16); g.lineTo(4, 8); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// little extras drawn in world space around Puntje (motion lines, dust, stars)
export function streepjes(g, x, y, s, kind, t) {
  g.save(); g.strokeStyle = SOFT; g.lineWidth = 3; g.lineCap = "round";
  if (kind === "stof") { // dust when landing, t 0..1
    const a = 1 - t; g.globalAlpha = a;
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(x + side * (24 + 18 * t) * s, y - 4 * s); g.lineTo(x + side * (34 + 26 * t) * s, y - (10 + 8 * t) * s); g.stroke(); }
  }
  if (kind === "zwaai") { // arcs next to a waving hand
    for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(x, y, (14 + i * 9) * s, -1.2, -0.2); g.stroke(); }
  }
  if (kind === "klop") { // knock waves
    const a = 1 - t; g.globalAlpha = a;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(x, y, (8 + i * 10 + 14 * t) * s, -0.9, 0.9); g.stroke(); }
  }
  g.restore();
}

// --- the animations ------------------------------------------------------------------
// f(t) → { pose, fx: [extras] }. dur = length of one loop in seconds. use = where in the flow.
const A = {};

A.rust = { dur: 4, use: "Altijd als hij niets anders doet", f: (t) => {
  const u = t / 4, br = Math.sin(t * 2.2);
  const p = keys([[0, { lookX: 0 }], [0.3, { lookX: 0 }], [0.38, { lookX: -0.9, lookY: -0.2 }], [0.55, { lookX: -0.9 }], [0.62, { lookX: 0.9, lookY: 0.1 }], [0.8, { lookX: 0.9 }], [0.88, { lookX: 0, lookY: 0 }]], u);
  return { ...p, sy: 1 + br * 0.015, aL: -72 + br * 2, aR: -72 - br * 2, blink: blinkAt(t, 3.3) };
} };

A.huppelen = { dur: 0.9, use: "1a, 1b: muur en iPad in rust", f: (t) => {
  const u = (t / 0.9) % 1;
  const p = keys([
    [0.0, { hipH: 30, sy: 0.82, air: 0, aL: -40, aR: -40, eL: -30, eR: -30, footL: 0, footR: 0, smile: 0.6 }], // squash (landed)
    [0.16, { hipH: 44, sy: 1.12, air: 6, aL: 30, aR: 30, eL: 10, eR: 10 }], // push off, stretched
    [0.45, { hipH: 38, sy: 1.0, air: 46, footL: 10, footR: 10, aL: 50, aR: 50, eL: -20, eR: -20, mouth: 0.3 }], // top
    [0.74, { hipH: 42, sy: 1.08, air: 8, footL: 0, footR: 0, aL: 10, aR: 10, mouth: 0 }], // coming down
    [0.86, { hipH: 30, sy: 0.82, air: 0, aL: -40, aR: -40, eL: -30, eR: -30 }], // land
  ], u);
  return { ...p, blink: blinkAt(t, 2.7), fx: u > 0.86 || u < 0.1 ? [["stof", ((u + 0.14) % 1) / 0.24]] : [] };
} };

A.wenken = { dur: 1.6, use: "1a, 1b, 3b, 6f: kom hier", f: (t) => {
  const u = (t / 0.8) % 1; // the hand curls twice per loop
  const curl = Math.sin(u * Math.PI * 2);
  return { ...BASE, lean: -6, aR: 35, eR: 60 + curl * 55, aL: -75, lookX: 0.4, brow: 0.6, smile: 0.7, sy: 1 + curl * 0.01, blink: blinkAt(t, 2.9) };
} };

A.zwaaien = { dur: 1.2, use: "Hallo / tot ziens (8a, 9a)", f: (t) => {
  const w = Math.sin((t / 1.2) * Math.PI * 4);
  return { ...BASE, aR: 60, eR: 25 + w * 35, handR: 1, aL: -75, lean: -4 + w * 2, smile: 0.9, mouth: 0.3, brow: 0.5, blink: blinkAt(t, 2.5), fx: [["zwaai-hand", w]] };
} };

A.wijzen = { dur: 2.2, use: "2c, 3b: kijk daar / naar de oogjes", f: (t) => {
  const p = keys([[0, { aR: -70 }], [0.12, { aR: 10, eR: 0, lean: 8, lookX: 1, aL: -40, eL: -100, brow: 0.5 }], [0.7, {}], [0.85, { aR: -70, eR: -10, lean: 0, lookX: 0, aL: -70, eL: -10, brow: 0 }]], t / 2.2);
  const tap = Math.max(0, Math.sin(t * 9)) * (t / 2.2 > 0.15 && t / 2.2 < 0.7 ? 4 : 0);
  return { ...p, aR: p.aR + tap, blink: blinkAt(t, 3) };
} };

A.knikken = { dur: 1.6, use: "2b: kijkt mee terwijl je tekent", f: (t) => {
  const n = Math.max(0, Math.sin((t / 1.6) * Math.PI * 4));
  return { ...BASE, lean: n * 4, sy: 1 - n * 0.05, lookY: 0.6, lookX: Math.sin(t * 2) * 0.6, brow: 0.3, smile: 0.6, aL: -60, aR: -60, blink: blinkAt(t, 2.6) };
} };

A.tekenen = { dur: 2.4, use: "2a, 5b, 6c: Puntje tekent een lijn", f: (t) => {
  const u = t / 2.4;
  const p = keys([[0, { lean: 0, draw: 0 }], [0.12, { lean: -32, hipH: 34, aL: 20, aR: -10, eL: -20, lookY: 0.9, lookX: -0.5, brow: -0.3, smile: 0, mouth: 0.2 }], [0.85, { lean: -32, x: 90 }], [1, { lean: 0, x: 0, hipH: 40, aL: -70, aR: -70, smile: 0.5, mouth: 0 }]], u);
  const draw = clamp((u - 0.12) / 0.73, 0, 1) * 100;
  const wobble = Math.sin(t * 18) * 2;
  return { ...p, draw: u < 0.98 ? draw : 0, x: (p.x || 0), aL: p.aL + wobble, blink: 0 };
} };

A.gooien = { dur: 2, use: "2a: geeft zijn potlood door", f: (t) => {
  const u = t / 2;
  const p = keys([[0, { aR: -60, eR: -20 }], [0.25, { aR: 120, eR: 40, lean: 10, sy: 1.05, lookX: 0.6, brow: 0.4 }], [0.42, { aR: 20, eR: 0, lean: -12, sy: 0.95, lookX: -0.4, mouth: 0.4 }], [0.6, { aR: -20, eR: -10, lean: -4, mouth: 0 }], [1, { aR: -70, eR: -10, lean: 0, lookX: 0, smile: 0.8 }]], u);
  const held = u < 0.42;
  let prop = held ? "hand" : null;
  if (!held && u < 0.95) { const k = (u - 0.42) / 0.53; prop = { x: lerp(-40, -240, k), y: lerp(-110, 10, k) - Math.sin(k * Math.PI) * 120, rot: -k * 9 }; }
  return { ...p, prop, blink: blinkAt(t, 3) };
} };

A["armen wijd"] = { dur: 2.4, use: "5b, 5c, 6b: doet voor (brug)", f: (t) => {
  const p = keys([[0, {}], [0.2, { aL: 0, aR: 0, eL: 0, eR: 0, spread: 8, handL: 1, handR: 1, brow: 0.4, smile: 0.7 }], [0.8, {}], [0.95, { aL: -70, aR: -70, eL: -10, eR: -10, spread: 4, handL: 0, handR: 0 }]], t / 2.4);
  const hold = t / 2.4 > 0.2 && t / 2.4 < 0.8 ? Math.sin(t * 6) * 1.5 : 0;
  return { ...p, aL: p.aL + hold, aR: p.aR + hold, blink: blinkAt(t, 3.4) };
} };

A["armen omhoog"] = { dur: 2.4, use: "5c, 6b: doet voor (ladder)", f: (t) => {
  const p = keys([[0, {}], [0.22, { aL: 82, aR: 82, eL: 0, eR: 0, sy: 1.1, hipH: 42, handL: 1, handR: 1, lookY: -0.8, brow: 0.7, mouth: 0.25 }], [0.8, {}], [0.95, { aL: -70, aR: -70, eL: -10, eR: -10, sy: 1, hipH: 40, handL: 0, handR: 0, lookY: 0, brow: 0, mouth: 0 }]], t / 2.4);
  return { ...p, blink: blinkAt(t, 3.2) };
} };

A.springen = { dur: 1.6, use: "5c, 6b: doet voor (springen)", f: (t) => {
  const u = t / 1.6;
  const p = keys([
    [0, {}],
    [0.18, { hipH: 24, sy: 0.8, aL: -30, aR: -30, eL: -40, eR: -40, brow: -0.2 }], // squat
    [0.3, { hipH: 44, sy: 1.15, air: 10, aL: 70, aR: 70, eL: 0, eR: 0, mouth: 0.4, brow: 0.6 }], // push
    [0.48, { air: 90, footL: 14, footR: 14, sy: 1.0, hipH: 36, aL: 80, aR: 80 }], // top
    [0.66, { air: 4, footL: 0, footR: 0, sy: 1.08, hipH: 42, aL: 30, aR: 30 }],
    [0.74, { air: 0, hipH: 26, sy: 0.82, aL: -20, aR: -20, eL: -30, eR: -30, mouth: 0 }], // land
    [0.9, { hipH: 40, sy: 1, aL: -70, aR: -70, eL: -10, eR: -10, brow: 0, smile: 0.8 }],
  ], u);
  return { ...p, blink: 0, fx: u > 0.74 && u < 0.95 ? [["stof", (u - 0.74) / 0.21]] : [] };
} };

A.bukken = { dur: 2.4, use: "5c, 6b: doet voor (bukken)", f: (t) => {
  const p = keys([[0, {}], [0.22, { hipH: 14, spread: 16, sy: 0.88, aL: -10, aR: -10, eL: -60, eR: -60, lookY: -0.7, brow: 0.6, mouth: 0.3 }], [0.75, {}], [0.95, { hipH: 40, spread: 4, sy: 1, aL: -70, aR: -70, eL: -10, eR: -10, lookY: 0, brow: 0, mouth: 0 }]], t / 2.4);
  return { ...p, blink: blinkAt(t, 3.1) };
} };

A.juichen = { dur: 1, use: "2d, 4a, 6d, 7b: gelukt!", f: (t) => {
  const u = (t / 1) % 1, b = Math.abs(Math.sin(u * Math.PI * 2));
  return { ...BASE, air: b * 22, sy: 1 + b * 0.06, aL: 70 + b * 15, aR: 70 + b * 15, eL: -10 + b * 20, eR: -10 + b * 20, handL: 1, handR: 1, happy: 1, smile: 1, mouth: 0.8, brow: 0.8, footL: b * 6, footR: b * 6 };
} };

A.dansje = { dur: 1.6, use: "6d: dansje als het lukt", f: (t) => {
  const s = Math.sin((t / 1.6) * Math.PI * 2), c = Math.sin((t / 1.6) * Math.PI * 4);
  return { ...BASE, lean: s * 12, x: s * 8, aL: 40 + c * 30, aR: 40 - c * 30, eL: 30, eR: 30, footL: Math.max(0, s) * 10, footR: Math.max(0, -s) * 10, happy: 1, smile: 1, mouth: 0.5, brow: 0.6, sy: 1 + Math.abs(c) * 0.03 };
} };

A.oei = { dur: 2.2, use: "6e: lukt niet meteen (nog eens!)", f: (t) => {
  const u = t / 2.2;
  const p = keys([[0, {}], [0.15, { aL: 20, aR: 20, eL: 70, eR: 70, handL: 1, handR: 1, sy: 0.94, hipH: 36, brow: 0.6, browTilt: 1, smile: -0.4, lookX: 0.5 }], [0.45, {}], [0.6, { aL: -60, aR: -60, eL: -10, eR: -10, handL: 0, handR: 0, sy: 1, hipH: 40, browTilt: 0.6, smile: -0.1, lookX: 0 }], [1, {}]], u);
  const tap = u > 0.6 ? Math.max(0, Math.sin(t * 14)) * 5 : 0; // impatient foot
  return { ...p, footR: tap, blink: blinkAt(t, 2.4) };
} };

A.tikken = { dur: 1.4, use: "2x: tikt tegen het glas (te lang niets)", f: (t) => {
  const u = (t / 0.7) % 1, k = Math.max(0, Math.sin(u * Math.PI * 2));
  return { ...BASE, lean: 6 - k * 4, aR: 10 + k * 12, eR: 40 - k * 40, aL: -70, eyes: 1.25, brow: 0.9, mouth: 0.35, lookX: 0.2, blink: 0, fx: k > 0.9 ? [["klop", (u % 0.5) * 2]] : [] };
} };

A.buigen = { dur: 3, use: "8c: eindscherm", f: (t) => {
  const p = keys([[0, {}], [0.25, { lean: 0, smile: 0.9 }], [0.45, { lean: 0, sy: 0.78, hipH: 30, spread: 8, aR: -120, eR: -60, aL: -30, eL: 30, happy: 1, brow: 0.3, lookY: 1 }], [0.75, {}], [0.9, { sy: 1, hipH: 40, spread: 4, aR: -70, eR: -10, aL: -70, eL: -10, happy: 0, lookY: 0 }]], t / 3);
  return { ...p, blink: blinkAt(t, 3.5) };
} };

A.binnenspringen = { dur: 2, use: "5b: springt erbij (komt van rechts)", f: (t) => {
  const u = t / 2;
  const k = clamp(u / 0.45, 0, 1);
  const p = keys([[0, { hipH: 38, sy: 1.05, aL: 60, aR: 60, mouth: 0.4, brow: 0.6, footL: 12, footR: 12, lookX: -0.8 }], [0.42, { footL: 0, footR: 0 }], [0.5, { hipH: 26, sy: 0.82, aL: -30, aR: -30, eL: -30, eR: -30 }], [0.65, { hipH: 40, sy: 1, aL: -70, aR: -70, eL: -10, eR: -10, mouth: 0, smile: 0.8, lookX: 0, brow: 0.3 }], [1, {}]], u);
  return { ...p, x: lerp(140, 0, smooth(k)), air: u < 0.45 ? Math.sin(k * Math.PI) * 90 : 0, blink: 0, fx: u > 0.45 && u < 0.7 ? [["stof", (u - 0.45) / 0.25]] : [] };
} };

export const ANIMS = A;
export const ORDER = ["rust", "huppelen", "wenken", "zwaaien", "wijzen", "knikken", "tekenen", "gooien", "armen wijd", "armen omhoog", "springen", "bukken", "juichen", "dansje", "oei", "tikken", "buigen", "binnenspringen"];

// Draw animation `name` at time t (seconds), feet on (x, y), scale s.
export function animate(g, name, t, x, y, s = 1, opts = {}) {
  const a = A[name] || A.rust;
  const r = a.f(t % a.dur);
  const p = { ...BASE, ...r };
  drawPuntje(g, p, x, y, s, opts);
  for (const [kind, v] of r.fx || []) {
    if (kind === "stof") streepjes(g, x, y, s, "stof", clamp(v, 0, 1));
    if (kind === "klop") streepjes(g, x + 70 * s, y - 120 * s, s, "klop", clamp(v, 0, 1));
  }
  return p;
}
