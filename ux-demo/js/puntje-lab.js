// Puntje-lab: every animation in a loop, plus a big, slow-motion view.
// Set 1: Puntje (rig, floats). Set 2: the stick figure in the signs (pictograms), only the obstacle gestures.
import { ANIMS, ORDER, animate } from "./puntje.js?v=20261117g";
import { gebaar, gebaarDuur } from "./rig.js?v=20261117g";

const fmt = (s) => s.toFixed(1).replace(".", ",");

// --- the items -----------------------------------------------------------------------
const ITEMS = [];
for (const name of ORDER) {
  const a = ANIMS[name];
  ITEMS.push({ set: "puntje", name, use: a.use, dur: a.dur, draw: (g, w, h, t, s) => animate(g, name, t, w / 2, h * 0.88, s) });
}
const PICTO = [
  { name: "brug (vlak)", g: "verbinden", angle: 0, use: "Bordje bij een brug: armen wijd" },
  { name: "helling omhoog", g: "verbinden", angle: 17.5, use: "Bordje bij een helling omhoog: armen schuin" },
  { name: "helling omlaag", g: "verbinden", angle: -17.5, use: "Bordje bij een helling omlaag: armen schuin" },
  { name: "hand in hand", g: "hand in hand", angle: 0, use: "Bordje bij een samen-brug (duo)" },
  { name: "ladder", g: "ladder", angle: 0, use: "Bordje bij een ladder: armen omhoog" },
  { name: "springen", g: "springen", angle: 0, use: "Bordje bij een blok: springen" },
  { name: "bukken", g: "bukken", angle: 0, use: "Bordje bij een balk: bukken" },
];
for (const p of PICTO) {
  ITEMS.push({ set: "picto", name: p.name, use: p.use, dur: gebaarDuur(p.g, p.angle), draw: (g, w, h, t, s) => gebaar(g, p.g, w / 2, h * 0.5, h * 0.78, "#222222", t, p.angle) });
}

// --- grid ------------------------------------------------------------------------------
const cards = [];
let speed = 1, T = 0, last = performance.now();
ITEMS.forEach((it, i) => {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<canvas></canvas><b>${it.name}</b><small>${it.use} · ${fmt(it.dur)} s</small>`;
  el.onclick = () => openBig(i);
  document.getElementById(it.set === "puntje" ? "grid" : "grid-picto").appendChild(el);
  cards.push({ it, cv: el.querySelector("canvas") });
});

// filter: all / Puntje / pictograms (remembered on this computer)
let filter = "alles";
try { filter = localStorage.getItem("krabbels-lab-filter") || "alles"; } catch (e) {}
const visible = () => ITEMS.map((it, i) => i).filter((i) => filter === "alles" || ITEMS[i].set === filter);
function setFilter(f) {
  filter = f;
  try { localStorage.setItem("krabbels-lab-filter", f); } catch (e) {}
  document.querySelectorAll("#filter button").forEach((x) => x.classList.toggle("on", x.dataset.f === f));
  document.querySelectorAll("[data-set]").forEach((el) => (el.hidden = f !== "alles" && el.dataset.set !== f));
}
document.querySelectorAll("#filter button").forEach((b) => (b.onclick = () => setFilter(b.dataset.f)));
setFilter(filter);

document.querySelectorAll("#snelheid button").forEach((b) => (b.onclick = () => {
  speed = +b.dataset.s;
  document.querySelectorAll("#snelheid button").forEach((x) => x.classList.toggle("on", x === b));
}));

function fit(cv) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [g, w, h];
}
function stage(g, w, h, it, t, s) {
  g.clearRect(0, 0, w, h);
  if (it.set === "puntje") {
    const gy = h * 0.88;
    g.fillStyle = "#f2f2f2"; g.fillRect(0, gy, w, h - gy);
    g.fillStyle = "#d9d9d9"; g.fillRect(0, gy, w, 2);
  }
  it.draw(g, w, h, t, s);
}

// --- big view ------------------------------------------------------------------------------
const big = document.getElementById("groot"), gc = document.getElementById("gc"), slider = document.getElementById("gtijd");
let bigIdx = -1, paused = false, bigT = 0;
function openBig(i) {
  bigIdx = (i + ITEMS.length) % ITEMS.length; bigT = 0; paused = false;
  const it = ITEMS[bigIdx];
  document.getElementById("gnaam").textContent = (it.set === "picto" ? "Pictogram · " : "Puntje · ") + it.name;
  document.getElementById("ggebruik").textContent = `${it.use} · lus van ${fmt(it.dur)} s`;
  document.getElementById("gpauze").classList.remove("on");
  big.classList.add("zicht");
}
const close = () => { big.classList.remove("zicht"); bigIdx = -1; };
document.getElementById("gterug").onclick = close;
function step(d) { const v = visible(), j = v.indexOf(bigIdx); openBig(v[(j + d + v.length) % v.length]); }
document.getElementById("gvorige").onclick = () => step(-1);
document.getElementById("gvolgende").onclick = () => step(1);
document.getElementById("gpauze").onclick = (e) => { paused = !paused; e.target.classList.toggle("on", paused); };
slider.oninput = () => { paused = true; document.getElementById("gpauze").classList.add("on"); bigT = (slider.value / 1000) * ITEMS[bigIdx].dur; };
addEventListener("keydown", (e) => {
  if (bigIdx < 0) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === " ") { e.preventDefault(); document.getElementById("gpauze").click(); }
});

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000) * speed;
  last = now; T += dt;
  if (bigIdx >= 0) {
    if (!paused) bigT += dt;
    const it = ITEMS[bigIdx];
    const [g, w, h] = fit(gc);
    stage(g, w, h, it, bigT, h / 230);
    if (!paused) slider.value = Math.round(((bigT % it.dur) / it.dur) * 1000);
  } else {
    for (const c of cards) { if (filter !== "alles" && c.it.set !== filter) continue; const [g, w, h] = fit(c.cv); stage(g, w, h, c.it, T, 0.95); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
