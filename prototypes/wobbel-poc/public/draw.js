// iPad page (/draw): make a wobbel in 4 steps, then send it.
//
//   step 0  choose legs
//   step 1  draw (anywhere in the drawing area; the circle is only a guide)
//   step 2  add eyes, mouth and extras (stickers)
//   step 3  send
//
// Only the controls of the current step are visible. There is no text: the next action
// pulses, and a hand shows where to tap when nothing happens for a few seconds.
//
// Layout: the drawing area is the biggest thing on the screen.
//   landscape: controls in a panel left and right of the drawing area
//   portrait:  controls in a zone under the drawing area
// The drawing area, the wobbel and the sticker cards are drawn on one canvas. The buttons are HTML.
// Positions are stored relative to the circle: centre (0,0), radius 1.

(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const undoButton = document.getElementById('undo');
  const backButton = document.getElementById('back');
  const clearButton = document.getElementById('clear');
  const nextButton = document.getElementById('next');
  const sendButton = document.getElementById('send');
  const retryButton = document.getElementById('retry');
  const messageBox = document.getElementById('message');
  const stepsBox = document.getElementById('steps');
  const colorPanel = document.getElementById('colors');
  const toolPanel = document.getElementById('tools');
  const idleBox = document.getElementById('idle');
  const hand = document.getElementById('hand');

  // ---------- Settings ----------
  const COLORS = ['#000000', '#ffffff', '#9e9e9e', '#795548', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#ec407a'];
  const COLOR_NAMES = ['Zwart', 'Wit', 'Grijs', 'Bruin', 'Rood', 'Oranje', 'Geel', 'Groen', 'Blauw', 'Roze'];
  const RAINBOW = 'rainbow'; // the rainbow pen: the colour shifts while drawing
  const RAINBOW_STEP = 5; // same value as in wobbel.js: degrees of hue per point
  const WIDTHS = [0.04, 0.08, 0.15]; // thin, medium, thick (in radii)
  const ERASER_SCALE = 2; // the eraser is wider than the pen
  const EXTENT = Wobbel.EXTENT; // you can draw from -1.8 to 1.8 radii
  const LEG_ROOM = 0.3; // extra room under the drawing area for long legs, in radii
  const BAR_HEIGHT = 88; // top bar with the buttons
  const ZONE_HEIGHT = 140; // portrait: zone under the drawing area
  const SIDE_MIN = 150; // landscape: smallest width of the panels left and right
  const TAB_W = 120, TAB_H = 72; // sticker tabs (step 2)
  const CARD_MAX_W = 110, CARD_MAX_H = 110; // sticker cards
  const GAP = 10;
  const MIN_POINT_DISTANCE = 0.012; // skip points that are closer together than this (in radii)
  const MAX_POINTS = 6000; // stop adding points after this many (server limit is 8000)
  const GRAB_RADIUS = 0.3; // how close a finger must be to pick up a sticker
  const DRAG_START_PX = 10; // moving less than this is a tap, not a drag
  const PALM_PX = 60; // a touch wider than this is a palm, not a finger
  const RETRY_MS = 2000;
  const HINT_MS = 4000; // no input for this long: show the hand
  const IDLE_WARN_MS = 60000; // no input for this long: show the countdown ring
  const IDLE_COUNTDOWN_MS = 10000; // the ring runs out in this time, then everything is cleared
  const SQUASH_MS = 300; // send: the wobbel squashes down first
  const FLY_MS = 800; // send: then it flies up
  const HOLD_MS = 1000; // how long the bin must be held to clear everything
  const DARK = '#222';

  // Sticker tabs of step 2. A tab has no text: its icon is one sticker.
  const TABS = [
    { kinds: ['eye'], icon: 'eye_big' },
    { kinds: ['mouth'], icon: 'mouth_smile' },
    { kinds: ['extra', 'arms'], icon: 'extra_hat' },
  ];
  const typesOfKinds = (kinds) => Object.keys(STICKERS).filter((type) => kinds.includes(STICKERS[type].kind));
  const LEG_TYPES = typesOfKinds(['legs']);
  const kindOf = (type) => STICKERS[type].kind;
  const isSnapKind = (kind) => kind === 'legs' || kind === 'arms';

  // Where a tapped sticker lands (it can be dragged afterwards).
  const SPOTS = {
    mouth: { x: 0, y: 0.3 },
    extra_hat: { x: 0, y: -0.95 },
    extra_bow: { x: 0, y: 0.8 },
    extra_antenna: { x: 0, y: -1.15 },
    extra_tail: { x: 1.1, y: 0.4 },
  };

  // Pictograms (24 x 24 line icons).
  const ICONS = {
    undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
    next: ['M5 12h14', 'm12 5 7 7-7 7'],
    plane: ['M14.5 21.7a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.63-.63l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z', 'm21.85 2.15-10.94 10.94'],
    retry: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
    screen: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8', 'M12 17v4', 'M8 10.5l2.8 2.8L16 7.5'],
    wave: ['M3 12c3-7 6-7 9 0s6 7 9 0'],
    bucket: ['m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z', 'm5 2 5 5', 'M2 13h15', 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z'],
    eraser: ['m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'],
    legs: ['M4 10a8 8 0 0 1 16 0z', 'M9 10v10h3', 'M15 10v10h3'], // half a body with two legs and feet
    back: ['M19 12H5', 'm12 19-7-7 7-7'],
    arrowUp: ['M12 20V5', 'm5 12 7-7 7 7'],
    pencil: ['M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z', 'm15 5 4 4'],
    eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    hand: [
      'M22 14a8 8 0 0 1-8 8',
      'M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
      'M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1',
      'M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10',
      'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
    ],
  };
  const STEP_ICONS = ['legs', 'pencil', 'eye', 'plane'];
  const STEP_NAMES = ['Benen kiezen', 'Tekenen', 'Ogen, mond en extra', 'Versturen'];
  // Icons that need a filled part. "fill" = a body that is half full of paint.
  const ICON_MARKUP = {
    fill: '<circle cx="12" cy="12" r="9"/><path d="M3 12a9 9 0 0 0 18 0z" fill="currentColor"/>',
  };
  const svgIcon = (name, style) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}>` +
    (ICON_MARKUP[name] || ICONS[name].map((d) => `<path d="${d}"/>`).join('')) +
    '</svg>';

  // ---------- State ----------
  let strokes = []; // finished strokes: [{ c, w, p: [[x,y],...], h? }, ...]
  let stickers = []; // [{ type, x, y }]
  let fill = null; // colour of the body circle (fill tool), or null
  let history = []; // snapshots for Undo: { step, fill, strokes, stickers }
  let step = 0;
  let maxStep = 0; // furthest step reached: steps up to here can be tapped
  let currentStroke = null; // stroke that is being drawn right now
  let press = null; // finger is down on a placed sticker, not moved yet: { index, x, y }
  let drag = null; // sticker that is being dragged: { type, x, y } in screen pixels
  let dragBackup = null; // state before the drag, to restore on cancel
  let activePointer = null; // only the first finger counts
  let mode = 'draw'; // 'draw' | 'sending' | 'flying' | 'sent'
  let flyStart = 0;
  let pending = null; // payload that is being sent
  let retryTimer = null;
  let color = COLORS[0]; // a hex colour, or RAINBOW
  let tool = 'pen'; // 'pen' | 'erase' | 'fill'
  let rainbowHue = 0; // where the next rainbow stroke starts
  let widthIndex = 1;
  let activeTab = 0;
  let lastInput = performance.now();
  let attract = true; // nobody is playing: show the legs one by one
  let legWiggleStart = -1e9; // legs wiggle once when chosen
  let wiggle = null; // { sticker, start }: a sticker wiggles after it is placed
  let holdStart = 0; // bin is being held since this time (0 = not held)
  let pressedCard = null; // { type, time }: the card that was just tapped
  let blockedTap = 0; // time of the last button touch that was refused (palm, or while drawing)
  const anim = Wobbel.makeAnim();

  // The drawing is kept in two layers, so it is not redrawn line by line every frame:
  //   doneLayer = all finished strokes
  //   workLayer = doneLayer + the stroke that is being drawn
  let doneLayer = null;
  let workLayer = null;
  let layerDirty = true;

  // ---------- Layout ----------
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let land = false; // landscape
  let side = 0; // landscape: width of the panels left and right of the drawing area
  let area = { x: 0, y: 0, w: 0, h: 0 }; // the drawing area on the screen

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    land = W > H;
    const unitsHigh = EXTENT * 2 + LEG_ROOM;
    if (land) R = Math.min((H - BAR_HEIGHT - 16) / unitsHigh, (W - SIDE_MIN * 2) / (EXTENT * 2));
    else R = Math.min((W - 40) / (EXTENT * 2), (H - BAR_HEIGHT - ZONE_HEIGHT - TAB_H - 20) / unitsHigh); // tabs sit above the zone
    R = Math.max(40, R);
    area = { w: R * EXTENT * 2, h: R * unitsHigh };
    area.x = (W - area.w) / 2;
    area.y = BAR_HEIGHT + (land ? (H - BAR_HEIGHT - area.h) / 2 : 4);
    cx = W / 2;
    cy = area.y + R * EXTENT;
    side = area.x;
    document.body.classList.toggle('land', land);
    document.body.style.setProperty('--side', side + 'px');
    doneLayer = Wobbel.makeLayer(R * dpr);
    workLayer = Wobbel.makeLayer(R * dpr);
    layerDirty = true;
  }

  const toUnit = (px, py) => [(px - cx) / R, (py - cy) / R];
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const legsSticker = () => stickers.find((s) => kindOf(s.type) === 'legs');
  const hasLegs = () => Boolean(legsSticker());
  const freeStickerCount = () => stickers.filter((s) => kindOf(s.type) !== 'legs').length;
  const pointCount = () => strokes.reduce((n, s) => n + s.p.length, 0);
  const clampArea = (n) => Math.max(-EXTENT, Math.min(EXTENT, n));
  const inArea = (ux, uy) => Math.abs(ux) <= EXTENT && Math.abs(uy) <= EXTENT;
  const rainbowColor = (hue) => `hsl(${hue % 360}, 90%, 55%)`;
  const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  // The part of the screen that holds the sticker cards.
  // Landscape: the panel on the right. Portrait: the zone under the drawing area.
  function trayRect() {
    return land ? { x: W - side, y: BAR_HEIGHT, w: side, h: H - BAR_HEIGHT } : { x: 0, y: H - ZONE_HEIGHT, w: W, h: ZONE_HEIGHT };
  }

  // The tab buttons of step 2: [{ index, x, y, w, h }].
  // Landscape: stacked in the left panel. Portrait: a row at the top of the bottom zone.
  function tabRects() {
    if (step !== 2) return [];
    return TABS.map((tab, index) => {
      if (land) {
        const total = TABS.length * TAB_H + (TABS.length - 1) * GAP;
        return { index, x: (side - TAB_W) / 2, y: BAR_HEIGHT + (H - BAR_HEIGHT - total) / 2 + index * (TAB_H + GAP), w: TAB_W, h: TAB_H };
      }
      const total = TABS.length * TAB_W + (TABS.length - 1) * GAP;
      return { index, x: (W - total) / 2 + index * (TAB_W + GAP), y: H - ZONE_HEIGHT - TAB_H - 6, w: TAB_W, h: TAB_H };
    });
  }

  // The sticker cards of this step: [{ type, x, y, w, h }]. Empty in steps 1 and 3.
  function cardRects() {
    if (step !== 0 && step !== 2) return [];
    const types = step === 0 ? LEG_TYPES : typesOfKinds(TABS[activeTab].kinds);
    const tray = trayRect();
    if (land) {
      const cols = types.length > 3 ? 2 : 1;
      const rows = Math.ceil(types.length / cols);
      const w = Math.min(CARD_MAX_W, (tray.w - GAP * (cols + 1)) / cols);
      const h = Math.min(CARD_MAX_H, w, (tray.h - GAP * (rows + 1)) / rows);
      const left = tray.x + (tray.w - cols * w - (cols - 1) * GAP) / 2;
      const top = tray.y + (tray.h - rows * h - (rows - 1) * GAP) / 2;
      return types.map((type, i) => ({ type, x: left + (i % cols) * (w + GAP), y: top + Math.floor(i / cols) * (h + GAP), w, h }));
    }
    const h = Math.min(CARD_MAX_H, tray.h - GAP * 2);
    const top = tray.y + (tray.h - h) / 2;
    const w = Math.min(CARD_MAX_W, (W - GAP * (types.length + 1)) / types.length);
    const left = (W - types.length * w - (types.length - 1) * GAP) / 2;
    return types.map((type, i) => ({ type, x: left + i * (w + GAP), y: top, w, h }));
  }

  // ---------- Buttons that are built once ----------
  function buildControls() {
    STEP_ICONS.forEach((icon, index) => {
      const button = document.createElement('button');
      button.innerHTML = svgIcon(icon);
      button.setAttribute('aria-label', STEP_NAMES[index]);
      button.addEventListener('click', () => {
        if (mode === 'draw' && index <= maxStep && index !== step) setStep(index);
      });
      stepsBox.appendChild(button);
    });
    COLORS.forEach((value, index) => {
      const button = document.createElement('button');
      button.className = 'color';
      button.style.background = value;
      button.setAttribute('aria-label', COLOR_NAMES[index]);
      button.addEventListener('click', () => chooseColor(value));
      colorPanel.appendChild(button);
    });
    const rainbow = document.createElement('button');
    rainbow.className = 'color rainbow';
    rainbow.setAttribute('aria-label', 'Regenboog');
    rainbow.addEventListener('click', () => chooseColor(RAINBOW));
    colorPanel.appendChild(rainbow);
    // Exactly one of pencil / eraser / fill is selected at any time.
    for (const [name, icon, label] of [['pen', 'pencil', 'Potlood'], ['erase', 'eraser', 'Gom'], ['fill', 'fill', 'Lijf vullen']]) {
      const button = document.createElement('button');
      button.className = 'tool';
      button.dataset.tool = name;
      button.innerHTML = svgIcon(icon);
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        tool = name;
        refresh();
      });
      toolPanel.appendChild(button);
    }
    WIDTHS.forEach((value, index) => {
      const button = document.createElement('button');
      button.className = 'width';
      // A wavy line, as thick as the pen will draw.
      button.innerHTML = svgIcon('wave', `stroke-width:${[1.6, 3.6, 7][index]}`);
      button.setAttribute('aria-label', ['Dunne lijn', 'Gewone lijn', 'Dikke lijn'][index]);
      button.addEventListener('click', () => {
        widthIndex = index;
        refresh();
      });
      toolPanel.appendChild(button);
    });
    undoButton.innerHTML = svgIcon('undo');
    backButton.innerHTML = svgIcon('back');
    clearButton.innerHTML = '<span>' + svgIcon('trash') + '</span>';
    nextButton.innerHTML = svgIcon('next');
    sendButton.innerHTML = svgIcon('plane');
    retryButton.innerHTML = svgIcon('retry'); // no text: a retry arrow
    hand.innerHTML = svgIcon('hand');
    idleBox.innerHTML = '<span>' + svgIcon('hand') + '</span>';
  }

  // Picking a colour also puts the eraser away. The fill tool stays: it uses the new colour.
  function chooseColor(value) {
    color = value;
    if (tool === 'erase') tool = 'pen';
    refresh();
  }

  // Can the child go on to the next step?
  function canGoNext() {
    if (step === 0) return hasLegs();
    if (step === 1) return strokes.length > 0 || Boolean(fill);
    return step === 2;
  }

  // Show only what the current step needs. Nothing is "disabled": it is there or it is not.
  function refresh() {
    const playing = mode === 'draw';
    [...stepsBox.children].forEach((b, i) => {
      b.classList.toggle('current', i === step);
      b.classList.toggle('done', i !== step && i <= maxStep);
    });
    colorPanel.querySelectorAll('.color').forEach((b, i) => b.classList.toggle('selected', tool !== 'erase' && (COLORS[i] || RAINBOW) === color));
    toolPanel.querySelectorAll('.width').forEach((b, i) => b.classList.toggle('selected', i === widthIndex));
    toolPanel.querySelectorAll('.tool').forEach((b) => b.classList.toggle('selected', b.dataset.tool === tool));
    colorPanel.hidden = toolPanel.hidden = !(playing && step === 1);
    const top = history[history.length - 1];
    undoButton.hidden = !(playing && top && top.step === step);
    clearButton.hidden = !(playing && step > 0 && step < 3);
    backButton.hidden = !(playing && step > 0);
    nextButton.hidden = !(playing && canGoNext());
    // Pulse = "this is the next thing to tap". In step 2 only after the first sticker.
    nextButton.classList.toggle('pulse', step !== 2 || freeStickerCount() > 0);
    sendButton.hidden = !(playing && step === 3);
    hideHand();
  }

  function setStep(next) {
    step = next;
    maxStep = Math.max(maxStep, step);
    currentStroke = null;
    press = null;
    drag = null;
    refresh();
  }

  // ---------- Undo ----------
  function snapshot() {
    // Finished strokes never change, so a shallow copy is enough.
    return { step, fill, strokes: strokes.slice(), stickers: stickers.map((s) => Object.assign({}, s)) };
  }

  function remember() {
    history.push(snapshot());
    if (history.length > 100) history.shift();
  }

  // Undo never takes the legs away: they are chosen in step 0, not undone.
  function restore(snap) {
    const legs = legsSticker();
    strokes = snap.strokes;
    fill = snap.fill;
    stickers = snap.stickers.filter((s) => kindOf(s.type) !== 'legs');
    if (legs) stickers.push(legs);
    layerDirty = true;
  }

  // ---------- Pointer input ----------
  // Which placed free sticker is under the finger? Returns its index, or -1.
  function findStickerAt(ux, uy) {
    let best = -1;
    let bestDistance = GRAB_RADIUS;
    stickers.forEach((s, i) => {
      if (isSnapKind(kindOf(s.type))) return;
      const d = Math.hypot(s.x - ux, s.y - uy);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    return best;
  }

  function placeSticker(type, spot) {
    const kind = kindOf(type);
    const sticker = { type, x: 0, y: 0 }; // no colour: stickers have their own fixed colours
    if (kind === 'legs') {
      // Exactly one pair of legs. Choosing other legs swaps them. Not part of Undo.
      stickers = stickers.filter((s) => kindOf(s.type) !== 'legs');
      sticker.y = 1;
      legWiggleStart = performance.now();
    } else if (kind === 'arms') {
      // One pair of arms. Tapping the chosen arms again takes them off.
      const had = stickers.some((s) => s.type === type);
      remember();
      stickers = stickers.filter((s) => kindOf(s.type) !== 'arms');
      if (had) return;
      legWiggleStart = performance.now(); // arms swing together with the legs
    } else {
      remember();
      sticker.x = round3(spot.x);
      sticker.y = round3(spot.y);
      wiggle = { sticker, start: performance.now() };
    }
    stickers.push(sticker);
  }

  // Default place of a tapped sticker. Eyes go left, right, left, ... so they do not stack.
  function tapSpot(type) {
    const kind = kindOf(type);
    if (kind === 'eye') {
      const count = stickers.filter((s) => kindOf(s.type) === 'eye').length;
      return { x: count % 2 === 0 ? -0.32 : 0.32, y: -0.3 - 0.3 * (Math.floor(count / 2) % 2) };
    }
    return SPOTS[type] || SPOTS[kind] || { x: 0, y: -0.95 };
  }

  const isPalm = (e) => e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) > PALM_PX;

  function onPointerDown(e) {
    // Only the first finger counts. Extra fingers and palms are ignored.
    if (mode !== 'draw' || activePointer !== null || isPalm(e)) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    const [ux, uy] = toUnit(x, y);

    const tab = tabRects().find((r) => inRect(r, x, y));
    const card = cardRects().find((r) => inRect(r, x, y));
    if (tab) {
      activeTab = tab.index;
      return;
    }
    if (card) {
      dragBackup = snapshot();
      drag = { type: card.type, x, y, startX: x, startY: y, moved: false };
      pressedCard = { type: card.type, time: performance.now() }; // thick border for a moment
    } else if (step === 1) {
      if (!inArea(ux, uy)) return;
      if (tool === 'fill') {
        // Fill tool: a tap inside the circle colours the whole body, under the drawing.
        if (Math.hypot(ux, uy) > 1) return;
        remember();
        fill = color === RAINBOW ? rainbowHex(rainbowHue) : color;
        rainbowHue += 40;
        tool = 'pen';
        refresh();
        return;
      }
      if (pointCount() >= MAX_POINTS) return;
      if (tool === 'erase') currentStroke = { c: 'erase', w: WIDTHS[widthIndex] * ERASER_SCALE, p: [[ux, uy]] };
      else if (color === RAINBOW) currentStroke = { c: RAINBOW, h: Math.round(rainbowHue % 360), w: WIDTHS[widthIndex], p: [[ux, uy]] };
      else currentStroke = { c: color, w: WIDTHS[widthIndex], p: [[ux, uy]] };
    } else if (step === 2) {
      const index = findStickerAt(ux, uy);
      if (index < 0) return;
      press = { index, x, y };
    } else {
      return;
    }
    activePointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointer) return;
    e.preventDefault();
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_START_PX) {
      // The finger moved: pick the sticker up.
      const sticker = stickers[press.index];
      dragBackup = snapshot();
      drag = { type: sticker.type, x: e.clientX, y: e.clientY, placed: true, moved: true };
      stickers.splice(press.index, 1);
      press = null;
    }
    if (drag) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.placed && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > DRAG_START_PX) drag.moved = true;
      return;
    }
    if (currentStroke) {
      // Coalesced events give a smoother line with the Apple Pencil and fast fingers.
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const points = currentStroke.p;
      for (const ev of events.length ? events : [e]) {
        const [ux, uy] = toUnit(ev.clientX, ev.clientY).map(clampArea);
        const last = points[points.length - 1];
        if (Math.hypot(ux - last[0], uy - last[1]) < MIN_POINT_DISTANCE) continue;
        if (points.length + pointCount() >= MAX_POINTS) break;
        points.push([ux, uy]);
      }
    }
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointer) return;
    e.preventDefault();
    activePointer = null;

    if (currentStroke) {
      remember();
      const stroke = { c: currentStroke.c, w: currentStroke.w, p: currentStroke.p.map((p) => [round3(p[0]), round3(p[1])]) };
      if (stroke.c === RAINBOW) {
        stroke.h = currentStroke.h;
        rainbowHue += stroke.p.length * RAINBOW_STEP; // the next rainbow line goes on where this one stopped
      }
      strokes.push(stroke);
      currentStroke = null;
      layerDirty = true;
    } else if (press) {
      // A tap on a placed sticker: wiggle, to show it can be moved.
      wiggle = { sticker: stickers[press.index], start: performance.now() };
      press = null;
    } else if (drag) {
      const kind = kindOf(drag.type);
      const onTray = inRect(trayRect(), e.clientX, e.clientY);
      if (!drag.moved) {
        // A tap on a card: the sticker jumps to its place.
        placeSticker(drag.type, tapSpot(drag.type));
      } else if (!onTray) {
        if (drag.placed) history.push(dragBackup);
        if (isSnapKind(kind)) {
          placeSticker(drag.type);
        } else {
          // Stickers can go anywhere in the drawing area, not only inside the circle.
          const [ux, uy] = toUnit(e.clientX, e.clientY);
          const spot = { x: clampArea(ux), y: clampArea(uy) };
          if (drag.placed) stickers.push({ type: drag.type, x: round3(spot.x), y: round3(spot.y) });
          else placeSticker(drag.type, spot);
        }
      } else if (drag.placed) {
        // Dropped on the bin: the sticker is gone.
        history.push(dragBackup);
      }
      drag = null;
      dragBackup = null;
    }
    refresh();
  }

  function onPointerCancel(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    currentStroke = null;
    press = null;
    if (drag) {
      if (drag.placed) restore(dragBackup);
      drag = null;
      dragBackup = null;
    }
    refresh();
  }

  // ---------- Buttons ----------
  // Guard for ALL buttons: a palm that rests on the screen must not press a button,
  // and no button works while a line is being drawn.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const onButton = e.target.closest && e.target.closest('button');
      if (onButton && (isPalm(e) || currentStroke)) {
        blockedTap = performance.now();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      // A real touch: the child is busy. Hide the hand, stop the countdown and the attract animation.
      lastInput = performance.now();
      attract = false;
      idleBox.hidden = true;
      hideHand();
      Hooks.onTap();
    },
    true
  );
  document.addEventListener(
    'click',
    (e) => {
      const onButton = e.target.closest && e.target.closest('button');
      if (onButton && (currentStroke || performance.now() - blockedTap < 700)) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );

  undoButton.addEventListener('click', () => {
    if (mode !== 'draw' || activePointer !== null || history.length === 0) return;
    restore(history.pop());
    refresh();
  });

  backButton.addEventListener('click', () => {
    if (mode === 'draw' && activePointer === null && step > 0) setStep(step - 1);
  });

  nextButton.addEventListener('click', () => {
    if (mode === 'draw' && activePointer === null && canGoNext()) setStep(step + 1);
  });

  // The bin must be held for a second: a ring fills up, then everything is cleared.
  function stopHold() {
    holdStart = 0;
    clearButton.style.setProperty('--p', 0);
  }
  clearButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (mode === 'draw') holdStart = performance.now();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) clearButton.addEventListener(type, stopHold);

  sendButton.addEventListener('click', () => {
    if (mode !== 'draw' || step !== 3 || !hasLegs()) return;
    mode = 'sending';
    // clientId: if the same wobbel is sent twice (retry), the server stores it only once.
    pending = {
      clientId: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
      strokes,
      stickers,
      fill,
    };
    refresh();
    trySend();
  });

  retryButton.addEventListener('click', () => {
    if (mode === 'sending') trySend();
  });

  let sendBusy = false;
  async function trySend() {
    if (sendBusy) return;
    sendBusy = true;
    clearTimeout(retryTimer);
    try {
      const wobbel = await Api.post('/api/wobbels', pending);
      Api.setConnected(true);
      retryButton.hidden = true;
      pending = null;
      Hooks.onWobbelSent(wobbel);
      mode = 'flying';
      flyStart = performance.now();
    } catch (error) {
      if (error.status === 400 || error.status === 413) {
        // The server refused this drawing. Retrying will not help: go back to drawing.
        retryButton.hidden = true;
        pending = null;
        mode = 'draw';
        showMessage(['retry'], 'Dat lukte niet. Probeer nog eens.', 2500);
        setStep(1);
      } else {
        // Server not reachable: keep the drawing, show "Try again", retry automatically.
        Api.setConnected(false);
        retryButton.hidden = false;
        retryTimer = setTimeout(trySend, RETRY_MS);
      }
    } finally {
      sendBusy = false;
    }
  }

  // hsl to "#rrggbb", for a body fill in a rainbow colour (the server only stores hex).
  function rainbowHex(hue) {
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = rainbowColor(hue);
    return probe.fillStyle;
  }

  let messageTimer = null;
  // A message is one or more big pictograms. No text.
  function showMessage(icons, label, ms) {
    clearTimeout(messageTimer);
    messageBox.innerHTML = icons.map((icon) => svgIcon(icon)).join('');
    messageBox.setAttribute('aria-label', label);
    messageBox.hidden = false;
    messageTimer = setTimeout(() => (messageBox.hidden = true), ms);
  }

  // Empty everything and go back to step 0, for the next child.
  function startOver() {
    strokes = [];
    stickers = [];
    fill = null;
    history = [];
    layerDirty = true;
    mode = 'draw';
    tool = 'pen';
    rainbowHue = 0;
    color = COLORS[0];
    widthIndex = 1;
    activeTab = 0;
    maxStep = 0;
    idleBox.hidden = true;
    stopHold();
    setStep(0);
  }

  // ---------- The hand that shows what to do ----------
  // Returns where the hand should tap: a point on the screen, plus draw = true for "draw here".
  function hintTarget() {
    const centerOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    if (step === 3) return centerOf(sendButton);
    if (step === 1 && strokes.length === 0 && !fill) return { x: cx, y: cy, draw: true };
    const cards = cardRects();
    if (cards.length && ((step === 0 && !hasLegs()) || (step === 2 && freeStickerCount() === 0))) {
      const card = cards[Math.min(cards.length - 1, step === 0 ? 1 : 0)];
      return { x: card.x + card.w / 2, y: card.y + card.h / 2 };
    }
    return canGoNext() ? centerOf(nextButton) : null;
  }

  function showHand() {
    const target = hintTarget();
    if (!target) return;
    hand.style.left = target.x + 'px';
    hand.style.top = target.y + 'px';
    hand.className = target.draw ? 'draw' : 'tap';
    hand.hidden = false;
  }

  function hideHand() {
    hand.hidden = true;
  }

  // ---------- Drawing on the canvas ----------
  // Returns the layer to show this frame.
  function currentLayer() {
    if (layerDirty) {
      doneLayer.getContext('2d').clearRect(0, 0, doneLayer.width, doneLayer.height);
      Wobbel.paintStrokes(doneLayer, R * dpr, strokes);
      layerDirty = false;
    }
    if (!currentStroke) return doneLayer;
    const work = workLayer.getContext('2d');
    work.clearRect(0, 0, workLayer.width, workLayer.height);
    work.drawImage(doneLayer, 0, 0);
    Wobbel.paintStrokes(workLayer, R * dpr, [currentStroke]);
    return workLayer;
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The drawing area (subtle border) and the circle (soft dashed guide).
  // Neither is part of the wobbel: they are not sent and not shown on the big screens.
  function drawGuides() {
    roundedRect(area.x, area.y, area.w, area.h, 24);
    ctx.fillStyle = '#ececec'; // light grey, so the white pen is visible
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // No legs yet: grey dashed legs under the circle. While nobody plays, they change and walk.
  function drawMissingLegs(now) {
    const type = attract ? LEG_TYPES[Math.floor(now / 1600) % LEG_TYPES.length] : LEG_TYPES[0];
    ctx.save();
    ctx.setLineDash([0.06, 0.1]); // in radii: drawSticker scales by R
    Wobbel.drawSticker(ctx, type, cx, cy + R, R, '#999', attract ? { phase: now / 160, moving: 1 } : null);
    ctx.restore();
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
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw one sticker as an icon, scaled so it fits in a box (top, room high, cell wide).
  function drawIcon(type, x, top, room, cell, iconColor) {
    const def = STICKERS[type];
    const middle = top + room / 2;
    let unit = Math.min(room * 1.5, cell * 1.2); // eyes and mouths are small: draw them big
    let iconY = middle;
    if (def.kind === 'legs') {
      unit = Math.min(room / (def.height + 0.3), cell * 0.55, 110);
      iconY = middle - (def.height * unit) / 2;
    } else if (def.kind === 'arms') {
      // Arms hang on the sides of the body: show a small grey body, so the icon reads as arms.
      unit = Math.min(room / 2.1, cell / 3, 60);
      ctx.fillStyle = '#999';
      ctx.beginPath();
      ctx.arc(x, iconY, unit, 0, Math.PI * 2);
      ctx.fill();
    } else if (def.kind === 'extra') {
      unit = Math.min(room * 1.2, cell * 0.85);
      iconY = middle + unit * 0.1;
    }
    Wobbel.drawSticker(ctx, type, x, iconY, unit, iconColor);
  }

  // Draw a pictogram from ICONS on the canvas. size = width and height in pixels.
  function drawPictogram(name, x, y, size, strokeColor) {
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of ICONS[name]) ctx.stroke(new Path2D(d));
    ctx.restore();
  }

  // Tabs and sticker cards, or the big bin while a sticker is dragged.
  function drawTray(now) {
    if (drag && drag.moved) {
      // The whole tray is a big bin: drop the sticker there to remove it.
      const tray = trayRect();
      const over = inRect(tray, drag.x, drag.y);
      roundedRect(tray.x + 6, tray.y + 6, tray.w - 12, tray.h - 12, 16);
      ctx.fillStyle = over ? '#ddd' : '#eee';
      ctx.fill();
      drawPictogram('trash', tray.x + tray.w / 2, tray.y + tray.h / 2, over ? 130 : 110, DARK);
      return;
    }

    // Tabs: buttons with a pictogram, no text. The selected tab has a thick border.
    for (const tab of tabRects()) {
      const selected = tab.index === activeTab;
      roundedRect(tab.x, tab.y, tab.w, tab.h, 16);
      ctx.fillStyle = selected ? '#fff' : '#e6e6e6';
      ctx.fill();
      ctx.strokeStyle = DARK;
      ctx.lineWidth = selected ? 7 : 3;
      ctx.stroke();
      drawIcon(TABS[tab.index].icon, tab.x + tab.w / 2, tab.y + 8, tab.h - 16, 110, DARK);
    }

    // Every sticker sits on a card that looks like a button: you choose it, you do not draw it.
    const pulse = step === 0 && !hasLegs() ? 0.5 + 0.5 * Math.sin(now / 220) : 0;
    for (const card of cardRects()) {
      const chosen = isSnapKind(kindOf(card.type)) && stickers.some((s) => s.type === card.type);
      roundedRect(card.x, card.y, card.w, card.h, 16);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = DARK;
      const pressed = pressedCard && pressedCard.type === card.type && now - pressedCard.time < 250;
      ctx.lineWidth = chosen || pressed ? 8 : 3 + pulse * 4;
      ctx.stroke();
      drawIcon(card.type, card.x + card.w / 2, card.y + 14, card.h - 28, card.w - 16, '#000');
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    Wobbel.updateAnim(anim, dt, false); // iPad: eyes only blink

    // Housekeeping that depends on time.
    if (mode === 'draw') {
      const idle = now - lastInput;
      if (holdStart) {
        const p = Math.min(1, (now - holdStart) / HOLD_MS);
        clearButton.style.setProperty('--p', p * 100);
        if (p >= 1) startOver();
      }
      const somethingToLose = step > 0 || stickers.length > 0;
      if (idle > IDLE_WARN_MS && somethingToLose) {
        // Nobody touched the screen for a minute: first a countdown ring, then clear.
        const left = 1 - (idle - IDLE_WARN_MS) / IDLE_COUNTDOWN_MS;
        if (left <= 0) {
          startOver();
          attract = true;
        } else {
          idleBox.hidden = false;
          idleBox.style.setProperty('--left', left * 100);
          hideHand();
        }
      } else if (idle > HINT_MS && hand.hidden && activePointer === null) {
        showHand();
      }
    }

    // Only one bin at a time: the small one hides while a sticker is dragged to the big one.
    clearButton.style.visibility = drag && drag.moved ? 'hidden' : '';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const wobbel = { stickers, fill };
    const feetY = cy + R * (Wobbel.heightOf(wobbel) - 1);
    const sprite = currentLayer();
    // Legs (and arms) wiggle once when chosen. A sticker wiggles after it is placed.
    const legT = (now - legWiggleStart) / 900;
    const moving = legT < 1 ? Math.sin(legT * Math.PI) : 0;
    let stickerWiggle = null;
    if (wiggle) {
      const t = (now - wiggle.start) / 600;
      if (t >= 1) wiggle = null;
      else stickerWiggle = { sticker: wiggle.sticker, angle: Math.sin(t * 22) * 0.3 * (1 - t) };
    }
    const pose = { x: cx, y: feetY, r: R, sprite, blink: anim.blink, phase: legT * 12, moving, wiggle: stickerWiggle };

    if (mode === 'flying') {
      // The send moment: first squash down (0.3 s), then shoot up with a trail of little stars.
      const elapsed = now - flyStart;
      const squash = Math.sin(Math.min(1, elapsed / SQUASH_MS) * Math.PI); // 0 -> 1 -> 0
      const t = Math.max(0, Math.min(1, (elapsed - SQUASH_MS) / FLY_MS));
      const scale = 1 - 0.85 * t;
      const y = feetY - t * t * (H + R * 2);
      for (let i = 0; i < 9 && t > 0; i++) {
        // Stars stay behind on the path and fade out.
        const age = t - i * 0.07;
        if (age <= 0) continue;
        const starT = i * 0.07 + age * 0.25;
        ctx.globalAlpha = Math.max(0, 1 - age * 1.6);
        drawStar(cx + Math.sin(i * 2.4) * R * 0.7, feetY - R - starT * starT * (H + R * 2), R * (0.1 + (i % 3) * 0.04));
      }
      ctx.globalAlpha = 1;
      Wobbel.draw(ctx, wobbel, Object.assign(pose, { y, r: R * scale, sx: 1 + 0.25 * squash - 0.3 * t, sy: 1 - 0.3 * squash + 0.5 * t }));
      if (t >= 1) {
        mode = 'sent';
        showMessage(['arrowUp', 'screen'], 'Kijk naar het grote scherm', 2500);
        setTimeout(startOver, 2500);
      }
    } else if (mode !== 'sent') {
      drawGuides();
      if (!hasLegs() && !(drag && kindOf(drag.type) === 'legs')) drawMissingLegs(now);
      Wobbel.draw(ctx, wobbel, pose);
    }

    drawTray(now);

    if (drag && drag.moved) {
      const def = STICKERS[drag.type];
      // Legs: show them a little above the finger so they stay visible.
      const y = def.kind === 'legs' ? drag.y - def.height * R - 20 : drag.y;
      Wobbel.drawSticker(ctx, drag.type, drag.x, y, R, '#000', { blink: anim.blink, side: drag.x < cx ? -1 : 1 });
    }

    requestAnimationFrame(frame);
  }

  // ---------- Start ----------
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  // Block scrolling, pinch zoom, double-tap zoom and the long-press menu in Safari.
  const block = (e) => e.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('gesturestart', block);
  document.addEventListener('gesturechange', block);
  document.addEventListener('contextmenu', block);
  document.addEventListener('selectstart', block);
  document.addEventListener('dblclick', block);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // Ask the server every 2 seconds if it is still there. The dot only shows when it is not.
  Api.poll(() => Api.get('/api/health'), 2000);

  buildControls();
  resize();
  refresh();
  let lastFrame = performance.now();
  requestAnimationFrame(frame);

  // For testing in the browser console.
  window.__draw = {
    getState: () => ({ strokes, stickers, fill, tool, mode, step, maxStep, history: history.length, color, widthIndex, activeTab, attract }),
    layout: () => ({ W, H, cx, cy, R, land, side, area, tray: trayRect(), tabs: tabRects(), cards: cardRects() }),
    setIdle: (ms) => (lastInput = performance.now() - ms),
  };
})();
