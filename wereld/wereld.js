// Hulpfuncties voor de wereld: de tekeningen (brug, helling, ladder), de ankers en het overvloeien van de achtergronden.

// over zoveel px vloeit de achtergrond van het ene level in het volgende
export const OVERVLOEI = 1100;
// welke achtergrond(en) horen bij het midden van het beeld?
export function vloeit(delen, midden) {
  let basis = 0, mate = 0;
  for (let k = 1; k < delen.length; k++) {
    const t = (midden - (delen[k].x - OVERVLOEI / 2)) / OVERVLOEI;
    if (t >= 1) basis = k;
    else if (t > 0) mate = t;
  }
  return { basis, volgende: Math.min(delen.length - 1, basis + 1), mate };
}

// Punten van de brugboog (300 breed, 60 hoog) vanaf het linkeranker, zoals in Figma.
function boog(x0, y0) {
  const stuk = [[[0, 0], [0, 0], [30, -60], [150, -60]], [[150, -60], [270, -60], [300, 0], [300, 0]]];
  const uit = [];
  for (const [a, b, c, d] of stuk) {
    for (let i = uit.length ? 1 : 0; i <= 20; i++) {
      const t = i / 20, u = 1 - t, m = (k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k];
      uit.push([x0 + m(0), y0 + m(1)]);
    }
  }
  return uit;
}

// ankers liggen in de tutorial op het loopvlak, in de levels 5 px eronder
export const anker = (wereld, x, y) => [x, x < wereld.rand ? y : y + 5];

// alle getekende lijnen van de wereld, als reeksen punten
export function lijnen(wereld) {
  const uit = wereld.bruggen.map((b) => boog(...anker(wereld, b.x, b.y)));
  for (const [ax, ay, bx, by] of wereld.hellingen) uit.push([anker(wereld, ax, ay), anker(wereld, bx, by)]);
  for (const l of wereld.ladders) {
    // zelfde maten als de stippellijnen in Figma (de ladder van de tutorial steekt hoger uit)
    const tut = l.x < wereld.rand, kop = l.boven + (tut ? -30 : -10), sport = l.boven + (tut ? 19 : 39);
    for (const dx of [-60, 60]) uit.push([[l.x + dx, kop], [l.x + dx, l.onder - 5]]);
    for (let y = sport; y < sport + 4 * 60; y += 60) uit.push([[l.x - 70, y], [l.x + 70, y]]);
  }
  return uit;
}
lijnen.boog = boog;

function doek(x0, y0, x1, y1) {
  const beeld = document.createElement("canvas");
  beeld.width = Math.ceil(x1 - x0); beeld.height = Math.ceil(y1 - y0);
  const g = beeld.getContext("2d"); g.translate(-x0, -y0);
  return { beeld, g, x: x0, y: y0 };
}
const pad = (g, punten) => { g.beginPath(); punten.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const schaduw = (g) => { g.shadowColor = "rgba(0,0,0,.28)"; g.shadowBlur = 10; g.shadowOffsetY = 5; };

// wit papieren strookje met stippen (het sjabloon), met daarop de potloodlijn van de tekening
export function tekenGids(punten, zaad) {
  const xs = punten.map((p) => p[0]), ys = punten.map((p) => p[1]);
  const s = doek(Math.floor(Math.min(...xs)) - 24, Math.floor(Math.min(...ys)) - 24, Math.max(...xs) + 24, Math.max(...ys) + 30);
  const g = s.g;
  g.lineCap = g.lineJoin = "round";
  g.save(); schaduw(g); g.strokeStyle = "#f4f3ef"; g.lineWidth = 20; pad(g, punten); g.restore();
  g.fillStyle = "#2e2e2e";
  let over = 0;
  for (let i = 1; i < punten.length; i++) {
    const [x0, y0] = punten[i - 1], [x1, y1] = punten[i], l = Math.hypot(x1 - x0, y1 - y0);
    for (; over <= l; over += 25) { g.beginPath(); g.arc(x0 + ((x1 - x0) * over) / l, y0 + ((y1 - y0) * over) / l, 5, 0, 7); g.fill(); }
    over -= l;
  }
  krijt(g, punten, zaad);
  return s;
}

export function tekenAnker(x, y, tutorial) {
  const s = doek(x - 36, y - 36, x + 36, y + 42), g = s.g;
  const rondje = (r, kleur) => { g.fillStyle = kleur; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  g.save(); schaduw(g); rondje(tutorial ? 24 : 14, tutorial ? "#333333" : "#ff821c"); g.restore();
  if (!tutorial) rondje(6, "#ffe482");
  return s;
}

// potlood-/krijtlijn (zoals de borstel in Figma): een donkere kern met een korrelige rand
function krijt(ctx, punten, zaad) {
  let a = zaad;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = "#333333"; ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 11;
  pad(ctx, punten);
  for (let i = 1; i < punten.length; i++) {
    const [x0, y0] = punten[i - 1], [x1, y1] = punten[i], l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
    for (let k = 0; k < l * 1.6; k++) {
      const t = r(), d = (r() - 0.5) * 17;
      ctx.globalAlpha = 0.45 + r() * 0.55;
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d, 0.8 + r() * 1.7, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
