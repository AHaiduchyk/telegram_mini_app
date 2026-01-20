import { state } from "./state.js?v=20260120";
import { closeAllMenus } from "./menu.js?v=20260120";
import { initTheme } from "./theme.js?v=20260120";
import { initTelegram } from "./telegram.js?v=20260120";
import { renderHistory } from "./render.js?v=20260120";
import { fetchHistory } from "./api.js?v=20260120";

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

  startStatusPolling();
}

init();

function startStatusPolling() {
  const pollMs = 5000;
  setInterval(async () => {
    if (!state.initData) return;
    if (!hasPending()) return;
    await fetchHistory({
      render: !state.openMenuKey,
      limit: state.visibleCount,
      offset: 0,
    });
  }, pollMs);
}

function hasPending() {
  const visibleKeys = new Set();
  for (const scan of state.scans) {
    if (scan?.raw_text) visibleKeys.add(scan.raw_text);
  }
  for (const [key, status] of state.findStatus.entries()) {
    if (visibleKeys.has(key) && status === "loading") return true;
  }
  for (const [key, status] of state.saveStatus.entries()) {
    if (visibleKeys.has(key) && status === "loading") return true;
  }
  for (const scan of state.scans) {
    if (scan?.info?.check_status?.finding) return true;
  }
  return false;
}
