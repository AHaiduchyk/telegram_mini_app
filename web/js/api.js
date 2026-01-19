import { state } from "./state.js";
import { getValidCheckUrl, pickDbStatus } from "./utils.js";
import { renderHistory, showDetails } from "./render.js";

function setStatus(message) {
  const el = document.getElementById("scan-status");
  if (el) el.textContent = message;
}

export async function fetchHistory() {
  if (!state.userId) return;

  try {
    const res = await fetch(`${state.apiBase}/api/history?user_id=${state.userId}`);
    if (!res.ok) throw new Error("Failed to load history");

    const scansAll = await res.json();

    // dedupe by raw_text (keep newest created_at)
    const map = new Map();
    for (const s of scansAll) {
      const key = s.raw_text;
      if (!key) continue;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, s);
      } else {
        const a = new Date(prev.created_at).getTime();
        const b = new Date(s.created_at).getTime();
        if (b > a) map.set(key, s);
      }
    }

    state.scans = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // hydrate statuses from DB info
    for (const s of state.scans) {
      const key = s.raw_text;
      if (!key) continue;
      const st = pickDbStatus(s);
      if (st.founded) state.findStatus.set(key, "founded");
      if (st.saved) state.saveStatus.set(key, "saved");
    }

    renderHistory();
  } catch (e) {
    console.error(e);
  }
}

export async function submitScan(rawText) {
  if (!state.userId) {
    setStatus("Missing Telegram user info.");
    return;
  }
  if (!rawText || rawText.length > 4096) {
    setStatus("QR text too long.");
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_text: rawText,
        tg_user_id: state.userId,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error("Failed to store scan");

    const scan = await res.json();

    // upsert in memory
    state.scans = [scan, ...state.scans.filter((s) => s.raw_text !== scan.raw_text)];

    renderHistory();
    showDetails(scan);

    if (state.detailsContainer) {
      state.detailsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setStatus("Scan stored.");
  } catch (e) {
    console.error(e);
    setStatus("Failed to store scan.");
  }
}

export async function findCheck(index) {
  const scan = state.scans[index];
  if (!scan) return;

  const key = scan.raw_text;
  const url = getValidCheckUrl(key);
  if (!url || !state.userId) return;

  const current = state.findStatus.get(key) || "idle";
  if (current === "founded") {
    showDetails(scan);
    if (state.detailsContainer) {
      state.detailsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  // if already saved => treat as founded
  if ((state.saveStatus.get(key) || "idle") === "saved") {
    state.findStatus.set(key, "founded");
    renderHistory();
    showDetails(scan);
    return;
  }

  state.findStatus.set(key, "loading");
  renderHistory();

  try {
    const res = await fetch(`${state.apiBase}/api/find_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tg_user_id: state.userId, check_url: url }),
    });

    if (!res.ok) throw new Error("Failed to fetch check");
    const data = await res.json();

    state.checkCache.set(key, {
      text: data.text || "",
      parsed: data.parsed || null,
      check_id: data.check_id || null,
      founded: Boolean(data.founded),
      saved: Boolean(data.saved),
    });

    state.findStatus.set(key, "founded");
    if (data.saved) state.saveStatus.set(key, "saved");

    renderHistory();
    showDetails(scan);

    if (state.detailsContainer) {
      state.detailsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    console.error(e);
    state.findStatus.set(key, "failed");
    renderHistory();
  }
}

export async function saveCheck(index) {
  const scan = state.scans[index];
  if (!scan) return;

  const key = scan.raw_text;
  const url = getValidCheckUrl(key);
  if (!url || !state.userId) return;

  if ((state.saveStatus.get(key) || "idle") === "saved") return;

  const cached = state.checkCache.get(key);
  if (!cached?.text) return;

  state.saveStatus.set(key, "loading");
  renderHistory();

  try {
    const res = await fetch(`${state.apiBase}/api/save_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tg_user_id: state.userId,
        check_url: url,
        check_text: cached.text,
      }),
    });

    if (!res.ok) throw new Error("Failed to save check");
    const data = await res.json();

    state.findStatus.set(key, "founded");
    state.saveStatus.set(key, "saved");

    state.checkCache.set(key, {
      text: cached.text,
      parsed: data.parsed || cached.parsed || null,
      check_id: data.check_id || cached.check_id || null,
      founded: true,
      saved: true,
    });

    renderHistory();
    showDetails(scan);
    setStatus("Saved.");
  } catch (e) {
    console.error(e);
    state.saveStatus.set(key, "failed");
    renderHistory();
    setStatus("Failed to save.");
  }
}
