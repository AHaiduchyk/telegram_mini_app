export const state = {
  // runtime
  initData: null,
  userId: null,
  scans: [],
  allScans: [],
  visibleCount: 5,
  pageSize: 5,
  loadedCount: 0,
  hasMore: false,
  lastText: null,
  lastTextAt: 0,
  selectedScan: null,

  // caches/statuses
  checkCache: new Map(),
  checkParsed: new Map(),
  checkRaw: new Map(),
  findStatus: new Map(),
  saveStatus: new Map(),

  // ui
  continuousScan: false,
  openMenuKey: null,

  // config
  apiBase: new URLSearchParams(window.location.search).get("api") || window.location.origin,

  // dom (заповниш в init)
  detailsContainer: null,
};
