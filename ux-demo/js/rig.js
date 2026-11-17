// =====================================================================
// Het figuurtje in de bordjes: de rig uit Figma ("Sleutelposes per pictogram").
// Rig-eenheden = Figma-px, oorsprong tussen de heupen. Hoeken in graden,
// tegen de klok in positief (zoals Figma): armen opzij bij 0°, benen recht naar onder.
// =====================================================================
import { K, rr, ring, lerp, ease, duoLabel, line, dot } from "./kit.js?v=20261117c";

const RIG = { sh: [45, -242], hip: 45, neck: -262, headR: 60, headD: 82, seg: 120, limb: 40, torsoW: 130, torsoTop: -262, torsoBot: 18 };
const P = (o) => ({ b: 0, n: 0, sR: 0, eR: 0, sL: 0, eL: 0, hR: 0, kR: 0, hL: 0, kL: 0, lift: 0, ...o });
const STAND = P({ sR: -65, eR: -10, sL: 65, eL: 10, hR: 10, hL: -10 });
const WIDE = (a) => P({ sR: a, sL: a, hR: 12, hL: -12 });

// Sleutelposes per gebaar (2 tot 4), in een lus. still = de pose als het niet beweegt.
export const GEBAREN = {
  verbinden: { keys: (a = 0) => (Math.abs(a) < 3 ? [STAND, P({ sR: -30, sL: 30, hR: 10, hL: -10 }), WIDE(0)] : [STAND, WIDE(0), WIDE(a)]) },
  ladder: { keys: () => [STAND, P({ sR: 30, eR: 25, sL: -30, eL: -25, hR: 10, hL: -10 }), P({ sR: 60, eR: 20, sL: -60, eL: -20, hR: 10, hL: -10 })] },
  springen: {
    keys: () => [STAND, P({ sR: -50, eR: -30, sL: 50, eL: 30, hR: 30, kR: -60, hL: -30, kL: 60 }), P({ sR: 60, eR: 15, sL: -60, eL: -15, hR: 14, kR: -20, hL: -14, kL: 20, lift: 140 }), P({ sR: -15, eR: -10, sL: 15, eL: 10, hR: 22, kR: -45, hL: -22, kL: 45 })],
    still: 2,
  },
  bukken: { keys: () => [STAND, P({ sR: -45, eR: -10, sL: 45, eL: 10, hR: 30, kR: -55, hL: -30, kL: 55 }), P({ sR: -20, eR: -15, sL: 20, eL: 15, hR: 60, kR: -115, hL: -60, kL: 115 })] },
  staan: { keys: () => [STAND] },
};
const DUO = (a = 0) => [
  [STAND, STAND],
  [P({ sR: -40, sL: 30, hR: 10, hL: -10 }), P({ sR: -30, sL: 40, hR: 10, hL: -10 })],
  [P({ sR: -30, sL: a, hR: 12, hL: -12 }), P({ sR: a, sL: 30, hR: 12, hL: -12 })],
];
const T = { hold: 0.25, move: 0.35, last: 0.8 };

function poseAt(keys, t, still = keys.length - 1) {
  if (keys.length === 1) return keys[0];
  if (t === null) return keys[Math.min(still, keys.length - 1)];
  const n = keys.length, period = n * (T.hold + T.move) + (T.last - T.hold);
  let u = ((t % period) + period) % period;
  for (let i = 0; i < n; i++) {
    const h = i === n - 1 ? T.last : T.hold;
    if (u < h) return keys[i];
    u -= h;
    if (u < T.move) {
      const a = keys[i], b = keys[(i + 1) % n], f = ease(u / T.move), r = {};
      for (const k in a) r[k] = lerp(a[k], b[k], f);
      return r;
    }
    u -= T.move;
  }
  return keys[0];
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
    const k = (s * 0.55) / 700, keys = DUO(angle);
    drawRig(g, poseAt(keys.map((q) => q[0]), t), x - 252 * k, gy, k, color);
    drawRig(g, poseAt(keys.map((q) => q[1]), t), x + 252 * k, gy, k, color);
  } else {
    const def = GEBAREN[name] || GEBAREN.staan, k = (s * 0.75) / 700;
    if (name === "springen") line(g, [x - 0.3 * s, gy + 0.03 * s, x + 0.3 * s, gy + 0.03 * s], color, s * 0.035);
    if (name === "bukken") line(g, [x - 0.3 * s, gy - 610 * k, x + 0.3 * s, gy - 610 * k], color, s * 0.075);
    drawRig(g, poseAt(def.keys(angle), t, def.still), x, gy, k, color);
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
