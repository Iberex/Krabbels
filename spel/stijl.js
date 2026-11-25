// =====================================================================
// Krabbels demo v2: the styled renderer (version 5: paper world + crayon).
// Rule: everything that is already there is cut paper with a rough crayon
// outline; everything that gets made (bridges, ladders, Krabbel, the
// player's body) is crayon only.
// Static things are drawn once into cached canvases (sprites); only what
// moves is drawn every frame. Game logic stays in main.js.
// =====================================================================
import { pictoShapes } from "./picto.js";
import { drawWobbelKrabbel, waitLines, SIZE as KRABBEL_SIZE } from "./hub.js";

const img = (src) => {
  const i = new Image();
  i.src = src;
  return i;
};
const TEX = { papier: img("assets/papier.jpg"), korrel: img("assets/korrel.jpg") };
const FONT = "Grandstander, ui-rounded, system-ui, sans-serif";

const C = {
  ink: "#2B2B33", navy: "#2D4A8A", navyD: "#16264D", green: "#57A85F", greenD: "#2C7A33", grass: "#2E7A38",
  kraft: "#C98F55", kraftD: "#A8703D", yellow: "#F7C548", yellowD: "#E3A92F", yellowL: "#FCDC7A", wood: "#EDC891",
  pink: "#F29BAE", purple: "#7A4BC2", purpleL: "#A27BE0", purpleD: "#5F3A9E", orange: "#EE6A3C", line: "#E07A1F",
  blue: "#4A78C8", red: "#E4572E", tape: "#EADFC4", p1: "#F08A6E", p2: "#5C8FE0", hillFar: "#D3E6D3",
  hillNear: "#AFD5B2", leaf: ["#3F8F4E", "#5DAE62", "#7CC37A"], cloud: "#7FA7E6", paper: "#F3EEE3",
};

// ---------------------------------------------------------------------
// Frame state (set at the start of every draw)
// ---------------------------------------------------------------------
let A, ctx, W, H, u, S;
let SC = 1; // scale of the sprite being drawn (shadows are not scaled by transforms)
const cache = new Map();
let cacheKey = "", lastPages = null;
const P = { x: null, y: 0, ang: 0, pose: "wave", squash: 1, mirror: 1 }; // Puntje, smoothed
let lastT = 0;

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (r, a, b) => a + (b - a) * r();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function dk(hex, f = 0.6) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}

function densify(pts, step, closed = false) {
  const Q = closed ? [...pts, pts[0]] : pts;
  const out = [];
  for (let i = 0; i < Q.length - 1; i++) {
    const [x0, y0] = Q[i], [x1, y1] = Q[i + 1];
    const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(Q[Q.length - 1]);
  return out;
}
function rough(pts, amp, r, closed = false) {
  const D = densify(pts, Math.max(5, 12 * u), closed);
  const ph = [rnd(r, 0, 6.28), rnd(r, 0, 6.28), rnd(r, 0, 6.28)];
  const fr = [rnd(r, 0.02, 0.04) / u, rnd(r, 0.07, 0.12) / u, rnd(r, 0.2, 0.35) / u];
  let s = 0;
  return D.map(([x, y], i) => {
    if (i) s += Math.hypot(x - D[i - 1][0], y - D[i - 1][1]);
    const a = D[Math.min(i + 1, D.length - 1)], b = D[Math.max(i - 1, 0)];
    const dx = a[0] - b[0], dy = a[1] - b[1], L = Math.hypot(dx, dy) || 1;
    const o = amp * (0.6 * Math.sin(s * fr[0] + ph[0]) + 0.3 * Math.sin(s * fr[1] + ph[1]) + 0.25 * Math.sin(s * fr[2] + ph[2]));
    return [x + (-dy / L) * o, y + (dx / L) * o];
  });
}
function strokePts(g, pts, color, w, op = 1, closed = false, dash = null) {
  if (pts.length < 2) return;
  g.save();
  g.globalAlpha *= op;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (closed) g.closePath();
  g.stroke();
  g.restore();
}
function fillPts(g, pts, color, op = 1) {
  g.save();
  g.globalAlpha *= op;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
  g.restore();
}
// Cut paper: a fill with a soft drop shadow.
function paper(g, pts, color, strong = 1) {
  g.save();
  g.shadowColor = `rgba(40,25,10,${0.28 * strong})`;
  g.shadowBlur = 7 * u * SC;
  g.shadowOffsetX = 2 * u * SC;
  g.shadowOffsetY = 5 * u * SC * strong;
  fillPts(g, pts, color);
  g.restore();
}
function crayon(g, pts, color, w, r, { closed = false, op = 0.92, grain = true } = {}) {
  for (const [wf, of, af] of [[1, op, 0.1], [0.6, op * 0.75, 0.18], [0.38, op * 0.6, 0.26]]) {
    strokePts(g, rough(pts, w * af + 0.5 * u, r, closed), color, w * wf, of, closed);
  }
  if (grain && w >= 5 * u) {
    const dash = Array.from({ length: 14 }, () => [1, 2, 3, 2, 4, 6][Math.floor(r() * 6)] * u);
    strokePts(g, rough(pts, w * 0.2, r, closed), "#FFFFFF", w * 0.4, 0.35, closed, dash);
  }
}
function rot(pts, a, cx, cy) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
function hatch(g, poly, color, r, { spacing = 9 * u, angle = -35, w = 6 * u, op = 0.55 } = {}) {
  const a = (angle * Math.PI) / 180;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const Pp = rot(poly, -a, cx, cy);
  const ys = Pp.map((p) => p[1]);
  const y1 = Math.max(...ys);
  g.save();
  g.globalAlpha *= op;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  let y = Math.min(...ys) + spacing * 0.5;
  const c = Math.cos(a), s = Math.sin(a);
  const back = (x, yy) => [cx + (x - cx) * c - (yy - cy) * s, cy + (x - cx) * s + (yy - cy) * c];
  while (y < y1) {
    const xs = [];
    for (let i = 0; i < Pp.length; i++) {
      const [x0, y0] = Pp[i], [x1, yb] = Pp[(i + 1) % Pp.length];
      if ((y0 <= y && y < yb) || (yb <= y && y < y0)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (yb - y0));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = xs[i] + rnd(r, 0, 3 * u), xb = xs[i + 1] - rnd(r, 0, 3 * u);
      if (xb - xa < 3 * u) continue;
      const yy = y + rnd(r, -1.2, 1.2) * u;
      const p0 = back(xa, yy), p1 = back(xb, yy + rnd(r, -2, 2) * u);
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
    }
    y += spacing * rnd(r, 0.8, 1.2);
  }
  g.stroke();
  g.restore();
}
function clipHalf(poly, nx, ny, d) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const f = (p) => (p[0] - cx) * nx + (p[1] - cy) * ny - d;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function shade(g, poly, color, r, { n = [0.6, 0.8], frac = 0.12, spacing = 7 * u, w = 4 * u, op = 0.4, angle = -50 } = {}) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const c = clipHalf(poly, n[0], n[1], ext * frac);
  if (c.length >= 3) hatch(g, c, color, r, { spacing, angle, w, op });
}
function outline(g, poly, color, r, w = 4.5 * u, off = [2 * u, 1.5 * u], op = 0.9, closed = true) {
  crayon(g, poly.map(([x, y]) => [x + off[0], y + off[1]]), color, w, r, { closed, op });
}
const circle = (cx, cy, rr, n = 28) => Array.from({ length: n }, (_, i) => [cx + rr * Math.cos((2 * Math.PI * i) / n), cy + rr * Math.sin((2 * Math.PI * i) / n)]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function rrect(x0, y0, x1, y1, r, n = 5) {
  const pts = [];
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]])
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return pts;
}
function cut(poly, r, j = 1.6 * u, step = 70 * u) {
  const D = densify(poly, step, true).slice(0, -1);
  return D.map(([x, y]) => [x + rnd(r, -j, j), y + rnd(r, -j, j)]);
}
// Torn paper strip: jagged top edge (and jagged sides where `torn`).
function tornRect(x0, x1, top, bottom, seed, { amp = 3 * u, tornL = false, tornR = false, grow = 0 } = {}) {
  const r = rng(seed), step = 9 * u, pts = [];
  const L = x0 - (tornL ? grow : 2), R = x1 + (tornR ? grow : 2);
  for (let x = L; x < R; x += step) pts.push([x, top - grow + 2.2 * u * Math.sin(x * 0.03 / u) + rnd(r, -amp, amp)]);
  pts.push([R, top - grow]);
  if (tornR) for (let y = top + step; y < bottom; y += step) pts.push([R + rnd(r, -amp, amp), y]);
  pts.push([R, bottom], [L, bottom]);
  if (tornL) for (let y = bottom - step; y > top; y -= step) pts.push([L + rnd(r, -amp, amp), y]);
  return pts;
}
function tr(pts, dx, dy, sc = 1, ang = 0, mirror = false) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map(([x, y]) => {
    if (mirror) x = -x;
    x *= sc;
    y *= sc;
    return [dx + x * c - y * s, dy + x * s + y * c];
  });
}

// ---------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------
function sprite(key, w, h, draw, maxScale = 2) {
  let s = cache.get(key);
  if (s) return s;
  const sc = Math.min(window.devicePixelRatio || 1, maxScale);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * sc));
  c.height = Math.max(1, Math.ceil(h * sc));
  const g = c.getContext("2d");
  g.scale(sc, sc);
  const keep = SC;
  SC = sc;
  draw(g);
  SC = keep;
  s = { c, w, h };
  cache.set(key, s);
  return s;
}
const blit = (s, x, y) => ctx.drawImage(s.c, x, y, s.w, s.h);

// ---------------------------------------------------------------------
// Things (drawn into sprites)
// ---------------------------------------------------------------------
function tape(g, cx, cy, w, h, angDeg) {
  const pts = tr([[-w / 2, -h / 2], [w / 2, -h / 2 + 1], [w / 2 - 2, h / 2], [-w / 2 + 2, h / 2 - 1]], cx, cy, 1, (angDeg * Math.PI) / 180);
  g.save();
  g.globalAlpha = 0.88;
  paper(g, pts, C.tape, 0.7);
  g.restore();
}

