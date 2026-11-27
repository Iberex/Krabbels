// Hooks for later: RGB light and sound that "travel" from the iPad to the screens.
// These functions are empty on purpose. They are already called at the right moments.
// Each one receives the wobbel object ({ id, strokes, stickers, ... }).

window.Hooks = {
  // iPad (/draw): the player touched the screen (any tap on a button, a card or the drawing).
  // No arguments. Meant for a small tap sound.
  onTap() {},

  // iPad (/draw): the server accepted the wobbel and it starts to fly off the iPad.
  onWobbelSent(wobbel) {},

  // Level screen (/level): the wobbel starts to appear in the portal at START.
  onWobbelArrive(wobbel) {},

  // Level screen (/level): the wobbel reached the FINISH flag.
  onWobbelFinish(wobbel) {},

  // World screen (/world): a new wobbel fell from the sky and touched the ground.
  onWobbelLandInWorld(wobbel) {},

  // World screen (/world): the new wobbel climbed up and reached its home zone in the tower.
  onWobbelReachHome(wobbel) {},
};
