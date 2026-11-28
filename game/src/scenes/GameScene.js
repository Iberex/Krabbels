import * as Phaser from "phaser";
import { LEVELS } from "../scenes/levels.js";
// TESTMENU: verwijderen bij merge
import { addLevelMenu } from "../levelMenu.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add
      .rectangle(40, height - 100, 40, 40, 0xe4572e)
      .setOrigin(0.5, 1);
    this.block.setDepth(1);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);
    this.ladders = [];
    this.gate = null;

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();

    // TESTMENU: verwijderen bij merge
    addLevelMenu(this);
  }

  // TESTMENU: verwijderen bij merge
  goToLevel(level) {
    this.level = level;
    const { width } = this.scale;
    const start = LEVELS[level - 1].ground[0];
    this.block.body.reset((level - 1) * width + start.x + 40, start.top - 40);
    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    (level.walls ?? []).forEach((wall) => {
      this.addSolid(x + wall.x, wall.top - wall.h, wall.w, wall.h);
    });
    (level.ceilings ?? []).forEach((ceiling) => {
      this.addSolid(x + ceiling.x, 0, ceiling.w, ceiling.bottom);
    });
    (level.ladders ?? []).forEach((ladder) => {
      const rect = this.add
        .rectangle(
          x + ladder.x,
          ladder.top,
          40,
          ladder.bottom - ladder.top,
          0x8d6e63,
        )
        .setOrigin(0);
      this.ladders.push(rect);
    });
    if (level.gate) {
      this.gate = this.add
        .rectangle(x + level.gate.x, level.gate.top - 80, 40, 80, 0x2e86ab)
        .setOrigin(0);
    }
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
  }
  isOnLadder() {
    const feet = this.block.getBottomCenter();
    return this.ladders.some((ladder) =>
      ladder.getBounds().contains(feet.x, feet.y),
    );
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

    const title = document.getElementById("title");
    title.textContent = `Level ${this.level}`;
    title.classList.remove("end");
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
      // TESTMENU: verwijderen bij merge, terug naar alleen this.arrows.right.isDown
    } else if (this.arrows.right.isDown || this.autoWalk) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    const onLadder = this.isOnLadder();
    this.block.body.setAllowGravity(!onLadder);

    if (onLadder) {
      if (this.arrows.up.isDown) {
        this.block.body.setVelocityY(-150);
      } else if (this.arrows.down.isDown) {
        this.block.body.setVelocityY(150);
      } else {
        this.block.body.setVelocityY(0);
      }
    } else if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }
    const roomToStand =
      this.physics.overlapRect(
        this.block.x - 18,
        this.block.y - 40,
        36,
        20,
        false,
        true,
      ).length === 0;
    const crouch = (this.arrows.down.isDown && !onLadder) || !roomToStand;
    this.block.setScale(1, crouch ? 0.5 : 1);

    const { width, height } = this.scale;

    if (this.block.y > height + 50) {
      const start = LEVELS[this.level - 1].ground[0];
      this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
    }
    if (this.gate && this.block.x > this.gate.x + 20) {
      this.scene.start("end");
      return;
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
