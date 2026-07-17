// NOAI-ECON-FLOWS-005 — read-only deterministic logistics network.
// NOAI-ECON-FLOWS-005C — optional flow direction animation (particles when the
// panel is wide enough, marching dashes when it is narrow; both purely
// decorative/informational, never touching simulation state).

const LOGISTICS_FLOW_ANIM_STORAGE_KEY = 'lorerelay.logisticsFlowAnimation';
const LOGISTICS_COMPACT_WIDTH_PX = 420;
const LOGISTICS_LAYOUT_STORAGE_SCHEMA = 1;
const LOGISTICS_LAYOUT_STORAGE_ALGO = 'region-hybrid-1';
const LOGISTICS_LAYOUT_STORAGE_LIMIT = 500;

// LOGISTICS-GRAPH-CANVAS-SLICE1 — pointer-centred camera over a fixed-size
// viewport. See docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md §2. Layout,
// route geometry, and colour are unchanged in this slice; only a camera
// transform is layered on top of the existing content.
const LOGISTICS_ZOOM_MIN = 0.25;
const LOGISTICS_ZOOM_MAX = 3.0;
const LOGISTICS_ZOOM_STEP = 1.15;
const LOGISTICS_WHEEL_K = 0.0015;
const LOGISTICS_FIT_PADDING = 32;
const LOGISTICS_FIT_SLACK = 0.92;
const LOGISTICS_PAN_STEP = 48;
const LOGISTICS_PAN_STEP_FAST = LOGISTICS_PAN_STEP * 4;
const LOGISTICS_DRAG_THRESHOLD_PX = 4;
// Max |normalized CSS-pixel| wheel delta accepted before zoom math runs.
// Extremely large page/line deltas (or pathological input devices) clamp here
// so exp() never produces non-finite k/tx/ty.
const LOGISTICS_WHEEL_DELTA_MAX = 4096;
// Half-extent of a rendered node box (see renderLogisticsNode's -76/-30
// translate below) — used only to give a single node a sane fit-all bbox.
const LOGISTICS_NODE_HALF_W = 76;
const LOGISTICS_NODE_HALF_H = 30;
// Viewport CSS size is fixed and independent of graph content (see
// .logistics-network-viewport). These mirror that CSS so fit-all can be
// computed without racing DOM layout.
const LOGISTICS_VIEWPORT_HEIGHT = 420;
const LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX = 640;
const LOGISTICS_VIEWPORT_WIDTH_FALLBACK = 760;
const LOGISTICS_CAMERA_EASE_MS = 200;

function logisticsClampZoom(k) {
  const n = Number(k);
  if (!Number.isFinite(n)) { return LOGISTICS_ZOOM_MIN; }
  return Math.max(LOGISTICS_ZOOM_MIN, Math.min(LOGISTICS_ZOOM_MAX, n));
}

function logisticsIsValidCamera(camera) {
  return Boolean(camera)
    && Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty)
    && camera.k >= LOGISTICS_ZOOM_MIN - 1e-9 && camera.k <= LOGISTICS_ZOOM_MAX + 1e-9;
}

/** Rejects NaN/±Infinity/non-object bboxes so Fit All never builds
 * translate(Infinity) from malformed content bounds. */
function logisticsIsFiniteBBox(bbox) {
  return Boolean(bbox)
    && Number.isFinite(bbox.minX) && Number.isFinite(bbox.minY)
    && Number.isFinite(bbox.maxX) && Number.isFinite(bbox.maxY)
    && bbox.maxX >= bbox.minX && bbox.maxY >= bbox.minY;
}

/** Recovers a positive finite viewport size; used by Fit All and zoom-by-step. */
function logisticsSanitizeViewportSize(viewportSize) {
  const width = Number(viewportSize && viewportSize.width);
  const height = Number(viewportSize && viewportSize.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : LOGISTICS_VIEWPORT_WIDTH_FALLBACK,
    height: Number.isFinite(height) && height > 0 ? height : LOGISTICS_VIEWPORT_HEIGHT,
  };
}

function logisticsWorldToScreen(camera, point) {
  return { x: point.x * camera.k + camera.tx, y: point.y * camera.k + camera.ty };
}

function logisticsScreenToWorld(camera, point) {
  return { x: (point.x - camera.tx) / camera.k, y: (point.y - camera.ty) / camera.k };
}

/** Pointer-centred zoom: the world point under `screenPoint` is unchanged.
 * Non-finite inputs retain the previous camera (never emit Infinity into SVG). */
function logisticsZoomAt(camera, screenPoint, nextK) {
  if (!logisticsIsValidCamera(camera)) { return camera; }
  const k = logisticsClampZoom(nextK);
  if (k === camera.k) { return camera; }
  const sx = Number(screenPoint && screenPoint.x);
  const sy = Number(screenPoint && screenPoint.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) { return camera; }
  const ratio = k / camera.k;
  if (!Number.isFinite(ratio)) { return camera; }
  const tx = sx - (sx - camera.tx) * ratio;
  const ty = sy - (sy - camera.ty) * ratio;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) { return camera; }
  return { k, tx, ty, userModified: true };
}

/** Normalizes wheel deltaMode: 0 = pixel, 1 = line, 2 = page. Result is
 * always finite and clamped to ±LOGISTICS_WHEEL_DELTA_MAX CSS pixels. */
function logisticsWheelDeltaY(event) {
  let deltaY = Number(event && event.deltaY);
  if (!Number.isFinite(deltaY)) { deltaY = 0; }
  const mode = Number(event && event.deltaMode) || 0;
  if (mode === 1) { deltaY *= 16; } else if (mode === 2) { deltaY *= 320; }
  if (!Number.isFinite(deltaY)) { return 0; }
  if (deltaY > LOGISTICS_WHEEL_DELTA_MAX) { return LOGISTICS_WHEEL_DELTA_MAX; }
  if (deltaY < -LOGISTICS_WHEEL_DELTA_MAX) { return -LOGISTICS_WHEEL_DELTA_MAX; }
  return deltaY;
}

function logisticsZoomFromWheel(camera, screenPoint, deltaY) {
  const dy = Number(deltaY);
  if (!Number.isFinite(dy)) { return camera; }
  const factor = Math.exp(-dy * LOGISTICS_WHEEL_K);
  if (!Number.isFinite(factor)) { return camera; }
  return logisticsZoomAt(camera, screenPoint, camera.k * factor);
}

function logisticsZoomByStep(camera, viewportSize, direction) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const center = { x: vp.width / 2, y: vp.height / 2 };
  const dir = Number(direction);
  if (!Number.isFinite(dir)) { return camera; }
  const factor = Math.pow(LOGISTICS_ZOOM_STEP, dir);
  if (!Number.isFinite(factor)) { return camera; }
  return logisticsZoomAt(camera, center, camera.k * factor);
}

function logisticsPanBy(camera, dx, dy) {
  if (!logisticsIsValidCamera(camera)) { return camera; }
  const ddx = Number(dx);
  const ddy = Number(dy);
  if (!Number.isFinite(ddx) || !Number.isFinite(ddy)) { return camera; }
  const tx = camera.tx + ddx;
  const ty = camera.ty + ddy;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) { return camera; }
  return { k: camera.k, tx, ty, userModified: true };
}

/** bbox of rendered node boxes (world space), or null for an empty graph. */
function logisticsComputeContentBBox(nodePositions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  nodePositions.forEach((pos) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) { return; }
    found = true;
    minX = Math.min(minX, pos.x - LOGISTICS_NODE_HALF_W);
    maxX = Math.max(maxX, pos.x + LOGISTICS_NODE_HALF_W);
    minY = Math.min(minY, pos.y - LOGISTICS_NODE_HALF_H);
    maxY = Math.max(maxY, pos.y + LOGISTICS_NODE_HALF_H);
  });
  if (!found) { return null; }
  const bbox = { minX, minY, maxX, maxY };
  return logisticsIsFiniteBBox(bbox) ? bbox : null;
}

function logisticsDefaultCamera(viewportSize) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  return { k: 1, tx: vp.width / 2, ty: vp.height / 2, userModified: false };
}

/** Fits bbox into viewportSize with screen-space padding, then multiplies the
 * free scale by LOGISTICS_FIT_SLACK (0.92) so decorations keep breathing room.
 * Symmetric excess slack is preserved by centering on the content midpoint. */
function logisticsFitAllCamera(bbox, viewportSize, padding = LOGISTICS_FIT_PADDING) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  if (!logisticsIsFiniteBBox(bbox)) { return logisticsDefaultCamera(vp); }
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : LOGISTICS_FIT_PADDING;
  const contentW = Math.max(1, bbox.maxX - bbox.minX);
  const contentH = Math.max(1, bbox.maxY - bbox.minY);
  const availW = Math.max(1, vp.width - pad * 2);
  const availH = Math.max(1, vp.height - pad * 2);
  const freeScale = Math.min(availW / contentW, availH / contentH);
  const k = logisticsClampZoom(freeScale * LOGISTICS_FIT_SLACK);
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;
  const tx = vp.width / 2 - centerX * k;
  const ty = vp.height / 2 - centerY * k;
  if (!Number.isFinite(k) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
    return logisticsDefaultCamera(vp);
  }
  return { k, tx, ty, userModified: false };
}

function logisticsBBoxIntersectsViewport(bbox, camera, viewportSize) {
  if (!logisticsIsFiniteBBox(bbox) || !logisticsIsValidCamera(camera)) { return true; }
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const a = logisticsWorldToScreen(camera, { x: bbox.minX, y: bbox.minY });
  const b = logisticsWorldToScreen(camera, { x: bbox.maxX, y: bbox.maxY });
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) { return true; }
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return right >= 0 && left <= vp.width && bottom >= 0 && top <= vp.height;
}

/** Deterministic identity of a dataset's graph shape, independent of the
 * active commodity filter and of ordinary per-tick value changes. */
function logisticsDatasetIdentity(payload) {
  if (!payload) { return ''; }
  const nodeIds = (payload.nodes || []).map((item) => item && item.id).filter(Boolean).slice().sort();
  const routeIds = (payload.routes || []).map((item) => item && item.id).filter(Boolean).slice().sort();
  return `${nodeIds.join(',')}|${routeIds.join(',')}`;
}

/** Which host is currently being rendered: independent camera memory per host. */
function logisticsCameraHostKey() {
  return economyLogisticsUiState.lightboxHost ? 'lightbox' : 'normal';
}

function logisticsActiveCameraContext() {
  const key = logisticsCameraHostKey();
  const contexts = economyLogisticsUiState.cameraContexts;
  if (!contexts[key]) {
    contexts[key] = { camera: null, identity: null };
  }
  return contexts[key];
}

function logisticsEmptyCameraContexts() {
  return {
    normal: { camera: null, identity: null },
    lightbox: { camera: null, identity: null },
  };
}

/** Resolves the camera for this host/render.
 *
 * same dataset identity → always retain a valid camera
 * changed identity + userModified → retain exactly, update identity, never Fit All
 * changed identity + !userModified + content intersects viewport → retain
 * changed identity + !userModified + all content off-screen → one bounded Fit All
 */
function logisticsResolveCameraForRender(payload, bbox, viewportSize) {
  const ctx = logisticsActiveCameraContext();
  const identity = logisticsDatasetIdentity(payload);
  const vp = logisticsSanitizeViewportSize(viewportSize);
  if (!logisticsIsValidCamera(ctx.camera)) {
    ctx.camera = logisticsFitAllCamera(bbox, vp);
    ctx.identity = identity;
    return ctx.camera;
  }
  if (ctx.identity === identity) {
    return ctx.camera;
  }
  // Dataset identity changed.
  if (ctx.camera.userModified === true) {
    ctx.identity = identity;
    return ctx.camera;
  }
  if (logisticsBBoxIntersectsViewport(bbox, ctx.camera, vp)) {
    ctx.identity = identity;
    return ctx.camera;
  }
  ctx.camera = logisticsFitAllCamera(bbox, vp);
  ctx.identity = identity;
  return ctx.camera;
}

function logisticsPrefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function logisticsLoadFlowAnimationPref() {
  try {
    return window.localStorage.getItem(LOGISTICS_FLOW_ANIM_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function logisticsSaveFlowAnimationPref(enabled) {
  try {
    window.localStorage.setItem(LOGISTICS_FLOW_ANIM_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch { /* private browsing / quota — animation choice just won't persist */ }
}

/** Deterministic pseudo-random unit value from an id, used only to stagger
 *  particle start times so parallel routes don't all pulse in lockstep. */
function logisticsHashUnit(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return (h % 997) / 997;
}

function logisticsFlowMotionActive() {
  return economyLogisticsUiState.flowAnimationEnabled && !logisticsPrefersReducedMotion();
}

function logisticsFlowDurationSeconds(route) {
  const util = Math.max(0, Math.min(1, route.utilization || 0));
  if (route.status === 'raided') { return 2.8 + (1 - util) * 1.6; }
  if (route.status === 'strained') { return 2.2 + (1 - util) * 1.4; }
  return 1.6 + (1 - util) * 1.2;
}

let logisticsNetworkResizeObserver = null;

/** Measures the actual scrollable viewport (not the min-width-forced SVG) so a
 *  docked, narrow status column reliably falls back to marching dashes even
 *  when the overall VS Code window is wide. */
function logisticsObserveNetworkWidth(viewportEl) {
  if (typeof ResizeObserver !== 'function') { return; }
  if (!logisticsNetworkResizeObserver) {
    logisticsNetworkResizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      const compact = width < LOGISTICS_COMPACT_WIDTH_PX;
      if (compact !== economyLogisticsUiState.compactAnimation) {
        economyLogisticsUiState.compactAnimation = compact;
        renderEconomyLogisticsPanel();
      }
    });
  } else {
    logisticsNetworkResizeObserver.disconnect();
  }
  logisticsNetworkResizeObserver.observe(viewportEl);
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const logisticsMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onLogisticsMotionChange = () => renderEconomyLogisticsPanel();
  if (typeof logisticsMotionQuery.addEventListener === 'function') {
    logisticsMotionQuery.addEventListener('change', onLogisticsMotionChange);
  } else if (typeof logisticsMotionQuery.addListener === 'function') {
    logisticsMotionQuery.addListener(onLogisticsMotionChange);
  }
}

const economyLogisticsUiState = {
  payload: null,
  commodityId: 'all',
  selection: null,
  flowAnimationEnabled: logisticsLoadFlowAnimationPref(),
  // Conservative default (marching dashes, no particles) until the real
  // container width is measured by ResizeObserver on first paint.
  compactAnimation: true,
  // Non-null while the panel is rendering inside the "view large" lightbox
  // instead of its normal sidebar location (see ensureVisualLightbox below).
  lightboxHost: null,
  // Independent in-memory cameras per host (normal 420px vs lightbox 640px).
  // Selection/filter remain shared; no localStorage persistence in this slice.
  cameraContexts: {
    normal: { camera: null, identity: null },
    lightbox: { camera: null, identity: null },
  },
  // True while the Space key is held with focus inside the graph viewport,
  // enabling background-style pan even when the pointer starts on a node.
  // Cleared on focus loss / window blur so a stale Space cannot sticky-pan.
  spaceHeld: false,
  scopeKey: 'default',
  persistedScopeKey: null,
  manualPositions: {},
  collapsedRegionIds: new Set(),
  layout: null,
  rendered: null,
  storageFallback: new Map(),
  cameraSaveTimers: {},
};

function logisticsScopeKey(payload) {
  const value = String(payload?.scopeKey || 'default').toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(value) ? value : 'default';
}

function logisticsStorageKey(kind, scopeKey) {
  return `lorerelay.logistics.${kind}.v1.${scopeKey}`;
}

function logisticsStorageGet(key) {
  // A failed write can be more recent than the underlying store. Keep an
  // overlay (including a null tombstone) until a later storage operation
  // succeeds, rather than allowing stale localStorage data to reappear.
  if (economyLogisticsUiState.storageFallback.has(key)) { return economyLogisticsUiState.storageFallback.get(key); }
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function logisticsStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    economyLogisticsUiState.storageFallback.delete(key);
  } catch { economyLogisticsUiState.storageFallback.set(key, value); }
}

function logisticsStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
    economyLogisticsUiState.storageFallback.delete(key);
  } catch { economyLogisticsUiState.storageFallback.set(key, null); }
}

function logisticsValidStoredPosition(value) {
  return Boolean(value) && Number.isFinite(value.x) && Number.isFinite(value.y)
    && Math.abs(value.x) <= 50000 && Math.abs(value.y) <= 50000
    && typeof value.regionId === 'string';
}

function logisticsLoadLayoutPositions(scopeKey) {
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('layout', scopeKey)) || 'null');
    if (!parsed || parsed.v !== LOGISTICS_LAYOUT_STORAGE_SCHEMA || parsed.algo !== LOGISTICS_LAYOUT_STORAGE_ALGO
      || !parsed.positions || typeof parsed.positions !== 'object' || Array.isArray(parsed.positions)) { return {}; }
    const valid = Object.entries(parsed.positions)
      .filter(([, value]) => logisticsValidStoredPosition(value))
      .map(([id, value]) => [id, { x: value.x, y: value.y, regionId: value.regionId, ts: Number.isFinite(value.ts) ? value.ts : 0 }]);
    valid.sort((a, b) => a[1].ts - b[1].ts || logisticsLayoutCompareId(a[0], b[0]));
    return Object.fromEntries(valid.slice(Math.max(0, valid.length - LOGISTICS_LAYOUT_STORAGE_LIMIT)));
  } catch { return {}; }
}

function logisticsSaveLayoutPositions() {
  const entries = Object.entries(economyLogisticsUiState.manualPositions).filter(([, value]) => logisticsValidStoredPosition(value));
  entries.sort((a, b) => a[1].ts - b[1].ts || logisticsLayoutCompareId(a[0], b[0]));
  economyLogisticsUiState.manualPositions = Object.fromEntries(entries.slice(Math.max(0, entries.length - LOGISTICS_LAYOUT_STORAGE_LIMIT)));
  logisticsStorageSet(logisticsStorageKey('layout', economyLogisticsUiState.scopeKey), JSON.stringify({
    v: LOGISTICS_LAYOUT_STORAGE_SCHEMA,
    algo: LOGISTICS_LAYOUT_STORAGE_ALGO,
    positions: economyLogisticsUiState.manualPositions,
  }));
}

function logisticsPruneWrongRegionManualPositions(layout) {
  let removed = false;
  for (const id of layout?.diagnostics?.wrongRegionManualIds || []) {
    if (Object.prototype.hasOwnProperty.call(economyLogisticsUiState.manualPositions, id)) {
      delete economyLogisticsUiState.manualPositions[id];
      removed = true;
    }
  }
  if (removed) { logisticsSaveLayoutPositions(); }
  return removed;
}

function logisticsValidStoredCamera(value) {
  return logisticsIsValidCamera(value) && typeof value.userModified === 'boolean';
}

function logisticsLoadCameraContexts(scopeKey) {
  const contexts = logisticsEmptyCameraContexts();
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('camera', scopeKey)) || 'null');
    if (!parsed || parsed.v !== 1) { return contexts; }
    for (const key of ['normal', 'lightbox']) {
      if (logisticsValidStoredCamera(parsed[key])) { contexts[key].camera = { ...parsed[key] }; }
    }
  } catch { /* fresh in-memory cameras are valid fallback */ }
  return contexts;
}

function logisticsSaveCameraContext(scopeKey, hostKey, camera) {
  let out = { v: 1 };
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('camera', scopeKey)) || 'null');
    if (parsed && parsed.v === 1) { out = { v: 1 }; for (const key of ['normal', 'lightbox']) { if (logisticsValidStoredCamera(parsed[key])) { out[key] = parsed[key]; } } }
  } catch { /* write a fresh, valid context below */ }
  if (logisticsValidStoredCamera(camera)) { out[hostKey] = { ...camera }; }
  logisticsStorageSet(logisticsStorageKey('camera', scopeKey), JSON.stringify(out));
}

function logisticsQueueCameraSave(immediate) {
  const hostKey = logisticsCameraHostKey();
  const scopeKey = economyLogisticsUiState.scopeKey;
  const camera = { ...economyLogisticsUiState.cameraContexts[hostKey].camera };
  const key = `${scopeKey}:${hostKey}`;
  const timers = economyLogisticsUiState.cameraSaveTimers;
  if (timers[key]) { clearTimeout(timers[key]); timers[key] = null; }
  if (immediate) { logisticsSaveCameraContext(scopeKey, hostKey, camera); return; }
  timers[key] = setTimeout(() => { timers[key] = null; logisticsSaveCameraContext(scopeKey, hostKey, camera); }, 220);
}

function logisticsCancelCameraSaves(scopeKey) {
  const prefix = `${scopeKey}:`;
  for (const [key, timer] of Object.entries(economyLogisticsUiState.cameraSaveTimers)) {
    if (!key.startsWith(prefix)) { continue; }
    if (timer) { clearTimeout(timer); }
    delete economyLogisticsUiState.cameraSaveTimers[key];
  }
}

function logisticsLoadPrefs(scopeKey) {
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('prefs', scopeKey)) || 'null');
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.collapsed)) { return new Set(); }
    return new Set(parsed.collapsed.filter((id) => typeof id === 'string' && id && id !== '__unassigned'));
  } catch { return new Set(); }
}

function logisticsSavePrefs() {
  logisticsStorageSet(logisticsStorageKey('prefs', economyLogisticsUiState.scopeKey), JSON.stringify({
    v: 1,
    collapsed: [...economyLogisticsUiState.collapsedRegionIds].sort(logisticsLayoutCompareId),
  }));
}

function logisticsEnsureScope(payload) {
  const scopeKey = logisticsScopeKey(payload);
  if (economyLogisticsUiState.persistedScopeKey === scopeKey) { return; }
  economyLogisticsUiState.scopeKey = scopeKey;
  economyLogisticsUiState.persistedScopeKey = scopeKey;
  economyLogisticsUiState.manualPositions = logisticsLoadLayoutPositions(scopeKey);
  economyLogisticsUiState.collapsedRegionIds = logisticsLoadPrefs(scopeKey);
  economyLogisticsUiState.cameraContexts = logisticsLoadCameraContexts(scopeKey);
}

function logisticsElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) { node.className = className; }
  if (value !== undefined && value !== null) { node.textContent = String(value); }
  return node;
}

function logisticsSvgElement(tag, className) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className) { node.setAttribute('class', className); }
  return node;
}

function logisticsNumber(value, digits = 1) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0+$/, '');
}

