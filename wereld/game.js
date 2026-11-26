// Krabbels · de wereld (2D en 3D)
// De wereld = het Figma-frame "final_foreground": 9 schermen van 1920 px (start, tutorial, level 1-5),
// elk met zijn eigen achtergrond. Platformen en tekeningen komen uit wereld.json (maak_wereld.py).
// Besturing: pijltjes, spatie = springen, ↑↓ = ladder.
import { lijnen, anker, tekenGids, tekenAnker } from "./wereld.js";

const $ = (id) => document.getElementById(id);
const c2d = $("c2d"), ctx = c2d.getContext("2d");
const c3d = $("c3d");
const melding = $("melding");

// ---------------------------------------------------------------- instellingen
const C = {
  speed: 520,        // px/s
  accel: 5200,
  jumpV: 1320,       // genoeg om de klifjes van ~240 px te halen
  gravity: 3200,
  cutJump: 0.72,     // los de knop eerder -> iets lagere sprong (kindvriendelijk: haalt bijna altijd het gat)
  coyote: 0.09,
  buffer: 0.11,
  step: 40,          // verschil dat je zonder springen mag oplopen
  klim: 330,         // px/s op een ladder
  halfW: 26,
  minX: 90,          // onzichtbare muur links, zodat je niet voorbij het begin van de wereld loopt
  fallDeath: 1250,
  respawnBack: 150,
};

// ---------------------------------------------------------------- laden
const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("kon " + src + " niet laden")); i.src = src;
});
const json = async (pad) => (await fetch(pad)).json();
const reeks = (map, naam, n) => Promise.all(Array.from({ length: n }, (_, i) => loadImg(`${map}/${naam}_${i}.png`)));

const wereld = await json("wereld.json");
const W = wereld.breedte, RAND = wereld.rand, SCHERM = wereld.scherm;
const gevraagd = Math.max(0, Math.min(wereld.levels.length, parseInt(new URLSearchParams(location.search).get("level")) || 0));

// start en tutorial (platte stukken uit final_foreground) en de voorgrond van de levels (grond, gras, water,
// ravijnen, potloden, deur)
const level1 = await json("level1.json");
const [achtergronden, blok, logo, rand, achter, grond] = await Promise.all([
  Promise.all(Array.from({ length: wereld.schermen }, (_, i) => loadImg(`assets/achtergrond/scherm_${i}.jpg`))),
  reeks("assets/F", "blok", 4), reeks("assets/F", "logo", 3), loadImg("assets/F/rand.png"),
  reeks("assets/L1", "achter", level1.tegels), reeks("assets/L1", "grond", level1.tegels),
]);
const PLATEN = { achtergronden, logo, rand, logoPlek: { x: 320, y: 200 }, randPlek: { x: RAND - 60, y: 0 } };
document.title = "Krabbels · de wereld";

// ---------------------------------------------------------------- waar je kan staan
const VLAKKEN = [
  ...wereld.vlakken.map((v) => ({ x0: v.x0, x1: v.x1, achterTot: v.achterTot, blok: true, y: () => v.y })),
  ...wereld.bruggen.map((b) => {
    const p = lijnen.boog(b.x, b.y);
    return { x0: b.x, x1: b.x + 300, y: (x) => {
      const i = Math.max(1, p.findIndex((q) => q[0] >= x)), [x0, y0] = p[i - 1], [x1, y1] = p[i];
      return y0 + (y1 - y0) * Math.max(0, Math.min(1, (x - x0) / ((x1 - x0) || 1)));
    } };
  }),
  ...wereld.hellingen.map(([ax, ay, bx, by]) => ({ x0: ax, x1: bx, y: (x) => ay + (by - ay) * ((x - ax) / (bx - ax)) })),
];
const LADDERS = wereld.ladders;
// hoogste loopvlak op x dat niet boven "vanaf" ligt (je landt er enkel van bovenaf)
const vlakOp = (x, vanaf) => {
  let best = -1;
  for (const v of VLAKKEN) {
    if (x < v.x0 || x > v.x1) continue;
    const y = v.y(x);
    if (y >= vanaf && (best === -1 || y < best)) best = y;
  }
  return best;
};
// beste grond rond x (laat je op de rand nog staan)
const groundAt = (x, vanaf = -Infinity) => {
  let best = -1;
  for (const dx of [-14, 0, 14]) {
    const t = vlakOp(x + dx, vanaf);
    if (t !== -1 && (best === -1 || t < best)) best = t;
  }
  return best;
};
// staat er op x een muur voor iemand met de voeten op hoogte y?
const muur = (x, y) => VLAKKEN.some((v) => v.blok && x >= v.x0 && x <= v.x1 && v.y(x) < y - C.step && !(x < v.achterTot));

