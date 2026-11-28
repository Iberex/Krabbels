// TESTMENU: verwijderen bij merge
import { LEVELS } from "./scenes/levels.js";

const buttonStyle = "padding: 6px 12px; font-size: 14px; cursor: pointer;";

export function addLevelMenu(scene) {
  document.getElementById("test-menu")?.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "test-menu";

  const menu = document.createElement("div");
  menu.style.cssText =
    "position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 6px;";

  LEVELS.forEach((level, i) => {
    const button = document.createElement("button");
    button.textContent = `Level ${i + 1}`;
    button.style.cssText = buttonStyle;
    button.addEventListener("click", () => {
      button.blur();
      scene.goToLevel(i + 1);
    });
    menu.appendChild(button);
  });

  const autoWalk = document.createElement("button");
  autoWalk.style.cssText = `${buttonStyle} position: fixed; top: 8px; right: 8px; z-index: 10;`;
  const showAutoWalk = () => {
    autoWalk.textContent = scene.autoWalk ? "Auto walk: aan" : "Auto walk: uit";
  };
  showAutoWalk();
  autoWalk.addEventListener("click", () => {
    autoWalk.blur();
    scene.autoWalk = !scene.autoWalk;
    showAutoWalk();
  });

  wrapper.appendChild(menu);
  wrapper.appendChild(autoWalk);
  document.body.appendChild(wrapper);
}
