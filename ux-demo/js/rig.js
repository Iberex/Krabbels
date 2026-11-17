// =====================================================================
// Het figuurtje in de bordjes: de rig uit Figma ("Sleutelposes per pictogram").
// Rig-eenheden = Figma-px, oorsprong tussen de heupen. Hoeken in graden,
// tegen de klok in positief (zoals Figma): armen opzij bij 0°, benen recht naar onder.
// =====================================================================
import { K, rr, ring, lerp, ease, duoLabel, line, dot } from "./kit.js?v=20261117g";

const RIG = { sh: [45, -242], hip: 45, neck: -262, headR: 60, headD: 82, seg: 120, limb: 40, torsoW: 130, torsoTop: -262, torsoBot: 18 };
const P = (o) => ({ b: 0, n: 0, sR: 0, eR: 0, sL: 0, eL: 0, hR: 0, kR: 0, hL: 0, kL: 0, lift: 0, ...o });
const STAND = P({ sR: -65, eR: -10, sL: 65, eL: 10, hR: 10, hL: -10 });
const WIDE = (a) => P({ sR: a, sL: a, hR: 12, hL: -12 });

// Smooth timelines per gesture, like Puntje: soft in-and-out, a little overshoot,
// anticipation before a jump, settling after, and a slight sway while you hold it.
// keys: [[u (0..1 of the loop), pose]], hold: the part of the loop where the pose is held,
// still: the pose when the sign does not move.
const smoother = (t) => t * t * t * (t * (6 * t - 15) + 10);
const mix = (a, b, f) => { const r = {}; for (const k in a) r[k] = lerp(a[k], b[k], f); return r; };
const UP = (s, e) => P({ sR: s, eR: e, sL: -s, eL: -e, hR: 10, hL: -10 });
const SQUAT = (h, k, arms = -50, el = -30) => P({ sR: arms, eR: el, sL: -arms, eL: -el, hR: h, kR: -k, hL: -h, kL: k });

const TIMELINES = {
  verbinden: (a = 0) => Math.abs(a) < 3
    ? { dur: 2.8, hold: [0.42, 0.84], still: WIDE(0), keys: [[0, STAND], [0.12, STAND], [0.34, WIDE(6)], [0.42, WIDE(0)], [0.84, WIDE(0)], [1, STAND]] }
    : { dur: 3.2, hold: [0.52, 0.86], still: WIDE(a), keys: [[0, STAND], [0.1, STAND], [0.3, WIDE(0)], [0.36, WIDE(0)], [0.48, WIDE(a * 1.12)], [0.54, WIDE(a)], [0.86, WIDE(a)], [1, STAND]] },
  ladder: () => ({ dur: 2.8, hold: [0.46, 0.84], still: UP(60, 20), keys: [[0, STAND], [0.12, STAND], [0.28, UP(28, 28)], [0.4, UP(66, 16)], [0.47, UP(60, 20)], [0.84, UP(60, 20)], [1, STAND]] }),
  springen: () => ({
    dur: 2.4, hold: null, still: P({ sR: 60, eR: 15, sL: -60, eL: -15, hR: 14, kR: -20, hL: -14, kL: 20, lift: 140 }),
    keys: [
      [0, STAND], [0.12, STAND],
      [0.3, SQUAT(32, 66, -55, -35)], // anticipation: knees bent, arms back
      [0.4, P({ sR: 40, eR: 10, sL: -40, eL: -10, hR: 6, kR: -6, hL: -6, kL: 6, lift: 70 })], // push off, stretched
      [0.52, P({ sR: 62, eR: 15, sL: -62, eL: -15, hR: 18, kR: -34, hL: -18, kL: 34, lift: 150 })], // top, knees tucked
      [0.66, P({ sR: 20, eR: 0, sL: -20, eL: 0, hR: 8, kR: -10, hL: -8, kL: 10, lift: 40 })], // coming down, legs out
      [0.74, SQUAT(26, 52, -20, -10)], // land, absorb
      [0.84, SQUAT(10, 14, -55, -12)], // settle
      [0.92, STAND],
    ],
  }),
  bukken: () => ({
    dur: 2.8, hold: [0.44, 0.82], still: SQUAT(60, 115, -20, -15),
    keys: [[0, STAND], [0.12, STAND], [0.3, SQUAT(48, 92, -30, -12)], [0.4, SQUAT(64, 122, -18, -16)], [0.46, SQUAT(60, 115, -20, -15)], [0.82, SQUAT(60, 115, -20, -15)], [0.94, SQUAT(8, 14, -60, -10)], [1, STAND]],
  }),
  staan: () => ({ dur: 1, hold: null, still: STAND, keys: [[0, STAND]] }),
};
const DUO_TL = (a = 0) => {
  const reachA = P({ sR: -40, sL: 30, hR: 10, hL: -10 }), reachB = P({ sR: -30, sL: 40, hR: 10, hL: -10 });
  const handA = P({ sR: -30, sL: a, hR: 12, hL: -12 }), handB = P({ sR: a, sL: 30, hR: 12, hL: -12 });
  return { dur: 3, hold: [0.5, 0.84], keys: [[0, [STAND, STAND]], [0.12, [STAND, STAND]], [0.32, [reachA, reachB]], [0.44, [P({ sR: -26, sL: a + 4, hR: 12, hL: -12 }), P({ sR: a + 4, sL: 26, hR: 12, hL: -12 })]], [0.5, [handA, handB]], [0.84, [handA, handB]], [1, [STAND, STAND]]], still: [handA, handB] };
};
export const GEBAREN = TIMELINES;

