// =====================================================================
// De muur (beamer), 1920 × 1080. Eén functie per toestand van de flowkaart.
// =====================================================================
import { K, rr, text, line, dot, clamp, lerp, ease, easeOut, easeBack, voortgang, tijd, voetjes, armlijn, verbindpunt, doellijn, sterretjes, pijl, kaart } from "./kit.js?v=20261117g";
import { bordje, gebaar } from "./rig.js?v=20261117g";
import { sprite, puntje, seq } from "./sprites.js?v=20261117g";
import { krabbel, pok } from "./krabbel.js?v=20261117g";
import { S, COURSE, FINALE, TUT, tutSince, obstacle, holds } from "./flow.js?v=20261117g";

export const W = 1920, H = 1080;
const GROUND = 800, KANT = 260, OX = 1090;
const PUNTJE_POSE = { verbinden: "armen wijd", ladder: "armen omhoog", springen: "springen", bukken: "bukken" };

// --- basis -------------------------------------------------------------------
function papier(g) {
  g.fillStyle = K.papier;
  g.fillRect(0, 0, W, H);
}
function grond(g, gap = null) {
  g.fillStyle = K.vlak;
  if (gap) {
    g.fillRect(0, GROUND, gap[0], H - GROUND);
    g.fillRect(gap[1], GROUND, W - gap[1], H - GROUND);
  } else g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = K.lijn;
  if (gap) {
    g.fillRect(0, GROUND, gap[0], 4);
    g.fillRect(gap[1], GROUND, W - gap[1], 4);
  } else g.fillRect(0, GROUND, W, 4);
}
function kantlijn(g) {
  g.fillStyle = K.lijn;
  g.fillRect(KANT, 0, 3, H);
}
function hud(e) {
  const g = e.g;
  if (![6, 7].includes(e.st.fase)) return;
  const at = S.id.startsWith("7") ? COURSE.length : S.obs;
  voortgang(g, W / 2 + KANT / 2, 64, COURSE.length + 1, at);
  tijd(g, W - 60, 70, runTime(), 64);
}
export function runTime() {
  if (!S.runStart) return 0;
  return ((S.runEnd && S.runEnd > S.runStart ? S.runEnd : Date.now()) - S.runStart) / 1000;
}

// --- het kind (zacht, achter het landschap) ----------------------------------------
function kindPose(p) {
  if (!p) return "staan";
  if (p.ladder) return "armen omhoog";
  if (p.duck) return "bukken";
  if (p.jumped(performance.now() - 500)) return "springen";
  if (p.arms !== null && p.arms !== undefined) return Math.abs(p.arms) > 10 ? "armen schuin" : "armen wijd";
  return "staan";
}
function kind(e, alpha = 1) {
  const g = e.g, a = 0.17 * alpha;
  const spots = e.duo ? [OX - 300, OX + 300] : [OX];
  spots.forEach((x, i) => {
    const p = e.players[i];
    if (!p || !p.present) return;
    if (p.body) skeleton(g, p.body, a);
    else if (e.duo && e.hand && i === 0) sprite(g, "kind", "hand in hand", OX, H + 10, 640, { alpha: a });
    else if (!(e.duo && e.hand)) sprite(g, "kind", kindPose(p), x, H + 10, 640, { alpha: a });
  });
}
function skeleton(g, b, a) {
  g.save();
  g.globalAlpha *= a * 1.3;
  g.strokeStyle = g.fillStyle = K.kind;
  g.lineWidth = 46; g.lineCap = "round"; g.lineJoin = "round";
  const seg = (...n) => { g.beginPath(); g.moveTo(b[n[0]].x, b[n[0]].y); for (const k of n.slice(1)) g.lineTo(b[k].x, b[k].y); g.stroke(); };
  seg("lWr", "lEl", "lSh", "rSh", "rEl", "rWr"); seg("lSh", "lHip", "lKn", "lAn"); seg("rSh", "rHip", "rKn", "rAn"); seg("lHip", "rHip");
  const r = Math.hypot(b.lSh.x - b.rSh.x, b.lSh.y - b.rSh.y) * 0.42;
  dot(g, b.nose.x, Math.min(b.nose.y, (b.lSh.y + b.rSh.y) / 2 - r * 1.1), r, K.kind);
  g.restore();
}

