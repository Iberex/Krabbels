// =====================================================================
// Krabbels testdemo: camera, pose model and gesture recognition.
// Up to 2 players. Player 1 is whoever stands left (mirrored, as seen on
// screen), player 2 stands right.
//
// Per player we recognise:
//   arms     : both arms stretched in one line -> its angle in degrees
//              (positive = rising to the right). Used to CONNECT two points.
//   ladder   : both arms straight up.
//   ducking  : shoulders clearly lower than normal.
//   jumpAt   : time (ms) of the last jump (hips quickly higher than normal).
// =====================================================================

export const POSE = {
  visionBundleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
  wasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  modelUrl:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  cameraWidth: 1280,
  cameraHeight: 720,

  minVisibility: 0.5, // landmarks below this count as "not seen"
  smoothing: 0.45, // 0..1, higher = follows faster, more jitter
  xGain: 1.3, // how far the silhouette moves on screen per step

  // Arms in one line (connect)
  minArmSpread: 1.8, // wrists at least this many shoulder widths apart
  straightTolerance: 35, // degrees each arm may bend away from the wrist line

  // Ladder
  ladderMinAngle: 65, // both arms steeper than this, wrists above the nose

  // Duck / jump: how far the shoulders move from their normal height,
  // in shoulder widths (so it works for small and tall kids, near or far).
  duckIn: 0.5, // shoulders this much lower than normal = ducking
  duckOut: 0.3,
  jumpIn: 0.22, // shoulders this much higher than normal = a jump
  jumpOut: 0.1,
  baselineFollow: 0.04, // how fast "normal height" follows you while standing still
  baselineDrift: 0.004, // ...and how slowly otherwise
  learnMs: 1000, // first ms after appearing: learn the normal height fast
  maxJumpMs: 900, // longer "in the air" = not a jump, re-measure
  maxDuckMs: 6000, // longer ducking = re-measure

  // Hand in hand (duo bridges / ramps), in shoulder widths, on the camera image
  handOuterReach: 0.8, // each outer hand at least this far beyond its own shoulders
  handTouch: 1.2, // the two inner hands closer than this = holding hands
};

const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const deg = (r) => (r * 180) / Math.PI;
const vis = (l) => l.visibility ?? 1;

function angleBetween(u, v) {
  const d = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
  return deg(Math.acos(clamp(d, -1, 1)));
}

// ---------------------------------------------------------------------
// Camera + model
// ---------------------------------------------------------------------
export async function initCamera(video, say) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    say("camera", "<strong>Geen camera beschikbaar.</strong><br>Open de pagina via https (GitHub Pages) of via localhost (Live Server).", true);
    return false;
  }
  say("camera", "Wachten op toestemming voor de camera…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: POSE.cameraWidth }, height: { ideal: POSE.cameraHeight }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    say("camera", null);
    stream.getVideoTracks()[0].addEventListener("ended", () => say("camera", "<strong>De camera is gestopt.</strong> Herlaad de pagina.", true));
    return true;
  } catch (err) {
    let t = `<strong>De camera start niet.</strong><br>${err.name}: ${err.message}`;
    if (err.name === "NotAllowedError") t = "<strong>De camera is geblokkeerd.</strong><br>Klik op het camera-icoon in de adresbalk, sta toe en herlaad.";
    if (err.name === "NotFoundError") t = "<strong>Geen camera gevonden.</strong><br>Sluit een webcam aan en herlaad.";
    if (err.name === "NotReadableError") t = "<strong>De camera wordt gebruikt door een andere app</strong> (Teams, Zoom…). Sluit die en herlaad.";
    say("camera", t + "<br><small>Je kan het spel ook testen met het toetsenbord (zie menu).</small>", true);
    return false;
  }
}

export async function initPose(say) {
  say("model", "Herkenning laden…");
  try {
    const { FilesetResolver, PoseLandmarker } = await import(POSE.visionBundleUrl);
    const fileset = await FilesetResolver.forVisionTasks(POSE.wasmUrl);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: POSE.modelUrl, delegate },
      runningMode: "VIDEO",
      numPoses: 2,
    });
    let lm;
    try {
      lm = await PoseLandmarker.createFromOptions(fileset, opts("GPU"));
    } catch (e) {
      console.warn("GPU niet beschikbaar, CPU wordt gebruikt", e);
      lm = await PoseLandmarker.createFromOptions(fileset, opts("CPU"));
    }
    say("model", null);
    return lm;
  } catch (err) {
    say("model", `<strong>De herkenning laadt niet.</strong><br>Check de internetverbinding en herlaad.<br><small>${err.message || err}</small>`, true);
    return null;
  }
}

