import { state } from "./state.js?v=20260120";

const chartEl = document.getElementById("analysis-chart");
const legendEl = document.getElementById("analysis-legend");
const statusEl = document.getElementById("analysis-status");
const incomeEl = document.getElementById("analysis-income");
const expenseEl = document.getElementById("analysis-expenses");
const expenseChangeEl = document.getElementById("analysis-expense-change");
const trendEl = document.getElementById("analysis-trend");
const topEl = document.getElementById("analysis-top");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function initTelegram() {
  const tg = window.Telegram?.WebApp || null;
  state.tg = tg;

  if (!tg) {
    setStatus("Open this Mini App inside Telegram.");
    return;
  }

  tg.ready();
  tg.expand();

  state.initData = tg.initData || null;
  fetchSummary();
}

async function fetchSummary() {
  if (!state.initData) return;
  setStatus("Loading...");
  try {
    const res = await fetch(
      `${state.apiBase}/api/expense_summary?init_data=${encodeURIComponent(state.initData)}`
    );
    if (!res.ok) throw new Error("Failed to load summary");
    const data = await res.json();
    renderSummary(data);
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("Failed to load summary.");
  }
}

function renderSummary(data) {
  const series = Array.isArray(data.series) ? data.series : [];
  const currency = data.currency || "UAH";
  const total = parseFloat(data.total || "0") || 0;

  if (expenseEl) expenseEl.textContent = `${formatMoney(total)} ₴`;
  if (expenseChangeEl) expenseChangeEl.textContent = "+0% from last month";

  if (!series.length || total <= 0) {
    if (chartEl) chartEl.innerHTML = "";
    if (legendEl) legendEl.innerHTML = "No data yet.";
    if (trendEl) trendEl.innerHTML = renderTrendPlaceholder();
    if (topEl) topEl.innerHTML = "";
    return;
  }

  const colors = [
    "#ff6b6b",
    "#4ecdc4",
    "#feca57",
    "#a29bfe",
    "#54a0ff",
    "#1dd1a1",
  ];

  const sorted = [...series].sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
  const slices = sorted.map((item, index) => ({
    label: item.label,
    total: parseFloat(item.total) || 0,
    color: colors[index % colors.length],
  }));

  const svg = buildPieSvg(slices, total);
  if (chartEl) chartEl.innerHTML = svg;

  if (legendEl) {
    legendEl.innerHTML = slices
      .map(
        (item) => `
        <div class="legend-item">
          <span class="legend-swatch" style="background:${item.color}"></span>
          <span class="legend-label">${escapeHtml(item.label)}</span>
          <span class="legend-value">${formatMoney(item.total)} ${currency}</span>
        </div>
      `
      )
      .join("");
  }

  if (trendEl) {
    const values = buildFlatTrend(total);
    trendEl.innerHTML = buildTrendSvg(values, currency);
  }

  if (topEl) {
    topEl.innerHTML = buildTopCategories(slices, total, currency);
  }
}

function buildPieSvg(slices, total) {
  const size = 220;
  const radius = 90;
  const innerRadius = 55;
  const center = size / 2;

  let currentAngle = -90;
  const paths = slices
    .map((slice) => {
      const angle = (slice.total / total) * 360;
      const path = describeDonutSlice(center, center, radius, innerRadius, currentAngle, currentAngle + angle);
      currentAngle += angle;
      return `<path d="${path}" fill="${slice.color}"></path>`;
    })
    .join("");

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${paths}
      <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="var(--card-bg)"></circle>
      <text x="${center}" y="${center - 4}" text-anchor="middle" fill="var(--ios-text-secondary)" font-size="12">Total</text>
      <text x="${center}" y="${center + 18}" text-anchor="middle" fill="var(--ios-text)" font-size="16" font-weight="600">${formatMoney(total)}</text>
    </svg>
  `;
}

function describeDonutSlice(cx, cy, outerR, innerR, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const startInner = polarToCartesian(cx, cy, innerR, startAngle);
  const endInner = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", startOuter.x, startOuter.y,
    "A", outerR, outerR, 0, largeArc, 0, endOuter.x, endOuter.y,
    "L", startInner.x, startInner.y,
    "A", innerR, innerR, 0, largeArc, 1, endInner.x, endInner.y,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTopCategories(slices, total, currency) {
  return slices
    .slice(0, 6)
    .map((item) => {
      const percent = total > 0 ? Math.round((item.total / total) * 100) : 0;
      return `
        <div class="top-row">
          <div class="top-row-head">
            <span class="top-dot" style="background:${item.color}"></span>
            <span class="top-label">${escapeHtml(item.label)}</span>
            <span class="top-meta">${percent}%</span>
            <span class="top-value">${formatMoney(item.total)} ${currency}</span>
          </div>
          <div class="top-bar">
            <div class="top-bar-fill" style="width:${percent}%; background:${item.color}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildFlatTrend(total) {
  return [total * 0.9, total * 0.95, total, total * 0.97, total * 1.02, total * 0.98];
}

function buildTrendSvg(values, currency) {
  const width = 320;
  const height = 200;
  const padding = 24;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  const points = values.map((val, idx) => {
    const x = padding + (idx / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - minValue) / range) * (height - padding * 2);
    return { x, y };
  });

  const path = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const dots = points
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#ff6b6b"></circle>`
    )
    .join("");

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="M ${padding} ${height - padding} H ${width - padding}" stroke="#d9dce6" stroke-width="1"></path>
      <path d="${path}" fill="none" stroke="#ff6b6b" stroke-width="2"></path>
      ${dots}
      <text x="${padding}" y="${padding - 6}" fill="#9ca3af" font-size="11">${currency}</text>
    </svg>
  `;
}

function renderTrendPlaceholder() {
  return `
    <div class="details-value">Trend will appear after more data.</div>
  `;
}

initTelegram();
