export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "…";
}

export function getValidCheckUrl(rawText) {
  try {
    const url = new URL(rawText);
    if (url.hostname !== "cabinet.tax.gov.ua") return null;
    if (url.pathname !== "/cashregs/check") return null;
    const required = ["fn", "id", "sm", "time", "date"];
    const hasAll = required.every((key) => url.searchParams.get(key));
    return hasAll ? url.toString() : null;
  } catch {
    return null;
  }
}

export function pickDbStatus(scan) {
  const st = scan?.info?.check_status;
  if (!st) return { founded: false, saved: false };
  return { founded: Boolean(st.founded), saved: Boolean(st.saved) };
}

export function getItemType(scan) {
  if (scan?.type === "url") return "link";
  if (scan?.info?.url) return "link";
  return "text";
}

export function getItemTitle(scan) {
  const type = getItemType(scan);
  if (type === "text") return "Text";

  const urlValue = scan?.info?.url ?? scan?.raw_text;
  if (!urlValue) return "Link";

  const normalizedUrl = normalizeUrl(urlValue);
  if (!normalizedUrl) return "Link";

  try {
    const url = new URL(normalizedUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function normalizeUrl(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("www.")) return `https://${trimmed}`;
  return trimmed;
}

import { state } from "./state.js";

export function setStatus(message) {
  if (!state.scanStatus) return;
  state.scanStatus.textContent = message;
}
