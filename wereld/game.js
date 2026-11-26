// Krabbels · wereld (2D en 3D) — Level 1
// Lagen komen rechtstreeks uit Figma (pagina "FINAL FINAL FINAL", level_1_final).
// Besturing: pijltjes. Brug/helling/ladder zitten er nog niet in.

const $ = (id) => document.getElementById(id);
const c2d = $("c2d"), ctx = c2d.getContext("2d");
const c3d = $("c3d");
const melding = $("melding");

// ---------------------------------------------------------------- instellingen
const C = {
  speed: 520,        // px/s
  accel: 5200,
  jumpV: 1320,       // genoeg om de klifjes van ~213 px te halen
  gravity: 3200,
  cutJump: 0.72,     // los de knop eerder -> iets lagere sprong (kindvriendelijk: haalt bijna altijd het gat)
  coyote: 0.09,
  buffer: 0.11,
  step: 40,          // verschil dat je zonder springen mag oplopen
  hoogte: 126,       // van voeten tot kruin van de Krabbel
  halfW: 26,
  minX: 90,          // onzichtbare muur links, zodat je niet voorbij het begin van de wereld loopt
  fallDeath: 1250,
  respawnBack: 150,
};

// ---------------------------------------------------------------- laden
const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("kon " + src + " niet laden")); i.src = src;
});

const AANTAL_LEVELS = 5;
const LVL = Math.max(0, Math.min(AANTAL_LEVELS, parseInt(new URLSearchParams(location.search).get("level")) || 0)); // 0 = tutorial
const level = await (await fetch(`level${LVL}.json`)).json();
const dir = `assets/L${LVL}/`;
document.title = `Krabbels · ${level.naam}`;
const IMG = {
  backdrop: await loadImg(dir + level.backdrop.bestand),
  bg: await Promise.all(level.bg.map((b) => loadImg(dir + b.bestand))),
  achter: await Promise.all(Array.from({ length: level.tegels }, (_, i) => loadImg(`${dir}achter_${i}.png`))),
  grond: await Promise.all(Array.from({ length: level.tegels }, (_, i) => loadImg(`${dir}grond_${i}.png`))),
};

const W = level.breedte;
const topAt = (x) => {
  const i = Math.max(0, Math.min(level.top.length - 1, Math.round(x / level.stap)));
  return level.top[i];
};
// beste grond rond x (laat je op de rand nog staan)
const groundAt = (x) => {
  let best = -1;
  for (const dx of [-14, 0, 14]) {
    const t = topAt(x + dx);
    if (t !== -1 && (best === -1 || t < best)) best = t;
  }
  return best;
};

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
const S = {
  x: level.spawn.x, y: 0, vx: 0, vy: 0, onGround: false, face: 1,
  t: 0, coyote: 0, buffer: 0, jumpHeld: false, anim: 0,
  safeX: level.spawn.x, won: false, flash: 0,
  cam: { x: 0, z: 1 }, mode: "2d", overview: false,
};
S.y = (groundAt(S.x) || 750) - 300;
const keys = {};
const fit = c2d.width / W;

function respawn() {
  let x = Math.max(level.spawn.x, S.safeX - C.respawnBack);
  while (groundAt(x) === -1 && x > 0) x -= 20;
  S.x = x; S.y = groundAt(x) - 260; S.vx = 0; S.vy = 0; S.flash = 0.45;
}
function restart() {
  S.safeX = level.spawn.x; S.won = false; melding.hidden = true;
  S.x = level.spawn.x; S.y = groundAt(S.x) - 300; S.vx = 0; S.vy = 0; S.flash = 0.3;
}

