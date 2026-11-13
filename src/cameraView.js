// =====================================================================
// cameraView.js - the small camera window top right + its labels.
//   Femto:  the IR image (black and white), same sensor as the depth image -> skeleton fits exactly
//   Webcam: the colour image, from the same camera MediaPipe looks at
// =====================================================================

import { cam, MIRROR, SOURCE_NAME } from './camera.js';

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const label = document.getElementById('preview-label');

const BONES = [
  ['head', 'neck'], ['neck', 'pelvis'],
  ['neck', 'shoulder_left'], ['shoulder_left', 'elbow_left'], ['elbow_left', 'wrist_left'],
  ['neck', 'shoulder_right'], ['shoulder_right', 'elbow_right'], ['elbow_right', 'wrist_right'],
  ['pelvis', 'hip_left'], ['hip_left', 'knee_left'], ['knee_left', 'ankle_left'],
  ['pelvis', 'hip_right'], ['hip_right', 'knee_right'], ['knee_right', 'ankle_right'],
];

export function drawPreview() {
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // image, "cover" fit, mirrored like the game
  const img = cam.image;
  const [iw, ih] = imageDims(img);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale, dx = (w - dw) / 2, dy = (h - dh) / 2;
  ctx.save();
  if (MIRROR) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  if (img && iw > 1) ctx.drawImage(img, dx, dy, dw, dh);

  // skeletons on top (joints2d are 0..1 on the same image)
  ctx.strokeStyle = '#2f6bff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const p of cam.players) {
    const pt = (n) => p.joints2d[n] && [dx + p.joints2d[n][0] * dw, dy + p.joints2d[n][1] * dh];
    ctx.beginPath();
    for (const [a, b] of BONES) {
      const A = pt(a), B = pt(b);
      if (!A || !B) continue;
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0], B[1]);
    }
    ctx.stroke();
  }
  ctx.restore();

  label.innerHTML = `${SOURCE_NAME}<br>${Math.round(cam.fps)} fps · ${Math.round(cam.latencyMs)} ms · ${cam.players.length} speler(s)`;
}

function imageDims(img) {
  if (!img) return [cam.imageSize[0], cam.imageSize[1]];
  if (img instanceof HTMLVideoElement) return [img.videoWidth || 1, img.videoHeight || 1];
  return [img.width, img.height];
}
