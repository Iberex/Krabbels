// =====================================================================
// sources/webcam.js - SOURCE 2: an ordinary webcam + MediaPipe Pose in the browser.
// We use the COLOUR camera of the Femto Bolt as webcam (same place and device as source 1:
// fair comparison). No Femto (e.g. on a Mac)? Then it takes the first webcam.
//
// Contract (same as sources/femto.js): start(cb), then
//   cb.frame(bodies, imageSize, latencyMs), cb.image(video), cb.status({connected, text})
// =====================================================================

const VERSION = '1.1.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const LOCAL = new URL('../../vendor/mediapipe/', import.meta.url).href; // filled by tools/haal_mediapipe.py

const CONFIG = {
  // "full" is more accurate than "lite"; replace full by lite (2x faster) to test quicker.
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  numPoses: 2,           // look for at most this many people
  camera: /rgb|color/i,  // which camera (label); the Femto is called "Orbbec Femto Bolt RGB Camera"
  width: 1280,
  height: 720,
  fps: 30,
};

// What the browser says when the camera does not open, in plain words
const CAMERA_ERRORS = {
  NotReadableError: 'camera is bezet door een ander programma of tabblad (sluit dat eerst, ook de brug)',
  NotAllowedError: 'geen toestemming voor de camera (klik op het camera-icoon in de adresbalk)',
  NotFoundError: 'geen camera gevonden',
  OverconstrainedError: 'de camera kan geen 1280x720 aan 30 fps',
};

// MediaPipe landmark index -> same name as the Femto bridge
const POINTS = {
  nose: 0, ear_left: 7, ear_right: 8,
  shoulder_left: 11, shoulder_right: 12, elbow_left: 13, elbow_right: 14, wrist_left: 15, wrist_right: 16,
  hip_left: 23, hip_right: 24, knee_left: 25, knee_right: 26, ankle_left: 27, ankle_right: 28,
};

export async function start(cb) {
  // 1) load MediaPipe + model (first time ~10 MB, then from cache). Local copy first, else CDN.
  cb.status({ connected: false, text: 'MediaPipe laden...' });
  let landmarker, device;
  try {
    const local = await exists(LOCAL + 'vision_bundle.mjs');
    const base = local ? LOCAL : CDN + '/';
    const { FilesetResolver, PoseLandmarker } = await import(local ? LOCAL + 'vision_bundle.mjs' : CDN + '/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(base + 'wasm');
    const model = local && (await exists(LOCAL + 'pose_landmarker_full.task')) ? LOCAL + 'pose_landmarker_full.task' : CONFIG.model;
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numPoses: CONFIG.numPoses,
    });
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, options('GPU')); // on the graphics card
      device = 'videokaart';
    } catch {
      landmarker = await PoseLandmarker.createFromOptions(vision, options('CPU'));
      device = 'processor';
    }
  } catch (error) {
    cb.status({ connected: false, text: `MediaPipe laden mislukt (${error.message}). Internet? Of draai tools/haal_mediapipe.py` });
    return;
  }

  // 2) open the camera (prefer the Femto colour camera)
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  try {
    video.srcObject = await openCamera();
    await video.play();
  } catch (error) {
    cb.status({ connected: false, text: CAMERA_ERRORS[error.name] || `camera openen mislukt (${error.message})` });
    return;
  }
  cb.image(video);
  cb.status({ connected: true, text: `verbonden (${video.videoWidth}x${video.videoHeight}, MediaPipe op ${device})` });

  // 3) send every new camera frame through MediaPipe
  const onFrame = () => {
    const t0 = performance.now();
    const result = landmarker.detectForVideo(video, t0);
    const latency = performance.now() - t0;
    const bodies = (result.landmarks || []).map((lm, i) => toBody(lm, result.worldLandmarks?.[i], i));
    cb.frame(bodies, [video.videoWidth, video.videoHeight], latency);
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}

async function openCamera() {
  const want = { width: { ideal: CONFIG.width }, height: { ideal: CONFIG.height }, frameRate: { ideal: CONFIG.fps } };
  // ask permission once, so the camera names become visible
  let stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const femto = devices.find((d) => /femto|orbbec/i.test(d.label) && CONFIG.camera.test(d.label));
  const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (femto && femto.deviceId !== current) {
    stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { ...want, deviceId: { exact: femto.deviceId } }, audio: false });
  }
  return stream;
}

// One MediaPipe person -> same format as the Femto
function toBody(lm, world, index) {
  const joints = {};     // metres (MediaPipe estimates this, with the middle of the hips as 0,0,0)
  const joints2d = {};   // 0..1 on the camera image
  const confidence = {}; // MediaPipe "visibility" 0..1
  for (const [name, i] of Object.entries(POINTS)) {
    const p = lm[i];
    const w = world ? world[i] : null;
    joints2d[name] = [p.x, p.y];
    joints[name] = w ? [w.x, w.y, w.z] : [p.x, p.y, p.z];
    confidence[name] = p.visibility ?? 1;
  }
  // Points MediaPipe does not have but the Femto does: middle of two other points
  const between = (a, b, out) => {
    joints[out] = joints[a].map((v, k) => (v + joints[b][k]) / 2);
    joints2d[out] = joints2d[a].map((v, k) => (v + joints2d[b][k]) / 2);
    confidence[out] = Math.min(confidence[a], confidence[b]);
  };
  between('shoulder_left', 'shoulder_right', 'neck');
  between('hip_left', 'hip_right', 'pelvis');
  between('ear_left', 'ear_right', 'head');
  between('neck', 'pelvis', 'chest');
  return { id: index + 1, joints, joints2d, confidence };
}

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}
