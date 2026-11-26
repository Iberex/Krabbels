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

// het logo en de losse lagen van final_foreground
export async function laadPlaten(loadImg) {
  const reeks = (naam, n) => Promise.all(Array.from({ length: n }, (_, i) => loadImg(`assets/F/${naam}_${i}.png`)));
  const [blok, gids, logo, rand] = await Promise.all([reeks("blok", 9), reeks("gids", 9), reeks("logo", 3), loadImg("assets/F/rand.png")]);
  return { blok, gids, logo, rand, logoPlek: { x: 320, y: 200 }, randPlek: { x: 7600, y: 0 } };
}
