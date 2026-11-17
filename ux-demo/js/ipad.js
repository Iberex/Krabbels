// =====================================================================
// De iPad, 1366 × 1024 (liggend). Tekenen met de vinger, oogjes plakken, klaar.
// =====================================================================
import { K, rr, line, dot, clamp, lerp, ease, easeOut, easeBack, ipadKnop, kleurbol, oogjes, OOGTYPES, tikHier } from "./kit.js?v=20261117c";
import { puntje, seq } from "./sprites.js?v=20261117c";
import { pok } from "./krabbel.js?v=20261117c";
import { S, go, share } from "./flow.js?v=20261117c";

export const W = 1366, H = 1024;
const BLAD = { x: 133, y: 50, w: 1100, h: 740 };
const BAR_Y = 834;
const KLEUREN = [K.inkt, K.donker, K.grijs, "#b5b5b5", K.kind];

// Local drawing state (only on the tab that draws)
const D = {
  strokes: [], // { color, width, erase, pts: [[x,y]...] } in blad coords
  cur: null,
  color: 0,
  erase: false,
  eyes: [], // { x, y, type } in blad coords
  drag: null, // eye being dragged { type, x, y, idx? }
  nodAt: -1e9,
  layer: null,
};
function layer() {
  if (!D.layer) { D.layer = document.createElement("canvas"); D.layer.width = BLAD.w; D.layer.height = BLAD.h; }
  return D.layer;
}
function repaint() {
  const c = layer(), g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  for (const s of [...D.strokes, ...(D.cur ? [D.cur] : [])]) {
    g.save();
    g.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    g.strokeStyle = s.color; g.lineWidth = s.width; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    g.stroke();
    g.restore();
  }
}
export function resetDrawing() {
  D.strokes = []; D.cur = null; D.eyes = []; D.color = 0; D.erase = false; D.drag = null;
  repaint();
}
const inkStrokes = () => D.strokes.filter((s) => !s.erase).length;

// A sample drawing so the flow also works when nobody draws (regie mode).
export function sampleDrawing() {
  if (inkStrokes()) return;
  const cx = BLAD.w / 2, cy = BLAD.h / 2 + 20, pts = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; const r = 1 + 0.12 * Math.sin(a * 5); pts.push([cx + Math.cos(a) * 170 * r, cy + Math.sin(a) * 140 * r]); }
  D.strokes.push({ color: K.inkt, width: 12, erase: false, pts });
  D.strokes.push({ color: K.inkt, width: 10, erase: false, pts: [[cx - 60, cy - 135], [cx - 80, cy - 190]] });
  D.strokes.push({ color: K.inkt, width: 10, erase: false, pts: [[cx + 50, cy - 138], [cx + 70, cy - 195]] });
  D.strokes.push({ color: K.kind, width: 10, erase: false, pts: [[cx - 50, cy + 60], [cx, cy + 85], [cx + 50, cy + 60]] });
  repaint();
}
export function sampleEyes() {
  if (!D.eyes.length) D.eyes.push({ x: BLAD.w / 2, y: BLAD.h / 2 - 30, type: "rond" });
}

// Crop the drawing and share it with the other screens.
export function exportKrabbel() {
  sampleDrawing(); sampleEyes();
  const c = layer(), g = c.getContext("2d"), data = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (data[(y * c.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const e of D.eyes) { x0 = Math.min(x0, e.x - 40); x1 = Math.max(x1, e.x + 40); y0 = Math.min(y0, e.y - 30); y1 = Math.max(y1, e.y + 30); }
  const pad = 16; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width, x1 + pad); y1 = Math.min(c.height, y1 + pad);
  const w = x1 - x0, h = y1 - y0, out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, w, h);
  share({ krabbel: { img: out.toDataURL("image/png"), eyes: D.eyes.map((e) => ({ x: e.x - x0, y: e.y - y0, type: e.type })), w, h }, rev: S.rev + 1 });
}

// --- input ---------------------------------------------------------------------
const inBlad = (x, y) => x >= BLAD.x && x <= BLAD.x + BLAD.w && y >= BLAD.y && y <= BLAD.y + BLAD.h;
function buttons() {
  // werkbalk layout per state
  if (S.id === "2b") {
    const b = [];
    KLEUREN.forEach((c, i) => b.push({ kind: "kleur", i, x: 150 + i * 104, y: BAR_Y + 95, r: 46 }));
    b.push({ kind: "gom", x: 720, y: BAR_Y + 35, w: 120 });
    b.push({ kind: "oogjes", x: 1000, y: BAR_Y + 35, w: 120, uit: inkStrokes() < 3 });
    b.push({ kind: "klaar", x: 1140, y: BAR_Y + 35, w: 120, uit: true });
    return b;
  }
  if (S.id === "2c") {
    const b = OOGTYPES.map((type, i) => ({ kind: "oog", type, x: 150 + i * 150, y: BAR_Y + 95, r: 60 }));
    b.push({ kind: "terug", x: 1000, y: BAR_Y + 35, w: 120 });
    b.push({ kind: "klaar", x: 1140, y: BAR_Y + 35, w: 120, uit: D.eyes.length === 0 });
    return b;
  }
  return [];
}
function hit(b, x, y) {
  if (b.r) return Math.hypot(x - b.x, y - b.y) <= b.r;
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.w;
}

