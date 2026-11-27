// ALL stickers are defined in this one file.
//
// Units: everything is drawn in "wobbel units". The guide circle on the iPad has radius 1.
// Positive y points down. The line colour and line width are already set before draw()
// is called. s.color holds the colour of this sticker, for filled parts.
//
// The name of a sticker must start with its kind: eye_, mouth_, extra_, legs_ or arms_.
//
// FREE STICKERS: can be placed anywhere, as many as you like.
//   (0, 0) is the middle of the sticker.
//
//   kind: 'eye'     { label, draw(ctx, s) }
//     s.blink  0 = open, 1 = closed
//     s.lookX, s.lookY  -1..1, where the pupil looks
//     s.side   -1 = sticker is on the left half of the wobbel, 1 = right half
//   kind: 'mouth'   { label, draw(ctx, s) }
//   kind: 'extra'   { label, draw(ctx, s) }      hats, bows, tails, ...
//
// SNAP STICKERS: only one per wobbel, they jump to a fixed place.
//
//   kind: 'legs'    { label, height, gait, draw(ctx, s) }
//     (0, 0) is the bottom of the guide circle. The feet touch the ground at y = height.
//     s.phase   walking cycle in radians (one full circle = 2 steps)
//     s.moving  0 = standing still, 1 = walking
//     s.hipY    how far the body is moved up or down at this moment (bounce)
//     gait.speed    walking speed in radii per second
//     gait.stepHz   steps per second
//     gait.bounce   how high the body bounces with each step (in radii)
//     gait.squash   how much the body squashes and stretches with each step (0..0.2)
//
//   kind: 'arms'    { label, reach, drop, draw(ctx, s) }
//     (0, 0) is the middle of the guide circle. Draw BOTH arms, they start at x = -1 and x = 1.
//     reach / drop: how far the arms go sideways / down (used to grab them on the iPad).
//     s.phase, s.moving: same as legs, so the arms can swing while walking.
//
// To add a sticker: copy an entry, give it a new name and change the drawing.
// Nothing else is needed: it appears in the tray on the iPad and works on all screens.