function logisticsPercent(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function logisticsStatusLabel(status) {
  return T(`webview.world.logisticsStatus${String(status || 'open').replace(/^./, (c) => c.toUpperCase())}`);
}

function logisticsRiskLabel(risk) {
  if (risk >= 0.67) { return T('webview.world.logisticsRiskHigh'); }
  if (risk >= 0.34) { return T('webview.world.logisticsRiskMedium'); }
  return T('webview.world.logisticsRiskLow');
}

function logisticsNodeKindLabel(kind) {
  const role = logisticsNodeRole(kind).replace('-', '');
  return T(`webview.world.logisticsNode${role.replace(/^./, (c) => c.toUpperCase())}`);
}

function logisticsCommodityName(payload, commodityId) {
  const commodity = (payload?.commodities || []).find((item) => item.id === commodityId);
  return commodity?.name || commodityId || '?';
}

function logisticsNodeName(payload, nodeId) {
  const node = (payload?.nodes || []).find((item) => item.id === nodeId);
  return node?.label || nodeId || '?';
}

function logisticsUnavailableText(reason) {
  const keyByReason = {
    commerce_disabled: 'webview.world.logisticsCommerceDisabled',
    missing_definition: 'webview.world.logisticsMissingDefinition',
    snapshot_unavailable: 'webview.world.logisticsSnapshotUnavailable',
    no_route_summaries: 'webview.world.logisticsNoRoutes',
  };
  return T(keyByReason[reason] || 'webview.world.logisticsUnavailable');
}

function logisticsNodeRank(kind) {
  if (kind === 'region') { return 0; }
  if (kind === 'settlement' || kind === 'facility') { return 1; }
  return 2;
}

/** Stable, CSS-safe fragment id for sharing the rendered route path with
 * animateMotion. Encoding code points avoids collisions from punctuation. */
function logisticsDomId(value) {
  return Array.from(String(value ?? 'route'))
    .map((character) => character.codePointAt(0).toString(16))
    .join('-');
}

function logisticsNodeRole(kind) {
  const value = String(kind || 'region').toLowerCase();
  if (value === 'city' || value === 'town' || value === 'village') { return 'settlement'; }
  if (value === 'vehicle' || value === 'wagon' || value === 'ship') { return 'vehicle'; }
  if (value === 'caravan') { return 'caravan'; }
  if (value === 'envoy' || value === 'group' || value === 'moving_group') { return 'envoy'; }
  if (value === 'mobile_base' || value === 'base') { return 'mobile-base'; }
  return ['region', 'settlement', 'market', 'facility', 'store'].includes(value) ? value : 'region';
}

/** Factual scale only: explicit payload tier, otherwise deterministic route degree. */
function logisticsNodeScale(node, routes) {
  if (['minor', 'standard', 'major'].includes(node?.scale)) { return node.scale; }
  const degree = (routes || []).filter((route) => route.fromNodeId === node?.id || route.toNodeId === node?.id).length;
  if (degree >= 4) { return 'major'; }
  if (degree === 1) { return 'minor'; }
  return 'standard';
}

function logisticsNodeShapePath(role) {
  const paths = {
    settlement: 'M 8 0 H 144 L 152 8 V 52 L 144 60 H 8 L 0 52 V 8 Z',
    market: 'M 18 0 H 134 Q 152 0 152 18 V 42 Q 152 60 134 60 H 18 Q 0 60 0 42 V 18 Q 0 0 18 0 Z',
    facility: 'M 0 0 H 152 V 60 H 0 Z',
    vehicle: 'M 16 6 H 136 L 152 30 L 136 54 H 16 L 0 30 Z',
    caravan: 'M 4 8 H 70 V 52 H 4 Z M 82 8 H 148 V 52 H 82 Z',
    envoy: 'M 76 0 L 152 30 L 76 60 L 0 30 Z',
    'mobile-base': 'M 14 0 H 138 L 152 30 L 138 60 H 14 L 0 30 Z',
    region: 'M 20 0 H 132 Q 152 0 152 20 V 40 Q 152 60 132 60 H 20 Q 0 60 0 40 V 20 Q 0 0 20 0 Z',
    store: 'M 6 0 H 146 L 152 10 V 60 H 0 V 10 Z',
  };
  return paths[role] || paths.region;
}

function logisticsNodeSymbol(role) {
  return ({ settlement: '◆', market: 'M', facility: 'F', vehicle: '→', caravan: 'C', envoy: 'E', 'mobile-base': 'B', store: 'S', region: '○' })[role] || '○';
}

// CJK glyphs are roughly twice as wide as ASCII at the node-label font size, so
// truncate by width units instead of characters to keep labels inside the box.
function logisticsTruncateLabel(label) {
  const text = String(label ?? '');
  const wide = /[ᄀ-ᇿ⺀-鿿　-ヿ㄰-㆏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
  let units = 0;
  let out = '';
  for (const ch of text) {
    units += wide.test(ch) ? 2 : 1;
    if (units > 19) { return `${out}…`; }
    out += ch;
  }
  return text;
}

function buildLogisticsLayout(nodes, routes, options) {
  return computeLogisticsLayout(nodes, routes, options);
}

function appendLogisticsTitle(parent, value) {
  const title = logisticsSvgElement('title');
  title.textContent = value;
  parent.appendChild(title);
}

function activateLogisticsSelection(selection) {
  economyLogisticsUiState.selection = selection;
  renderEconomyLogisticsPanel();
}

function bindLogisticsActivation(node, selection) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.addEventListener('click', () => activateLogisticsSelection(selection));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateLogisticsSelection(selection);
    }
  });
}

function renderLogisticsSummary(payload, parent) {
  const summary = logisticsElement('div', 'logistics-summary');
  const items = [
    ['webview.world.logisticsActiveRoutes', payload.summary?.activeRoutes ?? 0],
    ['webview.world.logisticsDisruptedRoutes', (payload.summary?.blockedRoutes ?? 0) + (payload.summary?.raidedRoutes ?? 0)],
    ['webview.world.logisticsShortages', payload.summary?.shortageCount ?? 0],
    ['webview.world.logisticsTotalFlow', logisticsNumber(payload.summary?.totalVolume ?? 0)],
  ];
  items.forEach(([key, value]) => {
    const chip = logisticsElement('div', 'logistics-summary-chip');
    chip.appendChild(logisticsElement('span', 'logistics-summary-label', T(key)));
    chip.appendChild(logisticsElement('strong', '', value));
    summary.appendChild(chip);
  });
  parent.appendChild(summary);
}

