import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

    create() {
    this.platform = this.add.rectangle(400, 400, 600, 30, 0x333333);
    this.physics.add.existing(this.platform, true);
  }


  update() {
  }
}