function pin(g, x, y, r) {
  paper(g, circle(x, y, 17 * u, 24), C.orange);
  fillPts(g, circle(x, y, 10 * u, 20), "#FFFFFF", 0.22);
  fillPts(g, circle(x - 5 * u, y - 6 * u, 4 * u, 12), "#FFFFFF", 0.85);
  outline(g, circle(x, y, 17 * u, 16), "#9C3416", r, 3.5 * u, [1.5 * u, 1 * u]);
}

function tree(g, x, ground, h, r) {
  const col = [C.red, C.blue, C.yellow, C.purple][Math.floor(r() * 4)];
  const trunk = rect(x - 12 * u, ground - h * 0.5, x + 12 * u, ground + 8 * u);
  paper(g, cut(trunk, r, 1 * u), col);
  fillPts(g, rect(x - 12 * u, ground - h * 0.5, x - 4 * u, ground + 8 * u), dk(col, 0.8));
  outline(g, trunk, dk(col, 0.5), r, 4 * u);
  const cy = ground - h * 0.68;
  const crowns = [[-h * 0.16, h * 0.06, h * 0.2, C.leaf[0]], [h * 0.15, h * 0.04, h * 0.21, C.leaf[1]], [0, -h * 0.12, h * 0.24, C.leaf[2]]];
  const polys = crowns.map(([dx, dy, rr, c]) => {
    const cp = cut(circle(x + dx, cy + dy, rr, 26), r, 1.2 * u, 30 * u);
    paper(g, cp, c);
    return [cp, c];
  });
  for (const [cp, c] of polys) {
    shade(g, cp, dk(c, 0.7), r, { spacing: 7 * u, w: 4 * u, op: 0.45 });
    outline(g, cp, dk(c, 0.5), r, 4.5 * u);
  }
}
function bush(g, x, ground, w, r) {
  const parts = [[-w * 0.28, w * 0.26, C.leaf[0]], [w * 0.26, w * 0.24, C.leaf[1]], [0, w * 0.32, C.leaf[2]]].map(([dx, rr, c]) => {
    const cp = cut(circle(x + dx, ground + 4 * u, rr, 24), r, 1 * u, 30 * u);
    paper(g, cp, c);
    return [cp, c];
  });
  for (const [cp, c] of parts) outline(g, cp.filter((p) => p[1] < ground + 2 * u), dk(c, 0.5), r, 4 * u, [2 * u, 1.5 * u], 0.9, false);
}
function flower(g, x, ground, col, r) {
  const h = 52 * u;
  crayon(g, [[x, ground + 6 * u], [x + 2 * u, ground - h]], C.grass, 4.5 * u, r, { grain: false });
  crayon(g, [[x + u, ground - h * 0.45], [x + 14 * u, ground - h * 0.62]], C.grass, 4 * u, r, { grain: false });
  for (let k = 0; k < 5; k++) {
    const a = (2 * Math.PI * k) / 5 + 0.3;
    const c = circle(x + 2 * u + 12 * u * Math.cos(a), ground - h - 8 * u + 12 * u * Math.sin(a), 9.5 * u, 14);
    paper(g, c, col, 0.6);
    outline(g, c, dk(col, 0.55), r, 2.6 * u, [u, u]);
  }
  fillPts(g, circle(x + 2 * u, ground - h - 8 * u, 7.5 * u, 14), C.yellow);
}
function shaving(g, x, ground, col, r) {
  const fan = Array.from({ length: 11 }, (_, k) => [x + 30 * u * Math.cos((Math.PI * k) / 10), ground - 2 * u - 22 * u * Math.sin((Math.PI * k) / 10)]);
  paper(g, fan, C.wood, 0.6);
  const edge = Array.from({ length: 25 }, (_, k) => {
    const a = (Math.PI * k) / 24;
    return [x + 30 * u * Math.cos(a) + 2 * u * Math.sin(a * 9), ground - 2 * u - 22 * u * Math.sin(a) + 2 * u * Math.cos(a * 9)];
  });
  crayon(g, edge, col, 4.5 * u, r, { grain: false });
}
function paperclip(g, x, y, r, ang) {
  const pts = [[0, 0], [0, -46], [16, -46], [16, 6], [-8, 6], [-8, -36], [8, -36], [8, -6]];
  crayon(g, tr(pts, x, y, u, ang), "#7D8596", 4 * u, r, { grain: false });
}
function button(g, x, y, col, r) {
  paper(g, circle(x, y, 17 * u, 22), col, 0.6);
  outline(g, circle(x, y, 17 * u, 18), dk(col, 0.55), r, 3.5 * u, [1.5 * u, u]);
  for (const [hx, hy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) fillPts(g, circle(x + hx * u, y + hy * u, 2.6 * u, 8), "#000000", 0.35);
}

function groundSeg(g, x0, x1, top, seed, tornL, tornR) {
  const r = rng(seed);
  const kraft = (grow) => tornRect(x0, x1, top + 44 * u, H + 20, seed * 7 + 1, { tornL, tornR, grow });
  const strip = (grow) => tornRect(x0, x1, top, top + 64 * u, seed * 13 + 2, { amp: 2.4 * u, tornL, tornR, grow });
  fillPts(g, kraft(5 * u), "#FFFFFF", 0.95);
  paper(g, kraft(0), C.kraft);
  fillPts(g, strip(5 * u), "#FFFFFF", 0.95);
  paper(g, strip(0), C.green);
  const edge = strip(0).filter((p) => p[1] < top + 8 * u);
  crayon(g, edge.map(([x, y]) => [x, y + 3 * u]), C.greenD, 6 * u, r);
  const kedge = kraft(0).filter((p) => p[1] < top + 52 * u);
  crayon(g, kedge.map(([x, y]) => [x, y + 2 * u]), C.kraftD, 4.5 * u, r, { op: 0.7 });
  if (tornL) crayon(g, [[x0 + 3 * u, top + 4 * u], [x0 + 3 * u, H]], dk(C.kraft, 0.55), 5 * u, r, { op: 0.8 });
  if (tornR) crayon(g, [[x1 - 3 * u, top + 4 * u], [x1 - 3 * u, H]], dk(C.kraft, 0.55), 5 * u, r, { op: 0.8 });
  hatch(g, rect(x0 + 10 * u, top + 64 * u, x1 - 10 * u, top + 120 * u), C.kraftD, r, { spacing: 9 * u, angle: -40, w: 5 * u, op: 0.35 });
  for (let k = 0; k < 3; k++) {
    const y = top + 130 * u + k * 85 * u;
    if (y > H - 20 * u) break;
    const wav = [];
    for (let x = x0 + 20 * u; x < x1 - 20 * u; x += 25 * u) wav.push([x, y + 6 * u * Math.sin(x * 0.02 / u + k)]);
    if (wav.length > 1) crayon(g, wav, C.kraftD, 4 * u, r, { op: 0.45, grain: false });
  }
  const n = Math.max(1, Math.round((x1 - x0) / (420 * u)));
  for (let k = 0; k < n; k++) {
    const bx = x0 + ((k + 0.5) * (x1 - x0)) / n + rnd(r, -60, 60) * u;
    button(g, clamp(bx, x0 + 30 * u, x1 - 30 * u), top + rnd(r, 120, 230) * u, ["#F29BAE", "#4A78C8", "#F7C548", "#EE6A3C"][Math.floor(r() * 4)], r);
  }
  if (x1 - x0 > 500 * u) paperclip(g, x0 + (x1 - x0) * rnd(r, 0.25, 0.75), top + rnd(r, 160, 240) * u, r, rnd(r, -0.8, 0.8));
  for (let x = x0 + rnd(r, 20, 60) * u; x < x1 - 20 * u; x += rnd(r, 70, 150) * u) {
    crayon(g, [[x - 7 * u, top + 2 * u], [x - 3 * u, top - 16 * u]], C.grass, 4 * u, r, { grain: false });
    crayon(g, [[x + 3 * u, top + 2 * u], [x + 8 * u, top - 13 * u]], C.grass, 4 * u, r, { grain: false });
  }
}

function hangPencil(g, cx, bottom, w, r) {
  const f = w / (118 * u);
  const topBody = bottom - 360 * u * f;
  strokePts(g, [[cx, -10], [cx, topBody - 30 * u * f]], "#55555F", 2.5 * u);
  tape(g, cx, 14 * u, 70 * u, 30 * u, -5);
  const body = rect(cx - w / 2, topBody, cx + w / 2, bottom - 96 * u * f);
  paper(g, cut(rrect(cx - w / 2 + 2, topBody - 52 * u * f, cx + w / 2 - 2, topBody - 18 * u * f, 12 * u * f), r, 0.8 * u), C.pink);
  paper(g, cut(rect(cx - w / 2 - 2, topBody - 22 * u * f, cx + w / 2 + 2, topBody + 4 * u), r, 0.8 * u), "#B9BCC4");
  paper(g, cut(body, r, u), C.purple);
  fillPts(g, rect(cx - w / 2, topBody, cx - w / 2 + w * 0.3, bottom - 96 * u * f), C.purpleD);
  fillPts(g, rect(cx + w / 2 - w * 0.28, topBody, cx + w / 2, bottom - 96 * u * f), C.purpleL);
  const cone = [[cx - w / 2, bottom - 96 * u * f], [cx + w / 2, bottom - 96 * u * f], [cx + 15 * u * f, bottom - 26 * u * f], [cx - 15 * u * f, bottom - 26 * u * f]];
  paper(g, cone, C.wood, 0.5);
  fillPts(g, [[cx - 15 * u * f, bottom - 26 * u * f], [cx + 15 * u * f, bottom - 26 * u * f], [cx, bottom]], C.ink);
  shade(g, body, "#4A2A80", r, { n: [1, 0], frac: 0.12, spacing: 8 * u, w: 5 * u, op: 0.45, angle: -60 });
  hatch(g, cone, "#C9A26A", r, { spacing: 6 * u, angle: -60, w: 3.5 * u, op: 0.6 });
  outline(g, [[cx - w / 2, topBody - 50 * u * f], [cx + w / 2, topBody - 50 * u * f], [cx + w / 2, bottom - 96 * u * f], [cx, bottom], [cx - w / 2, bottom - 96 * u * f]], "#3C2266", r, 5.5 * u);
}

function crayonBox(g, x0, x1, top, ground, r) {
  const w = x1 - x0;
  [C.red, C.blue, "#3E9A45"].forEach((col, i) => {
    const cx = x0 + w * (0.22 + 0.28 * i), h = (54 + (i % 2) * 22) * u;
    const stick = [[cx - 12 * u, top + 40 * u], [cx - 12 * u, top + 40 * u - h], [cx - 5 * u, top + 20 * u - h], [cx + 5 * u, top + 20 * u - h], [cx + 12 * u, top + 40 * u - h], [cx + 12 * u, top + 40 * u]];
    paper(g, cut(stick, r, 0.8 * u, 20 * u), col, 0.6);
    outline(g, stick, dk(col, 0.55), r, 3.5 * u, [u, u]);
  });
  const box = rect(x0 - 6 * u, top + 34 * u, x1 + 6 * u, ground);
  paper(g, cut(box, r, u), C.yellow);
  const hgt = ground - top;
  fillPts(g, [[x0 - 6 * u, top + 34 * u + hgt * 0.45], [x1 + 6 * u, top + 34 * u + hgt * 0.3], [x1 + 6 * u, top + 34 * u + hgt * 0.55], [x0 - 6 * u, top + 34 * u + hgt * 0.7]], "#3E9A45");
  const zz = [];
  for (let i = 0; i <= Math.floor(w / (14 * u)); i++) zz.push([x0 + 6 * u + i * 14 * u, top + (70 + (i % 2) * 14) * u]);
  crayon(g, zz, C.red, 4 * u, r, { grain: false });
  shade(g, box, "#C99A2E", r, { n: [1, 0], frac: 0.1, spacing: 8 * u, w: 4.5 * u, op: 0.45, angle: -60 });
  outline(g, box, "#8A6512", r, 6 * u);
}

function eraser(g, cx, ground, w, r) {
  const hw = w / 2;
  const pts = [[cx - hw, ground + 3 * u], [cx - hw + 4 * u, ground - 50 * u], [cx + hw - 2 * u, ground - 56 * u], [cx + hw + 2 * u, ground + 3 * u]];
  paper(g, cut(pts, r, u, 20 * u), C.pink);
  fillPts(g, [[cx - hw + 4 * u, ground - 50 * u], [cx + hw - 2 * u, ground - 56 * u], [cx + hw - u, ground - 28 * u], [cx - hw + 3 * u, ground - 24 * u]], C.blue);
  shade(g, pts, "#C9677D", r, { n: [1, 0.3], frac: 0.12, spacing: 6 * u, w: 4 * u, op: 0.5 });
  outline(g, pts, "#8E3A50", r, 4.5 * u);
}

function door(g, x0, x1, top, ground, r) {
  paper(g, cut(rect(x0 - 10 * u, top - 10 * u, x1 + 10 * u, ground), r, 1.2 * u), "#FFFFFF");
  paper(g, cut(rect(x0, top, x1, ground), r, 1.2 * u), C.navy);
  fillPts(g, rect(x0 + 16 * u, top + 18 * u, x1 - 16 * u, top + (ground - top) * 0.42), "#3D5FA6");
  fillPts(g, circle(x1 - 24 * u, top + (ground - top) * 0.58, 8 * u, 14), C.yellow);
  tape(g, x0 + 8 * u, top - 2 * u, 50 * u, 20 * u, -30);
  tape(g, x1 - 8 * u, top - 2 * u, 50 * u, 20 * u, 28);
  outline(g, rect(x0, top, x1, ground), C.navyD, r, 6 * u);
  for (let k = 1; k < 3; k++) {
    const x = x0 + ((x1 - x0) * k) / 3;
    crayon(g, [[x, top + 10 * u + (ground - top) * 0.45], [x, ground - 8 * u]], "#1E3566", 3 * u, r, { op: 0.5, grain: false });
  }
}

// Puntje: a pencil hopping on its point. Origin = the tip. Base size ~150 at scale 1.
const ARMS = {
  wave: [[[-20, -70], [-36, -50]], [[20, -70], [38, -98]]],
  cheer: [[[-20, -72], [-38, -104]], [[20, -72], [38, -104]]],
  point: [[[-20, -70], [-34, -48]], [[20, -70], [50, -74]]],
  draw: [[[-20, -72], [-40, -96]], [[20, -72], [42, -92]]],
};
function puntjeSprite(pose) {
  const sc = 1.1 * u, w = 170 * sc, h = 190 * sc, ax = 85 * sc, ay = 175 * sc;
  const s = sprite(`puntje-${pose}`, w, h, (g) => {
    const r = rng(pose.length * 31 + 7);
    const T = (pts) => tr(pts, ax, ay, sc);
    for (const a of ARMS[pose]) {
      crayon(g, T(a), C.ink, 4.5 * sc, r, { grain: false });
      fillPts(g, circle(...T([a[1]])[0], 5 * sc, 12), C.ink);
    }
    paper(g, T([[-5.5, -13], [5.5, -13], [20, -42], [-20, -42]]), C.wood);
    fillPts(g, T([[0, 0], [-5.5, -13], [5.5, -13]]), C.ink);
    paper(g, T(rect(-20, -112, 20, -42)), C.yellow);
    fillPts(g, T(rect(-20, -112, -7, -42)), C.yellowD);
    fillPts(g, T(rect(7, -112, 20, -42)), C.yellowL);
    paper(g, T(rect(-21, -126, 21, -112)), "#B9BCC4", 0.5);
    strokePts(g, T([[-21, -121], [21, -121]]), "#8E929C", 1.6 * sc);
    paper(g, T(rrect(-20, -144, 20, -126, 7, 3)), C.pink, 0.5);
    const o = T([[0, 0], [-20, -42], [-20, -112], [-21, -112], [-21, -126], [-20, -137], [-13, -144], [13, -144], [20, -137], [21, -126], [21, -112], [20, -112], [20, -42]]);
    crayon(g, o, C.ink, 3.2 * sc, r, { closed: true, grain: false, op: 0.85 });
    crayon(g, T([[-20, -42], [20, -42]]), C.ink, 2.2 * sc, r, { grain: false, op: 0.8 });
    hatch(g, T(rect(7, -110, 19, -44)), C.yellowD, r, { spacing: 3.4 * sc, angle: -60, w: 2.2 * sc, op: 0.6 });
    for (const ex of [-13, 13]) fillPts(g, T([[ex, -72]]).flatMap(([x, y]) => circle(x, y, 4 * sc, 12)), "#F07C8C", 0.55);
    strokePts(g, T(Array.from({ length: 9 }, (_, i) => [-6 + (12 * i) / 8, -71 + 3.2 * Math.sin((Math.PI * i) / 8)])), C.ink, 2.2 * sc);
    for (const ex of [-7.6, 7.6]) fillPts(g, T(Array.from({ length: 28 }, (_, i) => [ex + 8.2 * Math.cos((i * Math.PI) / 14), -85 + 11 * Math.sin((i * Math.PI) / 14)])), "#FFFFFF");
    for (const ex of [-7.6, 7.6]) fillPts(g, T(Array.from({ length: 20 }, (_, i) => [ex + 2.6 + 4.4 * Math.cos((i * Math.PI) / 10), -84 + 6.6 * Math.sin((i * Math.PI) / 10)])), "#111111");
  });
  return { s, ax, ay };
}

function sticker(type, active, angle, size) {
  const key = `sticker-${type}-${active ? 1 : 0}-${Math.round(angle / 5) * 5}-${Math.round(size)}`;
  const pad = size * 0.35, box = size * 1.24, W2 = box + pad * 2;
  return sprite(key, W2, W2, (g) => {
    const r = rng(type.length * 17 + (active ? 3 : 1));
    const c = W2 / 2, hb = box / 2;
    const bx = rrect(c - hb, c - hb, c + hb, c + hb, box * 0.22);
    paper(g, cut(bx, r, 1.2 * u), active ? C.navy : "#FFFFFF");
    hatch(g, bx, active ? "#5672B5" : "#B9CBEC", r, { spacing: (active ? 7 : 8) * u, angle: -40, w: 5 * u, op: 0.6 });
    outline(g, bx, active ? C.navyD : C.navy, r, (active ? 6 : 5) * u, [3 * u, 2.5 * u]);
    outline(g, bx, active ? C.navyD : C.navy, r, 3 * u, [-1.5 * u, -u], 0.6);
    pictogram(g, type, c, c, size, active ? "#FFFFFF" : C.navy, angle, r);
    if (active) tape(g, c, c - hb, box * 0.45, 22 * u, -6);
  });
}
function pictogram(g, type, x, y, s, color, angle, r) {
  const k = s * 0.1, lw = s * 0.085;
  const T = (pts) => pts.map(([a, b]) => [x + a * k, y + b * k]);
  const P = pictoShapes(type, angle); // shared with main.js
  for (const l of P.lines) crayon(g, T(l), color, lw, r, { grain: false });
  for (const l of P.dashed) strokePts(g, T(l), color, lw * 0.5, 0.7, false, [k * 0.6, k * 0.6]);
  for (const [dx, dy, rad] of P.dots) fillPts(g, circle(x + dx * k, y + dy * k, rad * k, 16), color);
  for (const t of P.tris) fillPts(g, T(t), color);
}

// ---------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------
function drawPaperBg() {
  const im = TEX.papier;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  if (!im.complete || !im.naturalWidth) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.9;
  // rotate the portrait texture to landscape and cover the screen
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  const s = Math.max(H / im.naturalWidth, W / im.naturalHeight);
  ctx.drawImage(im, (-im.naturalWidth * s) / 2, (-im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
  ctx.restore();
}

function sunSprites() {
  const body = sprite("sun-body", 150 * u, 150 * u, (g) => {
    const r = rng(5), c = 75 * u;
    const sp = cut(circle(c, c, 54 * u, 30), r, 1.2 * u);
    paper(g, sp, "#F7B33D");
    shade(g, sp, "#E08A1E", r, { spacing: 7 * u, w: 4.5 * u, op: 0.5 });
    outline(g, sp, "#D9771A", r, 5 * u);
    for (const ex of [-16, 16]) fillPts(g, circle(c + ex * u, c - 6 * u, 4.5 * u, 10), C.ink);
    strokePts(g, [[c - 16 * u, c + 14 * u], [c, c + 22 * u], [c + 16 * u, c + 14 * u]], C.ink, 3.5 * u);
  });
  const rays = sprite("sun-rays", 220 * u, 220 * u, (g) => {
    const r = rng(6), c = 110 * u;
    for (let k = 0; k < 12; k++) {
      const a = (2 * Math.PI * k) / 12;
      crayon(g, [[c + 68 * u * Math.cos(a), c + 68 * u * Math.sin(a)], [c + 96 * u * Math.cos(a), c + 96 * u * Math.sin(a)]], "#F0A020", 6 * u, r, { grain: false });
    }
  });
  return { body, rays };
}
function cloudSprite(i, sc) {
  return sprite(`cloud-${i}`, 250 * u * sc, 140 * u * sc, (g) => {
    const r = rng(40 + i), cx = 120 * u * sc, cy = 66 * u * sc;
    const pts = Array.from({ length: 48 }, (_, k) => {
      const a = (2 * Math.PI * k) / 48, b = 1 + 0.16 * Math.abs(Math.sin(a * 3.5));
      return [cx + 95 * u * sc * b * Math.cos(a), Math.min(cy + 34 * u * sc, cy + 46 * u * sc * b * Math.sin(a))];
    });
    paper(g, cut(pts, r, 0.8 * u, 40 * u), "#FFFFFF");
    const o = pts.map(([x, y]) => [x + 10 * u * sc, y + 8 * u * sc]);
    crayon(g, o, C.cloud, 4.5 * u, r, { closed: true, op: 0.8 });
    hatch(g, clipHalf(o, 0, 1, 10 * u * sc), "#9FBDEB", r, { spacing: 8 * u, angle: -30, w: 4 * u, op: 0.45 });
  });
}
function rainbowSprite() {
  return sprite("rainbow", 540 * u, 280 * u, (g) => {
    const r = rng(9), cx = 270 * u, cy = 270 * u;
    ["#E4572E", "#F0A020", "#F7C548", "#57A85F", "#4A78C8", "#7A4BC2"].forEach((col, i) => {
      const rr = (250 - i * 15) * u;
      crayon(g, Array.from({ length: 31 }, (_, k) => [cx + rr * Math.cos((Math.PI * k) / 30), cy - rr * Math.sin((Math.PI * k) / 30)]), col, 13 * u, r, { op: 0.75 });
    });
  });
}
function doodleSprite(kind) {
  return sprite(`doodle-${kind}`, 60 * u, 60 * u, (g) => {
    const r = rng(kind.length), x = 30 * u, y = 30 * u;
    if (kind === "star") {
      const pts = Array.from({ length: 10 }, (_, k) => {
        const rr = (k % 2 ? 7 : 16) * u, a = -Math.PI / 2 + (Math.PI * k) / 5;
        return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
      });
      crayon(g, pts, "#E8A23A", 3.5 * u, r, { closed: true, op: 0.85, grain: false });
    } else {
      crayon(g, Array.from({ length: 22 }, (_, t) => [x + (2 + t * 1.6) * u * Math.cos(t * 0.6), y + (2 + t * 1.6) * u * Math.sin(t * 0.6)]), "#E26D9A", 3.5 * u, r, { op: 0.75, grain: false });
    }
  });
}

function drawSky(t) {
  const cam = S.camX * W;
  rainbowSprite();
  blit(cache.get("rainbow"), 90 * u - cam * 0.02, H * 0.555 - 270 * u);
  // drifting clouds (wrap around)
  [[0.18, 0.12, 0.9, 9], [0.62, 0.08, 1.1, 6], [0.4, 0.27, 0.65, 12]].forEach(([fx, fy, sc, sp], i) => {
    const s = cloudSprite(i, sc);
    const span = W + s.w * 2;
    const x = ((((fx * W + t * sp * u - cam * 0.05) % span) + span) % span) - s.w;
    blit(s, x, fy * H + Math.sin(t * 0.4 + i) * 4 * u);
  });
  // sun: rays turn slowly, the sun bobs
  const { body, rays } = sunSprites();
  const sx = W - 240 * u, sy = 175 * u + Math.sin(t * 0.8) * 5 * u;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(t * 0.15);
  ctx.drawImage(rays.c, -rays.w / 2, -rays.h / 2, rays.w, rays.h);
  ctx.restore();
  blit(body, sx - body.w / 2, sy - body.h / 2);
  // doodles
  const star = doodleSprite("star"), spiral = doodleSprite("spiral");
  const tw = 1 + 0.12 * Math.sin(t * 2.2);
  ctx.save();
  ctx.translate(W * 0.68, H * 0.24);
  ctx.scale(tw, tw);
  ctx.drawImage(star.c, -star.w / 2, -star.h / 2, star.w, star.h);
  ctx.restore();
  blit(spiral, W * 0.2 - spiral.w / 2, H * 0.17);
  // birds flap across the sky
  for (let i = 0; i < 2; i++) {
    const span = W + 200 * u;
    const bx = ((t * (22 + i * 6) * u + i * W * 0.4) % span) - 100 * u;
    const by = H * (0.12 + i * 0.04) + Math.sin(t * 0.7 + i) * 8 * u;
    const f = Math.sin(t * 7 + i * 2) * 7 * u;
    strokePts(ctx, [[bx - 18 * u, by], [bx - 9 * u, by - 4 * u - f], [bx, by], [bx + 9 * u, by - 4 * u - f], [bx + 18 * u, by]], "#5B6798", 3.5 * u, 0.75);
  }
}

function hillsSprite(which) {
  const Wt = 2 * W;
  return sprite(`hills-${which}`, Wt, H, (g) => {
    const r = rng(which === "far" ? 3 : 5);
    const base = (which === "far" ? 0.48 : 0.57) * H, amp = (which === "far" ? 70 : 50) * u;
    const col = which === "far" ? C.hillFar : C.hillNear;
    const top = [];
    for (let x = 0; x <= Wt; x += 12 * u) top.push([x, base - amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * 2 * x) / Wt + 1)) - 18 * u * Math.sin((2 * Math.PI * 5 * x) / Wt + 2)]);
    paper(g, [...top, [Wt, H], [0, H]], col, 0.6);
    crayon(g, top.map(([x, y]) => [x, y + 2 * u]), dk(col, 0.72), 5 * u, r, { op: 0.55 });
    hatch(g, [...top.map(([x, y]) => [x, y + 14 * u]), [Wt, base + 60 * u], [0, base + 60 * u]], dk(col, 0.85), r, { spacing: 12 * u, angle: -35, w: 5 * u, op: 0.25 });
  }, 1);
}
function drawHills(which, par) {
  const s = hillsSprite(which);
  const off = -((((S.camX * W * par) % s.w) + s.w) % s.w);
  ctx.drawImage(s.c, off, 0, s.w, s.h);
  ctx.drawImage(s.c, off + s.w, 0, s.w, s.h);
}

