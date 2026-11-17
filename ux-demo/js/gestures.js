// =====================================================================
// Gebaren: camera (pose.js) + toetsen, samengebracht.
// Toetsen (ingedrukt houden): B armen wijd · L armen omhoog · K bukken · N hand in hand
// Kort: J springen · P iemand in beeld aan/uit
// =====================================================================
import { Tracker, initCamera, initPose, handInHand } from "./pose.js?v=20261117c";

export const tracker = new Tracker();
const sim = { arms: false, ladder: false, duck: false, hand: false, jumpAt: -1e9, present: false };
let landmarker = null, lastVideo = -1, cameraOn = false, seenAt = -1e9;

export function startCamera(video, say) {
  initCamera(video, say).then((ok) => (cameraOn = !!ok)).catch(() => {});
  initPose(say).then((lm) => (landmarker = lm));
}

export function updateCamera(video, duo, view, now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideo) return;
  lastVideo = video.currentTime;
  try {
    tracker.update(landmarker.detectForVideo(video, now), video, duo, view, now);
    if (tracker.players.some((p) => p.present)) seenAt = now;
  } catch (e) {
    console.error(e);
  }
}

export const SIM_KEYS = { b: "arms", l: "ladder", k: "duck", n: "hand" };
export function keyDown(key, now) {
  if (SIM_KEYS[key]) { sim[SIM_KEYS[key]] = true; sim.present = true; return true; }
  if (key === "j") { sim.jumpAt = now; sim.present = true; return true; }
  if (key === "p") { sim.present = !sim.present; return true; }
  return false;
}
export function keyUp(key) {
  if (SIM_KEYS[key]) sim[SIM_KEYS[key]] = false;
}

// What the children do right now. i = player (0 or 1).
export function player(i, now) {
  const p = tracker.players[i];
  const present = p.present || sim.present;
  return {
    present,
    body: p.present ? p.body : null,
    cx: p.present ? p.cx : null,
    arms: sim.arms ? 0 : p.present ? p.arms : null,
    ladder: sim.ladder || (p.present && p.ladder),
    duck: sim.duck || (p.present && p.ducking),
    jumped: (since) => Math.max(sim.jumpAt, p.jumpAt) >= since,
  };
}
export function together() {
  if (sim.hand) return { angle: 0, touching: true };
  return handInHand(tracker.players);
}
export const anyonePresent = () => sim.present || tracker.players.some((p) => p.present);
export const cameraActive = () => !!landmarker && cameraOn;
export const lastSeen = () => seenAt;
export const simState = sim;