export function ipadPointer(type, x, y, now) {
  const id = S.id;
  if (type === "down" && (id === "1b" || id === "2x")) return go(id === "1b" ? "2a" : "2b");
  if (id === "2b") {
    if (type === "down") {
      const b = buttons().find((q) => hit(q, x, y));
      if (b) {
        if (b.kind === "kleur") { D.color = b.i; D.erase = false; }
        if (b.kind === "gom") D.erase = !D.erase;
        if (b.kind === "oogjes" && !b.uit) go("2c");
        return;
      }
      if (inBlad(x, y)) { D.cur = { color: KLEUREN[D.color], width: D.erase ? 46 : 14, erase: D.erase, pts: [[x - BLAD.x, y - BLAD.y]] }; repaint(); }
    } else if (type === "move" && D.cur) {
      const p = D.cur.pts[D.cur.pts.length - 1], q = [clamp(x - BLAD.x, 0, BLAD.w), clamp(y - BLAD.y, 0, BLAD.h)];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 3) { D.cur.pts.push(q); repaint(); }
    } else if (type === "up" && D.cur) {
      D.strokes.push(D.cur); D.cur = null; D.nodAt = now; repaint();
    }
  } else if (id === "2c") {
    if (type === "down") {
      const b = buttons().find((q) => hit(q, x, y));
      if (b) {
        if (b.kind === "oog") D.drag = { type: b.type, x, y };
        if (b.kind === "terug") go("2b");
        if (b.kind === "klaar" && !b.uit) { exportKrabbel(); go("2d"); }
        return;
      }
      // pick up an eye that is already on the drawing
      const i = D.eyes.findIndex((e) => Math.hypot(e.x + BLAD.x - x, e.y + BLAD.y - y) < 40);
      if (i >= 0) { const e = D.eyes.splice(i, 1)[0]; D.drag = { type: e.type, x, y }; }
    } else if (type === "move" && D.drag) { D.drag.x = x; D.drag.y = y; }
    else if (type === "up" && D.drag) {
      if (inBlad(x, y)) D.eyes.push({ x: x - BLAD.x, y: y - BLAD.y, type: D.drag.type });
      D.drag = null;
    }
  }
}

// --- tekenen -------------------------------------------------------------------
function achtergrond(g, balk = true) {
  g.fillStyle = K.papier; g.fillRect(0, 0, W, H);
  if (balk) { g.fillStyle = K.vlak; g.fillRect(0, BAR_Y, W, H - BAR_Y); }
}
function blad(g) {
  rr(g, BLAD.x, BLAD.y, BLAD.w, BLAD.h, 24);
  g.fillStyle = K.papier; g.fill();
  g.lineWidth = 3; g.strokeStyle = K.lijn; g.stroke();
}
function tekening(g, x = BLAD.x, y = BLAD.y, s = 1, eyesBlink = 1) {
  g.drawImage(layer(), x, y, BLAD.w * s, BLAD.h * s);
  for (const e of D.eyes) oogjes(g, x + e.x * s, y + e.y * s, 1.6 * s, e.type, eyesBlink);
}

