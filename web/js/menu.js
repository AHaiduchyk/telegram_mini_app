import { state } from "./state.js?v=20260120";

export function closeAllMenus() {
  document.querySelectorAll(".dropdown-menu").forEach((menu) => {
    menu.classList.remove("show");
  });
  state.openMenuKey = null;
}

export function toggleMenu(key) {
  if (state.openMenuKey === key) {
    closeAllMenus();
    return;
  }

  closeAllMenus();
  const menu = document.getElementById(`menu-${key}`);
  if (menu) {
    menu.classList.add("show");
    state.openMenuKey = key;
  }
}