// ---------------------------------------------------------------------
// Pages (ground + static obstacles + decor): one sprite per page
// ---------------------------------------------------------------------
function segments(p) {
  const segs = [];
  let x = p.index, lv = p.start;
  for (const o of p.obs) if (o.t === "connect") {
    segs.push([x, o.x0, lv]);
    x = o.x1;
    lv = o.lb;
  }
  segs.push([x, p.index + 1, lv]);
  return segs;
}
function levelAtPage(p, x) {
  for (const [a, b, lv] of segments(p)) if (x >= a && x <= b) return lv;
  return null;
}
function decorFor(p, isLast) {
  const r = rng(p.index * 977 + 13);
  const blocked = p.obs.map((o) => [o.x0 - 0.07, o.x1 + 0.07]);
  if (isLast) blocked.push([A.finishX() - 0.12, p.index + 2]);
  if (p.index === 0) blocked.push([-1, 0.12]); // where the Krabbel starts
  const items = [];
  for (const kind of ["tree", "tree", "bush", "flower", "flower", "shaving", "flower"]) {
    for (let tries = 0; tries < 24; tries++) {
      const x = p.index + 0.05 + r() * 0.9;
      if (blocked.some(([a, b]) => x > a && x < b)) continue;
      if (items.some((it) => Math.abs(it.x - x) < (kind === "tree" || it.kind === "tree" ? 0.12 : 0.05))) continue;
      if (kind === "tree" && (x < p.index + 0.07 || x > p.index + 0.93)) continue;
      const lv = levelAtPage(p, x);
      if (lv === null) continue;
      items.push({ kind, x, lv, col: ["#E26D9A", "#4A78C8", "#EE6A3C"][Math.floor(r() * 3)] });
      break;
    }
  }
  return items;
}
function pageSprite(p) {
  const isLast = S.mode.course !== "endless" && p.index === S.pages.length - 1;
  return sprite(`page-${p.index}`, W, H, (g) => {
    const r = rng(p.index * 131 + 7);
    const lx = (x) => (x - p.index) * W;
    const deco = decorFor(p, isLast);
    for (const d of deco) if (d.kind === "tree") tree(g, lx(d.x), A.levelY(d.lv), 0.26 * H, r);
    for (const d of deco) if (d.kind === "bush") bush(g, lx(d.x), A.levelY(d.lv), 120 * u, r);
    segments(p).forEach(([a, b, lv], i) => {
      if (b - a < 0.002) return;
      groundSeg(g, lx(a), lx(b), A.levelY(lv), p.index * 10 + i + 1, Math.abs(a - p.index) > 1e-6, Math.abs(b - p.index - 1) > 1e-6);
    });
    for (const o of p.obs) {
      const a = lx(o.x0), b = lx(o.x1), c = lx(o.xc);
      if (o.t === "jump") eraser(g, c, A.levelY(o.base), Math.max(70 * u, b - a + 24 * u), r);
      else if (o.t === "ladder") crayonBox(g, a, b, A.levelY(o.top), A.levelY(o.base), r);
      else if (o.t === "duck") {
        const bottom = A.levelY(o.base) - A.SIZE.duck.gap * H;
        if (o.owner === 3 && S.duo) {
          const w = Math.min(130 * u, (b - a) * 0.42);
          hangPencil(g, c - w * 0.62, bottom, w, r);
          hangPencil(g, c + w * 0.62, bottom, w, r);
        } else hangPencil(g, c, bottom, clamp((b - a) * 0.9, 80 * u, 140 * u), r);
      }
    }
    if (isLast) {
      const x = lx(A.finishX()), lv = p.end, h = H * 0.2, w = H * 0.11;
      door(g, x - w / 2, x + w / 2, A.levelY(lv) - h, A.levelY(lv), r);
    }
    for (const d of deco) if (d.kind === "flower") flower(g, lx(d.x), A.levelY(d.lv), d.col, r);
    for (const d of deco) if (d.kind === "shaving") shaving(g, lx(d.x), A.levelY(d.lv), d.col, r);
  }, 1.25);
}
function drawPages() {
  const first = Math.max(0, Math.floor(S.camX) - 1), last = Math.min(S.pages.length - 1, Math.ceil(S.camX) + 1);
  for (let i = first; i <= last; i++) {
    const x = (i - S.camX) * W;
    if (x > W || x < -W) continue;
    blit(pageSprite(S.pages[i]), x, 0);
  }
  // forget pages that are far behind
  for (const k of [...cache.keys()]) {
    const m = /^page-(\d+)$/.exec(k);
    if (m && +m[1] < first - 1) cache.delete(k);
  }
}

