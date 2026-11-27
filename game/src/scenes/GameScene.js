import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

    create() {
    this.platform = this.add.rectangle(400, 400, 600, 30, 0x333333);
    this.physics.add.existing(this.platform, true);
    this.block = this.add.rectangle(400, 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.block, this.platform);

  }


  update() {
  }
}
