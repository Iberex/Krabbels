// World screen (/world): a tall tower of platforms, like a vertical platform game.
// All finished wobbels of today live here. The first wobbels of the day live at the bottom,
// later ones higher up, so the tower is a timeline of the day.
//
// HOW IT IS BUILT
//   The tower is made of "chunks": sections of one screen high (8 levels). A chunk is
//   generated from a fixed seed (the day + the chunk number), so the level is the same
//   after a reload. One chunk is added at the top for every 16 wobbels.
//
//   segment  a piece you can stand on (floor, ledge, row of blocks, cloud, stair step)
//   edge     a scripted way to get from one segment to another:
//              jump    a fixed arc (also used for stairs and for clouds from below)
//              ladder  climb straight up or down
//              spring  launches up 2 or 3 levels (one way)
//              ride    step on a moving platform, ride it, step off
//   Segments + edges form a graph. A wobbel only moves along this graph.
//   There is no physics: a wobbel can never fall off the world or get stuck.
//   Every jump arc is checked against all solid blocks when the chunk is made.
//   Arcs that would go through a block are not used.
//
// Coordinates: x 0..1920 (scaled to the screen width), y goes UP, y = 0 is the ground.

(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug'); // /world?debug=1 : buttons to add fake wobbels
  const showFps = debug || params.has('fps');

  // ---------- Settings ----------
  const VIEW_W = 1920; // the world is always this wide
  const R = 36; // body radius of a wobbel
  const MIN_LINE_PX = 3; // lines are never thinner than this on the screen
  const LEVEL_H = 160; // height between two levels (room for a tall wobbel under a row of blocks)
  const LEVELS = 8; // levels per chunk
  const CHUNK_H = LEVEL_H * LEVELS;
  const FIRST_Y = LEVEL_H; // level 0 of chunk 0 (the ground is at y = 0)
  const X_MIN = 60, X_MAX = 1800; // platforms stay between these (the height bar is on the right)
  const PER_CHUNK = 16; // wobbels per chunk (same number as on the server)
  const BLOCK = 40; // size of one square block
  const JUMP_H = 76; // extra height of a jump arc (high enough to clear the end of a platform)
  const POLL_MS = 1000;
  const NEW_SECONDS = 10; // a new wobbel is shown bigger for this long
  const NEW_SCALE = 2; // how much bigger
  const MAX_FOLLOW = 3; // the camera follows at most this many new wobbels in a row
  const PAN_SPEED = 60; // normal camera speed, world units per second
  const PAN_PAUSE = 4; // seconds the camera rests at the top and at the bottom
  const CAM_MAX_SPEED = 900; // the camera never moves faster than this

  // Jump style per leg type: time factor (higher = floatier) and walking speed factor.
  const STYLES = {
    legs_short: { time: 0.8, walk: 1, stretch: 0.12 }, // small quick hops
    legs_long: { time: 1.35, walk: 1, stretch: 0.22 }, // big floaty jumps
    legs_paws: { time: 0.7, walk: 1.5, stretch: 0.08 }, // fast scuttle, low quick jumps
  };
  const DEFAULT_STYLE = { time: 1, walk: 1, stretch: 0.14 };

  // ---------- Seeded random: the same day gives the same tower ----------
  function hashString(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function seededRandom(seed) {
    let a = seed;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The tower ----------
  let daySeed = 'x';
  let segs = []; // all segments, id = index
  let chunks = []; // per chunk: { segs: [ids], ladders, springs, movers }
  let ladders = [], springs = [], movers = [];
  let ground = null;

  const levelY = (chunk, level) => FIRST_Y + chunk * CHUNK_H + level * LEVEL_H;
  const isSolid = (s) => s.kind !== 'cloud';
  const thickOf = (kind) => (kind === 'floor' ? 12 : kind === 'cloud' ? 16 : BLOCK);

  function addSeg(list, chunk, x0, x1, y, kind) {
    const seg = { id: segs.length, chunk, x0, x1, y, kind, thick: thickOf(kind), alive: false, edges: [], count: 0 };
    segs.push(seg);
    list.push(seg);
    return seg;
  }

  function resetTower(seed) {
    daySeed = seed;
    segs = [];
    chunks = [];
    ladders = [];
    springs = [];
    movers = [];
    ground = addSeg([], -1, 0, VIEW_W - 70, 0, 'ground');
    ground.alive = true;
  }

  // Point on a jump arc. t = 0..1.
  function arcPoint(x0, y0, x1, y1, h, t) {
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 4 * h * t * (1 - t)];
  }

  // Is point (x, y) inside a solid segment? pad = extra room left and right.
  function hitsSolid(x, y, solids, pad) {
    for (const s of solids) {
      if (x > s.x0 - pad && x < s.x1 + pad && y < s.y - 1 && y > s.y - s.thick - 2) return true;
    }
    return false;
  }

  // Would a wobbel on this arc go through a solid block? Checks feet, body and head.
  function clearArc(x0, y0, x1, y1, h, solids) {
    for (let i = 1; i < 18; i++) {
      const [x, y] = arcPoint(x0, y0, x1, y1, h, i / 18);
      if (hitsSolid(x, y + 4, solids, 12) || hitsSolid(x, y + R, solids, 18) || hitsSolid(x, y + R * 1.8, solids, 10)) return false;
    }
    return true;
  }

  function addEdge(edge) {
    edge.a.edges.push({ edge, rev: false, to: edge.b });
    if (edge.type !== 'spring') edge.b.edges.push({ edge, rev: true, to: edge.a });
    return edge;
  }

  // All possible jumps from lower segment A up to (or across to) segment B.
  function linkJumps(A, B, solids) {
    const dy = B.y - A.y;
    if (dy < 0 || dy > LEVEL_H + 40) return;
    const tries = [];
    if (dy === 0) {
      // Same height: jump over the gap.
      if (B.x0 - A.x1 > 0 && B.x0 - A.x1 <= 230) tries.push([A.x1 - 14, B.x0 + 14]);
    } else {
      const lo = Math.max(A.x0, B.x0) + 24, hi = Math.min(A.x1, B.x1) - 24;
      if (B.kind === 'cloud' && hi >= lo) {
        // A cloud is thin: jump straight up through it from below, anywhere under it.
        if (clearArc(lo, A.y, lo, B.y, JUMP_H, solids) && clearArc(hi, A.y, hi, B.y, JUMP_H, solids)) {
          addEdge({ type: 'jump', a: A, b: B, flex: [lo, hi], h: JUMP_H });
        }
        return;
      }
      const inset = Math.min(24, (B.x1 - B.x0) / 2);
      // Around the left end and the right end of B: take off beside it, land on its end.
      tries.push([B.x0 - 60, B.x0 + inset], [B.x1 + 60, B.x1 - inset]);
      // A lies completely beside B: jump from the end of A.
      if (A.x1 < B.x0 - 30) tries.push([A.x1 - 14, B.x0 + inset]);
      if (A.x0 > B.x1 + 30) tries.push([A.x0 + 14, B.x1 - inset]);
    }
    for (const [ax, bx] of tries) {
      if (ax < A.x0 + 10 || ax > A.x1 - 10 || Math.abs(bx - ax) > 230) continue;
      if (clearArc(ax, A.y, bx, B.y, JUMP_H, solids)) addEdge({ type: 'jump', a: A, b: B, ax, bx, h: JUMP_H });
    }
  }

  // Row patterns: where the platforms of one level are. j() gives a small random shift.
  function rowPattern(name, j) {
    if (name === 'A') return [[X_MIN, 660 + j()], [1180 + j(), X_MAX]];
    if (name === 'B') return [[480 + j(), 1380 + j()]];
    if (name === 'C') return [[X_MIN, 420 + j()], [720 + j(), 1140 + j()], [1440 + j(), X_MAX]];
    if (name === 'D') return [[260 + j(), 860 + j()], [1100 + j(), 1640 + j()]];
    return [[140 + j(), 300 + j()], [520 + j(), 640 + j()], [860 + j(), 1000 + j()], [1220 + j(), 1340 + j()], [1560 + j(), 1720 + j()]];
  }

  // Is the box free of segments? (used for stairs, ladders and moving platforms)
  function boxFree(list, x0, x1, y0, y1, except) {
    return !list.some((s) => !except.includes(s) && s.x1 > x0 && s.x0 < x1 && s.y > y0 && s.y - s.thick < y1);
  }

  // Try to build chunk c with this random generator. Returns null if the result is not good.
  function buildChunk(c, rng, below) {
    const firstId = segs.length;
    const list = [];
    const j = () => Math.round((rng() * 120 - 60) / 20) * 20;
    const pick = (items) => items[Math.floor(rng() * items.length)];

    // ---- 1. Platforms, level by level. Level 0 and level 7 are fixed, so chunks always fit together.
    const entry = addSeg(list, c, 320, 1520, levelY(c, 0), rng() < 0.5 ? 'floor' : 'blocks');
    let last = '';
    for (let level = 1; level < LEVELS - 1; level++) {
      let name = pick(['A', 'B', 'C', 'D', 'E']);
      while (name === last) name = pick(['A', 'B', 'C', 'D', 'E']);
      last = name;
      for (const [a, b] of rowPattern(name, j)) {
        const x0 = Math.max(X_MIN, a), x1 = Math.min(X_MAX, b);
        const y = levelY(c, level);
        const width = x1 - x0;
        const roll = rng();
        if (width <= 180) {
          // Short: a small floating block, a ledge or a cloud.
          const kind = roll < 0.45 ? 'blocks' : roll < 0.75 ? 'floor' : 'cloud';
          addSeg(list, c, x0, kind === 'blocks' ? x0 + Math.max(2, Math.round(width / BLOCK)) * BLOCK : x1, y, kind);
        } else if (roll < 0.3) {
          // A row of square blocks, sometimes with a gap of two blocks in the middle.
          const n = Math.round(width / BLOCK);
          if (n >= 9 && rng() < 0.6) {
            const cut = 3 + Math.floor(rng() * (n - 7));
            addSeg(list, c, x0, x0 + cut * BLOCK, y, 'blocks');
            addSeg(list, c, x0 + (cut + 2) * BLOCK, x0 + n * BLOCK, y, 'blocks');
          } else addSeg(list, c, x0, x0 + n * BLOCK, y, 'blocks');
        } else addSeg(list, c, x0, x1, y, roll < 0.5 ? 'cloud' : 'floor');
      }
    }
    const top = levelY(c, LEVELS - 1);
    const exitLeft = addSeg(list, c, X_MIN, 330, top, 'floor');
    const exitRight = addSeg(list, c, 1510, X_MAX, top, 'floor');
    if (rng() < 0.7) addSeg(list, c, 700 + j(), 1160 + j(), top, 'cloud');

    // ---- 2. Stairs: two block steps between the end of a platform and the start of one a level higher.
    let stairs = 0;
    for (const A of list.slice()) {
      for (const B of list.slice()) {
        if (stairs >= 2 || B.y - A.y !== LEVEL_H) continue;
        for (const dir of [1, -1]) {
          const from = dir > 0 ? A.x1 : A.x0, to = dir > 0 ? B.x0 : B.x1;
          const gap = (to - from) * dir;
          if (gap < 200 || gap > 300) continue;
          const x0 = Math.min(from, to), x1 = Math.max(from, to);
          if (!boxFree(list, x0 + 1, x1 - 1, A.y - 30, B.y + 115, [A, B])) continue;
          for (let step = 1; step <= 2; step++) {
            const mid = from + (dir * gap * step) / 3;
            addSeg(list, c, mid - 40, mid + 40, A.y + Math.round((LEVEL_H * step) / 3), 'blocks').step = true;
          }
          stairs++;
        }
      }
    }

    // ---- 3. Jumps between all platforms that are close enough. Each arc is checked against the blocks.
    const near = below.concat(list);
    const solids = near.filter(isSolid);
    for (const A of near) {
      for (const B of list) {
        if (A !== B) linkJumps(A, B, solids);
      }
      if (!list.includes(A)) continue;
      for (const B of below) linkJumps(A, B, solids);
    }

    // ---- 4. Ladders: beside the end of a platform, down to a platform 1 or 2 levels lower.
    const chunkLadders = [];
    const options = [];
    for (const B of list) {
      for (const A of list) {
        const dy = B.y - A.y;
        if (dy !== LEVEL_H && dy !== LEVEL_H * 2) continue;
        for (const [x, bx] of [[B.x0 - 46, B.x0 + 20], [B.x1 + 46, B.x1 - 20]]) {
          if (x < A.x0 + 20 || x > A.x1 - 20 || B.x1 - B.x0 < 60) continue;
          if (!boxFree(list, x - 34, x + 34, A.y + 2, B.y + 115, [A, B])) continue;
          options.push({ type: 'ladder', a: A, b: B, x, bx });
        }
      }
    }
    for (let i = 0; i < 2 && options.length; i++) {
      const ladder = options.splice(Math.floor(rng() * options.length), 1)[0];
      if (chunkLadders.some((l) => Math.abs(l.x - ladder.x) < 200 && Math.abs(l.a.y - ladder.a.y) < 300)) continue;
      chunkLadders.push(addEdge(ladder));
    }

    // ---- 5. Moving platforms: in a wide gap between two platforms at the same height,
    //         or as a lift beside the ends of two platforms above each other.
    const chunkMovers = [];
    const jumpBoxes = [];
    for (const s of list) {
      for (const { edge, rev } of s.edges) {
        if (rev || edge.type !== 'jump' || edge.flex) continue;
        jumpBoxes.push({ x0: Math.min(edge.ax, edge.bx), x1: Math.max(edge.ax, edge.bx), y0: edge.a.y + 20, y1: edge.b.y + 100 });
      }
    }
    const laneFree = (x0, x1, y0, y1, except) =>
      boxFree(list, x0, x1, y0, y1, except) &&
      !jumpBoxes.some((b) => b.x1 > x0 + 30 && b.x0 < x1 - 30 && b.y1 > y0 && b.y0 < y1) &&
      !chunkLadders.some((l) => l.x > x0 - 30 && l.x < x1 + 30 && l.b.y > y0 && l.a.y < y1);
    const moverOptions = [];
    for (const A of list) {
      for (const B of list) {
        if (A === B || A.step || B.step) continue;
        const gap = B.x0 - A.x1;
        if (A.y === B.y && gap >= 300 && gap <= 620 && laneFree(A.x1 + 2, B.x0 - 2, A.y - 40, A.y + 115, [A, B])) {
          moverOptions.push({ a: A, b: B, x0: A.x1 + 14, y0: A.y, x1: B.x0 - 14 - 110, y1: A.y, ax: A.x1 - 16, bx: B.x0 + 16 });
        }
        const dy = B.y - A.y;
        if ((dy === LEVEL_H * 2 || dy === LEVEL_H * 3) && Math.abs(A.x1 - B.x1) <= 60) {
          const x = Math.max(A.x1, B.x1) + 14;
          if (x + 110 <= X_MAX + 30 && laneFree(x - 10, x + 120, A.y - 40, B.y + 115, [A, B])) {
            moverOptions.push({ a: A, b: B, x0: x, y0: A.y, x1: x, y1: B.y, ax: A.x1 - 16, bx: B.x1 - 16 });
          }
        }
        if ((dy === LEVEL_H * 2 || dy === LEVEL_H * 3) && Math.abs(A.x0 - B.x0) <= 60) {
          const x = Math.min(A.x0, B.x0) - 14 - 110;
          if (x >= X_MIN - 30 && laneFree(x - 10, x + 120, A.y - 40, B.y + 115, [A, B])) {
            moverOptions.push({ a: A, b: B, x0: x, y0: A.y, x1: x, y1: B.y, ax: A.x0 + 16, bx: B.x0 + 16 });
          }
        }
      }
    }
    for (let i = 0; i < 2 && moverOptions.length; i++) {
      const m = moverOptions.splice(Math.floor(rng() * moverOptions.length), 1)[0];
      if (chunkMovers.some((o) => Math.abs(o.y0 - m.y0) < 300 && Math.abs(o.x0 - m.x0) < 500)) continue;
      const mover = Object.assign(m, { w: 110, period: 8 + rng() * 4, offset: rng() * 10, rider: null, x: m.x0, y: m.y0, u: 0 });
      chunkMovers.push(mover);
      addEdge({ type: 'ride', a: m.a, b: m.b, ax: m.ax, bx: m.bx, mover });
    }

    // ---- 6. Which platforms can be reached? Walk the graph from the entry floor.
    const reached = new Set([entry]);
    const todo = [entry];
    while (todo.length) {
      for (const { to } of todo.pop().edges) {
        if (to.chunk === c && !reached.has(to)) {
          reached.add(to);
          todo.push(to);
        }
      }
    }
    const linkedBelow = below.some((s) => s.edges.some((e) => reached.has(e.to)));
    const good = reached.has(exitLeft) && reached.has(exitRight) && linkedBelow && reached.size >= list.length * 0.8;
    if (!good) {
      // Throw this try away: remove its segments and the edges that point to them.
      segs.length = firstId;
      for (const s of below) s.edges = s.edges.filter((e) => e.to.id < firstId);
      return null;
    }
    for (const s of list) s.alive = reached.has(s);

    // ---- 7. Springs: launch up 2 or 3 levels. Only where the whole arc is free.
    const chunkSprings = [];
    const springOptions = [];
    const alive = list.filter((s) => s.alive);
    for (const A of alive) {
      for (const B of alive) {
        const dy = B.y - A.y;
        if (dy < LEVEL_H * 2 || dy > LEVEL_H * 3 || A.step) continue;
        const tries = B.kind === 'cloud' ? [[(Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2, (Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2]] : [[B.x0 - 80, B.x0 + 26], [B.x1 + 80, B.x1 - 26]];
        for (const [ax, bx] of tries) {
          if (ax < A.x0 + 36 || ax > A.x1 - 36 || bx < B.x0 + 10 || bx > B.x1 - 10) continue;
          if (chunkLadders.some((l) => Math.abs(l.x - ax) < 70) || chunkMovers.some((m) => ax > m.x0 - 60 && ax < m.x1 + 170 && A.y <= m.y1 && B.y >= m.y0)) continue;
          if (clearArc(ax, A.y, bx, B.y, 70, solids)) springOptions.push({ type: 'spring', a: A, b: B, ax, bx, h: 70, boing: -10 });
        }
      }
    }
    for (let i = 0; i < 2 && springOptions.length; i++) {
      const spring = springOptions.splice(Math.floor(rng() * springOptions.length), 1)[0];
      if (chunkSprings.some((o) => o.a === spring.a)) continue;
      chunkSprings.push(addEdge(spring));
    }

    return { segs: list, ladders: chunkLadders, springs: chunkSprings, movers: chunkMovers, entry };
  }

  // Make sure chunks 0..c exist.
  function ensureChunks(c) {
    while (chunks.length <= c) {
      const index = chunks.length;
      const below = index === 0 ? [ground] : chunks[index - 1].segs.filter((s) => s.y >= levelY(index - 1, LEVELS - 2));
      let chunk = null;
      for (let attempt = 0; attempt < 60 && !chunk; attempt++) {
        chunk = buildChunk(index, seededRandom(hashString(`${daySeed}:${index}:${attempt}`)), below);
      }
      if (!chunk) throw new Error('Could not build chunk ' + index);
      chunks.push(chunk);
      ladders.push(...chunk.ladders);
      springs.push(...chunk.springs);
      movers.push(...chunk.movers);
    }
  }

  const towerTop = () => FIRST_Y + Math.max(1, chunks.length) * CHUNK_H;

  // Shortest way through the graph from one segment to another: a list of { edge, rev }.
  function findRoute(from, to) {
    if (from === to) return [];
    const came = new Map([[from, null]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const seg = queue[i];
      for (const link of seg.edges) {
        if (came.has(link.to) || !link.to.alive) continue;
        came.set(link.to, { link, prev: seg });
        if (link.to === to) {
          const route = [];
          for (let step = came.get(to); step; step = came.get(step.prev)) route.unshift(step.link);
          return route;
        }
        queue.push(link.to);
      }
    }
    return null;
  }

  // ---------- Wobbels ----------
  let entities = [];
  const known = new Set();
  let epoch = null;
  let lastId = null; // id of the newest world wobbel we received (for ?since=)
  let firstLoad = true; // true until the first list has arrived
  let clock = 0; // seconds since the page started
  let stars = []; // little stars when a new wobbel lands
  let followQueue = []; // new wobbels the camera still has to follow

  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const homeSegs = (home) => chunks[home].segs.filter((s) => s.alive && !s.step);

  // A free place to stand on a segment: as far as possible from the wobbels that are already there.
  function standX(seg, self) {
    const lo = seg.x0 + 20, hi = seg.x1 - 20;
    if (hi <= lo) return (seg.x0 + seg.x1) / 2;
    const others = entities.filter((e) => e !== self && e.seg === seg);
    let best = random(lo, hi), bestRoom = -1;
    for (let i = 0; i < 5; i++) {
      const x = random(lo, hi);
      const room = Math.min(...others.map((e) => Math.abs(e.x - x)), 999);
      if (room > bestRoom) {
        best = x;
        bestRoom = room;
      }
    }
    return best;
  }

  // A segment in the home zone that is not full yet.
  function pickHomeSeg(home, self) {
    const list = homeSegs(home);
    for (let i = 0; i < 6; i++) {
      const seg = list[Math.floor(Math.random() * list.length)];
      const room = Math.max(1, Math.floor((seg.x1 - seg.x0) / 130));
      const sameLevel = entities.filter((e) => e !== self && e.seg && e.seg.y === seg.y).length;
      if (entities.filter((e) => e !== self && e.seg === seg).length < room && sameLevel < 6) return seg;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function addWobbel(wobbel, isNew) {
    const index = entities.length;
    const home = Number.isInteger(wobbel.home) ? wobbel.home : Math.floor(index / PER_CHUNK);
    ensureChunks(home);
    const bounds = Wobbel.boundsOf(wobbel);
    const legs = (wobbel.stickers || []).find((s) => STYLES[s.type]);
    const e = {
      wobbel, home, bounds,
      fit: Wobbel.fitScale(bounds),
      anim: Wobbel.makeAnim(),
      gait: Wobbel.gaitOf(wobbel),
      style: legs ? STYLES[legs.type] : DEFAULT_STYLE,
      sprite: null, spriteBig: false,
      seg: null, x: 0, y: 0, dir: Math.random() < 0.5 ? -1 : 1,
      state: 'home', // wait | fall | home
      route: [], move: null, targetX: null,
      timer: random(0, 6), phase: random(0, 6), moving: 0, landTime: 0, busy: 0,
      big: 1, spot: 0, arriving: false, sx: 1, sy: 1,
    };
    if (isNew) {
      // Lands one chunk under its home (or on the ground), then climbs up.
      e.landSeg = home === 0 ? ground : chunks[home - 1].entry;
      e.x = random(e.landSeg.x0 + 80, e.landSeg.x1 - 80);
      e.y = e.landSeg.y + 1600;
      e.state = 'wait';
      e.arriving = true;
      e.big = NEW_SCALE;
      e.spot = NEW_SECONDS;
      e.vy = 0;
      followQueue.push(e);
      // Too many at once: the camera only follows the last few. The others just arrive.
      while (followQueue.length > MAX_FOLLOW) followQueue.shift().state = 'fall';
    } else {
      e.seg = pickHomeSeg(home, e);
      e.x = standX(e.seg, e);
      e.y = e.seg.y;
    }
    entities.push(e);
  }

  // Walk towards x on the current segment. Returns true when it is there.
  function walkTo(e, x, dt, speed) {
    const dx = x - e.x;
    if (Math.abs(dx) < 3) {
      e.x = x;
      return true;
    }
    e.dir = dx > 0 ? 1 : -1;
    const step = e.gait.speed * R * 0.55 * e.style.walk * speed * dt;
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
    e.phase += e.gait.stepHz * Math.PI * 0.9 * e.style.walk * speed * dt;
    e.walking = true;
    return false;
  }

  const jumpMove = (e, x1, y1, h, seconds, to) => ({ type: 'jump', x0: e.x, y0: e.y, x1, y1, h, t: 0, dur: seconds, to });

  // Start the next step of the route: first walk to the right spot, then begin the move.
  function startStep(e, dt) {
    const { edge, rev, to } = e.route[0];
    const speed = e.arriving ? 1.8 : 1;
    const quick = (e.arriving ? 0.8 : 1) * e.style.time;
    if (edge.type === 'jump') {
      const from = edge.flex ? clamp(e.x, edge.flex[0], edge.flex[1]) : rev ? edge.bx : edge.ax;
      if (!walkTo(e, from, dt, speed)) return;
      const landX = edge.flex ? from : rev ? edge.ax : edge.bx;
      const far = Math.hypot(landX - e.x, to.y - e.y);
      e.move = jumpMove(e, landX, to.y, edge.h, (0.38 + far / 520) * quick, to);
    } else if (edge.type === 'ladder') {
      if (!walkTo(e, rev ? edge.bx : edge.x, dt, speed)) return;
      // Up: climb, then step onto the platform. Down: step onto the ladder, then climb down.
      e.move = rev ? { type: 'ladder', phase: 'hop', hop: jumpMove(e, edge.x, edge.b.y, 16, 0.28, null), edge, rev, to } : { type: 'ladder', phase: 'climb', edge, rev, to };
    } else if (edge.type === 'spring') {
      if (!walkTo(e, edge.ax, dt, speed)) return;
      e.move = { type: 'spring', phase: 'press', t: 0, edge, to };
    } else if (edge.type === 'ride') {
      if (!walkTo(e, rev ? edge.bx : edge.ax, dt, speed)) return;
      e.move = { type: 'ride', phase: 'wait', t: 0, edge, rev, to };
    }
    e.route.shift();
    e.seg.count--;
    e.seg = null;
  }

  function land(e, seg) {
    e.seg = seg;
    e.y = seg.y;
    e.move = null;
    e.landTime = 0.25;
    if (e.arriving && seg.chunk === e.home) {
      e.arriving = false;
      Hooks.onWobbelReachHome(e.wobbel);
    }
  }

  // Move along a jump arc. Returns true when it has landed.
  function advanceJump(e, jump, dt) {
    jump.t = Math.min(1, jump.t + dt / jump.dur);
    [e.x, e.y] = arcPoint(jump.x0, jump.y0, jump.x1, jump.y1, jump.h, jump.t);
    if (jump.x1 !== jump.x0) e.dir = jump.x1 > jump.x0 ? 1 : -1;
    const up = Math.sin(jump.t * Math.PI);
    e.sy = 1 + e.style.stretch * up;
    return jump.t >= 1;
  }

  function advanceMove(e, dt) {
    const m = e.move;
    if (m.type === 'jump') {
      if (advanceJump(e, m, dt)) land(e, m.to);
    } else if (m.type === 'ladder') {
      const { edge } = m;
      if (m.phase === 'hop') {
        if (advanceJump(e, m.hop, dt)) {
          if (m.rev) m.phase = 'climb';
          else land(e, m.to);
        }
      } else {
        // Climb: straight up or down, the legs keep moving.
        const goal = m.rev ? edge.a.y : edge.b.y;
        const step = 120 * (e.arriving ? 1.6 : 1) * dt;
        e.x = edge.x;
        e.y += Math.sign(goal - e.y) * Math.min(Math.abs(goal - e.y), step);
        e.phase += 9 * dt;
        e.walking = true;
        if (e.y === goal) {
          if (m.rev) land(e, m.to);
          else {
            m.phase = 'hop';
            m.hop = jumpMove(e, edge.bx, edge.b.y, 16, 0.28, null);
          }
        }
      }
    } else if (m.type === 'spring') {
      m.t += dt;
      if (m.phase === 'press') {
        // The spring is pushed down for a moment, then it shoots the wobbel up.
        e.sy = 1 - 0.3 * Math.sin(Math.min(1, m.t / 0.2) * Math.PI * 0.5);
        if (m.t >= 0.2) {
          m.phase = 'fly';
          m.edge.boing = clock;
          m.jump = jumpMove(e, m.edge.bx, m.to.y, m.edge.h, 0.95 * Math.max(0.85, e.style.time), m.to);
        }
      } else if (advanceJump(e, m.jump, dt)) land(e, m.to);
      else e.sy = 1 + 0.3 * Math.sin(m.jump.t * Math.PI);
    } else if (m.type === 'ride') {
      const mover = m.edge.mover;
      const startU = m.rev ? 1 : 0;
      m.t += dt;
      if (m.phase === 'wait') {
        // Wait at the edge until the platform is here and free.
        if (!mover.rider && Math.abs(mover.u - startU) < 0.012) {
          mover.rider = e;
          m.phase = 'on';
          m.hop = jumpMove(e, mover.x + mover.w / 2, mover.y, 16, 0.3, null);
        } else if (m.t > 30) {
          // Waited too long (someone else keeps using it): give up and stay here.
          e.route = [];
          land(e, m.rev ? m.edge.b : m.edge.a);
        }
      } else if (m.phase === 'on') {
        m.hop.x1 = mover.x + mover.w / 2;
        m.hop.y1 = mover.y;
        if (advanceJump(e, m.hop, dt)) m.phase = 'ride';
      } else if (m.phase === 'ride') {
        // The platform carries the wobbel.
        e.x = mover.x + mover.w / 2;
        e.y = mover.y;
        if (Math.abs(mover.u - (1 - startU)) < 0.012) {
          m.phase = 'off';
          m.hop = jumpMove(e, m.rev ? m.edge.ax : m.edge.bx, m.to.y, 16, 0.3, null);
        }
      } else if (advanceJump(e, m.hop, dt)) {
        mover.rider = null;
        land(e, m.to);
      }
    }
    if (e.seg) e.seg.count++;
  }

  function updateEntity(e, dt) {
    Wobbel.updateAnim(e.anim, dt, true);
    e.walking = false;
    e.sy += (1 - e.sy) * Math.min(1, dt * 10);
    if (e.landTime > 0) e.landTime -= dt;
    // New wobbel: big for 10 seconds, then it shrinks smoothly to the normal size.
    if (e.spot > 0 && e.state !== 'wait' && followQueue[0] !== e && !followQueue.includes(e)) e.spot = Math.max(0, e.spot - dt);
    const wanted = e.spot > 0 ? NEW_SCALE : 1;
    e.big += (wanted - e.big) * Math.min(1, dt * 2);

    if (e.state === 'wait') return; // the camera is still on its way
    if (e.state === 'fall') {
      e.vy += 2600 * dt;
      e.y -= e.vy * dt;
      if (e.y <= e.landSeg.y) {
        e.state = 'home';
        e.seg = e.landSeg;
        e.seg.count++;
        e.y = e.seg.y;
        e.landTime = 0.5;
        for (let i = 0; i < 7; i++) stars.push({ x: e.x, y: e.y + 10, vx: random(-260, 260), vy: random(180, 420), life: 1, size: random(8, 16) });
        Hooks.onWobbelLandInWorld(e.wobbel);
        const target = pickHomeSeg(e.home, e);
        e.route = findRoute(e.seg, target) || [];
        e.targetX = null;
      }
      return;
    }

    if (e.move) {
      e.busy += dt;
      advanceMove(e, dt);
    } else if (e.route.length) {
      e.busy += dt;
      startStep(e, dt);
    } else {
      // At rest: stand, walk a bit, or go and play somewhere else in the home zone.
      e.busy = 0;
      if (e.targetX !== null && walkTo(e, e.targetX, dt, 1)) e.targetX = null;
      e.timer -= dt;
      if (e.timer <= 0 && e.targetX === null) {
        const roll = Math.random();
        if (roll < 0.5) e.timer = random(4, 10); // idle: blink and look around
        else if (roll < 0.75) {
          e.targetX = standX(e.seg, e);
          e.timer = random(3, 7);
        } else {
          const target = pickHomeSeg(e.home, e);
          const route = findRoute(e.seg, target);
          if (route && route.length <= 7) e.route = route;
          e.timer = random(4, 9);
        }
      }
    }
    e.moving += ((e.walking ? 1 : 0) - e.moving) * Math.min(1, dt * 8);
  }

  // ---------- Camera ----------
  let W = 0, H = 0, dpr = 1, scale = 1, viewH = 1080;
  let camY = -90; // world y at the bottom of the screen
  let panTime = 0;
  let followTime = 0;
  let hold = null; // debug: { y, until }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    scale = W / VIEW_W;
    viewH = H / scale;
    for (const e of entities) e.sprite = null; // make the sprites again at the new size
  }

  const camMin = () => -90;
  const camMax = () => Math.max(camMin(), towerTop() + 200 - viewH);
  const smooth = (t) => t * t * (3 - 2 * t);

  // Normal mode: a slow pan from the bottom to the top and back, with a rest at both ends.
  function panGoal(t) {
    const range = camMax() - camMin();
    if (range <= 0) return camMin(); // the whole tower fits on the screen: do not move
    const oneWay = Math.max(41, range / PAN_SPEED);
    const cycle = (oneWay + PAN_PAUSE) * 2;
    const p = t % cycle;
    if (p < oneWay) return camMin() + range * smooth(p / oneWay);
    if (p < oneWay + PAN_PAUSE) return camMax();
    if (p < oneWay * 2 + PAN_PAUSE) return camMax() - range * smooth((p - oneWay - PAN_PAUSE) / oneWay);
    return camMin();
  }

  // After following a wobbel: continue the pan from where the camera is now (no jump).
  function resumePan() {
    const range = camMax() - camMin();
    if (range <= 0) return;
    const oneWay = Math.max(41, range / PAN_SPEED);
    let best = 0, bestGap = Infinity;
    for (let i = 0; i <= 200; i++) {
      const t = (oneWay * i) / 200;
      const gap = Math.abs(panGoal(t) - camY);
      if (gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    panTime = best;
  }

  function updateCamera(dt) {
    let goal;
    const target = followQueue[0];
    if (hold && clock < hold.until) goal = hold.y;
    else if (target) {
      followTime += dt;
      // First go to where the wobbel will land. It only falls when the camera is close.
      goal = (target.state === 'wait' ? target.landSeg.y : target.y) - viewH * 0.35;
      if (target.state === 'wait' && (Math.abs(clamp(goal, camMin(), camMax()) - camY) < 160 || followTime > 6)) {
        target.state = 'fall';
        target.y = camY + viewH + 200;
        followTime = 0;
      }
      const done = target.state === 'home' && !target.arriving && followTime > NEW_SECONDS;
      if (done || followTime > 50) {
        followQueue.shift().spot = 0; // shrinks smoothly back to the normal size
        followTime = 0;
        if (!followQueue.length) resumePan();
      }
    } else {
      panTime += dt;
      goal = panGoal(panTime);
    }
    goal = clamp(goal, camMin(), camMax());
    // Ease towards the goal. The speed is limited, so the camera never jumps.
    const speed = clamp((goal - camY) * 2.2, -CAM_MAX_SPEED, CAM_MAX_SPEED);
    camY += speed * dt;
  }

  // ---------- Polling ----------
  async function poll() {
    const url = '/api/wobbels?status=world' + (lastId ? '&since=' + encodeURIComponent(lastId) : '');
    const data = await Api.get(url);
    if (epoch !== data.epoch) {
      // First answer, a reset or a new day: build an empty tower and load the list again.
      const again = epoch !== null;
      epoch = data.epoch;
      entities = [];
      known.clear();
      followQueue = [];
      stars = [];
      lastId = null;
      firstLoad = true;
      resetTower(data.day || String(data.epoch).slice(0, 10));
      ensureChunks(0);
      if (again) return;
    }
    for (const wobbel of data.wobbels) {
      lastId = wobbel.id;
      if (known.has(wobbel.id)) continue;
      known.add(wobbel.id);
      addWobbel(wobbel, !firstLoad);
    }
    firstLoad = false;
  }

  // ---------- Update ----------
  function update(dt) {
    clock += dt;
    for (const m of movers) {
      // Slides between its two ends and rests a moment at each end.
      const u = clamp(0.5 - 0.62 * Math.cos(((clock + m.offset) / m.period) * Math.PI * 2), 0, 1);
      m.u = u;
      m.x = m.x0 + (m.x1 - m.x0) * u;
      m.y = m.y0 + (m.y1 - m.y0) * u;
    }
    for (const s of segs) s.count = 0;
    for (const e of entities) if (e.seg) e.seg.count++;
    for (const e of entities) updateEntity(e, dt);
    for (const star of stars) {
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.vy -= 900 * dt;
      star.life -= dt * 1.4;
    }
    stars = stars.filter((s) => s.life > 0);
    updateCamera(dt);
  }

  // ---------- Drawing (world x, and -y because the canvas y goes down) ----------
  function drawSeg(s) {
    const y = -s.y;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 3;
    if (s.kind === 'ground') {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW_W, y);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 20; x < VIEW_W; x += 44) {
        ctx.moveTo(x, y + 12);
        ctx.lineTo(x - 16, y + 34);
      }
      ctx.stroke();
    } else if (s.kind === 'floor') {
      ctx.fillRect(s.x0, y, s.x1 - s.x0, s.thick);
      ctx.strokeRect(s.x0, y, s.x1 - s.x0, s.thick);
    } else if (s.kind === 'cloud') {
      // Thin cloud: a row of bumps. You can jump up through it.
      ctx.strokeStyle = '#555';
      ctx.beginPath();
      const n = Math.max(2, Math.round((s.x1 - s.x0) / 44));
      const w = (s.x1 - s.x0) / n;
      ctx.moveTo(s.x0, y + 10);
      for (let i = 0; i < n; i++) ctx.arc(s.x0 + w * (i + 0.5), y + 10, w / 2, Math.PI, 0);
      ctx.arc(s.x1 - 8, y + 12, 8, 0, Math.PI / 2);
      ctx.lineTo(s.x0 + 8, y + 20);
      ctx.arc(s.x0 + 8, y + 12, 8, Math.PI / 2, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Square blocks, each with a small square inside.
      const n = Math.max(1, Math.round((s.x1 - s.x0) / BLOCK));
      const w = (s.x1 - s.x0) / n;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(s.x0 + i * w, y, w, BLOCK);
        ctx.strokeRect(s.x0 + i * w, y, w, BLOCK);
      }
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) ctx.strokeRect(s.x0 + i * w + 10, y + 10, w - 20, BLOCK - 20);
    }
  }

  function drawLadder(l) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const x of [l.x - 15, l.x + 15]) {
      ctx.moveTo(x, -l.a.y);
      ctx.lineTo(x, -l.b.y - 6);
    }
    for (let y = l.a.y + 16; y < l.b.y; y += 22) {
      ctx.moveTo(l.x - 15, -y);
      ctx.lineTo(l.x + 15, -y);
    }
    ctx.stroke();
  }

  function drawSpring(s) {
    // "Boing": after a launch the coil stretches and wobbles back.
    const age = clock - s.boing;
    const stretch = age < 0.9 ? 1 + 0.9 * Math.exp(-5 * age) * Math.cos(age * 30) : 1;
    const height = 26 * stretch;
    const x = s.ax, y = -s.a.y;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    for (let i = 1; i <= 6; i++) ctx.lineTo(x + (i % 2 ? 12 : -12), y - (height * i) / 6);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 20, y - height);
    ctx.lineTo(x + 20, y - height);
    ctx.stroke();
  }

  function drawMover(m) {
    // Dashed track, then the platform with two arrows on it.
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(m.x0 + m.w / 2, -m.y0 + 9);
    ctx.lineTo(m.x1 + m.w / 2, -m.y1 + 9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.fillRect(m.x, -m.y, m.w, 18);
    ctx.strokeRect(m.x, -m.y, m.w, 18);
    ctx.fillStyle = '#000';
    const cx = m.x + m.w / 2, cy = -m.y + 9;
    const sideways = m.x0 !== m.x1;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      if (sideways) {
        ctx.moveTo(cx + d * 34, cy);
        ctx.lineTo(cx + d * 22, cy - 5);
        ctx.lineTo(cx + d * 22, cy + 5);
      } else {
        ctx.moveTo(cx + d * 20, cy - d * 6);
        ctx.lineTo(cx + d * 20 - 6, cy + d * 5);
        ctx.lineTo(cx + d * 20 + 6, cy + d * 5);
      }
      ctx.fill();
    }
  }

  function drawStar(x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? size : size * 0.45;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawEntity(e) {
    const r = R * e.fit * e.big;
    const minLine = MIN_LINE_PX / (r * scale);
    // The drawing is rendered once to an offscreen canvas and reused every frame.
    // A big (new) wobbel gets a sharper one for as long as it is big.
    const wantBig = e.big > 1.15;
    if (e.sprite === null || e.spriteBig !== wantBig) {
      e.sprite = Wobbel.makeSprite(e.wobbel, R * e.fit * (wantBig ? NEW_SCALE : 1) * scale * dpr, MIN_LINE_PX / (R * e.fit * scale)) || false;
      e.spriteBig = wantBig;
    }
    let sy = e.sy + Math.cos(e.phase * 2) * e.gait.squash * e.moving;
    if (e.landTime > 0) sy -= 0.22 * Math.sin((e.landTime / 0.25) * Math.PI);
    if (e.big > 1.05) {
      // Pulsing outline around a new wobbel, so its maker can find and follow it.
      const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
      ctx.save();
      ctx.globalAlpha = clamp(e.big - 1, 0, 1);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -clock * 40;
      ctx.beginPath();
      ctx.arc(e.x, -e.y - r * (Wobbel.heightOf(e.wobbel) / 2), r * (2.3 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    Wobbel.draw(ctx, e.wobbel, {
      x: e.x, y: -e.y, r, sprite: e.sprite, dir: e.dir, minLine,
      phase: e.phase, moving: e.moving,
      bob: -Math.abs(Math.sin(e.phase)) * e.gait.bounce * e.moving,
      sx: 2 - sy, sy,
      blink: e.anim.blink, lookX: e.anim.lookX, lookY: e.anim.lookY,
    });
  }

  // Thin bar on the right: the whole tower, the part that is on the screen, and a dot per wobbel.
  function drawHeightBar() {
    const x = W - 30, top = 30, bottom = H - 30;
    const lo = camMin(), hi = towerTop() + 200;
    const toBar = (y) => bottom - ((y - lo) / (hi - lo)) * (bottom - top);
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fillRect(x - 8, top, 16, bottom - top);
    ctx.strokeRect(x - 8, top, 16, bottom - top);
    for (const e of entities) {
      if (e.state === 'wait') continue;
      const y = toBar(Math.min(hi, e.y + R));
      const isNew = e.big > 1.15;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, isNew ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isNew) {
        // Newest wobbels: a ring that pulses.
        ctx.beginPath();
        ctx.arc(x, y, 9 + 5 * (0.5 + 0.5 * Math.sin(clock * 6)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Frame: the part of the tower that is visible now.
    ctx.lineWidth = 4;
    const frameTop = toBar(Math.min(hi, camY + viewH));
    ctx.strokeRect(x - 14, frameTop, 28, toBar(camY) - frameTop);
  }

  let visible = { platforms: 0, wobbels: 0 };
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    // World coordinates: x * scale, and y measured up from the bottom of the screen.
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, dpr * (H + camY * scale));
    ctx.lineJoin = 'round';

    // Only draw what is on (or close to) the screen.
    const lo = camY - 220, hi = camY + viewH + 220;
    visible = { platforms: 0, wobbels: 0 };
    for (const l of ladders) if (l.b.y > lo && l.a.y < hi) drawLadder(l);
    for (const s of segs) {
      if (s.y < lo || s.y > hi) continue;
      drawSeg(s);
      if (s.y > camY && s.y < camY + viewH) visible.platforms++;
    }
    for (const m of movers) if (m.y1 > lo && m.y0 < hi) drawMover(m);
    for (const s of springs) if (s.a.y > lo && s.a.y < hi) drawSpring(s);

    let newest = [];
    for (const e of entities) {
      if (e.state === 'wait') continue;
      if (e.y < lo - 200 || e.y > hi + 200) {
        e.sprite = null; // far away: free the memory, it is made again when it comes back
        continue;
      }
      visible.wobbels++;
      if (e.big > 1.05) newest.push(e);
      else drawEntity(e);
    }
    for (const e of newest) drawEntity(e); // new wobbels on top

    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 3;
    for (const star of stars) {
      ctx.globalAlpha = Math.min(1, star.life * 2);
      drawStar(star.x, -star.y, star.size);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHeightBar();
    if (showFps) {
      ctx.fillStyle = '#000';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(fps)} fps, ${entities.length} wobbels, ${chunks.length} chunks, ${visible.platforms} platforms in view`, 12, H - 14);
    }
  }

  // ---------- Debug: fake wobbels (only in this browser, not stored on the server) ----------
  function fakeWobbel() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const colors = ['#000000', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#ec407a', '#795548'];
    const body = [];
    const bumps = 3 + Math.floor(Math.random() * 4), size = 0.75 + Math.random() * 0.3;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = size + Math.sin(a * bumps) * 0.12;
      body.push([Math.cos(a) * r, Math.sin(a) * r * 0.95]);
    }
    const strokes = [{ c: pick(colors), w: pick([0.06, 0.1, 0.15]), p: body }];
    if (Math.random() < 0.5) strokes.push({ c: pick(colors), w: 0.08, p: [[-0.6, -0.8], [-1 - Math.random() * 0.4, -1.5], [-0.3, -0.95]] });
    if (Math.random() < 0.5) strokes.push({ c: 'rainbow', h: Math.random() * 360, w: 0.1, p: Array.from({ length: 16 }, (_, i) => [0.7 + i * 0.05, 0.2 + Math.sin(i / 2) * 0.2]) });
    const stickers = [{ type: pick(['eye_round', 'eye_big', 'eye_sleepy', 'eye_angry']), x: -0.3, y: -0.25 }, { type: pick(['eye_round', 'eye_big']), x: 0.3, y: -0.25 }];
    if (Math.random() < 0.7) stickers.push({ type: pick(['mouth_smile', 'mouth_teeth', 'mouth_o']), x: 0, y: 0.35 });
    if (Math.random() < 0.3) stickers.push({ type: pick(['arms_short', 'arms_long']), x: 0, y: 0 });
    if (Math.random() < 0.3) stickers.push({ type: pick(['extra_hat', 'extra_antenna']), x: 0, y: -1 });
    stickers.push({ type: pick(['legs_short', 'legs_long', 'legs_paws']), x: 0, y: 1 });
    const wobbel = { id: 'fake_' + entities.length, strokes, stickers, home: Math.floor(entities.length / PER_CHUNK) };
    if (Math.random() < 0.5) wobbel.fill = pick(colors.slice(1));
    return wobbel;
  }

  function addFake(count, asNew) {
    if (!segs.length) {
      resetTower('debug');
      ensureChunks(0);
    }
    for (let i = 0; i < count; i++) addWobbel(fakeWobbel(), asNew !== false);
  }

  function resetCamera() {
    followQueue = [];
    hold = null;
    panTime = 0;
  }

  if (debug) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:10px;top:10px;display:flex;gap:8px;z-index:5';
    for (const [label, action] of [['+1', () => addFake(1)], ['+10', () => addFake(10)], ['+50', () => addFake(50)], ['camera', resetCamera]]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.style.cssText = 'min-width:0;min-height:44px;padding:0 14px;font-size:16px';
      button.addEventListener('click', action);
      box.appendChild(button);
    }
    document.body.appendChild(box);
  }

  // ---------- Start ----------
  let fps = 60, minFps = 60;
  let lastFrame = performance.now();
  function frame(now) {
    const elapsed = (now - lastFrame) / 1000;
    lastFrame = now;
    if (elapsed > 0) {
      fps += (1 / elapsed - fps) * 0.05;
      minFps = Math.min(minFps, fps);
    }
    if (segs.length) {
      update(Math.min(0.05, elapsed));
      draw();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  Api.poll(poll, POLL_MS);
  requestAnimationFrame(frame);

  // For testing in the browser console.
  window.__world = {
    addFake,
    resetCamera,
    lookAt: (y, seconds) => (hold = { y: y - viewH * 0.4, until: clock + (seconds || 4) }),
    find: (type, phase) => {
      const e = entities.find((x) => x.move && x.move.type === type && (!phase || x.move.phase === phase));
      return e ? { x: Math.round(e.x), y: Math.round(e.y) } : null;
    },
    resetMinFps: () => (minFps = fps),
    getState: () => ({
      count: entities.length,
      chunks: chunks.length,
      segments: segs.length,
      dead: segs.filter((s) => !s.alive).length,
      ladders: ladders.length, springs: springs.length, movers: movers.length,
      fps: Math.round(fps), minFps: Math.round(minFps),
      camY: Math.round(camY), camMax: Math.round(camMax()), viewH: Math.round(viewH),
      visible,
      following: followQueue.length,
      moving: entities.filter((e) => e.move || e.route.length || e.targetX !== null).length,
      moves: entities.reduce((n, e) => (e.move ? ((n[e.move.type] = (n[e.move.type] || 0) + 1), n) : n), {}),
      // Problems. All three must stay 0.
      offWorld: entities.filter((e) => e.state !== 'wait' && e.state !== 'fall' && !(e.x >= 0 && e.x <= VIEW_W && e.y >= -1 && e.y <= towerTop() + 400)).length,
      stuck: entities.filter((e) => e.busy > 90).length,
      notOnPlatform: entities.filter((e) => e.seg && !e.move && (Math.abs(e.y - e.seg.y) > 1 || e.x < e.seg.x0 - 1 || e.x > e.seg.x1 + 1)).length,
      crowded: segs.filter((s) => entities.filter((e) => e.seg === s).length > Math.max(2, Math.floor((s.x1 - s.x0) / 90))).length,
      epoch,
    }),
  };
})();
