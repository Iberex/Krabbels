// =====================================================================
// Krabbels · UX-demo 2: de hele ervaring als film, in één overzicht.
// Muur (beamer), twee iPads, monitor, ledstrips. Basiskleuren, geen stijl.
// Volgens "Schermen, duidelijk uitgelegd" van Senne (17/11).
// =====================================================================
import { K, rr, text, line, dot, clamp, lerp, ease, easeOut, easeBack, tikHier, oogjes, sterretjes, verbindpunt, doellijn, ring } from "./kit.js?v=20261117g";
import { gebaar, bordje } from "./rig.js?v=20261117g";
import { drawPuntje, animate, BASE, HOVER } from "./puntje.js?v=20261117g";
import { krabbel } from "./krabbel.js?v=20261117g";

// --- colours (basic, no style) -----------------------------------------------------------
export const C = {
  room: "#e9e6df", floor: "#d6d1c7", paper: "#fffdf7", ink: "#3a3a3a",
  grass: "#bfe3ae", grassLine: "#74b85e", sky: "#d9ecff",
  block: "#f6b06e", blockLine: "#c9803f", door: "#b47b4f",
  kid: "#3b7bff", kidSoft: "#3b7bff", led: "#ffb800", ledOff: "#bdb6a8",
  puntje: { body: "#ffd84d", cap: "#ff9db0", cone: "#f2c98b" },
  drawing: ["#e8553d", "#8a5cf6"], others: ["#2e9e5b", "#e08a1e", "#d64f8c", "#3b7bff", "#7a7a7a", "#1f9bb5"],
};

// --- the room: where every device is (room = 1920 × 1080) ----------------------------------------
export const WALL = { x: 300, y: 40, w: 1320, h: 742, vw: 1920, vh: 1080 };
export const IPADS = [{ x: 580, y: 818, w: 240, h: 180, vw: 1366, vh: 1024 }, { x: 1100, y: 818, w: 240, h: 180, vw: 1366, vh: 1024 }];
export const MON = { x: 1662, y: 520, w: 236, h: 133, vw: 1920, vh: 1080 };
export const STRIPS = {
  ipad0: [[700, 1060], [860, 790]], // from the iPad (0) to the wall (1)
  ipad1: [[1220, 1060], [1060, 790]],
  mon: [[1622, 760], [1702, 900], [1780, 1060]], // from the wall (0) to the monitor (1)
};
export const KID_X = [700, 1220];

const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const G = 820; // ground on the wall (wall coords)
const OX = 1060; // where the obstacle stands on the wall

// --- drawings (the children's Krabbels) ---------------------------------------------------------
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// A drawing as strokes, so it can be drawn bit by bit on the iPad.
export function tekening(seed, color) {
  const r = rng(seed * 7919), W = 300, H = 260, n = 40, body = [];
  const rx = 100 + r() * 20, ry = 82 + r() * 18, wob = [r() * 0.15, r() * 0.12, r() * 6];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 + wob[0] * Math.sin(a * 3 + wob[2]) + wob[1] * Math.sin(a * 5); body.push([W / 2 + Math.cos(a) * rx * k, H / 2 + 14 + Math.sin(a) * ry * k]); }
  const hair = [[[W / 2 - 40, 62], [W / 2 - 58, 22]], [[W / 2 + 6, 56], [W / 2 + 10, 14]], [[W / 2 + 48, 64], [W / 2 + 70, 26]]];
  const mouth = []; for (let i = 0; i <= 10; i++) { const a = 0.25 + (i / 10) * (Math.PI - 0.5); mouth.push([W / 2 + Math.cos(a) * 26, H / 2 + 46 + Math.sin(a) * 14]); }
  const strokes = [body, ...hair, mouth];
  const len = (p) => p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
  return { strokes, lens: strokes.map(len), total: strokes.map(len).reduce((a, b) => a + b, 0), color, W, H, eyes: [{ x: W / 2 - 4, y: H / 2 - 14, type: seed % 2 ? "groot" : "rond" }] };
}
// Draw the first fraction f of a drawing (0..1). Returns the point where the "pen" is.
export function tekenDeel(g, d, f, x, y, s) {
  let left = d.total * clamp(f, 0, 1), tip = null;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = d.color; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
  d.strokes.forEach((p, k) => {
    if (left <= 0) return;
    g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (left >= L) { g.lineTo(p[i][0], p[i][1]); left -= L; tip = p[i]; }
      else { const u = left / L, q = [lerp(p[i - 1][0], p[i][0], u), lerp(p[i - 1][1], p[i][1], u)]; g.lineTo(q[0], q[1]); tip = q; left = 0; break; }
    }
    g.stroke();
  });
  g.restore();
  return tip ? [x + tip[0] * s, y + tip[1] * s] : [x, y];
}
// The finished drawing as a Krabbel (for the wall and the monitor).
export function alsKrabbel(d) {
  const c = document.createElement("canvas"); c.width = d.W; c.height = d.H;
  tekenDeel(c.getContext("2d"), d, 1, 0, 0, 1);
  return { img: c, eyes: d.eyes, w: d.W, h: d.H };
}
const OTHERS = [11, 12, 13, 14, 15, 16].map((n, i) => alsKrabbel(tekening(n, C.others[i])));
export const DRAW = [tekening(3, C.drawing[0]), tekening(8, C.drawing[1])];
export const MINE = DRAW.map(alsKrabbel);

