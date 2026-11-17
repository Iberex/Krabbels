// =====================================================================
// Krabbel: a child's drawing that comes to life
// ---------------------------------------------------------------------
// The drawing itself is never redrawn: this module only measures its shape
// (a mask of the opaque pixels), optionally fills the inside of an outline
// drawing with paper white, and animates it: breathing, walking, jelly wobble,
// squash and stretch, quick flips, blinks, jumps and a happy wave.
//
//   import { Krabbel } from "./krabbel.js";
//   const k = new Krabbel(image, { x: 300, y: 500, size: 140 });
//   k.update(dt); k.draw(ctx);           // every frame (dt in seconds)
//   k.walkTo(600); k.jump(); k.wave();   // behaviour
//
// Eyes: googly eyes where the child stuck them (options.eyes = [{ x, y, r }]),
// an automatic pair, or none. Legs: drawn legs are cut out of the drawing and
// swing; a single stick hops like a pogo stick; only a round or flat bottom
// gets stick legs (options.legs).
//
// k.x, k.y is the point between the feet, on the ground (canvas pixels).
// A host that moves the Krabbel itself (e.g. along a level path) can also
// just set k.x / k.y every frame: update() sees the movement and plays the
// walk cycle by itself.
//
// Also exported:
//   cropDrawing(canvas)  drawing canvas -> transparent, cropped body image
//   makeStickers(k)      colour + black-and-white sticker canvases
//   growMask, fillHoles  small mask helpers (used by the paper scan)
// Plain ES module, no dependencies.
// =====================================================================

export const KRABBEL_DEFAULTS = {
  x: 0,
  y: 0,
  size: 140, // px. Long side of the drawing on screen.
  legLength: 0.28, // × size
  legWidth: 0.03, // × size (at least 2 px)
  stride: 0.1, // × size. How far a foot swings forward and back.
  walkSpeed: 90, // px per second
  gravity: 2000, // px per second²
  jumpHeight: 0.45, // × size. Height of jump() above the higher of start and landing.
  eyes: "auto", // "auto" = two googly eyes placed on the shape, "off" = none, or a list [{ x, y, r }] in body-image px (placed by the child)
  eyeScale: 1, // × the automatic eye size
  legs: "auto", // "auto" = animate drawn legs, else add stick legs · "always" = always add stick legs · "never" = never add stick legs
  legDetect: {
    scanUp: 0.7, // how far up from the bottom (fraction of the height) to look for the hip, where the legs join the body
    maxWidth: 0.28, // a leg is at most this wide (fraction of the body width)
    minLength: 0.1, // drawn legs are at least this long (fraction of the height); shorter = just a bumpy bottom
    footZone: 0.12, // wider bits in the lowest part (fraction of the height) are drawn feet, not the body
  },
  legSwing: 0.35, // radians. How far drawn legs swing while walking.
  pogoHeight: 0.16, // × size. How high a one-legged Krabbel hops.
  pogoStep: 0.5, // × size. Distance per hop.
  fillInside: null, // a colour (e.g. "#fffdf4") fills the enclosed parts of an outline drawing, behind the strokes
  breathe: 0.03, // idle breathing: ± this fraction of the height
  bob: 0.045, // × size. Up-and-down bounce while walking.
  wobble: 0.018, // jelly wobble strength (fraction of the height)
  wobbleStrips: 14, // vertical strips for the jelly wobble
  flip: true, // mirror the drawing when walking left
  blinkMin: 3, // seconds between blinks
  blinkMax: 6,
  ink: "#1f2340", // legs, arm and eye outlines
  popIn: false, // true = eyes and legs pop out, then it blinks, looks at you and hops
  ground: null, // (x, yFrom, yTo) => y of the first surface crossed going down, or null. Without it the ground is flat.
  maxPixelRatio: 2,
};

const BLINK_TIME = 0.16; // seconds, eyes closed and open again
const MASK_SIZE = 160; // long side of the shape mask, in mask pixels
const LOOK_AROUND = [
  { x: 0.9, y: -0.2 },
  { x: 0, y: 0.3 },
  { x: -0.95, y: -0.1 },
  { x: -0.3, y: -0.8 },
];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function sourceSize(img) {
  return {
    w: img.naturalWidth || img.videoWidth || img.width,
    h: img.naturalHeight || img.videoHeight || img.height,
  };
}

// Downscale in halving steps, so a big drawing still looks crisp when small.
function resample(image, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let src = image;
  let { w: sw, h: sh } = sourceSize(image);
  while (sw > w * 2 && sh > h * 2) {
    const half = makeCanvas(sw / 2, sh / 2);
    half.getContext("2d").drawImage(src, 0, 0, half.width, half.height);
    src = half;
    sw = half.width;
    sh = half.height;
  }
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return c;
}

// ---------------------------------------------------------------------
// Cropping: the drawn pixels, with some padding, on a transparent background
// ---------------------------------------------------------------------
export function cropDrawing(source, { padding = 24, alphaThreshold = 10, minPixels = 40 } = {}) {
  const { w, h } = sourceSize(source);
  let g = source.getContext ? source.getContext("2d") : null;
  if (!g) {
    const c = makeCanvas(w, h);
    g = c.getContext("2d");
    g.drawImage(source, 0, 0);
  }
  const data = g.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] <= alphaThreshold) continue;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (count < minPixels) return null;

  const box = { x: x0 - padding, y: y0 - padding, w: x1 - x0 + 1 + padding * 2, h: y1 - y0 + 1 + padding * 2 };
  const c = makeCanvas(box.w, box.h);
  c.getContext("2d").drawImage(g.canvas, -box.x, -box.y);
  return { canvas: c, box, pixels: count };
}

// ---------------------------------------------------------------------
// Mask helpers (0/1 per pixel)
// ---------------------------------------------------------------------

// Grow a mask by r pixels (square brush, two passes).
export function growMask(src, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!src[row + x]) continue;
      const b = Math.min(w - 1, x + r);
      for (let xx = Math.max(0, x - r); xx <= b; xx++) tmp[row + xx] = 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!tmp[y * w + x]) continue;
      const b = Math.min(h - 1, y + r);
      for (let yy = Math.max(0, y - r); yy <= b; yy++) out[yy * w + x] = 1;
    }
  }
  return out;
}

