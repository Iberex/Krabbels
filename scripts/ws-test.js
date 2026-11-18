// Tiny WebSocket test server that pretends to be the Femto Bolt tracker.
// Sends a random animation every 4 s to every connected demo.
// Usage: npm run ws-test   (then open the demo)

import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMATIONS, EVENTS } from '../src/animations.js';

const PORT = 8765;
const INTERVAL_MS = 4000;

// Prefer animations that are actually rendered; fall back to the full list.
function availableKeys() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'puntje', 'manifest.json');
    const keys = Object.keys(JSON.parse(readFileSync(path, 'utf8')).animations ?? {});
    if (keys.length) return keys;
  } catch {
    /* no manifest yet */
  }
  return ANIMATIONS.map((a) => a.key);
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[ws-test] listening on ws://localhost:${PORT}`);

wss.on('connection', (socket) => {
  console.log(`[ws-test] client connected (${wss.clients.size} total)`);
  socket.on('message', (data) => console.log('[ws-test] received:', data.toString()));
  socket.on('close', () => console.log(`[ws-test] client left (${wss.clients.size} total)`));
});

setInterval(() => {
  if (wss.clients.size === 0) return;

  // Mostly {"anim": ...}; every third message uses the {"event": ...} form.
  let msg;
  if (Math.random() < 0.33) {
    const names = Object.keys(EVENTS);
    msg = { event: names[Math.floor(Math.random() * names.length)] };
  } else {
    const keys = availableKeys();
    msg = { anim: keys[Math.floor(Math.random() * keys.length)] };
  }

  const text = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
  console.log('[ws-test] sent', text);
}, INTERVAL_MS);
