// NOAI-ECON-FLOWS-005 — read-only deterministic logistics network.
// NOAI-ECON-FLOWS-005C — optional flow direction animation (particles when the
// panel is wide enough, marching dashes when it is narrow; both purely
// decorative/informational, never touching simulation state).

const LOGISTICS_FLOW_ANIM_STORAGE_KEY = 'lorerelay.logisticsFlowAnimation';
const LOGISTICS_COMPACT_WIDTH_PX = 420;

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
  return T(`webview.world.logisticsNode${String(kind || 'region').replace(/^./, (c) => c.toUpperCase())}`);
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
  const selected = economyLogisticsUiState.selection?.type === 'route' && economyLogisticsUiState.selection.id === route.id;
  const flowing = logisticsFlowMotionActive() && route.volume > 0;
  const group = logisticsSvgElement('g', `logistics-route logistics-route-${route.status}${route.bottleneck ? ' is-bottleneck' : ''}${selected ? ' is-selected' : ''}${flowing ? ' is-flowing' : ''}`);
  if (flowing && typeof group.style.setProperty === 'function') {
    group.style.setProperty('--logistics-flow-duration', `${logisticsFlowDurationSeconds(route).toFixed(2)}s`);
  }
  group.dataset.routeId = route.id;
  const direction = to.x >= from.x ? 1 : -1;
  const x1 = from.x + direction * 78;
  const x2 = to.x - direction * 78;
  const disrupted = route.status === 'blocked' || route.status === 'raided';
  const line = logisticsSvgElement('line', 'logistics-route-line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(from.y));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(to.y));
  const flowWidth = 1.5 + Math.sqrt(Math.max(0, route.volume) / Math.max(1, maxVolume)) * 6;
  // Disrupted routes must stay readable even at zero volume.
  const width = disrupted ? Math.max(flowWidth, 2.5) : flowWidth;
  line.setAttribute('stroke-width', width.toFixed(2));
  line.setAttribute('marker-end', `url(#logistics-arrow-${route.status})`);
  line.style.opacity = route.volume > 0
    ? String(0.55 + Math.min(1, route.utilization) * 0.4)
    : (disrupted ? '0.8' : '0.4');
  group.appendChild(line);
  if (flowing && !economyLogisticsUiState.compactAnimation) {
    logisticsRenderFlowParticles(group, route, x1, from.y, x2, to.y);
  }

  // Crossing routes share the exact segment midpoint, which stacks their
  // labels into unreadable glyph soup. Slide along the line until this
  // label no longer collides with an already placed one.
  let labelT = 0.5;
  for (const t of [0.5, 0.36, 0.64, 0.26, 0.74, 0.16, 0.84]) {
    const cx = x1 + (x2 - x1) * t;
    const cy = from.y + (to.y - from.y) * t;
    if (!labelSpots.some((spot) => Math.abs(spot.x - cx) < 42 && Math.abs(spot.y - cy) < 28)) {
      labelT = t;
      break;
    }
  }
  const labelX = Math.round(x1 + (x2 - x1) * labelT);
  const labelY = Math.round(from.y + (to.y - from.y) * labelT);
  labelSpots.push({ x: labelX, y: labelY });

  const label = logisticsSvgElement('text', 'logistics-route-label');
  label.setAttribute('x', String(labelX));
  label.setAttribute('y', String(labelY - 7));
  label.textContent = `${logisticsNumber(route.volume)}/${logisticsNumber(route.effectiveCapacity)}`;
  group.appendChild(label);
  if (route.status === 'blocked' || route.status === 'raided' || route.bottleneck) {
    const warning = logisticsSvgElement('text', 'logistics-route-warning');
    warning.setAttribute('x', String(labelX));
    warning.setAttribute('y', String(labelY + 12));
    warning.textContent = route.bottleneck ? '◆' : route.status === 'blocked' ? '×' : '!';
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
 *  Coordinates must be finite before any circle is created — never park a
 *  particle at the SVG origin (0,0). Stagger uses a *negative* begin so the
 *  animation is already mid-path on first paint; a positive begin left dots
 *  sitting at cx/cy until the delay elapsed (visible flash outside nodes). */
function logisticsRenderFlowParticles(group, route, x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return;
  }
  if (x1 === x2 && y1 === y2) { return; }
  const duration = logisticsFlowDurationSeconds(route);
  if (!(duration > 0) || !Number.isFinite(duration)) { return; }
  const pathD = `M ${x1},${y1} L ${x2},${y2}`;
  const dotCount = route.status === 'raided' ? 1 : 2;
  const stagger = logisticsHashUnit(route.id) * duration;
  for (let i = 0; i < dotCount; i++) {
    const dot = logisticsSvgElement('circle', `logistics-flow-dot logistics-flow-dot-${route.status}`);
    dot.setAttribute('r', '2.6');
    // Fallback geometry at the route start if SMIL has not yet transformed the
    // node (never use 0,0 — that is the SVG origin, left of the whole graph).
    dot.setAttribute('cx', String(x1));
    dot.setAttribute('cy', String(y1));
    const motion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    motion.setAttribute('dur', `${duration.toFixed(2)}s`);
    motion.setAttribute('repeatCount', 'indefinite');
    motion.setAttribute('path', pathD);
    const phase = (stagger + (i * duration) / dotCount) % duration;
    // Negative begin = animation already "running" at t=0 (mid-path), so the
    // particle never waits at the static cx/cy for a delayed positive begin.
    motion.setAttribute('begin', `-${phase.toFixed(2)}s`);
    dot.appendChild(motion);
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

function renderLogisticsNode(svg, payload, node, position, shortages) {
  const selected = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const group = logisticsSvgElement('g', `logistics-node logistics-node-${node.kind}${selected ? ' is-selected' : ''}`);
  group.dataset.nodeId = node.id;
  group.setAttribute('transform', `translate(${position.x - 76} ${position.y - 30})`);
  group.setAttribute('aria-label', `${node.label}, ${logisticsNodeKindLabel(node.kind)}`);
  const shape = logisticsSvgElement('rect', 'logistics-node-shape');
  shape.setAttribute('width', '152');
  shape.setAttribute('height', '60');
  shape.setAttribute('rx', node.kind === 'region' ? '20' : '8');
  group.appendChild(shape);
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
  appendLogisticsTitle(group, `${node.label}; ${logisticsNodeKindLabel(node.kind)}${nodeShortages.length ? `; ${T('webview.world.logisticsShortage')}` : ''}`);
  bindLogisticsActivation(group, { type: 'node', id: node.id });
  svg.appendChild(group);
}

function renderLogisticsNetwork(payload, parent) {
  const data = visibleLogisticsData(payload);
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
  const viewport = logisticsElement('div', 'logistics-network-viewport');
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
  const layout = buildLogisticsLayout(data.nodes);
  const motionActive = logisticsFlowMotionActive();
  const svgClass = `logistics-network${motionActive ? ' is-animated' : ''}${economyLogisticsUiState.compactAnimation ? ' is-compact' : ''}`;
  const svg = logisticsSvgElement('svg', svgClass);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('aria-label', T('webview.world.logisticsAria'));
  svg.setAttribute('role', 'img');
  const defs = logisticsSvgElement('defs');
  ['open', 'strained', 'blocked', 'raided'].forEach((status) => {
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
  const maxVolume = Math.max(1, ...data.routes.map((route) => route.volume || 0));
  const labelSpots = [];
  data.routes.forEach((route) => renderLogisticsRoute(svg, payload, route, layout.positions, maxVolume, labelSpots));
  data.nodes.forEach((node) => {
    const position = layout.positions.get(node.id);
    if (position) { renderLogisticsNode(svg, payload, node, position, data.shortages); }
  });
  viewport.appendChild(svg);
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