function shrinkMask(src, w, h, r) {
  const grown = growMask(src.map((v) => 1 - v), w, h, r);
  return grown.map((v) => 1 - v);
}

// Everything that can't be reached from the border through empty pixels is inside.
export function fillHoles(src, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  const push = (i) => {
    if (!src[i] && !outside[i]) {
      outside[i] = 1;
      stack[n++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (n) {
    const i = stack[--n];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  return outside.map((v) => 1 - v);
}

// ---------------------------------------------------------------------
// Shape analysis: where do the eyes, legs and waving arm go?
// Everything is returned in body-image pixels.
// ---------------------------------------------------------------------
function analyseBody(image) {
  const { w: iw, h: ih } = sourceSize(image);
  const m = Math.min(1, MASK_SIZE / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * m));
  const h = Math.max(1, Math.round(ih * m));
  const c = makeCanvas(w, h);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;

  const raw = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] > 40) {
      raw[i] = 1;
      any = true;
    }
  }
  if (!any) raw.fill(1); // fully transparent image: treat the whole box as the body

  // Close small gaps and fill enclosed areas: the inside of an outline drawing counts as body.
  const r = Math.max(1, Math.round(Math.max(w, h) * 0.02));
  const solid = shrinkMask(fillHoles(growMask(raw, w, h, r), w, h), w, h, r);
  for (let i = 0; i < w * h; i++) solid[i] |= raw[i];
  const at = (x, y) => solid[y * w + x];

  let bx0 = w;
  let by0 = h;
  let bx1 = 0;
  let by1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;
  const L = Math.max(bw, bh);

  // Eyes: the widest row in the top 45%. Of the rows that are nearly as wide,
  // take the highest one (for a round shape that sits nicely above the middle).
  const rows = [];
  const yEnd = by0 + Math.floor(bh * 0.45);
  for (let y = by0; y <= yEnd; y++) {
    let best = null;
    let start = -1;
    for (let x = bx0; x <= bx1 + 1; x++) {
      const on = x <= bx1 && at(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (!best || x - start > best.len) best = { y, s: start, e: x - 1, len: x - start };
        start = -1;
      }
    }
    if (best) rows.push(best);
  }
  const maxLen = Math.max(...rows.map((row) => row.len));
  const pick = rows.find((row) => row.len >= maxLen * 0.85);
  const er = clamp(pick.len * 0.2, L * 0.075, L * 0.13);
  const eyes = {
    x: (pick.s + pick.e + 1) / 2,
    y: clamp(pick.y + 0.5, by0 + er * 0.9, by0 + Math.max(er * 0.9, bh * 0.45)),
    r: er,
  };

  // Legs: from the lowest body pixel at 35% and 65% of the width.
  const hips = [0.35, 0.65].map((f) => {
    const cx = Math.round(bx0 + f * (bw - 1));
    for (let d = 0; d < bw; d++) {
      for (const x of [cx - d, cx + d]) {
        if (x < bx0 || x > bx1) continue;
        for (let y = by1; y >= by0; y--) if (at(x, y)) return { x: x + 0.5, y: y + 0.8 };
      }
    }
    return { x: cx + 0.5, y: by1 + 1 };
  });

  // Waving arm: the right edge of the body, a bit below the middle.
  let arm = { x: bx1 + 1, y: by0 + bh * 0.55 };
  const armRow = Math.round(by0 + bh * 0.55);
  search: for (let d = 0; d < bh; d++) {
    for (const y of [armRow - d, armRow + d]) {
      if (y < by0 || y > by1) continue;
      for (let x = bx1; x >= bx0; x--) {
        if (at(x, y)) {
          arm = { x: x + 1, y: y + 0.5 };
          break search;
        }
      }
    }
  }

  // Debug: the outline of the mask as a little pixel image.
  const outline = makeCanvas(w, h);
  const og = outline.getContext("2d");
  const od = og.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      if (!edge) continue;
      const i = (y * w + x) * 4;
      od.data[i] = 255;
      od.data[i + 1] = 43;
      od.data[i + 2] = 214;
      od.data[i + 3] = 255;
    }
  }
  og.putImageData(od, 0, 0);

  const kx = iw / w; // image px per mask px
  const ky = ih / h;
  const img = (p) => ({ x: p.x * kx, y: p.y * ky });
  const hipsImg = hips.map(img);
  return {
    eyes: { x: eyes.x * kx, y: eyes.y * ky, r: eyes.r * Math.max(kx, ky) },
    hips: hipsImg,
    anchor: { x: (hipsImg[0].x + hipsImg[1].x) / 2, y: Math.max(hipsImg[0].y, hipsImg[1].y) },
    arm: img(arm),
    left: bx0 * kx,
    right: (bx1 + 1) * kx,
    top: by0 * ky,
    outline,
    mask: { w, h, kx, ky, solid, bx0, bx1, by0, by1 },
  };
}

const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

function toCanvas(image) {
  const { w, h } = sourceSize(image);
  const c = makeCanvas(w, h);
  c.getContext("2d").drawImage(image, 0, 0);
  return c;
}

// Outline drawings: fill the enclosed parts with paper white, behind the strokes.
function fillInside(image, sh, color) {
  const { w, h, solid } = sh.mask;
  const inner = shrinkMask(solid, w, h, 1); // stays under the strokes, no white rim outside
  const n = parseInt(color.slice(1), 16);
  const mc = makeCanvas(w, h);
  const mg = mc.getContext("2d");
  const id = mg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!inner[i]) continue;
    id.data[i * 4] = n >> 16;
    id.data[i * 4 + 1] = (n >> 8) & 255;
    id.data[i * 4 + 2] = n & 255;
    id.data[i * 4 + 3] = 255;
  }
  mg.putImageData(id, 0, 0);
  const { w: iw, h: ih } = sourceSize(image);
  const c = makeCanvas(iw, ih);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(mc, 0, 0, iw, ih);
  g.drawImage(image, 0, 0);
  return c;
}

