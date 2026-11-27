// =====================================================================
// Link with the wobbel hub (demo-ipad\hub, port 3000).
//
//   iPad /draw  ->  hub (status "game")  ->  THIS GAME  ->  POST /finish  ->  /world
//
// - Polls GET {HUB}/api/wobbels?status=game once per second.
// - The waiting wobbel with the lowest seq becomes the Krabbel.
// - lock() at the start of a round: the Krabbel does not change during a round.
// - finishCurrent() at the end of a round: the wobbel goes to /world, the next one is taken.
// - unlock() when a round is stopped (Esc): the wobbel stays in the queue.
// - A new epoch (reset on /admin, new day) stops the round: onReset().
// - The drawing code (stickers.js + wobbel.js) is loaded from the hub, never copied.
//
// Address options: ?hub=http://192.168.1.20:3000
// =====================================================================

export const HUB = (new URLSearchParams(location.search).get("hub") || "http://localhost:3000").replace(/\/+$/, "");

// Size of the wobbel compared with the old placeholder Krabbel (1 = same height as the body + legs).
export const SIZE = 2.6;

export const hub = {
  connected: false,
  text: "verbinden met de hub...",
  queue: [], // wobbels with status "game", in START order
  drawing: [], // iPads where START was tapped and the drawing is not sent yet: [{ clientId, startedAt }]
  current: null, // the wobbel that is (or will be) the Krabbel
  partner: null, // second drawing: the two children play together (duo), both Krabbels walk
  locked: false,
  epoch: null,
  onReset: null, // set by the game: called when /admin resets during a round
};

const finished = new Set(); // ids sent to /world, maybe not yet processed by the hub
// Drawings that were already waiting when the game (re)loaded: skipped. After a refresh the game waits
// for a new START, it never grabs an old drawing. null = first poll not done yet.
let skipped = null;
const fresh = (w) => !finished.has(w.id) && skipped !== null && !skipped.has(w.id);

// ---------------------------------------------------------------------
// Drawing code from the hub
// ---------------------------------------------------------------------
let scriptsReady = false;
let scriptsLoading = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => {
      el.remove();
      reject(new Error(src));
    };
    document.head.appendChild(el);
  });
}

async function loadDrawingCode() {
  if (scriptsReady || scriptsLoading) return;
  scriptsLoading = true;
  try {
    if (!window.STICKERS) await loadScript(`${HUB}/shared/stickers.js`);
    if (!window.Wobbel) await loadScript(`${HUB}/shared/wobbel.js`);
    scriptsReady = !!(window.STICKERS && window.Wobbel);
  } catch (_) {
    // hub not running yet: the next poll tries again
  } finally {
    scriptsLoading = false;
  }
}

// ---------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------
// Order = when START was tapped on the iPad (startedAt), or when the drawing arrived (older hub / no START).
const startOf = (x) => Date.parse(x.startedAt || x.createdAt) || 0;

// Who is still drawing (not yet in the queue).
function stillDrawing() {
  const sent = new Set(hub.queue.map((w) => w.clientId).filter(Boolean)); // includes skipped ones: they are not "drawing"
  return hub.drawing.filter((d) => !sent.has(d.clientId));
}

// While anyone is still drawing, nothing starts: the children who tapped START play together.
// Nobody drawing: the 2 oldest drawings (START order) play together, 1 drawing plays alone.
// An iPad that goes quiet (20 s) or throws its drawing away drops out of hub.drawing by itself.
function pick() {
  if (hub.locked) return;
  const ready = hub.queue.filter(fresh);
  const busy = stillDrawing().length > 0;
  hub.current = busy ? null : ready[0] || null;
  hub.partner = busy ? null : ready[1] || null;
}

