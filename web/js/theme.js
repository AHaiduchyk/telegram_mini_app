import { state } from "./state.js?v=20260120";
import { setStatus } from "./utils.js?v=20260120";

export function applyTheme(themeName) {
  document.documentElement.setAttribute("data-theme", themeName);
  localStorage.setItem("theme", themeName);
}

export function loadTheme() {
  const saved = localStorage.getItem("theme");
  applyTheme(saved || "ios");
}

export function getThemeLabel(themeName) {
  const t = themeName || document.documentElement.getAttribute("data-theme") || "ios";
  return t === "dino" ? "Dino" : "iOS";
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "ios";
  const next = current === "ios" ? "dino" : "ios";
  applyTheme(next);
  return next;
}

/**
 * initTheme — очікується в app.js
 * 1) застосовує тему з localStorage
 * 2) вішає клік на settings-btn (перемикає тему)
 */
export function initTheme() {
  loadTheme();

  const btn = document.getElementById("settings-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const next = toggleTheme();

    // легкий фідбек у статус
    try {
      setStatus(`Theme: ${getThemeLabel(next)}`);
    } catch {}

    // haptic якщо Telegram вже ініціалізований
    try {
      if (state.tg?.HapticFeedback?.selectionChanged) {
        state.tg.HapticFeedback.selectionChanged();
      }
    } catch {}
  });
}