// ---------------------------------------------------------------- Krabbel (placeholder)
// Voorlopig een simpele krijt-Krabbel; de echte komt van het kind.
const GRAFIET = "#34344A", PAPIER = "#FFFDF6";
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SP_W = 190, SP_H = 200, FEET_X = 95, FEET_Y = 180;
const spriteCache = new Map();
function krabbelSprite(variant, leg) {
  const key = variant + ":" + leg;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const cv = document.createElement("canvas"); cv.width = SP_W; cv.height = SP_H;
  const g = cv.getContext("2d");
  const r = mulberry(11 + variant * 977);
  const j = (a) => (r() - 0.5) * 2 * a;
  // lichaam
  const cx = FEET_X, cy = 100, rx = 50, ry = 46, N = 30;
  const body = [];
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2;
    body.push([cx + Math.cos(a) * (rx + j(2.6)), cy + Math.sin(a) * (ry + j(2.6))]);
  }
  // benen (leg: 0 stil, 1..4 loop, 5 sprong)
  const legsSets = {
    0: [[-18, 0, -22, 40], [18, 0, 22, 40]],
    1: [[-18, 0, -40, 34], [18, 0, 30, 40]],
    2: [[-18, 0, -26, 40], [18, 0, 16, 40]],
    3: [[-18, 0, -14, 40], [18, 0, 42, 32]],
    4: [[-18, 0, -22, 40], [18, 0, 26, 40]],
    5: [[-18, 0, -38, 28], [18, 0, 38, 28]],
  };
  const legs = legsSets[leg].map(([x0, y0, x1, y1]) => [[cx + x0, cy + ry - 4 + y0], [cx + x1, cy + ry - 4 + y1]]);
  const arms = leg === 5
    ? [[[cx - rx + 4, cy - 4], [cx - rx - 30, cy - 44]], [[cx + rx - 4, cy - 4], [cx + rx + 30, cy - 44]]]
    : [[[cx - rx + 4, cy + 6], [cx - rx - 22, cy + 30]], [[cx + rx - 4, cy + 6], [cx + rx + 22, cy + 30]]];
  const stroke = (pts, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + j(0.8), p[1] + j(0.8)) : g.moveTo(p[0], p[1]))); g.stroke();
  };
  // papierrand
  g.fillStyle = PAPIER;
  g.beginPath(); body.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.fill();
  stroke(body, 24, PAPIER);
  [...legs, ...arms].forEach((l) => stroke(l, 20, PAPIER));
  // krijtlijnen (twee lichte passes = korrel)
  g.globalAlpha = 0.92;
  for (let pass = 0; pass < 2; pass++) {
    stroke(body, 6.5 - pass * 2, GRAFIET);
    [...legs, ...arms].forEach((l) => stroke(l, 6 - pass * 2, GRAFIET));
  }
  g.globalAlpha = 1;
  // ogen als stickers
  const eye = (x, y) => {
    g.fillStyle = PAPIER; g.strokeStyle = GRAFIET; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.stroke();
    g.fillStyle = GRAFIET; g.beginPath(); g.arc(x + 3, y + 1, 6, 0, 7); g.fill();
  };
  eye(cx - 17, cy - 12); eye(cx + 19, cy - 12);
  // mond
  g.strokeStyle = GRAFIET; g.lineWidth = 4; g.lineCap = "round";
  g.beginPath(); g.arc(cx + 1, cy + 12, 11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  spriteCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------- spelstaat
const spawnX = gevraagd ? wereld.levels[gevraagd - 1].x + 150 : 150;
const S = {
  x: spawnX, y: 0, vx: 0, vy: 0, onGround: false, face: 1,
  t: 0, coyote: 0, buffer: 0, jumpHeld: false, anim: 0,
  safeX: spawnX, safeY: null, won: false, flash: 0, ladder: null,
  diepte: 0, // 3D: hoe ver de Krabbel naar voren staat (0 = midden van het platform)
  cam: { x: Math.max(0, spawnX - 730), z: 1 }, mode: "2d", overview: false,
};
S.y = groundAt(S.x) - 300;
const keys = {};
const fit = c2d.width / W;

function respawn() {
  let x = Math.max(150, S.safeX - C.respawnBack);
  while (groundAt(x) === -1 && x > 0) x -= 20;
  const vanaf = S.safeY === null ? -Infinity : S.safeY - 130; // niet op een hoger blok terechtkomen
  const grond = groundAt(x, vanaf) === -1 ? groundAt(x) : groundAt(x, vanaf);
  S.x = x; S.y = grond - 260; S.vx = 0; S.vy = 0; S.ladder = null; S.flash = 0.45;
}
function restart() {
  S.safeX = spawnX; S.safeY = null; S.ladder = null; S.won = false; melding.hidden = true;
  S.x = spawnX; S.y = groundAt(S.x) - 300; S.vx = 0; S.vy = 0; S.flash = 0.3;
}

function update(dt) {
  S.t += dt;
  if (S.flash > 0) S.flash -= dt;
  if (S.overview || S.won) { S.vx *= 0.8; }
  const vrij = !S.overview && !S.won;
  const dirx = vrij ? (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) : 0;
  if (dirx) S.face = dirx;
  // horizontaal
  const target = dirx * C.speed;
  const a = C.accel * dt;
  S.vx += Math.max(-a, Math.min(a, target - S.vx));
  let nx = S.x + S.vx * dt;
  nx = Math.max(C.minX, Math.min(W - C.halfW, nx));
  if (S.vx !== 0 && muur(nx + Math.sign(S.vx) * C.halfW, S.y)) { nx = S.x; S.vx = 0; }
  S.x = nx;
  // ladder: pijl omhoog onderaan, pijl omlaag bovenaan
  const op = vrij && !!keys.ArrowUp, neer = vrij && !!(keys.ArrowDown || keys.KeyS);
  const bij = LADDERS.find((l) => Math.abs(S.x - l.x) < 70);
  if (!S.ladder && bij && ((op && S.y > bij.boven + 20 && S.y <= bij.onder + 4) || (neer && S.onGround && Math.abs(S.y - bij.boven) < 4))) S.ladder = bij;
  if (S.ladder) {
    const l = S.ladder, richting = (neer ? 1 : 0) - (op ? 1 : 0);
    if (Math.abs(S.x - l.x) > 70 || (vrij && keys.Space)) S.ladder = null;   // eraf lopen of springen
    else {
      S.x += (l.x - S.x) * Math.min(1, dt * (dirx ? 0 : 12));
      S.y += richting * C.klim * dt; S.vy = 0; S.onGround = false;
      if (richting) S.anim += dt * 9;
      if (S.y <= l.boven) { S.y = l.boven; S.ladder = null; S.onGround = true; }
      else if (S.y >= l.onder) { S.y = l.onder; S.ladder = null; S.onGround = true; }
      S.jumpHeld = op; S.buffer = 0;
      einde(dt);
      return;
    }
  }
  // springen (bij een ladder klimt de pijl omhoog; spatie springt altijd)
  const jumpDown = vrij && !!(keys.Space || (keys.ArrowUp && !(bij && S.y > bij.boven + 20)));
  if (jumpDown && !S.jumpHeld) S.buffer = C.buffer;
  if (!jumpDown && S.jumpHeld && S.vy < 0) S.vy *= C.cutJump;
  S.jumpHeld = jumpDown;
  S.buffer -= dt;
  S.coyote = S.onGround ? C.coyote : S.coyote - dt;
  if (S.buffer > 0 && S.coyote > 0) { S.vy = -C.jumpV; S.onGround = false; S.coyote = 0; S.buffer = 0; }
  // verticaal
  const prevY = S.y;
  S.vy += C.gravity * dt;
  S.y += S.vy * dt;
  const g = groundAt(S.x, prevY - 26);
  if (g !== -1 && S.vy >= 0 && S.y >= g && prevY <= g + 26) { S.y = g; S.vy = 0; S.onGround = true; }
  else if (g !== -1 && S.onGround && S.vy >= 0 && Math.abs(S.y - g) < 30) { S.y = g; S.vy = 0; } // bergop en bergaf blijven plakken
  else S.onGround = false;
  if (S.onGround && groundAt(S.x - 90, S.y - 130) !== -1 && groundAt(S.x + 90, S.y - 130) !== -1) { S.safeX = S.x; S.safeY = S.y; }
  if (S.y > C.fallDeath) respawn();
  // lopen-animatie
  if (S.onGround && Math.abs(S.vx) > 30) S.anim += dt * 9 * (Math.abs(S.vx) / C.speed + 0.3); else if (S.onGround) S.anim = 0;
  einde(dt);
}

// na elke stap: diepte, deur, voortgangsbalk
const LADDER_DIEPTE = 72;
const eind = (wereld.deur.x0 + wereld.deur.x1) / 2 - 40;
function einde(dt) {
  // de Krabbel loopt in het midden van de platformen; aan de voet van een ladder komt die naar voren,
  // want in het midden staat daar het hoge blok
  const bijBlok = wereld.vlakken.some((v) => v.achterTot && S.x > v.x0 - 130 && S.x < v.achterTot + 10 && S.y > v.y + 6);
  S.diepte += ((bijBlok ? LADDER_DIEPTE : 0) - S.diepte) * Math.min(1, dt * 7);
  if (!S.won && S.onGround && S.x >= eind) {
    S.won = true;
    melding.innerHTML = "Door de deur!<small>De Krabbel is aan het einde van de wereld · R = opnieuw · 0 = naar het begin</small>";
    melding.hidden = false;
  }
  $("vbalk").style.width = Math.min(100, (S.x / eind) * 100) + "%";
}

function legFrame() {
  if (S.ladder) return Math.floor(S.anim) % 2 ? 5 : 0;
  if (!S.onGround) return 5;
  if (Math.abs(S.vx) < 30) return 0;
  return 1 + (Math.floor(S.anim) % 4);
}
const wiggle = () => [0, 1, 2, 1][Math.floor(Math.max(0, S.t) * 10) % 4]; // de eerste dt kan negatief zijn

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const zT = S.overview ? fit : 1;
  S.cam.z += (zT - S.cam.z) * Math.min(1, dt * 7);
  const viewW = c2d.width / S.cam.z;
  let t = Math.max(0, Math.min(W - viewW, S.x - viewW * 0.38));
  if (S.overview) t = (W - viewW) / 2;
  S.cam.x += (t - S.cam.x) * Math.min(1, dt * 6);
}