// --- obstakels ---------------------------------------------------------------
function geom(o, slide = 0) {
  const x = OX + slide;
  if (o.t === "verbinden") { const half = o.finale ? 290 : 120; return { gap: [x - half, x + half], stop: x - half - 70, bord: [x, 300], puntje: [x + half + 170, GROUND] }; }
  if (o.t === "ladder") return { stop: x - 90, bord: [x, 250], puntje: [x + 260, GROUND], wall: [x + 10, x + 100, GROUND - 290] };
  if (o.t === "springen") return { stop: x - 130, bord: [x, 330], puntje: [x + 240, GROUND], block: [x - 28, x + 28, GROUND - 84] };
  return { stop: x - 170, bord: [x + 300, 330], puntje: [x + 300, GROUND], bar: [x - 75, x + 75, GROUND - 175] };
}
function obstakel(e, o, G, built = 0) {
  const g = e.g;
  if (o.t === "verbinden") {
    const [a, b] = G.gap;
    if (built < 1) doellijn(g, a + 24, GROUND, b - 24, GROUND);
    if (built > 0) line(g, [a, GROUND, lerp(a, b, built), GROUND], K.inkt, 14);
    verbindpunt(g, a, GROUND, built >= 1, e.now / 1000);
    verbindpunt(g, b, GROUND, built >= 1, e.now / 1000 + 0.4);
  } else if (o.t === "ladder") {
    const [x0, x1, top] = G.wall;
    g.fillStyle = K.lijn; g.fillRect(x0, top, x1 - x0, GROUND - top);
    g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(x0, top, x1 - x0, GROUND - top);
    const lx = x0 - 64, lw = 48, up = lerp(GROUND, top - 10, built);
    // dotted ladder = waar de ladder komt
    if (built < 1) { line(g, [lx, GROUND, lx, top - 10], K.grijs, 5, [12, 12]); line(g, [lx + lw, GROUND, lx + lw, top - 10], K.grijs, 5, [12, 12]); }
    if (built > 0) {
      line(g, [lx, GROUND, lx, up], K.inkt, 7); line(g, [lx + lw, GROUND, lx + lw, up], K.inkt, 7);
      for (let y = GROUND - 30; y > up; y -= 40) line(g, [lx, y, lx + lw, y], K.inkt, 6);
    }
  } else if (o.t === "springen") {
    const [x0, x1, top] = G.block;
    g.fillStyle = K.lijn; g.fillRect(x0, top, x1 - x0, GROUND - top);
    g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(x0, top, x1 - x0, GROUND - top);
  } else {
    const [x0, x1, bottom] = G.bar;
    g.fillStyle = K.lijn; g.fillRect(x0, -10, x1 - x0, bottom + 10);
    g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(x0, -10, x1 - x0, bottom + 10);
  }
}
function gebaarVan(o) {
  if (o.finale && S.duo) return "hand in hand";
  return o.t;
}
function juistGebaar(e, o) {
  // for the arm line feedback
  const p = e.players[0];
  return p && p.arms !== null && p.arms !== undefined && Math.abs(p.arms) <= 16;
}

// The play scene used by 5a…7b. state: what the Krabbel does.
function scene(e, o, { slide = 0, kx = null, kstate = "staan", built = 0, bord = null, puntjePose = null, puntjeAt = null, lift = 0, kscale = 1, hideK = false, kr = null } = {}) {
  const g = e.g, G = geom(o, slide);
  papier(g);
  kind(e);
  grond(g, o.t === "verbinden" ? G.gap : null);
  kantlijn(g);
  obstakel(e, o, G, built);
  if (o.t === "verbinden" && (S.id === "6b" || S.id === "6c" || S.id === "7a") && !e.hand) {
    const p = e.players[0];
    if (p && p.arms !== null && p.arms !== undefined) armlijn(g, (G.gap[0] + G.gap[1]) / 2, GROUND - 6, p.arms, G.gap[1] - G.gap[0] + 120, juistGebaar(e, o));
  }
  if (bord) bordje(g, G.bord[0], G.bord[1], bord, gebaarVan(o), e.t, { hold: S.hold, duo: e.duo ? (o.finale ? "1+2" : String((S.obs % 2) + 1)) : null, pulse: bord === "nu" ? 0.04 * Math.sin(e.t * 6) : 0 });
  if (puntjePose) { const [px, py] = puntjeAt || G.puntje; puntje(g, puntjePose, px, py, 250, e.t); }
  if (!hideK) krabbel(g, kr || e.mine, kx ?? G.stop, GROUND + 4, 120, kstate, e.t, { lift, scale: kscale });
  return G;
}

