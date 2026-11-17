// =====================================================================
// Krabbels UX-demo (grijs). De volledige flow van de installatie:
// iPad → muur → tv, met alle toestanden van de Figma-kaart "Flow en toestanden (UX)".
//
// ?view=alles  één scherm met de hele flow (pitch, opnemen)
// ?view=muur   beamer (met camera)    ?view=ipad  tekenen    ?view=tv  uitgang
//
// Regie: → volgende · ← terug · 1–9 fase · E uitzondering · D duo · R opnieuw · H regie verbergen · F volledig scherm
// Gebaren zonder camera (ingedrukt houden): B armen wijd · L armen omhoog · K bukken · N hand in hand · J springen · P iemand in beeld
// =====================================================================
import { K, rr, text, clamp } from "./kit.js?v=20261117c";
import { S, STATES, FASES, EDGES, COURSE, FINALE, TUT, TUT_TIME, since, tutSince, tutNext, cur, go, next, back, share, onChange, obstacle, holds } from "./flow.js?v=20261117c";
import * as G from "./gestures.js?v=20261117c";
import { ready as spritesReady } from "./sprites.js?v=20261117c";
import { voorbeeld, vanTekening } from "./krabbel.js?v=20261117c";
import { drawMuur, W as MW, H as MH } from "./muur.js?v=20261117c";
import { drawIpad, ipadPointer, resetDrawing, sampleDrawing, exportKrabbel, W as IW, H as IH } from "./ipad.js?v=20261117c";
import { drawTv } from "./tv.js?v=20261117c";

const $ = (id) => document.getElementById(id);
const canvas = $("scherm"), ctx = canvas.getContext("2d"), video = $("webcam");
const VIEW = new URLSearchParams(location.search).get("view");
const CAMERA_VIEWS = ["alles", "muur"];

if (!VIEW) $("kies").hidden = false;

// --- messages --------------------------------------------------------------------
const msgs = {};
function say(key, html) {
  if (html) msgs[key] = html; else delete msgs[key];
  const el = $("bericht"), all = Object.values(msgs);
  el.innerHTML = all.join("<br>");
  el.classList.toggle("zicht", all.length > 0);
}

// --- size ----------------------------------------------------------------------
let CW = 0, CH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  CW = innerWidth; CH = innerHeight;
  canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH * DPR);
}
addEventListener("resize", resize);
resize();