async function poll() {
  await loadDrawingCode();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${HUB}/api/wobbels?status=game`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (hub.epoch && data.epoch !== hub.epoch) {
      // Reset on /admin (or a new day): forget everything.
      finished.clear();
      skipped = new Set();
      hub.queue = [];
      const wasLocked = hub.locked;
      hub.locked = false;
      hub.current = null;
      hub.partner = null;
      if (wasLocked && hub.onReset) hub.onReset();
    }
    hub.epoch = data.epoch;
    hub.queue = (data.wobbels || []).slice().sort((a, b) => startOf(a) - startOf(b) || a.seq - b.seq);
    hub.drawing = Array.isArray(data.drawing) ? data.drawing : [];
    if (skipped === null) skipped = new Set(hub.queue.map((w) => w.id));
    // Ids that the hub no longer lists as "game" are really done.
    for (const id of finished) if (!hub.queue.some((w) => w.id === id)) finished.delete(id);
    pick();
    hub.connected = true;
    const waiting = hub.queue.filter(fresh).length;
    const busy = stillDrawing().length;
    hub.text = [
      waiting ? `${waiting} Krabbel${waiting === 1 ? "" : "s"} klaar` : "",
      busy ? `${busy} aan het tekenen` : "",
    ].filter(Boolean).join(" · ") || "Druk op START op de iPad";
  } catch (_) {
    hub.connected = false;
    hub.text = `geen hub op ${HUB} (draait npm start?)`;
  } finally {
    clearTimeout(timer);
  }
}

(async function loop() {
  for (;;) {
    await poll();
    await new Promise((r) => setTimeout(r, 1000));
  }
})();

// Text for the wait screen of the game: [big line, small line].
export function waitLines() {
  if (!hub.connected) return ["Even geduld...", "Het spel zoekt de iPad-hub"];
  const ready = hub.queue.filter(fresh).length;
  const busy = stillDrawing().length;
  if (busy && ready) {
    return [
      ready === 1 ? "Eén Krabbel is klaar" : `${ready} Krabbels zijn klaar`,
      busy === 1 ? "Wachten op de andere tekening... dan spelen jullie samen" : `Wachten op ${busy} tekeningen... dan spelen jullie samen`,
    ];
  }
  if (busy === 1) return ["Je Krabbel wordt getekend...", "Het spel begint als je tekening klaar is"];
  if (busy > 1) return [`${busy} Krabbels worden getekend...`, "Als iedereen klaar is, spelen jullie samen"];
  return ["Druk op START op de iPad", "en teken je Krabbel"];
}

// ---------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------
export function lock() {
  pick();
  hub.locked = true;
}

export function unlock() {
  hub.locked = false;
  pick();
}

// End of a round (finished, failed or time up): the Krabbel goes to /world.
export function finishCurrent() {
  const done = hub.locked ? [hub.current, hub.partner].filter(Boolean) : [];
  hub.locked = false;
  for (const w of done) {
    finished.add(w.id);
    sendToWorld(w.id);
  }
  hub.current = null;
  hub.partner = null;
  pick();
}

// Solo round while a second drawing is there (manual solo, ?auto=0): the second one waits in the queue.
export function dropPartner() {
  hub.partner = null;
}

async function sendToWorld(id) {
  const epoch = hub.epoch;
  for (;;) {
    if (hub.epoch !== epoch) return; // reset in the meantime
    try {
      const res = await fetch(`${HUB}/api/wobbels/${encodeURIComponent(id)}/finish`, { method: "POST" });
      if (res.ok || res.status === 404) return; // 404 = reset in the meantime
    } catch (_) {
      /* network error: try again */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------------------------------------------------------------------
// Draw the current wobbel as the Krabbel.
//   k       the Krabbel state of the game (state: walk | wait | duck | jump | climb | bonk | fall)
//   x       middle, in canvas pixels
//   ground  where the feet are, in canvas pixels
//   height  height of the old placeholder Krabbel (body + legs), in canvas pixels
//   walking true while it walks
// Returns false when there is no wobbel (yet): then the game draws the placeholder.
// ---------------------------------------------------------------------
const looks = new Map(); // per wobbel id: bounds, sprite, gait, eye animation, walk phase

export function drawWobbelKrabbel(ctx, k, x, ground, height, walking, timeMs) {
  const Wobbel = window.Wobbel;
  if (!hub.current || !scriptsReady || !Wobbel) return false;
  // Duo: the second Krabbel walks just behind the first one and does the same moves.
  if (hub.partner) drawOne(Wobbel, hub.partner, ctx, k, x - height * SIZE * 0.75, ground, height, walking, timeMs);
  return drawOne(Wobbel, hub.current, ctx, k, x, ground, height, walking, timeMs);
}

function drawOne(Wobbel, w, ctx, k, x, ground, height, walking, timeMs) {
  try {
    let look = looks.get(w.id);
    if (!look) {
      if (looks.size > 20) looks.clear();
      const bounds = Wobbel.boundsOf(w);
      look = { id: w.id, bounds, gait: Wobbel.gaitOf(w), anim: Wobbel.makeAnim(), phase: 0, t: timeMs, sprite: null, spriteR: 0 };
      looks.set(w.id, look);
    }
    const dt = Math.min(0.1, Math.max(0, (timeMs - look.t) / 1000));
    look.t = timeMs;
    const r = (height * SIZE * Wobbel.fitScale(look.bounds)) / Wobbel.heightOf(w);
    const minLine = 2.5 / r; // lines at least 2.5 px
    const pixelR = r * Math.min(window.devicePixelRatio || 1, 2);
    if (!look.spriteR || Math.abs(pixelR / look.spriteR - 1) > 0.2) {
      look.sprite = Wobbel.makeSprite(w, pixelR, minLine) || false;
      look.spriteR = pixelR;
    }
    Wobbel.updateAnim(look.anim, dt, true);

    const g = look.gait;
    const o = {
      x, y: ground, r, sprite: look.sprite, dir: 1, minLine,
      phase: look.phase, moving: 0, bob: 0, sx: 1, sy: 1,
      blink: look.anim.blink, lookX: look.anim.lookX, lookY: look.anim.lookY,
    };
    if (walking) {
      look.phase += dt * g.stepHz * Math.PI * 2;
      o.moving = 1;
      o.bob = -Math.abs(Math.sin(look.phase)) * g.bounce;
      o.sy = 1 + Math.cos(look.phase * 2) * g.squash;
    }
    if (k.state === "duck") o.sy = 0.68;
    else if (k.state === "jump") {
      o.sy = 1.12;
      o.moving = 0.4;
    } else if (k.state === "climb") o.moving = 0.6;
    else if (k.state === "wait") {
      o.lookX = 1; // looks at the obstacle
      o.lookY = 0.3;
    }
    o.sx = 2 - o.sy;
    Wobbel.draw(ctx, w, o);
    return true;
  } catch (err) {
    console.warn("Krabbel tekenen mislukt, placeholder:", err);
    return false;
  }
}