// --- toestanden ----------------------------------------------------------------
const DRAW = {
  "1a"(e) {
    const g = e.g;
    papier(g); grond(g); kantlijn(g);
    e.others.forEach((kr, i) => {
      // each Krabbel wanders in its own part of the page
      const sp = 0.05 + (i % 3) * 0.012, ph = i * 2.3, a = (e.now / 1000) * sp * 6 + ph;
      const lane = KANT + 380 + (i * (W - KANT - 560)) / Math.max(1, e.others.length - 1);
      const x = lane + Math.sin(a) * 150, dir = Math.cos(a) > 0;
      const st = Math.sin(e.now / 1000 * 0.5 + i * 2) > 0.85 ? "zwaaien" : "lopen";
      krabbel(g, kr, x, GROUND + 4, 95 + (i % 2) * 20, st, e.now / 1000 + i, { flip: !dir });
    });
    puntje(g, seq(["huppelen", "huppelen", "wenken", "wenken"], e.t, 0.8), 470, GROUND + 6, 250, e.t, { flip: true });
  },

  "3a"(e) {
    const g = e.g;
    // in the background: someone else plays
    g.save(); g.globalAlpha = 0.45;
    scene({ ...e, players: [null, null] }, COURSE[1], { kr: e.others[3], kx: geom(COURSE[1]).stop, kstate: "omkijken", bord: "nu", puntjePose: "armen omhoog" });
    g.restore();
    kantlijn(g);
    rij(e, 1 + Math.floor(e.t / 2.5) % 2);
  },
  "3b"(e) {
    const g = e.g;
    papier(g); grond(g); kantlijn(g);
    const u = easeOut(e.t / 0.7);
    krabbel(g, e.mine, lerp(130, 180, u), GROUND + 4, 110, "springen", e.t, { lift: Math.abs(Math.sin(e.t * 6)) * 40 });
    rij(e, 0, true);
    voetjesVloer(e, false);
    puntje(g, seq(["wenken", "wijzen"], e.t, 0.9), OX + 330, GROUND + 6, 250, e.t, { flip: true });
  },
  "3x"(e) {
    const g = e.g;
    papier(g); grond(g); kantlijn(g);
    const u = ease(clamp(e.t / 2.5, 0, 1));
    krabbel(g, e.mine, 130, lerp(GROUND + 4, 330, u), 70, "lopen", e.t, { alpha: 0.9 });
    rij(e, 0, true);
    voetjesVloer(e, false, 0.5);
  },

  "4a"(e) {
    // Puntje draws your figure (top to bottom), then it softens and moves with you.
    const g = e.g, t = e.t;
    const spots = e.duo ? [OX - 300, OX + 300] : [OX];
    const D0 = 0.7, D1 = 3.1, SOFT = 0.6;
    papier(g);
    const top = H + 10 - 640, bottom = GROUND + 30;
    let pen = null;
    spots.forEach((x, i) => {
      const p = e.players[i];
      if (!p || !p.present) return;
      const a0 = D0 + (i * (D1 - D0)) / spots.length, a1 = D0 + ((i + 1) * (D1 - D0)) / spots.length;
      const u = clamp((t - a0) / (a1 - a0), 0, 1);
      if (t < a1 + SOFT) {
        const v = clamp((t - a1) / SOFT, 0, 1);
        const revealY = lerp(top - 10, bottom, ease(u));
        g.save(); g.beginPath(); g.rect(0, 0, W, revealY); g.clip();
        sprite(g, "kind", "staan", x, H + 10, 640, { alpha: lerp(0.65, 0.17, v) });
        g.restore();
        if (u > 0 && u < 1) pen = [x + Math.sin(u * Math.PI * 7) * 110, Math.min(GROUND + 6, revealY + 40)];
      }
    });
    if (t >= D1 + SOFT * 0.5) kind(e, clamp((t - D1 - SOFT * 0.5) / 0.4, 0, 1));
    grond(g); kantlijn(g);
    voetjesVloer(e, true);
    // Puntje: hops in, draws, then steps aside and cheers
    if (t < D0) { const k = easeOut(t / D0); puntje(g, "springen", lerp(W + 80, spots[0] + 110, k), lerp(GROUND + 6, top + 40, k) - Math.sin(k * Math.PI) * 120, 210, t); }
    else if (pen) puntje(g, "tekenen", pen[0], pen[1], 210, t);
    else puntje(g, t < D1 + 1.2 ? "juichen" : "staan", spots[spots.length - 1] + 330, GROUND + 6, 240, t);
    // your Krabbel jumps out of the margin onto the page
    const u = clamp((t - 3.4) / 1.1, 0, 1);
    const kx = lerp(160, 560, easeOut(u)), lift = Math.sin(u * Math.PI) * 260;
    const st = u <= 0 ? "springen" : u < 1 ? "springen" : t < 5 ? "juichen" : "omkijken";
    if (u <= 0) krabbel(g, e.mine, 130, GROUND + 4, 80, "springen", t, { lift: Math.abs(Math.sin(t * 5)) * 22 });
    else krabbel(g, e.mine, kx, GROUND + 4, lerp(80, 120, u), st, t, { lift });
    rij(e, 0, true, true);
  },
  "4x"(e) {
    const g = e.g;
    papier(g);
    kind({ ...e, players: [e.players[0], null] });
    grond(g); kantlijn(g);
    voetjesVloer(e, [true, false]);
    rij(e, 0, true, true);
    krabbel(g, e.second, 130, GROUND + 4, 80, "wiebelen", e.t);
    puntje(g, seq(["wenken", "wijzen"], e.t, 0.8), OX + 560, GROUND + 6, 250, e.t, { flip: true });
  },

  "5a"(e) {
    const o = COURSE[0], G = geom(o), u = clamp(e.t / 1.8, 0, 1);
    scene(e, o, { kx: lerp(560, G.stop, ease(u)), kstate: u < 1 ? "lopen" : e.t < 2.3 ? "staan" : "omkijken" });
  },
  "5b"(e) {
    const o = COURSE[0], G = geom(o);
    const enter = easeOut(clamp(e.t / 0.6, 0, 1));
    const drawing = clamp((e.t - 2.2) / 1.4, 0, 0.35);
    const px = e.t < 2.2 ? lerp(W + 100, G.puntje[0], enter) : lerp(G.gap[0], G.gap[1], drawing);
    const pose = e.t < 0.6 ? "springen" : e.t < 2.2 ? "armen wijd" : "tekenen";
    scene(e, o, { kstate: "omkijken", built: drawing, puntjePose: pose, puntjeAt: [px, GROUND + 6 - (e.t < 0.6 ? Math.sin(enter * Math.PI) * 200 : 0)] });
  },
  "5c"(e) {
    // Oefenen: each movement once. Puntje shows it → your turn → good!
    const g = e.g, step = TUT[S.tut], ph = S.tutPhase, ts = tutSince(), t = e.t;
    const pose = PUNTJE_POSE[step.t];
    papier(g);
    kind(e);
    // the example on the right: what your movement makes
    const EX = OX + 330, gapA = EX - 110, gapB = EX + 110;
    const demo = ph === "voor" ? clamp((ts - 0.8) / 1.4, 0, 1) : ph === "jij" ? (step.hold ? S.hold : 0) : 1;
    grond(g, step.t === "verbinden" ? [gapA, gapB] : null);
    kantlijn(g);
    let kx = EX - 200, kst = ph === "jij" ? "omkijken" : "staan", lift = 0;
    const pass = ph === "goed" ? clamp(ts / 1.2, 0, 1) : ph === "voor" && !step.hold ? clamp((ts - 1.2) / 1.2, 0, 1) : 0;
    if (step.t === "verbinden") {
      if (demo < 1) doellijn(g, gapA + 24, GROUND, gapB - 24, GROUND);
      if (demo > 0) line(g, [gapA, GROUND, lerp(gapA, gapB, demo), GROUND], K.inkt, 14);
      verbindpunt(g, gapA, GROUND, demo >= 1, e.now / 1000); verbindpunt(g, gapB, GROUND, demo >= 1, e.now / 1000 + 0.4);
      kx = gapA - 70;
      if (ph === "goed") { kx = lerp(gapA - 70, gapB + 120, ease(pass)); kst = "lopen"; }
      if (ph === "jij") { const p = e.players[0]; if (p && p.arms !== null && p.arms !== undefined) armlijn(g, EX, GROUND - 6, p.arms, 340, Math.abs(p.arms) <= 16); }
    } else if (step.t === "ladder") {
      const x0 = EX + 10, x1 = EX + 90, topW = GROUND - 250;
      g.fillStyle = K.lijn; g.fillRect(x0, topW, x1 - x0, GROUND - topW); g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(x0, topW, x1 - x0, GROUND - topW);
      const lx = x0 - 60, up = lerp(GROUND, topW - 10, demo);
      if (demo < 1) { line(g, [lx, GROUND, lx, topW - 10], K.grijs, 5, [12, 12]); line(g, [lx + 44, GROUND, lx + 44, topW - 10], K.grijs, 5, [12, 12]); }
      if (demo > 0) { line(g, [lx, GROUND, lx, up], K.inkt, 7); line(g, [lx + 44, GROUND, lx + 44, up], K.inkt, 7); for (let y = GROUND - 30; y > up; y -= 40) line(g, [lx, y, lx + 44, y], K.inkt, 6); }
      kx = lx - 60;
      if (ph === "goed") { kx = lx + 20; lift = (GROUND - topW) * ease(pass); kst = "klimmen"; }
    } else if (step.t === "springen") {
      g.fillStyle = K.lijn; g.fillRect(EX - 28, GROUND - 84, 56, 84); g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(EX - 28, GROUND - 84, 56, 84);
      kx = EX - 140;
      if (pass > 0) { kx = lerp(EX - 140, EX + 160, pass); lift = Math.sin(pass * Math.PI) * 190; kst = "springen"; }
    } else {
      g.fillStyle = K.lijn; g.fillRect(EX - 70, -10, 140, GROUND - 175 + 10); g.strokeStyle = K.grijs; g.lineWidth = 4; g.strokeRect(EX - 70, -10, 140, GROUND - 175 + 10);
      kx = EX - 180;
      if (pass > 0) { kx = lerp(EX - 180, EX + 180, pass); kst = pass > 0.15 && pass < 0.85 ? "bukken" : "lopen"; }
    }
    krabbel(g, e.mine, kx, GROUND + 4, 100, kst, t, { lift });
    // big sign in the middle
    const bord = ph === "goed" ? "gelukt" : ph === "jij" && step.hold && S.hold > 0 ? "vasthouden" : "nu";
    bordje(g, OX - 120, 360, bord, step.t, ts, { hold: S.hold, size: 290 });
    if (ph === "goed") sterretjes(g, OX - 120, 360, clamp(ts / 1.2, 0, 1));
    // Puntje: does it (voor), points at you (jij), cheers (goed)
    const pp = ph === "voor" ? seq(["staan", pose, pose, pose], ts, 0.55) : ph === "jij" ? seq(["wijzen", pose], ts, 0.8) : "juichen";
    puntje(g, pp, OX - 520, GROUND + 6, 300, t);
    // progress: the four practice steps
    TUT.forEach((st2, i) => {
      const x = W / 2 + KANT / 2 + (i - 1.5) * 150, y = 90;
      const state = i < S.tut || (i === S.tut && ph === "goed") ? "gelukt" : i === S.tut ? "nu" : "komt eraan";
      bordje(g, x, y, state, st2.t, i === S.tut ? ts : null, { size: 104 });
    });
  },

  "6a"(e) {
    const o = obstacle(), G = geom(o), u = clamp(e.t / 2.2, 0, 1);
    const slide = (1 - easeOut(clamp(e.t / 0.7, 0, 1))) * 900;
    scene(e, o, { slide, kx: lerp(380, G.stop, ease(u)), kstate: u < 1 ? "lopen" : "staan", bord: e.t > 0.5 ? "komt eraan" : null, puntjePose: e.t > 0.5 ? "staan" : null, puntjeAt: [G.puntje[0] + slide, G.puntje[1]] });
    hud(e);
  },
  "6b"(e) {
    const o = obstacle();
    scene(e, o, { kstate: "omkijken", bord: "nu", puntjePose: seq([PUNTJE_POSE[o.t], PUNTJE_POSE[o.t], "staan"], e.t, 0.5) });
    hud(e);
  },
  "6c"(e) {
    const o = obstacle(), G = geom(o);
    const tip = o.t === "verbinden" ? [lerp(G.gap[0], G.gap[1], S.hold) + 40, GROUND + 6] : o.t === "ladder" ? [G.wall[0] - 10, lerp(GROUND, G.wall[2], S.hold) + 6] : null;
    scene(e, o, { kstate: "staan", built: S.hold, bord: "vasthouden", puntjePose: "tekenen", puntjeAt: tip });
    hud(e);
  },
  "6d"(e) {
    const o = obstacle(), G = geom(o), u = clamp(e.t / 1.7, 0, 1);
    let kx = G.stop, lift = 0, st = "lopen";
    if (o.t === "verbinden") kx = lerp(G.stop, G.gap[1] + 260, ease(u));
    if (o.t === "ladder") {
      const top = G.wall[2];
      if (u < 0.5) { kx = G.wall[0] - 60; lift = (GROUND - top) * ease(u / 0.5); st = "klimmen"; }
      else { kx = lerp(G.wall[0] - 60, G.wall[1] + 160, (u - 0.5) / 0.5); lift = (GROUND - top) * (1 - clamp((u - 0.8) / 0.2, 0, 1)); st = "lopen"; }
    }
    if (o.t === "springen") { kx = lerp(G.stop, G.block[1] + 200, u); lift = Math.sin(clamp(u * 1.3, 0, 1) * Math.PI) * 190; st = "springen"; }
    if (o.t === "bukken") { kx = lerp(G.stop, G.bar[1] + 200, u); st = u > 0.15 && u < 0.85 ? "bukken" : "lopen"; }
    scene(e, o, { kx, lift, kstate: st, built: 1, bord: "gelukt", puntjePose: "juichen" });
    sterretjes(e.g, G.bord[0], G.bord[1], clamp(e.t / 1.2, 0, 1));
    hud(e);
  },
  "6e"(e) {
    const o = obstacle(), G = geom(o);
    scene(e, o, { kstate: "wiebelen", bord: "nu" });
    puntje(e.g, seq(["staan", PUNTJE_POSE[o.t]], e.t, 0.45), G.puntje[0], GROUND + 6, 330, e.t);
    hud(e);
  },
  "6f"(e) {
    const o = obstacle();
    const g = e.g;
    scene({ ...e, players: [null, null] }, o, { kstate: "zitten", bord: null, puntjePose: "wenken" });
    g.save(); g.globalAlpha = 0.35; const G = geom(o); bordje(g, G.bord[0], G.bord[1], "nu", gebaarVan(o), null); g.restore();
    voetjesVloer(e, false);
    hud(e);
  },

  "7a"(e) {
    const o = FINALE, G = geom(o);
    const enter = clamp(e.t / 1.6, 0, 1);
    const tip = [lerp(G.gap[0], G.gap[1], S.hold) + 40, GROUND + 6];
    scene(e, o, { kx: e.t < 1.6 ? lerp(380, G.stop, ease(enter)) : G.stop, kstate: e.t < 1.6 ? "lopen" : "omkijken", built: S.hold, bord: S.hold > 0 ? "vasthouden" : e.t > 1 ? "nu" : null, puntjePose: S.hold > 0 ? "tekenen" : "armen wijd", puntjeAt: S.hold > 0 ? tip : null });
    hud(e);
  },
  "7b"(e) {
    const o = FINALE, G = geom(o), u = clamp(e.t / 2, 0, 1);
    scene(e, o, { kx: lerp(G.stop, W + 80, ease(u)), kstate: "lopen", built: 1, bord: "gelukt", puntjePose: "juichen" });
    sterretjes(e.g, G.bord[0], G.bord[1], clamp(e.t / 1.2, 0, 1));
    hud(e);
  },

  "8a"(e) {
    const g = e.g;
    papier(g); kind(e); grond(g); kantlijn(g);
    deur(g, OX + 380, 0);
    const u = clamp(e.t / 1.2, 0, 1);
    krabbel(g, e.mine, lerp(560, OX + 250, ease(u)), GROUND + 4, 120, u < 1 ? "lopen" : "zwaaien", e.t);
    puntje(g, "juichen", 600, GROUND + 6, 250, e.t);
  },
  "8b"(e) {
    const g = e.g, u = clamp(e.t / 2, 0, 1);
    papier(g); kind(e); grond(g); kantlijn(g);
    scheur(g, OX + 380, GROUND - 170, easeOut(u));
    krabbel(g, e.mine, lerp(OX + 250, OX + 380, ease(u)), GROUND + 4 - u * 120, 120, "lopen", e.t, { scale: 1 - 0.85 * ease(u), alpha: 1 - clamp((u - 0.7) / 0.3, 0, 1) });
    puntje(g, "juichen", 600, GROUND + 6, 250, e.t);
  },
  "8c"(e) {
    const g = e.g;
    papier(g); grond(g); kantlijn(g);
    g.save(); g.globalAlpha = 0.5; scheur(g, W - 170, GROUND - 150, 0.35); g.restore();
    voortgang(g, W / 2 + KANT / 2, 64, COURSE.length + 1, COURSE.length + 1);
    const pop = easeBack(clamp(e.t / 0.6, 0, 1));
    g.save(); g.translate(W / 2 + 40, 430); g.scale(pop, pop); tijd(g, 0, 0, runTime(), 220, "center"); g.restore();
    puntje(g, seq(["buigen", "staan"], e.t, 1.2), 640, GROUND + 6, 300, e.t);
    const nudge = Math.sin(e.t * 5) * 18;
    pijl(g, 1380 + nudge, 660, 1.1);
  },
};