// Did the child draw legs? Going up from the bottom of the mask: narrow runs of
// pixels (legs) until they merge into the body (the hip row). Returns
// { hip, labels, legs } in mask px (labels: leg number per pixel, 0 = body), or null.
function detectLegs(sh, o) {
  const { w, h, solid, bx0, bx1, by0, by1 } = sh.mask;
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;
  const at = (x, y) => solid[y * w + x];
  const runsAt = (y) => {
    const runs = [];
    let start = -1;
    for (let x = bx0; x <= bx1 + 1; x++) {
      const on = x <= bx1 && at(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        runs.push(x - start);
        start = -1;
      }
    }
    return runs;
  };
  const maxW = Math.max(2, o.maxWidth * bw);
  const footRows = Math.round(o.footZone * bh);
  const top = Math.max(by0, by1 - Math.round(o.scanUp * bh));

  let started = false;
  let count = 0; // most legs seen in one row
  const legWidths = []; // the widest run of every leg row
  let hip = -1;
  for (let y = by1; y >= top; y--) {
    const runs = runsAt(y);
    const allNarrow = runs.length > 0 && runs.every((r) => r <= maxW);
    if (!started) {
      if (allNarrow) started = true;
      else if (by1 - y > footRows) return null; // wide at the bottom: a round or flat bottom
      else continue; // drawn feet
    }
    if (!allNarrow) {
      // One stick: the body must be clearly wider than the stick usually is (a lollipop, not a cone).
      const typical = legWidths.sort((a, b) => a - b)[legWidths.length >> 1] || 1;
      if (count < 2 && Math.max(0, ...runs) < typical * 1.8) return null;
      hip = y + 1;
      break;
    }
    if (count >= 2 && runs.length < count) {
      hip = y + 1; // two legs merge into one body (a stick figure)
      break;
    }
    count = Math.max(count, runs.length);
    legWidths.push(Math.max(...runs));
  }
  if (hip < 0) return null; // never joins a body (e.g. just lines)
  if (by1 - hip + 1 < o.minLength * bh || hip - by0 < 0.2 * bh) return null;

  // The legs: connected pieces below the hip that hang from the body and reach (near) the bottom.
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const legs = [];
  const legRows = by1 - hip + 1;
  for (let y0 = hip; y0 <= by1; y0++) {
    for (let x0 = bx0; x0 <= bx1; x0++) {
      const p0 = y0 * w + x0;
      if (!solid[p0] || labels[p0]) continue;
      const id = legs.length + 1;
      const leg = { id, minX: x0, maxX: x0, minY: y0, maxY: y0, count: 0, sumTopX: 0, topN: 0, sumFootX: 0, footN: 0, pixels: [] };
      let n = 0;
      stack[n++] = p0;
      labels[p0] = id;
      while (n) {
        const p = stack[--n];
        const x = p % w;
        const y = (p - x) / w;
        leg.pixels.push(p);
        leg.count++;
        leg.minX = Math.min(leg.minX, x);
        leg.maxX = Math.max(leg.maxX, x);
        leg.minY = Math.min(leg.minY, y);
        leg.maxY = Math.max(leg.maxY, y);
        if (y === hip) {
          leg.sumTopX += x;
          leg.topN++;
        }
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > hip ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q >= 0 && solid[q] && !labels[q]) {
            labels[q] = id;
            stack[n++] = q;
          }
        }
      }
      legs.push(leg);
    }
  }
  const kept = legs.filter((l) => l.topN > 0 && l.maxY >= by1 - legRows * 0.3 && l.count > 3);
  if (!kept.length) return null;
  labels.fill(0);
  kept.forEach((l, i) => {
    l.id = i + 1;
    for (const p of l.pixels) labels[p] = l.id;
    let sum = 0;
    let n = 0;
    for (const p of l.pixels) {
      if (Math.floor(p / w) >= l.maxY - 1) {
        sum += p % w;
        n++;
      }
    }
    l.pivotX = l.sumTopX / l.topN + 0.5;
    l.footX = sum / n + 0.5;
    delete l.pixels;
  });
  return { hip, labels, legs: kept };
}

// Cut the drawing at the hip row: the body, plus one image per drawn leg (in body-image px).
function splitLegs(image, sh, det) {
  const { w, h, kx, ky } = sh.mask;
  // Each leg also takes the soft crayon edge around it (1 mask px), below the hip only.
  const lab = det.labels.slice();
  for (let y = det.hip; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (det.labels[p]) continue;
      const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > det.hip ? p - w : -1, y < h - 1 ? p + w : -1].find((q) => q >= 0 && det.labels[q]);
      if (near !== undefined) lab[p] = det.labels[near];
    }
  }
  const iw = image.width;
  const ih = image.height;
  const src = image.getContext("2d").getImageData(0, 0, iw, ih);
  const body = new ImageData(new Uint8ClampedArray(src.data), iw, ih);
  const pieces = det.legs.map((l) => {
    const x = Math.max(0, Math.floor((l.minX - 1) * kx));
    const y = Math.max(0, Math.floor(det.hip * ky));
    const x1 = Math.min(iw, Math.ceil((l.maxX + 2) * kx));
    const y1 = Math.min(ih, Math.ceil((l.maxY + 2) * ky));
    return { id: l.id, x, y, w: x1 - x, h: y1 - y, px: l.pivotX * kx, py: det.hip * ky, footX: l.footX * kx, data: new ImageData(Math.max(1, x1 - x), Math.max(1, y1 - y)) };
  });
  for (let y = Math.floor(det.hip * ky); y < ih; y++) {
    const my = Math.min(h - 1, Math.floor(y / ky));
    for (let x = 0; x < iw; x++) {
      const l = lab[my * w + Math.min(w - 1, Math.floor(x / kx))];
      if (!l) continue;
      const piece = pieces[l - 1];
      const i = (y * iw + x) * 4;
      if (x >= piece.x && x < piece.x + piece.w && y < piece.y + piece.h) {
        const j = ((y - piece.y) * piece.w + (x - piece.x)) * 4;
        for (let k = 0; k < 4; k++) piece.data.data[j + k] = src.data[i + k];
      }
      body.data[i + 3] = 0;
    }
  }
  const bodyCanvas = makeCanvas(iw, ih);
  bodyCanvas.getContext("2d").putImageData(body, 0, 0);
  for (const piece of pieces) {
    piece.canvas = makeCanvas(piece.w, piece.h);
    piece.canvas.getContext("2d").putImageData(piece.data, 0, 0);
    delete piece.data;
  }
  return { body: bodyCanvas, pieces };
}

