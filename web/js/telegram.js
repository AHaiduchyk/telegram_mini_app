import { state } from "./state.js";
import { setStatus } from "./utils.js";
import { submitScan, fetchHistory } from "./api.js";

export function handleQrText(rawText) {
  const now = Date.now();

  if (state.continuousScan && rawText === state.lastText && now - state.lastTextAt < 2000) {
    return;
  }

  state.lastText = rawText;
  state.lastTextAt = now;

  setStatus("QR detected.");
  if (state.tg?.HapticFeedback) state.tg.HapticFeedback.notificationOccurred("success");

  // не await — ок, хай летить паралельно
  submitScan(rawText);

  if (state.tg) {
    state.tg.sendData(rawText);
    if (!state.continuousScan && state.tg.closeScanQrPopup) {
      state.tg.closeScanQrPopup();
    }
  }
}

export function initTelegram() {
  const tg = window.Telegram?.WebApp || null;
  state.tg = tg;

  if (!tg) {
    if (state.notTelegramEl) state.notTelegramEl.classList.remove("hidden");
    if (state.scanButton) state.scanButton.disabled = true;
    setStatus("Open this Mini App inside Telegram.");
    return;
  }

  tg.ready();
  tg.expand();

  state.userId = tg.initDataUnsafe?.user?.id || null;

  // всередині fetchHistory() є check на userId — але норм так
  fetchHistory();

  if (!tg.showScanQrPopup) {
    setStatus("QR scanning is not supported in this Telegram version.");
    if (state.scanButton) state.scanButton.disabled = true;
    return;
  }

  tg.onEvent("qrTextReceived", (event) => {
    if (event?.data) handleQrText(event.data);
  });

  if (state.scanButton) {
    state.scanButton.addEventListener("click", () => {
      setStatus("Scanning...");
      tg.showScanQrPopup({ text: "Point your camera at a QR code." });
    });
  }
}