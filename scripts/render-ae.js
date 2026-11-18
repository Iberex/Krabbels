// Renders every animation comp from an After Effects project to PNG frames
// with alpha, then crops each animation to its own bounding box (offsets go to
// crop.json so the anchor stays identical across animations).
//
// Usage:
//   npm run render -- /path/to/Potlood.aep            render all comps in src/animations.js
//   npm run render -- /path/to/Potlood.aep 11_springen 04_zwaaien   only these
//   npm run render -- --crop-only                      only redo the crop step
//
// Needs After Effects installed (uses its `aerender` CLI, headless — does not
// touch a project that is open in the After Effects app).

import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, rename, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { ANIMATIONS } from '../src/animations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(root, 'public', 'assets', 'puntje');
const cropInfoPath = join(assetDir, 'crop.json');
const PAD = 4; // px of transparent margin kept around each animation's bounding box

function findAerender() {
  const candidates = [2027, 2026, 2025, 2024].map((y) => `/Applications/Adobe After Effects ${y}/aerender`);
  return candidates.find((p) => existsSync(p));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let last = '';
    p.stdout.on('data', (d) => (last = d.toString().trim().split('\n').pop()));
    p.stderr.on('data', (d) => process.stderr.write(d));
    p.on('close', (code) => (code === 0 ? resolve(last) : reject(new Error(`${cmd} exited with ${code}: ${last}`))));
  });
}