// ---------------------------------------------------------------------
// The Krabbel
// ---------------------------------------------------------------------
export class Krabbel {
  constructor(bodyImage, options = {}) {
    const o = (this.opts = {
      ...KRABBEL_DEFAULTS,
      ...options,
      legDetect: { ...KRABBEL_DEFAULTS.legDetect, ...(options.legDetect || {}) },
    });
    const { w, h } = sourceSize(bodyImage);
    this.imgW = w;
    this.imgH = h;
    this.maxDim = Math.max(w, h);
    const sh = (this.shape = analyseBody(bodyImage));
    const m = sh.mask;

    // The drawing as a canvas. Outline drawings get a paper-white inside, behind the strokes.
    this.image = o.fillInside ? fillInside(bodyImage, sh, o.fillInside) : toCanvas(bodyImage);
    this.bodyImage = this.image; // without the drawn legs, if it has any
    this.legPieces = []; // drawn legs, cut out of the drawing: { canvas, x, y, w, h, px, py } in body-image px

    // Legs: the child's own legs swing ("drawn"), one stick hops like a pogo stick ("pogo"),
    // a round or flat bottom gets stick legs ("sticks"), or nothing at all ("none").
    const bottomY = (m.by1 + 1) * m.ky;
    this.hipY = null; // hip row in body-image px (debug)
    const det = o.legs === "always" ? null : detectLegs(sh, o.legDetect);
    if (det && det.legs.length >= 2) {
      this.legMode = "drawn";
      const split = splitLegs(this.image, sh, det);
      this.bodyImage = split.body;
      this.legPieces = split.pieces;
      sh.anchor = { x: average(split.pieces.map((p) => p.px)), y: bottomY };
      sh.wobbleY = det.hip * m.ky; // the body wobbles above the hip, the legs stay solid
      this.hipY = det.hip * m.ky;
    } else if (det) {
      this.legMode = "pogo";
      sh.anchor = { x: det.legs[0].footX * m.kx, y: bottomY };
      sh.wobbleY = bottomY;
      this.hipY = det.hip * m.ky;
    } else if (o.legs === "never") {
      this.legMode = "none";
      sh.anchor = { x: ((m.bx0 + m.bx1 + 1) / 2) * m.kx, y: bottomY };
      sh.wobbleY = bottomY;
    } else {
      this.legMode = "sticks";
      sh.wobbleY = sh.anchor.y;
    }

    // Eyes: where the child stuck them, the automatic pair, or none.
    const eyes = o.autoEyes === false ? "off" : o.eyes;
    if (Array.isArray(eyes)) {
      this.eyeList = eyes.map((e) => ({ x: e.x, y: e.y, r: e.r }));
    } else if (eyes === "auto") {
      const e = sh.eyes;
      const r = e.r * o.eyeScale;
      this.eyeList = [
        { x: e.x - r * 1.02, y: e.y, r },
        { x: e.x + r * 1.02, y: e.y, r: r * 0.9 },
      ];
    } else {
      this.eyeList = [];
    }

    this.x = o.x;
    this.y = o.y;
    this.homeY = o.y; // where a jump without a ground function lands
    this.vx = 0;
    this.vy = 0;
    this.airborne = false;
    this.jumpTo = null;
    this.pendingJump = null;
    this.crouchT = 0;
    this.target = null; // walkTo x
    this.facing = 1; // 1 = right (the drawing as drawn), -1 = left (mirrored)
    this.flip = 1; // animated towards facing
    this.moving = false;
    this.walkBlend = 0;
    this.phase = 0; // walk cycle
    this.squash = 0; // > 0 squashed, < 0 stretched
    this.squashVel = 0;
    this.wobbleBoost = 0;
    this.look = { x: 0, y: 0.2 }; // googly pupils, springy
    this.lookVel = { x: 0, y: 0 };
    this.lookOverride = null;
    this.blinkT = 0;
    this.nextBlink = rand(o.blinkMin, o.blinkMax);
    this.waveT = 0;
    this.lookAroundT = 0;
    this.introT = o.popIn ? 0 : -1;
    this.grow = o.popIn ? 0 : 1; // eyes and legs, 0..1 (pops a bit past 1)
    this.introStep = 0;
    this.scale = 1; // extra scale for the host (e.g. shrinking into a door)
    this.alpha = 1;
    this.time = 0;
    this.seed = Math.random() * 100;
    this._lastX = this.x;
    this.setSize(o.size);
  }

