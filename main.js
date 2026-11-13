// =====================================================================
// Krabbels testdemo (grey, no theme)
// Three modes: Kalibratie, Run tijd, Run score. Solo or duo. Scoreboard on/off (to test it).
// The Krabbel walks from page to page. Obstacles:
//   connect : two points across a gap. Connect them with your arms
//             (same height = bridge, height difference = ramp).
//   ladder  : a wall. Both arms up.
//   jump    : a low block. Jump, the Krabbel jumps with you.
//   duck    : a low bar. Duck, the Krabbel ducks with you.
// Keyboard (for testing without camera), player 1 / player 2:
//   connect B / N   ladder L / O   jump J / U   duck (hold) K / I
// =====================================================================
import { POSE, Tracker, initCamera, initPose, handInHand } from "./pose.js?v=20261113d";
import { SvgCtx } from "./svgctx.js?v=20261113d";

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
const CFG = {
  floor: 0.74, // H. Base floor line of the level.
  silFloor: 0.95, // H. Where the silhouettes stand: lower, so your waist is at the Krabbel's height.
  figure: 0.5, // H. Height of a player silhouette.
  krabbel: 0.075, // H. Krabbel height.
  angleTol: 16, // degrees. How close your arm line must be to the line between the points.
  posTol: { solo: 0.09, duo: 0.14 }, // W. How far from the obstacle you may stand.
  togetherWidth: 2.2, // Obstacles for both players (1+2) are this many times wider, so two children fit side by side.
  togetherHold: 0.5, // s. Hand in hand: hold the right line this long (a lucky moment is not enough).
  jumpBuffer: 900, // ms. A jump this long before the Krabbel arrives still counts.
  duckBuffer: 350, // ms.
  promptAhead: 0.32, // pages. The next obstacle's instruction grows when the Krabbel is this close.
  nowAhead: 0.75, // seconds. Jump / duck: "NU" when the Krabbel arrives within this time.
  gravity: 3.2, // H / s²
  climbSpeed: 0.55, // H / s
  slideTime: 0.45, // s. Page transition.
  introTime: 6.5, // s. Short explanation (three cards) before the countdown, when switched on.
  maxPixelRatio: 2,
};

const MODES = {
  kalibratie: { key: "kalibratie", name: "Kalibratie" },
  tijd: { key: "tijd", name: "Run · tijd", speed: 0.15, wait: true, hold: 0.22, course: "tijd", board: "tijd" },
  // grace: when the Krabbel reaches an obstacle that is not done yet, it waits this long before it is a mistake.
  // Long at the start (2.5 s), shorter with every obstacle, 0.6 s after 20 obstacles.
  score: { key: "score", name: "Run · score", speed: 0.13, speedUp: 0.05, maxSpeed: 0.36, wait: false, hold: 0.2, course: "endless", board: "score", maxTime: 120, graceStart: 2.5, graceMin: 0.6, graceSteps: 20 },
};

// Fixed courses, so every child gets the same run. One array per page.
// connect: dh = height difference in H (+ = up). owner: 1, 2 or 3 (= together, duo only).
const COURSES = {
  tijd: [
    [{ t: "connect", dh: 0 }, { t: "jump" }],
    [{ t: "connect", dh: 0.12 }, { t: "ladder" }],
    [{ t: "duck" }, { t: "connect", dh: -0.12 }],
    [{ t: "jump" }, { t: "connect", dh: 0.18 }],
    [{ t: "ladder" }, { t: "duck" }],
    [{ t: "connect", dh: -0.18 }, { t: "jump" }],
  ],
};

// ---------------------------------------------------------------------
// DOM + canvas
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const video = $("webcam");
const canvas = $("game");
const screenCtx = canvas.getContext("2d");
let ctx = screenCtx; // swapped for an SvgCtx while exporting
const silLayer = document.createElement("canvas"); // silhouettes, drawn solid, then copied see-through
const silCtx = silLayer.getContext("2d");
let W = 0, H = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, CFG.maxPixelRatio);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const [c, g] of [[canvas, screenCtx], [silLayer, silCtx]]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener("resize", resize);
resize();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const FLOOR = () => CFG.floor * H;
const levelY = (lv) => FLOOR() - lv * H;

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------
const msgs = {};
function say(key, text, isError = false) {
  if (text) msgs[key] = { text, isError };
  else delete msgs[key];
  const list = Object.values(msgs);
  const el = $("message");
  el.innerHTML = list.map((m) => m.text).join("<br><br>");
  el.classList.toggle("visible", list.length > 0);
  el.classList.toggle("error", list.some((m) => m.isError));
}

// ---------------------------------------------------------------------
// Storage (leaderboards + test log). localStorage can fail: never crash.
// ---------------------------------------------------------------------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },
};
const boardKey = (board, duo) => `krabbels-testdemo-${board}-${duo ? "duo" : "solo"}`;
const LOG_KEY = "krabbels-testdemo-log";