async function renderComp(aerender, project, comp) {
  const tmp = join(tmpdir(), `puntje-render-${comp}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  const t0 = Date.now();
  await run(aerender, [
    '-project', project,
    '-comp', comp,
    '-OMtemplate', 'TIFF Sequence with Alpha',
    '-output', join(tmp, `${comp}_[#####].tif`),
  ]);

  // TIFF -> PNG (full size for now; cropped later), then drop the TIFFs.
  const out = join(assetDir, comp);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const tifs = (await readdir(tmp)).filter((f) => f.endsWith('.tif')).sort();
  for (const f of tifs) {
    await sharp(join(tmp, f)).png({ compressionLevel: 6 }).toFile(join(out, f.replace(/\.tif$/, '.png')));
  }
  await rm(tmp, { recursive: true, force: true });
  console.log(`[render] ${comp.padEnd(22)} ${tifs.length} frames  (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// Bounding box of non-transparent pixels in one frame.
async function alphaBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[row + x] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { w, h, x0, y0, x1, y1 };
}

// The comps contain a light-grey floor across the full width with Puntje's
// shadow on it. Remove it: plain floor -> transparent, darker grey (shadow) ->
// semi-transparent dark, coloured pixels (e.g. the eraser chip) stay.
// Detection: first row that is opaque and grey across the whole width.
const SAT_MAX = 18; // max(r,g,b)-min(r,g,b) below this counts as "grey"
const SHADOW_RGB = [60, 45, 35]; // warm dark shadow colour on the cream stage

async function findFloorRow(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  for (let y = 0; y < h; y++) {
    let ok = true;
    for (let x = 0; x < w; x += 8) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 250 || Math.max(r, g, b) - Math.min(r, g, b) > SAT_MAX) { ok = false; break; }
    }
    if (ok) {
      const i = (y * w + 4) * 4; // floor colour from near the left edge, a few rows down
      const j = (Math.min(h - 1, y + 10) * w + 4) * 4;
      return { row: y, lum: Math.max(data[i], data[j]) };
    }
  }
  return null;
}

async function removeFloor(file, floor) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  for (let y = Math.max(0, floor.row - 1); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a === 0 || Math.max(r, g, b) - Math.min(r, g, b) > SAT_MAX) continue; // keep coloured art
      // Grey over floor: darkness relative to the floor = shadow opacity.
      const lum = (r + g + b) / 3;
      const shade = Math.max(0, Math.min(1, 1 - lum / floor.lum)) * (a / 255);
      data[i] = SHADOW_RGB[0]; data[i + 1] = SHADOW_RGB[1]; data[i + 2] = SHADOW_RGB[2];
      data[i + 3] = shade < 0.02 ? 0 : Math.round(shade * 255 * 1.6 > 255 ? 255 : shade * 255 * 1.6);
    }
  }
  const tmp = file + '.tmp';
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(tmp);
  await rename(tmp, file);
}

// Clears grey pixels in rows that span the full frame width (the floor's edge
// line). Idempotent; coloured pixels are kept.
async function clearFullWidthRows(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let changed = false;
  for (let y = 0; y < h; y++) {
    let full = true;
    for (let x = 0; x < w; x += 8) {
      if (data[(y * w + x) * 4 + 3] <= 2) { full = false; break; }
    }
    if (!full) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) <= SAT_MAX || (r === SHADOW_RGB[0] && g === SHADOW_RGB[1] && b === SHADOW_RGB[2])) {
        // keep the part right under Puntje (the contact shadow), drop the long line
        if (Math.abs(x - w / 2) > 140) { data[i + 3] = 0; changed = true; }
      }
    }
  }
  if (!changed) return;
  const tmp = file + '.tmp';
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(tmp);
  await rename(tmp, file);
}

// Crops every animation to its own bounding box (union over its frames) and
// records where that box sits in comp space in crop.json. The demo uses those
// offsets to keep the comp's bottom-centre anchor in exactly the same place,
// so switching animations never moves Puntje — while each animation only
// uses the pixels it needs.
//
// Re-entrant: folders already cropped are measured again (no-op if tight);
// freshly rendered full-size folders start from offset (0, 0).
async function cropAll() {
  const folders = (await readdir(assetDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let info = null;
  try { info = JSON.parse(await readFile(cropInfoPath, 'utf8')); } catch {}

  const anims = {};
  let source = info?.source ?? null;
  let floorY = null; // floor line in comp space (where the shadow sits)

  for (const name of folders) {
    const dir = join(assetDir, name);
    const files = (await readdir(dir)).filter((n) => n.endsWith('.png')).sort().map((n) => join(dir, n));
    if (!files.length) continue;

    const { width: fw, height: fh } = await sharp(files[0]).metadata();

    const floor = await findFloorRow(files[0]);
    if (floor) {
      console.log(`[floor] ${name}: removing floor from row ${floor.row} (grey ${floor.lum})`);
      for (const f of files) await removeFloor(f, floor);
    }
    const floorRowInFile = floor?.row;
    if (fw === source?.width) for (const f of files) await clearFullWidthRows(f);

    // Where do the current files sit in comp space?
    let off = { left: 0, top: 0 };
    if (info?.anims?.[name] && info.anims[name].width === fw && info.anims[name].height === fh) {
      off = info.anims[name];
    } else if (info && !info.anims && info.width === fw && info.height === fh) {
      off = { left: info.left, top: info.top }; // old single-box format
    } else {
      source = { width: fw, height: fh }; // full-size render
    }

    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const f of files) {
      const b = await alphaBox(f);
      if (b.x1 < 0) continue;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; } // all transparent: keep 1px

    const box = {
      left: Math.max(0, x0 - PAD),
      top: Math.max(0, y0 - PAD),
    };
    box.width = Math.min(fw, x1 + 1 + PAD) - box.left;
    box.height = Math.min(fh, y1 + 1 + PAD) - box.top;

    if (box.width !== fw || box.height !== fh) {
      for (const f of files) {
        const tmp = f + '.tmp';
        await sharp(f).extract(box).png({ compressionLevel: 9 }).toFile(tmp);
        await rename(tmp, f);
      }
    }
    if (floorRowInFile != null && floorY == null) floorY = off.top + floorRowInFile;
    anims[name] = { left: off.left + box.left, top: off.top + box.top, width: box.width, height: box.height };
    console.log(`[crop] ${name.padEnd(22)} ${String(box.width).padStart(4)}×${String(box.height).padEnd(4)} at (${anims[name].left}, ${anims[name].top})`);
  }

  await writeFile(cropInfoPath, JSON.stringify({ source, floorY: floorY ?? info?.floorY ?? null, anims }, null, 2) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== '--crop-only') {
    const project = args[0];
    if (!project || !existsSync(project)) {
      console.error('Usage: npm run render -- /path/to/project.aep [comp ...]');
      process.exit(1);
    }
    const aerender = findAerender();
    if (!aerender) throw new Error('aerender not found in /Applications/Adobe After Effects <year>/');
    const comps = args.length > 1 ? args.slice(1) : ANIMATIONS.map((a) => a.key);
    await mkdir(assetDir, { recursive: true });
    for (const comp of comps) {
      try {
        await renderComp(aerender, project, comp);
      } catch (err) {
        console.error(`[render] ${comp} FAILED: ${err.message}`);
      }
    }
  }
  await cropAll();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