// The queue in the margin. me = position of your Krabbel (0 = bottom), hopping when near.
function rij(e, me = 0, meLeaves = false, meGone = false) {
  const g = e.g;
  const list = [e.others[0], e.others[1], e.others[2]];
  const slots = [GROUND + 4, 600, 420, 240];
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const y = slots[i];
    if (i === me) {
      if (meLeaves || meGone) continue;
      krabbel(g, e.mine, 130, y, 70, "springen", e.t, { lift: Math.abs(Math.sin(e.t * 5)) * 22 });
    } else {
      krabbel(g, list[k++ % 3], 130, y, 62, "staan", e.t + i, { alpha: 0.8 });
    }
  }
}
function voetjesVloer(e, bezet, alpha = 1) {
  const g = e.g;
  g.save(); g.globalAlpha *= alpha;
  const spots = e.duo ? [OX - 300, OX + 300] : [OX];
  spots.forEach((x, i) => voetjes(g, x, 960, Array.isArray(bezet) ? bezet[i] : bezet, e.t + i * 0.3, 1.1));
  g.restore();
}
function deur(g, x, open = 0) {
  g.lineWidth = 6; g.strokeStyle = K.inkt;
  rr(g, x - 85, GROUND - 270, 170, 270, 8); g.stroke();
  dot(g, x + 50, GROUND - 130, 8, K.inkt);
}
// The paper tears open: a jagged hole that grows. u = 0..1
function scheur(g, x, y, u) {
  const pts = 22, r = 40 + 170 * u;
  g.save();
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2, jag = i % 2 ? 0.72 : 1.05 + 0.08 * Math.sin(i * 7.3);
    g[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r * jag * 0.8, y + Math.sin(a) * r * jag);
  }
  g.closePath();
  g.fillStyle = K.inkt; g.fill();
  g.lineWidth = 6; g.strokeStyle = K.grijs; g.stroke();
  g.restore();
}

export function drawMuur(g, e) {
  const f = DRAW[S.id] || DRAW["1a"];
  f({ ...e, g });
}