// --- small helpers ------------------------------------------------------------------------------
const PC = { colors: C.puntje };
function puntjePose(g, pose, x, y, s = 1, opts = {}) { drawPuntje(g, { ...BASE, ...pose }, x, y, s, { ...PC, ...opts }); }
function puntjeAnim(g, name, t, x, y, s = 1, opts = {}) { return animate(g, name, t, x, y, s, { ...PC, ...opts }); }
function bubble(g, x, y, w, h, tailX, tailY) {
  g.save();
  rr(g, x, y, w, h, 34); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke();
  g.beginPath(); g.moveTo(x + w * 0.5 - 22, y + h - 2); g.lineTo(tailX, tailY); g.lineTo(x + w * 0.5 + 22, y + h - 2); g.closePath(); g.fillStyle = "#fff"; g.fill(); g.stroke();
  g.fillRect(x + w * 0.5 - 20, y + h - 8, 40, 10);
  g.restore();
}
function logo(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  text(g, "Krabbels", 0, 0, 54, C.ink, "left", 900);
  oogjes(g, 268, -6, 0.9, "rond");
  g.restore();
}
function lamp(g, x, y, a) {
  g.save(); g.globalAlpha = a;
  for (let i = 0; i < 8; i++) { const r = (i / 8) * Math.PI * 2; line(g, [x + Math.cos(r) * 34, y + Math.sin(r) * 34, x + Math.cos(r) * 46, y + Math.sin(r) * 46], C.led, 5); }
  dot(g, x, y, 24, C.led); g.lineWidth = 4; g.strokeStyle = C.ink; g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#aaa"; g.fillRect(x - 10, y + 22, 20, 12);
  g.restore();
}
function vraagteken(g, x, y, a) { g.save(); g.globalAlpha = a; text(g, "?", x, y, 70, C.ink, "center", 900); g.restore(); }
function glinsters(g, x, y, r, t) {
  for (let i = 0; i < 9; i++) {
    const a = t * 2.2 + i * 0.7, rr2 = r * (0.6 + 0.5 * Math.sin(i * 3.1 + t * 3));
    const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2 * 0.8, k = 0.5 + 0.5 * Math.sin(t * 9 + i);
    g.save(); g.translate(px, py); g.rotate(t * 2 + i); g.fillStyle = C.led;
    g.beginPath(); for (let j = 0; j < 8; j++) { const rad = j % 2 ? 4 : 14 * k + 4; const an = (j / 8) * Math.PI * 2; g[j ? "lineTo" : "moveTo"](Math.cos(an) * rad, Math.sin(an) * rad); } g.closePath(); g.fill();
    g.restore();
  }
}

// --- the Krabbelwereld (monitor, and inside the door in the speech bubble) -------------------------------------
export function wereld(g, W, H, t, { mine = null, mineT = null } = {}) {
  g.fillStyle = C.sky; g.fillRect(0, 0, W, H);
  g.fillStyle = "#cfe8c2"; g.beginPath(); g.ellipse(W * 0.25, H * 0.8, W * 0.4, H * 0.25, 0, 0, Math.PI * 2); g.ellipse(W * 0.8, H * 0.82, W * 0.35, H * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.grass; g.fillRect(0, H * 0.78, W, H * 0.22);
  g.fillStyle = C.grassLine; g.fillRect(0, H * 0.78, W, H * 0.008);
  dot(g, W * 0.86, H * 0.16, H * 0.07, "#ffe28a");
  const gy = H * 0.8, kh = H * 0.11;
  OTHERS.forEach((kr, i) => {
    const cyc = 6 + i * 0.7, u = ((t + i * 1.9) % cyc) / cyc;
    const a = (t * (0.05 + i * 0.01) * 6) + i * 2.3, lane = W * (0.12 + 0.15 * i);
    let x = lane + Math.sin(a) * W * 0.06, st = "lopen", flip = Math.cos(a) < 0, extra = null;
    if (u > 0.68) { st = ["zwaaien", "zitten", "wiebelen", "juichen", "zwaaien", "zitten"][i]; if (st === "wiebelen") extra = "zucht"; }
    krabbel(g, kr, x, gy + (i % 2) * H * 0.04, kh, st, t + i, { flip });
    if (extra) { g.save(); g.globalAlpha = 0.6; dot(g, x + kh * 0.6, gy - kh * 1.5, kh * 0.12, "#fff"); dot(g, x + kh * 0.8, gy - kh * 1.7, kh * 0.08, "#fff"); g.restore(); }
  });
  if (mine && mineT !== null) {
    const u = seg(mineT, 0, 2), x = lerp(-W * 0.08, W * 0.42, ease(u)) + (mineT > 4 ? Math.sin((mineT - 4) * 0.8) * W * 0.12 : 0);
    const st = mineT < 2 ? "lopen" : mineT < 4 ? "zwaaien" : "lopen";
    krabbel(g, mine, x, gy + H * 0.02, kh * 1.15, st, mineT);
  }
}

// --- the wall: paper world --------------------------------------------------------------------------------
function papier(g) { g.fillStyle = C.paper; g.fillRect(0, 0, 1920, 1080); }
function grond(g, pieces = [[0, 1920, G]]) {
  for (const [x0, x1, y] of pieces) {
    g.fillStyle = C.grass; g.fillRect(x0, y, x1 - x0, 1080 - y);
    g.fillStyle = C.grassLine; g.fillRect(x0, y, x1 - x0, 6);
  }
}
function rondlopers(g, t, n = 4, dim = 1) {
  g.save(); g.globalAlpha *= dim;
  for (let i = 0; i < n; i++) {
    const a = t * (0.3 + i * 0.07) + i * 2.1, lane = 380 + i * 360;
    const st = Math.sin(t * 0.5 + i * 2) > 0.85 ? "zwaaien" : "lopen";
    krabbel(g, OTHERS[i], lane + Math.sin(a) * 150, G + 4, 92, st, t + i, { flip: Math.cos(a) < 0 });
  }
  g.restore();
}
function barst(g, x, y, a) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a; g.strokeStyle = "#6f8aa8"; g.lineWidth = 4; g.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const r = (i / 7) * Math.PI * 2 + 0.3, L = 60 + (i % 3) * 30;
    g.beginPath(); g.moveTo(x, y); const mx = x + Math.cos(r) * L * 0.55, my = y + Math.sin(r) * L * 0.55; g.lineTo(mx, my); g.lineTo(x + Math.cos(r + 0.15) * L, y + Math.sin(r + 0.15) * L); g.stroke();
    g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(r + 0.9) * 22, my + Math.sin(r + 0.9) * 22); g.stroke();
  }
  g.restore();
}
// the children's soft silhouettes behind the landscape
function silhouet(g, E, name, gt, angle = 0, alpha = 1, i = null) {
  const xs = E.duo ? [OX - 330, OX + 330] : [OX];
  g.save(); g.globalAlpha *= 0.2 * alpha;
  if (name === "hand in hand") gebaar(g, "hand in hand", OX, 610, 900, C.kidSoft, gt, angle);
  else xs.forEach((x, k) => gebaar(g, i === null || i === k ? name || "staan" : "staan", x, 640, 780, C.kidSoft, i === null || i === k ? gt : null, angle));
  g.restore();
}

