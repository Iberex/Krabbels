// =====================================================================
// Personages uit Figma (Senne's Private Workspace, wireframe-componenten),
// als één spritesheet: assets/personages.png (2x).
// =====================================================================

const img = new Image();
img.src = "assets/personages.png?v=20261117g";
export const ready = new Promise((res) => (img.onload = res));

// [x, y, w, h] in Figma-px (1x). De afbeelding is 2x.
const A = {
  puntje: { staan: [50, 15, 170, 210], huppelen: [320, 15, 170, 210], wijzen: [590, 15, 170, 210], wenken: [860, 15, 170, 210], "armen wijd": [1130, 15, 170, 210], "armen omhoog": [1400, 15, 170, 210], juichen: [50, 255, 170, 210], springen: [320, 255, 170, 210], bukken: [590, 255, 170, 210], tekenen: [860, 255, 170, 210], buigen: [1130, 255, 170, 210], gooien: [1400, 255, 170, 210] },
  krabbel: { staan: [60, 530, 150, 140], lopen: [330, 530, 150, 140], omkijken: [600, 530, 150, 140], wiebelen: [870, 530, 150, 140], springen: [1140, 530, 150, 140], bukken: [1410, 530, 150, 140], klimmen: [60, 770, 150, 140], vallen: [330, 770, 150, 140], juichen: [600, 770, 150, 140], zwaaien: [870, 770, 150, 140] },
  kind: { staan: [1145, 730, 140, 220], "armen wijd": [1415, 730, 140, 220], "armen schuin": [65, 970, 140, 220], "armen omhoog": [335, 970, 140, 220], springen: [605, 970, 140, 220], bukken: [875, 970, 140, 220], "hand in hand": [1085, 970, 260, 220] },
};
const BASE = { puntje: 210, krabbel: 140, kind: 220 }; // frame height in Figma

// Teken een houding met de onderkant van het frame op (x, y). h = hoogte van het frame op het scherm.
export function sprite(g, set, pose, x, y, h, { flip = false, alpha = 1, rot = 0, sx = 1, sy = 1 } = {}) {
  const a = A[set][pose] || A[set].staan;
  const k = h / BASE[set], w = a[2] * k, hh = a[3] * k;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale((flip ? -1 : 1) * sx, sy);
  g.drawImage(img, a[0] * 2, a[1] * 2, a[2] * 2, a[3] * 2, -w / 2, -hh, w, hh);
  g.restore();
}

// Een volgorde van houdingen in een lus: elke houding blijft `step` seconden staan.
export function seq(list, t, step = 0.7) {
  return list[Math.floor(Math.max(0, t) / step) % list.length];
}

// Puntje met een klein huppeltje (hij staat op zijn punt).
export function puntje(g, pose, x, y, h = 240, t = 0, opts = {}) {
  const hop = pose === "huppelen" || pose === "springen" ? Math.abs(Math.sin(t * 6)) * h * 0.12 : Math.sin(t * 3) * h * 0.01;
  const squash = pose === "juichen" ? 1 + 0.04 * Math.sin(t * 14) : 1;
  sprite(g, "puntje", pose, x, y - hop, h, { ...opts, sy: squash, sx: 2 - squash });
}
