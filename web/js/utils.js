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
  if (!rawText) return null;

  try {
    const url = new URL(rawText);
    if (url.hostname !== "cabinet.tax.gov.ua") return null;
    if (url.pathname !== "/cashregs/check") return null;
    const required = ["fn", "id", "sm", "time", "date"];
    const hasAll = required.every((key) => url.searchParams.get(key));
    return hasAll ? url.toString() : null;
  } catch {
    // continue
  }

  const params = parseCheckParams(String(rawText));
  if (!params) return null;

  const search = new URLSearchParams(params);
  return `https://cabinet.tax.gov.ua/cashregs/check?${search.toString()}`;
}

function parseCheckParams(rawText) {
  const cleaned = rawText.trim().replace(/^[?]/, "");
  if (!cleaned) return null;

  const short = parseShortTaxFormat(cleaned);
  if (short) return short;

  const search = new URLSearchParams(cleaned.replace(/;/g, "&"));
  const fn = search.get("fn");
  const id = search.get("id") || search.get("i");
  const sm = search.get("sm") || search.get("s");
  let date = search.get("date");
  let time = search.get("time");

  const tValue = search.get("t");
  if ((!date || !time) && tValue) {
    const normalized = tValue.replace(/[^0-9T]/g, "");
    const match = normalized.match(/^(\d{8})T?(\d{4})(\d{2})?$/);
    if (match) {
      const [, parsedDate, hhmm, ss] = match;
      if (!date) date = parsedDate;
      if (!time) time = `${hhmm}${ss || ""}`;
    }
  }

  if (!fn || !id || !sm || !date || !time) return null;

  return {
    fn,
    id,
    sm,
    time,
    date,
  };
}

function parseShortTaxFormat(value) {
  const re =
    /^FN(?<fn>\d+)\s+N(?<id>\d+)\s+=?(?<sm>\d+[.,]\d+)\s+(?<date>\d{1,2}\.\d{1,2}\.\d{4})\s+(?<time>\d{1,2}:\d{2}:\d{2})(?:\s+MAC=(?<mac>\S+))?\s*$/i;
  const match = value.match(re);
  if (!match?.groups) return null;
  const { fn, id, sm, date, time } = match.groups;
  const [day, month, year] = date.split(".");
  const [hh, mm, ss] = time.split(":");
  return {
    fn,
    id,
    sm: sm.replace(",", "."),
    date: `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`,
    time: `${hh.padStart(2, "0")}${mm.padStart(2, "0")}${ss.padStart(2, "0")}`,
  };
}

export function pickDbStatus(scan) {
  const st = scan?.info?.check_status;
  if (!st) return { founded: false, saved: false, finding: false, exists: false };
  return {
    founded: Boolean(st.founded),
    saved: Boolean(st.saved),
    finding: Boolean(st.finding),
    exists: Boolean(st.exists),
  };
}

export function getItemType(scan) {
  if (scan?.type === "url") return "link";
  if (scan?.info?.url) return "link";
  if (getValidCheckUrl(scan?.raw_text)) return "link";
  return "text";
}

export function getItemTitle(scan) {
  const type = getItemType(scan);
  if (type === "text") return "Text";

  const urlValue = scan?.info?.url ?? getValidCheckUrl(scan?.raw_text) ?? scan?.raw_text;
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

import { state } from "./state.js?v=20260120";

export function setStatus(message) {
  if (!state.scanStatus) return;
  state.scanStatus.textContent = message;
}
