// Single source of truth for Puntje's animations.
// `key` is the folder name under public/assets/puntje/ (Dutch, kept as-is).
// `label` is the English button text. `loop` decides the state-machine behaviour.
// The order of this list is the button order and the keyboard order.

export const FPS = 30;

export const IDLE = '01_rust';
export const INTRO = '18_binnenvliegen';

export const ANIMATIONS = [
  { key: '01_rust', label: 'Idle', loop: true },
  { key: '02_zweven', label: 'Float', loop: true },
  { key: '03_wenken', label: 'Beckon', loop: true },
  { key: '04_zwaaien', label: 'Wave', loop: true },
  { key: '05_wijzen_rechts', label: 'Point right', loop: false },
  { key: '06_wijzen_links', label: 'Point left', loop: false },
  { key: '07_knikken', label: 'Nod', loop: true },
  { key: '08_tekenen', label: 'Draw', loop: false },
  { key: '09_armen_wijd', label: 'Arms wide', loop: false },
  { key: '10_armen_omhoog', label: 'Arms up', loop: false },
  { key: '11_springen', label: 'Jump', loop: false },
  { key: '12_bukken', label: 'Duck', loop: false },
  { key: '13_juichen', label: 'Cheer', loop: true },
  { key: '14_dansje', label: 'Dance', loop: true },
  { key: '15_oei', label: 'Oops', loop: false },
  { key: '16_tikken', label: 'Knock', loop: false },
  { key: '17_buigen', label: 'Bow', loop: false },
  { key: '18_binnenvliegen', label: 'Fly in', loop: false },
  { key: '19_gom_stukje_kwijt', label: 'Eraser chip', loop: false },
];

// Keyboard shortcuts, in the same order as ANIMATIONS.
export const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];

// Event names a tracker may send ({"event":"jump"}) mapped to animation keys.
export const EVENTS = {
  idle: '01_rust',
  float: '02_zweven',
  beckon: '03_wenken',
  wave: '04_zwaaien',
  point_right: '05_wijzen_rechts',
  point_left: '06_wijzen_links',
  nod: '07_knikken',
  draw: '08_tekenen',
  arms_wide: '09_armen_wijd',
  arms_up: '10_armen_omhoog',
  jump: '11_springen',
  duck: '12_bukken',
  cheer: '13_juichen',
  dance: '14_dansje',
  oops: '15_oei',
  knock: '16_tikken',
  bow: '17_buigen',
  fly_in: '18_binnenvliegen',
  eraser_chip: '19_gom_stukje_kwijt',
};

export function findAnimation(key) {
  return ANIMATIONS.find((a) => a.key === key);
}
