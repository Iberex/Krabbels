// Level screen (/level): wobbels arrive at START and walk automatically to FINISH.
//
// The level is drawn in a fixed virtual space of 1600 x 900 and scaled to the screen.
// A wobbel does not use physics. It follows a fixed PATH of points. Each part of the
// path is a walk (straight line) or a jump (fixed curve). So it cannot get stuck.

(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const VIEW_W = 1600;
  const VIEW_H = 900;
  const RADIUS = 75; // body radius of a wobbel in the level (big, to be seen from far away)
  const WALK_RADIUS = 50; // walking speed is measured in this unit, not in the drawn size
  const MIN_LINE_PX = 4; // lines are never thinner than this on the screen
  const POLL_MS = 1000;
  const JUMP_SECONDS = 0.6;
  const ARRIVE_SECONDS = 1.9;
  const ARRIVE_GAP_SECONDS = 1.4; // minimum time between two arrivals (more room at the finish)

  // Platforms: x, top (y of the surface), width. They run down to the bottom of the screen.
  const PLATFORMS = [
    { x: 0, top: 760, w: 420 },
    { x: 420, top: 680, w: 200 }, // step up
    { x: 620, top: 600, w: 180 }, // step up
    // gap 800..920
    { x: 920, top: 600, w: 260 },
    { x: 1180, top: 700, w: 140 }, // step down
    // gap 1320..1420
    { x: 1420, top: 760, w: 180 },
  ];

  // The fixed path. "jump" = the move TO this point is a jump with this height.
  const PATH = [
    { x: 230, y: 760 }, // START (the portal; the start flag stands 190 px to the left)
    { x: 370, y: 760 },
    { x: 470, y: 680, jump: 70 },
    { x: 575, y: 680 },
    { x: 670, y: 600, jump: 70 },
    { x: 765, y: 600 },
    { x: 960, y: 600, jump: 110 }, // over gap 1
    { x: 1140, y: 600 },
    { x: 1225, y: 700, jump: 50 },
    { x: 1285, y: 700 },
    { x: 1460, y: 760, jump: 100 }, // over gap 2
    { x: 1520, y: 760 }, // FINISH
  ];

  const SEGMENTS = [];
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    SEGMENTS.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, jump: b.jump || 0, length: Math.hypot(b.x - a.x, b.y - a.y) });
  }
  const START = PATH[0];
  const FINISH = PATH[PATH.length - 1];

  // ---------- State ----------
  let entities = []; // wobbels that are on screen
  let queue = []; // wobbels that wait for their turn to arrive
  const known = new Set(); // ids we already have (so no wobbel appears twice)
  let epoch = null;
  let lastId = null; // id of the newest wobbel we received (for ?since=)
  let lastArrival = -999;
  let finishTextTime = 0;
  let clock = 0;

  // ---------- Layout ----------
  let scale = 1, offsetX = 0, offsetY = 0, dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / VIEW_W, h / VIEW_H);
    offsetX = (w - VIEW_W * scale) / 2;
    offsetY = (h - VIEW_H * scale) / 2;
    // Sprites depend on the screen size: make them again when needed.
    for (const e of entities) e.sprite = null;
  }

  // ---------- Polling ----------
  async function poll() {
    const url = '/api/wobbels?status=level' + (lastId ? '&since=' + encodeURIComponent(lastId) : '');
    const data = await Api.get(url);
    if (epoch !== null && data.epoch !== epoch) {
      // Reset or new day: forget everything and load the list again.
      entities = [];
      queue = [];
      known.clear();
      lastId = null;
      epoch = data.epoch;
      return;
    }
    epoch = data.epoch;
    for (const wobbel of data.wobbels) {
      lastId = wobbel.id;
      if (known.has(wobbel.id)) continue;
      known.add(wobbel.id);
      queue.push(wobbel);
    }
  }

  // Tell the server that a wobbel is finished. Keeps trying until it works.
  async function postFinish(id) {
    try {
      await Api.post('/api/wobbels/' + encodeURIComponent(id) + '/finish');
    } catch (error) {
      if (error.status === 404) return; // wobbel was removed by a reset
      setTimeout(() => postFinish(id), 1500);
    }
  }

  // ---------- Update ----------
  function startArrival(wobbel) {
    entities.push({
      wobbel,
      anim: Wobbel.makeAnim(),
      gait: Wobbel.gaitOf(wobbel),
      bounds: Wobbel.boundsOf(wobbel), // real size of this wobbel, in radii
      sprite: null,
      state: 'arriving', // arriving -> walking -> finishing -> (removed)
      time: 0,
      segment: 0,
      progress: 0, // 0..1 inside the current segment
      phase: 0,
      landTime: 0,
      x: START.x,
      y: START.y,
      vy: 0,
    });
    lastArrival = clock;
    Hooks.onWobbelArrive(wobbel);
  }

  function update(dt) {
    clock += dt;
    if (finishTextTime > 0) finishTextTime -= dt;

    if (queue.length > 0 && clock - lastArrival >= ARRIVE_GAP_SECONDS) startArrival(queue.shift());

    for (const e of entities) {
      e.time += dt;
      Wobbel.updateAnim(e.anim, dt, true);
      if (e.landTime > 0) e.landTime -= dt;

      if (e.state === 'arriving') {
        if (e.time >= ARRIVE_SECONDS) {
          e.state = 'walking';
          e.time = 0;
        }
      } else if (e.state === 'walking') {
        const seg = SEGMENTS[e.segment];
        if (seg.jump) {
          e.progress += dt / JUMP_SECONDS;
        } else {
          e.progress += (e.gait.speed * WALK_RADIUS * dt) / seg.length;
          e.phase += e.gait.stepHz * Math.PI * dt;
        }
        if (e.progress >= 1) {
          if (seg.jump) e.landTime = 0.22;
          e.segment++;
          e.progress = 0;
          if (e.segment >= SEGMENTS.length) {
            e.state = 'finishing';
            e.time = 0;
            e.x = FINISH.x;
            e.y = FINISH.y;
            e.vy = 0;
            finishTextTime = 2;
            Hooks.onWobbelFinish(e.wobbel);
            continue;
          }
        }
        const s = SEGMENTS[e.segment];
        const p = e.progress;
        e.x = s.x0 + (s.x1 - s.x0) * p;
        e.y = s.y0 + (s.y1 - s.y0) * p - 4 * s.jump * p * (1 - p);
      } else if (e.state === 'finishing') {
        // Short crouch, then jump and fly up out of the screen.
        if (e.time > 0.3) {
          e.vy -= 3200 * dt;
          e.y += e.vy * dt;
        }
        if (e.y < -RADIUS * 5) {
          e.state = 'gone';
          postFinish(e.wobbel.id);
        }
      }
    }
    entities = entities.filter((e) => e.state !== 'gone');
  }

  // ---------- Drawing ----------
  // Flags without text. Start = a plain pennant. Finish = a checkered flag.
  function drawFlag(x, y, checkered) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 230);
    ctx.stroke();
    if (checkered) drawCheckered(x, y - 230, 26);
    else {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(x, y - 230);
      ctx.lineTo(x + 90, y - 195);
      ctx.lineTo(x, y - 160);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Checkered flag: 4 x 3 squares, top left corner at (x, y).
  function drawCheckered(x, y, square) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, square * 4, square * 3);
    ctx.fillStyle = '#000';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 0) ctx.fillRect(x + col * square, y + row * square, square, square);
      }
    }
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, square * 4, square * 3);
  }

  function drawStar(x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? size : size * 0.45;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
  }

  function drawLevel() {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    for (const p of PLATFORMS) ctx.strokeRect(p.x, p.top, p.w, VIEW_H - p.top + 10);
    drawFlag(START.x - 190, START.y, false); // far left, so the arrival portal does not cover it
    drawFlag(FINISH.x + 40, FINISH.y, true);
  }

  // Wireframe portal at START: expanding circles and moving vertical lines.
  function drawPortal(e, strength) {
    const centerY = START.y - RADIUS * (Wobbel.heightOf(e.wobbel) / 2);
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const k = (e.time * 0.9 + i / 3) % 1;
      ctx.globalAlpha = (1 - k) * strength;
      ctx.beginPath();
      ctx.arc(START.x, centerY, RADIUS * (0.6 + k * 2.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = strength;
    ctx.setLineDash([14, 12]);
    ctx.lineDashOffset = -e.time * 260; // lines move down
    ctx.beginPath();
    for (const dx of [-1.5, -0.75, 0, 0.75, 1.5]) {
      ctx.moveTo(START.x + dx * RADIUS, 0);
      ctx.lineTo(START.x + dx * RADIUS, START.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawEntity(e) {
    const minLine = MIN_LINE_PX / (RADIUS * scale); // 4 px on the screen, in radii
    if (e.sprite === null) e.sprite = Wobbel.makeSprite(e.wobbel, RADIUS * scale * dpr, minLine) || false;
    // Wobbels with a very big drawing are shown a bit smaller. The feet stay on the ground.
    const r = RADIUS * Wobbel.fitScale(e.bounds);
    // Never draw outside the screen: a wide wobbel is pushed inward at the left and right edge.
    const half = Math.max(-e.bounds.x0, e.bounds.x1) * r + 6;
    const x = Math.max(half, Math.min(VIEW_W - half, e.x));
    const o = {
      x, y: e.y, r, sprite: e.sprite, dir: 1, minLine,
      phase: e.phase, moving: 0, bob: 0, sx: 1, sy: 1,
      blink: e.anim.blink, lookX: e.anim.lookX, lookY: e.anim.lookY,
    };

    if (e.state === 'arriving') {
      const reveal = Math.min(1, e.time / 1.1); // 0..1: how much is visible, from the top down
      drawPortal(e, Math.min(1, (ARRIVE_SECONDS - e.time) / 0.4));
      if (reveal >= 1) {
        // Small bounce after it has fully appeared.
        const u = (e.time - 1.1) / (ARRIVE_SECONDS - 1.1);
        o.sy = 1 - 0.28 * Math.exp(-3.5 * u) * Math.sin(u * 15);
        o.sx = 2 - o.sy;
        o.y -= Math.max(0, Math.sin(u * Math.PI * 2)) * 26 * (1 - u);
      }
      // Reveal the real bounding box of this wobbel (ears and tails included), from the top down.
      const b = e.bounds;
      const top = e.y - (b.y1 - b.y0) * r * 1.35 - 30;
      const half = Math.max(-b.x0, b.x1) * r * 1.35 + 20;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - half, top, half * 2, (e.y + 20 - top) * reveal);
      ctx.clip();
      Wobbel.draw(ctx, e.wobbel, o);
      ctx.restore();
      return;
    }

    if (e.state === 'walking') {
      const seg = SEGMENTS[e.segment];
      if (seg.jump) {
        // In the air: stretch.
        o.sy = 1 + 0.14 * Math.sin(e.progress * Math.PI);
        o.sx = 2 - o.sy;
        o.moving = 0.4;
      } else {
        // Walking: legs move, the body bounces and squashes with each step.
        o.moving = 1;
        o.bob = -Math.abs(Math.sin(e.phase)) * e.gait.bounce;
        o.sy = 1 + Math.cos(e.phase * 2) * e.gait.squash;
        o.sx = 2 - o.sy;
      }
      if (e.landTime > 0) {
        // Just landed: squash.
        const k = Math.sin((e.landTime / 0.22) * Math.PI);
        o.sy -= 0.22 * k;
        o.sx += 0.22 * k;
      }
    } else if (e.state === 'finishing') {
      if (e.time <= 0.3) {
        o.sy = 1 - 0.3 * Math.sin((e.time / 0.3) * Math.PI * 0.5);
        o.sx = 2 - o.sy;
      } else {
        o.sy = 1.25;
        o.sx = 0.8;
      }
    }
    Wobbel.draw(ctx, e.wobbel, o);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

    drawLevel();
    for (const e of entities) drawEntity(e);

    if (finishTextTime > 0) {
      const pop = Math.min(1, (2 - finishTextTime) / 0.2);
      ctx.save();
      ctx.translate(VIEW_W / 2, 260);
      ctx.scale(pop, pop);
      // No text: a big checkered flag with stars around it.
      ctx.strokeStyle = '#000';
      ctx.lineJoin = 'round';
      drawCheckered(-160, -120, 80);
      ctx.lineWidth = 6;
      const spin = (2 - finishTextTime) * 0.6;
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        drawStar(Math.cos(a) * 330, Math.sin(a) * 200, i % 2 === 0 ? 46 : 32);
      }
      ctx.restore();
    }
  }

  // ---------- Start ----------
  let lastFrame = performance.now();
  function frame(now) {
    // Big pause (tab was hidden): do not jump ahead, continue from where we were.
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  Api.poll(poll, POLL_MS);
  requestAnimationFrame(frame);

  // For testing in the browser console.
  window.__level = { getState: () => ({ entities: entities.map((e) => ({ id: e.wobbel.id, state: e.state, segment: e.segment, x: Math.round(e.x) })), queue: queue.length, epoch }) };
})();
