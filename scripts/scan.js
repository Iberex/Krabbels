// Scans public/assets/puntje/ and writes public/assets/puntje/manifest.json.
// Each sub-folder is one animation; its frames are <folder>_00000.png, _00001.png, ...
// Usage: npm run scan

import { readdir, writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(root, 'public', 'assets', 'puntje');
const manifestPath = join(assetDir, 'manifest.json');

// Trailing frame number before .png, e.g. "11_springen_00042.png" -> 42.
const FRAME_RE = /_(\d+)\.png$/i;

async function scan() {
  await mkdir(assetDir, { recursive: true });

  const entries = await readdir(assetDir, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();

  const animations = {};
  for (const name of folders) {
    const files = (await readdir(join(assetDir, name)))
      .filter((f) => FRAME_RE.test(f))
      .sort((a, b) => Number(a.match(FRAME_RE)[1]) - Number(b.match(FRAME_RE)[1]));

    // Skip empty or still-rendering files (0 bytes).
    const ready = [];
    for (const f of files) {
      const { size } = await stat(join(assetDir, name, f));
      if (size > 0) ready.push(f);
    }

    if (ready.length > 0) animations[name] = ready;
  }

  // Per-animation crop offsets written by `npm run render` (optional).
  let crop = null;
  try {
    crop = JSON.parse(await readFile(join(assetDir, 'crop.json'), 'utf8'));
  } catch {
    /* no crop info: frames are used as-is with a bottom-centre origin */
  }

  const manifest = { generatedAt: new Date().toISOString(), animations, ...(crop ? { crop } : {}) };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const names = Object.keys(animations);
  console.log(`[scan] ${names.length} animation(s) found in public/assets/puntje/`);
  for (const n of names) console.log(`  ${n.padEnd(24)} ${animations[n].length} frames`);
  console.log(`[scan] wrote ${manifestPath}`);
}

scan().catch((err) => {
  console.error('[scan] failed:', err);
  process.exit(1);
});
