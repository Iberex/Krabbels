import * as Phaser from "phaser";

export class EndScene extends Phaser.Scene {
  constructor() {
    super("end");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Einde", {
        fontSize: "48px",
        color: "#333333",
      })
      .setOrigin(0.5);

    this.time.delayedCall(3000, () => this.scene.start("game"));
  }
}
