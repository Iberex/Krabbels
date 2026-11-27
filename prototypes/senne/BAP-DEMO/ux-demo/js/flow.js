// =====================================================================
// De flow: dezelfde toestanden als de Figma-kaart "Flow en toestanden (UX)".
// Eén gedeelde toestand S; tabbladen (muur, iPad, tv, alles) volgen elkaar via
// een BroadcastChannel. Wie een overgang maakt, stuurt de nieuwe toestand door.
// =====================================================================

export const STATES = {
  "1a": { dev: "muur", fase: 1, title: "Muur in rust" },
  "1b": { dev: "ipad", fase: 1, title: "iPad in rust" },
  "2a": { dev: "ipad", fase: 2, title: "Potlood doorgeven", dur: 2.6 },
  "2b": { dev: "ipad", fase: 2, title: "Tekenen" },
  "2c": { dev: "ipad", fase: 2, title: "Oogjes plakken" },
  "2d": { dev: "ipad", fase: 2, title: "Pok! Hij leeft", dur: 2.8 },
  "2e": { dev: "ipad", fase: 2, title: "Naar de muur", dur: 2.6 },
  "2x": { dev: "ipad", fase: 2, title: "Te lang niets", edge: true, dur: 4, back: "2b" },
  "3a": { dev: "muur", fase: 3, title: "In de rij", dur: 5 },
  "3b": { dev: "muur", fase: 3, title: "Jouw beurt" },
  "3x": { dev: "muur", fase: 3, title: "Niemand stapt in", edge: true, dur: 4, back: "3a" },
  "4a": { dev: "muur", fase: 4, title: "Dat ben jij: Puntje tekent je", dur: 5.6 },
  "4x": { dev: "muur", fase: 4, title: "Duo: één staat er", edge: true, back: "4a" },
  "5a": { dev: "muur", fase: 5, title: "Een gat", dur: 3.2 },
  "5b": { dev: "muur", fase: 5, title: "Puntje doet voor", dur: 4.6 },
  "5c": { dev: "muur", fase: 5, title: "Oefenen: elke beweging één keer" },
  "6a": { dev: "muur", fase: 6, title: "Komt eraan", dur: 2.4 },
  "6b": { dev: "muur", fase: 6, title: "Nu" },
  "6c": { dev: "muur", fase: 6, title: "Vasthouden" },
  "6d": { dev: "muur", fase: 6, title: "Gelukt", dur: 1.9 },
  "6e": { dev: "muur", fase: 6, title: "Lukt niet meteen", edge: true, dur: 3.6, back: "6b" },
  "6f": { dev: "muur", fase: 6, title: "Kind loopt weg", edge: true, back: "6b" },
  "7a": { dev: "muur", fase: 7, title: "De grootste kloof" },
  "7b": { dev: "muur", fase: 7, title: "Over de kloof", dur: 2.2 },
  "8a": { dev: "muur", fase: 8, title: "De deur", dur: 2.8 },
  "8b": { dev: "muur", fase: 8, title: "Weg!", dur: 2.4 },
  "8c": { dev: "muur", fase: 8, title: "Eindscherm", dur: 8 },
  "9a": { dev: "tv", fase: 9, title: "Jouw Krabbel komt binnen", dur: 5.5 },
  "9b": { dev: "tv", fase: 9, title: "Krabbelwereld", dur: 7 },
};

export const FASES = { 1: "Interesseren", 2: "Tekenen", 3: "Wachten", 4: "Instappen", 5: "Intro", 6: "Spelen", 7: "Finale", 8: "Ontsnapping", 9: "Weerzien" };

// Het parcours in de demo: één obstakel van elk.
export const COURSE = [
  { t: "verbinden", hold: 1.0 },
  { t: "ladder", hold: 1.0 },
  { t: "springen" },
  { t: "bukken" },
];
export const FINALE = { t: "verbinden", hold: 1.6, finale: true };
export const holds = (o) => o.t === "verbinden" || o.t === "ladder";

// Oefenen (5c): elke beweging één keer apart. Per stap: Puntje doet voor → jij → goed.
export const TUT = [
  { t: "verbinden", hold: 0.8 },
  { t: "ladder", hold: 0.8 },
  { t: "springen" },
  { t: "bukken" },
];
export const TUT_TIME = { voor: 2.8, goed: 1.6 };

// Uitzonderingen per fase (toets E)
export const EDGES = { 2: ["2x"], 3: ["3x"], 4: ["4x"], 6: ["6e", "6f"] };