// ---------------------------------------------------------------- 2D tekenen
// ankers, stippellijnen en tekeningen: elk stuk een keer vooraf tekenen
const GIDSEN = [
  ...lijnen(wereld).map((punten, i) => tekenGids(punten, 11 + i * 97)),
  ...wereld.ankers.map(([x, y]) => tekenAnker(...anker(wereld, x, y), x < RAND)),
];

function draw2D() {
  const z = S.cam.z, cx = S.cam.x, cy = 540 - 540 / z;
  const viewW = c2d.width / z, viewH = c2d.height / z;
  const inBeeld = (x, w) => x < cx + viewW && x + w > cx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c2d.width, c2d.height);
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  // elk scherm van 1920 px heeft zijn eigen achtergrond
  PLATEN.achtergronden.forEach((img, i) => { if (inBeeld(i * SCHERM, SCHERM)) ctx.drawImage(img, i * SCHERM, 0, SCHERM + 1, 1080); });
  // voorgrond
  blok.forEach((t, i) => { if (inBeeld(i * SCHERM, SCHERM)) ctx.drawImage(t, i * SCHERM, 0); });
  if (inBeeld(0, SCHERM)) ctx.drawImage(PLATEN.logo[wiggle()], PLATEN.logoPlek.x, PLATEN.logoPlek.y); // zelfde wiggle als de Krabbel
  for (const soort of [achter, grond]) {
    soort.forEach((t, i) => { const x = wereld.start + i * level1.tegelBreedte; if (inBeeld(x, level1.tegelBreedte)) ctx.drawImage(t, x, 0); });
  }
  for (const s of GIDSEN) if (inBeeld(s.x, s.beeld.width)) ctx.drawImage(s.beeld, s.x, s.y);
  // laagvolgorde: wereld < tekeningen/ankers < papierrand < Krabbel
  ctx.drawImage(PLATEN.rand, PLATEN.randPlek.x, PLATEN.randPlek.y);
  const spr = krabbelSprite(wiggle(), legFrame());
  const sc = S.overview ? Math.max(1, 0.55 / z) : 1;
  ctx.save();
  ctx.translate(S.x, S.y);
  ctx.scale(S.face * sc, sc);
  if (S.flash > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.t * 50);
  ctx.drawImage(spr, -FEET_X, -FEET_Y);
  ctx.restore();
}

