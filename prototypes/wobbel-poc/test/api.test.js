// API tests. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');

const sample = (extra = {}) => ({
  strokes: [[[-0.2, 0.1], [-0.18, 0.12], [0.3, 0.3]]],
  stickers: [
    { type: 'eye_round', x: -0.25, y: -0.2 },
    { type: 'legs_long', x: 0, y: 1 },
  ],
  ...extra,
});

function start(options) {
  return new Promise((resolve) => {
    const server = createApp(options).listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const call = async (method, url, body) => {
        const res = await fetch(base + url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() };
      };
      resolve({ call, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wobbel-test-'));

test('create, list with since, finish, world list', async () => {
  const s = await start({ dataDir: tempDir() });
  try {
    const a = await s.call('POST', '/api/wobbels', sample());
    assert.equal(a.status, 201);
    assert.match(a.body.id, /^w_[0-9a-f]{6}$/);
    assert.equal(a.body.status, 'level');
    assert.ok(a.body.createdAt);
    const b = await s.call('POST', '/api/wobbels', sample());
    const c = await s.call('POST', '/api/wobbels', sample());

    let list = await s.call('GET', '/api/wobbels?status=level');
    assert.deepEqual(list.body.wobbels.map((w) => w.id), [a.body.id, b.body.id, c.body.id]);
    assert.ok(list.body.epoch);

    list = await s.call('GET', `/api/wobbels?status=level&since=${a.body.id}`);
    assert.deepEqual(list.body.wobbels.map((w) => w.id), [b.body.id, c.body.id]);

    // Finish in a different order than creation: world order follows finish order.
    const finished = await s.call('POST', `/api/wobbels/${c.body.id}/finish`);
    assert.equal(finished.body.status, 'world');
    assert.equal(finished.body.home, 0); // first wobbels of the day live in the bottom chunk
    await s.call('POST', `/api/wobbels/${a.body.id}/finish`);
    // Finishing twice is harmless.
    assert.equal((await s.call('POST', `/api/wobbels/${c.body.id}/finish`)).status, 200);

    list = await s.call('GET', '/api/wobbels?status=world');
    assert.deepEqual(list.body.wobbels.map((w) => w.id), [c.body.id, a.body.id]);
    list = await s.call('GET', `/api/wobbels?status=world&since=${c.body.id}`);
    assert.deepEqual(list.body.wobbels.map((w) => w.id), [a.body.id]);
    list = await s.call('GET', `/api/wobbels?status=world&since=${a.body.id}`);
    assert.equal(list.body.wobbels.length, 0);

    list = await s.call('GET', '/api/wobbels?status=level');
    assert.deepEqual(list.body.wobbels.map((w) => w.id), [b.body.id]);

    assert.equal((await s.call('POST', '/api/wobbels/w_nope/finish')).status, 404);
  } finally {
    await s.close();
  }
});

test('same clientId is stored only once', async () => {
  const s = await start({ dataDir: tempDir() });
  try {
    const first = await s.call('POST', '/api/wobbels', sample({ clientId: 'ipad-abc-1' }));
    const again = await s.call('POST', '/api/wobbels', sample({ clientId: 'ipad-abc-1' }));
    assert.equal(first.status, 201);
    assert.equal(again.status, 200);
    assert.equal(again.body.id, first.body.id);
    assert.equal((await s.call('GET', '/api/wobbels')).body.wobbels.length, 1);
  } finally {
    await s.close();
  }
});

test('invalid data is refused', async () => {
  const s = await start({ dataDir: tempDir() });
  try {
    const noLegs = sample({ stickers: [{ type: 'eye_round', x: 0, y: 0 }] });
    assert.equal((await s.call('POST', '/api/wobbels', noLegs)).status, 400);
    const twoLegs = sample({ stickers: [{ type: 'legs_long', x: 0, y: 1 }, { type: 'legs_short', x: 0, y: 1 }] });
    assert.equal((await s.call('POST', '/api/wobbels', twoLegs)).status, 400);
    const badType = sample({ stickers: [{ type: '<script>', x: 0, y: 0 }, { type: 'legs_long', x: 0, y: 1 }] });
    assert.equal((await s.call('POST', '/api/wobbels', badType)).status, 400);
    const badPoint = sample({ strokes: [[['a', 1]]] });
    assert.equal((await s.call('POST', '/api/wobbels', badPoint)).status, 400);
    assert.equal((await s.call('GET', '/api/wobbels?status=banana')).status, 400);

    // Values far outside the circle are clamped, not refused.
    const far = await s.call('POST', '/api/wobbels', sample({ strokes: [[[99, -99]]] }));
    assert.deepEqual(far.body.strokes, [{ c: '#000000', w: 0.05, p: [[1.8, -1.8]] }]);
  } finally {
    await s.close();
  }
});

test('data survives a restart, reset clears it and changes the epoch', async () => {
  const dataDir = tempDir();
  let s = await start({ dataDir });
  const a = await s.call('POST', '/api/wobbels', sample());
  await s.call('POST', `/api/wobbels/${a.body.id}/finish`);
  await s.call('POST', '/api/wobbels', sample());
  const before = await s.call('GET', '/api/wobbels');
  await s.close();

  s = await start({ dataDir });
  try {
    const after = await s.call('GET', '/api/wobbels');
    assert.equal(after.body.wobbels.length, 2);
    assert.equal(after.body.epoch, before.body.epoch);
    assert.equal((await s.call('GET', '/api/wobbels?status=world')).body.wobbels[0].id, a.body.id);

    // No leftover temp files.
    assert.deepEqual(fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp')), []);

    const reset = await s.call('POST', '/admin/reset');
    assert.equal(reset.status, 200);
    const empty = await s.call('GET', '/api/wobbels');
    assert.equal(empty.body.wobbels.length, 0);
    assert.notEqual(empty.body.epoch, before.body.epoch);
  } finally {
    await s.close();
  }
});

test('a new day starts with an empty world', async () => {
  let day = '2026-11-16';
  const s = await start({ dataDir: tempDir(), getDay: () => day });
  try {
    await s.call('POST', '/api/wobbels', sample());
    const monday = await s.call('GET', '/api/wobbels');
    assert.equal(monday.body.wobbels.length, 1);
    day = '2026-11-17';
    const tuesday = await s.call('GET', '/api/wobbels');
    assert.equal(tuesday.body.wobbels.length, 0);
    assert.notEqual(tuesday.body.epoch, monday.body.epoch);
    day = '2026-11-16';
    assert.equal((await s.call('GET', '/api/wobbels')).body.wobbels.length, 1);
  } finally {
    await s.close();
  }
});

test('many wobbels at the same time are all saved', async () => {
  const dataDir = tempDir();
  const s = await start({ dataDir });
  try {
    const results = await Promise.all(Array.from({ length: 40 }, () => s.call('POST', '/api/wobbels', sample())));
    assert.ok(results.every((r) => r.status === 201));
    assert.equal(new Set(results.map((r) => r.body.id)).size, 40);
    const file = fs.readdirSync(dataDir).find((f) => f.endsWith('.json'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')).wobbels.length, 40);
  } finally {
    await s.close();
  }
});

test('strokes with colour, width and eraser; old format is converted', async () => {
  const s = await start({ dataDir: tempDir() });
  try {
    const strokes = [
      { c: '#E53935', w: 0.1, p: [[0, 0], [0.5, 0.5]] },
      { c: 'erase', w: 9, p: [[0.1, 0.1]] },
      [[1.6, -1.6], [1.2, 0]], // old format
    ];
    const stickers = [
      { type: 'eye_round', x: 0, y: 0, c: '#1E88E5' },
      { type: 'mouth_smile', x: 0, y: 0.4 },
      { type: 'arms_short', x: 0, y: 0 },
      { type: 'extra_hat', x: 0, y: -1 },
      { type: 'legs_short', x: 0, y: 1, c: '#43a047' },
    ];
    const res = await s.call('POST', '/api/wobbels', { strokes, stickers });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.strokes, [
      { c: '#e53935', w: 0.1, p: [[0, 0], [0.5, 0.5]] },
      { c: 'erase', w: 0.4, p: [[0.1, 0.1]] },
      { c: '#000000', w: 0.05, p: [[1.6, -1.6], [1.2, 0]] },
    ]);
    assert.equal(res.body.stickers[0].c, undefined); // stickers have fixed colours: c is dropped
    assert.equal(res.body.stickers[1].c, undefined);

    const post = (body) => s.call('POST', '/api/wobbels', body);
    const legs = { type: 'legs_short', x: 0, y: 1 };
    assert.equal((await post({ strokes: [{ c: 'red', p: [[0, 0]] }], stickers: [legs] })).status, 400);
    assert.equal((await post({ strokes: [{ c: '#000000', p: 'x' }], stickers: [legs] })).status, 400);
    assert.equal((await post({ strokes: [], stickers: [legs], fill: 'javascript:1' })).status, 400);

    // Rainbow stroke and body fill are stored.
    const free = await post({ strokes: [{ c: 'rainbow', h: 400, w: 0.08, p: [[-1.7, 0], [5, 0]] }], stickers: [legs], fill: '#FDD835' });
    assert.equal(free.status, 201);
    assert.deepEqual(free.body.strokes, [{ c: 'rainbow', w: 0.08, p: [[-1.7, 0], [1.8, 0]], h: 40 }]);
    assert.equal(free.body.fill, '#fdd835');
    const twoArms = [legs, { type: 'arms_short', x: 0, y: 0 }, { type: 'arms_long', x: 0, y: 0 }];
    assert.equal((await post({ strokes: [], stickers: twoArms })).status, 400);
  } finally {
    await s.close();
  }
});