function renderLogisticsFilter(payload, parent) {
  const row = logisticsElement('div', 'logistics-filter-row');
  const label = logisticsElement('label', '', T('webview.world.logisticsCommodityFilter'));
  label.setAttribute('for', 'world-logistics-commodity-filter');
  const select = logisticsElement('select', 'logistics-filter');
  select.id = 'world-logistics-commodity-filter';
  const all = logisticsElement('option', '', T('webview.world.logisticsAllCommodities'));
  all.value = 'all';
  select.appendChild(all);
  (payload.commodities || []).forEach((commodity) => {
    const flags = [
      commodity.localSpecialty ? T('webview.world.logisticsSpecialtyShort') : '',
      commodity.strategic ? T('webview.world.logisticsStrategicShort') : '',
    ].filter(Boolean);
    const option = logisticsElement('option', '', `${commodity.name}${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
    option.value = commodity.id;
    select.appendChild(option);
  });
  if (!(payload.commodities || []).some((item) => item.id === economyLogisticsUiState.commodityId)) {
    economyLogisticsUiState.commodityId = 'all';
  }
  select.value = economyLogisticsUiState.commodityId;
  select.addEventListener('change', () => {
    economyLogisticsUiState.commodityId = select.value || 'all';
    renderEconomyLogisticsPanel();
  });
  row.appendChild(label);
  row.appendChild(select);
  renderLogisticsFlowToggle(row);
  parent.appendChild(row);
}

function renderLogisticsFlowToggle(row) {
  const reduced = logisticsPrefersReducedMotion();
  const enabled = economyLogisticsUiState.flowAnimationEnabled;
  const btn = logisticsElement(
    'button',
    `logistics-flow-toggle-btn${enabled && !reduced ? ' is-active' : ''}`,
    T(enabled ? 'webview.world.logisticsFlowAnimationOn' : 'webview.world.logisticsFlowAnimationOff')
  );
  btn.type = 'button';
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.title = reduced
    ? T('webview.world.logisticsFlowAnimationReducedMotionTitle')
    : T('webview.world.logisticsFlowAnimationTitle');
  btn.disabled = reduced;
  btn.addEventListener('click', () => {
    economyLogisticsUiState.flowAnimationEnabled = !economyLogisticsUiState.flowAnimationEnabled;
    logisticsSaveFlowAnimationPref(economyLogisticsUiState.flowAnimationEnabled);
    renderEconomyLogisticsPanel();
  });
  row.appendChild(btn);
}

function visibleLogisticsData(payload) {
  const commodityId = economyLogisticsUiState.commodityId;
  // Layout and topology always come from the complete sanitized payload. The
  // active commodity filter only changes relevance treatment, never positions.
  const routes = (payload.routes || []).slice();
  const shortages = (payload.shortages || []).filter((item) => item.unmetDemand > 0 && (commodityId === 'all' || item.commodityId === commodityId));
  const nodes = (payload.nodes || []).slice();
  return { routes, shortages, nodes, commodityId };
}

function logisticsAggregateId(regionId) {
  // NUL cannot occur in sanitized authored ids, so this cannot collide.
  return `\u0000lr-region-aggregate:${regionId}`;
}

function logisticsCurrentLocationRegionId(payload) {
  return [...logisticsCurrentLocationRegionIds(payload)][0] || null;
}

function logisticsCurrentLocationRegionIds(payload) {
  const currentId = typeof currentWorldLocationId === 'string' ? currentWorldLocationId : '';
  if (!currentId) { return new Set(); }
  return new Set((payload.nodes || [])
    .filter((node) => node.locationId === currentId && logisticsLayoutValidRegionId(node.regionId))
    .map((node) => node.regionId));
}

function logisticsNodeIsRelevant(payload, node, commodityId, routes, shortages) {
  if (commodityId === 'all') { return true; }
  const selected = economyLogisticsUiState.selection;
  const selectedRoute = selected?.type === 'route' ? (payload.routes || []).find((route) => route.id === selected.id) : null;
  const currentId = typeof currentWorldLocationId === 'string' ? currentWorldLocationId : '';
  const listsCommodity = (node.commodityIds || []).includes(commodityId)
    || (node.production || []).some((entry) => entry.commodityId === commodityId)
    || (node.consumption || []).some((entry) => entry.commodityId === commodityId)
    || (node.storage || []).some((entry) => entry.commodityId === commodityId);
  const routeEndpoint = routes.some((route) => route.commodityId === commodityId && (route.fromNodeId === node.id || route.toNodeId === node.id));
  const shortage = shortages.some((item) => item.nodeId === node.id && item.commodityId === commodityId);
  const processing = (payload.processingSites || []).some((site) => site.nodeId === node.id && (site.commodityId === commodityId || (site.commodityIds || []).includes(commodityId)));
  return listsCommodity || routeEndpoint || shortage || processing
    || (selected?.type === 'node' && selected.id === node.id)
    || Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id))
    || Boolean(currentId && node.locationId === currentId);
}

function logisticsBuildRenderedGraph(payload, layout, commodityId) {
  const positions = new Map(layout.nodes);
  const collapsed = new Set([...economyLogisticsUiState.collapsedRegionIds].filter((id) => layout.regions.has(id)));
  const aggregateByMember = new Map();
  const nodes = [];
  for (const node of payload.nodes || []) {
    const regionId = layout.nodes.get(node.id)?.regionId;
    if (regionId && collapsed.has(regionId)) {
      aggregateByMember.set(node.id, logisticsAggregateId(regionId));
    } else {
      nodes.push({ ...node, filterMatch: logisticsNodeIsRelevant(payload, node, commodityId, payload.routes || [], payload.shortages || []) });
    }
  }
  for (const regionId of [...collapsed].sort(logisticsLayoutCompareId)) {
    const region = layout.regions.get(regionId);
    if (!region) { continue; }
    const id = logisticsAggregateId(regionId);
    positions.set(id, { x: region.x + region.w / 2, y: region.y + region.h / 2, w: 184, h: 72, tier: 'major', regionId, aggregate: true, manual: false });
    const memberNodes = (payload.nodes || []).filter((node) => node.regionId === regionId);
    nodes.push({ id, label: region.label, kind: 'region', scale: 'major', aggregate: true, memberCount: region.memberIds.length, regionId, commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [], filterMatch: memberNodes.some((node) => logisticsNodeIsRelevant(payload, node, commodityId, payload.routes || [], payload.shortages || [])) });
  }
  const routes = [];
  const selected = economyLogisticsUiState.selection;
  for (const route of payload.routes || []) {
    const fromNodeId = aggregateByMember.get(route.fromNodeId) || route.fromNodeId;
    const toNodeId = aggregateByMember.get(route.toNodeId) || route.toNodeId;
    if (fromNodeId === toNodeId || !positions.has(fromNodeId) || !positions.has(toNodeId)) { continue; }
    // Route is relevant when the commodity matches OR the route itself is
    // selected. Do not treat every route incident to a selected node as selected.
    const routeSelected = selected?.type === 'route' && selected.id === route.id;
    const filterMatch = commodityId === 'all' || route.commodityId === commodityId || routeSelected;
    routes.push({ ...route, fromNodeId, toNodeId, filterMatch });
  }
  return { nodes, routes, positions, collapsed };
}

function logisticsNodeTransform(position) {
  return `translate(${position.x - position.w / 2} ${position.y - position.h / 2})`;
}

/** One deterministic geometry contract for stroke, arrow, particles and labels. */
function logisticsRouteGeometry(route, from, to) {
  if (!from || !to || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) { return null; }
  const direction = to.x >= from.x ? 1 : -1;
  const start = { x: from.x + direction * 78, y: from.y };
  const end = { x: to.x - direction * 78, y: to.y };
  if (start.x === end.x && start.y === end.y) { return null; }
  const dx = end.x - start.x;
  const bend = Math.round((logisticsHashUnit(route?.id) - 0.5) * 44);
  const c1 = { x: start.x + dx * 0.36, y: start.y + bend };
  const c2 = { x: end.x - dx * 0.36, y: end.y + bend };
  const pointAt = (t) => {
    const u = 1 - t;
    return {
      x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
    };
  };
  return {
    start,
    end,
    c1,
    c2,
    d: `M ${start.x},${start.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`,
    pointAt,
  };
}

function renderLogisticsRoute(svg, payload, route, positions, maxVolume, labelSpots, rendered) {
  const from = positions.get(route.fromNodeId);
  const to = positions.get(route.toNodeId);
  // Skip the entire route decoration until both endpoints have valid layout
  // coordinates — never draw lines/markers/particles with missing positions.
  if (!from || !to
    || !Number.isFinite(from.x) || !Number.isFinite(from.y)
    || !Number.isFinite(to.x) || !Number.isFinite(to.y)) {
    return;
  }
  const selectedRouteId = economyLogisticsUiState.selection?.type === 'route' ? economyLogisticsUiState.selection.id : null;
  const selected = selectedRouteId === route.id;
  const unrelated = Boolean(selectedRouteId && !selected);
  const flowing = logisticsFlowMotionActive() && route.volume > 0;
  const status = route.status === 'unconfirmed' ? 'rumored' : (route.status || 'open');
  const movement = route.volume > 0 ? 'active' : 'idle';
  // Selected routes are never dimmed; filterMatch already treats selection as relevant.
  const filterUnrelated = !selected && route.filterMatch === false;
  const group = logisticsSvgElement('g', `logistics-route logistics-route-${status} is-${movement}${route.bottleneck ? ' is-bottleneck' : ''}${selected ? ' is-selected' : ''}${unrelated || filterUnrelated ? ' is-unrelated' : ' is-related'}${flowing ? ' is-flowing' : ''}`);
  if (flowing && typeof group.style.setProperty === 'function') {
    group.style.setProperty('--logistics-flow-duration', `${logisticsFlowDurationSeconds(route).toFixed(2)}s`);
  }
  group.dataset.routeId = route.id;
  const geometry = logisticsRouteGeometry(route, from, to);
  if (!geometry) { return; }
  const disrupted = status === 'blocked' || status === 'raided';
  const line = logisticsSvgElement('path', 'logistics-route-line');
  const pathId = `logistics-route-path-${logisticsDomId(route.id)}`;
  line.setAttribute('id', pathId);
  line.setAttribute('d', geometry.d);
  line.dataset.routePath = geometry.d;
  const flowWidth = 1.5 + Math.sqrt(Math.max(0, route.volume) / Math.max(1, maxVolume)) * 6;
  // Disrupted routes must stay readable even at zero volume.
  const width = disrupted ? Math.max(flowWidth, 2.5) : flowWidth;
  line.setAttribute('stroke-width', width.toFixed(2));
  line.setAttribute('marker-end', `url(#logistics-arrow-${status})`);
  line.style.opacity = route.volume > 0
    ? String(0.55 + Math.min(1, route.utilization) * 0.4)
    : (disrupted ? '0.8' : '0.4');
  group.appendChild(line);
  if (flowing && !economyLogisticsUiState.compactAnimation) {
    logisticsRenderFlowParticles(group, route, geometry, pathId);
  }

  // Crossing routes share the exact segment midpoint, which stacks their
  // labels into unreadable glyph soup. Slide along the line until this
  // label no longer collides with an already placed one.
  let labelT = 0.5;
  for (const t of [0.5, 0.36, 0.64, 0.26, 0.74, 0.16, 0.84]) {
    const point = geometry.pointAt(t);
    const cx = point.x;
    const cy = point.y;
    if (!labelSpots.some((spot) => Math.abs(spot.x - cx) < 42 && Math.abs(spot.y - cy) < 28)) {
      labelT = t;
      break;
    }
  }
  const labelPoint = geometry.pointAt(labelT);
  const labelX = Math.round(labelPoint.x);
  const labelY = Math.round(labelPoint.y);
  labelSpots.push({ x: labelX, y: labelY });

  const label = logisticsSvgElement('text', 'logistics-route-label');
  label.setAttribute('x', String(labelX));
  label.setAttribute('y', String(labelY - 7));
  label.textContent = `${logisticsNumber(route.volume)}/${logisticsNumber(route.effectiveCapacity)}`;
  label.setAttribute('aria-label', `${T('webview.world.logisticsVolumeCapacity')}: ${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)}`);
  appendLogisticsTitle(label, `${T('webview.world.logisticsVolumeCapacity')}: ${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)}`);
  group.appendChild(label);
  let warning = null;
  if (status === 'blocked' || status === 'raided' || status === 'rumored' || route.bottleneck) {
    warning = logisticsSvgElement('text', 'logistics-route-warning');
    warning.setAttribute('x', String(labelX));
    warning.setAttribute('y', String(labelY + 12));
    warning.textContent = route.bottleneck ? '◆' : status === 'blocked' ? '×' : status === 'rumored' ? '?' : '!';
    group.appendChild(warning);
  }
  const aria = `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}, ${logisticsCommodityName(payload, route.commodityId)}, ${logisticsStatusLabel(route.status)}`;
  group.setAttribute('aria-label', aria);
  appendLogisticsTitle(group, `${aria}; ${T('webview.world.logisticsVolume')} ${logisticsNumber(route.volume)}; ${T('webview.world.logisticsRisk')} ${logisticsRiskLabel(route.risk)}`);
  bindLogisticsActivation(group, { type: 'route', id: route.id });
  group._logisticsRoute = route;
  group._logisticsParts = { line, label, warning };
  if (rendered) { rendered.routeElements.set(route.id, group); }
  svg.appendChild(group);
}

function logisticsRefreshRouteElement(group, positions) {
  const route = group?._logisticsRoute;
  const parts = group?._logisticsParts;
  const geometry = route && logisticsRouteGeometry(route, positions.get(route.fromNodeId), positions.get(route.toNodeId));
  if (!geometry || !parts) { return; }
  parts.line.setAttribute('d', geometry.d);
  parts.line.dataset.routePath = geometry.d;
  const point = geometry.pointAt(0.5);
  if (parts.label) { parts.label.setAttribute('x', String(Math.round(point.x))); parts.label.setAttribute('y', String(Math.round(point.y - 7))); }
  if (parts.warning) { parts.warning.setAttribute('x', String(Math.round(point.x))); parts.warning.setAttribute('y', String(Math.round(point.y + 12))); }
}

/** Declarative SMIL particles (no rAF loop, no canonical state): 2 steady dots
 *  for open/strained flow, 1 sparse flickering dot for raided routes so a
 *  convoy under threat visibly reads as different from healthy flow.
 *
 *  Coordinates must be finite before any circle is created. The particle is
 *  rooted at local (0,0) and follows the rendered path via <mpath>; assigning
 *  both absolute cx/cy and an absolute motion path double-applies the source
 *  offset and visibly throws dots away from their routes. */
function logisticsRenderFlowParticles(group, route, geometry, pathId) {
  if (!geometry || !geometry.start || !geometry.end || !geometry.d) { return; }
  const duration = logisticsFlowDurationSeconds(route);
  if (!(duration > 0) || !Number.isFinite(duration)) { return; }
  const dotCount = route.status === 'raided' ? 1 : 2;
  const stagger = logisticsHashUnit(route.id) * duration;
  for (let i = 0; i < dotCount; i++) {
    const dot = logisticsSvgElement('circle', `logistics-flow-dot logistics-flow-dot-${route.status}`);
    dot.setAttribute('r', '2.6');
    dot.setAttribute('cx', '0');
    dot.setAttribute('cy', '0');
    // An engine without SMIL support must not leave a static dot at the SVG
    // origin. SMIL-capable engines reveal it as the motion begins.
    dot.setAttribute('visibility', 'hidden');
    const motion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    motion.setAttribute('dur', `${duration.toFixed(2)}s`);
    motion.setAttribute('repeatCount', 'indefinite');
    const motionPath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
    motionPath.setAttribute('href', `#${pathId}`);
    motion.appendChild(motionPath);
    const phase = (stagger + (i * duration) / dotCount) % duration;
    // Negative begin = animation already "running" at t=0 (mid-path), so the
    // particle never waits at the static cx/cy for a delayed positive begin.
    motion.setAttribute('begin', `-${phase.toFixed(2)}s`);
    dot.appendChild(motion);
    const reveal = document.createElementNS('http://www.w3.org/2000/svg', 'set');
    reveal.setAttribute('attributeName', 'visibility');
    reveal.setAttribute('to', 'visible');
    reveal.setAttribute('begin', '-0.01s');
    reveal.setAttribute('dur', 'indefinite');
    dot.appendChild(reveal);
    if (route.status === 'raided') {
      const flicker = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      flicker.setAttribute('attributeName', 'opacity');
      flicker.setAttribute('values', '1;0.2;1;0.7;1');
      flicker.setAttribute('dur', `${(duration * 0.7).toFixed(2)}s`);
      flicker.setAttribute('repeatCount', 'indefinite');
      // Match motion phase so flicker is also active from first paint.
      flicker.setAttribute('begin', `-${phase.toFixed(2)}s`);
      dot.appendChild(flicker);
    }
    group.appendChild(dot);
  }
}

function renderLogisticsNode(svg, payload, node, position, shortages, routes, rendered) {
  const selected = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const selectedRouteId = economyLogisticsUiState.selection?.type === 'route' ? economyLogisticsUiState.selection.id : null;
  const selectedRoute = selectedRouteId ? (routes || []).find((route) => route.id === selectedRouteId) : null;
  const selectedNode = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const currentNode = Boolean(typeof currentWorldLocationId === 'string' && node.locationId === currentWorldLocationId);
  const selectedEndpoint = Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id));
  const unrelated = !selectedNode && !currentNode && !selectedEndpoint && node.filterMatch === false;
  const role = logisticsNodeRole(node.kind);
  const scale = position.tier || logisticsNodeScale(node, routes);
  const nodeWidth = Number.isFinite(position.w) ? position.w : 152;
  const nodeHeight = Number.isFinite(position.h) ? position.h : 60;
  const horizontalScale = nodeWidth / 152;
  const verticalScale = nodeHeight / 60;
  const padding = Math.max(8, Math.round(nodeWidth * 0.08));
  const kindY = Math.max(14, Math.round(nodeHeight * 0.29));
  const labelY = Math.min(nodeHeight - 10, Math.max(kindY + 16, Math.round(nodeHeight * 0.68)));
  const badgeX = nodeWidth - padding - 5;
  const holdingSelection = Boolean(node.aggregate && ((economyLogisticsUiState.selection?.type === 'node' && (payload.nodes || []).find((item) => item.id === economyLogisticsUiState.selection.id)?.regionId === node.regionId)
    || (economyLogisticsUiState.selection?.type === 'route' && (payload.routes || []).find((item) => item.id === economyLogisticsUiState.selection.id) && [payload.routes.find((item) => item.id === economyLogisticsUiState.selection.id).fromNodeId, payload.routes.find((item) => item.id === economyLogisticsUiState.selection.id).toNodeId].some((id) => (payload.nodes || []).find((item) => item.id === id)?.regionId === node.regionId))));
  const group = logisticsSvgElement('g', `logistics-node logistics-node-${role} logistics-node-scale-${scale}${node.aggregate ? ' logistics-node-aggregate' : ''}${selected ? ' is-selected' : ''}${holdingSelection ? ' is-holding-selection' : ''}${unrelated ? ' is-unrelated' : ' is-related'}`);
  group.dataset.nodeId = node.id;
  group.setAttribute('transform', logisticsNodeTransform(position));
  group.setAttribute('aria-label', node.aggregate ? `${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}` : `${node.label}, ${logisticsNodeKindLabel(node.kind)}`);
  const shape = logisticsSvgElement('path', 'logistics-node-shape');
  shape.setAttribute('d', logisticsNodeShapePath(role));
  shape.setAttribute('transform', `scale(${horizontalScale} ${verticalScale})`);
  group.appendChild(shape);
  if (node.aggregate) {
    // Stacked outline must share the aggregate/region silhouette (not envoy).
    const outline = logisticsSvgElement('path', 'logistics-node-aggregate-outline');
    outline.setAttribute('d', logisticsNodeShapePath(role));
    outline.setAttribute('transform', `translate(4 4) scale(${horizontalScale} ${verticalScale})`);
    group.appendChild(outline);
  }
  const accent = logisticsSvgElement('path', 'logistics-node-accent');
  accent.setAttribute('d', 'M 12 5 H 140');
  accent.setAttribute('transform', `scale(${horizontalScale} ${verticalScale})`);
  group.appendChild(accent);
  const kind = logisticsSvgElement('text', 'logistics-node-kind');
  kind.setAttribute('x', String(padding));
  kind.setAttribute('y', String(kindY));
  kind.textContent = logisticsNodeKindLabel(node.kind);
  group.appendChild(kind);
  const label = logisticsSvgElement('text', 'logistics-node-label');
  label.setAttribute('x', String(padding));
  label.setAttribute('y', String(labelY));
  label.textContent = logisticsTruncateLabel(node.label);
  group.appendChild(label);
  const symbol = logisticsSvgElement('text', 'logistics-node-symbol');
  symbol.setAttribute('x', String(nodeWidth - padding - 12));
  symbol.setAttribute('y', String(labelY + 4));
  symbol.textContent = logisticsNodeSymbol(role);
  group.appendChild(symbol);
  if (node.aggregate) {
    const badge = logisticsSvgElement('text', 'logistics-aggregate-badge');
    badge.setAttribute('x', String(badgeX));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = String(node.memberCount || 0);
    group.appendChild(badge);
  }
  const nodeShortages = shortages.filter((item) => item.nodeId === node.id);
  if (nodeShortages.length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-shortage-badge');
    badge.setAttribute('x', String(badgeX));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = '!';
    group.appendChild(badge);
  } else if ((node.processingSiteIds || []).length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-processing-badge');
    badge.setAttribute('x', String(badgeX - 3));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = '⚙';
    group.appendChild(badge);
  }
  appendLogisticsTitle(group, `${node.label}; ${logisticsNodeKindLabel(node.kind)}; ${T(`webview.world.logisticsScale${scale.replace(/^./, (c) => c.toUpperCase())}`)}${nodeShortages.length ? `; ${T('webview.world.logisticsShortage')}` : ''}`);
  if (node.aggregate) {
    const expand = () => {
      economyLogisticsUiState.collapsedRegionIds.delete(node.regionId);
      logisticsSavePrefs();
      renderEconomyLogisticsPanel();
    };
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${T('webview.world.logisticsExpandRegion')} ${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}`);
    appendLogisticsTitle(group, `${T('webview.world.logisticsExpandRegion')} ${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}`);
    group.addEventListener('click', (event) => { if (event?.stopPropagation) { event.stopPropagation(); } expand(); });
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(); } });
  } else {
    bindLogisticsActivation(group, { type: 'node', id: node.id });
  }
  group._logisticsPosition = position;
  if (rendered) { rendered.nodeElements.set(node.id, group); }
  svg.appendChild(group);
}

function renderLogisticsLegend(parent) {
  const legend = logisticsElement('div', 'logistics-legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', T('webview.world.logisticsLegend'));
  const title = logisticsElement('strong', 'logistics-legend-title', T('webview.world.logisticsLegend'));
  legend.appendChild(title);
  const statusList = logisticsElement('div', 'logistics-legend-list logistics-legend-status-list');
  statusList.setAttribute('role', 'list');
  const statuses = [
    ['active', '→', 'webview.world.logisticsLegendActive'],
    ['idle', '··', 'webview.world.logisticsLegendIdle'],
    ['blocked', '×', 'webview.world.logisticsStatusBlocked'],
    ['rumored', '?', 'webview.world.logisticsStatusRumored'],
    ['selected', '◎', 'webview.world.logisticsLegendSelected'],
  ];
  for (const [status, glyph, key] of statuses) {
    const item = logisticsElement('span', `logistics-legend-item logistics-legend-${status}`);
    item.setAttribute('role', 'listitem');
    item.appendChild(logisticsElement('span', 'logistics-legend-swatch', glyph));
    item.appendChild(logisticsElement('span', 'logistics-legend-label', T(key)));
    statusList.appendChild(item);
  }
  legend.appendChild(statusList);
  const nodeList = logisticsElement('div', 'logistics-legend-list logistics-legend-node-list');
  nodeList.setAttribute('role', 'list');
  for (const role of ['settlement', 'market', 'facility', 'vehicle', 'caravan', 'envoy', 'mobile_base']) {
    const cssRole = role.replace('_', '-');
    const item = logisticsElement('span', `logistics-legend-item logistics-legend-node logistics-legend-node-${cssRole}`);
    item.setAttribute('role', 'listitem');
    item.appendChild(logisticsElement('span', 'logistics-legend-node-symbol', logisticsNodeSymbol(cssRole)));
    item.appendChild(logisticsElement('span', 'logistics-legend-label', logisticsNodeKindLabel(role)));
    nodeList.appendChild(item);
  }
  legend.appendChild(nodeList);
  parent.appendChild(legend);
}

/** Camera updates touch only the group transform, the constant-screen-size
 * CSS var, and toolbar disabled state — never the graph DOM (L15 fix).
 * Non-finite cameras fall back to identity scale at origin rather than writing
 * translate(Infinity) into the SVG. */
function applyLogisticsCameraTransform(svg, cameraGroup, camera, toolbarEls) {
  const safe = logisticsIsValidCamera(camera)
    ? camera
    : { k: 1, tx: 0, ty: 0, userModified: false };
  cameraGroup.setAttribute('transform', `translate(${safe.tx} ${safe.ty}) scale(${safe.k})`);
  if (svg.style && typeof svg.style.setProperty === 'function') {
    svg.style.setProperty('--logistics-camera-k', String(safe.k));
  }
  if (toolbarEls) {
    toolbarEls.zoomInBtn.disabled = safe.k >= LOGISTICS_ZOOM_MAX - 1e-6;
    toolbarEls.zoomOutBtn.disabled = safe.k <= LOGISTICS_ZOOM_MIN + 1e-6;
  }
}

/** Discrete camera commands (buttons, 0, Shift+0) may ease briefly; wheel and
 * direct drag never do (always 1:1 with input). Reduced motion applies the
 * command immediately, with no transition class added. */
function logisticsEaseCameraCommand(cameraGroup, run) {
  const reduced = logisticsPrefersReducedMotion();
  if (!reduced && cameraGroup.classList && typeof cameraGroup.classList.add === 'function') {
    cameraGroup.classList.add('is-easing');
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (cameraGroup.classList) { cameraGroup.classList.remove('is-easing'); }
      }, LOGISTICS_CAMERA_EASE_MS);
    }
  }
  run();
}

function renderLogisticsCameraToolbar(viewport, onCommand) {
  const toolbar = logisticsElement('div', 'logistics-camera-toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', T('webview.world.logisticsCameraToolbar'));

  function makeButton(className, labelKey, command) {
    const btn = logisticsElement('button', `logistics-camera-btn ${className}`, T(labelKey));
    btn.type = 'button';
    btn.title = T(labelKey);
    btn.addEventListener('click', () => onCommand(command));
    toolbar.appendChild(btn);
    return btn;
  }

  const zoomOutBtn = makeButton('logistics-camera-zoom-out', 'webview.world.logisticsZoomOut', 'zoomOut');
  const zoomInBtn = makeButton('logistics-camera-zoom-in', 'webview.world.logisticsZoomIn', 'zoomIn');
  const fitBtn = makeButton('logistics-camera-fit', 'webview.world.logisticsFitAll', 'fitAll');
  const resetBtn = makeButton('logistics-camera-reset', 'webview.world.logisticsResetCamera', 'reset');
  const resetLayoutBtn = makeButton('logistics-layout-reset', 'webview.world.logisticsResetLayout', 'resetLayout');

  viewport.appendChild(toolbar);
  return { toolbar, zoomOutBtn, zoomInBtn, fitBtn, resetBtn, resetLayoutBtn };
}

function logisticsFindNodeTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList && el.classList.contains('logistics-node')) { return el; }
    el = el.parentNode;
  }
  return null;
}

/** Node or route under the pointer (selection targets; normal left-pan skips). */
function logisticsIsGraphContentTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList && (el.classList.contains('logistics-node') || el.classList.contains('logistics-route'))) {
      return true;
    }
    el = el.parentNode;
  }
  return false;
}

/** Toolbar, expand button, form controls, links — never start a left-button pan. */
function logisticsIsControlTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList) {
      if (
        el.classList.contains('logistics-camera-toolbar')
        || el.classList.contains('logistics-camera-btn')
        || el.classList.contains('logistics-expand-btn')
        || el.classList.contains('logistics-region-collapse')
        || el.classList.contains('logistics-region-collapse-hit')
      ) {
        return true;
      }
    }
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (
      tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA'
      || tag === 'A' || tag === 'OPTION' || tag === 'LABEL'
    ) {
      return true;
    }
    if (el.isContentEditable) { return true; }
    if (typeof el.getAttribute === 'function' && el.getAttribute('contenteditable') === 'true') {
      return true;
    }
    el = el.parentNode;
  }
  return false;
}

/** Normal primary-button pan may begin only on SVG background / layer chrome. */
function logisticsIsBackgroundPanTarget(target, boundary) {
  if (!target || logisticsIsControlTarget(target, boundary) || logisticsIsGraphContentTarget(target, boundary)) {
    return false;
  }
  let el = target;
  while (el && el !== boundary) {
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'SVG' || tag === 'svg') { return true; }
    if (el.classList) {
      if (
        el.classList.contains('logistics-network')
        || el.classList.contains('logistics-camera')
        || el.classList.contains('layer-regions')
        || el.classList.contains('layer-edges')
        || el.classList.contains('layer-edges-raised')
        || el.classList.contains('layer-nodes')
        || el.classList.contains('layer-labels')
      ) {
        return true;
      }
    }
    el = el.parentNode;
  }
  // Direct hit on the viewport chrome (empty padding around the SVG) is also background.
  return target === boundary;
}

function logisticsIsFocusedButtonLike(doc) {
  const active = doc && doc.activeElement;
  if (!active) { return false; }
  const tag = active.tagName ? String(active.tagName).toUpperCase() : '';
  return tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA';
}

/** Wires wheel/drag/keyboard camera interactions on an already-mounted
 * viewport. Mutates the active host's camera context and repaints only via
 * applyLogisticsCameraTransform — never renderEconomyLogisticsPanel. */
/** Keep a dragged node from sitting inside another region's packed container.
 * Own region may still expand on the next layout pass; cross-region intrusion
 * is rejected by clamping the centre to the nearest exterior edge. */
function logisticsClampManualAwayFromOtherRegions(position, layout) {
  if (!position || !layout || !layout.regions || !position.regionId) { return; }
  const halfW = (Number.isFinite(position.w) ? position.w : 152) / 2;
  const halfH = (Number.isFinite(position.h) ? position.h : 60) / 2;
  for (const [regionId, region] of layout.regions) {
    if (regionId === position.regionId || !region) { continue; }
    const left = region.x;
    const right = region.x + region.w;
    const top = region.y;
    const bottom = region.y + region.h;
    // Node box intersects another region container.
    if (position.x + halfW <= left || position.x - halfW >= right
      || position.y + halfH <= top || position.y - halfH >= bottom) {
      continue;
    }
    const distLeft = Math.abs((position.x + halfW) - left);
    const distRight = Math.abs((position.x - halfW) - right);
    const distTop = Math.abs((position.y + halfH) - top);
    const distBottom = Math.abs((position.y - halfH) - bottom);
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    if (min === distLeft) { position.x = left - halfW - 1; }
    else if (min === distRight) { position.x = right + halfW + 1; }
    else if (min === distTop) { position.y = top - halfH - 1; }
    else { position.y = bottom + halfH + 1; }
  }
}

function logisticsSetupCameraInteractions(ctx) {
  const { viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox, rendered, layout } = ctx;
  const state = economyLogisticsUiState;
  const hostCtx = logisticsActiveCameraContext();
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : null;

  function setCamera(next, immediateSave) {
    if (!logisticsIsValidCamera(next)) {
      // Retain last valid camera when an operation cannot produce a transform.
      if (logisticsIsValidCamera(hostCtx.camera)) { return; }
      next = logisticsDefaultCamera(vp);
    }
    hostCtx.camera = next;
    applyLogisticsCameraTransform(svg, cameraGroup, next, toolbarEls);
    logisticsQueueCameraSave(Boolean(immediateSave));
  }

  function resetCamera() {
    logisticsStorageRemove(logisticsStorageKey('camera', state.scopeKey));
    logisticsCancelCameraSaves(state.scopeKey);
    hostCtx.identity = logisticsDatasetIdentity(state.payload);
    hostCtx.camera = logisticsFitAllCamera(currentBBox(), vp);
    applyLogisticsCameraTransform(svg, cameraGroup, hostCtx.camera, toolbarEls);
  }

  function screenPointFromEvent(event) {
    const rect = typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect() : { left: 0, top: 0 };
    const x = Number(event && event.clientX);
    const y = Number(event && event.clientY);
    return {
      x: (Number.isFinite(x) ? x : 0) - (rect.left || 0),
      y: (Number.isFinite(y) ? y : 0) - (rect.top || 0),
    };
  }

  viewport.addEventListener('wheel', (event) => {
    if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    const point = screenPointFromEvent(event);
    setCamera(logisticsZoomFromWheel(hostCtx.camera, point, logisticsWheelDeltaY(event)));
  }, { passive: false });

  // Initiating pointer ID is the drag invariant. Cleanup is idempotent.
  let drag = null;
  let suppressClick = false;
  let cleaningUp = false;

  function releaseStoredCapture() {
    if (!drag || drag.pointerId === undefined || drag.pointerId === null) { return; }
    if (typeof viewport.releasePointerCapture === 'function') {
      try { viewport.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    }
  }

  function cleanupDrag(options = {}) {
    if (!drag || cleaningUp) { return; }
    cleaningUp = true;
    const active = drag;
    if (options.restoreCamera && active.startCamera) {
      setCamera(active.startCamera);
    }
    if (active.type === 'node') {
      const position = rendered.positions.get(active.nodeId);
      if (options.restoreNode && position) {
        position.x = active.startNode.x;
        position.y = active.startNode.y;
        const nodeEl = rendered.nodeElements.get(active.nodeId);
        if (nodeEl) { nodeEl.setAttribute('transform', logisticsNodeTransform(position)); }
        for (const routeEl of rendered.routeElements.values()) {
          const route = routeEl._logisticsRoute;
          if (route.fromNodeId === active.nodeId || route.toNodeId === active.nodeId) { logisticsRefreshRouteElement(routeEl, rendered.positions); }
        }
      } else if (active.moved && options.commitNode) {
        logisticsClampManualAwayFromOtherRegions(position, layout);
        position.x = Math.round(position.x); position.y = Math.round(position.y);
        // Fixed world coordinates (space: 'world'). Layout applies them as
        // fixed obstacles and resolves automatics only within the same region,
        // so a drop in region A cannot move region B members or re-origin them.
        // Optional space:'local' entries (tests/migrations) are applied as
        // pack-offset + local inside computeLogisticsLayout.
        const stored = {
          x: position.x,
          y: position.y,
          regionId: position.regionId,
          ts: Date.now(),
          space: 'world',
        };
        const nodeEl = rendered.nodeElements.get(active.nodeId);
        if (nodeEl) { nodeEl.setAttribute('transform', logisticsNodeTransform(position)); }
        for (const routeEl of rendered.routeElements.values()) {
          const route = routeEl._logisticsRoute;
          if (route.fromNodeId === active.nodeId || route.toNodeId === active.nodeId) { logisticsRefreshRouteElement(routeEl, rendered.positions); }
        }
        economyLogisticsUiState.manualPositions[active.nodeId] = stored;
        logisticsSaveLayoutPositions();
      }
    }
    if (active.moved && options.commitNode) {
      suppressClick = active.type === 'node' ? { nodeId: active.nodeId } : { nodeId: null };
      if (typeof setTimeout === 'function') { setTimeout(() => { suppressClick = false; }, 0); }
    }
    releaseStoredCapture();
    if (viewport.classList) { viewport.classList.remove('is-panning', 'is-node-dragging'); }
    if (active.type === 'camera' && active.moved) { logisticsQueueCameraSave(true); }
    drag = null;
    cleaningUp = false;
  }

  viewport.addEventListener('pointerdown', (event) => {
    // A second pointer cannot hijack an active drag.
    if (drag) { return; }
    const button = Number(event.button);
    const isMiddle = button === 1;
    const isPrimary = button === 0;
    if (!isMiddle && !isPrimary) { return; }

    // Middle-button pan must not activate controls / scroll gestures.
    if (isMiddle && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const onControl = logisticsIsControlTarget(event.target, viewport);
    const onContent = logisticsIsGraphContentTarget(event.target, viewport);
    const isSpace = state.spaceHeld;

    const nodeTarget = isPrimary && !isSpace ? logisticsFindNodeTarget(event.target, viewport) : null;
    const nodeId = nodeTarget?.dataset?.nodeId;
    const nodePosition = nodeId ? rendered.positions.get(nodeId) : null;
    if (nodeTarget && nodePosition && !nodePosition.aggregate) {
      const startX = Number(event.clientX);
      const startY = Number(event.clientY);
      drag = {
        type: 'node', nodeId, pointerId: event.pointerId,
        startX: Number.isFinite(startX) ? startX : 0, startY: Number.isFinite(startY) ? startY : 0,
        startCamera: hostCtx.camera, startNode: { x: nodePosition.x, y: nodePosition.y }, moved: false,
      };
      if (typeof viewport.setPointerCapture === 'function' && event.pointerId !== undefined) {
        try { viewport.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
      }
      if (viewport.classList) { viewport.classList.add('is-node-dragging'); }
      return;
    }

    if (isPrimary && !isSpace) {
      // Normal left-button: background only (SVG / permitted layers).
      if (onControl || onContent || !logisticsIsBackgroundPanTarget(event.target, viewport)) {
        return;
      }
    } else if (isPrimary && isSpace) {
      // Space+primary may pan over nodes/routes but never from controls.
      if (onControl) { return; }
    } else if (isMiddle) {
      // Middle may pan over nodes/routes; still skip pure control chrome so
      // toolbar buttons are not entangled with a pan gesture.
      if (onControl) { return; }
    }

    const startX = Number(event.clientX);
    const startY = Number(event.clientY);
    drag = {
      type: 'camera',
      pointerId: event.pointerId,
      startX: Number.isFinite(startX) ? startX : 0,
      startY: Number.isFinite(startY) ? startY : 0,
      startCamera: hostCtx.camera,
      moved: false,
    };
    if (typeof viewport.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try { viewport.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
    }
    if (viewport.classList) { viewport.classList.add('is-panning'); }
  });

  function endDrag(event) {
    if (!drag) { return; }
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    cleanupDrag({ commitNode: true });
  }

  viewport.addEventListener('pointermove', (event) => {
    if (!drag) { return; }
    if (event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    const cx = Number(event.clientX);
    const cy = Number(event.clientY);
    const dx = (Number.isFinite(cx) ? cx : 0) - drag.startX;
    const dy = (Number.isFinite(cy) ? cy : 0) - drag.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) { return; }
    if (!drag.moved && Math.hypot(dx, dy) < LOGISTICS_DRAG_THRESHOLD_PX) { return; }
    drag.moved = true;
    if (drag.type === 'node') {
      const position = rendered.positions.get(drag.nodeId);
      if (!position || !logisticsIsValidCamera(drag.startCamera)) { return; }
      position.x = drag.startNode.x + dx / drag.startCamera.k;
      position.y = drag.startNode.y + dy / drag.startCamera.k;
      logisticsClampManualAwayFromOtherRegions(position, layout);
      const nodeEl = rendered.nodeElements.get(drag.nodeId);
      if (nodeEl) { nodeEl.setAttribute('transform', logisticsNodeTransform(position)); }
      for (const routeEl of rendered.routeElements.values()) {
        const route = routeEl._logisticsRoute;
        if (route.fromNodeId === drag.nodeId || route.toNodeId === drag.nodeId) { logisticsRefreshRouteElement(routeEl, rendered.positions); }
      }
      return;
    }
    const base = drag.startCamera;
    if (!logisticsIsValidCamera(base)) { return; }
    const next = { k: base.k, tx: base.tx + dx, ty: base.ty + dy, userModified: true };
    setCamera(next);
  });
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) { return; }
    cleanupDrag({ restoreNode: drag.type === 'node' });
  });
  viewport.addEventListener('lostpointercapture', (event) => {
    if (!drag) { return; }
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    cleanupDrag({ restoreNode: drag.type === 'node' });
  });

  // Suppress the synthesized click that follows a real pan (threshold crossed).
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) { return; }
    if (logisticsIsControlTarget(event.target, viewport)) { return; }
    const nodeTarget = logisticsFindNodeTarget(event.target, viewport);
    if (suppressClick.nodeId && nodeTarget?.dataset?.nodeId !== suppressClick.nodeId) { return; }
    suppressClick = false;
    if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
  }, true);

  function currentBBox() { return bbox; }

  function onWindowBlur() {
    cleanupDrag({ restoreNode: drag?.type === 'node' });
    state.spaceHeld = false;
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('blur', onWindowBlur);
  }

  viewport.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat) {
      // Space on a focused toolbar/control button must keep native activation.
      // Only when the viewport itself owns focus (or a non-control descendant)
      // does Space become a pan modifier and prevent page scroll.
      if (logisticsIsFocusedButtonLike(doc) && logisticsIsControlTarget(doc.activeElement, viewport)) {
        return;
      }
      state.spaceHeld = true;
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    }
    if (event.key === 'Escape' && drag) {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      cleanupDrag({ restoreCamera: drag.type === 'camera', restoreNode: drag.type === 'node' });
      return;
    }
    const arrow = {
      ArrowUp: { dx: 0, dy: 1 }, ArrowDown: { dx: 0, dy: -1 },
      ArrowLeft: { dx: 1, dy: 0 }, ArrowRight: { dx: -1, dy: 0 },
    }[event.key];
    if (arrow) {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      const step = event.shiftKey ? LOGISTICS_PAN_STEP_FAST : LOGISTICS_PAN_STEP;
      setCamera(logisticsPanBy(hostCtx.camera, arrow.dx * step, arrow.dy * step));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      logisticsEaseCameraCommand(cameraGroup, () => setCamera(logisticsZoomByStep(hostCtx.camera, vp, 1)));
      return;
    }
    if (event.key === '-') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      logisticsEaseCameraCommand(cameraGroup, () => setCamera(logisticsZoomByStep(hostCtx.camera, vp, -1)));
      return;
    }
    // Shift+0 often reports key ')' on US layouts; check the physical key
    // (code) so Reset Camera is reachable regardless of layout. Fit All and
    // Reset Camera resolve identically in this slice — there is no persisted
    // camera or manual node layout yet to distinguish them from.
    if (event.code === 'Digit0' || event.key === '0' || event.key === ')') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      const identity = logisticsDatasetIdentity(state.payload);
      logisticsEaseCameraCommand(cameraGroup, () => {
        if (event.shiftKey) { resetCamera(); return; }
        const next = logisticsFitAllCamera(currentBBox(), vp);
        hostCtx.identity = identity;
        setCamera(next, true);
      });
    }
  });
  viewport.addEventListener('keyup', (event) => {
    if (event.code === 'Space') { state.spaceHeld = false; }
  });
  viewport.addEventListener('blur', () => { state.spaceHeld = false; });
  viewport.addEventListener('focusout', () => { state.spaceHeld = false; });

  return {
    onToolbarCommand(command) {
      const identity = logisticsDatasetIdentity(state.payload);
      logisticsEaseCameraCommand(cameraGroup, () => {
        if (command === 'zoomIn') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, 1), true); return; }
        if (command === 'zoomOut') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, -1), true); return; }
        if (command === 'resetLayout') {
          const accepted = typeof window !== 'undefined' && typeof window.confirm === 'function'
            ? window.confirm(T('webview.world.logisticsResetLayoutConfirm')) : false;
          if (!accepted) { return; }
          logisticsStorageRemove(logisticsStorageKey('layout', state.scopeKey));
          state.manualPositions = {};
          hostCtx.camera = null;
          renderEconomyLogisticsPanel();
          return;
        }
        if (command === 'reset') { resetCamera(); return; }
        hostCtx.identity = identity;
        setCamera(logisticsFitAllCamera(currentBBox(), vp), true);
      });
    },
  };
}

function renderLogisticsRegionContainers(layer, payload, layout) {
  const protectedRegionIds = logisticsCurrentLocationRegionIds(payload);
  for (const [regionId, region] of [...layout.regions.entries()].sort((a, b) => logisticsLayoutCompareId(a[0], b[0]))) {
    const group = logisticsSvgElement('g', `logistics-region${economyLogisticsUiState.collapsedRegionIds.has(regionId) ? ' is-collapsed' : ''}`);
    group.dataset.regionId = regionId;
    const rect = logisticsSvgElement('rect', 'logistics-region-box');
    rect.setAttribute('x', String(region.x)); rect.setAttribute('y', String(region.y));
    rect.setAttribute('width', String(region.w)); rect.setAttribute('height', String(region.h)); rect.setAttribute('rx', '14');
    group.appendChild(rect);
    const control = logisticsSvgElement('g', 'logistics-region-collapse');
    const protectedRegion = protectedRegionIds.has(regionId);
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.setAttribute('aria-expanded', economyLogisticsUiState.collapsedRegionIds.has(regionId) ? 'false' : 'true');
    control.setAttribute('aria-label', protectedRegion ? T('webview.world.logisticsCannotCollapseCurrentRegion') : T(economyLogisticsUiState.collapsedRegionIds.has(regionId) ? 'webview.world.logisticsExpandRegion' : 'webview.world.logisticsCollapseRegion'));
    if (protectedRegion) { control.setAttribute('aria-disabled', 'true'); appendLogisticsTitle(control, T('webview.world.logisticsCannotCollapseCurrentRegion')); }
    const hit = logisticsSvgElement('rect', 'logistics-region-collapse-hit');
    hit.setAttribute('x', String(region.x + 4)); hit.setAttribute('y', String(region.y + 2));
    hit.setAttribute('width', String(Math.max(120, Math.min(region.w - 8, 260)))); hit.setAttribute('height', '28');
    hit.setAttribute('rx', '5');
    control.appendChild(hit);
    const label = logisticsSvgElement('text', 'logistics-region-label');
    label.setAttribute('x', String(region.x + 12)); label.setAttribute('y', String(region.y + 20));
    label.textContent = `${economyLogisticsUiState.collapsedRegionIds.has(regionId) ? '▸' : '▾'} ${region.label} (${region.memberIds.length})`;
    control.appendChild(label);
    const toggle = () => {
      if (protectedRegion) { return; }
      if (economyLogisticsUiState.collapsedRegionIds.has(regionId)) { economyLogisticsUiState.collapsedRegionIds.delete(regionId); }
      else { economyLogisticsUiState.collapsedRegionIds.add(regionId); }
      logisticsSavePrefs();
      renderEconomyLogisticsPanel();
    };
    control.addEventListener('click', (event) => { if (event?.stopPropagation) { event.stopPropagation(); } toggle(); });
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    group.appendChild(control);
    layer.appendChild(group);
  }
}

function renderLogisticsNetwork(payload, parent) {
  logisticsEnsureScope(payload);
  const data = visibleLogisticsData(payload);
  renderLogisticsLegend(parent);
  // Best-effort synchronous read of the (already laid out) render target so
  // the very first paint already picks the right mode instead of always
  // starting compact and correcting itself once ResizeObserver's async
  // initial callback lands a frame later (visible as a brief flash when the
  // host — sidebar column or lightbox — is actually wide, e.g. right after
  // opening the "view large" lightbox).
  let hostWidth = 0;
  if (typeof parent.clientWidth === 'number' && parent.clientWidth > 0) {
    hostWidth = parent.clientWidth;
  } else if (typeof parent.getBoundingClientRect === 'function') {
    hostWidth = parent.getBoundingClientRect().width || 0;
  }
  if (hostWidth > 0) {
    economyLogisticsUiState.compactAnimation = hostWidth < LOGISTICS_COMPACT_WIDTH_PX;
  }
  const viewportSize = {
    width: hostWidth > 0 ? hostWidth : LOGISTICS_VIEWPORT_WIDTH_FALLBACK,
    height: economyLogisticsUiState.lightboxHost ? LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX : LOGISTICS_VIEWPORT_HEIGHT,
  };
  const viewport = logisticsElement('div', 'logistics-network-viewport');
  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', T('webview.world.logisticsAria'));
  if (!economyLogisticsUiState.lightboxHost) {
    const expandBtn = logisticsElement('button', 'logistics-expand-btn', '⤢');
    expandBtn.type = 'button';
    expandBtn.title = T('webview.world.logisticsExpand');
    expandBtn.setAttribute('aria-label', T('webview.world.logisticsExpand'));
    expandBtn.addEventListener('click', () => logisticsOpenLightbox(expandBtn));
    viewport.appendChild(expandBtn);
  }
  if (data.routes.length === 0) {
    const empty = logisticsElement('p', 'empty-text logistics-filter-empty', T('webview.world.logisticsFilterEmpty'));
    viewport.appendChild(empty);
  }
  // Always feed the complete payload into the pure layout; filters only dim.
  const layout = buildLogisticsLayout(payload.nodes || [], payload.routes || [], {
    manualPositions: economyLogisticsUiState.manualPositions,
    collapsedRegionIds: economyLogisticsUiState.collapsedRegionIds,
  });
  // A manual coordinate belongs to the region it was dragged in. Once the
  // payload says otherwise, delete it from this scope so it cannot resurrect
  // when the node later returns to the old region.
  logisticsPruneWrongRegionManualPositions(layout);
  economyLogisticsUiState.layout = layout;
  const rendered = { positions: new Map(), nodeElements: new Map(), routeElements: new Map() };
  const graph = logisticsBuildRenderedGraph(payload, layout, data.commodityId);
  rendered.positions = graph.positions;
  economyLogisticsUiState.rendered = rendered;
  const motionActive = logisticsFlowMotionActive();
  const svgClass = `logistics-network${motionActive ? ' is-animated' : ''}${economyLogisticsUiState.compactAnimation ? ' is-compact' : ''}`;
  const svg = logisticsSvgElement('svg', svgClass);
  svg.setAttribute('viewBox', `0 0 ${viewportSize.width} ${viewportSize.height}`);
  svg.setAttribute('aria-hidden', 'true');
  const defs = logisticsSvgElement('defs');
  ['open', 'strained', 'blocked', 'raided', 'rumored'].forEach((status) => {
    const marker = logisticsSvgElement('marker', `logistics-arrow logistics-arrow-${status}`);
    marker.id = `logistics-arrow-${status}`;
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    // Fixed-size arrowheads: the default strokeWidth marker units make
    // high-volume routes grow node-sized triangles.
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('markerWidth', '13');
    marker.setAttribute('markerHeight', '13');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = logisticsSvgElement('path', 'logistics-arrow-path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.appendChild(arrow);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  const cameraGroup = logisticsSvgElement('g', 'logistics-camera');
  const layerRegions = logisticsSvgElement('g', 'layer-regions');
  const layerEdges = logisticsSvgElement('g', 'layer-edges');
  const layerEdgesRaised = logisticsSvgElement('g', 'layer-edges-raised');
  const layerNodes = logisticsSvgElement('g', 'layer-nodes');
  const layerLabels = logisticsSvgElement('g', 'layer-labels');
  [layerRegions, layerEdges, layerEdgesRaised, layerNodes, layerLabels].forEach((layer) => cameraGroup.appendChild(layer));
  svg.appendChild(cameraGroup);

  renderLogisticsRegionContainers(layerRegions, payload, layout);
  const maxVolume = Math.max(1, ...graph.routes.map((route) => route.volume || 0));
  const labelSpots = [];
  graph.routes.forEach((route) => renderLogisticsRoute(layerEdges, payload, route, graph.positions, maxVolume, labelSpots, rendered));
  graph.nodes.forEach((node) => {
    const position = graph.positions.get(node.id);
    if (position) { renderLogisticsNode(layerNodes, payload, node, position, data.shortages, graph.routes, rendered); }
  });
  viewport.appendChild(svg);

  const bbox = layout.bounds;
  const camera = logisticsResolveCameraForRender(payload, bbox, viewportSize);
  const toolbarEls = renderLogisticsCameraToolbar(viewport, (command) => interactions.onToolbarCommand(command));
  applyLogisticsCameraTransform(svg, cameraGroup, camera, toolbarEls);
  const interactions = logisticsSetupCameraInteractions({ viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox, rendered, layout });

  parent.appendChild(viewport);
  logisticsObserveNetworkWidth(viewport);
}

function appendLogisticsDetailRow(parent, label, value) {
  const row = logisticsElement('div', 'logistics-detail-row');
  row.appendChild(logisticsElement('span', 'logistics-detail-label', label));
  row.appendChild(logisticsElement('span', 'logistics-detail-value', value));
  parent.appendChild(row);
}

function renderLogisticsDetails(payload, parent) {
  const details = logisticsElement('div', 'logistics-details');
  details.setAttribute('aria-live', 'polite');
  const headingRow = logisticsElement('div', 'logistics-details-heading');
  headingRow.appendChild(logisticsElement('strong', '', T('webview.world.logisticsDetails')));
  const clear = logisticsElement('button', 'logistics-clear-btn', T('webview.world.logisticsClearSelection'));
  clear.type = 'button';
  clear.disabled = !economyLogisticsUiState.selection;
  clear.addEventListener('click', () => {
    economyLogisticsUiState.selection = null;
    renderEconomyLogisticsPanel();
  });
  headingRow.appendChild(clear);
  details.appendChild(headingRow);

  const selection = economyLogisticsUiState.selection;
  if (!selection) {
    details.appendChild(logisticsElement('p', 'img-gen-hint', T('webview.world.logisticsSelectHint')));
  } else if (selection.type === 'route') {
    const route = (payload.routes || []).find((item) => item.id === selection.id);
    if (route) {
      appendLogisticsDetailRow(details, T('webview.world.logisticsRoute'), route.id);
      appendLogisticsDetailRow(details, T('webview.world.logisticsCommodity'), logisticsCommodityName(payload, route.commodityId));
      appendLogisticsDetailRow(details, T('webview.world.logisticsDirection'), `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}`);
      appendLogisticsDetailRow(details, T('webview.world.logisticsStatus'), logisticsStatusLabel(route.status));
      appendLogisticsDetailRow(details, T('webview.world.logisticsVolumeCapacity'), `${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)} (${T('webview.world.logisticsBase')} ${logisticsNumber(route.baseCapacity)})`);
      appendLogisticsDetailRow(details, T('webview.world.logisticsUtilization'), logisticsPercent(route.utilization));
      appendLogisticsDetailRow(details, T('webview.world.logisticsRisk'), `${logisticsRiskLabel(route.risk)} · ${logisticsPercent(route.risk)}`);
      if (route.bottleneck) { appendLogisticsDetailRow(details, T('webview.world.logisticsBottleneck'), T('webview.world.logisticsBottleneckHint')); }
    }
  } else {
    const node = (payload.nodes || []).find((item) => item.id === selection.id);
    if (node) {
      appendLogisticsDetailRow(details, T('webview.world.logisticsNode'), node.label);
      appendLogisticsDetailRow(details, T('webview.world.logisticsKind'), logisticsNodeKindLabel(node.kind));
      const production = (node.production || []).map((item) => `${logisticsCommodityName(payload, item.commodityId)} ${logisticsNumber(item.effectiveOutput)} (${Math.round(item.productivePotential * 100)}% · ${Math.round(item.condition * 100)}%)`).join(', ');
      if (production) { appendLogisticsDetailRow(details, T('webview.world.logisticsProduction'), production); }
      const nodeShortages = (payload.shortages || []).filter((item) => item.nodeId === node.id && item.unmetDemand > 0);
      if (nodeShortages.length) {
        appendLogisticsDetailRow(details, T('webview.world.logisticsShortage'), nodeShortages.map((item) => `${logisticsCommodityName(payload, item.commodityId)} ${logisticsNumber(item.unmetDemand)}`).join(', '));
      }
      const sites = (payload.processingSites || []).filter((site) => site.nodeId === node.id);
      if (sites.length) {
        appendLogisticsDetailRow(details, T('webview.world.logisticsProcessing'), sites.map((site) => `${site.recipeId}: ${site.active ? T('webview.world.logisticsActive') : T('webview.world.logisticsInactive')} · ${site.batches}/${site.effectiveMaxBatches}`).join(', '));
      }
    }
  }
  parent.appendChild(details);
}

function renderEconomyLogisticsPanel() {
  const panel = economyLogisticsUiState.lightboxHost || document.getElementById('world-logistics-panel');
  const payload = economyLogisticsUiState.payload;
  if (!panel || !payload) { return; }
  panel.replaceChildren();
  panel.onkeydown = (event) => {
    if (event.key === 'Escape' && economyLogisticsUiState.selection) {
      event.preventDefault();
      // Clearing a selection and closing the expanded view are both bound to
      // Escape; stop here so one press only ever does the innermost thing.
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      economyLogisticsUiState.selection = null;
      renderEconomyLogisticsPanel();
    }
  };
  if (!payload.available) {
    panel.appendChild(logisticsElement('div', 'logistics-empty', logisticsUnavailableText(payload.unavailableReason)));
    return;
  }
  if (payload.snapshotSource === 'derived_preview') {
    panel.appendChild(logisticsElement(
      'div',
      'logistics-preview-note',
      T('webview.world.logisticsPreviewNote')
    ));
  }
  renderLogisticsSummary(payload, panel);
  renderLogisticsFilter(payload, panel);
  if (payload.unavailableReason === 'no_route_summaries') {
    panel.appendChild(logisticsElement('div', 'logistics-empty', logisticsUnavailableText(payload.unavailableReason)));
  } else {
    renderLogisticsNetwork(payload, panel);
  }
  renderLogisticsDetails(payload, panel);
}

/** Generic "view large" lightbox: a single reusable overlay any read-only
 *  visual panel can borrow (only the logistics network uses it so far). It
 *  never owns feature state — callers get a body element to render into and
 *  an onClose callback to unwind their own state when the user leaves. */
function ensureVisualLightbox() {
  if (window.__lrVisualLightbox) { return window.__lrVisualLightbox; }
  const root = document.createElement('div');
  root.className = 'visual-lightbox hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const backdrop = document.createElement('div');
  backdrop.className = 'visual-lightbox-backdrop';
  const panel = document.createElement('div');
  panel.className = 'visual-lightbox-panel';
  const header = document.createElement('div');
  header.className = 'visual-lightbox-header';
  const title = document.createElement('span');
  title.className = 'visual-lightbox-title';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'visual-lightbox-close';
  closeBtn.textContent = '✕';
  header.appendChild(title);
  header.appendChild(closeBtn);
  const body = document.createElement('div');
  body.className = 'visual-lightbox-body';
  panel.appendChild(header);
  panel.appendChild(body);
  root.appendChild(backdrop);
  root.appendChild(panel);
  document.body.appendChild(root);

  let onCloseCb = null;
  let restoreFocusEl = null;

  function close() {
    if (root.classList.contains('hidden')) { return; }
    root.classList.add('hidden');
    // Restore focus to the trigger before the consumer's onClose callback
    // runs — that callback typically re-renders its own panel (e.g. the
    // logistics panel rebuilds and replaces its expand button), which would
    // detach the very node we're about to focus if we waited until after.
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') { restoreFocusEl.focus(); }
    restoreFocusEl = null;
    const cb = onCloseCb;
    onCloseCb = null;
    if (typeof cb === 'function') { cb(); }
  }

  function open(titleText, triggerEl, onClose) {
    title.textContent = titleText || '';
    closeBtn.setAttribute('aria-label', T('webview.world.logisticsLightboxClose'));
    closeBtn.title = T('webview.world.logisticsLightboxClose');
    onCloseCb = onClose || null;
    restoreFocusEl = triggerEl || document.activeElement;
    root.classList.remove('hidden');
    closeBtn.focus();
  }

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.classList.contains('hidden')) {
      event.preventDefault();
      close();
    }
  });

  window.__lrVisualLightbox = { open, close, body };
  return window.__lrVisualLightbox;
}

function logisticsOpenLightbox(triggerEl) {
  const lightbox = ensureVisualLightbox();
  lightbox.body.classList.add('visual-lightbox-body--logistics');
  economyLogisticsUiState.lightboxHost = lightbox.body;
  lightbox.open(T('webview.world.logisticsTitle'), triggerEl, () => {
    economyLogisticsUiState.lightboxHost = null;
    lightbox.body.classList.remove('visual-lightbox-body--logistics');
    renderEconomyLogisticsPanel();
  });
  renderEconomyLogisticsPanel();
}

function renderEconomyLogistics(payload, commerceEnabled) {
  const section = document.getElementById('world-logistics-details');
  const panel = document.getElementById('world-logistics-panel');
  if (!section || !panel) { return; }
  const visible = Boolean(payload);
  section.classList.toggle('hidden', !visible);
  if (!visible) {
    if (economyLogisticsUiState.lightboxHost) {
      economyLogisticsUiState.lightboxHost = null;
      ensureVisualLightbox().close();
    }
    panel.replaceChildren();
    economyLogisticsUiState.payload = null;
    economyLogisticsUiState.selection = null;
    economyLogisticsUiState.cameraContexts = logisticsEmptyCameraContexts();
    economyLogisticsUiState.spaceHeld = false;
    return;
  }
  if (economyLogisticsUiState.payload !== payload) {
    economyLogisticsUiState.payload = payload;
    // Host ticks always allocate a new payload object. Retain a selection only
    // when the same factual id+type still exists; never key off object identity.
    economyLogisticsUiState.selection = logisticsRetainValidSelection(
      economyLogisticsUiState.selection,
      payload
    );
  }
  if (!commerceEnabled && payload.available) {
    economyLogisticsUiState.payload = { ...payload, available: false, unavailableReason: 'commerce_disabled' };
  }
  renderEconomyLogisticsPanel();
}

/** Keep a selection across payload pushes when its factual id remains present. */
function logisticsRetainValidSelection(selection, payload) {
  if (!selection || !payload) { return null; }
  if (selection.type === 'node') {
    const stillThere = (payload.nodes || []).some((node) => node && node.id === selection.id);
    return stillThere ? { type: 'node', id: selection.id } : null;
  }
  if (selection.type === 'route') {
    const stillThere = (payload.routes || []).some((route) => route && route.id === selection.id);
    return stillThere ? { type: 'route', id: selection.id } : null;
  }
  return null;
}