// Which device to show, and where (fit in the window).
function device() {
  const dev = cur().dev;
  if (VIEW === "muur") return "muur";
  if (VIEW === "ipad") return "ipad";
  if (VIEW === "tv") return "tv";
  return dev;
}
// In "alles" every device is drawn as what it is: an iPad, a projection on the wall, a tv.
const MOCK = { ipad: [0.84, 0.76, 0.02], muur: [0.88, 0.74, 0.03], tv: [0.74, 0.62, -0.03] }; // avail w, avail h, y shift
function frameFor(dev) {
  const w = dev === "ipad" ? IW : MW, h = dev === "ipad" ? IH : MH;
  const mock = VIEW === "alles";
  const [aw, ah, dy] = mock ? MOCK[dev] : [1, 1, 0];
  const s = Math.min((CW * aw) / w, (CH * ah) / h);
  return { s, x: (CW - w * s) / 2, y: (CH - h * s) / 2 + CH * dy, w, h, mock, dev };
}
const LABEL = { ipad: "iPad · tekenen", muur: "Muur · beamer", tv: "Tv · uitgang" };
function deviceMock(f) {
  const W = f.w * f.s, H = f.h * f.s, u = Math.min(CW, CH) / 100;
  ctx.fillStyle = f.dev === "muur" ? "#dcdcdc" : K.vlak;
  ctx.fillRect(0, 0, CW, CH);
  if (f.dev === "ipad") {
    const pad = 2.6 * u;
    rr(ctx, f.x - pad, f.y - pad, W + pad * 2, H + pad * 2, 4 * u);
    ctx.fillStyle = K.inkt; ctx.fill();
  } else if (f.dev === "muur") {
    // a wall of the booth with the projection on it, the beamer above
    ctx.fillStyle = "#e6e6e6"; ctx.fillRect(f.x - 4 * u, 0, W + 8 * u, f.y + H + 3 * u);
    ctx.fillStyle = "#cfcfcf"; ctx.fillRect(0, f.y + H + 3 * u, CW, CH);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 3 * u; ctx.fillStyle = "#fff"; ctx.fillRect(f.x, f.y, W, H); ctx.restore();
    const bx = CW / 2, by = Math.max(1.4 * u, f.y - 7 * u);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = "#fff8d0";
    ctx.beginPath(); ctx.moveTo(bx - 2 * u, by + 2 * u); ctx.lineTo(f.x, f.y); ctx.lineTo(f.x + W, f.y); ctx.lineTo(bx + 2 * u, by + 2 * u); ctx.closePath(); ctx.fill(); ctx.restore();
    rr(ctx, bx - 4 * u, by - 1.2 * u, 8 * u, 3.4 * u, 0.8 * u); ctx.fillStyle = K.inkt; ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by + 2.2 * u, 1 * u, 0, Math.PI * 2); ctx.fillStyle = "#777"; ctx.fill();
  } else {
    const pad = 1.6 * u;
    ctx.fillStyle = K.inkt;
    ctx.fillRect(CW / 2 - 1.5 * u, f.y + H, 3 * u, 7 * u);
    rr(ctx, CW / 2 - 14 * u, f.y + H + 6.5 * u, 28 * u, 1.6 * u, 0.8 * u); ctx.fill();
    rr(ctx, f.x - pad, f.y - pad, W + pad * 2, H + pad * 2, 1.2 * u); ctx.fill();
  }
  // label above the device
  const lab = LABEL[f.dev], fs = Math.max(12, 1.9 * u);
  ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(lab).width, lx = f.x + W - tw - 2.4 * fs, ly = f.dev === "muur" ? f.y - 2.4 * fs : f.y - 2.4 * u - 2.2 * fs;
  rr(ctx, lx, ly, tw + 1.6 * fs, 1.7 * fs, 0.85 * fs); ctx.fillStyle = K.inkt; ctx.fill();
  text(ctx, lab, lx + 0.8 * fs, ly + 0.87 * fs, fs, "#fff", "left", 700);
}

// --- Krabbels ---------------------------------------------------------------------
const others = [1, 2, 4, 5, 6, 8].map((n) => voorbeeld(n));
const second = voorbeeld(11, K.donker);
const fallback = voorbeeld(3);
let mine = fallback, mineRev = -1;
function myKrabbel() {
  if (S.krabbel && S.rev !== mineRev) { mine = vanTekening(S.krabbel); mineRev = S.rev; }
  if (!S.krabbel) mine = fallback;
  return mine;
}

// --- flow events ------------------------------------------------------------------
let exported = false, idleSince = performance.now(), noGestureSince = performance.now(), lostSince = 0;
const drawsHere = () => VIEW === "alles" || VIEW === "ipad";
onChange((prev, id, remote) => {
  noGestureSince = performance.now();
  if (!drawsHere()) return;
  if (id === "2a" && prev !== "2x") { resetDrawing(); exported = false; }
  if (id === "2b") idleSince = performance.now();
  if (id === "2c") sampleDrawing();
  if ((id === "2d" || id === "2e" || id === "3a") && !exported && !remote) { exportKrabbel(); exported = true; }
});
const _exp = exportKrabbel;