// --- gedeelde toestand ---------------------------------------------------------
export const S = {
  id: "1a",
  t0: Date.now(), // when this state started (ms, shared between tabs)
  duo: false,
  obs: 0, // index in COURSE
  hold: 0, // 0..1 progress of holding a gesture (6c / 7a)
  runStart: 0,
  runEnd: 0,
  krabbel: null, // { img: dataURL, eyes, w, h } from the iPad
  rev: 0, // revision of the krabbel (so other tabs reload it)
  tut: 0, // step in the practice (5c)
  tutPhase: "voor", // voor | jij | goed
  tutT0: Date.now(),
};
export const tutSince = () => (Date.now() - S.tutT0) / 1000;
export const since = () => (Date.now() - S.t0) / 1000;
export const cur = () => STATES[S.id];
export const obstacle = () => (S.id === "7a" || S.id === "7b" ? FINALE : COURSE[Math.min(S.obs, COURSE.length - 1)]);

const listeners = new Set();
export const onChange = (f) => listeners.add(f);

let chan = null;
try {
  chan = new BroadcastChannel("krabbels-ux-demo");
  chan.onmessage = (e) => {
    const m = e.data;
    if (m.type === "state" && m.S.t0 >= S.t0 - 5) {
      const prev = S.id;
      Object.assign(S, m.S);
      listeners.forEach((f) => f(prev, S.id, true));
    } else if (m.type === "hello") post();
  };
  chan.postMessage({ type: "hello" });
} catch (e) {
  /* no BroadcastChannel: single tab */
}
function post() {
  if (chan) chan.postMessage({ type: "state", S: { ...S } });
}

const history = [];
export function go(id, extra = {}) {
  if (!STATES[id]) return;
  const prev = S.id;
  if (prev !== id) history.push({ id: prev, obs: S.obs });
  if (history.length > 80) history.shift();
  Object.assign(S, { id, t0: Date.now(), hold: 0 }, extra);
  if (id === "6a" && S.obs === 0 && !extra.keepRun) S.runStart = Date.now();
  if (id === "8a") S.runEnd = Date.now();
  if (id === "1a" || id === "1b") Object.assign(S, { obs: 0 });
  if (id === "5c") Object.assign(S, { tut: 0, tutPhase: "voor", tutT0: Date.now() });
  listeners.forEach((f) => f(prev, id, false));
  post();
}
export function back() {
  const h = history.pop();
  if (!h) return;
  Object.assign(S, { id: h.id, obs: h.obs, t0: Date.now(), hold: 0 });
  listeners.forEach((f) => f(null, S.id, false));
  post();
}
export function share(extra) {
  Object.assign(S, extra);
  post();
}

// De volgende toestand op het hoofdpad.
export function nextId() {
  const id = S.id, st = STATES[id];
  if (st.back) return st.back;
  switch (id) {
    case "1a": return "1b";
    case "1b": return "2a";
    case "2a": return "2b";
    case "2b": return "2c";
    case "2c": return "2d";
    case "2d": return "2e";
    case "2e": return "3a";
    case "3a": return "3b";
    case "3b": return S.duo ? "4x" : "4a";
    case "4a": return "5a";
    case "5a": return "5b";
    case "5b": return "5c";
    case "5c": return "6a";
    case "6a": return "6b";
    case "6b": return holds(obstacle()) ? "6c" : "6d";
    case "6c": return "6d";
    case "6d": return S.obs + 1 < COURSE.length ? "6a" : "7a";
    case "7a": return "7b";
    case "7b": return "8a";
    case "8a": return "8b";
    case "8b": return "8c";
    case "8c": return "9a";
    case "9a": return "9b";
    case "9b": return "1a";
  }
  return "1a";
}
// Practice: next phase / step. Returns false when the practice is done.
export function tutNext() {
  if (S.tutPhase === "voor") share({ tutPhase: "jij", tutT0: Date.now(), hold: 0 });
  else if (S.tutPhase === "jij") share({ tutPhase: "goed", tutT0: Date.now(), hold: 1 });
  else if (S.tut + 1 < TUT.length) share({ tut: S.tut + 1, tutPhase: "voor", tutT0: Date.now(), hold: 0 });
  else return false;
  return true;
}

export function next() {
  if (S.id === "5c" && tutNext()) return;
  const id = S.id, n = nextId();
  go(n, id === "6d" && n === "6a" ? { obs: S.obs + 1, keepRun: true } : {});
}
