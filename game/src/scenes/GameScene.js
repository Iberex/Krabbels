import * as Phaser from "phaser";
import { LEVELS } from "../scenes/levels.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    this.add.text(x + 20, 20, `Level ${i + 1}`, {
      fontSize: "24px",
      color: "#333333",
    });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
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
      this.level === LEVELS.length,
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
    this.physics.world.setBounds(
      this.pageX,
      0,
      width,
      height,
      this.level === 1,
      this.level === LEVELS.length,
      true,
      false,
    );
  }

  update() {
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

    const { width, height } = this.scale;

    if (this.block.y > height + 50) {
      const start = LEVELS[this.level - 1].ground[0];
      this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
    }

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
