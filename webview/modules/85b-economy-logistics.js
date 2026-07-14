// NOAI-ECON-FLOWS-005 — read-only deterministic logistics network.

const economyLogisticsUiState = {
  payload: null,
  commodityId: 'all',
  selection: null,
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

function buildLogisticsLayout(nodes) {
  const columns = [[], [], []];
  nodes.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((node) => {
    columns[logisticsNodeRank(node.kind)].push(node);
  });
  const height = Math.max(280, ...columns.map((column) => 72 + column.length * 92));
  const xByRank = [105, 380, 655];
  const positions = new Map();
  columns.forEach((column, rank) => {
    const step = height / Math.max(1, column.length + 1);
    column.forEach((node, index) => {
      positions.set(node.id, { x: xByRank[rank], y: Math.round(step * (index + 1)) });
    });
  });
  return { width: 760, height, positions };
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
  parent.appendChild(row);
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
  const nodes = (payload.nodes || []).filter((node) => nodeIds.has(node.id));
  return { routes, shortages, nodes };
}

function renderLogisticsRoute(svg, payload, route, positions, maxVolume) {
  const from = positions.get(route.fromNodeId);
  const to = positions.get(route.toNodeId);
  if (!from || !to) { return; }
  const group = logisticsSvgElement('g', `logistics-route logistics-route-${route.status}${route.bottleneck ? ' is-bottleneck' : ''}`);
  group.dataset.routeId = route.id;
  const direction = to.x >= from.x ? 1 : -1;
  const x1 = from.x + direction * 78;
  const x2 = to.x - direction * 78;
  const line = logisticsSvgElement('line', 'logistics-route-line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(from.y));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(to.y));
  const width = 1.5 + Math.sqrt(Math.max(0, route.volume) / Math.max(1, maxVolume)) * 6;
  line.setAttribute('stroke-width', width.toFixed(2));
  line.setAttribute('marker-end', `url(#logistics-arrow-${route.status})`);
  line.style.opacity = route.volume > 0 ? String(0.55 + Math.min(1, route.utilization) * 0.4) : '0.4';
  group.appendChild(line);

  const label = logisticsSvgElement('text', 'logistics-route-label');
  label.setAttribute('x', String(Math.round((x1 + x2) / 2)));
  label.setAttribute('y', String(Math.round((from.y + to.y) / 2) - 7));
  label.textContent = `${logisticsNumber(route.volume)}/${logisticsNumber(route.effectiveCapacity)}`;
  group.appendChild(label);
  if (route.status === 'blocked' || route.status === 'raided' || route.bottleneck) {
    const warning = logisticsSvgElement('text', 'logistics-route-warning');
    warning.setAttribute('x', String(Math.round((x1 + x2) / 2)));
    warning.setAttribute('y', String(Math.round((from.y + to.y) / 2) + 12));
    warning.textContent = route.bottleneck ? '◆' : route.status === 'blocked' ? '×' : '!';
    group.appendChild(warning);
  }
  const aria = `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}, ${logisticsCommodityName(payload, route.commodityId)}, ${logisticsStatusLabel(route.status)}`;
  group.setAttribute('aria-label', aria);
  appendLogisticsTitle(group, `${aria}; ${T('webview.world.logisticsVolume')} ${logisticsNumber(route.volume)}; ${T('webview.world.logisticsRisk')} ${logisticsRiskLabel(route.risk)}`);
  bindLogisticsActivation(group, { type: 'route', id: route.id });
  svg.appendChild(group);
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
  label.textContent = node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label;
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
  const viewport = logisticsElement('div', 'logistics-network-viewport');
  if (data.routes.length === 0) {
    const empty = logisticsElement('p', 'empty-text logistics-filter-empty', T('webview.world.logisticsFilterEmpty'));
    viewport.appendChild(empty);
  }
  const layout = buildLogisticsLayout(data.nodes);
  const svg = logisticsSvgElement('svg', 'logistics-network');
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
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = logisticsSvgElement('path', 'logistics-arrow-path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.appendChild(arrow);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);
  const maxVolume = Math.max(1, ...data.routes.map((route) => route.volume || 0));
  data.routes.forEach((route) => renderLogisticsRoute(svg, payload, route, layout.positions, maxVolume));
  data.nodes.forEach((node) => {
    const position = layout.positions.get(node.id);
    if (position) { renderLogisticsNode(svg, payload, node, position, data.shortages); }
  });
  viewport.appendChild(svg);
  parent.appendChild(viewport);
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
  const panel = document.getElementById('world-logistics-panel');
  const payload = economyLogisticsUiState.payload;
  if (!panel || !payload) { return; }
  panel.replaceChildren();
  panel.onkeydown = (event) => {
    if (event.key === 'Escape' && economyLogisticsUiState.selection) {
      event.preventDefault();
      economyLogisticsUiState.selection = null;
      renderEconomyLogisticsPanel();
    }
  };
  if (!payload.available) {
    panel.appendChild(logisticsElement('div', 'logistics-empty', logisticsUnavailableText(payload.unavailableReason)));
    return;
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

function renderEconomyLogistics(payload, commerceEnabled) {
  const section = document.getElementById('world-logistics-details');
  const panel = document.getElementById('world-logistics-panel');
  if (!section || !panel) { return; }
  const visible = Boolean(payload);
  section.classList.toggle('hidden', !visible);
  if (!visible) {
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