// ---------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------
function newPlayer(slot) {
  return {
    slot, // 0 = player 1, 1 = player 2
    present: false,
    lms: null, // smoothed landmarks, camera coords (x scaled to the image aspect)
    body: null, // screen positions of the joints
    cx: 0, // screen x of the body centre
    torso: 1, // torso length in camera coords
    baseSh: null, // normal shoulder height (camera y)
    baseHip: null, // normal hip height (camera y)
    arms: null, // angle in degrees, or null when the arms are not in one line
    ladder: false,
    ducking: false,
    duckAt: -1e9, // last time ducking was seen (ms)
    jumping: false,
    jumpAt: -1e9, // time of the last jump (ms)
    lift: 0, // debug: current hip lift / shoulder drop in torso lengths
    drop: 0,
  };
}

export class Tracker {
  constructor() {
    this.players = [newPlayer(0), newPlayer(1)];
    this.count = 0;
  }

  reset() {
    this.players = [newPlayer(0), newPlayer(1)];
  }

  // result: PoseLandmarker result. duo: track 2 players or 1.
  // view: { W, H, floor, figure } figure = on-screen body height (feet to head) in px.
  update(result, video, duo, view, now) {
    const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    let poses = (result && result.landmarks) || [];
    poses = poses.filter((p) => vis(p[L.lSh]) >= POSE.minVisibility && vis(p[L.rSh]) >= POSE.minVisibility);

    if (!duo && poses.length > 1) {
      // Solo: keep the person closest to the camera (widest shoulders).
      poses.sort((a, b) => dist(b[L.lSh], b[L.rSh]) - dist(a[L.lSh], a[L.rSh]));
      poses = [poses[0]];
    }
    // Sort by mirrored x: left on screen = player 1.
    poses.sort((a, b) => (1 - (a[L.lHip].x + a[L.rHip].x) / 2) - (1 - (b[L.lHip].x + b[L.rHip].x) / 2));
    if (!duo) poses = poses.slice(0, 1);
    this.count = poses.length;

    this.players.forEach((p, i) => {
      const raw = poses[i];
      if (!raw || (!duo && i > 0)) {
        if (p.present) Object.assign(p, newPlayer(i));
        return;
      }
      const pts = raw.map((l) => ({ x: l.x * aspect, y: l.y, v: vis(l) }));
      if (!p.present || !p.lms) {
        p.lms = pts;
        p.baseSh = null;
        p.baseHip = null;
      } else {
        const s = POSE.smoothing;
        pts.forEach((l, k) => {
          const q = p.lms[k];
          q.x += (l.x - q.x) * s;
          q.y += (l.y - q.y) * s;
          q.v += (l.v - q.v) * s;
        });
      }
      p.present = true;
      this.measure(p, pts, aspect, view, now);
    });
  }

  measure(p, raw, aspect, view, now) {
    const m = p.lms;
    const shMid = mid(m[L.lSh], m[L.rSh]);
    const hipMid = mid(m[L.lHip], m[L.rHip]);
    p.torso = Math.max(0.02, dist(shMid, hipMid));

    // --- normal height + duck / jump ---------------------------------
    // Measured on the SHOULDERS (always in view, also on a laptop webcam
    // where the hips are often cut off), from the raw landmarks (no smoothing
    // lag, so a short jump is not flattened). Unit: shoulder widths.
    const shRaw = (raw[L.lSh].y + raw[L.rSh].y) / 2;
    p.shW = Math.max(0.02, dist(m[L.lSh], m[L.rSh]));
    if (p.baseSh === null) {
      p.baseSh = shRaw;
      p.seenSince = now;
    }
    // The first second after appearing (walking in, settling): learn fast.
    if (now - p.seenSince < POSE.learnMs) p.baseSh += (shRaw - p.baseSh) * 0.25;
    p.drop = (shRaw - p.baseSh) / p.shW; // + = lower than normal
    p.lift = -p.drop; // + = higher than normal

    if (!p.ducking && p.drop > POSE.duckIn) {
      p.ducking = true;
      p.duckSince = now;
    } else if (p.ducking && p.drop < POSE.duckOut) p.ducking = false;
    if (p.ducking) p.duckAt = now;

    // Arms going up lifts the shoulders a bit: no jumps during the ladder pose.
    const armsUp = m[L.lWr].y < m[L.nose].y && m[L.rWr].y < m[L.nose].y;
    if (!p.jumping && p.lift > POSE.jumpIn && !armsUp) {
      p.jumping = true;
      p.jumpAt = now;
    } else if (p.jumping && p.lift < POSE.jumpOut) p.jumping = false;

    // Stuck "higher than normal" for too long is not a jump: the normal height
    // was wrong (e.g. you stepped closer). Same for ducking much too long.
    if (p.jumping && now - p.jumpAt > POSE.maxJumpMs) {
      p.jumping = false;
      p.baseSh = shRaw;
    }
    if (p.ducking && now - p.duckSince > POSE.maxDuckMs) {
      p.ducking = false;
      p.baseSh = shRaw;
    }

    // Follow the normal height: steadily while standing normally, very
    // slowly otherwise (so a wrong start value always corrects itself).
    const k = !p.ducking && !p.jumping && Math.abs(p.drop) < POSE.jumpOut ? POSE.baselineFollow : POSE.baselineDrift;
    p.baseSh += (shRaw - p.baseSh) * k;

    // --- screen body: mirrored, fixed size, moves up/down with duck/jump
    const { W, floor, figure } = view;
    const s = (figure * 0.3) / p.torso; // torso = 30% of the figure height
    const mirroredX = 1 - hipMid.x / aspect;
    p.cx = clamp(W / 2 + (mirroredX - 0.5) * W * POSE.xGain, 0, W);
    const hipScreenY = floor - figure * 0.47 + (shMid.y - p.baseSh) * s;
    const toScreen = (q) => ({ x: p.cx - (q.x - hipMid.x) * s, y: hipScreenY + (q.y - hipMid.y) * s });
    const b = {};
    for (const [name, idx] of Object.entries(L)) b[name] = toScreen(m[idx]);
    // Legs not seen: hang them straight down to the floor.
    for (const side of ["l", "r"]) {
      const kn = m[L[side + "Kn"]], an = m[L[side + "An"]];
      if (kn.v < POSE.minVisibility || an.v < POSE.minVisibility) {
        const hip = b[side + "Hip"];
        const footY = Math.max(hip.y + figure * 0.2, floor + (shMid.y - p.baseSh) * s);
        b[side + "Kn"] = { x: hip.x, y: (hip.y + footY) / 2 };
        b[side + "An"] = { x: hip.x, y: footY };
      }
    }
    p.body = b;

    // --- gestures (screen space, uniform scale so angles are true) ----
    p.ladder = isLadder(b);
    p.arms = p.ladder ? null : armLine(b);
  }
}

