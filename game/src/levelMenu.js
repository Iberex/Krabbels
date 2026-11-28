// TESTMENU: verwijderen bij merge
import { LEVELS } from "./scenes/levels.js";

export function addLevelMenu(scene) {
  const menu = document.createElement("div");
  menu.style.cssText =
    "position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 6px;";

  LEVELS.forEach((level, i) => {
    const button = document.createElement("button");
    button.textContent = `Level ${i + 1}`;
    button.style.cssText = "padding: 6px 12px; font-size: 14px; cursor: pointer;";
    button.addEventListener("click", () => {
      button.blur();
      scene.goToLevel(i + 1);
    });
    menu.appendChild(button);
  });

  document.body.appendChild(menu);
}
