import { state } from "./state.js";
import {
  escapeHtml,
  truncate,
  getValidCheckUrl,
  pickDbStatus,
  getItemType,
  getItemTitle,
} from "./utils.js";
import { toggleMenu, closeAllMenus } from "./menu.js";
import { findCheck, saveCheck } from "./api.js";

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

    const canFind = Boolean(getValidCheckUrl(scan.raw_text));
    const { founded: dbFounded, saved: dbSaved } = pickDbStatus(scan);

    // align status maps with DB status
    if (dbFounded && !state.findStatus.has(key)) state.findStatus.set(key, "founded");
    if (dbSaved && !state.saveStatus.has(key)) state.saveStatus.set(key, "saved");

    const findSt = state.findStatus.get(key) || (dbFounded ? "founded" : "idle");
    const saveSt = state.saveStatus.get(key) || (dbSaved ? "saved" : "idle");

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
            ${canFind ? generateMenuItems(index, key, findSt, saveSt) : ""}

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
  };
}

export function generateMenuItems(index, key, findStatus, saveStatus) {
  const cached = state.checkCache.get(key);
  const hasXml = Boolean(cached?.text);
  const canSave = findStatus === "founded" && hasXml && saveStatus !== "saved";

  let findText = "Find check";
  let findClass = "";
  let findDisabled = "";
  let findIcon = "";

  if (findStatus === "loading") {
    findText = "Finding…";
    findDisabled = "disabled";
    findIcon = '<div class="spinner"></div>';
  } else if (findStatus === "founded") {
    findText = "✓ Founded";
    findClass = "success";
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

  const infoEntries = Object.entries(scan.info || {});
  const infoGrid = infoEntries.length
    ? `<div class="details-grid">${infoEntries
        .map(([key, value]) => {
          const safeValue = Array.isArray(value) ? value.join(", ") : String(value);
          return `
            <div class="details-item">
              <div class="details-item-key">${escapeHtml(key)}</div>
              <div class="details-item-value">${escapeHtml(safeValue)}</div>
            </div>
          `;
        })
        .join("")}</div>`
    : "";

  const cached = state.checkCache.get(scan.raw_text);
  const receiptBlock = cached ? renderReceipt(cached) : "";

  if (!state.detailsContent) return;

  state.detailsContent.innerHTML = `
    <div class="details-section">
      <div class="details-label">${escapeHtml(scan.type)}</div>
    </div>
    <div class="details-section">
      <div class="details-label">Raw Text</div>
      <div class="details-value">${escapeHtml(scan.raw_text)}</div>
    </div>
    <div class="details-section">
      <div class="details-label">Scanned</div>
      <div class="details-value">${new Date(scan.created_at).toLocaleString()}</div>
    </div>
    ${infoGrid}
    ${receiptBlock}
  `;
}

function renderReceipt(cached) {
  const parsed = cached.parsed;
  const xmlText = cached.text;

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

  if (xmlText) {
    const summary = parseXmlToSummary(xmlText);
    if (summary) {
      return `
        <div class="divider"></div>
        <div class="receipt-section-title">Receipt</div>
        ${renderSection("CHECKHEAD", summary.head)}
        ${renderSection("CHECKTOTAL", summary.total)}
        ${renderTableSection("CHECKPAY", summary.payRows, ["PAYFORMNM", "SUM"])}
        ${renderTableSection("CHECKBODY", summary.bodyRows, ["CODE", "NAME", "AMOUNT", "UNITNM", "PRICE", "COST", "LETTERS"])}
      `;
    }
  }

  return "";
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

function parseXmlToSummary(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const getText = (sel) => {
      const el = doc.querySelector(sel);
      return el ? (el.textContent || "").trim() : "";
    };

    return {
      head: {
        ORGNM: getText("CHECKHEAD > ORGNM"),
        TIN: getText("CHECKHEAD > TIN"),
        POINTNM: getText("CHECKHEAD > POINTNM"),
        POINTADDR: getText("CHECKHEAD > POINTADDR"),
        ORDERDATE: getText("CHECKHEAD > ORDERDATE"),
        ORDERTIME: getText("CHECKHEAD > ORDERTIME"),
        CASHREGISTERNUM: getText("CHECKHEAD > CASHREGISTERNUM"),
        ORDERNUM: getText("CHECKHEAD > ORDERNUM"),
      },
      total: { SUM: getText("CHECKTOTAL > SUM") },
      bodyRows: [...doc.querySelectorAll("CHECKBODY > ROW")].map((row) => ({
        CODE: row.querySelector("CODE")?.textContent?.trim() || "",
        NAME: row.querySelector("NAME")?.textContent?.trim() || "",
        AMOUNT: row.querySelector("AMOUNT")?.textContent?.trim() || "",
        UNITNM: row.querySelector("UNITNM")?.textContent?.trim() || "",
        PRICE: row.querySelector("PRICE")?.textContent?.trim() || "",
        COST: row.querySelector("COST")?.textContent?.trim() || "",
        LETTERS: row.querySelector("LETTERS")?.textContent?.trim() || "",
      })),
      payRows: [...doc.querySelectorAll("CHECKPAY > ROW")].map((row) => ({
        PAYFORMNM: row.querySelector("PAYFORMNM")?.textContent?.trim() || "",
        SUM: row.querySelector("SUM")?.textContent?.trim() || "",
      })),
    };
  } catch {
    return null;
  }
}