function isLadder(b) {
  const arms = [
    { sh: b.lSh, wr: b.lWr },
    { sh: b.rSh, wr: b.rWr },
  ];
  return arms.every((a) => {
    const rise = a.sh.y - a.wr.y;
    return rise > 0 && deg(Math.atan2(rise, Math.abs(a.wr.x - a.sh.x))) > POSE.ladderMinAngle && a.wr.y < b.nose.y;
  });
}

// Angle of the line through both stretched arms, or null.
function armLine(b) {
  const A = [
    { sh: b.lSh, wr: b.lWr },
    { sh: b.rSh, wr: b.rWr },
  ];
  const [left, right] = A[0].wr.x < A[1].wr.x ? A : [A[1], A[0]];
  const shW = Math.max(1, dist(b.lSh, b.rSh));
  if (dist(left.wr, right.wr) < POSE.minArmSpread * shW) return null;
  const line = { x: right.wr.x - left.wr.x, y: right.wr.y - left.wr.y };
  const tol = POSE.straightTolerance;
  if (angleBetween({ x: right.wr.x - right.sh.x, y: right.wr.y - right.sh.y }, line) > tol) return null;
  if (angleBetween({ x: left.wr.x - left.sh.x, y: left.wr.y - left.sh.y }, { x: -line.x, y: -line.y }) > tol) return null;
  return deg(Math.atan2(-line.y, line.x)); // + = rising to the right
}

// Two players hand in hand, measured on the camera image (real proportions,
// mirrored like the screen). Returns null, or { angle, touching }:
//   angle    : line from the outer hand of the left player to the outer hand
//              of the right player, in degrees (+ = rising to the right)
//   touching : the two inner hands are together
// null when both outer arms are not stretched outwards.
export function handInHand(players) {
  const [a, b] = players;
  if (!a.present || !b.present || !a.lms || !b.lms) return null;
  const P = (p, k) => ({ x: -p.lms[k].x, y: p.lms[k].y, v: p.lms[k].v });
  const shX = (p) => (P(p, L.lSh).x + P(p, L.rSh).x) / 2;
  const [Lp, Rp] = shX(a) <= shX(b) ? [a, b] : [b, a];
  const sw = (Lp.shW + Rp.shW) / 2 || 0.05;
  const wrists = (p) => [P(p, L.lWr), P(p, L.rWr)].sort((m, n) => m.x - n.x);
  const [Lout, Lin] = wrists(Lp);
  const [Rin, Rout] = wrists(Rp);
  if (Lout.v < POSE.minVisibility || Rout.v < POSE.minVisibility) return null;
  const LshMin = Math.min(P(Lp, L.lSh).x, P(Lp, L.rSh).x);
  const RshMax = Math.max(P(Rp, L.lSh).x, P(Rp, L.rSh).x);
  if (LshMin - Lout.x < POSE.handOuterReach * sw || Rout.x - RshMax < POSE.handOuterReach * sw) return null;
  const touching = Math.hypot(Lin.x - Rin.x, Lin.y - Rin.y) < POSE.handTouch * sw;
  return { angle: deg(Math.atan2(-(Rout.y - Lout.y), Rout.x - Lout.x)), touching };
}
