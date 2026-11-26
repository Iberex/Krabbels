// Hulpfuncties voor de wereld: de tekeningen (brug, helling, ladder) en de ankers.

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

// ---------------------------------------------------------------- camera
// Start en tutorial: de camera volgt de Krabbel. Vanaf de levels staat ze stil per scherm van 1920 px en
// schuift ze pas door als de Krabbel de rand van het scherm voorbij is. Tijdens het schuiven komen de
// achtergrondlagen iets later dan de voorgrond (hoe verder, hoe later): dat geeft diepte. Zodra de camera
// stilstaat, ligt elke laag weer exact zoals in het ontwerp.
export const SCHERM = 1920;
export const LEVELS_VANAF = 7680;                 // links hiervan: start en tutorial
export const AANTAL = 5;                          // levelschermen
export const schermX = (k) => LEVELS_VANAF + k * SCHERM;
const VOLG_MAX = LEVELS_VANAF - SCHERM;           // verder volgt de camera niet mee tot de Krabbel in level 1 is
// wanneer elke laag vertrekt en aankomt tijdens het schuiven (seconden)
const TIJDEN = { voor: [0, 1.25], l8: [0.08, 1.42], l9: [0.18, 1.6], l10: [0.28, 1.78], lucht: [0.2, 1.6] };
export const DUUR = 1.8;

const klem = (v, a, b) => Math.max(a, Math.min(b, v));
const zacht = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const volgDoel = (x) => klem(x - 730, 0, VOLG_MAX);

export function maakCamera() {
  const c = { x: 0, z: 1, modus: "volg", k: 0, pan: null, l8: 0, l9: 0, l10: 0, lucht: 0 };
  const gelijk = (v) => { c.x = c.l8 = c.l9 = c.l10 = c.lucht = v; };
  // meteen op de juiste plek (start, opnieuw, level kiezen)
  c.zet = (x) => {
    c.pan = null;
    if (x >= LEVELS_VANAF) { c.modus = "scherm"; c.k = klem(Math.floor((x - LEVELS_VANAF) / SCHERM), 0, AANTAL - 1); gelijk(schermX(c.k)); }
    else { c.modus = "volg"; gelijk(volgDoel(x)); }
  };
  const schuif = (naar, modus, k, diepte) => { c.pan = { van: c.x, naar, t: 0, modus, k, diepte }; };
  c.stap = (x, dt) => {
    if (c.pan) {
      const p = c.pan;
      p.t += dt;
      const op = ([a, b]) => p.van + (p.naar - p.van) * zacht(klem((p.t - a) / (b - a), 0, 1));
      c.x = op(TIJDEN.voor);
      for (const laag of ["l8", "l9", "l10", "lucht"]) c[laag] = p.diepte ? op(TIJDEN[laag]) : c.x;
      if (p.t >= (p.diepte ? DUUR : TIJDEN.voor[1])) { c.modus = p.modus; c.k = p.k; c.pan = null; gelijk(p.naar); }
      return;
    }
    if (c.modus === "volg") {
      if (x > LEVELS_VANAF + 10) schuif(schermX(0), "scherm", 0, false);
      else gelijk(c.x + (volgDoel(x) - c.x) * Math.min(1, dt * 6));
      return;
    }
    gelijk(schermX(c.k));
    if (c.k < AANTAL - 1 && x > schermX(c.k + 1) + 10) schuif(schermX(c.k + 1), "scherm", c.k + 1, true);
    else if (x < schermX(c.k) - 10) {
      if (c.k === 0) schuif(volgDoel(x), "volg", 0, false);
      else schuif(schermX(c.k - 1), "scherm", c.k - 1, true);
    }
  };
  return c;
}

// welke schermachtergrond-lucht ligt onder, en hoe ver is de volgende er al overheen gekomen?
export function luchtStand(camLucht) {
  const pos = klem((camLucht - LEVELS_VANAF) / SCHERM, 0, AANTAL - 1);
  return { onder: Math.floor(pos), mate: pos - Math.floor(pos) };
}
export const LAGEN = ["l10", "l9", "l8"];        // van ver naar dichtbij

// ---------------------------------------------------------------- tutorial: grijze blokken (Figma "tutorial_level")
// Drie lagen papieren blokken. De camera volgt hier de Krabbel, dus ze mogen echt diepte hebben: hoe verder, hoe
// trager. Elk blok staat op zijn ontworpen plek wanneer het midden in beeld is. De voorgrond van final_foreground
// ligt 1920 px verder en 225 px lager dan in tutorial_level, dus de blokken ook.
const LAGEN_TUT = [ // van ver naar dichtbij: [bestand, snelheid, [[x, breedte], ...]]
  ["bg3", 0.65, [[1680, 910], [660, 345], [4977, 345]]],
  ["bg2", 0.75, [[1280, 880], [2700, 810], [4216, 789]]],
  ["bg1", 0.85, [[240, 1260], [2810, 1260], [4490, 1150]]],
];
export const BLOKKEN = LAGEN_TUT.flatMap(([laag, r, rij]) => rij.map(([x, w], k) => {
  const X = x + SCHERM;
  return { naam: `tut_${laag}_${k}.png`, r, x: X - 30, y: 225, camRef: klem(X + w / 2 - 960, 0, VOLG_MAX) };
}));
export const blokX = (b, cam) => b.x + (1 - b.r) * (Math.min(cam, VOLG_MAX) - b.camRef);   // vanaf de levels schuiven ze niet meer

// ---------------------------------------------------------------- eindscherm (Figma "end_screen")
// Eén vast scherm; de Krabbel komt uit de deur linksboven en kan er rondlopen. De loopvlakken zijn de grashoogtes
// uit het ontwerp (442, 559, 799). In 3D wordt het opgebouwd uit de modellen van de levels (game3d.js).
export const EIND = {
  start: { x: 150, y: 442 },
  // achterTot: een hoger platform dat achter het lagere ligt is geen muur (je kan eronderdoor)
  vlakken: [
    { x0: 0, x1: 790, y: 442, achterTot: 1920 }, { x0: 1072, x1: 1920, y: 559, achterTot: 1920 },
    { x0: 0, x1: 572, y: 799 }, { x0: 870, x1: 1920, y: 799 },
  ],
  bruggen: [{ x: 570, y: 799 }],
  hellingen: [[782, 442, 1080, 559]],
  ladders: [{ x: 1567, boven: 559, onder: 799 }],
};
