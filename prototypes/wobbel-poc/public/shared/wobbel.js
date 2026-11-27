// Draws a wobbel. Used by all three pages (iPad, level, world).
//
// A wobbel has no outline of its own. It is what the player drew, plus stickers.
// It is drawn in four layers:
//   1. arms and legs  (drawn live each frame, so they can move)
//   2. the body fill  (a circle in wobbel.fill, if the player used the fill tool)
//   3. the drawing    (pre-rendered once to an offscreen canvas: makeSprite())
//   4. free stickers  (eyes, mouths, extras; drawn live so eyes can blink and look around)
//
// Stickers always have their own fixed colours. They never take the pen colour.

(function () {
  const TAU = Math.PI * 2;
  const EXTENT = 1.8; // the drawing can go from -1.8 to 1.8 (the guide circle has radius 1)
  const PAD = 0.2; // room around a layer for the thickness of the lines
  const DEFAULT_COLOR = '#000000';
  const DEFAULT_WIDTH = 0.05; // line width of a stroke, in radii
  const STICKER_LINE_WIDTH = 0.05;
  const RAINBOW_STEP = 5; // degrees of hue per point of a rainbow stroke

  // Old data stored a stroke as a plain list of points. New data: { c, w, p }.
  function normalize(stroke) {
    return Array.isArray(stroke) ? { c: DEFAULT_COLOR, w: DEFAULT_WIDTH, p: stroke } : stroke;
  }

  // Draw one stroke in wobbel units. An eraser stroke removes what is under it,
  // so only use this on a separate layer (offscreen canvas), never on the page itself.
  function drawStroke(ctx, strokeIn, minWidth) {
    const stroke = normalize(strokeIn);
    const points = stroke.p;
    if (!points || points.length === 0) return;
    const erase = stroke.c === 'erase';
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = erase ? '#000' : stroke.c || DEFAULT_COLOR;
    ctx.lineWidth = Math.max(stroke.w || DEFAULT_WIDTH, minWidth || 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (stroke.c === 'rainbow') {
      // Rainbow pen: every piece of the line has the next colour.
      const hue = (i) => `hsl(${((stroke.h || 0) + i * RAINBOW_STEP) % 360}, 90%, 55%)`;
      ctx.strokeStyle = ctx.fillStyle = hue(0);
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, TAU);
      ctx.fill();
      for (let i = 1; i < points.length; i++) {
        ctx.strokeStyle = hue(i);
        ctx.beginPath();
        ctx.moveTo(points[i - 1][0], points[i - 1][1]);
        ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
      }
      return;
    }
    if (points.length === 1) {
      // A single tap: draw a dot.
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // An empty, transparent layer for a drawing. pixelRadius = size of 1 radius in real pixels.
  // box = the part of the wobbel it covers, in radii: { x0, y0, x1, y1 }.
  // Without a box it covers the whole drawing area (iPad).
  function makeLayer(pixelRadius, box) {
    const b = box || { x0: -EXTENT - PAD, y0: -EXTENT - PAD, x1: EXTENT + PAD, y1: EXTENT + PAD };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil((b.x1 - b.x0) * pixelRadius));
    canvas.height = Math.max(2, Math.ceil((b.y1 - b.y0) * pixelRadius));
    canvas.box = b;
    return canvas;
  }

  // Bounding box of the strokes only, in radii. null if there is nothing to see.
  function strokeBox(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const strokeIn of strokes || []) {
      const stroke = normalize(strokeIn);
      if (stroke.c === 'erase') continue;
      const half = (stroke.w || DEFAULT_WIDTH) / 2;
      for (const p of stroke.p || []) {
        if (p[0] - half < x0) x0 = p[0] - half;
        if (p[0] + half > x1) x1 = p[0] + half;
        if (p[1] - half < y0) y0 = p[1] - half;
        if (p[1] + half > y1) y1 = p[1] + half;
      }
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }

  // Real bounding box of a whole wobbel: drawing + fill + stickers + legs.
  // In radii, relative to the middle of the guide circle. The feet are at y1.
  function boundsOf(wobbel) {
    const box = strokeBox(wobbel.strokes) || { x0: 0, y0: 0, x1: 0, y1: 0 };
    const add = (x0, y0, x1, y1) => {
      box.x0 = Math.min(box.x0, x0);
      box.y0 = Math.min(box.y0, y0);
      box.x1 = Math.max(box.x1, x1);
      box.y1 = Math.max(box.y1, y1);
    };
    if (wobbel.fill) add(-1, -1, 1, 1);
    for (const s of wobbel.stickers || []) {
      const def = STICKERS[s.type];
      if (!def) continue;
      if (def.kind === 'legs') add(-0.75, 1, 0.75, 1 + def.height);
      else if (def.kind === 'arms') add(-1 - def.reach, -0.1, 1 + def.reach, def.drop + 0.1);
      else {
        const half = def.kind === 'extra' ? 0.55 : 0.4;
        add(s.x - half, s.y - half, s.x + half, s.y + half);
      }
    }
    return box;
  }

  // Size factor for the big screens: a wobbel with a very big drawing is shown a bit smaller,
  // so all wobbels take about the same room. 1 = normal size.
  function fitScale(bounds) {
    const size = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    return Math.max(0.75, Math.min(1, 3 / size));
  }

  // Paint strokes on top of what is already in the layer.
  // minWidth (in radii, optional): lines are never thinner than this (big screens).
  function paintStrokes(layer, pixelRadius, strokes, minWidth) {
    const ctx = layer.getContext('2d');
    ctx.save();
    ctx.scale(pixelRadius, pixelRadius);
    ctx.translate(-layer.box.x0, -layer.box.y0);
    for (const stroke of strokes) drawStroke(ctx, stroke, minWidth);
    ctx.restore();
  }

  // Pre-render the whole drawing of a wobbel once. The canvas is exactly as big as the drawing.
  function makeSprite(wobbel, pixelRadius, minWidth) {
    const box = strokeBox(wobbel.strokes);
    if (!box) return null;
    const layer = makeLayer(pixelRadius, { x0: box.x0 - 0.02, y0: box.y0 - 0.02, x1: box.x1 + 0.02, y1: box.y1 + 0.02 });
    paintStrokes(layer, pixelRadius, wobbel.strokes || [], minWidth);
    return layer;
  }

  function findSticker(wobbel, kind) {
    return (wobbel.stickers || []).find((s) => STICKERS[s.type] && STICKERS[s.type].kind === kind);
  }

  // Walking style of this wobbel. Falls back to a default if the leg type is unknown.
  function gaitOf(wobbel) {
    const legs = findSticker(wobbel, 'legs');
    return legs ? STICKERS[legs.type].gait : { speed: 4, stepHz: 4, bounce: 0.05, squash: 0.05 };
  }

  // Height in radii, from the feet to the top of the guide circle.
  function heightOf(wobbel) {
    const legs = findSticker(wobbel, 'legs');
    return 2 + (legs ? STICKERS[legs.type].height : 0);
  }

  function prepareStickerStyle(ctx, color, minWidth) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(STICKER_LINE_WIDTH, minWidth || 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }

  // Draw a wobbel.
  //   o.x, o.y   where the FEET touch the ground (canvas coordinates)
  //   o.r        size of 1 radius in canvas units
  //   o.sprite   pre-rendered drawing from makeSprite()
  //   o.dir      1 = walks to the right, -1 = to the left
  //   o.phase, o.moving   walking cycle, see stickers.js
  //   o.bob      body moved up (negative) or down, in radii
  //   o.sx, o.sy squash and stretch, measured from the feet
  //   o.blink, o.lookX, o.lookY   eyes
  //   o.minLine  smallest line width of stickers, in radii (big screens: 4 px)
  //   o.wiggle   { sticker, angle }: draw this one sticker rotated (iPad, after placing it)
  function draw(ctx, wobbel, o) {
    const legs = findSticker(wobbel, 'legs');
    const arms = findSticker(wobbel, 'arms');
    const legHeight = legs ? STICKERS[legs.type].height : 0;
    const bob = o.bob || 0;
    const bodyY = -legHeight - 1 + bob; // middle of the guide circle
    const limbState = { phase: o.phase || 0, moving: o.moving || 0, hipY: bob, color: DEFAULT_COLOR };

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.r * (o.sx || 1), o.r * (o.sy || 1));

    if (arms) {
      ctx.save();
      ctx.translate(0, bodyY);
      limbState.color = DEFAULT_COLOR;
      prepareStickerStyle(ctx, limbState.color, o.minLine);
      STICKERS[arms.type].draw(ctx, limbState);
      ctx.restore();
    }

    if (legs) {
      ctx.save();
      ctx.translate(0, -legHeight);
      ctx.scale(o.dir || 1, 1); // feet point in the walking direction
      limbState.color = DEFAULT_COLOR;
      prepareStickerStyle(ctx, limbState.color, o.minLine);
      STICKERS[legs.type].draw(ctx, limbState);
      ctx.restore();
    }

    if (wobbel.fill) {
      ctx.fillStyle = wobbel.fill;
      ctx.beginPath();
      ctx.arc(0, bodyY, 1, 0, TAU);
      ctx.fill();
    }

    if (o.sprite) {
      const b = o.sprite.box;
      ctx.drawImage(o.sprite, b.x0, bodyY + b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }

    const state = { blink: o.blink || 0, lookX: o.lookX || 0, lookY: o.lookY || 0, side: 1, color: DEFAULT_COLOR };
    for (const sticker of wobbel.stickers || []) {
      const def = STICKERS[sticker.type];
      if (!def || def.kind === 'legs' || def.kind === 'arms') continue;
      ctx.save();
      ctx.translate(sticker.x, bodyY + sticker.y);
      if (o.wiggle && o.wiggle.sticker === sticker) ctx.rotate(o.wiggle.angle);
      state.side = sticker.x < 0 ? -1 : 1;
      state.color = DEFAULT_COLOR; // fixed: a sticker never takes the pen colour
      prepareStickerStyle(ctx, state.color, o.minLine);
      def.draw(ctx, state);
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw one loose sticker (tray icon, or a sticker that is being dragged).
  function drawSticker(ctx, type, x, y, r, color, eyeState) {
    const def = STICKERS[type];
    if (!def) return;
    const state = Object.assign({ blink: 0, lookX: 0, lookY: 0, side: 1, phase: 0, moving: 0, hipY: 0 }, eyeState);
    state.color = color || DEFAULT_COLOR;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r, r);
    prepareStickerStyle(ctx, state.color);
    ctx.lineWidth = Math.max(STICKER_LINE_WIDTH, 3 / r); // small icons: lines stay at least 3 px
    def.draw(ctx, state);
    ctx.restore();
  }

  // ---- Eye animation (blink + look around). One of these per wobbel. ----
  function makeAnim() {
    return {
      blink: 0,
      lookX: 0,
      lookY: 0,
      blinkTime: -1,
      nextBlink: 0.5 + Math.random() * 3,
      targetX: 0,
      targetY: 0,
      nextLook: Math.random() * 2,
    };
  }

  // dt in seconds. lookAround = false on the iPad (eyes only blink there).
  function updateAnim(anim, dt, lookAround) {
    anim.nextBlink -= dt;
    if (anim.nextBlink <= 0) {
      anim.blinkTime = 0;
      anim.nextBlink = 1.5 + Math.random() * 4;
    }
    if (anim.blinkTime >= 0) {
      anim.blinkTime += dt;
      const p = anim.blinkTime / 0.2;
      anim.blink = p >= 1 ? 0 : 1 - Math.abs(2 * p - 1);
      if (p >= 1) anim.blinkTime = -1;
    }
    if (lookAround) {
      anim.nextLook -= dt;
      if (anim.nextLook <= 0) {
        const straight = Math.random() < 0.3;
        anim.targetX = straight ? 0 : Math.random() * 2 - 1;
        anim.targetY = straight ? 0 : Math.random() * 1.2 - 0.6;
        anim.nextLook = 0.7 + Math.random() * 2.5;
      }
      const k = Math.min(1, dt * 8);
      anim.lookX += (anim.targetX - anim.lookX) * k;
      anim.lookY += (anim.targetY - anim.lookY) * k;
    }
  }

  window.Wobbel = {
    EXTENT,
    DEFAULT_COLOR,
    makeLayer,
    paintStrokes,
    makeSprite,
    boundsOf,
    fitScale,
    draw,
    drawSticker,
    gaitOf,
    heightOf,
    makeAnim,
    updateAnim,
  };
})();