(function () {
  const TAU = Math.PI * 2;

  // Basic eye: a white ellipse with a coloured pupil. Closes when s.blink goes to 1.
  function eyeball(ctx, rx, ry, pupil, s) {
    const open = 1 - s.blink;
    const h = Math.max(ry * open, 0.004);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, h, 0, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
    if (open > 0.35) {
      const px = s.lookX * (rx - pupil) * 0.75;
      const py = s.lookY * (ry - pupil) * 0.75;
      ctx.beginPath();
      ctx.arc(px, py, pupil, 0, TAU);
      ctx.fillStyle = s.color;
      ctx.fill();
    }
  }

  // One leg with a flat foot that points forward (to the right).
  function leg(ctx, hipX, hipY, footX, footY, footLength) {
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(footX, footY);
    ctx.lineTo(footX + footLength, footY);
    ctx.stroke();
  }

  // Where the guide circle is at this x, measured from its lowest point (0 or negative).
  const circleEdge = (x) => -(1 - Math.sqrt(1 - x * x));

  window.STICKERS = {
    // ================================================================ EYES
    eye_round: {
      kind: 'eye',
      label: 'Round',
      draw(ctx, s) {
        eyeball(ctx, 0.14, 0.14, 0.055, s);
      },
    },

    eye_sleepy: {
      kind: 'eye',
      label: 'Sleepy',
      draw(ctx, s) {
        const r = 0.16;
        eyeball(ctx, r, r, 0.05, { blink: s.blink, lookX: s.lookX, lookY: 0.9, color: s.color });
        if (s.blink < 0.65) {
          // Heavy eyelid: covers the top half.
          ctx.beginPath();
          ctx.arc(0, 0, r, Math.PI, TAU);
          ctx.closePath();
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
      },
    },

    eye_angry: {
      kind: 'eye',
      label: 'Angry',
      draw(ctx, s) {
        eyeball(ctx, 0.14, 0.14, 0.055, s);
        // Eyebrow: low on the inside, high on the outside.
        ctx.save();
        ctx.lineWidth *= 1.6;
        ctx.beginPath();
        ctx.moveTo(-s.side * 0.2, -0.1);
        ctx.lineTo(s.side * 0.2, -0.27);
        ctx.stroke();
        ctx.restore();
      },
    },

    eye_big: {
      kind: 'eye',
      label: 'Big',
      draw(ctx, s) {
        eyeball(ctx, 0.25, 0.25, 0.11, s);
        if (s.blink < 0.65) {
          // Small shine in the pupil.
          ctx.beginPath();
          ctx.arc(s.lookX * 0.105 - 0.04, s.lookY * 0.105 - 0.04, 0.03, 0, TAU);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
      },
    },

    eye_cyclops: {
      kind: 'eye',
      label: 'Cyclops',
      draw(ctx, s) {
        eyeball(ctx, 0.36, 0.22, 0.11, s);
        // Three eyelashes on top.
        ctx.beginPath();
        for (const x of [-0.16, 0, 0.16]) {
          const y = -0.22 * Math.sqrt(1 - (x / 0.36) * (x / 0.36)) * (1 - s.blink);
          ctx.moveTo(x, y);
          ctx.lineTo(x * 1.3, y - 0.1);
        }
        ctx.stroke();
      },
    },

    // ================================================================ MOUTHS
    mouth_smile: {
      kind: 'mouth',
      label: 'Smile',
      draw(ctx) {
        ctx.beginPath();
        ctx.arc(0, -0.12, 0.3, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      },
    },

    mouth_teeth: {
      kind: 'mouth',
      label: 'Teeth',
      draw(ctx, s) {
        // A big grin: lips (flat on top, round below) with a row of teeth.
        ctx.beginPath();
        ctx.moveTo(-0.34, -0.12);
        ctx.lineTo(0.34, -0.12);
        ctx.ellipse(0, -0.12, 0.34, 0.34, 0, 0, Math.PI);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(-0.24, -0.12, 0.48, 0.13);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (const x of [-0.08, 0.08]) {
          ctx.moveTo(x, -0.12);
          ctx.lineTo(x, 0.01);
        }
        ctx.stroke();
      },
    },

    mouth_o: {
      kind: 'mouth',
      label: 'Oh!',
      draw(ctx, s) {
        // Open mouth: white lips around a dark hole.
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.2, 0.24, 0, 0, TAU);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0.01, 0.1, 0.13, 0, 0, TAU);
        ctx.fillStyle = s.color;
        ctx.fill();
      },
    },

    // ================================================================ EXTRAS
    extra_hat: {
      kind: 'extra',
      label: 'Hat',
      draw(ctx) {
        ctx.beginPath();
        ctx.rect(-0.28, -0.42, 0.56, 0.42);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-0.5, 0);
        ctx.lineTo(0.5, 0);
        ctx.moveTo(-0.28, -0.12);
        ctx.lineTo(0.28, -0.12);
        ctx.stroke();
      },
    },

    extra_bow: {
      kind: 'extra',
      label: 'Bow',
      draw(ctx, s) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(side * 0.34, -0.2);
          ctx.lineTo(side * 0.34, 0.2);
          ctx.closePath();
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 0.07, 0, TAU);
        ctx.fillStyle = s.color;
        ctx.fill();
      },
    },

    extra_antenna: {
      kind: 'extra',
      label: 'Antenna',
      draw(ctx, s) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 0.08, 0.25);
          ctx.quadraticCurveTo(side * 0.1, -0.1, side * 0.3, -0.25);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(side * 0.3, -0.25, 0.07, 0, TAU);
          ctx.fillStyle = s.color;
          ctx.fill();
        }
      },
    },

    extra_tail: {
      kind: 'extra',
      label: 'Tail',
      draw(ctx) {
        // Curly tail.
        ctx.beginPath();
        ctx.moveTo(-0.3, 0.15);
        ctx.bezierCurveTo(0, 0.25, 0.35, 0.05, 0.25, -0.2);
        ctx.bezierCurveTo(0.18, -0.38, -0.08, -0.3, 0, -0.14);
        ctx.bezierCurveTo(0.04, -0.06, 0.14, -0.1, 0.12, -0.17);
        ctx.stroke();
      },
    },

    // ================================================================ LEGS
    legs_short: {
      kind: 'legs',
      label: 'Short',
      height: 0.35,
      gait: { speed: 4, stepHz: 4.5, bounce: 0.06, squash: 0.05 }, // fast little steps
      draw(ctx, s) {
        for (let i = 0; i < 2; i++) {
          const phase = s.phase + i * Math.PI;
          const swing = Math.sin(phase) * 0.14 * s.moving;
          const lift = Math.max(0, Math.cos(phase)) * 0.1 * s.moving;
          const hipX = i === 0 ? -0.3 : 0.3;
          leg(ctx, hipX, s.hipY + circleEdge(hipX), hipX + swing, 0.35 - lift, 0.14);
        }
      },
    },

    legs_long: {
      kind: 'legs',
      label: 'Long',
      height: 0.9,
      gait: { speed: 3.2, stepHz: 1.7, bounce: 0.14, squash: 0.09 }, // slow big strides
      draw(ctx, s) {
        for (let i = 0; i < 2; i++) {
          const phase = s.phase + i * Math.PI;
          const swing = Math.sin(phase) * 0.34 * s.moving;
          const lift = Math.max(0, Math.cos(phase)) * 0.22 * s.moving;
          const hipX = i === 0 ? -0.25 : 0.25;
          const hipY = s.hipY + circleEdge(hipX);
          const footX = hipX + swing;
          const footY = 0.9 - lift;
          // Knee: halfway, bent forward when the foot is lifted.
          const kneeX = (hipX + footX) / 2 + 0.06 + lift * 0.9;
          const kneeY = (hipY + footY) / 2;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.lineTo(footX + 0.2, footY);
          ctx.stroke();
        }
      },
    },

    legs_paws: {
      kind: 'legs',
      label: '4 paws',
      height: 0.22,
      gait: { speed: 5, stepHz: 8, bounce: 0.03, squash: 0.03 }, // scuttle
      draw(ctx, s) {
        const hips = [-0.55, -0.2, 0.2, 0.55];
        for (let i = 0; i < 4; i++) {
          const phase = s.phase + (i % 2) * Math.PI;
          const swing = Math.sin(phase) * 0.08 * s.moving;
          const lift = Math.max(0, Math.cos(phase)) * 0.07 * s.moving;
          const footX = hips[i] + swing;
          const footY = 0.22 - 0.05 - lift;
          ctx.beginPath();
          ctx.moveTo(hips[i], s.hipY + circleEdge(hips[i]));
          ctx.lineTo(footX, footY);
          ctx.stroke();
          // Paw: a small circle.
          ctx.beginPath();
          ctx.arc(footX, footY, 0.05, 0, TAU);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
      },
    },

    // ================================================================ ARMS
    arms_short: {
      kind: 'arms',
      label: 'Short',
      reach: 0.4,
      drop: 0.45,
      draw(ctx, s) {
        for (const side of [-1, 1]) {
          const swing = Math.sin(s.phase + (side > 0 ? Math.PI : 0)) * 0.12 * s.moving;
          const handX = side * 1.35;
          const handY = 0.4 + swing;
          ctx.beginPath();
          ctx.moveTo(side, 0.05);
          ctx.lineTo(handX, handY);
          ctx.stroke();
          // Hand: a small circle.
          ctx.beginPath();
          ctx.arc(handX, handY, 0.06, 0, TAU);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
      },
    },

    arms_long: {
      kind: 'arms',
      label: 'Long',
      reach: 0.55,
      drop: 0.95,
      draw(ctx, s) {
        for (const side of [-1, 1]) {
          const swing = Math.sin(s.phase + (side > 0 ? Math.PI : 0)) * 0.22 * s.moving;
          const elbowX = side * 1.4;
          const elbowY = 0.35;
          const handX = side * 1.45 + swing * 0.5;
          const handY = 0.9 - Math.abs(swing) * 0.3;
          ctx.beginPath();
          ctx.moveTo(side, 0);
          ctx.lineTo(elbowX, elbowY);
          ctx.lineTo(handX, handY);
          ctx.stroke();
          // Hand: three short fingers.
          ctx.beginPath();
          for (const f of [-0.08, 0, 0.08]) {
            ctx.moveTo(handX, handY);
            ctx.lineTo(handX + f, handY + 0.1);
          }
          ctx.stroke();
        }
      },
    },
  };
})();
