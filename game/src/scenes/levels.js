export const LOW = 405;
export const MID = 330;
export const HIGH = 255;

export const LEVELS = [
  {
    ground: [
      { x: 0, w: 187, top: LOW },
      { x: 387, w: 413, top: LOW },
    ],
    walls: [{ x: 573, w: 40, h: 70, top: LOW }],
  },

  {
    ground: [
      { x: 0, w: 300, top: LOW },
      { x: 300, w: 500, top: HIGH },
    ],
    ladders: [{ x: 260, top: HIGH - 45, bottom: LOW }],
    ceilings: [{ x: 560, w: 80, bottom: HIGH - 30 }],
  },

  {
    ground: [
      { x: 0, w: 240, top: HIGH },
      { x: 360, w: 440, top: MID },
    ],
    walls: [{ x: 580, w: 40, h: 70, top: MID }],
  },
  {
    ground: [
      { x: 0, w: 220, top: MID },
      { x: 340, w: 200, top: MID },
      { x: 660, w: 140, top: LOW },
    ],
  },

  { ground: [{ x: 0, w: 800, top: LOW }] },
];