// Length of one loop of a gesture (seconds).
export function gebaarDuur(name, angle = 0) {
  return name === "hand in hand" ? DUO_TL(angle).dur : (TIMELINES[name] || TIMELINES.staan)(angle).dur;
}

// Pose at time t (seconds) on a timeline; t = null → the still pose. pick: for the duo, which of the two.
function poseAt(tl, t, pick = null) {
  const get = (v) => (pick === null ? v : v[pick]);
  if (t === null || tl.keys.length === 1) return get(tl.still);
  const u = (((t / tl.dur) % 1) + 1) % 1;
  const ks = tl.keys;
  let i = ks.length - 1;
  for (let k = 0; k < ks.length; k++) if (ks[k][0] > u) { i = k - 1; break; }
  const [u0, a] = ks[i], [u1, b] = ks[(i + 1) % ks.length];
  const span = (i + 1 < ks.length ? u1 : 1) - u0;
  let r = mix(get(a), get(i + 1 < ks.length ? b : ks[0][1]), smoother(Math.min(1, Math.max(0, (u - u0) / (span || 1)))));
  // a slight sway while the pose is held (it stays alive)
  if (tl.hold && u > tl.hold[0] && u < tl.hold[1]) {
    const w = Math.sin(((u - tl.hold[0]) / (tl.hold[1] - tl.hold[0])) * Math.PI); // fades in and out
    const s = Math.sin(t * 4.6) * w;
    r = { ...r, sR: r.sR + s * 2.5, sL: r.sL - s * 2.5, lift: r.lift + Math.abs(Math.sin(t * 2.3)) * 6 * w };
  }
  return r;
}

function rotV(x, y, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c + y * s, -x * s + y * c];
}

function points(p) {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const arm = (side, sa, ea) => {
    const sh = rotV(side * RIG.sh[0], RIG.sh[1], p.b);
    const el = add(sh, rotV(side * RIG.seg, 0, p.b + sa));
    return [sh, el, add(el, rotV(side * RIG.seg, 0, p.b + sa + ea))];
  };
  const leg = (side, ha, ka) => {
    const hip = [side * RIG.hip, 0];
    const kn = add(hip, rotV(0, RIG.seg, ha));
    return [hip, kn, add(kn, rotV(0, RIG.seg, ha + ka))];
  };
  const neck = rotV(0, RIG.neck, p.b);
  const tw = (RIG.torsoW - RIG.limb) / 2, tt = RIG.torsoTop + RIG.limb / 2, tb = RIG.torsoBot - RIG.limb / 2;
  return {
    armR: arm(1, p.sR, p.eR), armL: arm(-1, p.sL, p.eL), legR: leg(1, p.hR, p.kR), legL: leg(-1, p.hL, p.kL),
    torso: [[-tw, tt], [tw, tt], [tw, tb], [-tw, tb]].map(([x, y]) => rotV(x, y, p.b)),
    head: add(neck, rotV(0, -RIG.headD, p.b + p.n)),
  };
}

