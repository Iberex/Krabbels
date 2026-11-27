// Creates random test wobbels through the API.
//
//   npm run seed -- 120          120 wobbels, sent straight to the WORLD (performance test)
//   npm run seed -- 3 level      3 wobbels that walk through the LEVEL first
//
// Other server address: set BASE, for example  BASE=http://192.168.1.20:3000

const BASE = process.env.BASE || 'http://localhost:3000';
const count = Number(process.argv[2]) || 10;
const toLevel = process.argv[3] === 'level';

const EYES = ['eye_round', 'eye_sleepy', 'eye_angry', 'eye_big', 'eye_cyclops'];
const MOUTHS = ['mouth_smile', 'mouth_teeth', 'mouth_o'];
const LEGS = ['legs_short', 'legs_long', 'legs_paws'];
const ARMS = ['arms_short', 'arms_long'];
const EXTRAS = ['extra_hat', 'extra_bow', 'extra_antenna', 'extra_tail'];
const COLORS = ['#000000', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ec407a'];
const WIDTHS = [0.03, 0.06, 0.12];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (p) => Math.random() < p;
const round = (n) => Math.round(n * 1000) / 1000;

function randomWobbel() {
  const strokes = [];

  // A closed, wobbly body shape around the guide circle.
  const body = [];
  const bumps = 3 + Math.floor(Math.random() * 4);
  const size = 0.75 + Math.random() * 0.35;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = size + Math.sin(a * bumps) * 0.12;
    body.push([round(Math.cos(a) * r), round(Math.sin(a) * r * 0.95)]);
  }
  strokes.push({ c: pick(COLORS), w: pick(WIDTHS), p: body });

  // Some scribbles, also outside the circle.
  const scribbles = 1 + Math.floor(Math.random() * 5);
  for (let s = 0; s < scribbles; s++) {
    let x = Math.random() * 2.4 - 1.2;
    let y = Math.random() * 2 - 1.2;
    let angle = Math.random() * Math.PI * 2;
    const points = [];
    const length = 10 + Math.floor(Math.random() * 40);
    for (let i = 0; i < length; i++) {
      points.push([round(x), round(y)]);
      angle += (Math.random() - 0.5) * 0.9;
      x += Math.cos(angle) * 0.04;
      y += Math.sin(angle) * 0.04;
    }
    strokes.push({ c: chance(0.1) ? 'erase' : pick(COLORS), w: pick(WIDTHS), p: points });
  }

  const colored = (sticker) => (chance(0.5) ? Object.assign(sticker, { c: pick(COLORS) }) : sticker);
  const stickers = [];
  const eye = pick(EYES);
  if (eye === 'eye_cyclops') {
    stickers.push(colored({ type: eye, x: 0, y: -0.3 }));
  } else {
    stickers.push(colored({ type: eye, x: -0.32, y: -0.3 }));
    stickers.push(colored({ type: chance(0.8) ? eye : pick(EYES), x: 0.32, y: -0.3 }));
  }
  if (chance(0.7)) stickers.push(colored({ type: pick(MOUTHS), x: 0, y: 0.35 }));
  if (chance(0.5)) stickers.push(colored({ type: pick(ARMS), x: 0, y: 0 }));
  if (chance(0.4)) stickers.push(colored({ type: pick(EXTRAS), x: 0, y: -1.05 }));
  stickers.push(colored({ type: pick(LEGS), x: 0, y: 1 }));
  return { strokes, stickers };
}

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

(async () => {
  for (let i = 0; i < count; i++) {
    const wobbel = await post('/api/wobbels', randomWobbel());
    if (!toLevel) await post(`/api/wobbels/${wobbel.id}/finish`);
  }
  console.log(`Created ${count} wobbels in the ${toLevel ? 'level' : 'world'} on ${BASE}.`);
})().catch((error) => {
  console.error(`Seed failed: ${error.message}. Is the server running?`);
  process.exit(1);
});
