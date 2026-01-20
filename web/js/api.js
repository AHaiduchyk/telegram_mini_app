import { state } from "./state.js?v=20260120";
import { getValidCheckUrl, pickDbStatus } from "./utils.js?v=20260120";
import { renderHistory, showDetails } from "./render.js?v=20260120";

function setStatus(message) {
  const el = document.getElementById("scan-status");
  if (el) el.textContent = message;
}

export async function fetchHistory(options = {}) {
  const {
    render = true,
    append = false,
    limit = state.visibleCount,
    offset = 0,
  } = options;
  if (!state.initData) return;

  try {
    const res = await fetch(
      `${state.apiBase}/api/history?init_data=${encodeURIComponent(
        state.initData
      )}&limit=${limit}&offset=${offset}`
    );
    if (!res.ok) throw new Error("Failed to load history");

    const scansAll = await res.json();

    mergeScans(scansAll);

    // hydrate statuses from DB info
    const visibleKeys = new Set();
    for (const s of state.scans) {
      const key = s.raw_text;
      if (!key) continue;
      visibleKeys.add(key);
      const st = pickDbStatus(s);
      if (st.finding) state.findStatus.set(key, "loading");
      else if (st.founded) state.findStatus.set(key, "founded");
      else state.findStatus.delete(key);
      if (st.saved) state.saveStatus.set(key, "saved");
      else if (state.saveStatus.get(key) !== "loading") state.saveStatus.delete(key);
    }
    for (const key of Array.from(state.findStatus.keys())) {
      if (!visibleKeys.has(key)) state.findStatus.delete(key);
    }
    for (const key of Array.from(state.saveStatus.keys())) {
      if (!visibleKeys.has(key)) state.saveStatus.delete(key);
    }

    if (append) {
      state.loadedCount += scansAll.length;
      state.hasMore = scansAll.length === limit;
    } else {
      if (offset === 0) {
        state.loadedCount = Math.max(state.loadedCount, scansAll.length);
      }
      state.hasMore = scansAll.length === limit || state.allScans.length > state.visibleCount;
    }
    if (render) renderHistory();
  } catch (e) {
    console.error(e);
  }
}

export async function submitScan(rawText) {
  if (!state.initData) {
    setStatus("Missing Telegram initData.");
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
        init_data: state.initData,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error("Failed to store scan");

    const scan = await res.json();

    upsertScan(scan);

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

function mergeScans(scans) {
  const map = new Map(state.allScans.map((s) => [s.id, s]));
  for (const s of scans) {
    if (!s?.id) continue;
    map.set(s.id, s);
  }
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  state.allScans = merged;
  state.scans = merged.slice(0, state.visibleCount);
}

function upsertScan(scan) {
  if (!scan?.id) return;
  const map = new Map(state.allScans.map((s) => [s.id, s]));
  map.set(scan.id, scan);
  state.allScans = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  state.scans = state.allScans.slice(0, state.visibleCount);
}

export async function findCheck(index) {
  const scan = state.scans[index];
  if (!scan) return;

  const dbStatus = pickDbStatus(scan);
  if (dbStatus.exists) return;

  const key = scan.raw_text;
  const url = scan?.info?.url || getValidCheckUrl(key);
  if (!url || !state.initData) return;

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
      body: JSON.stringify({ init_data: state.initData, check_url: url }),
    });

    if (!res.ok) throw new Error("Failed to fetch check");
    const data = await res.json();

    if (data.finding) {
      state.findStatus.set(key, "loading");
      renderHistory();
      return;
    }

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
  const url = scan?.info?.url || getValidCheckUrl(key);
  if (!url || !state.initData) return;

  const st = pickDbStatus(scan);
  if (!st.founded) return;

  const currentSave = state.saveStatus.get(key) || "idle";
  if (currentSave === "saved" || currentSave === "loading") return;

  let cached = state.checkCache.get(key);
  if (!cached?.text) {
    try {
      const res = await fetch(`${state.apiBase}/api/find_check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: state.initData, check_url: url }),
      });
      if (!res.ok) throw new Error("Failed to fetch check");
      const data = await res.json();
      if (data.finding) {
        state.findStatus.set(key, "loading");
        renderHistory();
        return;
      }
      cached = {
        text: data.text || "",
        parsed: data.parsed || null,
        check_id: data.check_id || null,
        founded: Boolean(data.founded),
        saved: Boolean(data.saved),
      };
      state.checkCache.set(key, cached);
      state.findStatus.set(key, "founded");
      if (data.saved) state.saveStatus.set(key, "saved");
      renderHistory();
    } catch (e) {
      console.error(e);
      return;
    }
  }
  if (!cached?.text) return;

  state.saveStatus.set(key, "loading");
  renderHistory();

  try {
    const res = await fetch(`${state.apiBase}/api/save_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        init_data: state.initData,
        check_url: url,
        check_text: cached.text,
      }),
    });

    if (!res.ok) throw new Error("Failed to save check");
    const data = await res.json();

    state.findStatus.set(key, "founded");
    if (data.saved) state.saveStatus.set(key, "saved");
    else state.saveStatus.set(key, "loading");

    state.checkCache.set(key, {
      text: cached.text,
      parsed: data.parsed || cached.parsed || null,
      check_id: data.check_id || cached.check_id || null,
      founded: true,
      saved: Boolean(data.saved),
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

export async function fetchCheckParsed(checkId) {
  if (!checkId || !state.initData) return null;
  try {
    const res = await fetch(
      `${state.apiBase}/api/check_parsed/${encodeURIComponent(checkId)}?init_data=${encodeURIComponent(
        state.initData
      )}`
    );
    if (!res.ok) throw new Error("Failed to load parsed check");
    const data = await res.json();
    if (data.parsed) {
      state.checkParsed.set(checkId, data.parsed);
      try {
        localStorage.setItem(`parsedCheck:${checkId}`, JSON.stringify(data.parsed));
      } catch {}
      return data.parsed;
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function fetchCheckRaw(checkId) {
  if (!checkId || !state.initData) return null;
  try {
    const res = await fetch(
      `${state.apiBase}/api/check_raw/${encodeURIComponent(checkId)}?init_data=${encodeURIComponent(
        state.initData
      )}`
    );
    if (!res.ok) throw new Error("Failed to load raw check");
    const data = await res.json();
    if (data.xml_text) {
      state.checkRaw.set(checkId, data.xml_text);
      return data.xml_text;
    }
    return "";
  } catch (e) {
    console.error(e);
    return null;
  }
}
