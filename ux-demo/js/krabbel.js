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

// Teken Krabbel met de voeten op (x, y). h = hoogte van het lijf.
// state: staan | lopen | omkijken | wiebelen | springen | juichen | zwaaien | bukken | klimmen | zitten
export function krabbel(g, kr, x, y, h, state = "staan", t = 0, { alpha = 1, flip = false, lift = 0, scale = 1 } = {}) {
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
  // eyes
  const blink = (t * 0.7) % 3.2 < 0.12 ? 0.15 : 1;
  const look = state === "omkijken" ? -1 : 0.4;
  for (const e of kr.eyes || []) {
    const ex = (e.x / kr.w - 0.5) * bodyW, ey = (e.y / kr.h - 0.5) * bodyH;
    oogjes(g, ex, ey, (bodyH / 160), e.type, blink, look);
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