// ---------------------------------------------------------------------
// Things that move
// ---------------------------------------------------------------------
// A crayon line with a fixed wobble, drawable up to a fraction f.
function lineJitter(o, key, n) {
  const k = `_${key}`;
  if (o[k] && o[k].H === H) return o[k];
  const r = rng((o.xc * 1000) | 0);
  const passes = [[1, 0.1], [0.6, 0.18], [0.38, 0.26]].map(([wf, af]) => {
    const ph = [rnd(r, 0, 6), rnd(r, 0, 6), rnd(r, 0, 6)];
    return { wf, off: Array.from({ length: n + 1 }, (_, i) => af * (0.6 * Math.sin(i * 0.35 + ph[0]) + 0.3 * Math.sin(i * 1.1 + ph[1]) + 0.25 * Math.sin(i * 2.7 + ph[2]))) };
  });
  return (o[k] = { H, passes });
}
function drawCrayonLine(Ap, Bp, f, color, w, jit) {
  const n = jit.passes[0].off.length - 1, m = Math.max(1, Math.round(n * clamp(f, 0, 1)));
  const dx = Bp.x - Ap.x, dy = Bp.y - Ap.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const ops = [0.92, 0.7, 0.55];
  jit.passes.forEach((ps, j) => {
    const pts = [];
    for (let i = 0; i <= m; i++) {
      const t = i / n, o = ps.off[i] * w + (j ? 0.5 * u : 0);
      pts.push([Ap.x + dx * t + nx * o, Ap.y + dy * t + ny * o]);
    }
    strokePts(ctx, pts, color, w * ps.wf, ops[j]);
  });
}

