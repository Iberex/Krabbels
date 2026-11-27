// Wobbel proof of concept: Express server.
// All clients (iPad, level screen, world screen) talk to this server with fetch only.

const express = require('express');
const os = require('os');
const path = require('path');
const { createStore } = require('./lib/store');
const { validateWobbel } = require('./lib/validate');

const PUBLIC_DIR = path.join(__dirname, 'public');

function createApp({ dataDir = path.join(__dirname, 'data'), getDay } = {}) {
  const app = express();
  const store = createStore(dataDir, getDay);

  app.use(express.json({ limit: '256kb' }));

  // ---------- Pages ----------
  const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
  app.get('/', (req, res) => res.redirect('/admin'));
  app.get('/draw', page('draw.html'));
  app.get('/level', page('level.html'));
  app.get('/world', page('world.html'));
  app.get('/admin', page('admin.html'));

  // no-cache: Safari on the iPad otherwise keeps old versions of the scripts.
  app.use(express.static(PUBLIC_DIR, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  // ---------- API ----------
  const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  // Small status call. /draw and /admin use it for the connection dot.
  app.get('/api/health', (req, res) => res.json(store.info()));

  // Create a wobbel (iPad).
  app.post(
    '/api/wobbels',
    wrap(async (req, res) => {
      const result = validateWobbel(req.body);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const { wobbel, created } = await store.create(result.value);
      res.status(created ? 201 : 200).json(wobbel);
    })
  );

  // List wobbels (level and world screens poll this).
  // /api/wobbels?status=level&since=<id>
  app.get('/api/wobbels', (req, res) => {
    const status = req.query.status;
    if (status !== undefined && status !== 'level' && status !== 'world') {
      return res.status(400).json({ error: 'status must be "level" or "world".' });
    }
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    res.json(store.list(status, since));
  });

  // A wobbel reached the finish (level screen).
  app.post(
    '/api/wobbels/:id/finish',
    wrap(async (req, res) => {
      const wobbel = await store.finish(req.params.id);
      if (!wobbel) return res.status(404).json({ error: 'Wobbel not found.' });
      res.json(wobbel);
    })
  );

  // Clear today's data.
  app.post(
    '/admin/reset',
    wrap(async (req, res) => {
      res.json({ ok: true, ...(await store.reset()) });
    })
  );

  // ---------- Errors ----------
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Drawing is too big.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  return app;
}

function lanAddresses() {
  const list = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === 'IPv4' && !a.internal) list.push(a.address);
    }
  }
  return list;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Wobbel server is running on port ${port}.\n`);
    console.log('On this laptop:');
    for (const p of ['level', 'world', 'admin', 'draw']) console.log(`  http://localhost:${port}/${p}`);
    console.log('\nOn the iPad (same Wi-Fi network):');
    const ips = lanAddresses();
    if (ips.length === 0) console.log('  No network address found. Is the Wi-Fi connected?');
    for (const ip of ips) console.log(`  http://${ip}:${port}/draw`);
    console.log('\nStop the server with Ctrl+C.');
  });
}

module.exports = { createApp };
