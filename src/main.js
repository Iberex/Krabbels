import Phaser from 'phaser';
import { ANIMATIONS, FPS, HOTKEYS, IDLE, INTRO, findAnimation } from './animations.js';
import { connectTracking } from './tracking.js';

const WIDTH = 1920;
const HEIGHT = 1080;
const BG_COLOR = '#f7e7cd';
const GROUND_Y = 950; // y of the soft ground line (Puntje's floor)
const TOP_MARGIN = 30;
const ASSET_ROOT = 'assets/puntje';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $info = document.getElementById('info');
const $message = document.getElementById('message');
const $buttons = document.getElementById('buttons');
const $speed = document.getElementById('speed');
const $speedValue = document.getElementById('speed-value');
const $pause = document.getElementById('pause');
const $forceLoop = document.getElementById('force-loop');
const $tracker = document.getElementById('tracker');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  manifest: {}, // { animKey: [file, ...] } from manifest.json
  crop: null, // { source, floorY, anims: { key: {left, top, width, height} } } in comp pixels
  available: new Set(), // anims that loaded at least one frame
  current: null, // key of the animation that is playing
  paused: false,
  forceLoop: false,
  speed: 1,
  trackerConnected: false,
};

/** @type {Phaser.GameObjects.Sprite | null} */
let sprite = null;
const buttonEls = new Map(); // key -> <button>

// Table animations first (in order), then any extra folders found by the scan.
function allAnimations() {
  const extras = Object.keys(state.manifest)
    .filter((k) => !findAnimation(k))
    .sort()
    .map((k) => ({ key: k, label: k, loop: false }));
  return [...ANIMATIONS, ...extras];
}

function defOf(key) {
  return allAnimations().find((a) => a.key === key);
}

// ---------------------------------------------------------------------------
// State machine – the one entry point used by buttons, keys and the tracker.
// ---------------------------------------------------------------------------
export function playAnim(name) {
  const def = defOf(name);
  if (!def || !sprite || !state.available.has(name)) return false;

  const repeat = def.loop || state.forceLoop ? -1 : 0;

  // Re-selecting the running loop does nothing (no restart, no hitch).
  if (state.current === name && repeat === -1 && sprite.anims.isPlaying) return true;

  // Same comp anchor for every animation => switching never moves Puntje.
  applyOrigin(name);
  sprite.play({ key: name, repeat });
  sprite.anims.timeScale = state.speed;
  state.current = name;
  setPaused(false);
  syncButtons();
  return true;
}

// Frames are cropped per animation. The origin is the comp's anchor point
// (horizontal centre, floor line) expressed relative to that animation's crop box,
// so the anchor lands on the same screen spot for every animation.
function applyOrigin(name) {
  const box = state.crop?.anims?.[name];
  if (!box) {
    sprite.setOrigin(0.5, 1);
    return;
  }
  const ax = state.crop.source.width / 2;
  const ay = state.crop.floorY ?? state.crop.source.height;
  sprite.setOrigin((ax - box.left) / box.width, (ay - box.top) / box.height);
}

function returnToIdle() {
  if (!playAnim(IDLE)) {
    // No idle rendered yet: hold the last frame of whatever just finished.
    state.current = null;
    syncButtons();
  }
}

function onAnimationComplete(anim) {
  if (anim.key !== state.current) return;
  const def = defOf(anim.key);
  if (def && !def.loop && !state.forceLoop) returnToIdle();
}

function setPaused(paused) {
  state.paused = paused;
  if (sprite) {
    if (paused) sprite.anims.pause();
    else if (sprite.anims.isPaused) sprite.anims.resume();
  }
  $pause.classList.toggle('paused', paused);
  $pause.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
}

function togglePause() {
  if (!sprite || !state.current) return;
  setPaused(!state.paused);
}

function setSpeed(value) {
  state.speed = value;
  $speedValue.textContent = `${parseFloat(value.toFixed(2))}×`;
  if (sprite) sprite.anims.timeScale = value;
}

