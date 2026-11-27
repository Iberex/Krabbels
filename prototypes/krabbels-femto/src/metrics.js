// =====================================================================
// metrics.js - the comparison test (T) and the results table (U).
//
//   T  countdown (get in place) -> measure for a few seconds -> one row in the table
//   U  show / hide the table      X  clear all rows (only while the table is open)
//
// Rows are kept in localStorage. Both sources run on the same address (localhost:8090),
// so the table shows Femto and webcam rows together.
// =====================================================================

import { cam, onFrame, SOURCE_NAME } from './camera.js';

export const TEST = {
  countdownS: 8,       // time to get in place
  measureS: 5,         // time to stand still with arms sideways
  storageKey: 'krabbels-vergelijk-resultaten',
};

const el = {
  message: document.getElementById('message'),
  results: document.getElementById('results'),
};

let phase = 'idle';     // idle | countdown | measure
let phaseEnd = 0;
let acc = null;         // accumulator while measuring
const memory = [];      // fallback when localStorage is blocked

// --------------------------------------------------------------------------------------------
export function startTest() {
  hideResults();
  phase = 'countdown';
  phaseEnd = performance.now() + TEST.countdownS * 1000;
}

export function testRunning() {
  return phase !== 'idle';
}

export function toggleResults() {
  if (el.results.hidden) showResults();
  else hideResults();
}

export function clearResults() {
  if (el.results.hidden) return;
  save([]);
  showResults();
}

// called every animation frame by main.js
export function updateTest(now) {
  if (phase === 'countdown') {
    const left = Math.ceil((phaseEnd - now) / 1000);
    showMessage(`Test ${SOURCE_NAME} start over ${left}...<br>Ga op je plek staan: armen opzij en stilstaan!`, false);
    if (now >= phaseEnd) {
      phase = 'measure';
      phaseEnd = now + TEST.measureS * 1000;
      acc = { t0: now, frames: 0, players: 0, latency: 0, bridge: 0, seen: 0, jitter: 0, jitterN: 0, prev: [] };
    }
  } else if (phase === 'measure') {
    const left = Math.ceil((phaseEnd - now) / 1000);
    showMessage(`Meten... nog ${left} s<br>Blijf stilstaan met je armen opzij`, true);
    if (now >= phaseEnd) finish(now);
  }
}

// every skeleton frame from the source (not every screen frame)
onFrame((players, latencyMs) => {
  if (phase !== 'measure' || !acc) return;
  acc.frames++;
  acc.players += players.length;
  acc.latency += latencyMs;
  if (players.length) {
    acc.seen++;
    if (players.every((p) => p.bridge)) acc.bridge++;
  }
  // jitter: how far the wrist jumps between two frames, relative to the shoulder,
  // in % of the arm length. Standing still => this is pure noise.
  players.forEach((p, i) => {
    const now = [wristRel(p.left), wristRel(p.right)];
    const prev = acc.prev[i];
    if (prev) {
      for (let k = 0; k < 2; k++) {
        const armLen = k === 0 ? p.left.length : p.right.length;
        if (armLen > 0.05) {
          acc.jitter += Math.hypot(now[k][0] - prev[k][0], now[k][1] - prev[k][1], now[k][2] - prev[k][2]) / armLen;
          acc.jitterN++;
        }
      }
    }
    acc.prev[i] = now;
  });
  acc.prev.length = players.length;
});

const wristRel = (a) => [a.wrist[0] - a.shoulder[0], a.wrist[1] - a.shoulder[1], a.wrist[2] - a.shoulder[2]];

function finish(now) {
  phase = 'idle';
  hideMessage();
  const a = acc;
  acc = null;
  if (!a || a.seen === 0) {
    flash('Geen enkel skelet gezien: test niet bewaard.');
    return;
  }
  const seconds = (now - a.t0) / 1000;
  const rows = load();
  rows.push({
    tijd: new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
    bron: SOURCE_NAME,
    spelers: a.players / a.frames,
    fps: a.frames / seconds,
    ms: a.latency / a.frames,
    brug: (100 * a.bridge) / a.seen,
    trillen: a.jitterN ? (100 * a.jitter) / a.jitterN : NaN,
  });
  save(rows);
  showResults();
}

// --------------------------------------------------------------------------------------------
function showResults() {
  const rows = load();
  const nl = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '-');
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  let txt = `${pad('tijd', 6)}${pad('bron', 22)}${lpad('spelers', 8)}${lpad('fps', 6)}${lpad('ms', 6)}${lpad('brug', 7)}${lpad('trillen', 9)}\n`;
  if (!rows.length) txt += '(nog geen tests - druk T)\n';
  for (const r of rows) {
    txt += `${pad(r.tijd, 6)}${pad(r.bron, 22)}${lpad(nl(r.spelers, 1), 8)}${lpad(nl(r.fps, 0), 6)}${lpad(nl(r.ms, 0), 6)}` +
      `${lpad(nl(r.brug, 0) + '%', 7)}${lpad(nl(r.trillen, 1) + '%', 9)}\n`;
  }
  el.results.innerHTML =
    `<h2>Resultaten</h2><pre>${escapeHtml(txt)}</pre>` +
    `<pre class="legend">fps: hoger = vloeiender   ms: lager = sneller   brug: hoger = beter\n` +
    `trillen: lager = rustiger (% van de armlengte)\n\n` +
    `T = nieuwe test   U = verbergen   X = alles wissen   W = andere bron</pre>`;
  el.results.hidden = false;
}

function hideResults() {
  el.results.hidden = true;
}

function showMessage(html, measuring) {
  el.message.innerHTML = html;
  el.message.classList.toggle('measuring', measuring);
  el.message.hidden = false;
}

function hideMessage() {
  el.message.hidden = true;
}

function flash(text) {
  showMessage(text, false);
  setTimeout(() => { if (phase === 'idle') hideMessage(); }, 3000);
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(TEST.storageKey)) || memory;
  } catch {
    return memory;
  }
}

function save(rows) {
  rows = [...rows]; // rows may be `memory` itself
  memory.length = 0;
  memory.push(...rows);
  try {
    localStorage.setItem(TEST.storageKey, JSON.stringify(rows));
  } catch { /* private window: keep in memory */ }
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