function update(dt) {
  S.t += dt;
  if (S.flash > 0) S.flash -= dt;
  if (S.overview || S.won) { S.vx *= 0.8; }
  const dirx = S.overview || S.won ? 0 : (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (dirx) S.face = dirx;
  // horizontaal
  const target = dirx * C.speed;
  const a = C.accel * dt;
  S.vx += Math.max(-a, Math.min(a, target - S.vx));
  let nx = S.x + S.vx * dt;
  nx = Math.max(C.minX, Math.min(W - C.halfW, nx));
  const ex = nx + Math.sign(S.vx) * C.halfW;
  const wall = topAt(ex);
  if (S.vx !== 0 && wall !== -1 && wall < S.y - C.step) { nx = S.x; S.vx = 0; }
  // hangende blokken (tutorial): daar kan je onderdoor, maar niet doorheen springen
  for (const p of level.plafond || []) {
    const erin = (x) => x + C.halfW > p.x0 && x - C.halfW < p.x1;
    if (erin(nx) && !erin(S.x) && S.y - C.hoogte < p.y - 1) { nx = S.x; S.vx = 0; }
  }
  S.x = nx;
  // springen
  const jumpDown = !S.overview && !S.won && (keys.ArrowUp || keys.Space || keys.KeyW_ || false);
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
  for (const p of level.plafond || []) {
    if (S.vy < 0 && S.x + C.halfW > p.x0 && S.x - C.halfW < p.x1 && S.y - C.hoogte < p.y) { S.y = p.y + C.hoogte; S.vy = 0; }
  }
  const g = groundAt(S.x);
  if (g !== -1 && S.vy >= 0 && S.y >= g && prevY <= g + 26) { S.y = g; S.vy = 0; S.onGround = true; }
  else if (g !== -1 && S.onGround && Math.abs(S.y - g) < 16) { S.y = g; S.vy = 0; }
  else S.onGround = false;
  if (S.onGround && groundAt(S.x - 90) !== -1 && groundAt(S.x + 90) !== -1) S.safeX = S.x;
  if (S.y > C.fallDeath) respawn();
  // lopen-animatie
  if (S.onGround && Math.abs(S.vx) > 30) S.anim += dt * 9 * (Math.abs(S.vx) / C.speed + 0.3); else if (S.onGround) S.anim = 0;
  // einde
  const eind = level.deur ? (level.deur.x0 + level.deur.x1) / 2 - 40 : W - 260;
  if (!S.won && S.onGround && S.x >= eind) {
    S.won = true;
    const volgende = LVL < AANTAL_LEVELS;
    melding.innerHTML = `${LVL ? `Level ${LVL}` : "Tutorial"} klaar!<small>${volgende ? `Druk op Enter voor level ${LVL + 1}` : "Dat was het laatste level"} · R = opnieuw</small>`;
    melding.hidden = false;
  }
  $("vbalk").style.width = Math.min(100, (S.x / (eind + 40)) * 100) + "%";
}

function legFrame() {
  if (!S.onGround) return 5;
  if (Math.abs(S.vx) < 30) return 0;
  return 1 + (Math.floor(S.anim) % 4);
}
const variantNow = () => Math.floor(S.t * 10) % 4 === 3 ? 1 : Math.floor(S.t * 10) % 4; // 0,1,2,1
const wiggleVariant = () => [0, 1, 2, 1][Math.floor(S.t * 10) % 4];

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const zT = S.overview ? fit : 1;
  S.cam.z += (zT - S.cam.z) * Math.min(1, dt * 7);
  const viewW = c2d.width / S.cam.z;
  // min 30 = exact het beeld van je ontwerp (de wereld begint aan frame-x 0); zo zie je de afgesneden rand niet
  let t = W <= viewW ? (W - viewW) / 2 : Math.max(level.camMin, Math.min(W - viewW, S.x - viewW * 0.38));
  if (S.overview) t = (W - viewW) / 2;
  S.cam.x += (t - S.cam.x) * Math.min(1, dt * 6);
}

// ---------------------------------------------------------------- 2D tekenen
// Laag die op het venster van je Figma-frame (wereld-x = frameOffset) exact uitgelijnd staat en daarna trager meeschuift.
function layer(img, b, cx, viewW) {
  const r = b.snelheid, w = b.breedte, fo = level.frameOffset;
  const L = b.x0 + fo + (1 - r) * (cx - fo);
  const k0 = Math.floor((cx - L) / w), k1 = Math.ceil((cx + viewW - L) / w);
  for (let k = k0; k <= k1; k++) {
    const x = L + k * w;
    if (k & 1) { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, 1080); ctx.restore(); }
    else ctx.drawImage(img, x, 0, w, 1080);
  }
}

function draw2D() {
  const z = S.cam.z, cx = S.cam.x, cy = 540 - 540 / z;
  const viewW = c2d.width / z, viewH = c2d.height / z;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1b1b22"; ctx.fillRect(0, 0, c2d.width, c2d.height);
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  // backdrop: staat stil (of drijft heel traag) en wordt spiegelend herhaald
  const bd = level.backdrop;
  if (bd.snelheid === 0) ctx.drawImage(IMG.backdrop, cx, cy, viewW, viewH);
  else layer(IMG.backdrop, bd, cx, viewW);
  // parallax-lagen: spiegelend herhaald
  level.bg.forEach((b, i) => layer(IMG.bg[i], b, cx, viewW));
  const T = level.tegelBreedte;
  for (let i = 0; i < level.tegels; i++) if (i * T < cx + viewW && (i + 1) * T > cx) ctx.drawImage(IMG.achter[i], i * T, 0);
  for (let i = 0; i < level.tegels; i++) if (i * T < cx + viewW && (i + 1) * T > cx) ctx.drawImage(IMG.grond[i], i * T, 0);
  // Krabbel
  const spr = krabbelSprite(wiggleVariant(), legFrame());
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
    r3d = await mod.create({ canvas: c3d, IMG, level, nummer: LVL, W, spriteSize: [SP_W, SP_H, FEET_X, FEET_Y] });
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
  if (e.code === "Enter" && S.won && LVL < AANTAL_LEVELS) naarLevel(LVL + 1);
  if (/^Digit[0-9]$/.test(e.code) && +e.code.slice(5) <= AANTAL_LEVELS) naarLevel(+e.code.slice(5));
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
  else if (r3d) r3d.render(S, dt, krabbelSprite(wiggleVariant(), legFrame()));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const naarLevel = (n) => { location.search = "?level=" + n + (S.mode === "3d" ? "&3d" : ""); };
if (new URLSearchParams(location.search).has("3d")) setMode("3d");
window.__krabbels = { S, level, setMode, setOverview, restart, get r3d() { return r3d; } };
