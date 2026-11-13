// =====================================================================
// picto.js - the instruction pictograms, as plain shapes in a unit grid
// (1 unit = 10% of the sticker, y points down, the sticker spans about -6..6).
// main.js (grey) and stijl.js (crayon) draw the same shapes, each in their own way.
//
//   lines : polylines [[x, y], ...]
//   dots  : filled circles [x, y, radius]
//   tris  : filled triangles (arrow heads) [[x, y] x3]
//   dashed: dashed polylines (the gap / target line)
// =====================================================================

const dirOf = (angleDeg) => {
  const a = (-angleDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

// Stick figure standing with feet on y = foot.
function figure(cx, top, foot, { headR = 0.95, legs = true } = {}) {
  const neck = top + headR * 2 + 0.2;
  const hip = foot - 2.6;
  const out = { lines: [[[cx, neck], [cx, hip]]], dots: [[cx, top + headR, headR]] };
  if (legs) out.lines.push([[cx - 1.2, foot], [cx, hip], [cx + 1.2, foot]]);
  return { ...out, shoulder: neck + 0.5 };
}

export function pictoShapes(type, angle = 0) {
  const S = { lines: [], dots: [], tris: [], dashed: [] };
  const add = (f) => {
    S.lines.push(...f.lines);
    S.dots.push(...f.dots);
  };

  if (type === "stand") {
    // Just standing, arms down (used in the explanation before the gesture).
    const f = figure(0, -4.6, 3.8);
    add(f);
    const sy = f.shoulder;
    S.lines.push([[-1.3, sy + 2.4], [-0.5, sy], [0.5, sy], [1.3, sy + 2.4]]);
  } else if (type === "connect") {
    // One child, arms in one straight line from dot to dot (= the bridge).
    const [dx, dy] = dirOf(angle);
    const f = figure(0, -4.6, 3.8);
    add(f);
    const sy = f.shoulder, L = 3.6, E = 4.7;
    S.lines.push([[-dx * L, sy - dy * L], [dx * L, sy + dy * L]]);
    S.dots.push([-dx * E, sy - dy * E, 0.7], [dx * E, sy + dy * E, 0.7]);
  } else if (type === "connect2") {
    // Two children hand in hand: ONE long line over a big gap, from outer hand to outer hand.
    const [dx, dy] = dirOf(angle);
    const cy = -1.9; // height of the joined hands
    const at = (t) => [dx * t, cy + dy * t]; // point on the line, t units from the middle
    for (const side of [-1, 1]) {
      const [, sy] = at(side * 2.5);
      const top = sy - 2.4;
      const f = figure(side * 2.5, top, 2.8, { headR: 0.8 });
      add(f);
    }
    const E = 5.0;
    S.lines.push([at(-4.4), at(4.4)]);
    S.dots.push([...at(-E), 0.6], [...at(E), 0.6]);
    // the joined hands: a small ring in the middle
    S.dots.push([...at(0), 0.75]);
    // the big gap: ground left and right, dashed nothing in between
    S.lines.push([[-5.2, 4.6], [-3.8, 4.6]], [[3.8, 4.6], [5.2, 4.6]]);
    S.dashed.push([[-3.4, 4.6], [3.4, 4.6]]);
  } else if (type === "ladder") {
    // Both arms straight up, next to a ladder.
    const f = figure(-1.6, -2.0, 4.4, { headR: 0.85 });
    add(f);
    const sy = f.shoulder;
    S.lines.push([[-3.6, -5.2], [-2.8, sy], [-0.4, sy], [0.4, -5.2]]); // arms up in a wide V
    // ladder
    S.lines.push([[2.4, -5.4], [2.4, 4.4]], [[4.6, -5.4], [4.6, 4.4]]);
    for (let y = -4.2; y <= 3.6; y += 1.95) S.lines.push([[2.4, y], [4.6, y]]);
  } else if (type === "jump") {
    // Child in the air (feet off the ground), arms up, big arrow up.
    S.dots.push([-1.2, -4.5, 0.9]);
    S.lines.push([[-1.2, -3.3], [-1.2, -0.4]]); // body
    S.lines.push([[-3.4, -4.0], [-1.2, -2.5], [1.0, -4.0]]); // arms up and out (cheering)
    S.lines.push([[-2.4, 1.6], [-1.2, -0.4], [0.0, 1.6]]); // legs
    S.lines.push([[-4.2, 4.6], [1.8, 4.6]]); // ground
    S.lines.push([[-2.0, 2.6], [-2.0, 3.6]], [[-0.4, 2.6], [-0.4, 3.6]]); // air under the feet
    S.lines.push([[3.8, 4.0], [3.8, -2.4]]); // arrow up
    S.tris.push([[2.3, -2.0], [5.3, -2.0], [3.8, -5.2]]);
  } else if (type === "duck") {
    // Low bar on top, child squatting under it, big arrow down.
    S.lines.push([[-5.2, -4.2], [3.0, -4.2]]); // bar
    S.dashed.push([[-5.2, -5.2], [3.0, -5.2]]);
    S.dots.push([-1.2, -1.4, 0.95]);
    S.lines.push([[-1.2, -0.3], [-1.2, 1.8]]); // short body
    S.lines.push([[-2.6, 1.0], [-1.2, 0.3], [0.2, 1.0]]); // arms
    S.lines.push([[-3.0, 4.6], [-2.8, 2.4], [-1.2, 1.8], [0.4, 2.4], [0.6, 4.6]]); // bent knees
    S.lines.push([[-4.6, 4.6], [2.0, 4.6]]); // ground
    S.lines.push([[3.9, -2.8], [3.9, 2.2]]); // arrow down
    S.tris.push([[2.4, 1.8], [5.4, 1.8], [3.9, 5.0]]);
  }
  return S;
}
