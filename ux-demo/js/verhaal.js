// =====================================================================
// UX-demo 2: speler. Tekent de kamer (muur, iPads, monitor, ledstrips)
// en speelt de scènes uit verhaal-scenes.js af als een film.
// Spatie = afspelen/pauze · ← → = vorige/volgende scène · 1–8 = hoofdstuk · D = solo/duo · H = bediening verbergen
// =====================================================================
import { SCENES, WALL, IPADS, MON, STRIPS, KID_X, C } from "./verhaal-scenes.js?v=20261117g";
import { gebaar } from "./rig.js?v=20261117g";
import { rr, text, clamp } from "./kit.js?v=20261117g";

const $ = (id) => document.getElementById(id);
const canvas = $("film"), ctx = canvas.getContext("2d");
const MAIN = SCENES.filter((s) => !s.extra);
const TOTAL = MAIN.reduce((a, s) => a + s.dur, 0);

const P = { T: 0, playing: true, speed: 1, duo: false, extra: null, ui: true, focus: null };
const FOCUS = { wall: WALL, ipad0: IPADS[0], ipad1: IPADS[1], mon: MON };
const FOCUS_ORDER = [null, "wall", "ipad0", "ipad1", "mon"];
let VIEW = { sc: 1, ox: 0, oy: 0 };
try { P.duo = localStorage.getItem("krabbels-film-duo") === "1"; } catch (e) {}

// --- size ---------------------------------------------------------------------------------------
let CW = 0, CH = 0, DPR = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); CW = innerWidth; CH = innerHeight; canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH * DPR); }
addEventListener("resize", resize); resize();

// --- which scene ----------------------------------------------------------------------------------
function current() {
  if (P.extra) { const s = SCENES[P.extra]; return { s, t: P.T % s.dur, idx: P.extra }; }
  let t = ((P.T % TOTAL) + TOTAL) % TOTAL;
  for (const s of MAIN) { if (t < s.dur) return { s, t, idx: SCENES.indexOf(s) }; t -= s.dur; }
  return { s: MAIN[0], t: 0, idx: 0 };
}
const startOf = (scene) => MAIN.slice(0, MAIN.indexOf(scene)).reduce((a, s) => a + s.dur, 0);