function drawConnect(o) {
  const a = A.px(o.x0), b = A.px(o.x1);
  if (b < -60 || a > W + 60) return;
  const Ap = { x: a, y: A.levelY(o.la) }, Bp = { x: b, y: A.levelY(o.lb) };
  const f = o.solved ? 1 : o.match / A.holdOf(o);
  if (!o.solved) {
    // where the line will come: a dotted pencil guide
    const n = Math.max(4, Math.round(Math.hypot(Bp.x - Ap.x, Bp.y - Ap.y) / (22 * u)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (t < f) continue;
      ctx.fillStyle = "rgba(90,90,100,0.55)";
      ctx.beginPath();
      ctx.arc(lerp(Ap.x, Bp.x, t), lerp(Ap.y, Bp.y, t), 3 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    drawArmFeedback(o, Ap, Bp);
  }
  if (f > 0) drawCrayonLine(Ap, Bp, f, C.line, 15 * u, lineJitter(o, "line", 40));
  const pinS = sprite("pin", 50 * u, 50 * u, (g) => pin(g, 25 * u, 25 * u, rng(3)));
  const pulse = o.solved ? 0 : 0.5 + 0.5 * Math.sin(S.time / 220);
  for (const Pp of [Ap, Bp]) {
    if (!o.solved) {
      ctx.strokeStyle = `rgba(224,122,31,${0.5 * (1 - pulse)})`;
      ctx.lineWidth = 4 * u;
      ctx.beginPath();
      ctx.arc(Pp.x, Pp.y, (22 + 22 * pulse) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    blit(pinS, Pp.x - 25 * u, Pp.y - 25 * u);
  }
}

function drawArmFeedback(o, Ap, Bp) {
  if (S.duo && o.owner === 3) {
    // Samen-brug: your REAL reach (outer hand to outer hand, from the camera) at the height of the gap.
    const r = A.reach();
    if (!r) return;
    const ok = A.togetherFits(o);
    const cx = (Ap.x + Bp.x) / 2, cy = (Ap.y + Bp.y) / 2, slope = -Math.tan((r.angle * Math.PI) / 180);
    const P = [[r.x0, cy + (r.x0 - cx) * slope], [r.x1, cy + (r.x1 - cx) * slope]];
    strokePts(ctx, P, ok ? C.line : C.ink, 9 * u, ok ? 0.7 : 0.3, false, [14 * u, 10 * u]);
    for (const [x, y] of P) fillPts(ctx, circle(x, y, 9 * u, 16), ok ? C.line : C.ink, ok ? 0.8 : 0.4);
    return;
  }
  A.ownersOf(o).forEach((i) => {
    const p = A.tracker.players[i];
    if (!p.present || p.arms === null) return;
    const ang = (-p.arms * Math.PI) / 180;
    const cx = (Ap.x + Bp.x) / 2, cy = (Ap.y + Bp.y) / 2, half = Math.hypot(Bp.x - Ap.x, Bp.y - Ap.y) / 2;
    const ok = A.playerFits(i, o);
    strokePts(ctx, [[cx - Math.cos(ang) * half, cy - Math.sin(ang) * half], [cx + Math.cos(ang) * half, cy + Math.sin(ang) * half]], ok ? C.line : C.ink, 7 * u, ok ? 0.6 : 0.22, false, [14 * u, 10 * u]);
  });
}

function drawLadder(o) {
  const a = A.px(o.x0);
  if (a < -100 || a > W + 100) return;
  const f = o.solved ? 1 : o.match / A.holdOf(o);
  if (f <= 0) return;
  const y0 = A.levelY(o.base), y1 = A.levelY(o.top) - 8 * u;
  const lx = a - H * 0.035, w = H * 0.03, top = lerp(y0, y1, clamp(f, 0, 1));
  const jit = lineJitter(o, "ladder", 20);
  for (const x of [lx, lx + w]) drawCrayonLine({ x, y: y0 }, { x, y: y1 }, f, "#8A5A28", 6 * u, jit);
  for (let y = y0 - 14 * u; y > top; y -= 20 * u) drawCrayonLine({ x: lx - 4 * u, y }, { x: lx + w + 4 * u, y }, 1, "#8A5A28", 5 * u, jit);
}

function drawKrabbel() {
  const k = S.k;
  const x = A.px(k.x), ground = A.levelY(k.y);
  const duck = k.state === "duck";
  const walking = ["walk", "duck", "jump"].includes(k.state) && S.phase === "play";
  const step = walking ? Math.sin(k.anim * 14) : 0;
  const sy = duck ? 0.72 : 1;
  const cy = ground - (duck ? 34 : 55) * u;
  if (S.phase === "wait") return; // no drawing yet: no Krabbel (never the placeholder)
  ctx.save();
  if (k.state === "bonk") ctx.translate(Math.sin(S.phaseT * 40) * 3 * Math.max(0, 1 - S.phaseT), 0);
  // The wobbel from the iPad, if there is one. Otherwise the placeholder below.
  // 86u = height of the placeholder (feet to top of the body).
  if (drawWobbelKrabbel(ctx, k, x, ground, 86 * u, walking, S.time)) {
    ctx.restore();
    return;
  }
  const r = rng(1);
  // legs + arms: plain crayon strokes
  const leg = (sx, dir) => strokePts(ctx, [[x + sx * u, cy + 26 * u * sy], [x + (sx + dir * 4) * u + step * 9 * u * (sx < 0 ? 1 : -1), ground]], C.purple, 5 * u);
  leg(-11, -1);
  leg(11, 1);
  const up = k.state === "climb";
  strokePts(ctx, [[x - 28 * u, cy + (up ? -10 : 6) * u], [x - (up ? 34 : 48) * u, cy + (up ? -40 : -6 + step * 4) * u]], C.purple, 5 * u);
  strokePts(ctx, [[x + 28 * u, cy + (up ? -10 : 6) * u], [x + (up ? 30 : 48) * u, cy + (up ? -42 : 16 - step * 4) * u]], C.purple, 5 * u);
  // body (cached scribble)
  const body = sprite("krabbel-body", 90 * u, 90 * u, (g) => {
    const c = 45 * u, bp = circle(c, c, 31 * u, 22);
    hatch(g, bp, C.purpleL, r, { spacing: 6 * u, angle: -30, w: 4.5 * u, op: 0.85 });
    crayon(g, rough(bp, 1.5 * u, r, true), C.purple, 5 * u, r, { closed: true, grain: false });
  });
  ctx.save();
  ctx.translate(x, cy);
  ctx.scale(1, sy);
  ctx.drawImage(body.c, -body.w / 2, -body.h / 2, body.w, body.h);
  ctx.restore();
  // sticker eyes (cut paper, straight top) + pupils
  const look = k.state === "wait" ? 0 : 2;
  const blink = Math.sin(S.time / 900) > 0.985 ? 0.25 : 1;
  for (const [ex, tilt] of [[-11, -1], [11, 1]]) {
    const x0 = x + ex * u, top = cy - 17 * u * sy;
    const shape = [[x0 - 13 * u, top + tilt * u], [x0 + 13 * u, top - tilt * u]];
    for (let i = 1; i < 12; i++) shape.push([x0 + 13 * u * Math.cos((i * Math.PI) / 12), top + 22 * u * sy * Math.sin((i * Math.PI) / 12)]);
    ctx.save();
    ctx.shadowColor = "rgba(40,25,10,0.25)";
    ctx.shadowBlur = 3 * u;
    ctx.shadowOffsetY = 2 * u;
    fillPts(ctx, shape, "#FFFFFF");
    ctx.restore();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(x0 + look * u, top + 9 * u * sy, 6.2 * u, 6.2 * u * blink * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Puntje follows the action: waits at the next obstacle, draws bridges and
// ladders while the child holds the pose, shows jumps and ducks, cheers.
function puntjeTarget(t) {
  const k = S.k, kx = A.px(k.x), kg = A.levelY(k.y);
  const hop = Math.abs(Math.sin(t * 6)) * 16 * u;
  // Puntje stands in front of the Krabbel; a bigger Krabbel (SIZE in hub.js) pushes it further away.
  let T = { x: kx + 80 * u * Math.max(1, KRABBEL_SIZE / 1.25), y: kg - 6 * u - hop, ang: 0, pose: "wave", squash: 1 };
  const page = S.slideT >= 1 ? Math.round(S.camX) : S.slideTo;
  const o = A.nextObstacle();
  if (!o || S.phase === "countdown" || S.phase === "ready") return T;
  const recent = A.allObs().find((ob) => ob.solved && ob._solvedAt && S.time - ob._solvedAt < 900);
  if (recent && recent.t === "connect") {
    const b = A.px(recent.x1);
    return { x: b + 26 * u, y: A.levelY(recent.lb) - Math.abs(Math.sin(t * 9)) * 30 * u, ang: 0, pose: "cheer", squash: 1 };
  }
  if (o.page !== page) return T;
  const a = A.px(o.x0), b = A.px(o.x1), c = A.px(o.xc);
  if (o.t === "connect" && !o.solved) {
    const Ap = { x: a, y: A.levelY(o.la) }, Bp = { x: b, y: A.levelY(o.lb) };
    const f = o.match / A.holdOf(o);
    if (f > 0.02) {
      return { x: lerp(Ap.x, Bp.x, f), y: lerp(Ap.y, Bp.y, f), ang: Math.atan2(Bp.y - Ap.y, Bp.x - Ap.x) + 0.38, pose: "draw", squash: 1 };
    }
    // wait on the far side and point back at the gap (mirrored)
    return { x: Bp.x + 40 * u, y: Bp.y - hop * 0.5, ang: 0, pose: "point", squash: 1, mirror: -1 };
  }
  if (o.t === "ladder") {
    const y0 = A.levelY(o.base), y1 = A.levelY(o.top);
    if (o.solved) return { x: c, y: y1 - 4 * u - Math.abs(Math.sin(t * 8)) * 20 * u, ang: 0, pose: "cheer", squash: 1 };
    const f = o.match / A.holdOf(o);
    if (f > 0.02) return { x: a - H * 0.035 + H * 0.03, y: lerp(y0, y1, f), ang: 0.38, pose: "draw", squash: 1 };
    return { x: a - 70 * u, y: y0 - hop * 0.4, ang: 0, pose: "cheer", squash: 1 };
  }
  const dist = o.stop - k.x;
  if (o.t === "jump" && dist < 0.3) {
    return { x: c + 80 * u, y: A.levelY(o.base) - Math.abs(Math.sin(t * 5)) * 70 * u, ang: 0, pose: "cheer", squash: 1, mirror: -1 };
  }
  if (o.t === "duck" && dist < 0.3) {
    return { x: A.px(o.x1) + 60 * u, y: A.levelY(o.base), ang: 0, pose: "wave", squash: 0.62 + 0.08 * Math.sin(t * 6), mirror: -1 };
  }
  return T;
}
function drawPuntje(dt, t) {
  // remember when obstacles got solved (for the cheer)
  for (const ob of A.allObs()) if (ob.solved && !ob._solvedAt) ob._solvedAt = S.time;
  const T = puntjeTarget(t);
  if (P.x === null || dt > 0.5) Object.assign(P, T);
  const a = 1 - Math.exp(-dt * (T.pose === "draw" ? 18 : 7));
  P.x = lerp(P.x, T.x, a);
  P.y = lerp(P.y, T.y, a);
  P.ang = lerp(P.ang, T.ang, a);
  P.squash = lerp(P.squash, T.squash, a);
  P.pose = T.pose;
  P.mirror = T.mirror || 1;
  const { s, ax, ay } = puntjeSprite(P.pose);
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.rotate(P.ang);
  ctx.scale(P.mirror, P.squash);
  ctx.drawImage(s.c, -ax, -ay, s.w, s.h);
  ctx.restore();
}

// The players' bodies: a soft, natural crayon shape behind the foreground.
function bodyShape(g, b, color) {
  const sh = { x: (b.lSh.x + b.rSh.x) / 2, y: (b.lSh.y + b.rSh.y) / 2 };
  const headR = Math.hypot(b.lSh.x - b.rSh.x, b.lSh.y - b.rSh.y) * 0.42;
  const k = headR / (45 * u);
  const wl = { x: (b.lSh.x + b.lHip.x) / 2, y: (b.lSh.y + b.lHip.y) / 2 }, wr = { x: (b.rSh.x + b.rHip.x) / 2, y: (b.rSh.y + b.rHip.y) / 2 };
  const L = (b.lSh.x < b.rSh.x ? -1 : 1) * u * k; // outward direction for the left side
  const torso = [
    [b.lSh.x + 18 * L, b.lSh.y + 10 * u * k], [b.lSh.x + 6 * L, b.lSh.y - 12 * u * k], [b.lSh.x - 22 * L, b.lSh.y - 22 * u * k],
    [b.rSh.x + 22 * L, b.rSh.y - 22 * u * k], [b.rSh.x - 6 * L, b.rSh.y - 12 * u * k], [b.rSh.x - 18 * L, b.rSh.y + 10 * u * k],
    [wr.x - 10 * L, wr.y], [b.rHip.x - 16 * L, b.rHip.y + 6 * u * k], [b.rHip.x - 10 * L, b.rHip.y + 40 * u * k],
    [b.lHip.x + 10 * L, b.lHip.y + 40 * u * k], [b.lHip.x + 16 * L, b.lHip.y + 6 * u * k], [wl.x + 10 * L, wl.y],
  ];
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  fillPts(g, torso, color);
  g.fillRect(sh.x - 15 * u * k, sh.y - headR - 4 * u * k, 30 * u * k, headR + 4 * u * k);
  const seg = (p0, p1, w) => {
    g.lineWidth = w * u * k;
    g.beginPath();
    g.moveTo(p0.x, p0.y);
    g.lineTo(p1.x, p1.y);
    g.stroke();
  };
  seg(b.lSh, b.lEl, 40);
  seg(b.lEl, b.lWr, 31);
  seg(b.rSh, b.rEl, 40);
  seg(b.rEl, b.rWr, 31);
  for (const w of [b.lWr, b.rWr]) fillPts(g, circle(w.x, w.y, 18 * u * k, 14), color);
  seg({ x: b.lHip.x, y: b.lHip.y + 20 * u * k }, b.lKn, 48);
  seg(b.lKn, b.lAn, 38);
  seg({ x: b.rHip.x, y: b.rHip.y + 20 * u * k }, b.rKn, 48);
  seg(b.rKn, b.rAn, 38);
  const hy = Math.min(b.nose.y, sh.y - headR * 1.1);
  g.beginPath();
  g.ellipse(b.nose.x, hy, headR, headR * 1.08, 0, 0, Math.PI * 2);
  g.fill();
}
function drawBodies() {
  A.tracker.players.forEach((p, i) => {
    if (!p.present || !p.body) return;
    A.silCtx.clearRect(0, 0, W, H);
    bodyShape(A.silCtx, p.body, i === 1 ? C.p2 : C.p1);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(A.silLayer, 0, 0, W, H);
    ctx.restore();
  });
}
function drawPlayerLabels() {
  if (!S.duo) return;
  A.tracker.players.forEach((p, i) => {
    if (!p.present || !p.body) return;
    const b = p.body, sh = (b.lSh.y + b.rSh.y) / 2, headR = Math.hypot(b.lSh.x - b.rSh.x, b.lSh.y - b.rSh.y) * 0.42;
    hudText(String(i + 1), p.cx, Math.max(H * 0.06, Math.min(b.nose.y, sh) - headR * 2.6), H * 0.06, i ? C.p2 : C.p1, "center", 900, true);
  });
}
function drawStepHints() {
  A.tracker.players.forEach((p, i) => {
    if (!p.present) return;
    const o = A.nextObstacle();
    if (!o || o.solved || (o.t !== "connect" && o.t !== "ladder") || !A.ownersOf(o).includes(i)) return;
    if (o.page !== (S.slideT >= 1 ? Math.round(S.camX) : S.slideTo)) return;
    // "Samen" gap: the PAIR must stand over the middle of the gap.
    const together = S.duo && o.owner === 3;
    const ref = together ? A.pairMid() : p.cx;
    if (ref === null) return;
    const dx = A.px(o.xc) - ref;
    if (Math.abs(dx) <= (together ? (o.x1 - o.x0) * W * A.CFG.togetherPosTol : A.posTolFor(o))) return;
    const dir = Math.sign(dx), y = A.FLOOR() + H * 0.09, x = p.cx + dir * H * 0.02;
    const r = rng(i + 5);
    crayon(ctx, [[x - dir * 40 * u, y], [x + dir * 40 * u, y]], C.navy, 9 * u, r, { grain: false });
    crayon(ctx, [[x + dir * 18 * u, y - 22 * u], [x + dir * 42 * u, y], [x + dir * 18 * u, y + 22 * u]], C.navy, 9 * u, r, { grain: false });
  });
}

// --- instructions ------------------------------------------------------------
function promptAnchor(o) {
  const px = A.px(o.xc);
  if (o.t === "connect") return { x: px, y: A.levelY(Math.max(o.la, o.lb)) - H * 0.2 };
  if (o.t === "ladder") return { x: px, y: A.levelY(o.top) - H * 0.13 };
  if (o.t === "jump") return { x: px, y: A.levelY(o.base) - H * 0.25 };
  return { x: px, y: A.levelY(o.base) + H * 0.1 - H * 0.42 };
}
function drawPrompts() {
  if (S.phase !== "play" && S.phase !== "countdown" && S.phase !== "ready") return;
  const next = A.nextObstacle();
  const base = H * 0.085;
  for (const o of A.allObs()) {
    if (o.cleared || o.page < Math.floor(S.camX) || o.page > Math.ceil(S.camX)) continue;
    const isNext = o === next, dist = o.stop - S.k.x, close = isNext && dist < A.CFG.promptAhead;
    let now = false;
    if (isNext && (o.t === "jump" || o.t === "duck")) now = dist / Math.max(S.speed, 0.01) < A.CFG.nowAhead || S.k.state === "wait";
    if (isNext && (o.t === "connect" || o.t === "ladder") && S.k.state === "wait") now = true;
    const scale = close ? 1.35 : isNext ? 1.05 : 0.8;
    const { x, y } = promptAnchor(o);
    const type = o.t === "connect" && S.duo && o.owner === 3 ? "connect2" : o.t;
    const st = sticker(type, now, o.t === "connect" ? A.connectAngle(o) : 0, base * 1.35);
    const k = (scale / 1.35) * (now ? 1 + 0.06 * Math.sin(S.time / 90) : 1);
    ctx.save();
    ctx.globalAlpha = isNext ? 1 : 0.55;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.drawImage(st.c, -st.w / 2, -st.h / 2, st.w, st.h);
    ctx.restore();
    const left = isNext ? A.graceLeft() : null;
    if (left !== null) {
      // grace left: an orange crayon ring that runs out
      const rr = base * scale * 0.98;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = 10 * u;
      ctx.strokeStyle = "rgba(43,43,51,0.15)";
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = left < 0.35 ? C.red : C.line;
      ctx.lineWidth = 11 * u;
      ctx.beginPath();
      ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      ctx.restore();
    }
    if (S.duo) {
      const s = base * scale, label = o.owner === 3 ? "1+2" : String(o.owner);
      const bx = x + s * 0.66, by = y - s * 0.72, bw = (label.length > 1 ? 0.8 : 0.46) * s, bh = 0.4 * s;
      ctx.save();
      ctx.shadowColor = "rgba(40,25,10,0.25)";
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 3 * u;
      fillPts(ctx, rrect(bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2, bh / 2), o.owner === 2 ? C.p2 : o.owner === 1 ? C.p1 : "#FFFFFF");
      ctx.restore();
      hudText(label, bx, by + bh * 0.04, bh * 0.72, o.owner === 3 ? C.navy : "#FFFFFF", "center", 900);
    }
  }
}

function drawEffects() {
  for (const e of S.effects) {
    const x = A.px(e.x), t = e.t / 0.8;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + e.x * 10, d = (24 + 120 * t) * u;
      const cx = x + Math.cos(a) * d, cy = e.y + Math.sin(a) * d;
      const pts = Array.from({ length: 10 }, (_, j) => {
        const rr = (j % 2 ? 4 : 10) * u * (1 - t * 0.4), aa = -Math.PI / 2 + (Math.PI * j) / 5 + t * 3;
        return [cx + rr * Math.cos(aa), cy + rr * Math.sin(aa)];
      });
      strokePts(ctx, pts, [C.yellow, C.line, C.p2, C.green][k % 4], 3.5 * u, 1 - t, true);
    }
  }
}

// --- HUD -------------------------------------------------------------------
function hudText(str, x, y, size, color = C.ink, align = "center", weight = 800, outlineWhite = false) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (outlineWhite) {
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineJoin = "round";
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function tapeSprite(key, w, h, ang) {
  return sprite(`tape-${key}`, w + 40 * u, h + 40 * u, (g) => tape(g, (w + 40 * u) / 2, (h + 40 * u) / 2, w, h, ang));
}
function drawHud() {
  const pad = 43 * u;
  const lt = tapeSprite("label", 340 * u, 50 * u, 1.5);
  blit(lt, 196 * u - lt.w / 2, 46 * u - lt.h / 2);
  hudText(`${S.mode.name} · ${S.duo ? "duo" : "solo"}`, pad, 47 * u, 28 * u, "#4A4A52", "left", 600);
  const tt = tapeSprite("time", 270 * u, 80 * u, -2);
  blit(tt, W - 150 * u - tt.w / 2, 58 * u - tt.h / 2);
  if (S.mode.key === "tijd") hudText(A.fmtTime(S.runTime), W - pad, 60 * u, 58 * u, C.ink, "right", 800);
  if (S.mode.key === "score") {
    hudText(String(S.cleared), W - pad, 56 * u, 66 * u, C.ink, "right", 900);
    hudText(A.fmtTime(Math.max(0, S.mode.maxTime - S.runTime)).replace(/\.\d$/, ""), W - pad, 118 * u, 30 * u, "#5A5A62", "right", 700);
  }
  if (S.mode.course !== "endless") drawProgress();
  hudText("Esc = menu · T = grijs", W - pad, H - 22 * u, 16 * u, "rgba(0,0,0,0.35)", "right", 600);
}
function drawProgress() {
  const n = S.pages.length, y = 62 * u, x0 = W / 2 - 220 * u, x1 = W / 2 + 220 * u, step = (x1 - x0) / (n - 1);
  const cur = clamp(Math.floor(S.k.x), 0, n - 1);
  const line = sprite("progress-line", x1 - x0 + 20 * u, 24 * u, (g) => crayon(g, [[10 * u, 12 * u], [x1 - x0 + 10 * u, 12 * u]], "#8A7F70", 5 * u, rng(2), { op: 0.8 }));
  blit(line, x0 - 10 * u, y - 12 * u);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    let kind = i < cur ? "klaar" : i === cur ? "nu" : "later";
    if (i === n - 1 && i !== cur) kind = "deur";
    const st = sprite(`station-${kind}`, 60 * u, 60 * u, (g) => {
      const r = rng(kind.length + 3), c = 30 * u;
      if (kind === "klaar") {
        paper(g, cut(circle(c, c, 14 * u, 18), r, 0.8 * u), C.green, 0.5);
        outline(g, circle(c, c, 14 * u, 16), C.greenD, r, 3.5 * u, [u, u]);
        crayon(g, [[c - 7 * u, c], [c - 2 * u, c + 6 * u], [c + 8 * u, c - 6 * u]], "#FFFFFF", 3.5 * u, r, { grain: false });
      } else if (kind === "nu") {
        paper(g, cut(circle(c, c, 22 * u, 22), r, 0.8 * u), "#FFFFFF", 0.5);
        outline(g, circle(c, c, 22 * u, 18), "#C9A227", r, 4 * u, [u, u]);
        const bp = circle(c, c + u, 13 * u, 16);
        hatch(g, bp, C.purpleL, r, { spacing: 4 * u, w: 3.5 * u, op: 0.9 });
        crayon(g, bp, C.purple, 3.5 * u, r, { closed: true, grain: false });
        for (const ex of [-5, 5]) {
          fillPts(g, circle(c + ex * u, c - 2 * u, 3.6 * u, 8), "#FFFFFF");
          fillPts(g, circle(c + (ex + 0.6) * u, c - 1.6 * u, 1.8 * u, 6), C.ink);
        }
      } else if (kind === "deur") {
        paper(g, cut(rect(c - 13 * u, c - 19 * u, c + 13 * u, c + 17 * u), r, 0.8 * u, 20 * u), C.navy, 0.5);
        outline(g, rect(c - 13 * u, c - 19 * u, c + 13 * u, c + 17 * u), C.navyD, r, 3.5 * u, [u, u]);
        fillPts(g, circle(c + 6 * u, c + u, 2.6 * u, 8), C.yellow);
      } else {
        paper(g, cut(circle(c, c, 12 * u, 16), r, 0.8 * u), "#FFFFFF", 0.5);
        outline(g, circle(c, c, 12 * u, 14), "#8A7F70", r, 3 * u, [u, u]);
      }
    });
    blit(st, x - 30 * u, y - 30 * u);
  }
}

function drawWait() {
  ctx.fillStyle = "rgba(243,238,227,0.78)";
  ctx.fillRect(0, 0, W, H);
  const [big, small] = waitLines();
  hudText(big, W / 2, H * 0.42, H * 0.06, C.ink, "center", 900);
  hudText(small, W / 2, H * 0.51, H * 0.03, "#8A7F70", "center", 600);
}
function drawReady() {
  ctx.fillStyle = "rgba(243,238,227,0.78)";
  ctx.fillRect(0, 0, W, H);
  const need = S.duo ? 2 : 1, have = A.presentCount();
  hudText(S.duo ? "Ga met twee voor de camera staan" : "Ga voor de camera staan", W / 2, H * 0.4, H * 0.06, C.ink, "center", 900);
  hudText(`${Math.min(have, need)} / ${need}`, W / 2, H * 0.49, H * 0.05, C.navy, "center", 800);
  hudText("Spatie = toch starten", W / 2, H * 0.57, H * 0.024, "#8A7F70", "center", 600);
}
// --- short explanation before the countdown (three paper cards) ---------------
function drawIntro() {
  ctx.fillStyle = "rgba(243,238,227,0.9)";
  ctx.fillRect(0, 0, W, H);
  const t = S.phaseT;
  hudText("Zo speel je", W / 2, H * 0.12, H * 0.07, C.ink, "center", 900);
  const cards = [
    { pics: [S.duo ? "connect2" : "connect"], label: S.duo ? "Hand in hand = brug" : "Armen wijd = brug", step: !S.duo, sub: S.duo ? "Samen over het gat, raak de 2 bolletjes" : "Ga erbij staan" },
    { pics: ["ladder"], label: "Armen omhoog = ladder", step: true, sub: "Ga erbij staan" },
    { pics: ["jump", "duck"], label: "Spring of buk" },
  ];
  const cw = Math.min(W * 0.27, H * 0.52), ch = cw * 1.14, gap = cw * 0.12;
  const x0 = W / 2 - (3 * cw + 2 * gap) / 2, y0 = H * 0.21;
  // stepping: stand next to the obstacle, step in front of it, do the gesture, then it gets drawn
  const sT = t % 2.8;
  const move = sT < 0.6 ? 0 : sT < 1.1 ? (1 - Math.cos(((sT - 0.6) / 0.5) * Math.PI)) / 2 : 1;
  const armed = sT >= 1.1, grow = clamp((sT - 1.4) / 1.0, 0, 1), arrowOn = sT < 1.1;
  // a small soft body in the player's colour, like in the game
  const figure = (fx, footY, h, arms) => {
    const col = "rgba(240,138,110,0.6)", hr = h * 0.11, sh = footY - h * 0.72, hip = footY - h * 0.42;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = h * 0.13;
    ctx.beginPath();
    ctx.moveTo(fx, sh);
    ctx.lineTo(fx, hip);
    ctx.stroke();
    ctx.lineWidth = h * 0.09;
    ctx.beginPath();
    ctx.moveTo(fx - h * 0.04, hip);
    ctx.lineTo(fx - h * 0.08, footY);
    ctx.moveTo(fx + h * 0.04, hip);
    ctx.lineTo(fx + h * 0.08, footY);
    const aw = h * 0.36;
    if (arms === "side") {
      ctx.moveTo(fx - aw, sh + h * 0.02);
      ctx.lineTo(fx + aw, sh + h * 0.02);
    } else if (arms === "up") {
      ctx.moveTo(fx - h * 0.06, sh);
      ctx.lineTo(fx - h * 0.12, sh - h * 0.3);
      ctx.moveTo(fx + h * 0.06, sh);
      ctx.lineTo(fx + h * 0.12, sh - h * 0.3);
    } else {
      ctx.moveTo(fx - h * 0.06, sh);
      ctx.lineTo(fx - h * 0.1, sh + h * 0.28);
      ctx.moveTo(fx + h * 0.06, sh);
      ctx.lineTo(fx + h * 0.1, sh + h * 0.28);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(fx, sh - hr * 1.3, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const arrow = (ax, ay, len) => {
    if (!arrowOn || Math.sin(t * 12) < -0.3) return;
    strokePts(ctx, [[ax, ay], [ax + len, ay]], C.navy, len * 0.18);
    strokePts(ctx, [[ax + len * 0.6, ay - len * 0.32], [ax + len, ay], [ax + len * 0.6, ay + len * 0.32]], C.navy, len * 0.18);
  };
  cards.forEach((c, i) => {
    const x = x0 + i * (cw + gap), appear = clamp((t - i * 0.35) / 0.4, 0, 1);
    const rot = [-1.5, 1, -0.8][i] * (Math.PI / 180);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(x + cw / 2, y0 + ch / 2 + (1 - appear) * H * 0.03);
    ctx.rotate(rot);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.save();
    ctx.shadowColor = "rgba(40,25,10,0.28)";
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 6 * u;
    fillPts(ctx, rrect(0, 0, cw, ch, cw * 0.06), "#FFFFFF");
    ctx.restore();
    const tp = tapeSprite(`intro-${i}`, cw * 0.36, 30 * u, [-4, 3, -2][i]);
    blit(tp, cw / 2 - tp.w / 2, -tp.h / 2);
    hudText(String(i + 1), cw * 0.1, cw * 0.11, cw * 0.09, C.navy, "center", 900);
    const pic = c.pics[Math.floor(t / 1.2) % c.pics.length];
    const st = sticker(pic, true, 0, H * 0.085 * 1.35);
    const k = (cw * 0.42) / st.w, bob = Math.sin(t * 4 + i) * cw * 0.015;
    ctx.save();
    ctx.translate(cw / 2, ch * 0.25 + bob);
    ctx.scale(k * 1.6, k * 1.6);
    ctx.drawImage(st.c, -st.w / 2, -st.h / 2, st.w, st.h);
    ctx.restore();
    const gy = ch * 0.68, fh = cw * 0.3;
    const ground = (a, b) => {
      fillPts(ctx, rect(a, gy, b, gy + cw * 0.06), C.green);
      strokePts(ctx, [[a, gy + 2 * u], [b, gy + 2 * u]], C.greenD, 4 * u);
    };
    const { s: ps, ax, ay } = puntjeSprite(i === 0 ? "draw" : "cheer");
    const pk = (cw * 0.2) / ps.h;
    const drawP = (px, py, ang = 0, sq = 1) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.scale(pk, pk * sq);
      ctx.drawImage(ps.c, -ax, -ay, ps.w, ps.h);
      ctx.restore();
    };
    if (i === 0) {
      const a = cw * 0.3, b = cw * 0.7;
      let f = clamp((t % 1.8) / 1.4, 0, 1);
      if (c.step) {
        const fx = lerp(cw * 0.15, (a + b) / 2, move);
        figure(fx, gy + cw * 0.05, fh, armed ? "side" : "down");
        arrow(fx + fh * 0.22, gy - fh * 0.55, fh * 0.42);
        f = grow;
      }
      ground(cw * 0.06, a);
      ground(b, cw * 0.94);
      if (f > 0) strokePts(ctx, [[a, gy], [lerp(a, b, f), gy]], C.line, 9 * u);
      for (const px of [a, b]) fillPts(ctx, circle(px, gy, 8 * u, 14), C.orange);
      if (f > 0 && f < 1) drawP(lerp(a, b, f), gy, 0.38);
      else if (f >= 1) drawP(b + cw * 0.08, gy - Math.abs(Math.sin(t * 8)) * cw * 0.04);
    } else if (i === 1) {
      const wx = cw * 0.62, top = gy - cw * 0.27;
      const fx = lerp(cw * 0.2, wx + cw * 0.06, move);
      ground(cw * 0.06, cw * 0.94);
      fillPts(ctx, rect(wx, top, wx + cw * 0.12, gy), C.yellow);
      strokePts(ctx, rect(wx, top, wx + cw * 0.12, gy), "#8A6512", 3 * u, 1, true);
      figure(fx, gy + cw * 0.05, fh, armed ? "up" : "down");
      arrow(fx + fh * 0.22, gy - fh * 0.55, fh * 0.42);
      const lx = wx - cw * 0.1, up = lerp(gy, top, grow);
      if (grow > 0) {
        strokePts(ctx, [[lx, gy], [lx, up]], "#8A5A28", 4 * u);
        strokePts(ctx, [[lx + cw * 0.07, gy], [lx + cw * 0.07, up]], "#8A5A28", 4 * u);
        for (let y = gy - cw * 0.04; y > up; y -= cw * 0.05) strokePts(ctx, [[lx, y], [lx + cw * 0.07, y]], "#8A5A28", 3.5 * u);
      }
      if (grow >= 1) drawP(wx + cw * 0.06, top - Math.abs(Math.sin(t * 8)) * cw * 0.04);
    } else {
      ground(cw * 0.06, cw * 0.94);
      if (pic === "jump") {
        fillPts(ctx, rrect(cw * 0.44, gy - cw * 0.08, cw * 0.56, gy, 4 * u), C.pink);
        fillPts(ctx, rrect(cw * 0.44, gy - cw * 0.08, cw * 0.56, gy - cw * 0.045, 4 * u), C.blue);
        drawP(cw * 0.3, gy - Math.abs(Math.sin(t * 5)) * cw * 0.12);
      } else {
        const by = gy - cw * 0.13;
        fillPts(ctx, rect(cw * 0.45, ch * 0.46, cw * 0.6, by - cw * 0.04), C.purple);
        fillPts(ctx, [[cw * 0.45, by - cw * 0.04], [cw * 0.6, by - cw * 0.04], [cw * 0.525, by]], C.wood);
        drawP(cw * 0.3, gy, 0, 0.62 + 0.08 * Math.sin(t * 6));
      }
    }
    if (c.sub) hudText(c.sub, cw / 2, ch * 0.81, cw * 0.06, "#6A6A72", "center", 700);
    hudText(c.label, cw / 2, ch * 0.91, cw * 0.075, C.ink, "center", 800);
    ctx.restore();
  });
  const bw = W * 0.3, by = H * 0.87, f = clamp(t / A.CFG.introTime, 0, 1);
  strokePts(ctx, [[W / 2 - bw / 2, by], [W / 2 + bw / 2, by]], "rgba(43,43,51,0.15)", 10 * u);
  strokePts(ctx, [[W / 2 - bw / 2, by], [W / 2 - bw / 2 + bw * f, by]], C.line, 10 * u);
  hudText("Spatie = meteen starten", W / 2, H * 0.93, H * 0.024, "#8A7F70", "center", 600);
}

function drawCountdown() {
  const n = 3 - Math.floor(S.phaseT), f = S.phaseT % 1;
  const s = H * (0.24 - f * 0.05);
  ctx.save();
  ctx.globalAlpha = 1 - f * 0.5;
  ctx.shadowColor = "rgba(40,25,10,0.3)";
  ctx.shadowBlur = 10 * u;
  ctx.shadowOffsetY = 6 * u;
  fillPts(ctx, circle(W / 2, H * 0.4, s * 0.62, 40), "#FFFFFF");
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 1 - f * 0.5;
  hudText(String(n), W / 2, H * 0.405, s, C.line, "center", 900);
  ctx.restore();
}

function drawGrain() {
  const im = TEX.korrel;
  if (!im.complete || !im.naturalWidth) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.45;
  const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
  ctx.drawImage(im, 0, 0, im.naturalWidth * s, im.naturalHeight * s);
  ctx.restore();
}

// ---------------------------------------------------------------------
// Entry point, called by main.js every frame
// ---------------------------------------------------------------------
export function drawStyled(api) {
  A = api;
  ctx = api.ctx;
  W = api.W;
  H = api.H;
  S = api.S;
  u = H / 1080;
  const key = `${Math.round(W)}x${Math.round(H)}`;
  if (key !== cacheKey) {
    cache.clear();
    cacheKey = key;
  }
  if (S.pages !== lastPages) {
    for (const k of [...cache.keys()]) if (k.startsWith("page-")) cache.delete(k);
    lastPages = S.pages;
    P.x = null;
  }
  const t = S.time / 1000, dt = Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;

  drawPaperBg();
  drawSky(t);
  drawHills("far", 0.12);
  drawHills("near", 0.25);
  drawBodies();
  drawPages();
  for (const o of A.allObs()) {
    if (o.t === "connect") drawConnect(o);
    else if (o.t === "ladder") drawLadder(o);
  }
  drawKrabbel();
  drawPrompts();
  if (S.phase !== "fail") drawPuntje(dt, t);
  drawEffects();
  drawStepHints();
  drawPlayerLabels();
  drawGrain();
  drawHud();
  if (S.phase === "wait") drawWait();
  if (S.phase === "ready") drawReady();
  if (S.phase === "intro") drawIntro();
  if (S.phase === "countdown") drawCountdown();
}