// --- obstacles on the wall -------------------------------------------------------------------------------
const OBS = {
  brug: { gap: [OX - 130, OX + 130], dh: 0, geb: "verbinden", angle: 0, poseP: "armen wijd" },
  helling: { gap: [OX - 130, OX + 130], dh: -110, geb: "verbinden", angle: 17.5, poseP: "armen wijd" },
  daling: { gap: [OX - 130, OX + 130], dh: 110, geb: "verbinden", angle: -17.5, poseP: "armen wijd" },
  dubbel: { gap: [OX - 330, OX + 330], dh: 0, geb: "hand in hand", angle: 0, poseP: "armen wijd" },
  springen: { geb: "springen", poseP: "springen" },
  bukken: { geb: "bukken", poseP: "bukken" },
};
function obstakel(g, kind, built, slide, t) {
  const o = OBS[kind];
  if (o.gap) {
    const [a, b] = [o.gap[0] + slide, o.gap[1] + slide], y2 = G + o.dh;
    grond(g, [[-200, a, G], [b, 2200, y2]]);
    if (built < 1) doellijn(g, a + 24, G, b - 24, y2);
    if (built > 0) line(g, [a, G, lerp(a, b, built), lerp(G, y2, built)], C.ink, 14);
    verbindpunt(g, a, G, built >= 1, t); verbindpunt(g, b, y2, built >= 1, t + 0.4);
    return { stop: a - 80, after: b + 160, y2 };
  }
  grond(g);
  if (kind === "springen") { g.fillStyle = C.block; g.fillRect(OX - 32 + slide, G - 92, 64, 92); g.lineWidth = 4; g.strokeStyle = C.blockLine; g.strokeRect(OX - 32 + slide, G - 92, 64, 92); return { stop: OX - 160 + slide, after: OX + 200 + slide, y2: G }; }
  g.fillStyle = C.block; g.fillRect(OX - 80 + slide, -10, 160, G - 190); g.lineWidth = 4; g.strokeStyle = C.blockLine; g.strokeRect(OX - 80 + slide, -10, 160, G - 190);
  return { stop: OX - 210 + slide, after: OX + 220 + slide, y2: G };
}
// the Krabbel(s) crossing an obstacle, u = 0..1
function oversteken(g, E, kind, info, u, t) {
  const o = OBS[kind];
  const krs = E.duo ? [MINE[0], MINE[1]] : [MINE[0]];
  krs.forEach((kr, i) => {
    const off = E.duo ? (i ? -110 : 0) : 0;
    const uu = clamp(u * 1.15 - (i ? 0.15 : 0), 0, 1);
    let x = lerp(info.stop + off, info.after + off, ease(uu)), y = G + 4, lift = 0, st = "lopen";
    if (o.gap) { const gx = (x - o.gap[0]) / (o.gap[1] - o.gap[0]); y = gx < 0 ? G + 4 : gx > 1 ? info.y2 + 4 : lerp(G, info.y2, gx) + 4; }
    if (kind === "springen") { lift = Math.sin(clamp((uu - 0.2) / 0.6, 0, 1) * Math.PI) * 200; st = "springen"; }
    if (kind === "bukken" && uu > 0.25 && uu < 0.8) st = "bukken";
    krabbel(g, kr, x, y, 110, st, t + i, { lift });
  });
}
function wachten(g, E, info, st, t, kind = null) {
  let mood = null, look = null;
  if (st === "omkijken" && kind) {
    const atGap = Math.floor(t * 0.9) % 2 === 0;
    if (OBS[kind].gap) { mood = atGap ? "bang" : "blij"; look = atGap ? [0.7, 0.9] : [-0.2, 0.3]; } // looks down into the gap, then at you
    else { mood = atGap ? "verrast" : "blij"; look = atGap ? [0.9, kind === "bukken" ? -0.8 : 0.2] : [-0.2, 0.3]; }
  }
  (E.duo ? [MINE[0], MINE[1]] : [MINE[0]]).forEach((kr, i) => krabbel(g, kr, info.stop - (i ? 110 : 0), G + 4, 110, st, t + i, { mood, look }));
}
// Puntje draws a bridge: his point on the bridge tip
function tekentBrug(g, kind, built, t) {
  const o = OBS[kind], y2 = G + o.dh, bx = lerp(o.gap[0], o.gap[1], built), by = lerp(G, y2, built);
  puntjePose(g, { lean: 24, tipDown: 1, aL: 30, eL: -40, aR: -25, eR: 35, lookY: 1, brow: -0.3, smile: 0, mouth: 0.2 }, bx + Math.sin(24 * Math.PI / 180) * 74.5, by, 1.15);
}

// --- one obstacle beat: tutorial (Puntje shows it) or game (pictogram), optional "help" ---------------------------
function beat(E, kind, t, { mode = "spel", dur = 6, owner = null, helpAt = null } = {}) {
  const o = OBS[kind], holds = !!o.gap;
  const slide = (1 - easeOut(seg(t, 0, 0.9))) * 1100;
  // timing
  const T = mode === "tutorial"
    ? { show: [1.3, 3.6], kid: [3.6, 4.9], build: [4.0, 5.4], cross: [5.6, dur] }
    : helpAt ? { wait: [1.2, 3.8], show: [3.8, 6.2], none: [6.2, 7.6], self: [7.6, 9.2], cross: [9.4, dur] }
    : { kid: [1.4, 2.8], build: [1.8, 3.0], cross: [3.2, dur] };
  const kidOn = T.kid && t > T.kid[0];
  const built = holds ? (T.build ? seg(t, T.build[0], T.build[1]) : 0) + (T.self ? seg(t, T.self[0], T.self[1]) : 0) : 0;
  const crossing = seg(t, T.cross[0], T.cross[1]);
  E.wall((g) => {
    papier(g);
    // silhouettes: still, or doing the movement
    if (kidOn) silhouet(g, E, o.geb, t - T.kid[0], o.angle || 0, 1, owner === null || kind === "dubbel" ? null : owner);
    else silhouet(g, E, "staan", null);
    const info = obstakel(g, kind, built, slide, E.now);
    if (crossing > 0) oversteken(g, E, kind, info, crossing, t);
    else wachten(g, E, info, T.wait && t > T.wait[0] ? "wiebelen" : t < 1.0 ? "lopen" : "omkijken", t, kind);
    // the sign (game) or Puntje in front (tutorial / help)
    if (mode === "spel") {
      const bx = kind === "bukken" ? OX + 300 : OX, by = kind === "bukken" ? 380 : holds ? 330 : 360;
      const state = crossing > 0 || built >= 1 ? "gelukt" : kidOn && holds ? "vasthouden" : t > 0.9 ? "nu" : "komt eraan";
      bordje(g, bx, by, state, o.geb, t, { angle: o.angle || 0, hold: built, duo: E.duo ? (kind === "dubbel" ? "1+2" : String((owner ?? 0) + 1)) : null, size: 230 });
      if (state === "gelukt") sterretjes(g, bx, by, seg(t, T.cross[0], T.cross[0] + 1.2));
    }
    const showing = T.show && t > T.show[0] && t < T.show[1];
    if (showing) { // Puntje comes to the front and shows it
      const k = easeOut(seg(t, T.show[0], T.show[0] + 0.6));
      puntjeAnim(g, o.poseP, t - T.show[0], lerp(1500, 1460, k), lerp(820, 1060, k), lerp(1, 1.9, k));
    } else if (holds && built > 0 && built < 1) tekentBrug(g, kind, built, t);
    else if (T.none && t > T.none[0] && t < T.self[0]) puntjeAnim(g, "oei", t, 1460, 1060, 1.9);
    else puntjeAnim(g, crossing > 0 || built >= 1 ? "juichen" : "rust", t, 1500, 820, 1);
  });
  E.kids(kidOn ? { g: o.geb, t: t - T.kid[0], angle: o.angle || 0, who: kind === "dubbel" ? null : owner } : null);
}