function setForceLoop(on) {
  state.forceLoop = on;
  $forceLoop.classList.toggle('on', on);
  $forceLoop.setAttribute('aria-pressed', String(on));
  const def = state.current && defOf(state.current);
  if (!sprite || !def || def.loop) return;

  // Re-start the running one-shot from its current frame with the new repeat value.
  const frameIndex = sprite.anims.currentFrame ? sprite.anims.currentFrame.index - 1 : 0;
  const wasPaused = state.paused;
  applyOrigin(state.current);
  sprite.play({ key: state.current, repeat: on ? -1 : 0, startFrame: frameIndex });
  sprite.anims.timeScale = state.speed;
  setPaused(wasPaused);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function buildButtons() {
  $buttons.replaceChildren();
  buttonEls.clear();

  allAnimations().forEach((def, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.anim = def.key;
    btn.title = def.key;

    const hotkey = HOTKEYS[i];
    if (hotkey) {
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = hotkey;
      btn.append(k);
    }
    btn.append(def.label);
    if (def.loop) {
      const l = document.createElement('span');
      l.className = 'loop-mark';
      l.textContent = '↻';
      l.title = 'loop';
      btn.append(l);
    }

    if (!state.available.has(def.key)) {
      btn.disabled = true;
      btn.title = `${def.key} – not rendered yet`;
      const m = document.createElement('span');
      m.className = 'missing';
      m.textContent = 'not rendered yet';
      btn.append(m);
    }

    btn.addEventListener('click', () => {
      playAnim(def.key);
      btn.blur(); // keep Space for pause, not for re-clicking
    });

    $buttons.append(btn);
    buttonEls.set(def.key, btn);
  });
}

function syncButtons() {
  for (const [key, btn] of buttonEls) btn.classList.toggle('on', key === state.current);
}

function updateInfo() {
  $tracker.classList.toggle('on', state.trackerConnected);
  $tracker.querySelector('.txt').textContent = state.trackerConnected ? 'tracker connected' : 'tracker offline';

  if (!sprite || !state.current) {
    const anim = sprite?.anims.currentAnim;
    $info.textContent = anim ? `${labelOf(anim.key)} (ended)` : 'no animation';
    return;
  }
  const frame = sprite.anims.currentFrame;
  const total = sprite.anims.currentAnim?.frames.length ?? 0;
  const idx = frame ? frame.index : 0;
  const flags = [state.paused && 'paused', state.speed !== 1 && `${parseFloat(state.speed.toFixed(2))}×`].filter(Boolean);
  const html =
    `${labelOf(state.current)}<span class="frame">${state.current} · ${idx}/${total}</span>` +
    flags.map((f) => `<span class="flag">${f}</span>`).join('');
  if ($info.innerHTML !== html) $info.innerHTML = html;
}

function labelOf(key) {
  return defOf(key)?.label ?? key;
}

function showMessage(html) {
  $message.innerHTML = html;
  $message.hidden = false;
}

function wireControls() {
  $speed.addEventListener('input', () => setSpeed(Number($speed.value)));
  $pause.addEventListener('click', () => {
    togglePause();
    $pause.blur();
  });
  $forceLoop.addEventListener('click', () => {
    setForceLoop(!state.forceLoop);
    $forceLoop.blur();
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    if (e.repeat) return;
    const i = HOTKEYS.indexOf(e.key.toLowerCase());
    if (i === -1) return;
    const def = allAnimations()[i];
    if (def) playAnim(def.key);
  });
}

// ---------------------------------------------------------------------------
// Phaser scene
// ---------------------------------------------------------------------------
const frameKey = (anim, i) => `${anim}/${i}`;

class StageScene extends Phaser.Scene {
  constructor() {
    super('stage');
    this.failed = new Set(); // texture keys that failed to load
  }

  preload() {
    this.drawBackground();

    // Loading bar
    const barW = 560;
    const barH = 24;
    const x = (WIDTH - barW) / 2;
    const y = HEIGHT / 2 - barH / 2;
    const frame = this.add.graphics();
    frame.fillStyle(0xfff8ee, 1).fillRoundedRect(x - 8, y - 8, barW + 16, barH + 16, (barH + 16) / 2);
    const bar = this.add.graphics();
    const label = this.add
      .text(WIDTH / 2, y - 50, 'Loading Puntje…', { fontFamily: '-apple-system, "SF Pro Rounded", system-ui, sans-serif', fontSize: '30px', fontStyle: '600', color: '#1d1b1a' })
      .setOrigin(0.5);

    this.load.on('progress', (p) => {
      bar.clear().fillStyle(0x1d1b1a, 1).fillRoundedRect(x, y, Math.max(barH, barW * p), barH, barH / 2);
      label.setText(`Loading Puntje…  ${Math.round(p * 100)}%`);
    });
    this.load.on('loaderror', (file) => this.failed.add(file.key));
    this.load.once('complete', () => {
      frame.destroy();
      bar.destroy();
      label.destroy();
    });

    for (const [anim, files] of Object.entries(state.manifest)) {
      files.forEach((file, i) => this.load.image(frameKey(anim, i), `${ASSET_ROOT}/${anim}/${file}`));
    }
  }

  create() {
    // Build one Phaser animation per folder from the frames that actually loaded.
    for (const [anim, files] of Object.entries(state.manifest)) {
      const frames = files
        .map((_, i) => frameKey(anim, i))
        .filter((k) => !this.failed.has(k) && this.textures.exists(k))
        .map((key) => ({ key }));
      if (frames.length === 0) continue;

      const def = defOf(anim);
      this.anims.create({ key: anim, frames, frameRate: FPS, repeat: def?.loop ? -1 : 0 });
      state.available.add(anim);
    }

    buildButtons();

    if (state.available.size === 0) {
      showMessage(
        '<strong>No Puntje frames found yet</strong>' +
          'Render with <code>npm run render -- path/to/Potlood.aep</code><br>' +
          'or drop PNG sequences in <code>public/assets/puntje/&lt;name&gt;/</code>,<br>' +
          'then run <code>npm run scan</code> and reload.',
      );
      updateInfo();
      return;
    }

    // One sprite at one fixed anchor point, one fixed scale for all animations.
    const firstAnim = [...state.available][0];
    let scale;
    if (state.crop?.anims) {
      // Fit the tallest animation (highest point above the floor) in the stage.
      const ay = state.crop.floorY ?? state.crop.source.height;
      const reach = Math.max(...[...state.available].map((k) => ay - (state.crop.anims[k]?.top ?? 0)));
      scale = Math.min((GROUND_Y - TOP_MARGIN) / reach, WIDTH / state.crop.source.width);
    } else {
      const tex = this.textures.get(frameKey(firstAnim, 0)).getSourceImage();
      scale = Math.min((GROUND_Y - TOP_MARGIN) / tex.height, (WIDTH * 0.8) / tex.width);
    }

    sprite = this.add.sprite(WIDTH / 2, GROUND_Y, frameKey(firstAnim, 0)).setScale(scale);
    applyOrigin(firstAnim);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, onAnimationComplete);
    sprite.anims.timeScale = state.speed;

    // Start: intro once, then idle (handled by animationcomplete).
    if (!playAnim(INTRO)) {
      if (!playAnim(IDLE)) playAnim(firstAnim);
    }
  }

  update() {
    updateInfo();
  }

  drawBackground() {
    const g = this.add.graphics();
    // Soft ground line: a few stacked, fading strokes. The contact shadow comes from the renders.
    for (let i = 0; i < 6; i++) {
      g.lineStyle(14 - i * 2, 0x3b2f24, 0.025 + i * 0.012);
      g.lineBetween(WIDTH * 0.12 + i * 30, GROUND_Y, WIDTH * 0.88 - i * 30, GROUND_Y);
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function loadManifest() {
  try {
    const res = await fetch(`${ASSET_ROOT}/manifest.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.crop = json?.crop ?? null;
    return json && typeof json.animations === 'object' ? json.animations : {};
  } catch (err) {
    console.warn('[puntje] manifest.json not found – run `npm run scan`.', err);
    return {};
  }
}

async function boot() {
  wireControls();
  setSpeed(Number($speed.value));
  state.manifest = await loadManifest();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: BG_COLOR,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WIDTH,
      height: HEIGHT,
    },
    scene: [StageScene],
  });

  connectTracking(playAnim, {
    onStatus: (connected) => {
      state.trackerConnected = connected;
      updateInfo();
    },
  });

  // Handy for debugging from the console: puntje.playAnim('11_springen')
  window.puntje = { playAnim, state, game };
}

boot();
