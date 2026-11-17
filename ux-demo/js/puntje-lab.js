// Puntje-lab: every animation in a loop, plus a big, slow-motion view.
import { ANIMS, ORDER, animate } from "./puntje.js?v=20261117e";

const grid = document.getElementById("grid");
const cards = [];
let speed = 1, T = 0, last = performance.now();

for (const name of ORDER) {
  const a = ANIMS[name];
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<canvas></canvas><b>${name}</b><small>${a.use} · ${a.dur.toFixed(1).replace(".", ",")} s</small>`;
  el.onclick = () => openBig(ORDER.indexOf(name));
  grid.appendChild(el);
  cards.push({ name, cv: el.querySelector("canvas") });
}

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
function stage(g, w, h, name, t, s) {
  g.clearRect(0, 0, w, h);
  const gy = h * 0.88;
  g.fillStyle = "#f2f2f2"; g.fillRect(0, gy, w, h - gy);
  g.fillStyle = "#d9d9d9"; g.fillRect(0, gy, w, 2);
  animate(g, name, t, w / 2, gy, s);
}

// --- big view ---
const big = document.getElementById("groot"), gc = document.getElementById("gc"), slider = document.getElementById("gtijd");
let bigIdx = -1, paused = false, bigT = 0;
function openBig(i) {
  bigIdx = (i + ORDER.length) % ORDER.length; bigT = 0; paused = false;
  document.getElementById("gnaam").textContent = ORDER[bigIdx];
  const a = ANIMS[ORDER[bigIdx]];
  document.getElementById("ggebruik").textContent = `${a.use} · lus van ${a.dur.toFixed(1).replace(".", ",")} s`;
  document.getElementById("gpauze").classList.remove("on");
  big.classList.add("zicht");
}
const close = () => { big.classList.remove("zicht"); bigIdx = -1; };
document.getElementById("gterug").onclick = close;
document.getElementById("gvorige").onclick = () => openBig(bigIdx - 1);
document.getElementById("gvolgende").onclick = () => openBig(bigIdx + 1);
document.getElementById("gpauze").onclick = (e) => { paused = !paused; e.target.classList.toggle("on", paused); };
slider.oninput = () => { paused = true; document.getElementById("gpauze").classList.add("on"); bigT = (slider.value / 1000) * ANIMS[ORDER[bigIdx]].dur; };
addEventListener("keydown", (e) => {
  if (bigIdx < 0) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowRight") openBig(bigIdx + 1);
  if (e.key === "ArrowLeft") openBig(bigIdx - 1);
  if (e.key === " ") { e.preventDefault(); document.getElementById("gpauze").click(); }
});

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000) * speed;
  last = now; T += dt;
  if (bigIdx >= 0) {
    if (!paused) bigT += dt;
    const a = ANIMS[ORDER[bigIdx]];
    const [g, w, h] = fit(gc);
    stage(g, w, h, ORDER[bigIdx], bigT, h / 230);
    if (!paused) slider.value = Math.round(((bigT % a.dur) / a.dur) * 1000);
  } else {
    for (const c of cards) { const [g, w, h] = fit(c.cv); stage(g, w, h, c.name, T, 0.95); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