// --- the scenes ----------------------------------------------------------------------------------------------
// chapter = number in the menu; dur in seconds; draw(E, t) with E = the room (see verhaal.js)
export const SCENES = [
  { ch: 1, title: "Voor het spelen", sub: "Puntje zweeft rond, zwaait, wijst naar de iPads en klopt op het glas. Op de monitor: de Krabbelwereld.", dur: 11, draw(E, t) {
    E.wall((g) => {
      papier(g); grond(g); rondlopers(g, t, 4); logo(g, 60, 70, 0.8);
      const acts = [["zweven", 0, 2.6], ["zwaaien", 2.6, 4.2], ["zweven", 4.2, 5.4], ["wijzen", 5.4, 7.6], ["zweven", 7.6, 8.4], ["tikken", 8.4, 11]];
      const a = acts.find((q) => t >= q[1] && t < q[2]) || acts[0];
      if (a[0] === "tikken") { const k = easeOut(seg(t, 8.4, 9)); puntjeAnim(g, "tikken", t - 8.4, lerp(1200, 1000, k), lerp(600, 1050, k), lerp(1, 2.4, k)); }
      else { const x = 960 + Math.sin(t * 0.55) * 620, y = 560 + Math.sin(t * 1.15) * 120; puntjeAnim(g, a[0], t - a[1], x, y, 1.2, { flip: a[0] === "wijzen" && x > 960 }); }
    });
    E.ipad(0, (g) => tikScherm(g, t)); E.ipad(1, (g) => tikScherm(g, t + 0.4));
    E.mon((g) => { wereld(g, 1920, 1080, t); logo(g, 60, 80, 0.9); });
    E.kids(null, [false, false]);
  } },

  { ch: 2, title: "Kinderen nemen plaats", sub: "De camera ziet het kind. Puntje vliegt van de muur via de ledstrip naar de iPad en vraagt om te tikken.", dur: 10, draw(E, t) {
    const k0 = seg(t, 0, 1.4), k1 = E.duo ? seg(t, 3, 4.4) : 0;
    E.kids(null, [k0 > 0, k1 > 0], [k0, k1]);
    E.wall((g) => {
      papier(g); grond(g); rondlopers(g, t, 4); logo(g, 60, 70, 0.8);
      if (t > 1.4 && t < 2.6) { const a = 0.5 + 0.5 * Math.sin(t * 20); g.save(); g.globalAlpha = a; rr(g, 900, 30, 120, 70, 16); g.fillStyle = C.ink; g.fill(); dot(g, 960, 65, 22, "#9ad"); g.restore(); }
      if (t < 2.4) puntjeAnim(g, "zwaaien", t, 1100, 600, 1.2);
      else if (t < 3.1) { const k = seg(t, 2.4, 3.1); puntjePose(g, { lean: -20, aL: 40, aR: 40, eL: 30, eR: 30, mouth: 0.4 }, lerp(1100, 860 * 1920 / 1920, k), lerp(600, 1180, k * k), 1.2); }
    });
    E.pulse("ipad0", 1 - seg(t, 3.1, 4.1), "puntje");
    if (E.duo) E.pulse("ipad1", 1 - seg(t, 4.4, 5.4), "puntje");
    if (!E.duo) E.ipad(1, (g) => tikScherm(g, t + 0.4)); // a second child can still join
    for (const i of E.duo ? [0, 1] : [0]) {
      const arrive = i ? 5.4 : 4.1, tap = i ? 7.6 : 6.6;
      E.ipad(i, (g) => {
        if (t < tap) tikScherm(g, t);
        else canvasScherm(g, { t });
        if (t > tap - 0.05 && t < tap + 0.6) tikGolf(g, 683, 470, seg(t, tap, tap + 0.6));
        if (t > arrive) {
          const k = easeOut(seg(t, arrive, arrive + 0.7));
          if (t < tap) puntjeAnim(g, "wenken", t, lerp(683, 360, k), lerp(-100, 760, k), 2.2);
          else puntjeAnim(g, "rust", t, 1290, 800, 1.3);
        }
      });
    }
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 3, title: "Tekenen", sub: "Puntje doet het voor: een stippelcirkel, ogen en benen als stickers, en weer weg. Dan tekent het kind met Puntje, en plakt zelf de stickers.", dur: 17, draw(E, t) {
    E.kids(null, [true, E.duo]);
    for (const i of E.duo ? [0, 1] : [0]) E.ipad(i, (g) => tekenScherm(g, t - i * 0.7, i));
    if (!E.duo && t < 15.2) E.ipad(1, (g) => tikScherm(g, t + 0.4)); // after "klaar" nobody can join any more
    E.wall((g) => { papier(g); grond(g); rondlopers(g, t, 4, 0.6); });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 4, title: "Klaar", sub: "Puntje tovert de tekening tot leven. De Krabbel knippert, beweegt, wordt wakker en zwaait. Samen springen ze via de ledstrip naar de muur.", dur: 12, draw(E, t) {
    E.kids(null, [true, E.duo]);
    const offs = E.duo ? [0, 1.6] : [0];
    offs.forEach((o, i) => {
      const lt = t - o;
      E.ipad(i, (g) => klaarScherm(g, lt, i));
      E.pulse(i ? "ipad1" : "ipad0", seg(lt, 7.6, 8.8), "beiden", i);
    });
    E.wall((g) => {
      papier(g); grond(g); rondlopers(g, t, 2, 0.5);
      offs.forEach((o, i) => {
        const lt = t - o, k = seg(lt, 8.8, 9.8);
        if (k <= 0) return;
        const x = (i ? 760 : 900), y = G + 4 - Math.sin(k * Math.PI) * 260 + (1 - k) * 300;
        krabbel(g, MINE[i], x, Math.min(G + 4, y), 110, k < 1 ? "springen" : E.duo && i === 0 && t < offs[1] + 9.8 ? "wiebelen" : "zwaaien", lt);
        if (i === 0) puntjeAnim(g, k < 1 ? "juichen" : "rust", lt, x + 170, Math.min(G, y - 4), 1);
      });
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 5, title: "Intro: het glas", sub: "De Krabbel wil naar het kind, maar botst tegen het glas: een barstje dat vanzelf herstelt. Hij valt, denkt na en gaat terug naar Puntje.", dur: 9, draw(E, t) {
    E.kids(null, [true, E.duo]);
    E.wall((g) => {
      papier(g); grond(g);
      puntjeAnim(g, "rust", t, 1400, G, 1);
      (E.duo ? [0, 1] : [0]).forEach((i) => {
        const bx = 900 - i * 200;
        let x = bx, y = G + 4, sc = 1, st = "zwaaien";
        if (t > 1.2 && t < 3) { const k = ease(seg(t, 1.2, 3)); y = lerp(G + 4, 1040, k); sc = lerp(1, 2.4, k); st = "lopen"; }
        else if (t >= 3 && t < 5.6) { y = 1040; sc = 2.4; st = "zitten"; x = bx + Math.sin((t - 3) * 40) * 6 * Math.max(0, 1 - (t - 3) * 2); }
        else if (t >= 5.6) { const k = ease(seg(t, 5.6, 7.6)); y = lerp(1040, G + 4, k); sc = lerp(2.4, 1, k); x = lerp(bx, bx + 240, k); st = k < 1 ? "lopen" : "staan"; }
        const mood = t < 3 ? "blij" : t < 4 ? "verrast" : t < 5.6 ? "oei" : "neutraal";
        krabbel(g, MINE[i], x, y, 110, st, t, { scale: sc, flip: t >= 5.6 && t < 7.6, mood, look: t < 3 ? [-0.1, 0.5] : t < 5.6 ? [0.3, -0.6] : null });
        if (t > 4 && t < 5.8) vraagteken(g, x + 30, y - 110 * sc * 1.5, seg(t, 4, 4.4));
      });
      barst(g, 900, 760, t > 3 ? 1 - seg(t, 4.2, 6) : 0);
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 5, title: "Intro: het idee", sub: "Puntje denkt na en krijgt een idee. In de tekstballon: een deur naar de Krabbelwereld, en een kloof waar hij een brug over tekent.", dur: 12, draw(E, t) {
    E.kids(null, [true, E.duo]);
    E.wall((g) => {
      papier(g); grond(g);
      (E.duo ? [0, 1] : [0]).forEach((i) => krabbel(g, MINE[i], 1140 - i * 130, G + 4, 110, t > 8.5 && t < 10 ? "juichen" : t > 3.6 ? "omkijken" : "staan", t + i, { mood: t > 8.5 && t < 10 ? null : t > 3.6 ? "nieuwsgierig" : "oei", look: t > 3.6 ? [0.2, -0.9] : [0.9, -0.3] }));
      const px = 1400, py = G;
      if (t < 2.6) puntjePose(g, { aR: 40, eR: 125, lookY: -0.6, lookX: 0.4, brow: 0.3, browTilt: 0.7, smile: 0, air: HOVER + Math.sin(t * 2) * 4, lean: Math.sin(t * 1.5) * 4 }, px, py, 1.15);
      else puntjeAnim(g, t < 3.6 ? "juichen" : "wijzen", t - 2.6, px, py, 1.15, { flip: true });
      if (t > 2.6 && t < 3.8) lamp(g, px, py - 260, seg(t, 2.6, 2.9) * (1 - seg(t, 3.5, 3.8)));
      // the speech bubble
      const open = seg(t, 3.6, 4.0) * (1 - seg(t, 10.6, 11));
      if (open > 0) {
        g.save(); g.translate(1040, 420); g.scale(easeBack(open), easeBack(open)); g.translate(-1040, -420);
        bubble(g, 640, 120, 800, 470, px - 60, py - 170);
        g.save(); g.beginPath(); g.rect(670, 150, 740, 410); g.clip();
        if (t < 6.6) deurNaarWereld(g, 1040, 355, 1, t);
        else kloofMetBrug(g, 670, 150, 740, 410, seg(t, 7.2, 9.4), t);
        g.restore(); g.restore();
      }
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 5, title: "Intro: jouw figuur", sub: "Puntje vliegt omhoog en tekent het silhouet van het kind. Beweegt het kind, dan beweegt het silhouet mee.", dur: 8, draw(E, t) {
    const moving = t > 5.2;
    E.kids(moving ? { g: "verbinden", t: t - 5.2, angle: 0 } : null, [true, E.duo]);
    E.wall((g) => {
      papier(g);
      const xs = E.duo ? [OX - 330, OX + 330] : [OX], top = 640 + 0.42 * 780 - 0.8 * 780, bottom = G + 60;
      let pen = null;
      xs.forEach((x, i) => {
        const a0 = 1 + i * (3 / xs.length), a1 = 1 + (i + 1) * (3 / xs.length), u = seg(t, a0, a1);
        const revealY = lerp(top, bottom, ease(u));
        g.save(); g.beginPath(); g.rect(0, 0, 1920, revealY); g.clip(); g.globalAlpha = lerp(0.55, 0.2, seg(t, 4, 4.8));
        gebaar(g, moving ? "verbinden" : "staan", x, 640, 780, C.kidSoft, moving ? t - 5.2 : null);
        g.restore();
        if (u > 0 && u < 1) pen = [x + Math.sin(u * Math.PI * 7) * 120, Math.min(G, revealY + 40)];
      });
      grond(g);
      (E.duo ? [0, 1] : [0]).forEach((i) => krabbel(g, MINE[i], 520 - i * 120, G + 4, 110, moving ? "juichen" : "omkijken", t + i, { mood: moving ? null : "verrast", look: moving ? null : [0.9, -0.5] }));
      if (t < 1) { const k = easeOut(t); puntjeAnim(g, "springen", t, lerp(1400, xs[0] + 120, k), lerp(G, 300, k), 1); }
      else if (pen) puntjePose(g, { lean: 24, tipDown: 1, aL: 30, eL: -40, aR: -25, eR: 35, lookY: 1 }, pen[0] + 30, pen[1], 1);
      else puntjeAnim(g, moving ? "juichen" : "rust", t, 1500, G, 1);
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },

  { ch: 5, title: "Tutorial: brug", sub: "Ze stappen samen naar rechts. Aan de kloof komt Puntje naar voren en doet armen wijd voor. Het kind doet het, Puntje tekent de brug.", dur: 8, draw(E, t) { beat(E, "brug", t, { mode: "tutorial", dur: 8 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 5, title: "Tutorial: springen", sub: "Puntje doet springen voor, het kind springt, de Krabbel springt mee over het blok.", dur: 7.4, draw(E, t) { beat(E, "springen", t, { mode: "tutorial", dur: 7.4 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 5, title: "Tutorial: bukken", sub: "Puntje doet bukken voor, het kind bukt, de Krabbel bukt onder de balk.", dur: 7.4, draw(E, t) { beat(E, "bukken", t, { mode: "tutorial", dur: 7.4 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },

  { ch: 6, title: "Spel: aftellen", sub: "Puntje komt naar voren en telt af: 3, 2, 1! Vanaf nu staan er pictogrammen bij de obstakels.", dur: 5.4, draw(E, t) {
    E.kids(null, [true, E.duo]);
    E.wall((g) => {
      papier(g); silhouet(g, E, "staan", null); obstakel(g, "helling", 0, 0, E.now);
      wachten(g, E, { stop: OBS.helling.gap[0] - 80 }, "omkijken", t, "helling");
      const k = easeOut(seg(t, 0, 0.6));
      puntjePose(g, { aR: 75, eR: 20, handR: 1, smile: 0.8, brow: 0.6, air: HOVER + Math.sin(t * 3) * 4 }, lerp(1500, 1460, k), lerp(820, 1060, k), lerp(1, 1.9, k));
      const n = t < 1.2 ? null : t < 2.2 ? "3" : t < 3.2 ? "2" : t < 4.2 ? "1" : "!";
      if (n) { const p = easeBack(seg(t % 1, 0.2, 0.5)); bubble(g, 1290, 380, 280, 240, 1430, 700); g.save(); g.translate(1430, 500); g.scale(p, p); text(g, n, 0, 0, 160, C.ink, "center", 900); g.restore(); }
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },
  { ch: 6, title: "Spel: helling", sub: "Bij elk obstakel staat het bordje. Het kind doet armen schuin, de brug groeit, de Krabbel gaat erover.", dur: 5.4, draw(E, t) { beat(E, "helling", t, { dur: 5.4, owner: 0 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 6, title: "Spel: springen", sub: "Het kind springt, de Krabbel springt mee.", dur: 5, draw(E, t) { beat(E, "springen", t, { dur: 5, owner: 1 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 6, title: "Spel: daling, met hulp", sub: "Duurt het te lang, dan komt Puntje naar voren en doet het voor. Duurt het nog langer, dan tekent hij het zelf.", dur: 11, draw(E, t) { beat(E, "daling", t, { dur: 11, owner: 0, helpAt: true }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 6, title: "Spel: bukken", sub: "Het kind bukt, de Krabbel bukt onder de balk.", dur: 5, draw(E, t) { beat(E, "bukken", t, { dur: 5, owner: 1 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },
  { ch: 6, title: "Spel: brug / dubbele brug", sub: "Solo: een brug. Duo: de dubbele brug, het enige obstakel op dit level. Hand in hand.", dur: 6, draw(E, t) { beat(E, E.duo ? "dubbel" : "brug", t, { dur: 6, owner: 0 }); E.mon((g) => wereld(g, 1920, 1080, t)); } },

  { ch: 7, title: "Einde: de deur", sub: "Na alle levels: de Krabbel doet de deur open en wandelt erdoor. Puntje zwaait.", dur: 7, draw(E, t) {
    E.kids(null, [true, E.duo]);
    E.wall((g) => {
      papier(g); silhouet(g, E, "staan", null); grond(g);
      const dx = 1240, open = seg(t, 2.6, 3.4);
      g.fillStyle = C.sky; g.fillRect(dx - 80, G - 280, 160, 280); // behind the door: the world
      wereld(g, 1920, 1080, t); // will be clipped below
      g.save(); g.beginPath(); g.rect(0, 0, 1920, 1080); g.rect(dx - 80, G - 280, 160, 280); g.clip("evenodd"); papier(g); silhouet(g, E, "staan", null); grond(g); g.restore();
      g.lineWidth = 8; g.strokeStyle = C.ink; g.strokeRect(dx - 80, G - 280, 160, 280);
      g.fillStyle = C.door; g.fillRect(dx - 80, G - 280, 160 * (1 - open * 0.85), 280); g.strokeRect(dx - 80, G - 280, 160 * (1 - open * 0.85), 280);
      if (open < 0.5) dot(g, dx + 50, G - 140, 9, C.ink);
      (E.duo ? [0, 1] : [0]).forEach((i) => {
        const u = seg(t, 0.4, 2.6), w = seg(t, 3.6, 5.6) - i * 0.1;
        const x = w > 0 ? lerp(dx - 120, dx + 10, w) - i * 100 : lerp(500, dx - 120, ease(u)) - i * 100;
        krabbel(g, MINE[i], x, G + 4, 110, u < 1 ? "lopen" : w > 0 ? "lopen" : "zwaaien", t + i, { alpha: 1 - clamp((w - 0.7) / 0.3, 0, 1) });
      });
      puntjeAnim(g, "zwaaien", t, 700, G, 1.1);
    });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },
  { ch: 7, title: "Einde: naar de monitor", sub: "Via de ledstrip komt de Krabbel op de monitor terecht, zwaait en gaat tussen de andere Krabbels wonen. Daarna start alles opnieuw.", dur: 9, draw(E, t) {
    const reset = seg(t, 6, 7);
    E.kids(null, [t < 7, E.duo && t < 7], [1 - reset, 1 - reset]);
    E.pulse("mon", seg(t, 0, 1.6), "krabbel");
    E.wall((g) => {
      papier(g); grond(g);
      if (t < 5) puntjeAnim(g, "zwaaien", t, 960, G, 1.3);
      else { g.save(); g.globalAlpha = 1 - seg(t, 5, 6); puntjeAnim(g, "zwaaien", t, 960, G, 1.3); g.restore(); }
      if (t > 6.4) { rondlopers(g, t, 4, seg(t, 6.4, 7.4)); logo(g, 60, 70, 0.8); }
    });
    E.mon((g) => wereld(g, 1920, 1080, t, { mine: MINE[0], mineT: t > 1.6 ? t - 1.6 : null }));
    if (t > 7) { E.ipad(0, (g) => tikScherm(g, t)); E.ipad(1, (g) => tikScherm(g, t + 0.4)); }
  } },

  { ch: 8, title: "Uitzondering: iPad inactief", sub: "Na 10 s niets wordt het scherm donkerder en kijkt Puntje vragend. Na nog eens 10 s gaat die iPad uit.", dur: 12, extra: true, draw(E, t) {
    E.kids(null, [t < 2, false], [1 - seg(t, 1, 2), 0]);
    E.ipad(0, (g) => {
      if (t > 10.6) return; // off
      canvasScherm(g, { t });
      const dim = seg(t, 3, 3.6) * 0.55;
      if (dim > 0) { g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, 1366, 1024); }
      if (t < 3) puntjeAnim(g, "rust", t, 1290, 800, 1.3);
      else { const k = easeOut(seg(t, 3, 3.8)); puntjePose(g, { lookX: Math.sin(t * 1.4) * 0.8, brow: 0.6, browTilt: 0.8, smile: -0.2, eyes: 1.2, aR: 20, eR: 90, air: HOVER + Math.sin(t * 2) * 6 }, lerp(1290, 683, k), lerp(800, 960, k), lerp(1.3, 3.4, k)); vraagteken(g, 900, 330, seg(t, 4, 4.5)); }
      if (t > 10) { g.fillStyle = `rgba(0,0,0,${seg(t, 10, 10.6)})`; g.fillRect(0, 0, 1366, 1024); }
    });
    E.ipad(1, (g) => tikScherm(g, t));
    E.wall((g) => { papier(g); grond(g); rondlopers(g, t, 4); });
    E.mon((g) => wereld(g, 1920, 1080, t));
  } },
];

// --- iPad screens ----------------------------------------------------------------------------------------------
function tikScherm(g, t) {
  g.fillStyle = C.paper; g.fillRect(0, 0, 1366, 1024);
  tikHier(g, 683, 470, t);
  // a finger in the circle
  g.save(); g.translate(683, 470); g.fillStyle = "#fff";
  rr(g, -13, -38, 26, 60, 13); g.fill();
  g.restore();
}
function tikGolf(g, x, y, u) { g.save(); g.globalAlpha = 1 - u; g.lineWidth = 8; g.strokeStyle = C.kid; g.beginPath(); g.arc(x, y, 40 + u * 140, 0, Math.PI * 2); g.stroke(); g.restore(); }
const BLAD = { x: 133, y: 50, w: 1100, h: 740 }, BAR = 834;
function canvasScherm(g, { t, klaar = false, stickersAan = true, klaarDruk = 0 }) {
  g.fillStyle = C.paper; g.fillRect(0, 0, 1366, 1024);
  g.fillStyle = "#f2efe8"; g.fillRect(0, BAR, 1366, 1024 - BAR);
  rr(g, BLAD.x, BLAD.y, BLAD.w, BLAD.h, 24); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#ddd8cc"; g.stroke();
  // toolbar: colours, eye stickers, leg stickers, done
  ["#e8553d", "#8a5cf6", "#2e9e5b", "#3a3a3a"].forEach((c, i) => dot(g, 140 + i * 100, BAR + 95, 34, c));
  rr(g, 560, BAR + 35, 120, 120, 26); g.fillStyle = "#fff"; g.fill(); oogjes(g, 620, BAR + 95, 1.4, "rond");
  rr(g, 700, BAR + 35, 120, 120, 26); g.fillStyle = "#fff"; g.fill(); line(g, [745, BAR + 70, 740, BAR + 125, 728, BAR + 125], C.ink, 7); line(g, [778, BAR + 70, 783, BAR + 125, 795, BAR + 125], C.ink, 7);
  rr(g, 1140, BAR + 35, 120, 120, 30); g.fillStyle = klaar ? "#2e9e5b" : "#e5e1d8"; g.fill();
  line(g, [1171, BAR + 95, 1191, BAR + 115, 1229, BAR + 75], klaar ? "#fff" : "#bbb", 10);
  if (klaarDruk > 0) tikGolf(g, 1200, BAR + 95, klaarDruk);
}
// where the drawing sits on the iPad
const DX = 683 - 150 * 1.9, DY = 420 - 130 * 1.9, DS = 1.9;
function stickerBenen(g, d, x, y, s, a = 1) {
  g.save(); g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 7 * s / 1.9; g.lineCap = "round";
  const bx = x + d.W / 2 * s, by = y + (d.H - 30) * s;
  g.beginPath(); g.moveTo(bx - 30 * s, by); g.lineTo(bx - 36 * s, by + 50 * s); g.lineTo(bx - 52 * s, by + 50 * s); g.moveTo(bx + 30 * s, by); g.lineTo(bx + 36 * s, by + 50 * s); g.lineTo(bx + 52 * s, by + 50 * s); g.stroke();
  g.restore();
}
function tekenScherm(g, t, i) {
  const d = DRAW[i];
  canvasScherm(g, { t, klaar: t > 15, klaarDruk: seg(t, 15.2, 15.8) });
  // 0–2.6: Puntje draws the dotted guide circle
  const guide = seg(t, 0.3, 2.6), cx = 683, cy = 420, r = 230;
  if (guide > 0) { g.save(); g.setLineDash([16, 18]); g.lineWidth = 6; g.strokeStyle = "#c9c2b4"; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + guide * Math.PI * 2); g.stroke(); g.restore(); }
  // 2.6–4.6: stickers on, 4.6–5.8: stickers off again
  const on = seg(t, 2.8, 3.8), off = seg(t, 4.8, 5.8);
  if (on > 0 && off < 1) {
    const k = on * (1 - off);
    oogjes(g, lerp(620, cx, k), lerp(BAR + 95, cy - 50, k), lerp(1.4, 3.2, k), "rond");
    g.save(); g.translate(lerp(760, cx, k) - cx, lerp(BAR + 95, cy + 150, k) - cy - 150); stickerBenen(g, { W: 300, H: 260 }, cx - 150 * 1.6, cy - 130 * 1.6 + 60, 1.6); g.restore();
  }
  // the child draws, holding Puntje
  const f = seg(t, 7, 12.2);
  const tip = f > 0 ? tekenDeel(g, d, f, DX, DY, DS) : null;
  if (t > 12.2) tekenDeel(g, d, 1, DX, DY, DS);
  // the child's stickers
  const eyeIn = seg(t, 12.6, 13.6), legIn = seg(t, 13.8, 14.8);
  if (eyeIn > 0) { const e = d.eyes[0]; oogjes(g, lerp(620, DX + e.x * DS, ease(eyeIn)), lerp(BAR + 95, DY + e.y * DS, ease(eyeIn)), lerp(1.4, 3, eyeIn), e.type); }
  if (legIn > 0) { g.save(); g.translate(lerp(760 - (DX + 150 * DS), 0, ease(legIn)), lerp(BAR + 95 - (DY + 240 * DS), 0, ease(legIn))); stickerBenen(g, d, DX, DY, DS); g.restore(); }
  if (eyeIn > 0 && eyeIn < 1) dot(g, lerp(620, DX + d.eyes[0].x * DS, ease(eyeIn)), lerp(BAR + 95, DY + d.eyes[0].y * DS, ease(eyeIn)) + 40, 26, "rgba(59,123,255,0.35)");
  // Puntje
  if (t < 2.6) { const a = -Math.PI / 2 + guide * Math.PI * 2; puntjePose(g, { lean: 24, tipDown: 1, lookY: 1, aL: 30, eL: -40, aR: -25, eR: 35 }, cx + Math.cos(a) * r + 70, cy + Math.sin(a) * r, 1.6); }
  else if (t < 5.8) puntjeAnim(g, "wijzen", t - 2.6, 1260, 760, 1.3, { flip: true });
  else if (t < 7) puntjeAnim(g, "wenken", t, 1260, 760, 1.3);
  else if (tip && f < 1) { puntjePose(g, { lean: 24, tipDown: 1, lookY: 1, aL: 30, eL: -40, aR: -25, eR: 35, brow: -0.3 }, tip[0] + 70, tip[1], 1.6); dot(g, tip[0] + 70 + 20, tip[1] - 190, 30, "rgba(59,123,255,0.35)"); }
  else puntjeAnim(g, "knikken", t, 1290, 800, 1.3);
}
function klaarScherm(g, t, i) {
  const d = DRAW[i], kr = MINE[i];
  if (t > 8) { g.fillStyle = "#000"; g.fillRect(0, 0, 1366, 1024); return; }
  if (t < 0) { canvasScherm(g, { t: 0, klaar: true }); tekenDeel(g, d, 1, DX, DY, DS); stickerBenen(g, d, DX, DY, DS); oogjes(g, DX + d.eyes[0].x * DS, DY + d.eyes[0].y * DS, 3, d.eyes[0].type); puntjeAnim(g, "knikken", t, 1290, 800, 1.3); return; }
  g.fillStyle = C.paper; g.fillRect(0, 0, 1366, 1024);
  const cx = 683, cy = 470;
  // 0–2.6 Puntje circles round like a magic wand; sparkles
  if (t < 3.2) {
    tekenDeel(g, d, 1, DX, DY, DS); stickerBenen(g, d, DX, DY, DS);
    const blink = t > 2.6 && ((t - 2.6) % 0.35) < 0.12 ? 0.1 : 1;
    oogjes(g, DX + d.eyes[0].x * DS, DY + d.eyes[0].y * DS, 3, d.eyes[0].type, blink);
    glinsters(g, cx, cy, 330, t);
    if (t < 2.6) { const a = t * 2.6; puntjePose(g, { lean: Math.cos(a) * 20, aR: 60, eR: 20, handR: 1, happy: 1, smile: 1 }, cx + Math.cos(a) * 420, cy + 150 + Math.sin(a) * 200, 1.4); }
    else puntjeAnim(g, "juichen", t, 1200, 860, 1.3);
    return;
  }
  // the Krabbel wakes up: legs move, jumps, waves; Puntje takes his hand; they jump out of the top
  const out = seg(t, 6.8, 7.6);
  const st = t < 4 ? "wiebelen" : t < 4.6 ? "springen" : t < 6 ? "zwaaien" : "staan";
  const lift = t >= 4 && t < 4.6 ? Math.sin(seg(t, 4, 4.6) * Math.PI) * 160 : out * 900;
  krabbel(g, kr, cx, 820, 420, st, t, { lift, mood: t < 4 ? "slaperig" : t < 4.6 ? "verrast" : null, look: t >= 4.6 && t < 6 ? [-0.2, 0.4] : null });
  if (t < 6) puntjeAnim(g, "juichen", t, 1150, 860, 1.3);
  else { const k = seg(t, 6, 6.8); puntjePose(g, { aL: lerp(-70, 10, k), eL: 0, happy: 1, smile: 1, air: HOVER + out * 900 }, lerp(1150, cx + 330, k), 860, 1.3); }
  if (t > 4.6 && t < 6) sterretjes(g, cx, 300, seg(t, 4.6, 5.8));
}

// --- what Puntje / the Krabbel look like while travelling along a led strip (room coords) -----------------------------
export function reiziger(g, carry, x, y, t, i = 0) {
  if (carry === "puntje" || carry === "beiden") drawPuntje(g, { ...BASE, lean: -10, aL: 30, aR: 30, smile: 0.8 }, x + (carry === "beiden" ? 18 : 0), y, 0.32, PC);
  if (carry === "krabbel" || carry === "beiden") krabbel(g, MINE[i], x - (carry === "beiden" ? 16 : 0), y, 34, "springen", t);
}

// --- speech-bubble contents ----------------------------------------------------------------------------------
function deurNaarWereld(g, x, y, s, t) {
  // a door, open, with the Krabbelwereld behind it
  const w = 200, h = 300;
  g.save(); g.beginPath(); g.rect(x - w / 2, y - h / 2, w, h); g.clip();
  g.translate(x - w / 2, y - h / 2); wereld(g, w, h, t); g.restore();
  g.lineWidth = 8; g.strokeStyle = C.ink; g.strokeRect(x - w / 2, y - h / 2, w, h);
  g.fillStyle = C.door; g.beginPath(); g.moveTo(x - w / 2, y - h / 2); g.lineTo(x - w / 2 - 70, y - h / 2 + 30); g.lineTo(x - w / 2 - 70, y + h / 2 + 30); g.lineTo(x - w / 2, y + h / 2); g.closePath(); g.fill(); g.stroke();
  glinsters(g, x, y, 170, t);
}
function kloofMetBrug(g, x, y, w, h, built, t) {
  const gy = y + h * 0.72, a = x + w * 0.28, b = x + w * 0.58;
  g.fillStyle = C.grass; g.fillRect(x, gy, a - x, h); g.fillRect(b, gy, x + w - b, h);
  g.fillStyle = C.grassLine; g.fillRect(x, gy, a - x, 5); g.fillRect(b, gy, x + w - b, 5);
  // the door on the right
  g.lineWidth = 6; g.strokeStyle = C.ink; g.fillStyle = C.door; g.fillRect(x + w - 120, gy - 170, 90, 170); g.strokeRect(x + w - 120, gy - 170, 90, 170);
  if (built > 0) line(g, [a, gy, lerp(a, b, built), gy], C.ink, 10);
  else doellijn(g, a + 14, gy, b - 14, gy);
  const bx = lerp(a, b, built);
  if (built > 0 && built < 1) drawPuntje(g, { ...BASE, lean: 24, tipDown: 1, lookY: 1 }, bx + 22, gy, 0.6, PC);
  else drawPuntje(g, { ...BASE, smile: 0.8 }, a - 60, gy, 0.6, PC);
  krabbel(g, MINE[0], a - 130, gy + 2, 60, built >= 1 ? "juichen" : "staan", t);
}