// ---------------------------------------------------------------- 3D (lui geladen)
let r3d = null, loading3d = false;
async function ensure3D() {
  if (r3d || loading3d) return r3d;
  loading3d = true;
  melding.innerHTML = "3D laden…<small>Dit kan de eerste keer even duren</small>"; melding.hidden = false;
  try {
    const mod = await import("./game3d.js");
    r3d = await mod.create({ canvas: c3d, wereld, platen: PLATEN, spriteSize: [SP_W, SP_H, FEET_X, FEET_Y] });
    r3d.setOverview(S.overview);
  } catch (e) {
    console.error(e);
    melding.innerHTML = "3D kon niet laden<small>Heb je internet? Three.js komt van een CDN. (" + e.message + ")</small>"; melding.hidden = false;
    setTimeout(() => { if (!S.won) melding.hidden = true; }, 5000);
    setMode("2d");
  }
  loading3d = false;
  if (r3d && !S.won) melding.hidden = true;
  return r3d;
}

function setMode(m) {
  S.mode = m;
  c2d.style.display = m === "2d" ? "block" : "none";
  c3d.style.display = m === "3d" ? "block" : "none";
  $("b2d").classList.toggle("aan", m === "2d");
  $("b3d").classList.toggle("aan", m === "3d");
  if (m === "3d") ensure3D();
}
function setOverview(v) {
  S.overview = v; $("bwereld").classList.toggle("aan", v);
  if (r3d) r3d.setOverview(v);
}
const naarLevel = (n) => { location.search = "?level=" + n + (S.mode === "3d" ? "&3d" : ""); };

$("b2d").onclick = () => setMode("2d");
$("b3d").onclick = () => setMode("3d");
$("bwereld").onclick = () => setOverview(!S.overview);
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === "KeyV") setMode(S.mode === "2d" ? "3d" : "2d");
  if (e.code === "KeyW") setOverview(!S.overview);
  if (e.code === "KeyR") restart();
  if (/^Digit[0-9]$/.test(e.code) && +e.code.slice(5) <= wereld.levels.length) naarLevel(+e.code.slice(5));
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------- hoofdlus
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt);
  updateCamera(dt);
  if (S.mode === "2d") draw2D();
  else if (r3d) r3d.render(S, krabbelSprite(wiggle(), legFrame()), wiggle());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has("3d")) setMode("3d");
window.__krabbels = { S, wereld, setMode, setOverview, restart, get r3d() { return r3d; } };
