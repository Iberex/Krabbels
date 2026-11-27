// Keeps today's wobbels in memory and in one JSON file per day.
// File: data/wobbels-YYYY-MM-DD.json  ->  { day, epoch, wobbels: [...] }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function localDay() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// getDay can be replaced in tests to simulate a new day.
const WOBBELS_PER_CHUNK = 16; // the world tower grows one chunk (one screen) per this many wobbels

function createStore(dataDir, getDay = localDay) {
  fs.mkdirSync(dataDir, { recursive: true });

  let state = null; // { day, epoch, wobbels, nextSeq, nextWorldSeq }
  let writeQueue = Promise.resolve();

  const fileFor = (day) => path.join(dataDir, `wobbels-${day}.json`);

  // The epoch changes on a reset and on a new day. Screens use it to know
  // that they must throw away what they show and load the list again.
  const newEpoch = (day) => `${day}_${crypto.randomBytes(3).toString('hex')}`;

  function load(day) {
    const file = fileFor(day);
    let wobbels = [];
    let epoch = newEpoch(day);
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && Array.isArray(raw.wobbels)) {
        wobbels = raw.wobbels;
        if (typeof raw.epoch === 'string') epoch = raw.epoch;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Unreadable file: keep it for inspection and start empty.
        console.error(`Could not read ${file}: ${err.message}`);
        try {
          fs.renameSync(file, `${file}.broken-${Date.now()}`);
        } catch (_) {}
      }
    }
    const max = (key) => wobbels.reduce((m, w) => Math.max(m, w[key] || 0), 0);
    return { day, epoch, wobbels, nextSeq: max('seq') + 1, nextWorldSeq: max('worldSeq') + 1 };
  }

  // Called on every request, so a server that runs past midnight starts a new, empty day.
  function current() {
    const day = getDay();
    if (!state || state.day !== day) state = load(day);
    return state;
  }

  // Safe write: write a temp file first, then rename it over the real file.
  // Writes are queued so two requests can never write at the same time.
  function save() {
    const s = current();
    const file = fileFor(s.day);
    const json = JSON.stringify({ day: s.day, epoch: s.epoch, wobbels: s.wobbels });
    writeQueue = writeQueue.then(async () => {
      const tmp = `${file}.tmp`;
      await fs.promises.writeFile(tmp, json);
      for (let attempt = 1; ; attempt++) {
        try {
          await fs.promises.rename(tmp, file);
          return;
        } catch (err) {
          // On Windows a virus scanner can lock the file for a moment.
          if (attempt >= 5) throw err;
          await sleep(60 * attempt);
        }
      }
    });
    const done = writeQueue;
    writeQueue = writeQueue.catch((err) => console.error(`Save failed: ${err.message}`));
    return done;
  }

  function newId(wobbels) {
    for (;;) {
      const id = `w_${crypto.randomBytes(3).toString('hex')}`;
      if (!wobbels.some((w) => w.id === id)) return id;
    }
  }

  async function create({ strokes, stickers, fill, clientId }) {
    const s = current();
    if (clientId) {
      // The iPad retries with the same clientId. Never store the same wobbel twice.
      const existing = s.wobbels.find((w) => w.clientId === clientId);
      if (existing) return { wobbel: existing, created: false };
    }
    const wobbel = {
      id: newId(s.wobbels),
      createdAt: new Date().toISOString(),
      status: 'level',
      strokes,
      stickers,
      seq: s.nextSeq++,
    };
    if (fill) wobbel.fill = fill;
    if (clientId) wobbel.clientId = clientId;
    s.wobbels.push(wobbel);
    await save();
    return { wobbel, created: true };
  }

  async function finish(id) {
    const s = current();
    const wobbel = s.wobbels.find((w) => w.id === id);
    if (!wobbel) return null;
    if (wobbel.status !== 'world') {
      wobbel.status = 'world';
      wobbel.finishedAt = new Date().toISOString();
      wobbel.worldSeq = s.nextWorldSeq++;
      // Home zone in the world tower: chunk 0 is the bottom. The first wobbels of the day live
      // at the bottom, later ones higher up. Stored here, so it stays the same after a reload.
      wobbel.home = Math.floor((wobbel.worldSeq - 1) / WOBBELS_PER_CHUNK);
      await save();
    }
    return wobbel;
  }

  // status: "level" or "world" (or undefined for all).
  // sinceId: only wobbels that came after this one. Unknown id -> everything.
  function list(status, sinceId) {
    const s = current();
    const orderKey = status === 'world' ? 'worldSeq' : 'seq';
    let after = 0;
    if (sinceId) {
      const since = s.wobbels.find((w) => w.id === sinceId);
      if (since && since[orderKey]) after = since[orderKey];
    }
    const wobbels = s.wobbels
      .filter((w) => (!status || w.status === status) && (w[orderKey] || 0) > after)
      .sort((a, b) => a[orderKey] - b[orderKey]);
    return { epoch: s.epoch, day: s.day, wobbels };
  }

  async function reset() {
    const s = current();
    s.wobbels = [];
    s.nextSeq = 1;
    s.nextWorldSeq = 1;
    s.epoch = newEpoch(s.day);
    await save();
    return { epoch: s.epoch, day: s.day };
  }

  function info() {
    const s = current();
    return {
      ok: true,
      day: s.day,
      epoch: s.epoch,
      level: s.wobbels.filter((w) => w.status === 'level').length,
      world: s.wobbels.filter((w) => w.status === 'world').length,
    };
  }

  return { create, finish, list, reset, info };
}

module.exports = { createStore };
