// =====================================================================
// De tv aan de uitgang: de Krabbelwereld, 1920 × 1080.
// =====================================================================
import { K, lerp, clamp, ease } from "./kit.js?v=20261117c";
import { krabbel } from "./krabbel.js?v=20261117c";
import { S } from "./flow.js?v=20261117c";

export const W = 1920, H = 1080;
const GROUND = 860;

function wander(i, now) {
  const sp = 0.04 + (i % 4) * 0.011, ph = i * 2.1;
  const a = (now / 1000) * sp * 6 + ph;
  const lane = 220 + ((i * 397) % 1480);
  return { x: lane + Math.sin(a) * 180, dir: Math.cos(a) > 0 };
}

export function drawTv(g, e) {
  g.fillStyle = K.vlak; g.fillRect(0, 0, W, H);
  g.fillStyle = K.lijn; g.fillRect(0, GROUND, W, H - GROUND);
  const now = e.now;
  e.others.forEach((kr, i) => {
    const w = wander(i, now), back = i % 2 ? 0 : 60;
    const st = Math.sin(now / 1000 * 0.6 + i * 1.3) > 0.9 ? "zwaaien" : "lopen";
    krabbel(g, kr, w.x, GROUND + 4 - back, 80 + (i % 3) * 14, st, now / 1000 + i, { flip: !w.dir, alpha: back ? 0.75 : 1 });
  });
  // your Krabbel
  if (S.id === "9a") {
    const u = clamp(e.t / 2.4, 0, 1);
    const x = lerp(-120, W * 0.42, ease(u));
    krabbel(g, e.mine, x, GROUND + 4, 120, u < 1 ? "lopen" : "zwaaien", e.t);
  } else {
    const w = wander(9, now);
    krabbel(g, e.mine, w.x, GROUND + 4, 110, "lopen", now / 1000, { flip: !w.dir });
  }
}