// --- logic ----------------------------------------------------------------------
let holdShared = 0;
function setHold(v) {
  S.hold = clamp(v, 0, 1);
  if (Math.abs(S.hold - holdShared) > 0.05 || S.hold === 0 || S.hold === 1) { holdShared = S.hold; share({ hold: S.hold }); }
}
function gestureOk(o, p, now) {
  if (!p || !p.present) return false;
  if (o.finale && S.duo) { const h = G.together(); return !!h && h.touching && Math.abs(h.angle) <= 16; }
  if (o.t === "verbinden") return p.arms !== null && p.arms !== undefined && Math.abs(p.arms) <= 16;
  if (o.t === "ladder") return p.ladder;
  if (o.t === "springen") return p.jumped(now - 900);
  if (o.t === "bukken") return p.duck;
  return false;
}
function update(dt, now) {
  const st = cur(), t = since();
  // timed states
  if (st.dur && t >= st.dur) return next();
  const gesturesHere = CAMERA_VIEWS.includes(VIEW);
  const players = [G.player(0, now), G.player(1, now)];
  const owner = S.duo ? S.obs % 2 : 0;
  const p = players[owner].present ? players[owner] : players[0];

  if (S.id === "2b" && drawsHere() && now - idleSince > 45000) go("2x");
  if (!gesturesHere && S.id !== "5c") return;

  if (S.id === "3b") {
    if (G.anyonePresent() && t > 0.8) return next();
    if (t > 20) return go("3x");
  }
  if (S.id === "4x" && players[0].present && players[1].present) return go("4a");
  if (S.id === "5c") {
    const step = TUT[S.tut], ts = tutSince();
    if (S.tutPhase === "voor" && ts >= TUT_TIME.voor) return tutNext();
    if (S.tutPhase === "goed" && ts >= TUT_TIME.goed) return next();
    if (S.tutPhase === "jij" && gesturesHere) {
      const ok = gestureOk(step, p, now);
      if (step.hold) { setHold(S.hold + (ok ? dt / step.hold : -dt * 1.5)); if (S.hold >= 1) return tutNext(); }
      else if (ok) return tutNext();
    }
    return;
  }

  const o = obstacle();
  if (S.id === "6b") {
    if (gestureOk(o, p, now)) { noGestureSince = now; return next(); }
    if (now - noGestureSince > 7000) return go("6e");
  }
  if (S.id === "6c" || (S.id === "7a" && t > 1.6)) {
    const ok = gestureOk(o, p, now), need = o.hold || 1;
    setHold(S.hold + (ok ? dt / need : -dt * 1.5));
    if (ok) noGestureSince = now;
    if (S.hold >= 1) return next();
    if (S.id === "6c" && S.hold === 0 && now - noGestureSince > 1500) return go("6b");
  }
  // somebody walked away (only with a camera)
  if (G.cameraActive() && [6].includes(st.fase) && S.id !== "6f") {
    if (!G.anyonePresent()) { if (!lostSince) lostSince = now; if (now - lostSince > 4000) { lostSince = 0; return go("6f"); } } else lostSince = 0;
  }
  if (S.id === "6f" && G.anyonePresent() && t > 1) return go("6b");
}

// --- draw ------------------------------------------------------------------------
function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#e9e9e9";
  ctx.fillRect(0, 0, CW, CH);
  if (!VIEW) return;
  const dev = device(), f = frameFor(dev);
  const env = { t: since(), now, st: cur(), duo: S.duo, mine: myKrabbel(), others, second, players: [G.player(0, now), G.player(1, now)], hand: S.duo && !!(G.together() && G.together().touching) };
  // which state does this device show when the flow is elsewhere?
  const real = S.id, st = cur();
  const showId = st.dev === dev ? real : dev === "ipad" ? "1b" : dev === "tv" ? "9b" : "1a";
  if (f.mock) deviceMock(f);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.s, f.s);
  ctx.beginPath(); ctx.rect(0, 0, f.w, f.h); ctx.clip();
  S.id = showId;
  const e = showId === real ? env : { ...env, t: (now / 1000) % 60 };
  try {
    if (dev === "ipad") drawIpad(ctx, e);
    else if (dev === "tv") drawTv(ctx, e);
    else drawMuur(ctx, e);
  } finally {
    S.id = real;
    ctx.restore();
  }
}

