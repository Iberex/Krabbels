import * as Phaser from 'phaser';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  backgroundColor: '#f4efe6',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 900 } }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