function boardList(board, duo) {
  const list = store.get(boardKey(board, duo), []);
  return list.sort((a, b) => (board === "tijd" ? a.value - b.value : b.value - a.value));
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const tracker = new Tracker();
const sim = [
  { connect: false, ladder: false, duck: false, jumpAt: -1e9 },
  { connect: false, ladder: false, duck: false, jumpAt: -1e9 },
];
let landmarker = null;
let lastVideoTime = -1;

const S = {
  screen: "menu", // menu | game
  mode: MODES.tijd,
  boardOn: store.get("krabbels-testdemo-boardon", true),
  introOn: store.get("krabbels-testdemo-intro", true), // three explanation cards before the countdown // scoreboard shown or not (A/B test)
  duo: false,
  phase: "ready", // ready | countdown | play | fail | done
  phaseT: 0,
  runTime: 0, // seconds of play
  cleared: 0,
  pages: [],
  camX: 0, // page units
  slideFrom: 0,
  slideT: 1,
  k: null, // the Krabbel
  failType: null,
  result: null,
  debug: false,
  showCam: false,
  time: 0, // ms
  fps: 0,
  effects: [],
};

// ---------------------------------------------------------------------
// Course building
// ---------------------------------------------------------------------
const SIZE = {
  connect: { w: 0.13 },
  ladder: { w: 0.05, h: 0.26 },
  jump: { w: 0.025, h: 0.06 },
  duck: { w: 0.07, gap: 0.05 }, // gap = free height under the bar (H)
};
const MAX_LEVEL = 0.24;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makePage(index, specs, startLevel, duo) {
  const n = specs.length;
  const slots = n === 1 ? [0.5] : n === 2 ? [0.36, 0.72] : [0.3, 0.56, 0.82];
  let lv = startLevel;
  const obs = specs.map((sp, i) => {
    const together = duo && sp.owner === 3;
    const w = SIZE[sp.t].w * (together ? CFG.togetherWidth : 1);
    const xc = index + slots[i];
    const o = {
      t: sp.t,
      page: index,
      x0: xc - w / 2,
      x1: xc + w / 2,
      xc,
      base: lv,
      owner: duo ? sp.owner || (i % 2 === 0 ? 1 : 2) : 1,
      solved: false,
      match: 0, // seconds the right gesture has been held
      cleared: false,
      passed: false,
      wait: 0, // seconds the Krabbel waited here
      seenAt: null,
      solveTime: null,
      hold: together ? CFG.togetherHold : null, // seconds to hold, null = the mode's default
    };
    if (o.t === "connect") {
      let dh = sp.dh || 0;
      if (lv + dh > MAX_LEVEL || lv + dh < 0) dh = -dh;
      if (lv + dh > MAX_LEVEL || lv + dh < 0) dh = 0;
      o.la = lv;
      o.lb = lv + dh;
      lv = o.lb;
      o.stop = o.x0 - 0.006;
    } else if (o.t === "ladder") {
      o.top = lv + SIZE.ladder.h;
      o.stop = o.x0 - 0.018;
    } else if (o.t === "jump") {
      o.stop = o.x0 - 0.035;
    } else {
      o.stop = o.x0 - 0.03;
    }
    return o;
  });
  return { index, start: startLevel, end: lv, obs };
}

function buildCourse(mode, duo) {
  const pages = [];
  if (mode.course === "endless") {
    mode._rand = rng(Date.now());
    pages.push(makePage(0, [], 0, duo)); // empty start page
    return pages;
  }
  let lv = 0;
  COURSES[mode.course].forEach((specs, i) => {
    // Every third level the bridge / ramp is for both players together (never a jump, duck or ladder).
    const together = duo && i % 3 === 2 ? specs.findIndex((s) => s.t === "connect") : -1;
    const sp = specs.map((s, j) => ({ ...s, owner: j === together ? 3 : undefined }));
    const p = makePage(i, sp, lv, duo);
    pages.push(p);
    lv = p.end;
  });
  return pages;
}

// Endless mode: add pages ahead of the Krabbel.
function extendCourse() {
  const r = S.mode._rand;
  while (S.pages.length < Math.floor(S.k.x) + 3) {
    const i = S.pages.length;
    const prev = S.pages[i - 1];
    const n = S.cleared > 10 && r() < 0.5 ? 3 : 2;
    const specs = [];
    for (let j = 0; j < n; j++) {
      const pick = r();
      const t = pick < 0.4 ? "connect" : pick < 0.6 ? "jump" : pick < 0.8 ? "duck" : "ladder";
      const dh = [0, 0.12, -0.12, 0.18, -0.18][Math.floor(r() * 5)];
      specs.push({ t, dh });
    }
    // Every third page: the first bridge / ramp is for both players together.
    const together = S.duo && i % 3 === 0 ? specs.find((s) => s.t === "connect") : null;
    if (together) together.owner = 3;
    S.pages.push(makePage(i, specs, prev.end, S.duo));
  }
}

const allObs = () => S.pages.flatMap((p) => p.obs);
const finishX = () => (S.mode.course === "endless" ? Infinity : S.pages.length - 0.06);

// Ground height (H) at page position x, or null above an open gap.
function surfaceAt(x) {
  const p = S.pages[Math.floor(x)];
  if (!p) return S.pages.length ? S.pages[S.pages.length - 1].end : 0;
  let lv = p.start;
  for (const o of p.obs) {
    if (x < o.x0) return lv;
    if (o.t === "connect") {
      if (x <= o.x1) return o.solved ? lerp(o.la, o.lb, (x - o.x0) / (o.x1 - o.x0)) : null;
      lv = o.lb;
    } else if (o.t === "ladder") {
      if (x <= o.x1) return o.top;
    }
  }
  return lv;
}

// ---------------------------------------------------------------------
// Starting / ending a round
// ---------------------------------------------------------------------
function startGame(modeKey) {
  S.mode = MODES[modeKey];
  S.screen = "game";
  S.phase = S.mode.key === "kalibratie" ? "play" : "ready";
  S.phaseT = 0;
  S.runTime = 0;
  S.cleared = 0;
  S.effects = [];
  S.result = null;
  S.failType = null;
  S.camX = 0;
  S.slideT = 1;
  S.pages = S.mode.key === "kalibratie" ? [] : buildCourse(S.mode, S.duo);
  S.k = { x: 0.06, y: 0, vy: 0, state: "walk", anim: 0, jump: null, look: 0 };
  S.speed = S.mode.speed || 0;
  tracker.reset();
  showPanel(null);
}

function endRound(kind) {
  // kind: "done" (finished) | "fail" (score mode) | "quit"
  const obs = allObs();
  const waits = { connect: 0, ladder: 0, jump: 0, duck: 0 };
  obs.forEach((o) => (waits[o.t] += o.wait));
  const rec = {
    datum: new Date().toISOString().slice(0, 10),
    uur: new Date().toTimeString().slice(0, 5),
    modus: S.mode.name,
    spelers: S.duo ? "duo" : "solo",
    scorebord: S.boardOn ? "aan" : "uit",
    uitleg: S.introOn ? "aan" : "uit",
    afloop: kind === "done" ? "uitgespeeld" : kind === "time" ? "tijd op" : kind === "fail" ? "fout" : "gestopt",
    duur_s: S.runTime.toFixed(1),
    opgelost: S.cleared,
    fout_bij: S.failType || "",
    wacht_verbind_s: waits.connect.toFixed(1),
    wacht_ladder_s: waits.ladder.toFixed(1),
    wacht_spring_s: waits.jump.toFixed(1),
    wacht_buk_s: waits.duck.toFixed(1),
    naam: "",
  };
  if (S.mode.key !== "kalibratie") {
    const log = store.get(LOG_KEY, []);
    log.push(rec);
    store.set(LOG_KEY, log);
  }
  S.result = { kind, rec, logIndex: store.get(LOG_KEY, []).length - 1 };
  if (kind === "quit") return goMenu();
  S.phase = "done";
  showEnd();
}

function goMenu() {
  S.screen = "menu";
  showPanel("menu");
  renderMenu();
}

// ---------------------------------------------------------------------
// Gestures -> obstacles
// ---------------------------------------------------------------------
function ownersOf(o) {
  if (!S.duo) return [0];
  return o.owner === 3 ? [0, 1] : [o.owner - 1];
}

// Screen x of an obstacle centre (with the camera).
const obsScreenX = (o) => (o.xc - S.camX) * W;

// Target angle of a connect obstacle, as drawn on screen.
function connectAngle(o) {
  const dx = (o.x1 - o.x0) * W;
  const dy = (o.lb - o.la) * H;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// How far (px) from the obstacle centre a player may stand. A wide "together"
// obstacle counts its whole width, so both players can stand anywhere over it.
function posTolFor(o) {
  if (S.duo && o.owner === 3) return Infinity; // together: stand wherever you fit, side by side
  return (S.duo ? CFG.posTol.duo : CFG.posTol.solo) * W;
}

// Seconds an obstacle's gesture must be held.
const holdOf = (o) => o.hold || S.mode.hold;

// Hand in hand (measured in pose.js on the camera image): the angle of the line
// from outer hand to outer hand, or null when the outer arms are not stretched.
function chainArms() {
  if (!S.duo) return null;
  const h = handInHand(tracker.players);
  return h ? h.angle : null;
}

// A together bridge / ramp is solved hand in hand only: inner hands together,
// outer hands on one line with the right angle.
function togetherFits(o) {
  if (!(S.duo && o.owner === 3 && o.t === "connect")) return false;
  if (sim[0].connect && sim[1].connect) return true;
  const h = handInHand(tracker.players);
  return !!h && h.touching && Math.abs(h.angle - connectAngle(o)) <= CFG.angleTol;
}

function playerFits(i, o) {
  const p = tracker.players[i];
  const s = sim[i];
  if (o.t === "connect" && s.connect) return true;
  if (o.t === "ladder" && s.ladder) return true;
  if (!p.present) return false;
  const near = Math.abs(p.cx - obsScreenX(o)) <= posTolFor(o);
  if (o.t === "connect") return near && p.arms !== null && Math.abs(p.arms - connectAngle(o)) <= CFG.angleTol;
  if (o.t === "ladder") return near && p.ladder;
  return false;
}

function jumped(i, since) {
  const t = Math.max(tracker.players[i].jumpAt, sim[i].jumpAt);
  return t >= since;
}
function ducked(i) {
  const p = tracker.players[i];
  return sim[i].duck || p.ducking || S.time - p.duckAt <= CFG.duckBuffer;
}
function consumeJump(i) {
  tracker.players[i].jumpAt = -1e9;
  sim[i].jumpAt = -1e9;
}

// Connect + ladder can be solved as soon as they are on screen.
function updateSolving(dt) {
  // The page on screen, or the page sliding in: you can already solve it.
  const page = S.slideT >= 1 ? Math.round(S.camX) : S.slideTo;
  for (const o of allObs()) {
    if (o.solved || o.cleared || (o.t !== "connect" && o.t !== "ladder")) continue;
    if (o.page !== page) continue;
    if (o.seenAt === null) o.seenAt = S.runTime;
    const ok = S.duo && o.owner === 3 ? togetherFits(o) : ownersOf(o).every((i) => playerFits(i, o));
    o.match = ok ? o.match + dt : Math.max(0, o.match - dt * 2);
    if (o.match >= holdOf(o)) {
      o.solved = true;
      o.solveTime = S.runTime - o.seenAt;
      burst(o);
    }
  }
}

function burst(o) {
  const y = o.t === "connect" ? levelY((o.la + o.lb) / 2) : levelY(o.top || o.base);
  S.effects.push({ x: o.xc, y, t: 0 });
}

// ---------------------------------------------------------------------
// The Krabbel
// ---------------------------------------------------------------------
function nextObstacle() {
  return allObs().find((o) => !o.passed);
}

// Can the Krabbel pass this obstacle right now?
function canPass(o, since) {
  const owners = ownersOf(o);
  if (o.t === "connect" || o.t === "ladder") return o.solved;
  if (o.t === "jump") return owners.every((i) => jumped(i, since));
  if (o.t === "duck") return owners.every((i) => ducked(i));
  return true;
}

function startPass(o) {
  const k = S.k;
  o.cleared = true;
  if (o.t === "jump") {
    ownersOf(o).forEach(consumeJump);
    k.state = "jump";
    k.jump = { x0: k.x, x1: o.x1 + 0.035, y0: k.y, t: 0 };
  } else if (o.t === "duck") {
    k.state = "duck";
    k.duckUntil = o.x1 + 0.01;
  } else if (o.t === "ladder") {
    k.state = "climb";
    k.climbTo = o.top;
  }
  if (o.t !== "connect" && o.t !== "ladder") burst(o);
  S.cleared++;
  if (S.mode.speedUp) S.speed = Math.min(S.mode.maxSpeed, S.mode.speed * (1 + S.mode.speedUp * S.cleared));
}

// Score mode: seconds of grace at the next obstacle (shorter the further you get).
function graceNow() {
  const m = S.mode;
  return Math.max(m.graceMin, m.graceStart - ((m.graceStart - m.graceMin) * S.cleared) / m.graceSteps);
}

// 0..1 of the grace period left while the Krabbel waits (score mode), else null.
function graceLeft() {
  const k = S.k;
  if (!k || k.state !== "wait" || !isFinite(k.graceTotal)) return null;
  return clamp((k.graceUntil - S.time) / (k.graceTotal * 1000), 0, 1);
}

function fail(o) {
  const k = S.k;
  S.failType = { connect: "verbinden", ladder: "ladder", jump: "springen", duck: "bukken" }[o.t];
  S.phase = "fail";
  S.phaseT = 0;
  k.state = o.t === "connect" ? "fall" : "bonk";
  if (o.t === "connect") k.x = o.x0 + 0.01;
  else k.x = o.stop;
}

function updateKrabbel(dt) {
  const k = S.k;
  k.anim += dt;
  const sp = S.speed;
  const o = nextObstacle();

  if (k.state === "walk" || k.state === "duck") {
    let nx = k.x + sp * dt;
    if (o && !o.cleared && nx >= o.stop) {
      if (canPass(o, S.time - CFG.jumpBuffer)) {
        startPass(o);
      } else {
        // Wait at the obstacle. Time mode: as long as needed. Score mode: a grace period.
        nx = o.stop;
        k.state = "wait";
        k.waitSince = S.time;
        k.graceTotal = S.mode.wait ? Infinity : graceNow();
        k.graceUntil = S.time + k.graceTotal * 1000;
      }
    }
    if (k.state === "walk" || k.state === "duck") k.x = nx;
    if (k.state === "duck" && k.x > k.duckUntil) k.state = "walk";
  } else if (k.state === "wait") {
    o.wait += dt;
    if (canPass(o, k.waitSince - CFG.jumpBuffer)) {
      k.state = "walk";
      startPass(o);
    } else if (S.time > k.graceUntil) {
      return fail(o);
    }
  } else if (k.state === "climb") {
    k.y = Math.min(k.climbTo, k.y + CFG.climbSpeed * dt);
    if (k.y >= k.climbTo) {
      k.x = Math.max(k.x, o ? o.x0 + 0.004 : k.x);
      k.state = "walk";
    }
  } else if (k.state === "jump") {
    const j = k.jump;
    j.t += dt;
    const dur = Math.max(0.35, (j.x1 - j.x0) / Math.max(sp, 0.08));
    const u = Math.min(1, j.t / dur);
    k.x = lerp(j.x0, j.x1, u);
    const ground = surfaceAt(k.x) ?? j.y0;
    k.y = lerp(j.y0, ground, u) + Math.sin(u * Math.PI) * 0.13;
    if (u >= 1) {
      k.state = "walk";
      k.y = ground;
    }
  }

  // Mark obstacles behind the Krabbel as passed.
  for (const ob of allObs()) if (!ob.passed && ob.cleared && k.x > ob.x1 + 0.005) ob.passed = true;

  // Follow the ground (falls with gravity, steps up on ramps).
  if (k.state === "walk" || k.state === "duck" || k.state === "wait") {
    const g = surfaceAt(k.x);
    if (g === null || k.y > g + 0.002) {
      k.vy -= CFG.gravity * dt;
      k.y += k.vy * dt;
      if (g !== null && k.y <= g) {
        k.y = g;
        k.vy = 0;
      }
    } else {
      k.y = g;
      k.vy = 0;
    }
  }

  // Page change: slide the camera.
  const page = Math.floor(k.x);
  if (page !== Math.round(S.camX) && S.slideT >= 1 && page < S.pages.length) {
    S.slideFrom = S.camX;
    S.slideTo = page;
    S.slideT = 0;
    S.slideDur = Math.min(CFG.slideTime, 0.06 / Math.max(S.speed, 0.01)); // faster runs, faster slides
  }
  if (k.x >= finishX()) endRound("done");
}

function updateFail(dt) {
  const k = S.k;
  if (k.state === "fall") {
    k.vy -= CFG.gravity * dt;
    k.y += k.vy * dt;
  }
  if (S.phaseT > 1.4) endRound("fail");
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  S.fps = lerp(S.fps, 1 / Math.max(dt, 1e-3), 0.05);
  last = now;
  S.time = now;

  // Pose
  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const res = landmarker.detectForVideo(video, now);
      tracker.update(res, video, S.duo, { W, floor: CFG.silFloor * H, figure: CFG.figure * H }, now);
    } catch (e) {
      console.error(e);
    }
  }

  try {
    if (S.screen === "game") update(dt);
    draw();
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(frame);
}

function presentCount() {
  // Per player: seen by the camera, or playing with the keyboard.
  return [0, 1].filter((i) => {
    const s = sim[i];
    return tracker.players[i].present || s.connect || s.ladder || s.duck || S.time - s.jumpAt < 1500;
  }).length;
}

function update(dt) {
  S.phaseT += dt;
  if (S.slideT < 1) {
    S.slideT = Math.min(1, S.slideT + dt / (S.slideDur || CFG.slideTime));
    S.camX = lerp(S.slideFrom, S.slideTo, ease(S.slideT));
  }
  S.effects.forEach((e) => (e.t += dt));
  S.effects = S.effects.filter((e) => e.t < 0.8);

  if (S.mode.key === "kalibratie") return;

  if (S.phase === "ready") {
    const need = S.duo ? 2 : 1;
    if (presentCount() >= need) {
      S.phase = S.introOn ? "intro" : "countdown";
      S.phaseT = 0;
    }
  } else if (S.phase === "intro") {
    if (S.phaseT >= CFG.introTime) {
      S.phase = "countdown";
      S.phaseT = 0;
    }
  } else if (S.phase === "countdown") {
    if (S.phaseT >= 3) {
      S.phase = "play";
      S.phaseT = 0;
    }
  } else if (S.phase === "play") {
    S.runTime += dt;
    if (S.mode.maxTime && S.runTime >= S.mode.maxTime) return endRound("time");
    if (S.mode.course === "endless") extendCourse();
    updateSolving(dt);
    updateKrabbel(dt);
  } else if (S.phase === "fail") {
    updateFail(dt);
  }
}

// ---------------------------------------------------------------------
// Drawing (grey only)
// ---------------------------------------------------------------------
const C = {
  bg: "#ffffff",
  ground: "#c4c4c4",
  groundEdge: "#9a9a9a",
  block: "#8f8f8f",
  dark: "#3d3d3d",
  mid: "#777777",
  light: "#e6e6e6",
  silhouette: "rgba(0,0,0,0.13)",
  ok: "#222222",
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function px(x) {
  return (x - S.camX) * W;
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(str, x, y, size, color = C.dark, align = "center", weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}

function draw() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  if (S.screen !== "game") {
    drawSilhouettes();
    return;
  }
  if (S.showCam) drawCamera();
  if (S.mode.key === "kalibratie") return drawCalibration();

  drawWorld();
  drawSilhouettes();
  drawKrabbel();
  drawPrompts();
  drawEffects();
  drawHud();
  if (S.phase === "ready") drawReady();
  if (S.phase === "intro") drawIntro();
  if (S.phase === "countdown") drawCountdown();
  if (S.debug) drawDebug();
}

function drawCamera() {
  if (video.readyState < 2) return;
  const w = W * 0.22, h = (w * (video.videoHeight || 9)) / (video.videoWidth || 16);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.translate(W - 16, 16);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
}

// --- world ---------------------------------------------------------------
function drawWorld() {
  const first = Math.max(0, Math.floor(S.camX) - 1);
  const lastP = Math.min(S.pages.length - 1, Math.ceil(S.camX) + 1);
  for (let i = first; i <= lastP; i++) drawPage(S.pages[i]);
  if (S.mode.course !== "endless") {
    // Finish: a door at the end of the last page.
    const x = px(finishX());
    if (x > -50 && x < W + 50) {
      const lv = S.pages[S.pages.length - 1].end;
      const h = H * 0.2, w = H * 0.11;
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.dark;
      ctx.strokeRect(x - w / 2, levelY(lv) - h, w, h);
      ctx.fillStyle = C.dark;
      ctx.beginPath();
      ctx.arc(x + w * 0.28, levelY(lv) - h * 0.45, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function groundRect(x0, x1, lv) {
  const a = px(x0), b = px(x1);
  if (b < -10 || a > W + 10) return;
  const y = levelY(lv);
  ctx.fillStyle = C.ground;
  ctx.fillRect(a, y, b - a, H - y);
  ctx.fillStyle = C.groundEdge;
  ctx.fillRect(a, y, b - a, 5);
}

function drawPage(p) {
  let x = p.index, lv = p.start;
  for (const o of p.obs) {
    if (o.t === "connect") {
      groundRect(x, o.x0, lv);
      x = o.x1;
      lv = o.lb;
    }
  }
  groundRect(x, p.index + 1, lv);
  for (const o of p.obs) drawObstacle(o);
}

function drawObstacle(o) {
  const a = px(o.x0), b = px(o.x1);
  if (b < -40 || a > W + 40) return;
  if (o.t === "connect") {
    const A = { x: a, y: levelY(o.la) }, B = { x: b, y: levelY(o.lb) };
    if (o.solved) {
      ctx.strokeStyle = C.mid;
      ctx.lineWidth = H * 0.022;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(A.x, A.y + H * 0.008);
      ctx.lineTo(B.x, B.y + H * 0.008);
      ctx.stroke();
    } else {
      // Target line (dashed) + live feedback of the owner's arm line.
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = C.light;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawArmFeedback(o, A, B);
    }
    const pulse = o.solved ? 0 : 0.5 + 0.5 * Math.sin(S.time / 220);
    for (const P of [A, B]) {
      ctx.fillStyle = C.dark;
      ctx.beginPath();
      ctx.arc(P.x, P.y, H * 0.016, 0, Math.PI * 2);
      ctx.fill();
      if (!o.solved) {
        ctx.strokeStyle = `rgba(0,0,0,${0.35 * (1 - pulse)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(P.x, P.y, H * (0.02 + 0.02 * pulse), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (o.match > 0 && !o.solved) ring(o.xc, (o.la + o.lb) / 2, o.match / holdOf(o));
  } else if (o.t === "ladder") {
    const y0 = levelY(o.base), y1 = levelY(o.top);
    ctx.fillStyle = C.block;
    ctx.fillRect(a, y1, b - a, y0 - y1);
    if (o.solved) {
      const lx = a - H * 0.035, w = H * 0.03;
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(lx, y0);
      ctx.lineTo(lx, y1 - 8);
      ctx.moveTo(lx + w, y0);
      ctx.lineTo(lx + w, y1 - 8);
      for (let y = y0 - 14; y > y1; y -= 18) {
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + w, y);
      }
      ctx.stroke();
    }
    if (o.match > 0 && !o.solved) ring(o.xc, o.top + 0.05, o.match / holdOf(o));
  } else if (o.t === "jump") {
    const y = levelY(o.base);
    ctx.fillStyle = C.block;
    ctx.fillRect(a, y - SIZE.jump.h * H, b - a, SIZE.jump.h * H);
  } else if (o.t === "duck") {
    const y = levelY(o.base) - (SIZE.duck.gap + 0.0) * H;
    ctx.fillStyle = C.block;
    ctx.fillRect(a, 0, b - a, y);
  }
}

function ring(xc, lv, f) {
  const x = px(xc), y = levelY(lv) - H * 0.07, r = H * 0.03;
  ctx.strokeStyle = C.light;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.dark;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(f, 0, 1));
  ctx.stroke();
}

// Show the owner's arm line over the gap, so they see how close they are.
function drawArmFeedback(o, A, B) {
  const owners = ownersOf(o);
  const chain = S.duo && o.owner === 3 ? chainArms() : null;
  if (chain !== null) {
    const ang = (-chain * Math.PI) / 180;
    const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2, half = Math.hypot(B.x - A.x, B.y - A.y) / 2;
    ctx.strokeStyle = togetherFits(o) ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = H * 0.012;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * half, cy - Math.sin(ang) * half);
    ctx.lineTo(cx + Math.cos(ang) * half, cy + Math.sin(ang) * half);
    ctx.stroke();
    return;
  }
  owners.forEach((i) => {
    const p = tracker.players[i];
    if (!p.present || p.arms === null) return;
    const ang = (-p.arms * Math.PI) / 180;
    const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2, half = Math.hypot(B.x - A.x, B.y - A.y) / 2;
    const ok = playerFits(i, o);
    ctx.strokeStyle = ok ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = H * 0.012;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * half, cy - Math.sin(ang) * half);
    ctx.lineTo(cx + Math.cos(ang) * half, cy + Math.sin(ang) * half);
    ctx.stroke();
  });
}

// --- Krabbel: a little man with eyes, grey --------------------------------
function drawKrabbel() {
  const k = S.k;
  const x = px(k.x);
  const ground = levelY(k.y);
  const h = CFG.krabbel * H;
  const duck = k.state === "duck";
  const bodyR = h * (duck ? 0.32 : 0.38);
  const legLen = duck ? h * 0.12 : h * 0.3;
  const cy = ground - legLen - bodyR;
  const walking = ["walk", "duck", "jump"].includes(k.state) && S.phase === "play";
  const step = walking ? Math.sin(k.anim * 14) : 0;

  ctx.save();
  if (k.state === "bonk") ctx.translate(Math.sin(S.phaseT * 40) * 3 * Math.max(0, 1 - S.phaseT), 0);
  // legs
  ctx.strokeStyle = C.dark;
  ctx.lineWidth = h * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - bodyR * 0.35, cy + bodyR * 0.8);
  ctx.lineTo(x - bodyR * 0.35 + step * h * 0.12, ground);
  ctx.moveTo(x + bodyR * 0.35, cy + bodyR * 0.8);
  ctx.lineTo(x + bodyR * 0.35 - step * h * 0.12, ground);
  ctx.stroke();
  // arms (up while climbing)
  ctx.beginPath();
  const armUp = k.state === "climb" ? -1 : 0.4;
  ctx.moveTo(x - bodyR * 0.9, cy);
  ctx.lineTo(x - bodyR * 1.5, cy + armUp * bodyR);
  ctx.moveTo(x + bodyR * 0.9, cy);
  ctx.lineTo(x + bodyR * 1.5, cy + armUp * bodyR);
  ctx.stroke();
  // body
  ctx.fillStyle = "#5a5a5a";
  ctx.beginPath();
  ctx.ellipse(x, cy, bodyR, duck ? bodyR * 0.8 : bodyR, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes: look at the next obstacle, or worried when waiting
  const o = nextObstacle();
  const look = k.state === "wait" ? 0.15 : 0.45;
  for (const s of [-1, 1]) {
    const ex = x + s * bodyR * 0.38 + bodyR * 0.12, ey = cy - bodyR * 0.2;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex, ey, bodyR * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    const blink = Math.sin(S.time / 900) > 0.985 ? 0.2 : 1;
    ctx.ellipse(ex + bodyR * 0.12 * look * (o ? 1 : 0), ey + (k.state === "wait" ? -bodyR * 0.08 : 0), bodyR * 0.14, bodyR * 0.14 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- instructions (quick time event style) ---------------------------------
function drawPrompts() {
  if (S.phase !== "play" && S.phase !== "countdown" && S.phase !== "ready") return;
  const next = nextObstacle();
  for (const o of allObs()) {
    if (o.cleared || o.page < Math.floor(S.camX) - 0 || o.page > Math.ceil(S.camX)) continue;
    const isNext = o === next;
    const dist = o.stop - S.k.x;
    const close = isNext && dist < CFG.promptAhead;
    let now = false;
    if (isNext && (o.t === "jump" || o.t === "duck")) now = dist / Math.max(S.speed, 0.01) < CFG.nowAhead || S.k.state === "wait";
    if (isNext && (o.t === "connect" || o.t === "ladder") && S.k.state === "wait") now = true;
    drawPrompt(o, close ? 1.35 : isNext ? 1.05 : 0.8, now, isNext);
  }
}

function promptAnchor(o) {
  if (o.t === "connect") return { x: px(o.xc), y: levelY(Math.max(o.la, o.lb)) - H * 0.2 };
  if (o.t === "ladder") return { x: px(o.xc), y: levelY(o.top) - H * 0.13 };
  if (o.t === "jump") return { x: px(o.xc), y: levelY(o.base) - H * 0.25 };
  return { x: px(o.xc), y: levelY(o.base) + H * 0.1 - H * 0.42 };
}

function drawPrompt(o, scale, now, isNext) {
  const { x, y } = promptAnchor(o);
  const s = H * 0.085 * scale * (now ? 1 + 0.06 * Math.sin(S.time / 90) : 1);
  ctx.save();
  ctx.globalAlpha = isNext ? 1 : 0.45;
  rr(x - s * 0.62, y - s * 0.62, s * 1.24, s * 1.24, s * 0.22);
  ctx.fillStyle = now ? C.dark : "#fff";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.dark;
  ctx.stroke();
  const fg = now ? "#fff" : C.dark;
  pictogram(o.t === "connect" && S.duo && o.owner === 3 ? "connect2" : o.t, x, y, s, fg, o.t === "connect" ? connectAngle(o) : 0);
  const left = isNext ? graceLeft() : null;
  if (left !== null) {
    ctx.lineCap = "round";
    ctx.lineWidth = s * 0.09;
    ctx.strokeStyle = C.light;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.dark;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
  }
  if (S.duo) {
    const label = o.owner === 3 ? "1+2" : String(o.owner);
    rr(x + s * 0.32, y - s * 0.86, s * 0.62, s * 0.36, s * 0.18);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(label, x + s * 0.63, y - s * 0.68, s * 0.24, C.dark);
  }
  ctx.restore();
}

// Stick figure pictograms in a box of size s around (x, y).
function pictogram(type, x, y, s, color, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.075;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const head = (hx, hy) => {
    ctx.beginPath();
    ctx.arc(hx, hy, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  const u = s * 0.1;
  if (type === "stand") {
    ctx.beginPath();
    ctx.arc(0, -3.2 * u, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
    line([0, -2.2 * u, 0, 1 * u]);
    line([-1.2 * u, 4 * u, 0, 1 * u, 1.2 * u, 4 * u]);
    line([-1.3 * u, 0.6 * u, -0.5 * u, -1.6 * u, 0.5 * u, -1.6 * u, 1.3 * u, 0.6 * u]);
  } else if (type === "connect2") {
    // two children hand in hand, outer arms along the line
    const a = (-angle * Math.PI) / 180, L = 2.2 * u;
    for (const sx of [-1.9, 1.9]) {
      ctx.beginPath();
      ctx.arc(sx * u, -3 * u, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      line([sx * u, -2.1 * u, sx * u, 0.8 * u]);
      line([(sx - 0.9) * u, 3.6 * u, sx * u, 0.8 * u, (sx + 0.9) * u, 3.6 * u]);
    }
    line([-1.9 * u - Math.cos(a) * L, -1.6 * u - Math.sin(a) * L, -1.9 * u, -1.6 * u, 0, -0.6 * u, 1.9 * u, -1.6 * u, 1.9 * u + Math.cos(a) * L, -1.6 * u + Math.sin(a) * L]);
  } else if (type === "connect" || type === "ladder") {
    head(0, -3.2 * u);
    line([0, -2.2 * u, 0, 1 * u]); // body
    line([-1.2 * u, 4 * u, 0, 1 * u, 1.2 * u, 4 * u]); // legs
    if (type === "connect") {
      const a = (-angle * Math.PI) / 180, L = 3.6 * u;
      line([-Math.cos(a) * L, -1.6 * u - Math.sin(a) * L, Math.cos(a) * L, -1.6 * u + Math.sin(a) * L]);
    } else {
      line([-1.4 * u, -5 * u, -0.5 * u, -1.6 * u, 0.5 * u, -1.6 * u, 1.4 * u, -5 * u]);
    }
  } else if (type === "jump") {
    head(0, -3.6 * u);
    line([0, -2.6 * u, 0, 0.2 * u]);
    line([-1.5 * u, -0.6 * u, 0, -2 * u, 1.5 * u, -0.6 * u]);
    line([-1.1 * u, 1.6 * u, 0, 0.2 * u, 1.1 * u, 1.6 * u]);
    line([-2.6 * u, 3.6 * u, 2.6 * u, 3.6 * u]); // ground
    line([3.6 * u, -1 * u, 3.6 * u, -4.4 * u]); // arrow up
    line([2.8 * u, -3.4 * u, 3.6 * u, -4.4 * u, 4.4 * u, -3.4 * u]);
  } else if (type === "duck") {
    head(0, -0.4 * u);
    line([0, 0.5 * u, 0, 2.2 * u]);
    line([-1.4 * u, 3.6 * u, -0.4 * u, 2.4 * u, 0.4 * u, 2.4 * u, 1.4 * u, 3.6 * u]);
    line([-1.2 * u, 1.6 * u, 0, 1 * u, 1.2 * u, 1.6 * u]);
    line([-3 * u, -2.6 * u, 3 * u, -2.6 * u]); // bar
    line([3.8 * u, -1.6 * u, 3.8 * u, 2.4 * u]); // arrow down
    line([3 * u, 1.4 * u, 3.8 * u, 2.4 * u, 4.6 * u, 1.4 * u]);
  }
  ctx.restore();
}

function drawEffects() {
  for (const e of S.effects) {
    const x = px(e.x), r = H * (0.03 + e.t * 0.15);
    ctx.strokeStyle = `rgba(0,0,0,${0.5 * (1 - e.t / 0.8)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// --- players ---------------------------------------------------------------
function drawSilhouettes(alpha = 1, big = false) {
  tracker.players.forEach((p, i) => {
    if (!p.present || !p.body) return;
    const b = p.body;
    const opacity = (big ? 0.22 : 0.13) * alpha;
    // Drawn solid first, then made see-through as a whole, so overlapping
    // limbs don't show darker joints.
    if (ctx instanceof SvgCtx) {
      ctx.beginGroup(`speler-${i + 1}`, opacity);
      drawFigure(ctx, b);
      ctx.endGroup();
    } else {
      silCtx.clearRect(0, 0, W, H);
      drawFigure(silCtx, b);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(silLayer, 0, 0, W, H);
      ctx.restore();
    }
    const shMid = { x: (b.lSh.x + b.rSh.x) / 2, y: (b.lSh.y + b.rSh.y) / 2 };
    const headR = Math.hypot(b.lSh.x - b.rSh.x, b.lSh.y - b.rSh.y) * 0.42;
    if (S.duo) text(String(i + 1), p.cx, Math.min(b.nose.y, shMid.y) - headR * 2.4, H * 0.04, C.mid);
    if (S.screen === "game" && S.mode.key !== "kalibratie") drawStepHint(p, i);
  });
}

function drawFigure(g, b) {
  g.save();
  g.strokeStyle = "#000";
  g.fillStyle = "#000";
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = H * 0.035;
  const seg = (...names) => {
    g.beginPath();
    g.moveTo(b[names[0]].x, b[names[0]].y);
    for (const n of names.slice(1)) g.lineTo(b[n].x, b[n].y);
    g.stroke();
  };
  seg("lWr", "lEl", "lSh", "rSh", "rEl", "rWr");
  seg("lSh", "lHip", "lKn", "lAn");
  seg("rSh", "rHip", "rKn", "rAn");
  seg("lHip", "rHip");
  const shMid = { x: (b.lSh.x + b.rSh.x) / 2, y: (b.lSh.y + b.rSh.y) / 2 };
  const headR = Math.hypot(b.lSh.x - b.rSh.x, b.lSh.y - b.rSh.y) * 0.42;
  g.beginPath();
  g.arc(b.nose.x, Math.min(b.nose.y, shMid.y - headR * 1.1), headR, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// Arrow under a player who stands too far from their next obstacle.
function drawStepHint(p, i) {
  const o = nextObstacle();
  if (!o || o.solved || (o.t !== "connect" && o.t !== "ladder") || !ownersOf(o).includes(i)) return;
  if (o.page !== (S.slideT >= 1 ? Math.round(S.camX) : S.slideTo)) return;
  const tol = posTolFor(o);
  const dx = obsScreenX(o) - p.cx;
  if (Math.abs(dx) <= tol) return;
  const dir = Math.sign(dx), y = FLOOR() + H * 0.09, x = p.cx + dir * H * 0.05;
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.moveTo(x + dir * H * 0.06, y);
  ctx.lineTo(x, y - H * 0.03);
  ctx.lineTo(x, y + H * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(dir > 0 ? x - H * 0.06 : x, y - H * 0.01, H * 0.06, H * 0.02);
}

// --- HUD + overlays ----------------------------------------------------------
function drawHud() {
  const pad = H * 0.04;
  text(`${S.mode.name} · ${S.duo ? "duo" : "solo"}`, pad, pad, H * 0.028, C.mid, "left", 600);
  if (S.mode.key === "tijd") text(fmtTime(S.runTime), W - pad, pad + H * 0.01, H * 0.05, C.dark, "right");
  if (S.mode.key === "score") {
    text(String(S.cleared), W - pad, pad + H * 0.01, H * 0.06, C.dark, "right");
    text(fmtTime(Math.max(0, S.mode.maxTime - S.runTime)).replace(/\.\d$/, ""), W - pad, pad + H * 0.065, H * 0.022, C.mid, "right", 600);
  }
  if (S.mode.course !== "endless") {
    const n = S.pages.length, r = H * 0.009, gap = H * 0.03;
    const page = clamp(Math.floor(S.k.x), 0, n - 1);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i <= page ? C.dark : C.light;
      ctx.beginPath();
      ctx.arc(W / 2 + (i - (n - 1) / 2) * gap, pad, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!(ctx instanceof SvgCtx)) text("Esc = menu", W - pad, H - pad * 0.6, H * 0.018, "#aaa", "right", 500);
}

function drawReady() {
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(0, 0, W, H);
  const need = S.duo ? 2 : 1, have = presentCount();
  text(S.duo ? "Ga met twee voor de camera staan" : "Ga voor de camera staan", W / 2, H * 0.4, H * 0.05);
  text(`${Math.min(have, need)} / ${need}`, W / 2, H * 0.48, H * 0.04, C.mid);
  text("Spatie = toch starten", W / 2, H * 0.56, H * 0.022, "#999", "center", 500);
}

// --- short explanation before the countdown: three cards ---------------------
const INTRO_CARDS = () => [
  { pics: [S.duo ? "connect2" : "connect"], label: S.duo ? "Hand in hand = brug" : "Armen wijd = brug", step: !S.duo, sub: S.duo ? "Waar je maar wil" : "Ga erbij staan" },
  { pics: ["ladder"], label: "Armen omhoog = ladder", step: true, sub: "Ga erbij staan" },
  { pics: ["jump", "duck"], label: "Spring of buk" },
];
function drawIntro() {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, 0, W, H);
  const t = S.phaseT;
  text("Zo speel je", W / 2, H * 0.13, H * 0.06);
  const cw = Math.min(W * 0.27, H * 0.52), ch = cw * 1.12, gap = cw * 0.12;
  const x0 = W / 2 - (3 * cw + 2 * gap) / 2, y0 = H * 0.22;
  // Stepping animation for cards 1 + 2: stand next to the obstacle, step in front of it, do the gesture.
  const s = t % 2.8;
  const move = s < 0.6 ? 0 : s < 1.1 ? ease((s - 0.6) / 0.5) : 1;
  const armed = s >= 1.1, grow = clamp((s - 1.4) / 1.0, 0, 1), arrowOn = s < 1.1;
  const stepFig = (fx, gy, pic, size) => pictogram(armed ? pic : "stand", fx, gy - size * 0.42, size, "#9a9a9a", 0);
  const arrow = (ax, ay, len) => {
    if (!arrowOn || Math.sin(t * 12) < -0.3) return;
    ctx.fillStyle = C.dark;
    ctx.fillRect(ax, ay - len * 0.08, len * 0.6, len * 0.16);
    ctx.beginPath();
    ctx.moveTo(ax + len, ay);
    ctx.lineTo(ax + len * 0.55, ay - len * 0.3);
    ctx.lineTo(ax + len * 0.55, ay + len * 0.3);
    ctx.closePath();
    ctx.fill();
  };
  INTRO_CARDS().forEach((c, i) => {
    const x = x0 + i * (cw + gap), appear = clamp((t - i * 0.35) / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(0, (1 - appear) * H * 0.03);
    rr(x, y0, cw, ch, cw * 0.08);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.dark;
    ctx.stroke();
    text(String(i + 1), x + cw * 0.1, y0 + cw * 0.1, cw * 0.08, C.mid);
    const pic = c.pics[Math.floor(t / 1.2) % c.pics.length];
    const bob = Math.sin(t * 4 + i) * cw * 0.015;
    pictogram(pic, x + cw / 2, y0 + ch * 0.27 + bob, cw * 0.34, C.dark, 0);
    const gy = y0 + ch * 0.7, fs = cw * 0.24;
    ctx.lineCap = "round";
    if (i === 0) {
      const a = x + cw * 0.3, b = x + cw * 0.7;
      ctx.fillStyle = C.ground;
      ctx.fillRect(x + cw * 0.06, gy, a - x - cw * 0.06, cw * 0.06);
      ctx.fillRect(b, gy, x + cw * 0.94 - b, cw * 0.06);
      let f = (t % 1.8) / 1.4;
      if (c.step) {
        const fx = lerp(x + cw * 0.14, (a + b) / 2, move);
        stepFig(fx, gy, "connect", fs);
        arrow(fx + fs * 0.35, gy - fs * 0.45, fs * 0.45);
        f = grow;
      }
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = cw * 0.03;
      ctx.beginPath();
      ctx.moveTo(a, gy);
      ctx.lineTo(lerp(a, b, clamp(f, 0, 1)), gy);
      ctx.stroke();
      ctx.fillStyle = C.dark;
      for (const px of [a, b]) {
        ctx.beginPath();
        ctx.arc(px, gy, cw * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (i === 1) {
      const wx = x + cw * 0.62, top = gy - cw * 0.28;
      ctx.fillStyle = C.ground;
      ctx.fillRect(x + cw * 0.06, gy, cw * 0.88, cw * 0.04);
      const fx = lerp(x + cw * 0.2, wx + cw * 0.06, move);
      ctx.fillStyle = C.block;
      ctx.fillRect(wx, top, cw * 0.12, gy - top);
      ctx.save();
      ctx.globalAlpha *= 0.8;
      stepFig(fx, gy, "ladder", fs);
      ctx.restore();
      arrow(fx + fs * 0.35, gy - fs * 0.45, fs * 0.45);
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = cw * 0.015;
      const lx = wx - cw * 0.1, up = lerp(gy, top, grow);
      if (grow > 0) {
        ctx.beginPath();
        ctx.moveTo(lx, gy);
        ctx.lineTo(lx, up);
        ctx.moveTo(lx + cw * 0.07, gy);
        ctx.lineTo(lx + cw * 0.07, up);
        for (let y = gy - cw * 0.04; y > up; y -= cw * 0.05) {
          ctx.moveTo(lx, y);
          ctx.lineTo(lx + cw * 0.07, y);
        }
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = C.ground;
      ctx.fillRect(x + cw * 0.06, gy, cw * 0.88, cw * 0.04);
      ctx.fillStyle = C.block;
      if (pic === "jump") ctx.fillRect(x + cw * 0.46, gy - cw * 0.08, cw * 0.08, cw * 0.08);
      else ctx.fillRect(x + cw * 0.42, y0 + ch * 0.5, cw * 0.16, gy - cw * 0.12 - (y0 + ch * 0.5));
    }
    if (c.sub) text(c.sub, x + cw / 2, y0 + ch * 0.82, cw * 0.06, C.mid, "center", 600);
    text(c.label, x + cw / 2, y0 + ch * 0.92, cw * 0.075, C.dark);
    ctx.restore();
  });
  const bw = W * 0.3, by = H * 0.86, f = clamp(t / CFG.introTime, 0, 1);
  rr(W / 2 - bw / 2, by, bw, H * 0.012, H * 0.006);
  ctx.fillStyle = C.light;
  ctx.fill();
  rr(W / 2 - bw / 2, by, Math.max(H * 0.012, bw * f), H * 0.012, H * 0.006);
  ctx.fillStyle = C.dark;
  ctx.fill();
  text("Spatie = meteen starten", W / 2, H * 0.92, H * 0.022, "#999", "center", 500);
}

function drawCountdown() {
  const n = 3 - Math.floor(S.phaseT);
  const f = S.phaseT % 1;
  text(String(n), W / 2, H * 0.4, H * (0.22 - f * 0.05), `rgba(0,0,0,${1 - f * 0.6})`);
}

function drawCalibration() {
  // Floor line
  ctx.fillStyle = C.light;
  ctx.fillRect(0, CFG.silFloor * H, W, 4);
  drawSilhouettes(1, true);
  const types = ["connect", "ladder", "jump", "duck"];
  const names = { connect: "Verbinden", ladder: "Ladder", jump: "Springen", duck: "Bukken" };
  const n = S.duo ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const p = tracker.players[i];
    const s = sim[i];
    let act = null, detail = "";
    if (p.present || s.connect || s.ladder || s.duck) {
      if (S.time - Math.max(p.jumpAt, s.jumpAt) < 600) act = "jump";
      else if (p.ducking || s.duck) act = "duck";
      else if (p.ladder || s.ladder) act = "ladder";
      else if (p.arms !== null || s.connect) {
        act = "connect";
        detail = p.arms !== null ? `${Math.round(p.arms)}°` : "";
      }
    }
    const cx = S.duo ? W * (i === 0 ? 0.27 : 0.73) : W / 2;
    if (S.duo) text(`Speler ${i + 1}`, cx, H * 0.06, H * 0.03, C.mid, "center", 600);
    if (!p.present && !s.connect && !s.ladder && !s.duck) {
      text("niet gezien", cx, H * 0.13, H * 0.04, "#bbb");
      continue;
    }
    text(act ? names[act] + (detail ? " " + detail : "") : "—", cx, H * 0.13, H * 0.055, act ? C.dark : "#bbb");
    // Row of the four actions, the recognised one filled.
    const s0 = H * 0.065, gap = s0 * 1.5;
    types.forEach((t, j) => {
      const x = cx + (j - 1.5) * gap, y = H * 0.24;
      const on = act === t;
      rr(x - s0 * 0.62, y - s0 * 0.62, s0 * 1.24, s0 * 1.24, s0 * 0.22);
      ctx.fillStyle = on ? C.dark : "#fff";
      ctx.fill();
      ctx.strokeStyle = on ? C.dark : "#ccc";
      ctx.lineWidth = 2;
      ctx.stroke();
      pictogram(t, x, y, s0, on ? "#fff" : "#bbb", t === "connect" && act === "connect" ? p.arms || 0 : 0);
    });
    // Meters: how far your shoulders are above (jump) / below (duck) normal.
    if (p.present) {
      meter(cx - gap * 1.1, H * 0.34, "Springen", p.lift, POSE.jumpIn, p.jumping || S.time - p.jumpAt < 600);
      meter(cx + gap * 0.3, H * 0.34, "Bukken", p.drop, POSE.duckIn, p.ducking);
    }
  }
  if (S.duo) {
    const h = handInHand(tracker.players);
    const label = !h ? "Hand in hand: —" : h.touching ? `Hand in hand ${Math.round(h.angle)}°` : "Armen wijd, nu nog elkaars hand";
    text(label, W / 2, H * 0.06, H * 0.03, h && h.touching ? C.dark : "#bbb", "center", 700);
  }
  if (!(ctx instanceof SvgCtx)) text(`${S.duo ? "Duo" : "Solo"} · Esc = menu`, W - H * 0.04, H - H * 0.03, H * 0.018, "#aaa", "right", 500);
  if (S.debug) drawDebug();
}

// Horizontal bar: value against threshold (the threshold sits at 2/3 of the bar).
function meter(x, y, label, value, threshold, on) {
  const w = H * 0.16, h = H * 0.018, max = threshold * 1.5;
  const f = clamp(value / max, 0, 1);
  text(label, x, y - h * 1.4, H * 0.018, C.mid, "left", 600);
  rr(x, y, w, h, h / 2);
  ctx.fillStyle = C.light;
  ctx.fill();
  if (f > 0) {
    rr(x, y, Math.max(h, w * f), h, h / 2);
    ctx.fillStyle = on ? C.dark : "#aaa";
    ctx.fill();
  }
  ctx.fillStyle = C.dark;
  ctx.fillRect(x + w * (threshold / max) - 1, y - 4, 2, h + 8);
  text(value.toFixed(2), x + w + 8, y + h / 2, H * 0.016, C.mid, "left", 500);
}

function drawDebug() {
  const lines = [`fps ${Math.round(S.fps)}  personen ${tracker.count}  snelheid ${S.speed?.toFixed?.(3) ?? "-"}`];
  tracker.players.forEach((p, i) => {
    if (!p.present) return;
    lines.push(`speler ${i + 1}: armen ${p.arms === null ? "-" : Math.round(p.arms) + "°"}  ladder ${p.ladder}  buk ${p.drop.toFixed(2)}  sprong ${p.lift.toFixed(2)}  x ${Math.round(p.cx)}`);
  });
  ctx.font = `500 13px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#c00";
  lines.forEach((l, i) => ctx.fillText(l, 12, H - 60 + i * 16));
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// ---------------------------------------------------------------------
// Panels (menu, end screen)
// ---------------------------------------------------------------------
function showPanel(id) {
  for (const el of document.querySelectorAll(".panel")) el.hidden = el.id !== id;
  document.body.classList.toggle("playing", id === null);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function boardHtml(board, duo, highlight = null) {
  const list = boardList(board, duo).slice(0, 10);
  if (!list.length) return `<p class="empty">Nog geen scores</p>`;
  return `<ol>${list
    .map((e) => `<li class="${highlight && e.id === highlight ? "me" : ""}"><span>${esc(e.name)}</span><b>${board === "tijd" ? fmtTime(e.value) : e.value}</b></li>`)
    .join("")}</ol>`;
}

function renderMenu() {
  document.querySelectorAll("#players button").forEach((b) => b.classList.toggle("on", (b.dataset.p === "2") === S.duo));
  document.querySelectorAll("#boardon button").forEach((b) => b.classList.toggle("on", (b.dataset.b === "1") === S.boardOn));
  document.querySelectorAll("#introon button").forEach((b) => b.classList.toggle("on", (b.dataset.u === "1") === S.introOn));
  document.querySelector(".boards").hidden = !S.boardOn;
  $("board-tijd").innerHTML = boardHtml("tijd", S.duo);
  $("board-score").innerHTML = boardHtml("score", S.duo);
  document.querySelectorAll(".boards .who").forEach((el) => (el.textContent = S.duo ? "duo" : "solo"));
  const n = store.get(LOG_KEY, []).length;
  $("log-count").textContent = n === 1 ? "1 ronde" : `${n} rondes`;
}

function showEnd() {
  const r = S.result;
  const board = S.boardOn ? S.mode.board : null;
  $("end-title").textContent = r.kind === "done" ? "Klaar!" : r.kind === "time" ? "Tijd!" : "Oei!";
  let big = "";
  if (S.mode.key === "tijd") big = fmtTime(S.runTime);
  if (S.mode.key === "score") big = `${S.cleared} ${S.cleared === 1 ? "obstakel" : "obstakels"}`;
  $("end-value").textContent = big;
  $("end-name").hidden = !board;
  $("end-board").hidden = !board;
  $("end-name-input").value = "";
  $("end-save").disabled = false;
  if (board) $("end-board").innerHTML = `<h3>${S.mode.name} · ${S.duo ? "duo" : "solo"}</h3>` + boardHtml(board, S.duo);
  showPanel("end");
  if (board) setTimeout(() => $("end-name-input").focus(), 50);
}

function saveName() {
  const name = $("end-name-input").value.trim().slice(0, 14);
  const board = S.boardOn ? S.mode.board : null;
  if (!name || !board) return;
  const value = S.mode.key === "tijd" ? Math.round(S.runTime * 10) / 10 : S.cleared;
  const entry = { id: String(Date.now()), name, value, date: new Date().toISOString().slice(0, 10) };
  const key = boardKey(board, S.duo);
  store.set(key, [...store.get(key, []), entry]);
  const log = store.get(LOG_KEY, []);
  if (log[S.result.logIndex]) {
    log[S.result.logIndex].naam = name;
    store.set(LOG_KEY, log);
  }
  $("end-board").innerHTML = `<h3>${S.mode.name} · ${S.duo ? "duo" : "solo"}</h3>` + boardHtml(board, S.duo, entry.id);
  $("end-save").disabled = true;
}

function downloadLog() {
  const log = store.get(LOG_KEY, []);
  if (!log.length) return alert("Er zijn nog geen rondes gespeeld.");
  const cols = Object.keys(log[0]);
  const csv = [cols.join(";"), ...log.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = `krabbels-testlog-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.mode)));
document.querySelectorAll("#players button").forEach((b) =>
  b.addEventListener("click", () => {
    S.duo = b.dataset.p === "2";
    tracker.reset();
    renderMenu();
  })
);
document.querySelectorAll("#boardon button").forEach((b) =>
  b.addEventListener("click", () => {
    S.boardOn = b.dataset.b === "1";
    store.set("krabbels-testdemo-boardon", S.boardOn);
    renderMenu();
  })
);
document.querySelectorAll("#introon button").forEach((b) =>
  b.addEventListener("click", () => {
    S.introOn = b.dataset.u === "1";
    store.set("krabbels-testdemo-intro", S.introOn);
    renderMenu();
  })
);
$("end-save").addEventListener("click", saveName);
$("end-name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveName();
  }
  e.stopPropagation();
});
$("end-again").addEventListener("click", () => startGame(S.mode.key));
$("end-menu").addEventListener("click", goMenu);
$("log-download").addEventListener("click", downloadLog);
$("clear-boards").addEventListener("click", () => {
  if (!confirm("Alle scoreborden wissen (solo en duo)?")) return;
  for (const b of ["tijd", "score"]) for (const d of [false, true]) store.set(boardKey(b, d), []);
  renderMenu();
});
$("clear-log").addEventListener("click", () => {
  if (!confirm("De testlog wissen? Download hem eerst als je hem nog nodig hebt.")) return;
  store.set(LOG_KEY, []);
  renderMenu();
});

const SIM_KEYS = {
  b: [0, "connect"], l: [0, "ladder"], k: [0, "duck"], j: [0, "jump"],
  n: [1, "connect"], o: [1, "ladder"], i: [1, "duck"], u: [1, "jump"],
};

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const key = e.key.toLowerCase();
  if (SIM_KEYS[key]) {
    const [i, what] = SIM_KEYS[key];
    if (what === "jump") {
      if (!e.repeat) sim[i].jumpAt = S.time;
    } else sim[i][what] = true;
    return;
  }
  if (key === "escape") {
    if (S.screen === "game" && S.phase !== "done") endRound("quit");
    else goMenu();
  } else if (key === "f") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  } else if (key === "d") S.debug = !S.debug;
  else if (key === "c") S.showCam = !S.showCam;
  else if (key === "p") downloadSvg(frameSvg(), `krabbels-${S.screen === "game" ? S.mode.key : "menu"}-${Date.now()}.svg`);
  else if (key === " " && S.screen === "game" && (S.phase === "ready" || S.phase === "intro")) {
    e.preventDefault();
    S.phase = S.phase === "ready" && S.introOn ? "intro" : "countdown";
    S.phaseT = 0;
  } else if (S.screen === "menu") {
    const modes = { 0: "kalibratie", 1: "tijd", 2: "score" };
    if (modes[key]) startGame(modes[key]);
    if (key === "s") $("players").querySelector(`[data-p="${S.duo ? 1 : 2}"]`).click();
  } else if (S.screen === "game" && S.phase === "done" && key === "enter") {
    startGame(S.mode.key);
  }
});
window.addEventListener("keyup", (e) => {
  const m = SIM_KEYS[e.key.toLowerCase()];
  if (m && m[1] !== "jump") sim[m[0]][m[1]] = false;
});

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
goMenu();
requestAnimationFrame(frame);
// ---------------------------------------------------------------------
// SVG export (P = current frame) and fixed scenes for Figma
// ---------------------------------------------------------------------
function frameSvg(width = W, height = H, setup = null) {
  const keep = { W, H };
  W = width;
  H = height;
  ctx = new SvgCtx(W, H);
  try {
    if (setup) setup();
    draw();
    return ctx.toString();
  } finally {
    ctx = screenCtx;
    W = keep.W;
    H = keep.H;
  }
}

function downloadSvg(svg, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// A made-up player, so the scenes show a silhouette without a camera.
function fakePlayer(i, cx, { pose = "stand", arms = "down", angle = 0 } = {}) {
  const F = CFG.figure * H, floor = CFG.silFloor * H;
  const up = pose === "jump" ? 0.09 * F : 0;
  const duck = pose === "duck" ? 0.22 * F : 0;
  const sh = 0.1 * F, hp = 0.065 * F;
  const b = {};
  b.lAn = { x: cx - 0.08 * F, y: floor - up };
  b.rAn = { x: cx + 0.08 * F, y: floor - up };
  const kx = pose === "duck" ? 0.13 * F : pose === "jump" ? 0.05 * F : 0.07 * F;
  const ky = pose === "duck" ? 0.18 * F : pose === "jump" ? 0.22 * F : 0.25 * F;
  b.lKn = { x: cx - kx, y: floor - up - ky };
  b.rKn = { x: cx + kx, y: floor - up - ky };
  b.lHip = { x: cx - hp, y: floor - up - 0.47 * F + duck };
  b.rHip = { x: cx + hp, y: floor - up - 0.47 * F + duck };
  b.lSh = { x: cx - sh, y: floor - up - 0.77 * F + duck };
  b.rSh = { x: cx + sh, y: floor - up - 0.77 * F + duck };
  b.nose = { x: cx, y: floor - up - 0.9 * F + duck };
  const my = b.lSh.y;
  if (arms === "side") {
    const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a), L = sh + 0.36 * F;
    b.lWr = { x: cx - dx * L, y: my - dy * L };
    b.rWr = { x: cx + dx * L, y: my + dy * L };
    b.lEl = { x: cx - dx * (sh + 0.18 * F), y: my - dy * (sh + 0.18 * F) };
    b.rEl = { x: cx + dx * (sh + 0.18 * F), y: my + dy * (sh + 0.18 * F) };
  } else if (arms === "up") {
    b.lEl = { x: cx - sh - 0.03 * F, y: my - 0.18 * F };
    b.rEl = { x: cx + sh + 0.03 * F, y: my - 0.18 * F };
    b.lWr = { x: cx - sh - 0.04 * F, y: my - 0.36 * F };
    b.rWr = { x: cx + sh + 0.04 * F, y: my - 0.36 * F };
  } else {
    b.lEl = { x: cx - sh - 0.03 * F, y: my + 0.15 * F };
    b.rEl = { x: cx + sh + 0.03 * F, y: my + 0.15 * F };
    b.lWr = { x: cx - sh - 0.02 * F, y: my + 0.3 * F };
    b.rWr = { x: cx + sh + 0.02 * F, y: my + 0.3 * F };
  }
  Object.assign(tracker.players[i], {
    present: true,
    body: b,
    cx,
    arms: arms === "side" ? angle : null,
    ladder: arms === "up",
    ducking: pose === "duck",
    jumping: pose === "jump",
    jumpAt: pose === "jump" ? S.time : -1e9,
    lift: pose === "jump" ? 0.31 : 0.02,
    drop: pose === "duck" ? 0.62 : -0.02,
  });
}

function stage(modeKey, duo, pages) {
  S.mode = MODES[modeKey];
  S.screen = "game";
  S.duo = duo;
  S.phase = "play";
  S.phaseT = 0;
  S.runTime = 0;
  S.cleared = 0;
  S.effects = [];
  S.camX = 0;
  S.slideT = 1;
  S.speed = S.mode.speed || 0;
  let lv = 0;
  S.pages = (pages || []).map((sp, i) => {
    const pg = makePage(i, sp, lv, duo);
    lv = pg.end;
    return pg;
  });
  S.k = { x: 0.06, y: 0, vy: 0, state: "walk", anim: 0.3, jump: null, look: 0 };
  tracker.reset();
  sim.forEach((x) => Object.assign(x, { connect: false, ladder: false, duck: false, jumpAt: -1e9 }));
  return S.pages[0] ? S.pages[0].obs : [];
}
const placeK = (x, state = "walk", y = null) => Object.assign(S.k, { x, state, y: y ?? surfaceAt(x) ?? 0 });

const SCENES = {
  "01-aftellen": () => {
    stage("tijd", false, [[{ t: "connect", dh: 0 }, { t: "jump" }]]);
    S.phase = "countdown";
    S.phaseT = 1.2;
    fakePlayer(0, 0.5 * W);
  },
  "02-brug-wachten": () => {
    const [o] = stage("tijd", false, [[{ t: "connect", dh: 0 }, { t: "ladder" }]]);
    placeK(o.stop, "wait");
    S.runTime = 4.3;
    fakePlayer(0, 0.12 * W, { arms: "side", angle: 28 });
  },
  "03-brug-gemaakt": () => {
    const [o] = stage("tijd", false, [[{ t: "connect", dh: 0 }, { t: "ladder" }]]);
    o.solved = o.cleared = true;
    placeK(o.x0 + 0.06);
    S.runTime = 6.1;
    S.cleared = 1;
    fakePlayer(0, obsScreenX(o), { arms: "side", angle: 0 });
  },
  "04-helling": () => {
    const [o] = stage("tijd", false, [[{ t: "connect", dh: 0.14 }, { t: "duck" }]]);
    placeK(o.stop, "wait");
    o.match = S.mode.hold * 0.6;
    S.runTime = 9.4;
    fakePlayer(0, obsScreenX(o), { arms: "side", angle: connectAngle(o) });
  },
  "05-ladder": () => {
    const [o] = stage("tijd", false, [[{ t: "ladder" }, { t: "jump" }]]);
    o.solved = o.cleared = true;
    placeK(o.stop, "climb", o.base + 0.13);
    S.runTime = 14.8;
    S.cleared = 2;
    fakePlayer(0, obsScreenX(o), { arms: "up" });
  },
  "06-springen": () => {
    const [o] = stage("tijd", false, [[{ t: "jump" }, { t: "connect", dh: -0.12 }]]);
    o.cleared = true;
    placeK(o.xc, "jump", o.base + 0.11);
    S.runTime = 21.5;
    S.cleared = 3;
    fakePlayer(0, 0.45 * W, { pose: "jump", arms: "down" });
  },
  "07-bukken": () => {
    const [o] = stage("tijd", false, [[{ t: "duck" }, { t: "connect", dh: 0.12 }]]);
    o.cleared = true;
    placeK(o.xc, "duck");
    S.runTime = 27.2;
    S.cleared = 4;
    fakePlayer(0, 0.45 * W, { pose: "duck" });
  },
  "08-duo-samen": () => {
    const [o] = stage("tijd", true, [[{ t: "connect", dh: 0, owner: 3 }, { t: "jump", owner: 2 }]]);
    placeK(o.stop, "wait");
    o.match = S.mode.hold * 0.4;
    S.runTime = 12.6;
    fakePlayer(0, obsScreenX(o) - 0.07 * W, { arms: "side", angle: 0 });
    fakePlayer(1, obsScreenX(o) + 0.09 * W, { arms: "side", angle: 0 });
  },
  "09-duo-om-de-beurt": () => {
    const obs = stage("tijd", true, [[{ t: "connect", dh: 0.12, owner: 1 }, { t: "ladder", owner: 2 }]]);
    obs[0].solved = obs[0].cleared = true;
    placeK(obs[0].x1 + 0.04);
    S.runTime = 18.0;
    S.cleared = 3;
    fakePlayer(0, 0.24 * W, { arms: "down" });
    fakePlayer(1, 0.62 * W, { arms: "up" });
  },
  "10-run-score": () => {
    const [o] = stage("score", false, [[{ t: "jump" }, { t: "connect", dh: 0.18 }, { t: "duck" }]]);
    S.speed = 0.24;
    S.cleared = 14;
    S.runTime = 48;
    placeK(o.stop - 0.05);
    fakePlayer(0, 0.4 * W, { pose: "jump" });
  },
  "11-kalibratie": () => {
    stage("kalibratie", false, []);
    fakePlayer(0, 0.5 * W, { arms: "side", angle: 20 });
  },
};

// Renders every scene to SVG at 1920 x 1080: { name: svg }.
function sceneSvgs(width = 1920, height = 1080) {
  const keepScreen = S.screen;
  const out = {};
  for (const [name, setup] of Object.entries(SCENES)) out[name] = frameSvg(width, height, setup);
  tracker.reset();
  if (keepScreen === "menu") goMenu();
  return out;
}

// For testing in the console: krabbels.step(seconds) runs the game without waiting for frames.
window.krabbels = {
  S,
  sim,
  sceneSvgs,
  frameSvg,
  step(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) {
      S.time += dt * 1000;
      if (S.screen === "game") update(dt);
    }
    draw();
  },
};
if (location.protocol === "file:") {
  say("file", "<strong>Open deze pagina via een server.</strong><br>Lokaal: VS Code → Open with Live Server. Online: GitHub Pages.", true);
} else {
  initCamera(video, say);
  initPose(say).then((lm) => (landmarker = lm));
}
