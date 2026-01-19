import { state } from "./state.js";
import { closeAllMenus } from "./menu.js";
import { initTheme } from "./theme.js";
import { initTelegram } from "./telegram.js";
import { renderHistory } from "./render.js";

function bindDom() {
  state.notTelegramEl = document.getElementById("not-telegram");
  state.scanButton = document.getElementById("scan-button");
  state.scanStatus = document.getElementById("scan-status");
  state.historyContainer = document.getElementById("history-container");
  state.detailsContainer = document.getElementById("details-container");
  state.detailsContent = document.getElementById("details-content");
  state.continuousToggle = document.getElementById("continuous-toggle");

  state.apiBase =
    new URLSearchParams(window.location.search).get("api") || window.location.origin;
}

function bindGlobalCloseMenus() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".btn-menu") && !e.target.closest(".dropdown-menu")) {
      closeAllMenus();
    }
  });
}

function bindContinuousToggle() {
  if (!state.continuousToggle) return;

  state.continuousToggle.addEventListener("click", () => {
    state.continuousScan = !state.continuousScan;
    state.continuousToggle.classList.toggle("active", state.continuousScan);
    state.continuousToggle.setAttribute("aria-checked", String(state.continuousScan));
  });
}

function init() {
  bindDom();

  initTheme(); // loads localStorage theme + applies html[data-theme]
  bindGlobalCloseMenus();
  bindContinuousToggle();

  renderHistory(); // initial empty state (render.js also attaches delegated click handler)

  initTelegram();
}

init();