  // Load a PNG (e.g. a saved drawing) and make a Krabbel of it.
  static load(url, options) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(new Krabbel(img, options));
      img.onerror = () => reject(new Error(`Could not load ${url}`));
      img.src = url;
    });
  }

  setSize(size) {
    const o = this.opts;
    this.size = size;
    this.s = size / this.maxDim; // screen px per body-image px
    this.legLen = this.legMode === "sticks" ? o.legLength * size : 0;
    this._vRef = Math.sqrt(2 * o.gravity * size * o.jumpHeight) || 1;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, o.maxPixelRatio);
    const k = Math.min(1, this.s * dpr);
    // Pre-scaled copies for drawing
    this.display = resample(this.bodyImage, this.imgW * k, this.imgH * k);
    this.legDisplay = this.legPieces.map((p) => ({ ...p, canvas: resample(p.canvas, p.w * k, p.h * k) }));
  }

  // --- Behaviour --------------------------------------------------------
  walkTo(x) {
    this.target = x;
    this.lookAroundT = 0;
  }

  stop() {
    this.target = null;
  }

  // Jump in place, or to { toX, toY } (e.g. onto a platform). height: above the higher of start and landing.
  jump(opts = {}) {
    if (this.airborne || this.crouchT > 0) return false;
    this.target = null;
    const j = {
      toX: opts.toX ?? this.x,
      toY: opts.toY ?? this.y,
      height: opts.height ?? this.size * this.opts.jumpHeight,
    };
    if (Math.abs(j.toX - this.x) > 1) this.facing = Math.sign(j.toX - this.x);
    this.pendingJump = j;
    this.crouchT = opts.crouch ?? 0.13;
    return true;
  }

  // A happy hop with a waving arm, looking at the player.
  wave() {
    this.waveT = 1.6;
    this.lookAroundT = 0;
    this.target = null;
    if (!this.airborne) this.jump({ height: this.size * 0.25, crouch: 0.1 });
  }

  lookAround(seconds = 2.2) {
    this.target = null;
    this.lookAroundT = seconds;
  }

  // Look in a direction (x, y in -1..1; 0, 0.25 = at the player) for a while.
  lookAt(x, y, seconds = 1) {
    this.lookOverride = { x, y, t: seconds };
  }

  // A squash-and-wobble, e.g. when a host-driven Krabbel steps off a bridge.
  boing(amount = 1) {
    this.squashVel += 5 * amount;
    this.wobbleBoost += amount;
    this.lookVel.y += 4 * amount;
  }

  // Put it somewhere, standing still (e.g. after a resize).
  placeAt(x, y) {
    this.x = this._lastX = x;
    this.y = this.homeY = y;
    this.vx = this.vy = 0;
    this.airborne = false;
    this.target = this.jumpTo = this.pendingJump = null;
    this.crouchT = 0;
  }

  get grounded() {
    return !this.airborne;
  }

  // Walking, jumping, waving, looking around or still coming to life.
  get busy() {
    return this.airborne || this.crouchT > 0 || this.target !== null || this.waveT > 0 || this.lookAroundT > 0 || this.introT >= 0;
  }

  get bodyWidth() {
    return (this.shape.right - this.shape.left) * this.s * this.scale;
  }

  // Screen rectangle of the body image in its rest pose.
  bodyRect() {
    const s = this.s * this.scale;
    const a = this.shape.anchor;
    const left = this.flip < 0 ? this.x - (this.imgW - a.x) * s : this.x - a.x * s;
    return { x: left, y: this.y - this.legLen * this.scale - a.y * s, w: this.imgW * s, h: this.imgH * s };
  }

  hitTest(px, py, margin = 8) {
    const r = this.bodyRect();
    return px >= r.x - margin && px <= r.x + r.w + margin && py >= r.y - margin && py <= this.y + margin;
  }

  // --- Update -----------------------------------------------------------
  update(dt) {
    if (!(dt > 0)) return;
    const steps = Math.ceil(dt / 0.02); // small steps keep the springs stable on slow frames
    for (let i = 0; i < steps; i++) this._step(dt / steps);
  }

  _step(dt) {
    const o = this.opts;
    this.time += dt;

    // Coming to life: eyes and legs pop out, a blink, a look at the player, a happy hop.
    if (this.introT >= 0) {
      this.introT += dt;
      this.grow = this.introT < 0.5 ? easeOutBack(clamp(this.introT / 0.5, 0, 1)) : 1;
      if (this.introStep === 0 && this.introT > 0.75) {
        this.introStep = 1;
        this.blinkT = BLINK_TIME;
      }
      if (this.introStep === 1 && this.introT > 1.15) {
        this.introStep = 2;
        this.wave();
      }
      if (this.introT > 2.9) this.introT = -1;
    }

    // Jumps start with a short crouch.
    if (this.crouchT > 0) {
      this.crouchT -= dt;
      if (this.crouchT <= 0) {
        this.crouchT = 0;
        this._launch();
      }
    }

    if (this.airborne) {
      this._air(dt);
    } else if (this.target !== null && this.crouchT <= 0) {
      const dx = this.target - this.x;
      const step = o.walkSpeed * dt;
      if (Math.abs(dx) <= step) {
        this.x = this.target;
        this.target = null;
      } else {
        this.x += Math.sign(dx) * step;
      }
    }

    // Walked off an edge: fall.
    if (!this.airborne && this.crouchT <= 0 && o.ground && o.ground(this.x, this.y - 2, this.y + 2) === null) {
      this.airborne = true;
      this.vx = Math.sign(this.x - this._lastX) * o.walkSpeed * 0.5;
      this.vy = 0;
      this.jumpTo = null;
      this.target = null;
    }

    // The movement of this step (own walking, or moved by the host) drives the walk cycle.
    const moved = this.x - this._lastX;
    this._lastX = this.x;
    this.moving = !this.airborne && Math.abs(moved) / dt > 6;
    if (this.moving) {
      this.facing = Math.sign(moved);
      const stepLength = this.legMode === "pogo" ? o.pogoStep * this.size : 2 * o.stride * this.size;
      this.phase += (Math.abs(moved) / stepLength) * Math.PI;
    } else if (this.airborne && Math.abs(this.vx) > 1) {
      this.facing = Math.sign(this.vx);
    }
    this.walkBlend = approach(this.walkBlend, this.moving ? 1 : 0, dt * 6);
    if (this.walkBlend === 0) this.phase = 0;

    // Turning around: a quick flip through zero, with a squash.
    if (this.flip !== this.facing) {
      const before = this.flip;
      this.flip = approach(this.flip, this.facing, dt / 0.09);
      if (before !== 0 && before * this.flip <= 0) {
        this.squashVel += 3.5;
        this.wobbleBoost += 0.4;
      }
    }

    // Squash and stretch: a bouncy spring. Crouch = squash, rising = stretch.
    let target = 0;
    if (this.crouchT > 0) target = 0.22;
    else if (this.airborne) target = clamp((this.vy / this._vRef) * 0.16, -0.16, 0.08);
    this.squashVel += (-280 * (this.squash - target) - 12 * this.squashVel) * dt;
    this.squash = clamp(this.squash + this.squashVel * dt, -0.3, 0.38);
    this.wobbleBoost = Math.min(1.5, this.wobbleBoost) * Math.exp(-2.5 * dt);

    // Timers
    this.waveT = Math.max(0, this.waveT - dt);
    this.lookAroundT = Math.max(0, this.lookAroundT - dt);
    if (this.lookOverride && (this.lookOverride.t -= dt) <= 0) this.lookOverride = null;
    if (this.blinkT > 0) {
      this.blinkT = Math.max(0, this.blinkT - dt);
    } else if ((this.nextBlink -= dt) <= 0) {
      this.blinkT = BLINK_TIME;
      this.nextBlink = rand(o.blinkMin, o.blinkMax);
    }

    // Googly pupils spring towards where it looks (and overshoot a little).
    const L = this._lookTarget();
    for (const a of ["x", "y"]) {
      this.lookVel[a] += (150 * (L[a] - this.look[a]) - 10 * this.lookVel[a]) * dt;
      this.look[a] += this.lookVel[a] * dt;
    }
    const len = Math.hypot(this.look.x, this.look.y);
    if (len > 1) {
      this.look.x /= len;
      this.look.y /= len;
    }
  }

  _lookTarget() {
    if (this.lookOverride) return this.lookOverride;
    if (this.introT >= 0 || this.waveT > 0) return { x: 0, y: 0.25 }; // at the player
    if (this.lookAroundT > 0) return LOOK_AROUND[Math.floor(this.lookAroundT / 0.55) % LOOK_AROUND.length];
    if (this.airborne) return { x: this.facing * 0.6, y: this.vy < 0 ? -0.75 : 0.6 };
    if (this.moving) return { x: this.facing, y: 0.05 }; // in the walking direction
    return { x: this.facing * 0.4, y: 0.2 };
  }

  _launch() {
    const j = this.pendingJump;
    this.pendingJump = null;
    if (!j) return;
    const g = this.opts.gravity;
    const apex = Math.min(this.y, j.toY) - Math.max(1, j.height);
    const vy0 = -Math.sqrt(2 * g * (this.y - apex));
    const flightTime = -vy0 / g + Math.sqrt((2 * (j.toY - apex)) / g);
    this.vx = (j.toX - this.x) / flightTime;
    this.vy = vy0;
    this.jumpTo = { x: j.toX, y: j.toY };
    this.homeY = this.y;
    this.airborne = true;
    this.squashVel -= 6; // stretch on take-off
  }

  _air(dt) {
    const o = this.opts;
    const prevY = this.y;
    this.vy += o.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.vy <= 0) return;

    let land = null;
    if (o.ground) {
      // Surfaces above the jump target are passed (so a Krabbel can hop off its own platform).
      const y = o.ground(this.x, prevY, this.y);
      if (y !== null && (!this.jumpTo || y >= this.jumpTo.y - 2)) land = y;
    } else {
      const floor = this.jumpTo ? this.jumpTo.y : this.homeY;
      if (this.y >= floor) land = floor;
    }
    if (land !== null) this._land(land);
  }

  _land(y) {
    const impact = clamp(this.vy / this._vRef, 0.3, 1.6);
    this.y = y;
    this.airborne = false;
    this.vx = this.vy = 0;
    this.jumpTo = null;
    this.squashVel += 5.5 * impact; // squash on landing
    this.wobbleBoost += impact;
    this.lookVel.y += 4 * impact; // the pupils bounce
  }

  // --- Draw -------------------------------------------------------------
  draw(ctx) {
    if (this.alpha <= 0.002 || this.scale <= 0.002) return;
    const o = this.opts;
    let sx = 1 + this.squash;
    let sy = 1 - this.squash;
    if (!this.airborne) {
      const b = Math.sin(this.time * 2.4 + this.seed) * o.breathe * (1 - this.walkBlend); // idle breathing
      sy *= 1 + b;
      sx *= 1 - b * 0.5;
    }
    let bob;
    if (this.legMode === "pogo") {
      // Boing, boing: hop on the stick, squash a little every time it touches the ground.
      const hop = Math.abs(Math.sin(this.phase));
      bob = hop * o.pogoHeight * this.size * this.walkBlend;
      const down = clamp(1 - hop / 0.3, 0, 1) * this.walkBlend;
      sy *= 1 - 0.14 * down;
      sx *= 1 + 0.1 * down;
    } else {
      bob = Math.abs(Math.sin(this.phase)) * o.bob * this.size * this.walkBlend * (this.legMode === "drawn" ? 0.5 : 1);
    }
    const bend = this.airborne ? 0 : clamp(this.squash, 0, 0.4) * 0.8; // stick-leg knees bend when squashed
    const hipY = -this.legLen * (1 - bend) - bob;
    const amp = o.wobble * (1 + this.walkBlend * 0.6 + this.wobbleBoost * 3);
    const t = this.time;
    const seed = this.seed;
    const wob = (u) => amp * Math.sin(t * 6.5 + u * 5.5 + seed);

    // Drawn legs swing around their hip point, alternating; in the air they tuck a little.
    const legAngles = this.legPieces.map((_, i) =>
      this.airborne ? (i % 2 ? 0.25 : -0.15) : Math.sin(this.phase + (i % 2) * Math.PI) * o.legSwing * this.walkBlend
    );

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha *= this.alpha;
    this._render(ctx, {
      src: this.display,
      pieces: this.legDisplay,
      legAngles,
      s: this.s,
      bodySize: this.size,
      sx,
      sy,
      fx: o.flip ? this.flip : 1,
      hipY,
      wob,
      strips: o.wobbleStrips,
      legs: this.legMode === "sticks" ? this._legs(hipY, sx, sy, wob, this.s, this.size, false) : [],
      eyes: { grow: this.grow, open: this.blinkT > 0 ? Math.abs((2 * this.blinkT) / BLINK_TIME - 1) : 1, look: this.look },
      arm: this.waveT > 0 && this.grow >= 1 ? -0.95 + Math.sin(t * 13) * 0.45 : null,
    });
    ctx.restore();
  }

  // Stick legs: hip and foot positions, before mirroring. Origin = between the feet.
  _legs(hipY, sx, sy, wob, s, bodySize, still) {
    const sh = this.shape;
    const o = this.opts;
    const legLen = o.legLength * bodySize;
    return sh.hips.map((h, i) => {
      const hip = {
        x: (h.x - sh.anchor.x) * s * sx,
        y: hipY + (h.y - sh.anchor.y) * s * sy * (1 + wob(h.x / this.imgW)),
      };
      const rest = legLen + (sh.anchor.y - h.y) * s; // a leg from a higher hip is longer
      const splay = (i === 0 ? -1 : 1) * bodySize * 0.015;
      let foot = { x: hip.x + splay, y: 0 };
      if (!still) {
        if (this.airborne) {
          foot = { x: hip.x + splay * 2 - bodySize * 0.03, y: hip.y + rest * (this.vy < 0 ? 0.62 : 0.88) };
        } else if (this.walkBlend > 0) {
          const p = this.phase + i * Math.PI;
          const wx = hip.x + Math.sin(p) * o.stride * bodySize;
          const wy = -Math.max(0, Math.cos(p)) * legLen * 0.28; // the swinging foot lifts
          foot = { x: lerp(foot.x, wx, this.walkBlend), y: lerp(0, wy, this.walkBlend) };
        }
        if (this.grow < 1) foot = { x: lerp(hip.x, foot.x, this.grow), y: lerp(hip.y, foot.y, this.grow) };
      }
      return { hip, foot, rest };
    });
  }

  // Draws legs, body (in wobbling strips), eyes and arm. The context origin is between the feet.
  _render(g, P) {
    const sh = this.shape;
    const ax = sh.anchor.x;
    const ay = sh.anchor.y;
    const wy = sh.wobbleY; // the wobble stretches the body up and down from this row
    const s = P.s;
    const ink = this.opts.ink;
    const lw = Math.max(2, this.opts.legWidth * P.bodySize);
    // Screen y (in the body frame) of body-image row y at wobble factor k
    const rowY = (y, k) => (wy - ay) * s + (y - wy) * s * k;
    g.lineCap = "round";
    g.lineJoin = "round";

    // Stick legs with little feet (behind the body). Knees bend forward when the leg is compressed.
    if (P.legs.some((leg) => Math.hypot(leg.foot.x - leg.hip.x, leg.foot.y - leg.hip.y) > 1)) {
      g.strokeStyle = ink;
      g.lineWidth = lw;
      g.beginPath();
      for (const { hip, foot, rest } of P.legs) {
        g.moveTo(hip.x * P.fx, hip.y);
        const dx = foot.x - hip.x;
        const dy = foot.y - hip.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5 && d < rest * 0.98) {
          const bend = Math.sqrt((rest / 2) ** 2 - (d / 2) ** 2);
          let px = -dy / d;
          let py = dx / d;
          if (px < 0) {
            px = -px;
            py = -py;
          }
          g.lineTo((hip.x + dx / 2 + px * bend) * P.fx, hip.y + dy / 2 + py * bend);
        }
        g.lineTo(foot.x * P.fx, foot.y);
        g.lineTo((foot.x + P.bodySize * 0.06 * Math.min(1, d / (rest * 0.5))) * P.fx, foot.y);
      }
      g.stroke();
    }

    g.save();
    g.translate(0, P.hipY);
    g.scale(P.fx * P.sx, P.sy);

    // The child's own legs, each turning around the point where it joins the body
    P.pieces.forEach((pc, i) => {
      g.save();
      g.translate((pc.px - ax) * s, (pc.py - ay) * s);
      g.rotate(P.legAngles[i] || 0);
      g.drawImage(pc.canvas, (pc.x - pc.px) * s, (pc.y - pc.py) * s, pc.w * s, pc.h * s);
      g.restore();
    });

    // The drawing, sliced into vertical strips that stretch a little (jelly wobble).
    const src = P.src;
    const sw = src.width;
    const srcH = src.height;
    const kx = sw / this.imgW; // source px per body-image px
    const n = Math.max(1, P.strips | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i / n) * sw);
      const b = i === n - 1 ? sw : Math.min(sw, Math.floor(((i + 1) / n) * sw) + 1); // 1 px overlap: no seams
      if (b <= a) continue;
      const k = 1 + P.wob((a + b) / 2 / sw);
      g.drawImage(src, a, 0, b - a, srcH, (a / kx - ax) * s, rowY(0, k), ((b - a) / kx) * s, this.imgH * s * k);
    }

    // Googly eyes: the ones the child stuck on (or the automatic pair)
    if (P.eyes && P.eyes.grow > 0.01) {
      const lookX = P.eyes.look.x * (P.fx < 0 ? -1 : 1);
      const lookY = P.eyes.look.y;
      const open = P.eyes.open;
      for (const e of this.eyeList) {
        const r = e.r * s * P.eyes.grow;
        const ex = (e.x - ax) * s;
        const cy = rowY(e.y, 1 + P.wob(e.x / this.imgW));
        const ry = r * Math.max(0.1, open);
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.ellipse(ex, cy, r, ry, 0, 0, Math.PI * 2);
        g.fill();
        if (open > 0.3) {
          g.save();
          g.clip();
          const pr = r * 0.5;
          const off = r - pr - r * 0.06;
          const px = ex + lookX * off;
          const py = cy + lookY * off;
          g.fillStyle = "#111111";
          g.beginPath();
          g.arc(px, py, pr, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(255, 255, 255, 0.9)";
          g.beginPath();
          g.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.28, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        g.strokeStyle = ink;
        g.lineWidth = Math.max(1.5, r * 0.13);
        g.beginPath();
        g.ellipse(ex, cy, r, ry, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // A waving stick arm with three fingers
    if (P.arm !== null) {
      const a = sh.arm;
      const ox = (a.x - ax) * s;
      const oy = rowY(a.y, 1 + P.wob(a.x / this.imgW));
      const len = P.bodySize * 0.22;
      const hx = ox + Math.cos(P.arm) * len;
      const hy = oy + Math.sin(P.arm) * len;
      g.strokeStyle = ink;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(ox - lw, oy);
      g.lineTo(hx, hy);
      for (const f of [-0.6, 0, 0.6]) {
        g.moveTo(hx, hy);
        g.lineTo(hx + Math.cos(P.arm + f) * len * 0.25, hy + Math.sin(P.arm + f) * len * 0.25);
      }
      g.stroke();
    }
    g.restore();
  }

  // The Krabbel standing still (eyes open, legs straight, facing as drawn), from the
  // full-resolution drawing. For stickers. bodySize = long side of the drawing in px.
  renderStill(bodySize = 600) {
    const s = bodySize / this.maxDim;
    const legLen = this.legMode === "sticks" ? this.opts.legLength * bodySize : 0;
    const sh = this.shape;
    const pad = bodySize * 0.6;
    const c = makeCanvas(this.imgW * s + pad * 2, this.imgH * s + legLen + pad * 2);
    const g = c.getContext("2d");
    g.translate(pad + sh.anchor.x * s, pad + sh.anchor.y * s + legLen);
    const flat = () => 0;
    this._render(g, {
      src: this.bodyImage,
      pieces: this.legPieces,
      legAngles: [],
      s,
      bodySize,
      sx: 1,
      sy: 1,
      fx: 1,
      hipY: -legLen,
      wob: flat,
      strips: 1,
      legs: this.legMode === "sticks" ? this._legs(-legLen, 1, 1, flat, s, bodySize, true) : [],
      eyes: { grow: 1, open: 1, look: { x: 0, y: 0.2 } },
      arm: null,
    });
    return cropDrawing(c, { padding: Math.round(bodySize * 0.03), minPixels: 1 }).canvas;
  }

  // Mask outline, eyes, hip row, leg pieces and anchors, feet and walk target (rest pose, no squash).
  drawDebug(ctx) {
    const sh = this.shape;
    const s = this.s;
    const ax = sh.anchor.x;
    const ay = sh.anchor.y;
    const pt = (p) => [(p.x - ax) * s, (p.y - ay) * s];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);

    ctx.save();
    ctx.translate(0, -this.legLen);
    ctx.scale(this.opts.flip && this.flip < 0 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sh.outline, -ax * s, -ay * s, this.imgW * s, this.imgH * s);
    ctx.imageSmoothingEnabled = true;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00a6ff";
    for (const e of this.eyeList) {
      const [ex, ey] = pt(e);
      ctx.beginPath();
      ctx.arc(ex, ey, e.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    const dot = (p, color, r) => {
      const [x, y] = pt(p);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.hipY !== null) {
      // The detected hip row, and a box around every drawn leg
      ctx.strokeStyle = "#ff7a00";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(-ax * s, (this.hipY - ay) * s);
      ctx.lineTo((this.imgW - ax) * s, (this.hipY - ay) * s);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of this.legPieces) {
        ctx.strokeRect((p.x - ax) * s, (p.y - ay) * s, p.w * s, p.h * s);
        dot({ x: p.px, y: p.py }, "#ff7a00", 5);
      }
    }
    if (this.legMode === "sticks") for (const h of sh.hips) dot(h, "#ff7a00", 5);
    dot(sh.arm, "#16a34a", 4);
    ctx.fillStyle = "#ff7a00";
    ctx.font = "600 12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`legs: ${this.legMode} · eyes: ${this.eyeList.length}`, -ax * s, (this.imgH - ay) * s + 14);
    ctx.restore();

    ctx.strokeStyle = "#ff2bd6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();

    if (this.target !== null) {
      ctx.save();
      ctx.strokeStyle = "#ff7a00";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 4);
      ctx.lineTo(this.target, this.y - 4);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------
// Stickers: the Krabbel on white with a thick white cut-out border and a
// thin dark outline (colour), plus a 1-bit version for a thermal printer.
// ---------------------------------------------------------------------

function tint(src, color) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// The silhouette of src, grown by r px (stamped around a few circles).
function spread(src, r) {
  const sil = tint(src, "#000");
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext("2d");
  g.drawImage(sil, 0, 0);
  const step = Math.max(1.5, r / 4);
  for (let rr = r; rr > 0.4; rr -= step) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * rr) / 5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.drawImage(sil, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  return c;
}

// Hard-edged silhouette without holes.
function solidify(src) {
  const w = src.width;
  const h = src.height;
  const g = src.getContext("2d", { willReadFrequently: true });
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const solid = fillHoles(mask, w, h);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
    d[i * 4 + 3] = solid[i] ? 255 : 0;
  }
  const c = makeCanvas(w, h);
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}

export function makeStickers(krabbel, opts = {}) {
  const o = {
    size: 900, // px, about the long side of the colour sticker
    border: 0.05, // × size. White cut-out border.
    outline: 4, // px. Thin dark cut line.
    bwWidth: 384, // px. Width of the 1-bit version (384 = a 58 mm thermal printer at 203 dpi).
    bwMode: "dither", // "dither" (Floyd–Steinberg) or "threshold"
    bwThreshold: 150, // 0..255, for "threshold"
    bwGamma: 1.4, // > 1 darkens light crayon colours before dithering
    bwArtOutline: 1.5, // px in the 1-bit image. Dark line around the drawing (0 = off).
    ink: krabbel.opts.ink,
    ...opts,
  };
  const art = krabbel.renderStill(o.size * 0.78);
  const border = Math.round(o.size * o.border);
  const m = border + o.outline + 6;
  const W = art.width + m * 2;
  const H = art.height + m * 2;
  const artC = makeCanvas(W, H);
  artC.getContext("2d").drawImage(art, m, m);
  const cut = solidify(spread(artC, border));
  const edge = spread(cut, o.outline);

  // Colour
  const color = makeCanvas(W, H);
  const g = color.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.drawImage(tint(edge, o.ink), 0, 0);
  g.drawImage(tint(cut, "#ffffff"), 0, 0);
  g.drawImage(artC, 0, 0);

  // Black and white
  const k = o.bwWidth / W;
  const bw = makeCanvas(o.bwWidth, H * k);
  const bg = bw.getContext("2d", { willReadFrequently: true });
  const bW = bw.width;
  const bH = bw.height;
  bg.imageSmoothingQuality = "high";
  bg.fillStyle = "#ffffff";
  bg.fillRect(0, 0, bW, bH);
  bg.drawImage(edge, 0, 0, bW, bH);
  bg.drawImage(tint(cut, "#ffffff"), 0, 0, bW, bH);
  if (o.bwArtOutline > 0) {
    bg.drawImage(spread(artC, o.bwArtOutline / k), 0, 0, bW, bH);
    bg.drawImage(tint(artC, "#ffffff"), 0, 0, bW, bH);
  }
  bg.drawImage(artC, 0, 0, bW, bH);

  const img = bg.getImageData(0, 0, bW, bH);
  const d = img.data;
  const L = new Float32Array(bW * bH);
  for (let i = 0; i < L.length; i++) {
    const lum = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    L[i] = 255 * Math.pow(lum, o.bwGamma);
  }
  for (let y = 0; y < bH; y++) {
    for (let x = 0; x < bW; x++) {
      const i = y * bW + x;
      const old = L[i];
      const v = old < (o.bwMode === "threshold" ? o.bwThreshold : 128) ? 0 : 255;
      L[i] = v;
      if (o.bwMode !== "threshold") {
        const err = old - v;
        if (x + 1 < bW) L[i + 1] += (err * 7) / 16;
        if (y + 1 < bH) {
          if (x > 0) L[i + bW - 1] += (err * 3) / 16;
          L[i + bW] += (err * 5) / 16;
          if (x + 1 < bW) L[i + bW + 1] += err / 16;
        }
      }
    }
  }
  for (let i = 0; i < L.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = L[i];
    d[i * 4 + 3] = 255;
  }
  bg.putImageData(img, 0, 0);

  return { color, bw };
}
