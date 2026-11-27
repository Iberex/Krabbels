function create() {
}

function update() {
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  backgroundColor: '#f4efe6',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 900 } }
  },
  scene: { create: create, update: update }
};

new Phaser.Game(config);
