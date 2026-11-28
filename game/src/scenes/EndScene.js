import * as Phaser from "phaser";

export class EndScene extends Phaser.Scene {
  constructor() {
    super("end");
  }

  create() {
    this.time.delayedCall(3000, () => this.scene.start("game"));

    const title = document.getElementById("title");
    title.textContent = "Einde";
    title.classList.add("end");
  }
}
