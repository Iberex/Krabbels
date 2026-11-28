import * as Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;
    this.physics.world.setBoundsCollision(true, false, true, true);

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.arrows = this.input.keyboard.createCursorKeys();

    this.buildPage();
    this.showPage();
  }

  buildPage() {
    const { width, height } = this.scale;
    const x = (this.level - 1) * width;

    const platform = this.add.rectangle(
      x + width / 2,
      height - 30,
      width,
      30,
      0x333333,
    );
    this.physics.add.existing(platform, true);
    this.physics.add.collider(this.block, platform);

    this.add.text(x + 20, 20, `Scène ${this.level}`, {
      fontSize: "24px",
      color: "#333333",
    });

    this.lastPage = this.level;
  }
  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(
      this.pageX,
      0,
      width,
      height,
      this.level === 1,
      false,
      true,
      true,
    );

    this.cameras.main.pan(
      this.pageX + width / 2,
      height / 2,
      600,
      "Sine.easeInOut",
      true,
    );
  }

  update() {
    const { width } = this.scale;
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }
    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      if (this.level > this.lastPage) {
        this.buildPage();
      }
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
