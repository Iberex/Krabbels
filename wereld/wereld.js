// Level 0/1 = het frame "final_foreground" uit Figma: startstuk met logo, tutorial, papierrand en level 1,
// als één doorlopende wereld (voorlopig enkel de voorgrond).
export const INKLEUREN = false; // alles meteen in kleur, zoals in Figma. true = grijs tot de Krabbel voorbijkomt
export const VOOR = 300;        // zo ver (px) loopt de kleur voor de Krabbel uit

// grillige inkleurrand (y = 0..1080, van boven naar onder). Dezelfde formule staat in game3d.js (GLSL).
export const kras = (y) => 30 * Math.sin(y * 0.043) + 16 * Math.sin(y * 0.151 + 1.3) + 9 * Math.sin(y * 0.47 + 0.4) + (y - 540) * 0.12;

// nog niet ingekleurd = zelfde grijs-witte papier als de tutorial
export function grijs(img) {
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data;
  const tabel = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) tabel[i] = (0.55 + 0.42 * Math.pow(i / 255, 0.75)) * 255;
  for (let i = 0; i < p.length; i += 4) {
    const l = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
    p[i] = p[i + 1] = p[i + 2] = tabel[l];
  }
  g.putImageData(d, 0, 0);
  return cv;
}

// uitknippen tussen twee (grillige) randen, in wereld-px
export function knip(ctx, links, rechts) {
  ctx.beginPath();
  for (let y = -400; y <= 1480; y += 8) ctx.lineTo(links(y), y);
  for (let y = 1480; y >= -400; y -= 8) ctx.lineTo(rechts(y), y);
  ctx.closePath();
  ctx.clip();
}

// ---------------------------------------------------------------- de tekeningen (brug, helling, ladder)
// Punten van de brugboog (300 breed, 60 hoog) vanaf het linkeranker, zoals in Figma.
export function boog(x0, y0) {
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

// alle getekende lijnen van het level, als reeksen punten (ankerhoogte = loopvlak + 5 in level 1)
export function lijnen(level) {
  const anker = (x, y) => (x < level.overgang ? y : y + 5);
  const uit = level.bruggen.map((b) => boog(b.x, anker(b.x, b.y)));
  for (const [ax, ay, bx, by] of level.hellingen) uit.push([[ax, anker(ax, ay)], [bx, anker(bx, by)]]);
  for (const l of level.ladders) {
    // zelfde maten als de stippellijnen in Figma (de ladder van de tutorial steekt hoger uit)
    const tut = l.x < level.overgang, kop = l.boven + (tut ? -30 : -10), sport = l.boven + (tut ? 19 : 39);
    for (const dx of [-60, 60]) uit.push([[l.x + dx, kop], [l.x + dx, l.onder - 5]]);
    for (let y = sport; y < sport + 4 * 60; y += 60) uit.push([[l.x - 70, y], [l.x + 70, y]]);
  }
  return uit;
}

// potlood-/krijtlijn tekenen (zoals de borstel in Figma): een donkere kern met een korrelige rand
export function krijt(ctx, punten, zaad = 7) {
  let a = zaad;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = "#333333"; ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 11;
  ctx.beginPath(); punten.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
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

// het logo en de losse lagen van final_foreground
export async function laadPlaten(loadImg) {
  const reeks = (naam, n) => Promise.all(Array.from({ length: n }, (_, i) => loadImg(`assets/F/${naam}_${i}.png`)));
  const [blok, gids, logo, rand] = await Promise.all([reeks("blok", 9), reeks("gids", 9), reeks("logo", 3), loadImg("assets/F/rand.png")]);
  return { blok, gids, logo, rand, logoPlek: { x: 320, y: 200 }, randPlek: { x: 7600, y: 0 } };
}