const DRAW = {
  "1b"(g, e) {
    achtergrond(g, false);
    puntje(g, seq(["huppelen", "huppelen", "wenken"], e.t, 0.8), 330, 760, 360, e.t, { flip: true });
    tikHier(g, W / 2 + 140, H / 2, e.t);
  },
  "2a"(g, e) {
    achtergrond(g, false); blad(g);
    const scratch = clamp((e.t - 0.3) / 0.6, 0, 1);
    line(g, [W / 2 - 40, 480, lerp(W / 2 - 40, W / 2 + 10, scratch), lerp(480, 470, scratch)], K.inkt, 8);
    if (e.t < 1.3) puntje(g, "tekenen", W / 2 + 60, 560, 320, e.t);
    else {
      puntje(g, "gooien", W / 2 + 60, 560, 320, e.t);
      // the pencil flies to the child (down, out of the screen)
      const u = clamp((e.t - 1.4) / 0.9, 0, 1);
      g.save(); g.translate(lerp(W / 2 + 120, W / 2 - 200, u), lerp(380, H + 120, ease(u)) - Math.sin(u * Math.PI) * 220); g.rotate(u * 6);
      rr(g, -14, -60, 28, 100, 6); g.fillStyle = K.papier; g.fill(); g.lineWidth = 5; g.strokeStyle = K.inkt; g.stroke();
      g.beginPath(); g.moveTo(-14, 40); g.lineTo(0, 70); g.lineTo(14, 40); g.closePath(); g.fillStyle = K.inkt; g.fill();
      g.restore();
    }
  },
  "2b"(g, e) {
    achtergrond(g); blad(g); tekening(g);
    for (const b of buttons()) {
      if (b.kind === "kleur") kleurbol(g, b.x, b.y, KLEUREN[b.i], !D.erase && D.color === b.i, 0.9);
      else ipadKnop(g, b.x, b.y, b.kind, b.uit ? "uit" : b.kind === "gom" && D.erase ? "gekozen" : "normaal");
    }
    const nod = clamp((e.now - D.nodAt) / 500, 0, 1) < 1;
    puntje(g, nod ? "wijzen" : "staan", 1300, 760, 170, e.t, { flip: true });
  },
  "2c"(g, e) {
    achtergrond(g); blad(g); tekening(g);
    for (const b of buttons()) {
      if (b.kind === "oog") { rr(g, b.x - 60, b.y - 60, 120, 120, 24); g.fillStyle = K.papier; g.fill(); oogjes(g, b.x, b.y, 1.5, b.type); }
      else if (b.kind === "terug") { rr(g, b.x, b.y, 120, 120, 30); g.fillStyle = K.papier; g.fill(); g.lineWidth = 3; g.strokeStyle = K.lijn; g.stroke(); line(g, [b.x + 75, b.y + 35, b.x + 45, b.y + 60, b.x + 75, b.y + 85], K.donker, 9); }
      else ipadKnop(g, b.x, b.y, b.kind, b.uit ? "uit" : "normaal");
    }
    if (D.drag) oogjes(g, D.drag.x, D.drag.y, 1.6, D.drag.type);
    puntje(g, "wijzen", 1300, 760, 170, e.t, { flip: true });
  },
  "2d"(g, e) {
    achtergrond(g, false);
    const pop = e.t < 0.9 ? 1 : 1 + 0.08 * Math.sin((e.t - 0.9) * 14) * Math.max(0, 1 - (e.t - 0.9) / 1.6);
    const s = pop, ox = BLAD.x + (BLAD.w * (1 - s)) / 2, oy = BLAD.y + (BLAD.h * (1 - s)) / 2;
    g.save();
    if (e.t > 0.9) { g.translate(W / 2, H / 2); g.rotate(Math.sin((e.t - 0.9) * 10) * 0.03); g.translate(-W / 2, -H / 2); }
    tekening(g, ox, oy, s, (e.t > 1 && e.t < 1.15) || (e.t > 1.6 && e.t < 1.7) ? 0.15 : 1);
    g.restore();
    if (e.t > 0.8) pok(g, W / 2 + 200, H / 2 - 160, 90, clamp((e.t - 0.8) / 0.8, 0, 1));
    puntje(g, e.t < 0.9 ? "tekenen" : "juichen", e.t < 0.9 ? W / 2 + 230 : 1180, e.t < 0.9 ? 420 : 900, 280, e.t);
  },
  "2e"(g, e) {
    achtergrond(g, false);
    const u = clamp(e.t / 1.2, 0, 1);
    const s = lerp(1, 0.35, ease(u));
    const x = BLAD.x + (BLAD.w * (1 - s)) / 2, y = lerp(BLAD.y, -BLAD.h * 0.5, ease(u)) - Math.sin(u * Math.PI) * 120;
    if (u < 1) tekening(g, x, y, s);
    // the light runs from the iPad to the wall (ledstrip)
    const L = clamp((e.t - 0.6) / 1.6, 0, 1);
    for (let i = 0; i < 8; i++) { const p = (L * 1.4 - i * 0.07); if (p < 0 || p > 1) continue; dot(g, W / 2, lerp(H - 30, 30, p), 16 - i * 1.4, K.kind); }
    puntje(g, "juichen", 1150, 900, 260, e.t);
  },
  "2x"(g, e) {
    achtergrond(g); blad(g);
    g.save(); g.globalAlpha = 0.35; tekening(g); g.restore();
    for (let i = 0; i < 2; i++) { const p = (e.t * 1.2 + i * 0.5) % 1; g.save(); g.globalAlpha = (1 - p) * 0.6; g.lineWidth = 6; g.strokeStyle = K.grijs; g.beginPath(); g.arc(W / 2 + 120, 380, 40 + p * 90, 0, Math.PI * 2); g.stroke(); g.restore(); }
    puntje(g, seq(["wenken", "wijzen"], e.t, 0.5), W / 2, 760, 460, e.t);
  },
};

export function drawIpad(g, e) {
  (DRAW[S.id] || DRAW["1b"])(g, e);
}
