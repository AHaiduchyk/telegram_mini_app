import { state } from "./state.js?v=20260120";
import {
  escapeHtml,
  truncate,
  getValidCheckUrl,
  pickDbStatus,
  getItemType,
  getItemTitle,
} from "./utils.js";
import { toggleMenu, closeAllMenus } from "./menu.js?v=20260120";
import { fetchCheckParsed, fetchCheckRaw, fetchHistory, findCheck, saveCheck } from "./api.js?v=20260120";

export function renderHistory() {
  const c = state.historyContainer;
  if (!c) return;

  if (!state.scans.length) {
    c.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-title">No scans yet</div>
        <div class="history-empty-subtitle">Your scan history will appear here</div>
      </div>
    `;
    return;
  }

  c.innerHTML = "";

  state.scans.forEach((scan, index) => {
    const key = scan.raw_text;
    const safeKey = `scan-${index}`;

    const type = getItemType(scan);
    const title = getItemTitle(scan);

    const canFind = Boolean(scan?.info?.url || getValidCheckUrl(scan.raw_text));
    const dbStatus = pickDbStatus(scan);
    const findSt =
      state.findStatus.get(key) ||
      (dbStatus.finding ? "loading" : dbStatus.founded ? "founded" : "idle");
    const saveSt = state.saveStatus.get(key) || (dbStatus.saved ? "saved" : "idle");

    const iconColor = type === "link" ? "var(--ios-blue)" : "var(--ios-text-secondary)";
    const iconPath =
      type === "link"
        ? '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>'
        : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>';

    const item = document.createElement("div");
    item.className = "history-item";

    item.innerHTML = `
      <div class="history-icon">
        <svg class="icon icon-small" viewBox="0 0 24 24" style="color: ${iconColor}">
          ${iconPath}
        </svg>
      </div>

      <div class="history-content">
        <div class="history-title">${escapeHtml(title)}</div>
        <div class="history-subtitle">${escapeHtml(truncate(scan.raw_text, 50))}</div>
      </div>

      <div class="history-actions">
        <button class="btn-view" data-action="view" data-index="${index}">View</button>

        <div class="relative">
          <button class="btn-menu" data-action="menu" data-key="${safeKey}">
            <svg class="icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1" fill="currentColor"></circle>
              <circle cx="19" cy="12" r="1" fill="currentColor"></circle>
              <circle cx="5" cy="12" r="1" fill="currentColor"></circle>
            </svg>
          </button>

          <div id="menu-${safeKey}" class="dropdown-menu">
            ${canFind ? generateMenuItems(index, key, findSt, saveSt, dbStatus.exists) : ""}

            <button class="menu-item" data-action="copy" data-index="${index}">
              <svg class="icon icon-small" viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>

            <button class="menu-item danger" data-action="delete" data-index="${index}">
              <svg class="icon icon-small" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
          </div>
        </div>
      </div>
    `;

    c.appendChild(item);
  });

  if (state.hasMore || state.allScans.length > state.visibleCount) {
    const btn = document.createElement("button");
    btn.className = "btn-view history-load-more";
    btn.dataset.action = "load-more";
    btn.type = "button";
    btn.textContent = "Load more";
    c.appendChild(btn);
  }

  // avoid stacking handlers on re-render
  c.onclick = null;

  c.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    // prevent bubbling to document click (which may close menus)
    e.stopPropagation();

    const action = btn.dataset.action;

    if (action === "view") {
      closeAllMenus();
      const index = Number(btn.dataset.index);
      showDetails(state.scans[index]);
      if (state.detailsContainer) {
        state.detailsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (action === "menu") {
      toggleMenu(btn.dataset.key);
      return;
    }

    if (action === "copy") {
      closeAllMenus();
      const index = Number(btn.dataset.index);
      const text = state.scans[index]?.raw_text || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {}
      return;
    }

    if (action === "delete") {
      closeAllMenus();
      const index = Number(btn.dataset.index);
      state.scans.splice(index, 1);
      renderHistory();

      if (
        state.selectedScan &&
        !state.scans.some((s) => s.raw_text === state.selectedScan.raw_text)
      ) {
        if (state.detailsContainer) state.detailsContainer.classList.add("hidden");
        state.selectedScan = null;
      }
      return;
    }

    if (action === "find") {
      closeAllMenus();
      const index = Number(btn.dataset.index);
      await findCheck(index);
      return;
    }

    if (action === "save") {
      closeAllMenus();
      const index = Number(btn.dataset.index);
      await saveCheck(index);
      return;
    }

    if (action === "load-more") {
      const next = state.visibleCount + state.pageSize;
      state.visibleCount = next;
      if (state.visibleCount > state.allScans.length && state.hasMore) {
        await fetchHistory({
          append: true,
          limit: state.pageSize,
          offset: state.loadedCount,
        });
      } else {
        state.scans = state.allScans.slice(0, state.visibleCount);
        renderHistory();
      }
      return;
    }
  };
}

export function generateMenuItems(index, key, findStatus, saveStatus, exists) {
  const canSave = findStatus === "founded" && saveStatus !== "saved";

  let findText = "Find check";
  let findClass = "";
  let findDisabled = exists ? "disabled" : "";
  let findIcon = "";

  if (findStatus === "loading") {
    findText = "Finding…";
    findDisabled = "disabled";
    findIcon = '<div class="spinner"></div>';
  } else if (findStatus === "founded") {
    findText = "✓ Founded";
    findClass = "success";
    findDisabled = "disabled";
  } else if (findStatus === "failed") {
    findText = "Retry";
    findClass = "danger";
  }

  let saveText = "Save data";
  let saveClass = "";
  let saveDisabled = canSave ? "" : "disabled";
  let saveIcon = "";

  if (saveStatus === "loading") {
    saveText = "Saving…";
    saveDisabled = "disabled";
    saveIcon = '<div class="spinner"></div>';
  } else if (saveStatus === "saved") {
    saveText = "✓ Saved";
    saveClass = "success";
    saveDisabled = "disabled";
  } else if (saveStatus === "failed") {
    saveText = "Retry save";
    saveClass = "danger";
    saveDisabled = "";
  }

  return `
    <button class="menu-item ${findClass}" data-action="find" data-index="${index}" ${findDisabled}>
      ${findIcon}
      <span>${findText}</span>
    </button>
    <button class="menu-item ${saveClass}" data-action="save" data-index="${index}" ${saveDisabled}>
      ${saveIcon}
      <span>${saveText}</span>
    </button>
  `;
}

export function showDetails(scan) {
  if (!scan) return;

  state.selectedScan = scan;
  if (state.detailsContainer) state.detailsContainer.classList.remove("hidden");

  const cached = state.checkCache.get(scan.raw_text);
  const receiptBlock = cached ? renderReceipt(cached) : "";

  if (!state.detailsContent) return;

  const info = scan.info || {};
  const derivedUrl = getValidCheckUrl(scan.raw_text);
  const displayUrl = info.url || info.source_url || derivedUrl || "";
  const checkId = info.check_id || extractCheckId(displayUrl) || "—";
  const { founded, saved } = pickDbStatus(scan);
  const scannedAt = new Date(scan.created_at).toLocaleString();
  const parsedSummary =
    checkId && checkId !== "—" ? state.checkParsed.get(String(checkId)) : null;
  const rawXml = checkId && checkId !== "—" ? state.checkRaw.get(String(checkId)) : null;
  const cachedParsed = resolveParsed(parsedSummary, checkId);
  if (cachedParsed && checkId && checkId !== "—") {
    state.checkParsed.set(String(checkId), cachedParsed);
  }

  state.detailsContent.innerHTML = `
    <div class="details-grid details-tiles">
      <div class="details-item">
        <div class="details-item-key">Scanned</div>
        <div class="details-item-value">${escapeHtml(scannedAt)}</div>
      </div>
      <div class="details-item">
        <div class="details-item-key">Check ID</div>
        <div class="details-item-value">${escapeHtml(String(checkId))}</div>
      </div>
      <div class="details-item">
        <div class="details-item-key">Found</div>
        <div class="details-item-value">${founded ? "Yes" : "No"}</div>
      </div>
      <div class="details-item">
        <div class="details-item-key">Saved</div>
        <div class="details-item-value">${saved ? "Yes" : "No"}</div>
      </div>
    </div>
    ${renderCheckContent(checkId, cachedParsed, rawXml, founded, saved)}
    ${receiptBlock}
  `;

  state.detailsContent.onclick = null;
  state.detailsContent.onclick = async (e) => {
    const btn = e.target.closest("[data-action='load-check'], [data-action='load-raw']");
    if (!btn) return;
    const id = btn.dataset.checkId;
    if (!id) return;
    btn.disabled = true;
    btn.textContent = "Loading...";
    if (btn.dataset.action === "load-check") {
      const parsed = await fetchCheckParsed(id);
      if (parsed) {
        showDetails(scan);
        return;
      }
      btn.textContent = "Not ready";
      setTimeout(() => {
        btn.textContent = "Load check content";
        btn.disabled = false;
      }, 1500);
      return;
    }
    if (btn.dataset.action === "load-raw") {
      const raw = await fetchCheckRaw(id);
      if (raw !== null) {
        showDetails(scan);
        return;
      }
      btn.textContent = "Not ready";
      setTimeout(() => {
        btn.textContent = "Load raw data";
        btn.disabled = false;
      }, 1500);
    }
  };
}

function extractCheckId(checkUrl) {
  if (!checkUrl) return null;
  try {
    const url = new URL(checkUrl);
    return url.searchParams.get("id");
  } catch {
    return null;
  }
}

function renderReceipt(cached) {
  const parsed = cached.parsed;

  if (parsed && (parsed.head || parsed.items || parsed.pay_rows)) {
    return `
      <div class="divider"></div>
      <div class="receipt-section-title">Receipt</div>
      ${renderSection("CHECKHEAD", parsed.head)}
      ${renderSection("CHECKTOTAL", parsed.total)}
      ${renderTableSection("CHECKPAY", parsed.pay_rows, ["PAYFORMNM", "PAYFORMCD", "SUM", "PROVIDED", "REMAINS"])}
      ${renderTableSection("CHECKBODY", parsed.items, ["CODE", "NAME", "AMOUNT", "UNITNM", "PRICE", "COST", "LETTERS"])}
    `;
  }

  return "";
}

function renderCheckContent(checkId, parsed, rawXml, founded, saved) {
  if (!checkId || checkId === "—") {
    return `
      <div class="details-placeholder">
        <div class="details-label">Check content</div>
        <div class="details-value">No check id.</div>
      </div>
    `;
  }
  if (!parsed) {
    if (!founded || !saved) {
      return `
        <div class="details-placeholder">
          <div class="details-label">Check content</div>
          <div class="details-value">Available after find + save.</div>
        </div>
      `;
    }
    return `
      <div class="details-placeholder">
        <div class="details-label">Check content</div>
        <button class="btn-view" data-action="load-check" data-check-id="${escapeHtml(
          String(checkId)
        )}" type="button">Load check content</button>
      </div>
    `;
  }

  const items = parsed.items || [];
  const itemsHtml = items.length
    ? `<div class="details-list">${items
        .map((item) => {
          const name = escapeHtml(item.name || "—");
          const qty = escapeHtml(item.qty || "—");
          const price = escapeHtml(item.price || "—");
          const sum = escapeHtml(item.sum || "—");
          return `
            <div class="details-row">
              <div class="details-row-title">${name}</div>
              <div class="details-row-meta">qty ${qty} • price ${price} • sum ${sum}</div>
            </div>
          `;
        })
        .join("")}</div>`
    : `<div class="details-value">No items.</div>`;

  const rawBlock = renderRawContent(checkId, rawXml, founded);

  return `
    <div class="details-placeholder">
      <div class="details-label">Check content</div>
      <div class="details-value">Total: ${escapeHtml(parsed.total_sum || "—")} ${escapeHtml(
        parsed.currency || ""
      )}</div>
      ${itemsHtml}
    </div>
    ${rawBlock}
  `;
}

function renderRawContent(checkId, rawXml, founded) {
  if (!founded) {
    return `
      <div class="details-placeholder">
        <div class="details-label">Raw data</div>
        <div class="details-value">Available after find.</div>
      </div>
    `;
  }
  if (!rawXml) {
    return `
      <div class="details-placeholder">
        <div class="details-label">Raw data</div>
        <button class="btn-view" data-action="load-raw" data-check-id="${escapeHtml(
          String(checkId)
        )}" type="button">Load raw data</button>
      </div>
    `;
  }
  return `
    <div class="details-placeholder">
      <div class="details-label">Raw data</div>
      <pre class="details-pre">${escapeHtml(rawXml)}</pre>
    </div>
  `;
}

function resolveParsed(parsed, checkId) {
  if (isParsedReady(parsed)) return parsed;
  const cached = readParsedCache(checkId);
  return isParsedReady(cached) ? cached : null;
}

function isParsedReady(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (Array.isArray(parsed.items) && parsed.items.length) return true;
  return Boolean(parsed.total_sum || parsed.source_format);
}

function readParsedCache(checkId) {
  if (!checkId || checkId === "—") return null;
  try {
    const raw = localStorage.getItem(`parsedCheck:${checkId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function renderSection(title, data) {
  if (!data || Object.keys(data).length === 0) return "";

  const rows = Object.entries(data)
    .filter(([, v]) => String(v || "").trim() !== "")
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");

  if (!rows) return "";

  return `
    <div class="receipt-subtitle">${escapeHtml(title)}</div>
    <div class="table-wrapper">
      <table class="data-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTableSection(title, rows, columns) {
  if (!rows || rows.length === 0) return "";

  const thead = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const tbody = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r?.[c] ?? "")}</td>`).join("")}</tr>`)
    .join("");

  return `
    <div class="receipt-subtitle">${escapeHtml(title)}</div>
    <div class="table-wrapper">
      <table class="data-table list-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}