// --- regie overlay -------------------------------------------------------------------
let regieOn = true;
function renderRegie() {
  const el = $("regie");
  el.hidden = !regieOn || !VIEW;
  if (el.hidden) return;
  const st = cur(), o = st.fase === 6 ? ` · obstakel ${S.obs + 1}/${COURSE.length} (${obstacle().t})` : S.id === "5c" ? ` · oefening ${S.tut + 1}/${TUT.length} (${TUT[S.tut].t}) · ${S.tutPhase === "voor" ? "Puntje doet voor" : S.tutPhase === "jij" ? "jouw beurt" : "goed!"}` : "";
  el.innerHTML = `<b>${S.id} · ${st.title}</b> <span class="dim">${st.dev}${st.edge ? " · uitzondering" : ""}</span><br>
  <span class="dim">Fase ${st.fase} ${FASES[st.fase]}${o}${S.duo ? " · duo" : " · solo"}</span><br>
  <kbd>→</kbd> volgende <kbd>←</kbd> terug <kbd>1</kbd>–<kbd>9</kbd> fase <kbd>E</kbd> uitzondering <kbd>D</kbd> duo <kbd>R</kbd> opnieuw <kbd>H</kbd> verberg<br>
  <span class="dim">Gebaren: <kbd>B</kbd> armen wijd <kbd>L</kbd> omhoog <kbd>J</kbd> spring <kbd>K</kbd> buk <kbd>N</kbd> hand in hand <kbd>P</kbd> in beeld</span>`;
}

// --- input -----------------------------------------------------------------------
const FIRST = { 1: "1a", 2: "1b", 3: "3a", 4: "4a", 5: "5a", 6: "6a", 7: "7a", 8: "8a", 9: "9a" };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase(), now = performance.now();
  if (e.repeat && !G.SIM_KEYS[k]) return;
  if (G.keyDown(k, now)) return;
  if (k === "arrowright" || k === " ") { e.preventDefault(); next(); }
  else if (k === "arrowleft") back();
  else if (FIRST[k]) go(FIRST[k], k === "6" ? { obs: 0 } : {});
  else if (k === "e") { const list = EDGES[cur().fase]; if (list) { const i = list.indexOf(S.id); go(list[(i + 1) % list.length]); } }
  else if (k === "d") share({ duo: !S.duo });
  else if (k === "r") { resetDrawing(); exported = false; share({ krabbel: null, rev: S.rev + 1, runStart: 0, runEnd: 0 }); go("1a"); }
  else if (k === "h") regieOn = !regieOn;
  else if (k === "f") { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
});
addEventListener("keyup", (e) => G.keyUp(e.key.toLowerCase()));

function toIpad(ev) {
  if (device() !== "ipad") return null;
  const f = frameFor("ipad");
  return [(ev.clientX - f.x) / f.s, (ev.clientY - f.y) / f.s];
}
canvas.addEventListener("pointerdown", (ev) => { const p = toIpad(ev); if (!p) { if (cur().id === "1a" && VIEW === "alles") next(); return; } canvas.setPointerCapture(ev.pointerId); ipadPointer("down", p[0], p[1], performance.now()); idleSince = performance.now(); });
canvas.addEventListener("pointermove", (ev) => { const p = toIpad(ev); if (p) ipadPointer("move", p[0], p[1], performance.now()); });
canvas.addEventListener("pointerup", (ev) => { const p = toIpad(ev); if (p) ipadPointer("up", p[0], p[1], performance.now()); });

// --- loop ------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (VIEW && CAMERA_VIEWS.includes(VIEW)) G.updateCamera(video, S.duo, { W: MW, H: MH, floor: 1040, figure: 640 }, now);
  try {
    if (VIEW) update(dt, now);
    draw(now);
  } catch (err) {
    console.error(err);
  }
  renderRegie();
  requestAnimationFrame(frame);
}

spritesReady.then(() => requestAnimationFrame(frame));
if (VIEW && CAMERA_VIEWS.includes(VIEW) && location.protocol !== "file:") G.startCamera(video, say);
if (location.protocol === "file:") say("file", "<strong>Open deze pagina via een server</strong> (VS Code → Live Server, of GitHub Pages).");

// For testing in the console
window.ux = { S, go, next, back, share, G, exportKrabbel: _exp };
