// NOAI-ECON-FLOWS-005 — read-only deterministic logistics network.
// NOAI-ECON-FLOWS-005C — optional flow direction animation (particles when the
// panel is wide enough, marching dashes when it is narrow; both purely
// decorative/informational, never touching simulation state).

const LOGISTICS_FLOW_ANIM_STORAGE_KEY = 'lorerelay.logisticsFlowAnimation';
const LOGISTICS_COMPACT_WIDTH_PX = 420;

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
};

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

function buildLogisticsLayout(nodes) {
  const columns = [[], [], []];
  nodes.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((node) => {
    columns[logisticsNodeRank(node.kind)].push(node);
  });
  const height = Math.max(280, ...columns.map((column) => 72 + column.length * 92));
  // Assign x positions only to occupied columns so a filtered view (for example
  // facility -> store only) does not leave its content scrolled out of sight
  // behind an empty leading column.
  const occupiedRanks = [0, 1, 2].filter((rank) => columns[rank].length > 0);
  const xByRank = new Map(occupiedRanks.map((rank, index) => [rank, 105 + index * 275]));
  const lastX = occupiedRanks.length > 0 ? 105 + (occupiedRanks.length - 1) * 275 : 105;
  const positions = new Map();
  columns.forEach((column, rank) => {
    const step = height / Math.max(1, column.length + 1);
    column.forEach((node, index) => {
      positions.set(node.id, { x: xByRank.get(rank), y: Math.round(step * (index + 1)) });
    });
  });
  return { width: lastX + 105, height, positions };
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
    economyLogisticsUiState.selection = null;
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
  const routes = (payload.routes || []).filter((route) => commodityId === 'all' || route.commodityId === commodityId);
  const shortages = (payload.shortages || []).filter((item) => item.unmetDemand > 0 && (commodityId === 'all' || item.commodityId === commodityId));
  const nodeIds = new Set();
  routes.forEach((route) => { nodeIds.add(route.fromNodeId); nodeIds.add(route.toNodeId); });
  shortages.forEach((item) => nodeIds.add(item.nodeId));
  (payload.nodes || []).forEach((node) => {
    if (commodityId === 'all' || (node.commodityIds || []).includes(commodityId)) { nodeIds.add(node.id); }
  });
  // Keep processing locations visible for commodities that only exist as
  // processing inputs/outputs (for example a refined good with no route yet).
  (payload.processingSites || []).forEach((site) => {
    if (commodityId === 'all') { return; }
    const touches = [...(site.inputs || []), ...(site.outputs || [])]
      .some((quantity) => quantity.commodityId === commodityId);
    if (touches) { nodeIds.add(site.nodeId); }
  });
  const nodes = (payload.nodes || []).filter((node) => nodeIds.has(node.id));
  return { routes, shortages, nodes };
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

function renderLogisticsRoute(svg, payload, route, positions, maxVolume, labelSpots) {
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
  const group = logisticsSvgElement('g', `logistics-route logistics-route-${status} is-${movement}${route.bottleneck ? ' is-bottleneck' : ''}${selected ? ' is-selected' : ''}${unrelated ? ' is-unrelated' : ''}${flowing ? ' is-flowing' : ''}`);
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
  if (status === 'blocked' || status === 'raided' || status === 'rumored' || route.bottleneck) {
    const warning = logisticsSvgElement('text', 'logistics-route-warning');
    warning.setAttribute('x', String(labelX));
    warning.setAttribute('y', String(labelY + 12));
    warning.textContent = route.bottleneck ? '◆' : status === 'blocked' ? '×' : status === 'rumored' ? '?' : '!';
    group.appendChild(warning);
  }
  const aria = `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}, ${logisticsCommodityName(payload, route.commodityId)}, ${logisticsStatusLabel(route.status)}`;
  group.setAttribute('aria-label', aria);
  appendLogisticsTitle(group, `${aria}; ${T('webview.world.logisticsVolume')} ${logisticsNumber(route.volume)}; ${T('webview.world.logisticsRisk')} ${logisticsRiskLabel(route.risk)}`);
  bindLogisticsActivation(group, { type: 'route', id: route.id });
  svg.appendChild(group);
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

function renderLogisticsNode(svg, payload, node, position, shortages, routes) {
  const selected = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const selectedRouteId = economyLogisticsUiState.selection?.type === 'route' ? economyLogisticsUiState.selection.id : null;
  const selectedRoute = selectedRouteId ? (routes || []).find((route) => route.id === selectedRouteId) : null;
  const unrelated = Boolean(selectedRoute && selectedRoute.fromNodeId !== node.id && selectedRoute.toNodeId !== node.id);
  const role = logisticsNodeRole(node.kind);
  const scale = logisticsNodeScale(node, routes);
  const group = logisticsSvgElement('g', `logistics-node logistics-node-${role} logistics-node-scale-${scale}${selected ? ' is-selected' : ''}${unrelated ? ' is-unrelated' : ''}`);
  group.dataset.nodeId = node.id;
  group.setAttribute('transform', `translate(${position.x - 76} ${position.y - 30})`);
  group.setAttribute('aria-label', `${node.label}, ${logisticsNodeKindLabel(node.kind)}`);
  const shape = logisticsSvgElement('path', 'logistics-node-shape');
  shape.setAttribute('d', logisticsNodeShapePath(role));
  group.appendChild(shape);
  const accent = logisticsSvgElement('path', 'logistics-node-accent');
  accent.setAttribute('d', 'M 12 5 H 140');
  group.appendChild(accent);
  const kind = logisticsSvgElement('text', 'logistics-node-kind');
  kind.setAttribute('x', '12');
  kind.setAttribute('y', '17');
  kind.textContent = logisticsNodeKindLabel(node.kind);
  group.appendChild(kind);
  const label = logisticsSvgElement('text', 'logistics-node-label');
  label.setAttribute('x', '12');
  label.setAttribute('y', '39');
  label.textContent = logisticsTruncateLabel(node.label);
  group.appendChild(label);
  const symbol = logisticsSvgElement('text', 'logistics-node-symbol');
  symbol.setAttribute('x', '132');
  symbol.setAttribute('y', '43');
  symbol.textContent = logisticsNodeSymbol(role);
  group.appendChild(symbol);
  const nodeShortages = shortages.filter((item) => item.nodeId === node.id);
  if (nodeShortages.length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-shortage-badge');
    badge.setAttribute('x', '135');
    badge.setAttribute('y', '18');
    badge.textContent = '!';
    group.appendChild(badge);
  } else if ((node.processingSiteIds || []).length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-processing-badge');
    badge.setAttribute('x', '132');
    badge.setAttribute('y', '18');
    badge.textContent = '⚙';
    group.appendChild(badge);
  }
  appendLogisticsTitle(group, `${node.label}; ${logisticsNodeKindLabel(node.kind)}; ${T(`webview.world.logisticsScale${scale.replace(/^./, (c) => c.toUpperCase())}`)}${nodeShortages.length ? `; ${T('webview.world.logisticsShortage')}` : ''}`);
  bindLogisticsActivation(group, { type: 'node', id: node.id });
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

  viewport.appendChild(toolbar);
  return { toolbar, zoomOutBtn, zoomInBtn, fitBtn, resetBtn };
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
function logisticsSetupCameraInteractions(ctx) {
  const { viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox } = ctx;
  const state = economyLogisticsUiState;
  const hostCtx = logisticsActiveCameraContext();
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : null;

  function setCamera(next) {
    if (!logisticsIsValidCamera(next)) {
      // Retain last valid camera when an operation cannot produce a transform.
      if (logisticsIsValidCamera(hostCtx.camera)) { return; }
      next = logisticsDefaultCamera(vp);
    }
    hostCtx.camera = next;
    applyLogisticsCameraTransform(svg, cameraGroup, next, toolbarEls);
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
    if (active.moved) { suppressClick = true; }
    releaseStoredCapture();
    if (viewport.classList) { viewport.classList.remove('is-panning'); }
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
    cleanupDrag();
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
    const base = drag.startCamera;
    if (!logisticsIsValidCamera(base)) { return; }
    const next = { k: base.k, tx: base.tx + dx, ty: base.ty + dy, userModified: true };
    setCamera(next);
  });
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', (event) => {
    if (!drag) { return; }
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    cleanupDrag();
  });

  // Suppress the synthesized click that follows a real pan (threshold crossed).
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) { return; }
    suppressClick = false;
    if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
  }, true);

  function currentBBox() { return bbox; }

  function onWindowBlur() {
    cleanupDrag();
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
      cleanupDrag({ restoreCamera: true });
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
        const next = logisticsFitAllCamera(currentBBox(), vp);
        hostCtx.identity = identity;
        setCamera(next);
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
        if (command === 'zoomIn') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, 1)); return; }
        if (command === 'zoomOut') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, -1)); return; }
        // Fit All and Reset Camera are identical in this slice: there is no
        // persisted camera or manual node layout yet to distinguish them from.
        hostCtx.identity = identity;
        setCamera(logisticsFitAllCamera(currentBBox(), vp));
      });
    },
  };
}