// --- led strips ---------------------------------------------------------------------------------------
function along(pts, p) {
  const L = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); tot += l; }
  let d = clamp(p, 0, 1) * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i]) { const u = d / L[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; } d -= L[i]; }
  return pts[pts.length - 1];
}
// a led strip: little lights; a moving light runs along it (lit = where, 0..1)
function strip(g, pts, lit = null) {
  const n = 34;
  for (let k = 0; k <= n; k++) {
    const q = along(pts, k / n), d = lit === null ? 1 : Math.abs(k / n - lit), on = Math.max(0, 1 - d / 0.14);
    g.fillStyle = C.ledOff;
    g.beginPath(); g.arc(q[0], q[1], 3, 0, Math.PI * 2); g.fill();
    if (on > 0) {
      g.save(); g.fillStyle = C.led;
      g.globalAlpha = 0.3 * on; g.beginPath(); g.arc(q[0], q[1], 10 + 18 * on, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.6 + 0.4 * on; g.beginPath(); g.arc(q[0], q[1], 3.5 + 4.5 * on, 0, Math.PI * 2); g.fill();
      if (on > 0.8) { g.globalAlpha = 1; g.fillStyle = "#fff"; g.beginPath(); g.arc(q[0], q[1], 3, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  }
}

// --- devices ------------------------------------------------------------------------------------------
function device(g, d, fn, kind) {
  g.save();
  if (kind === "ipad") { rr(g, d.x - 12, d.y - 12, d.w + 24, d.h + 24, 18); g.fillStyle = "#1d1d1f"; g.fill(); g.fillStyle = "#8d877b"; g.fillRect(d.x + d.w / 2 - 7, d.y + d.h + 12, 14, 1062 - d.y - d.h - 12); g.fillRect(d.x + d.w / 2 - 40, 1056, 80, 8); }
  if (kind === "mon") { g.fillStyle = "#1d1d1f"; rr(g, d.x - 10, d.y - 10, d.w + 20, d.h + 20, 8); g.fill(); g.fillRect(d.x + d.w / 2 - 6, d.y + d.h + 10, 12, 1062 - d.y - d.h - 10); g.fillRect(d.x + d.w / 2 - 45, 1056, 90, 8); }
  if (kind === "wall") { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(d.x + 8, d.y + 10, d.w, d.h); }
  g.beginPath(); g.rect(d.x, d.y, d.w, d.h); g.clip();
  g.fillStyle = "#000"; g.fillRect(d.x, d.y, d.w, d.h);
  if (fn) { g.translate(d.x, d.y); g.scale(d.w / d.vw, d.h / d.vh); fn(g); }
  g.restore();
  if (kind === "wall") { // the glass in front of the wall
    g.save(); g.strokeStyle = "rgba(120,160,200,0.35)"; g.lineWidth = 6; g.strokeRect(d.x - 6, d.y - 6, d.w + 12, d.h + 12); g.restore();
  }
}
function label(g, s, x, y) {
  g.font = "600 17px Inter, system-ui, sans-serif"; const w = g.measureText(s).width + 20;
  rr(g, x - w / 2, y - 13, w, 26, 13); g.fillStyle = "rgba(255,255,255,0.85)"; g.fill();
  text(g, s, x, y + 1, 17, "#555", "center", 600);
}

// --- draw a frame -----------------------------------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000); frame.last = now;
  if (P.playing) P.T += dt * P.speed;
  const { s, t } = current();

  // collect what the scene wants
  const calls = { wall: null, ipad: [null, null], mon: null, kids: null, pulses: [] };
  const E = {
    duo: P.duo, now: now / 1000,
    wall: (fn) => (calls.wall = fn), mon: (fn) => (calls.mon = fn),
    ipad: (i, fn) => (calls.ipad[i] = fn),
    kids: (gest, present = [true, P.duo], alpha = [1, 1]) => (calls.kids = { gest, present, alpha }),
    pulse: (name, p, carry, i = 0) => calls.pulses.push({ name, p, carry, i }),
  };
  try { s.draw(E, t); } catch (e) { console.error(e); }

  const g = ctx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = C.room; g.fillRect(0, 0, CW, CH);
  const availH = CH - (P.ui ? 92 : 0);
  let rx = 0, ry = 0, rw = 1920, rh = 1080;
  if (P.focus) { const d = FOCUS[P.focus], pad = d.w * 0.06; rx = d.x - pad; ry = d.y - pad; rw = d.w + pad * 2; rh = d.h + pad * 2; }
  const sc = Math.min(CW / rw, availH / rh), ox = (CW - rw * sc) / 2 - rx * sc, oy = (availH - rh * sc) / 2 - ry * sc;
  VIEW = { sc, ox, oy };
  g.translate(ox, oy); g.scale(sc, sc);
  // room
  g.fillStyle = C.room; g.fillRect(-2000, -2000, 6000, 2830);
  g.fillStyle = C.floor; g.fillRect(-2000, 830, 6000, 3000);
  g.fillStyle = "rgba(0,0,0,0.06)"; g.fillRect(-2000, 826, 6000, 6);
  // strips (base)
  for (const k in STRIPS) { const pl = calls.pulses.find((q) => q.name === k && q.p > 0 && q.p < 1); strip(g, STRIPS[k], pl ? pl.p : null); }
  // wall + monitor
  device(g, WALL, calls.wall, "wall");
  device(g, MON, calls.mon, "mon");
  // the children (seen from behind), standing at their iPad
  if (calls.kids) KID_X.forEach((x, i) => {
    if (!calls.kids.present[i]) return;
    const gs = calls.kids.gest, mine = gs && (gs.who === null || gs.who === undefined || gs.who === i);
    const name = mine ? (gs.g === "hand in hand" ? "verbinden" : gs.g) : "staan";
    g.save(); g.globalAlpha = clamp(calls.kids.alpha[i] ?? 1, 0, 1);
    gebaar(g, name, x - 150, 905, 360, C.kid, mine ? gs.t : null, mine ? gs.angle || 0 : 0);
    g.restore();
  });
  // iPads
  IPADS.forEach((d, i) => device(g, d, calls.ipad[i], "ipad"));
  // labels
  label(g, "Muur · beamer", WALL.x + WALL.w / 2, WALL.y + WALL.h + 22);
  label(g, "iPad 1", IPADS[0].x + IPADS[0].w / 2, IPADS[0].y - 28);
  label(g, "iPad 2", IPADS[1].x + IPADS[1].w / 2, IPADS[1].y - 28);
  label(g, "Monitor · uitgang", MON.x + MON.w / 2, MON.y - 30);

  ui(s, t);
  requestAnimationFrame(frame);
}

// --- controls ---------------------------------------------------------------------------------------------
const chapters = [...new Set(SCENES.map((s) => s.ch))];
const CH_NAMES = { 1: "Voor het spelen", 2: "Plaats nemen", 3: "Tekenen", 4: "Klaar", 5: "Intro", 6: "Spel", 7: "Einde", 8: "Uitzondering" };
$("hoofdstukken").innerHTML = chapters.map((c) => `<button data-ch="${c}" title="${CH_NAMES[c]}">${c === 8 ? "U" : c}<span>${CH_NAMES[c]}</span></button>`).join("");
document.querySelectorAll("#hoofdstukken button").forEach((b) => (b.onclick = () => goChapter(+b.dataset.ch)));
function goChapter(c) {
  const sc = SCENES.find((s) => s.ch === c);
  if (sc.extra) { P.extra = SCENES.indexOf(sc); P.T = 0; }
  else { P.extra = null; P.T = startOf(sc); }
  P.playing = true;
}
function step(d) {
  const { idx } = current();
  if (P.extra) { P.extra = null; P.T = 0; return; }
  const i = MAIN.indexOf(SCENES[idx]), n = MAIN[(i + d + MAIN.length) % MAIN.length];
  P.T = startOf(n);
}
$("speel").onclick = () => (P.playing = !P.playing);
$("vorige").onclick = () => step(-1);
$("volgende").onclick = () => step(1);
$("duo").onclick = () => { P.duo = !P.duo; try { localStorage.setItem("krabbels-film-duo", P.duo ? "1" : "0"); } catch (e) {} };
$("traag").onclick = () => (P.speed = P.speed === 1 ? 0.5 : 1);
const bar = $("tijdlijn");
bar.oninput = () => { P.extra = null; P.T = (bar.value / 1000) * TOTAL; };
// markers on the timeline
$("markers").innerHTML = MAIN.map((s, i) => (i && MAIN[i - 1].ch === s.ch ? "" : `<i style="left:${(startOf(s) / TOTAL) * 100}%">${s.ch}</i>`)).join("");
// zoom in on a device: click it (or Z to cycle); click again to go back to the room
canvas.addEventListener("click", (e) => {
  const x = (e.clientX - VIEW.ox) / VIEW.sc, y = (e.clientY - VIEW.oy) / VIEW.sc;
  if (P.focus) { P.focus = null; return; }
  for (const k in FOCUS) { const d = FOCUS[k]; if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) { P.focus = k; return; } }
});
$("zoom").onclick = () => (P.focus = FOCUS_ORDER[(FOCUS_ORDER.indexOf(P.focus) + 1) % FOCUS_ORDER.length]);
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "z") { $("zoom").click(); return; }
  if (k === "escape") { P.focus = null; return; }
  if (k === " ") { e.preventDefault(); P.playing = !P.playing; }
  else if (k === "arrowright") step(1);
  else if (k === "arrowleft") step(-1);
  else if (k === "d") $("duo").click();
  else if (k === "h") { P.ui = !P.ui; document.body.classList.toggle("schoon", !P.ui); }
  else if (/^[1-8]$/.test(k) && chapters.includes(+k)) goChapter(+k);
});
function ui(s, t) {
  $("titel").textContent = `${s.ch === 8 ? "Uitzondering" : s.ch} · ${s.title}`;
  $("uitleg").textContent = s.sub;
  $("speel").textContent = P.playing ? "❚❚" : "▶";
  $("duo").textContent = P.duo ? "Duo" : "Solo";
  $("duo").classList.toggle("on", P.duo);
  $("traag").classList.toggle("on", P.speed !== 1);
  $("zoom").textContent = P.focus ? { wall: "Muur", ipad0: "iPad 1", ipad1: "iPad 2", mon: "Monitor" }[P.focus] : "Overzicht";
  $("zoom").classList.toggle("on", !!P.focus);
  document.querySelectorAll("#hoofdstukken button").forEach((b) => b.classList.toggle("on", +b.dataset.ch === s.ch));
  if (!P.extra) { bar.value = Math.round((((P.T % TOTAL) + TOTAL) % TOTAL / TOTAL) * 1000); }
  const tt = P.extra ? t : ((P.T % TOTAL) + TOTAL) % TOTAL, tot = P.extra ? s.dur : TOTAL;
  $("tijd").textContent = `${Math.floor(tt / 60)}:${String(Math.floor(tt % 60)).padStart(2, "0")} / ${Math.floor(tot / 60)}:${String(Math.floor(tot % 60)).padStart(2, "0")}`;
}

requestAnimationFrame(frame);
window.film = { P, SCENES, MAIN, TOTAL, goChapter, FOCUS };
