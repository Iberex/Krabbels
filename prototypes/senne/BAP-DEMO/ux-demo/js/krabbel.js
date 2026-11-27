// =====================================================================
// Krabbel = de tekening van het kind + geplakte oogjes + stokjes.
// Zonder tekening gebruiken we een voorbeeldtekening (een krabbel van "een ander kind").
// =====================================================================
import { K, oogjes, clamp, easeOut } from "./kit.js?v=20261117g";

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Voorbeeldtekening: een bibberige vorm met wat krassen, zoals een kind tekent.
export function voorbeeld(seed = 1, color = K.inkt) {
  const r = rng(seed * 7919);
  const W = 300, H = 260, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.strokeStyle = color; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
  const n = 9 + Math.floor(r() * 5), pts = [];
  const rx = 95 + r() * 30, ry = 80 + r() * 30;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.75 + r() * 0.4;
    pts.push([W / 2 + Math.cos(a) * rx * k, H / 2 + 10 + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  g.closePath(); g.stroke();
  // a few scribbles inside (hair, spots, a mouth)
  g.lineWidth = 6;
  for (let i = 0; i < 3; i++) {
    const x = W / 2 + (r() - 0.5) * 120, y = 40 + r() * 30;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y - 25 - r() * 15); g.stroke();
  }
  g.beginPath(); g.arc(W / 2, H / 2 + 45, 22, 0.2, Math.PI - 0.2); g.stroke();
  return { img: c, eyes: [{ x: W / 2, y: H / 2 - 10, type: ["rond", "groot", "klein", "slaperig"][seed % 4] }], w: W, h: H };
}

// Uit een dataURL (van de iPad) een Krabbel maken.
export function vanTekening(data) {
  const im = new Image();
  im.src = data.img;
  return { img: im, eyes: data.eyes, w: data.w, h: data.h };
}

// --- emotion in the stuck-on eyes (Krabbel has no mouth: the eyes and the pose tell it) ----------
// brow: raise (-1..1) · tilt: + = worried, - = angry · eye: size · pupil: size · happy: ^ ^
export const MOODS = {
  neutraal: { brow: 0, tilt: 0, eye: 1, pupil: 1 },
  blij: { brow: 0.6, tilt: 0, eye: 1.05, pupil: 1.05 },
  juichen: { brow: 0.9, tilt: 0, eye: 1, pupil: 1, happy: 1 },
  verrast: { brow: 1, tilt: 0, eye: 1.25, pupil: 0.55 },
  bang: { brow: 0.7, tilt: 1, eye: 1.18, pupil: 0.5 },
  oei: { brow: 0.2, tilt: 0.9, eye: 0.95, pupil: 0.9, lookY: 0.5 },
  ongeduldig: { brow: -0.4, tilt: -0.8, eye: 0.9, pupil: 1 },
  nieuwsgierig: { brow: 0.5, tilt: 0, eye: 1.1, pupil: 1, asym: 1 },
  slaperig: { brow: -0.2, tilt: 0.2, eye: 1, pupil: 1, lid: 0.5 },
};
// default mood + where the pupils look, per pose
const POSE_MOOD = { staan: "neutraal", lopen: "neutraal", omkijken: "blij", wiebelen: "ongeduldig", springen: "verrast", juichen: "juichen", zwaaien: "blij", bukken: "bang", klimmen: "neutraal", zitten: "oei" };

function oogMetGevoel(g, x, y, s, type, m, blink, lookX, lookY) {
  const base = (type === "groot" ? 15 : type === "klein" ? 9 : 12) * s, r = base * m.eye;
  for (const side of [-1, 1]) {
    const ex = x + side * base * 1.3;
    g.save(); g.translate(ex, y);
    if (m.happy) { // ^ ^
      g.lineWidth = 3 * s; g.strokeStyle = "#4a4a4f"; g.lineCap = "round";
      g.beginPath(); g.moveTo(-r * 0.8, r * 0.25); g.lineTo(0, -r * 0.5); g.lineTo(r * 0.8, r * 0.25); g.stroke();
    } else {
      const open = Math.max(0.08, blink * (1 - (m.lid || 0) * 0.5));
      g.save(); g.scale(1, open);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 2.6 * s; g.strokeStyle = "#4a4a4f"; g.stroke();
      const pr = r * 0.45 * m.pupil, px = lookX * (r - pr) * 0.8, py = (lookY + (m.lookY || 0)) * (r - pr) * 0.8;
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fillStyle = "#4a4a4f"; g.fill();
      g.beginPath(); g.arc(px + pr * 0.35, py - pr * 0.35, pr * 0.3, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
      g.restore();
      if (m.lid) { g.fillStyle = "#4a4a4f"; g.fillRect(-r, -r, r * 2, r * m.lid * 0.9); }
    }
    // brow: part of the sticker
    const raise = m.asym ? (side < 0 ? m.brow + 0.5 : m.brow - 0.3) : m.brow;
    const by = -r - 5 * s - raise * 5 * s, tilt = m.tilt * 5 * s * side;
    g.lineWidth = 3.2 * s; g.strokeStyle = "#4a4a4f"; g.lineCap = "round";
    g.beginPath(); g.moveTo(-r * 0.75, by + tilt); g.lineTo(r * 0.75, by - tilt); g.stroke();
    g.restore();
  }
}

// Teken Krabbel met de voeten op (x, y). h = hoogte van het lijf.
// state: staan | lopen | omkijken | wiebelen | springen | juichen | zwaaien | bukken | klimmen | zitten
// mood: een van MOODS (anders hoort er een bij de houding) · look: [x, y] waar de pupillen kijken (-1..1)
export function krabbel(g, kr, x, y, h, state = "staan", t = 0, { alpha = 1, flip = false, lift = 0, scale = 1, mood = null, look = null } = {}) {
  if (!kr) return;
  const H = h * scale, legL = H * 0.32;
  const bodyH = H, bodyW = (kr.w / kr.h) * bodyH;
  const walk = state === "lopen" ? Math.sin(t * 12) : 0;
  const duck = state === "bukken" ? 0.7 : state === "zitten" ? 0.85 : 1;
  const hop = state === "juichen" ? Math.abs(Math.sin(t * 7)) * H * 0.25 : state === "lopen" ? Math.abs(walk) * H * 0.04 : 0;
  const wob = state === "wiebelen" ? Math.sin(t * 16) * 0.12 : state === "lopen" ? walk * 0.04 : 0;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y - lift - hop);
  if (flip !== (state === "omkijken")) g.scale(-1, 1);
  // legs
  g.strokeStyle = "#4a4a4f"; g.lineWidth = Math.max(3, H * 0.045); g.lineCap = "round";
  const legTop = -legL * duck;
  if (state !== "zitten") {
    g.beginPath();
    g.moveTo(-bodyW * 0.14, legTop); g.lineTo(-bodyW * 0.14 + walk * H * 0.12 - (state === "springen" ? H * 0.06 : 0), 0);
    g.moveTo(bodyW * 0.14, legTop); g.lineTo(bodyW * 0.14 - walk * H * 0.12 + (state === "springen" ? H * 0.06 : 0), 0);
    g.stroke();
  }
  // body (the drawing)
  g.save();
  g.translate(0, legTop - bodyH * duck * 0.5 + bodyH * 0.06);
  g.rotate(wob);
  g.scale(1, duck);
  g.drawImage(kr.img, -bodyW / 2, -bodyH / 2, bodyW, bodyH);
  // arms
  const armY = bodyH * 0.05, ax = bodyW * 0.46;
  const up = state === "juichen" || state === "klimmen";
  const wave = state === "zwaaien" ? Math.sin(t * 10) * 0.5 : 0;
  g.beginPath();
  g.moveTo(-ax, armY); g.lineTo(-ax - H * 0.2, armY + (up ? -H * 0.32 : H * 0.12));
  g.moveTo(ax, armY);
  if (state === "zwaaien") g.lineTo(ax + Math.cos(-1.2 + wave) * H * 0.3, armY + Math.sin(-1.2 + wave) * H * 0.3);
  else g.lineTo(ax + H * 0.2, armY + (up ? -H * 0.32 : H * 0.12));
  g.stroke();
  // eyes (with brows): mood from the option or from the pose; pupils look around when idle
  const m = MOODS[mood || POSE_MOOD[state] || "neutraal"] || MOODS.neutraal;
  const blinkP = (t * 0.7 + (kr.w % 7) * 0.13) % 3.2, blink = blinkP < 0.12 ? 0.12 : 1;
  let lx, ly;
  if (look) [lx, ly] = look;
  else if (state === "omkijken" || state === "zwaaien") [lx, ly] = [-0.2, 0.25]; // looking at you
  else if (state === "lopen") [lx, ly] = [0.8, 0];
  else if (state === "bukken") [lx, ly] = [0, -0.8];
  else [lx, ly] = [Math.sin(t * 0.8 + kr.w) * 0.7, Math.sin(t * 0.53) * 0.25];
  for (const e of kr.eyes || []) {
    const ex = (e.x / kr.w - 0.5) * bodyW, ey = (e.y / kr.h - 0.5) * bodyH;
    oogMetGevoel(g, ex, ey, bodyH / 160, e.type, m, blink, lx, ly);
  }
  g.restore();
  g.restore();
}

// Een "Pok!": korte streepjes die uitwaaieren. t = 0..1
export function pok(g, x, y, r, t) {
  const k = easeOut(t), a = 1 - clamp((t - 0.4) / 0.6, 0, 1);
  g.save();
  g.globalAlpha *= a;
  g.strokeStyle = K.inkt; g.lineWidth = 8; g.lineCap = "round";
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(ang) * r * (0.6 + 0.6 * k), y + Math.sin(ang) * r * (0.6 + 0.6 * k));
    g.lineTo(x + Math.cos(ang) * r * (0.8 + 0.9 * k), y + Math.sin(ang) * r * (0.8 + 0.9 * k));
    g.stroke();
  }
  g.restore();
}
