// =====================================================================
// Grijze bouwstenen: dezelfde kleuren en onderdelen als het Figma-bord
// "Grijze bouwstenen (UX)" in Senne's Private Workspace.
// Alles tekent op een context g in schermpixels van het virtuele scherm.
// =====================================================================

export const K = {
  papier: "#ffffff",
  vlak: "#f2f2f2",
  lijn: "#d9d9d9",
  grijs: "#9a9a9a",
  donker: "#555555",
  inkt: "#222222",
  kind: "#2f6bff",
};

export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeBack = (t) => { const c = 1.7; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function text(g, s, x, y, size, color = K.inkt, align = "center", weight = 700) {
  g.fillStyle = color;
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(s, x, y);
}

export function line(g, pts, color, w, dash = null) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
  if (dash) g.setLineDash([]);
}

export function dot(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function ring(g, x, y, r, w, color, from = 0, to = 1) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2);
  g.stroke();
}

// --- Spel-UI ---------------------------------------------------------------

// Duo-label "1", "2" of "1+2".
export function duoLabel(g, x, y, label, s = 1) {
  const w = (label.length > 1 ? 96 : 64) * s, h = 48 * s;
  rr(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = K.papier;
  g.fill();
  g.lineWidth = 3 * s;
  g.strokeStyle = K.inkt;
  g.stroke();
  text(g, label, x, y + 1, 24 * s, K.inkt);
}

// Voortgang in de tijdrace: punten + deur. n = aantal, at = huidige (0-based).
export function voortgang(g, cx, y, n, at) {
  const gap = 48, w = (n - 1) * gap + 60;
  let x = cx - w / 2;
  for (let i = 0; i < n; i++, x += gap) {
    if (i < at) dot(g, x, y, 15, K.inkt);
    else if (i === at) { dot(g, x, y, 19, K.inkt); dot(g, x, y, 9, K.papier); }
    else dot(g, x, y, 15, K.lijn);
  }
  // door
  g.lineWidth = 4;
  g.strokeStyle = at >= n ? K.inkt : K.grijs;
  rr(g, x - 6, y - 28, 40, 56, 4);
  g.stroke();
  dot(g, x + 21, y + 2, 3.5, g.strokeStyle);
}

export function tijd(g, x, y, seconds, size = 80, align = "right") {
  const m = Math.floor(seconds / 60), s = (seconds % 60).toFixed(1).padStart(4, "0");
  text(g, `${m}:${s}`, x, y, size, K.inkt, align, 800);
}

// Voetjes op de vloer (instappen). bezet = blauw.
export function voetjes(g, x, y, bezet, t = 0, s = 1) {
  const pulse = bezet ? 0 : 0.5 + 0.5 * Math.sin(t * 5);
  for (const side of [-1, 1]) {
    g.save();
    g.translate(x + side * 30 * s, y);
    g.rotate(side * 0.14);
    g.beginPath();
    g.ellipse(0, 0, 23 * s, 52 * s, 0, 0, Math.PI * 2);
    g.fillStyle = bezet ? K.kind : K.papier;
    g.fill();
    if (!bezet) {
      g.setLineDash([10 * s, 8 * s]);
      g.lineWidth = (4 + 3 * pulse) * s;
      g.strokeStyle = K.donker;
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }
}

// Jouw armlijn over het gat (blauw). juist = volle kleur.
export function armlijn(g, cx, cy, angleDeg, len, juist) {
  const a = (-angleDeg * Math.PI) / 180, dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
  g.save();
  g.globalAlpha *= juist ? 1 : 0.35;
  line(g, [cx - dx, cy - dy, cx + dx, cy + dy], K.kind, 16);
  g.restore();
}

export function verbindpunt(g, x, y, verbonden, t = 0) {
  if (!verbonden) {
    const p = (t * 1.2) % 1;
    g.save();
    g.globalAlpha *= 1 - p;
    g.lineWidth = 4;
    g.strokeStyle = K.grijs;
    g.beginPath();
    g.arc(x, y, 18 + 26 * p, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  dot(g, x, y, 18, K.inkt);
}

export function doellijn(g, x0, y0, x1, y1) {
  line(g, [x0, y0, x1, y1], K.grijs, 8, [18, 16]);
}

// Sterretjes bij "gelukt". t = 0..1 (verloop van het effect).
export function sterretjes(g, x, y, t) {
  const pts = [[-70, -40, 34], [40, -70, 24], [80, 20, 30], [-30, 50, 18], [10, -10, 14]];
  for (const [dx, dy, r] of pts) {
    const k = easeOut(t), a = 1 - clamp((t - 0.5) / 0.5, 0, 1);
    ster(g, x + dx * k * 1.4, y + dy * k * 1.4 - 30 * t, r * (0.4 + 0.6 * easeBack(Math.min(1, t * 2))), a);
  }
}
export function ster(g, x, y, r, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = K.inkt;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r;
    g[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  g.closePath();
  g.fill();
  g.restore();
}

export function pijl(g, x, y, s = 1, color = K.inkt) {
  line(g, [x - 100 * s, y, x + 100 * s, y], color, 24 * s);
  line(g, [x + 50 * s, y - 50 * s, x + 100 * s, y, x + 50 * s, y + 50 * s], color, 24 * s);
}

// --- iPad-UI ----------------------------------------------------------------

// iPad-knop: type kleur | gom | oogjes | klaar; toestand normaal | gekozen | uit.
export function ipadKnop(g, x, y, type, toestand, kleur = K.donker, s = 1) {
  const w = 120 * s;
  rr(g, x, y, w, w, 30 * s);
  g.fillStyle = toestand === "gekozen" ? K.inkt : toestand === "uit" ? K.vlak : K.papier;
  g.fill();
  if (toestand === "normaal") { g.lineWidth = 3 * s; g.strokeStyle = K.lijn; g.stroke(); }
  const ic = toestand === "gekozen" ? K.papier : toestand === "uit" ? K.lijn : K.donker;
  const cx = x + w / 2, cy = y + w / 2;
  if (type === "kleur") dot(g, cx, cy, 28 * s, toestand === "uit" ? K.lijn : kleur);
  if (type === "gom") {
    g.save(); g.translate(cx, cy); g.rotate(0.5);
    rr(g, -32 * s, -18 * s, 64 * s, 36 * s, 8 * s); g.fillStyle = ic; g.fill();
    g.restore();
  }
  if (type === "oogjes") for (const dx of [-20, 20]) { g.lineWidth = 5 * s; g.strokeStyle = ic; g.beginPath(); g.arc(cx + dx * s, cy, 16 * s, 0, Math.PI * 2); g.stroke(); dot(g, cx + dx * s + 2 * s, cy + 2 * s, 6 * s, ic); }
  if (type === "klaar") line(g, [cx - 29 * s, cy, cx - 9 * s, cy + 20 * s, cx + 29 * s, cy - 20 * s], ic, 10 * s);
}

export function kleurbol(g, x, y, kleur, gekozen, s = 1) {
  if (gekozen) { g.lineWidth = 5 * s; g.strokeStyle = K.inkt; g.beginPath(); g.arc(x, y, 46 * s, 0, Math.PI * 2); g.stroke(); }
  dot(g, x, y, 36 * s, kleur);
}

// Geplakte oogjes (zoals de Figma-component "Krabbel oogjes"). type: rond | groot | klein | slaperig.
export function oogjes(g, x, y, s = 1, type = "rond", blink = 1, look = 0) {
  const r = (type === "groot" ? 15 : type === "klein" ? 9 : 12) * s;
  for (const dx of [-1, 1]) {
    const ex = x + dx * r * 1.25;
    g.save();
    g.translate(ex, y);
    g.scale(1, type === "slaperig" ? 0.55 * blink : blink);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.lineWidth = 2.6 * s;
    g.strokeStyle = "#4a4a4f";
    g.stroke();
    dot(g, look * r * 0.35, r * 0.1, r * 0.45, "#4a4a4f");
    dot(g, look * r * 0.35 + r * 0.18, -r * 0.1, r * 0.14, "#fff");
    g.restore();
  }
}
export const OOGTYPES = ["rond", "groot", "klein", "slaperig"];

// Tik-teken zonder tekst (iPad in rust).
export function tikHier(g, x, y, t) {
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.7 + i * 0.5) % 1);
    g.save();
    g.globalAlpha *= (1 - p) * 0.7;
    g.lineWidth = 5;
    g.strokeStyle = K.grijs;
    g.beginPath();
    g.arc(x, y, 50 + p * 70, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  dot(g, x, y, 45 + 3 * Math.sin(t * 6), K.inkt);
}

// Een uitlegkaart / bordje-achtergrond
export function kaart(g, x, y, w, h, r = 28) {
  rr(g, x, y, w, h, r);
  g.fillStyle = K.papier;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = K.lijn;
  g.stroke();
}
