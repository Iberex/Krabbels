// =====================================================================
// Puntje als rig (wireframe, zonder stijl). Puntje heeft geen benen: hij ZWEEFT.
// Lijf, gezicht en armen bewegen apart. Elke animatie is een functie van de tijd
// die een pose geeft.
//
// Eenheden: 1 = 1 px bij schaal 1. Oorsprong = op de grond, onder zijn punt.
// Hoeken in graden. Armen: 0 = recht opzij (naar buiten), + = omhoog.
// =====================================================================

const INK = "#4a4a4f", PAPER = "#ffffff", SOFT = "#b5b5b5";
const R = {
  coneH: 30, bodyW: 40, bodyH: 78, capH: 11,
  shoulderY: 22, // from the top of the body
  upper: 24, lower: 22,
  lw: 3.5,
};
const CENTER = R.coneH + (R.bodyH + R.capH) / 2; // turn + squash around the middle of the body
export const HOVER = 26; // normal floating height of his point above the ground
export const PUNTJE_H = HOVER + R.coneH + R.bodyH + R.capH;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const D = Math.PI / 180;

// --- the neutral pose -------------------------------------------------------------
export const BASE = {
  x: 0, // sideways shift
  air: HOVER, // height of his point above the ground
  lean: 0, // body rotation (degrees, + = to the right)
  sy: 1, // squash & stretch (sy < 1 = squashed)
  turn: 1, // 1 = facing us, -1 = mirrored (for a twirl)
  aL: -70, eL: -10, aR: -70, eR: -10, // arms: shoulder + elbow
  handL: 0, handR: 0, // hand: 0 = dot, 1 = open (spread fingers)
  lookX: 0, lookY: 0, blink: 0, eyes: 1, // eyes: look (-1..1), blink 0..1, size
  happy: 0, // ^ ^ eyes
  brow: 0, browTilt: 0, // brows: raise (-1..1), tilt (+ = worried)
  smile: 0.5, mouth: 0, // mouth: smile (-1..1), open (0..1)
  draw: 0, // length of the line Puntje draws with his point (tekenen)
  prop: null, // "hand" = a little pencil in his right hand, or { x, y, rot } flying
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

// Blink now and then
export function blinkAt(t, every = 3.1, off = 0) {
  const p = (t + off) % every;
  return p < 0.13 ? Math.sin((p / 0.13) * Math.PI) : 0;
}
// Floating: a slow up and down
const bob = (t, amp = 4, speed = 2.2) => Math.sin(t * speed) * amp;

// --- draw -------------------------------------------------------------------------
function arm(g, sx, sy, side, a, e, open) {
  const r1 = -a * D, r2 = -(a + e) * D;
  const ex = sx + side * Math.cos(r1) * R.upper, ey = sy + Math.sin(r1) * R.upper;
  const hx = ex + side * Math.cos(r2) * R.lower, hy = ey + Math.sin(r2) * R.lower;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  if (open > 0.5) {
    for (const s of [-0.6, 0, 0.6]) { const r = r2 + s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + side * Math.cos(r) * 7, hy + Math.sin(r) * 7); g.stroke(); }
  } else { g.beginPath(); g.arc(hx, hy, 4.2, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
  return [hx, hy];
}

// Draw Puntje with pose p, the ground under him at (x, y), scale s.
export function drawPuntje(g, p, x, y, s = 1, { flip = false, ground = true } = {}) {
  g.save();
  g.translate(x + p.x * s, y);
  g.scale(flip ? -s : s, s);
  g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = R.lw; g.strokeStyle = INK;

  // shadow on the ground: smaller and lighter the higher he floats
  if (ground) {
    const k = clamp(1 - p.air / 160, 0.3, 1);
    g.save(); g.globalAlpha = 0.16 * k; g.fillStyle = INK;
    g.beginPath(); g.ellipse(0, 0, 24 * k, 4.5 * k, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // the line he draws with his point
  if (p.draw > 0) { g.save(); g.lineWidth = 4; g.beginPath(); g.moveTo(-p.x, 0); g.lineTo(-p.x + p.draw, 0); g.stroke(); g.restore(); }

  // body space: origin in the middle of the body, rotated + squashed
  const lean = p.lean * D, sy = p.sy, sx = (1 / Math.sqrt(sy)) * p.turn;
  const cy = -p.air - CENTER;
  const toWorld = (bx, by) => { const X = bx * sx, Y = by * sy; return [Math.cos(lean) * X - Math.sin(lean) * Y, cy + Math.sin(lean) * X + Math.cos(lean) * Y]; };
  const W = R.bodyW, junction = CENTER - R.coneH; // body coords: +y = down, cone base at `junction`
  const bodyTop = junction - R.bodyH;

  g.save();
  g.translate(0, cy); g.rotate(lean); g.scale(sx, sy);
  // cone (point) + lead
  g.beginPath(); g.moveTo(-W / 2, junction); g.lineTo(0, junction + R.coneH); g.lineTo(W / 2, junction); g.closePath();
  g.fillStyle = PAPER; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-5, junction + R.coneH - 8); g.lineTo(0, junction + R.coneH); g.lineTo(5, junction + R.coneH - 8); g.closePath(); g.fillStyle = INK; g.fill(); g.stroke();
  // body + cap
  g.fillStyle = PAPER;
  g.beginPath(); g.rect(-W / 2, bodyTop, W, R.bodyH); g.fill(); g.stroke();
  g.beginPath(); g.rect(-W / 2, bodyTop - R.capH, W, R.capH); g.fill(); g.stroke();
  g.restore();

  // arms
  const shY = bodyTop + R.shoulderY;
  const sL = toWorld(-W / 2, shY), sR = toWorld(W / 2, shY);
  arm(g, sL[0], sL[1], -1, p.aL - p.lean, p.eL, p.handL);
  const handR = arm(g, sR[0], sR[1], 1, p.aR + p.lean, p.eR, p.handR);

  // face
  g.save();
  g.translate(0, cy); g.rotate(lean); g.scale(sx, sy);
  const fy = bodyTop + 34, er = 6 * p.eyes;
  for (const side of [-1, 1]) {
    const ex = side * 9;
    if (p.happy > 0.5) {
      g.beginPath(); g.moveTo(ex - 5, fy + 2); g.lineTo(ex, fy - 3); g.lineTo(ex + 5, fy + 2); g.stroke();
    } else {
      const open = 1 - clamp(p.blink, 0, 1);
      g.save(); g.translate(ex, fy); g.scale(1, Math.max(0.08, open));
      g.beginPath(); g.arc(0, 0, er, 0, Math.PI * 2); g.fillStyle = PAPER; g.fill(); g.lineWidth = 2.6; g.stroke();
      g.beginPath(); g.arc(p.lookX * er * 0.45, p.lookY * er * 0.45, er * 0.5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      g.restore();
    }
    const by = fy - er - 5 - p.brow * 4, tilt = p.browTilt * 4 * side;
    g.beginPath(); g.moveTo(ex - 5, by + tilt); g.lineTo(ex + 5, by - tilt); g.stroke();
  }
  const my = fy + 16;
  if (p.mouth > 0.15) { g.beginPath(); g.ellipse(0, my + 2, 5 + 2 * p.mouth, 3 + 5 * p.mouth, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
  else { g.beginPath(); g.moveTo(-7, my); g.quadraticCurveTo(0, my + p.smile * 9, 7, my); g.stroke(); }
  g.restore();

  if (p.prop) { const pr = p.prop === "hand" ? { x: handR[0], y: handR[1], rot: 0.3 } : p.prop; potlood(g, pr.x, pr.y, pr.rot || 0); }
  g.restore();
}

function potlood(g, x, y, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.lineWidth = 2.5; g.strokeStyle = INK; g.fillStyle = PAPER;
  g.beginPath(); g.rect(-4, -22, 8, 30); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-4, 8); g.lineTo(0, 16); g.lineTo(4, 8); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// little extras around Puntje (world space)
function extra(g, kind, x, y, s, v) {
  g.save(); g.strokeStyle = SOFT; g.lineWidth = 3; g.lineCap = "round";
  if (kind === "klop") { // knock waves on the glass
    g.globalAlpha = 1 - v;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(x, y, (8 + i * 10 + 14 * v) * s, -0.9, 0.9); g.stroke(); }
  }
  if (kind === "zoef") { // speed lines (flying in, shooting up)
    g.globalAlpha = 0.8 * (1 - v);
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 10 * s, y + 10 * s); g.lineTo(x + i * 10 * s, y + (34 + 10 * Math.abs(i)) * s); g.stroke(); }
  }
  if (kind === "zij") { // speed lines behind him when he flies in from the right
    g.globalAlpha = 0.8 * (1 - v);
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + 30 * s, y + i * 14 * s); g.lineTo(x + (60 + 10 * Math.abs(i)) * s, y + i * 14 * s); g.stroke(); }
  }
  g.restore();
}

// --- the animations ------------------------------------------------------------------
// f(t) → pose fields (+ fx: [[kind, value, dx, dy]]). dur = one loop in seconds. use = where in the flow.
const A = {};

A.rust = { dur: 4.4, use: "Altijd als hij niets anders doet", f: (t) => {
  const p = keys([[0, { lookX: 0 }], [0.3, {}], [0.38, { lookX: -0.9, lookY: -0.2 }], [0.55, {}], [0.62, { lookX: 0.9, lookY: 0.1 }], [0.8, {}], [0.88, { lookX: 0, lookY: 0 }]], t / 4.4);
  return { ...p, air: HOVER + bob(t, 5, 2.1), lean: bob(t, 2, 1.05), aL: -72 + bob(t, 4, 2.1), aR: -72 - bob(t, 4, 2.1), blink: blinkAt(t, 3.3) };
} };

A.zweven = { dur: 2.4, use: "1a, 1b: muur en iPad in rust, hij zweeft rond", f: (t) => {
  const u = (t / 2.4) * Math.PI * 2, flap = Math.sin(u * 2);
  return { ...BASE, air: HOVER + 12 + Math.sin(u) * 14, x: Math.sin(u) * 22, lean: Math.cos(u) * 10, aL: -40 + flap * 22, aR: -40 + flap * 22, eL: 20, eR: 20, lookX: Math.cos(u) * 0.6, smile: 0.7, blink: blinkAt(t, 2.9) };
} };

A.wenken = { dur: 1.6, use: "1a, 1b, 3b, 6f: kom hier", f: (t) => {
  const curl = Math.sin(((t / 0.8) % 1) * Math.PI * 2);
  return { ...BASE, air: HOVER + bob(t, 3, 3), lean: -6, aR: 35, eR: 60 + curl * 55, aL: -75, lookX: 0.4, brow: 0.6, smile: 0.7, blink: blinkAt(t, 2.9) };
} };

A.zwaaien = { dur: 1.2, use: "Hallo / tot ziens (8a, 9a)", f: (t) => {
  const w = Math.sin((t / 1.2) * Math.PI * 4);
  return { ...BASE, air: HOVER + bob(t, 4, 2.6), aR: 60, eR: 25 + w * 35, handR: 1, aL: -75, lean: -4 + w * 3, smile: 0.9, mouth: 0.3, brow: 0.5, blink: blinkAt(t, 2.5) };
} };

A.wijzen = { dur: 2.2, use: "2c, 3b: kijk daar / naar de oogjes", f: (t) => {
  const u = t / 2.2;
  const p = keys([[0, {}], [0.12, { aR: 10, eR: 0, lean: 8, x: 8, lookX: 1, aL: -40, eL: -100, brow: 0.5 }], [0.7, {}], [0.85, { aR: -70, eR: -10, lean: 0, x: 0, lookX: 0, aL: -70, eL: -10, brow: 0 }]], u);
  const tap = u > 0.15 && u < 0.7 ? Math.max(0, Math.sin(t * 9)) * 4 : 0;
  return { ...p, air: HOVER + bob(t, 3), aR: p.aR + tap, blink: blinkAt(t, 3) };
} };

A.knikken = { dur: 1.6, use: "2b: kijkt mee terwijl je tekent", f: (t) => {
  const n = Math.max(0, Math.sin((t / 1.6) * Math.PI * 4));
  return { ...BASE, air: HOVER + bob(t, 3) - n * 4, lean: n * 5, sy: 1 - n * 0.05, lookY: 0.6, lookX: Math.sin(t * 2) * 0.6, brow: 0.3, smile: 0.6, aL: -60, aR: -60, blink: blinkAt(t, 2.6) };
} };

A.tekenen = { dur: 2.6, use: "2a, 5b, 6c: tekent een lijn met zijn punt", f: (t) => {
  const u = t / 2.6;
  // floats down until his point touches the paper, draws, floats up again
  const p = keys([[0, { air: HOVER, lean: 0, x: 0 }], [0.14, { air: 0, lean: -30, aL: 20, aR: -10, eL: -20, lookY: 0.9, lookX: -0.4, brow: -0.3, smile: 0, mouth: 0.2 }], [0.84, { air: 0, lean: -30, x: 100 }], [1, { air: HOVER, lean: 0, x: 0, aL: -70, aR: -70, smile: 0.5, mouth: 0, lookY: 0, lookX: 0, brow: 0 }]], u);
  const draw = u > 0.14 && u < 0.97 ? clamp((u - 0.14) / 0.7, 0, 1) * 100 + 10 : 0;
  return { ...p, draw, aL: p.aL + Math.sin(t * 18) * 2 };
} };

A.gooien = { dur: 2, use: "2a: geeft zijn potlood door", f: (t) => {
  const u = t / 2;
  const p = keys([[0, { aR: -60, eR: -20 }], [0.25, { aR: 120, eR: 40, lean: 10, sy: 1.05, lookX: 0.6, brow: 0.4 }], [0.42, { aR: 20, eR: 0, lean: -12, sy: 0.95, lookX: -0.4, mouth: 0.4 }], [0.6, { aR: -20, eR: -10, lean: -4, mouth: 0 }], [1, { aR: -70, eR: -10, lean: 0, lookX: 0, smile: 0.8 }]], u);
  let prop = u < 0.42 ? "hand" : null;
  if (!prop && u < 0.95) { const k = (u - 0.42) / 0.53; prop = { x: lerp(-40, -240, k), y: lerp(-130, 0, k) - Math.sin(k * Math.PI) * 120, rot: -k * 9 }; }
  return { ...p, air: HOVER + bob(t, 3), prop, blink: blinkAt(t, 3) };
} };

A["armen wijd"] = { dur: 2.4, use: "5b, 5c, 6b: doet voor (brug)", f: (t) => {
  const u = t / 2.4;
  const p = keys([[0, {}], [0.2, { aL: 0, aR: 0, eL: 0, eR: 0, handL: 1, handR: 1, brow: 0.4, smile: 0.7 }], [0.8, {}], [0.95, { aL: -70, aR: -70, eL: -10, eR: -10, handL: 0, handR: 0 }]], u);
  const hold = u > 0.2 && u < 0.8 ? Math.sin(t * 6) * 1.5 : 0;
  return { ...p, air: HOVER + bob(t, 3), aL: p.aL + hold, aR: p.aR + hold, blink: blinkAt(t, 3.4) };
} };

A["armen omhoog"] = { dur: 2.4, use: "5c, 6b: doet voor (ladder)", f: (t) => {
  const p = keys([[0, {}], [0.22, { aL: 82, aR: 82, eL: 0, eR: 0, sy: 1.1, air: HOVER + 10, handL: 1, handR: 1, lookY: -0.8, brow: 0.7, mouth: 0.25 }], [0.8, {}], [0.95, { aL: -70, aR: -70, eL: -10, eR: -10, sy: 1, air: HOVER, handL: 0, handR: 0, lookY: 0, brow: 0, mouth: 0 }]], t / 2.4);
  return { ...p, air: p.air + bob(t, 3), blink: blinkAt(t, 3.2) };
} };

A.springen = { dur: 1.8, use: "5c, 6b: doet voor (springen)", f: (t) => {
  const u = t / 1.8;
  const p = keys([
    [0, {}],
    [0.16, { air: 10, sy: 0.8, aL: -30, aR: -30, eL: -40, eR: -40, brow: -0.2 }], // dips down, squashed
    [0.28, { air: 40, sy: 1.18, aL: 70, aR: 70, eL: 0, eR: 0, mouth: 0.4, brow: 0.6 }], // shoots up, stretched
    [0.46, { air: 120, sy: 1.0, aL: 80, aR: 80 }], // top
    [0.8, { air: HOVER + 4, sy: 1.0, aL: -40, aR: -40, eL: -10, eR: -10, mouth: 0, smile: 0.8 }], // floats down
    [0.92, { air: HOVER, aL: -70, aR: -70, brow: 0 }],
  ], u);
  return { ...p, fx: u > 0.26 && u < 0.46 ? [["zoef", (u - 0.26) / 0.2, 0, -p.air]] : [] };
} };

A.bukken = { dur: 2.4, use: "5c, 6b: doet voor (bukken)", f: (t) => {
  const p = keys([[0, {}], [0.22, { air: 2, sy: 0.74, aL: 70, aR: 70, eL: 80, eR: 80, lookY: -0.8, brow: 0.6, mouth: 0.3 }], [0.75, {}], [0.95, { air: HOVER, sy: 1, aL: -70, aR: -70, eL: -10, eR: -10, lookY: 0, brow: 0, mouth: 0 }]], t / 2.4);
  return { ...p, blink: blinkAt(t, 3.1) };
} };

A.juichen = { dur: 1, use: "2d, 4a, 6d, 7b: gelukt!", f: (t) => {
  const b = Math.abs(Math.sin((t % 1) * Math.PI * 2));
  return { ...BASE, air: HOVER + b * 26, sy: 1 + b * 0.06, aL: 70 + b * 15, aR: 70 + b * 15, eL: -10 + b * 20, eR: -10 + b * 20, handL: 1, handR: 1, happy: 1, smile: 1, mouth: 0.8, brow: 0.8 };
} };

A.dansje = { dur: 1.6, use: "6d: dansje als het lukt", f: (t) => {
  const u = t / 1.6, s = Math.sin(u * Math.PI * 2), c = Math.sin(u * Math.PI * 4);
  const turn = u > 0.4 && u < 0.6 ? Math.cos(((u - 0.4) / 0.2) * Math.PI * 2) : 1; // a little twirl
  return { ...BASE, air: HOVER + 8 + Math.abs(c) * 10, lean: s * 14, x: s * 10, turn, aL: 40 + c * 30, aR: 40 - c * 30, eL: 30, eR: 30, happy: 1, smile: 1, mouth: 0.5, brow: 0.6 };
} };

A.oei = { dur: 2.4, use: "6e: lukt niet meteen (nog eens!)", f: (t) => {
  const u = t / 2.4;
  const p = keys([[0, {}], [0.15, { air: 16, aL: 20, aR: 20, eL: 70, eR: 70, handL: 1, handR: 1, sy: 0.94, brow: 0.6, browTilt: 1, smile: -0.4, lookX: 0.5 }], [0.45, {}], [0.6, { air: HOVER, aL: -60, aR: -60, eL: -10, eR: -10, handL: 0, handR: 0, sy: 1, browTilt: 0.6, smile: -0.1, lookX: 0 }], [1, {}]], u);
  const fidget = u > 0.6 ? Math.sin(t * 16) * 2.5 : 0; // impatient little bobs
  return { ...p, air: p.air + fidget, blink: blinkAt(t, 2.4) };
} };

A.tikken = { dur: 1.4, use: "2x: tikt tegen het glas (te lang niets)", f: (t) => {
  const u = (t / 0.7) % 1, k = Math.max(0, Math.sin(u * Math.PI * 2));
  return { ...BASE, air: HOVER + bob(t, 3), lean: 6 - k * 4, aR: 10 + k * 12, eR: 40 - k * 40, aL: -70, eyes: 1.25, brow: 0.9, mouth: 0.35, lookX: 0.2, fx: k > 0.9 ? [["klop", (u % 0.5) * 2, 74, -150]] : [] };
} };

A.buigen = { dur: 3, use: "8c: eindscherm", f: (t) => {
  const p = keys([[0, {}], [0.25, { smile: 0.9 }], [0.45, { air: 12, sy: 0.78, aR: -120, eR: -60, aL: -30, eL: 30, happy: 1, brow: 0.3, lookY: 1 }], [0.75, {}], [0.9, { air: HOVER, sy: 1, aR: -70, eR: -10, aL: -70, eL: -10, happy: 0, lookY: 0 }]], t / 3);
  return { ...p, air: p.air + bob(t, 2), blink: blinkAt(t, 3.5) };
} };

A.binnenvliegen = { dur: 2.2, use: "5b: vliegt erbij (komt van rechts)", f: (t) => {
  const u = t / 2.2, k = clamp(u / 0.45, 0, 1);
  const p = keys([[0, { lean: -18, aL: 30, aR: 30, eL: 40, eR: 40, mouth: 0.4, brow: 0.6, lookX: -0.8 }], [0.45, {}], [0.55, { lean: 6, sy: 0.9, aL: -30, aR: -30 }], [0.7, { lean: 0, sy: 1, aL: -70, aR: -70, eL: -10, eR: -10, mouth: 0, smile: 0.8, lookX: 0, brow: 0.3 }], [1, {}]], u);
  return { ...p, x: lerp(150, 0, smooth(k)), air: HOVER + (u < 0.45 ? Math.sin(k * Math.PI) * 70 : bob(t, 3)), fx: u < 0.45 ? [["zij", k, 0, -HOVER - 60]] : [] };
} };

export const ANIMS = A;
export const ORDER = ["rust", "zweven", "wenken", "zwaaien", "wijzen", "knikken", "tekenen", "gooien", "armen wijd", "armen omhoog", "springen", "bukken", "juichen", "dansje", "oei", "tikken", "buigen", "binnenvliegen"];

// Draw animation `name` at time t (seconds), ground under him at (x, y), scale s.
export function animate(g, name, t, x, y, s = 1, opts = {}) {
  const a = A[name] || A.rust;
  const r = a.f(t % a.dur);
  const p = { ...BASE, ...r };
  drawPuntje(g, p, x, y, s, opts);
  for (const [kind, v, dx = 0, dy = 0] of r.fx || []) extra(g, kind, x + (p.x + dx) * s, y + dy * s, s, clamp(v, 0, 1));
  return p;
}