function drawRig(g, p, x, gy, k, color) {
  const r = points(p);
  const low = Math.max(...[...r.legR, ...r.legL, ...r.armR, ...r.armL, ...r.torso].map((q) => q[1])) + RIG.limb / 2;
  const dy = -low - p.lift;
  const Tp = (q) => [x + q[0] * k, gy + (q[1] + dy) * k];
  g.fillStyle = g.strokeStyle = color;
  g.lineWidth = RIG.limb * k;
  g.lineCap = "round";
  g.lineJoin = "round";
  const path = (pts, close) => { g.beginPath(); pts.map(Tp).forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); if (close) g.closePath(); };
  path(r.torso, true); g.fill(); g.stroke();
  for (const l of [r.legR, r.legL, r.armR, r.armL]) { path(l); g.stroke(); }
  const h = Tp(r.head);
  g.beginPath(); g.arc(h[0], h[1], RIG.headR * k, 0, Math.PI * 2); g.fill();
}

// Het gebaar in een vak van grootte s rond (x, y). t = seconden (null = stil).
export function gebaar(g, name, x, y, s, color, t = null, angle = 0) {
  const gy = y + 0.42 * s;
  g.save();
  if (name === "hand in hand") {
    const k = (s * 0.55) / 700, tl = DUO_TL(angle);
    drawRig(g, poseAt(tl, t, 0), x - 252 * k, gy, k, color);
    drawRig(g, poseAt(tl, t, 1), x + 252 * k, gy, k, color);
  } else {
    const tl = (TIMELINES[name] || TIMELINES.staan)(angle), k = (s * 0.75) / 700;
    if (name === "springen") line(g, [x - 0.3 * s, gy + 0.03 * s, x + 0.3 * s, gy + 0.03 * s], color, s * 0.035);
    if (name === "bukken") line(g, [x - 0.3 * s, gy - 610 * k, x + 0.3 * s, gy - 610 * k], color, s * 0.075);
    drawRig(g, poseAt(tl, t), x, gy, k, color);
  }
  g.restore();
}

// Bordje in 4 toestanden: komt eraan | nu | vasthouden | gelukt (zoals de Figma-component).
export function bordje(g, x, y, toestand, name, t, { angle = 0, hold = 0, duo = null, size = 250, pulse = 0 } = {}) {
  const small = toestand === "komt eraan";
  const s = (small ? 130 : size) * (1 + pulse);
  const r = s * 0.22;
  g.save();
  if (toestand === "vasthouden") {
    ring(g, x, y, s * 0.72, 14, K.lijn);
    ring(g, x, y, s * 0.72, 14, K.kind, 0, hold);
  }
  rr(g, x - s / 2, y - s / 2, s, s, r);
  if (small) { g.fillStyle = K.vlak; g.fill(); g.lineWidth = 3; g.strokeStyle = K.lijn; g.stroke(); }
  else if (toestand === "gelukt") { g.fillStyle = K.papier; g.fill(); g.lineWidth = 5; g.strokeStyle = K.inkt; g.stroke(); }
  else { g.fillStyle = K.inkt; g.fill(); }
  const fg = small ? K.grijs : toestand === "gelukt" ? K.inkt : K.papier;
  gebaar(g, name, x, y, s * 0.86, fg, toestand === "nu" || toestand === "vasthouden" ? t : null, angle);
  if (toestand === "gelukt") {
    dot(g, x + s / 2 - 6, y - s / 2 + 6, 38, K.inkt);
    line(g, [x + s / 2 - 22, y - s / 2 + 6, x + s / 2 - 10, y - s / 2 + 18, x + s / 2 + 12, y - s / 2 - 8], K.papier, 7);
  }
  if (duo) duoLabel(g, x - s / 2 + 10, y - s / 2 - 4, duo, small ? 0.7 : 1);
  g.restore();
}
