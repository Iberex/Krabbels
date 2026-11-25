// Checks and cleans the wobbel data that an iPad sends.
// Returns { ok: true, value } or { ok: false, error }.

const MAX_STROKES = 500;
const MAX_POINTS = 8000; // total over all strokes
const MAX_STICKERS = 40;
const STICKER_TYPE = /^(eye|legs|mouth|arms|extra)_[a-z0-9_]{1,30}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const DEFAULT_COLOR = '#000000';
const DEFAULT_WIDTH = 0.05;
const LIMIT = 1.8; // positions are clamped to -1.8..1.8 (the circle has radius 1)

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function isNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// A stroke can arrive in two forms:
//   new: { c: "#e53935" | "erase" | "rainbow", w: 0.05, p: [[x, y], ...], h?: 120 }
//        h = start hue of a rainbow stroke (0..360); the colour shifts along the line
//   old: [[x, y], ...]                      (black, default width)
// It is always stored in the new form.
function cleanStroke(stroke) {
  let color = DEFAULT_COLOR;
  let width = DEFAULT_WIDTH;
  let pointsIn = stroke;
  if (stroke && !Array.isArray(stroke) && typeof stroke === 'object') {
    pointsIn = stroke.p;
    if (stroke.c !== undefined) {
      if (typeof stroke.c !== 'string') return { error: 'Stroke colour must be text.' };
      color = stroke.c.toLowerCase();
      if (color !== 'erase' && color !== 'rainbow' && !HEX_COLOR.test(color)) {
        return { error: 'Stroke colour must be "#rrggbb", "erase" or "rainbow".' };
      }
    }
    if (stroke.w !== undefined) {
      if (!isNumber(stroke.w)) return { error: 'Stroke width must be a number.' };
      width = round3(clamp(stroke.w, 0.02, 0.4));
    }
  }
  if (!Array.isArray(pointsIn)) return { error: 'Each stroke needs an array of points.' };
  const points = [];
  for (const p of pointsIn) {
    if (!Array.isArray(p) || !isNumber(p[0]) || !isNumber(p[1])) {
      return { error: 'Each point must be [x, y] with numbers.' };
    }
    points.push([round3(clamp(p[0], -LIMIT, LIMIT)), round3(clamp(p[1], -LIMIT, LIMIT))]);
  }
  const value = { c: color, w: width, p: points };
  if (color === 'rainbow') value.h = isNumber(stroke.h) ? Math.round(((stroke.h % 360) + 360) % 360) : 0;
  return { value };
}

function validateWobbel(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object.' };

  const strokesIn = Array.isArray(body.strokes) ? body.strokes : [];
  const stickersIn = Array.isArray(body.stickers) ? body.stickers : null;
  if (!stickersIn) return { ok: false, error: 'stickers must be an array.' };
  if (strokesIn.length > MAX_STROKES) return { ok: false, error: 'Too many strokes.' };
  if (stickersIn.length > MAX_STICKERS) return { ok: false, error: 'Too many stickers.' };

  const strokes = [];
  let pointCount = 0;
  for (const strokeIn of strokesIn) {
    const result = cleanStroke(strokeIn);
    if (result.error) return { ok: false, error: result.error };
    pointCount += result.value.p.length;
    if (pointCount > MAX_POINTS) return { ok: false, error: 'Drawing has too many points.' };
    if (result.value.p.length > 0) strokes.push(result.value);
  }

  const stickers = [];
  let legCount = 0;
  let armCount = 0;
  for (const s of stickersIn) {
    if (!s || typeof s.type !== 'string' || !STICKER_TYPE.test(s.type)) {
      return { ok: false, error: 'Unknown sticker type.' };
    }
    if (!isNumber(s.x) || !isNumber(s.y)) return { ok: false, error: 'Sticker needs x and y numbers.' };
    if (s.type.startsWith('legs_')) legCount++;
    if (s.type.startsWith('arms_')) armCount++;
    const sticker = { type: s.type, x: round3(clamp(s.x, -LIMIT, LIMIT)), y: round3(clamp(s.y, -LIMIT, LIMIT)) };
    // Stickers have fixed colours. An old "c" field is accepted but not stored.
    stickers.push(sticker);
  }
  if (legCount !== 1) return { ok: false, error: 'A wobbel needs exactly one leg sticker.' };
  if (armCount > 1) return { ok: false, error: 'A wobbel can have only one arm sticker.' };

  let clientId = null;
  if (typeof body.clientId === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(body.clientId)) {
    clientId = body.clientId;
  }

  // Body fill: the colour of the circle under the drawing. Optional.
  let fill = null;
  if (body.fill !== undefined && body.fill !== null) {
    if (typeof body.fill !== 'string' || !HEX_COLOR.test(body.fill.toLowerCase())) {
      return { ok: false, error: 'fill must be "#rrggbb".' };
    }
    fill = body.fill.toLowerCase();
  }

  return { ok: true, value: { strokes, stickers, fill, clientId } };
}

module.exports = { validateWobbel };