function renderLogisticsNetwork(payload, parent) {
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
  // Content is laid out in stable world-space coordinates (unchanged from
  // before this slice); a camera transform is layered on top of it rather
  // than the SVG viewBox growing to fit the whole graph.
  const layout = buildLogisticsLayout(data.nodes);
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

  const maxVolume = Math.max(1, ...data.routes.map((route) => route.volume || 0));
  const labelSpots = [];
  data.routes.forEach((route) => renderLogisticsRoute(layerEdges, payload, route, layout.positions, maxVolume, labelSpots));
  data.nodes.forEach((node) => {
    const position = layout.positions.get(node.id);
    if (position) { renderLogisticsNode(layerNodes, payload, node, position, data.shortages, data.routes); }
  });
  viewport.appendChild(svg);

  const bbox = logisticsComputeContentBBox(layout.positions);
  const camera = logisticsResolveCameraForRender(payload, bbox, viewportSize);
  const toolbarEls = renderLogisticsCameraToolbar(viewport, (command) => interactions.onToolbarCommand(command));
  applyLogisticsCameraTransform(svg, cameraGroup, camera, toolbarEls);
  const interactions = logisticsSetupCameraInteractions({ viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox });

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
    economyLogisticsUiState.selection = null;
  }
  if (!commerceEnabled && payload.available) {
    economyLogisticsUiState.payload = { ...payload, available: false, unavailableReason: 'commerce_disabled' };
  }
  renderEconomyLogisticsPanel();
}
