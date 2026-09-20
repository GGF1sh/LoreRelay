// LOGISTICS-GRAPH-CANVAS-SLICE4 -- pure factual visual encoding.
// This module intentionally knows nothing about SVG, theme colours, storage,
// camera state, or time.  It only turns factual payload fields into stable
// visual tokens; the renderer and CSS decide how those tokens are painted.

const LOGISTICS_VISUAL_MIN_WIDTH = 2;
const LOGISTICS_VISUAL_MAX_WIDTH = 7;
const LOGISTICS_VISUAL_DIM_OPACITY = 0.18;
const LOGISTICS_VISUAL_SECONDARY_OPACITY = 0.55;

function logisticsVisualCompare(a, b) {
  const aa = String(a == null ? '' : a);
  const bb = String(b == null ? '' : b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsVisualFiniteVolume(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function logisticsVisualStatus(route, geometryByRoute) {
  const raw = String(route?.status || 'open').toLowerCase();
  if (raw === 'rumored' || raw === 'unconfirmed') { return { key: 'rumored', tone: 'neutral', dash: '7 5', labelKey: 'rumored', operational: false }; }
  if (raw === 'disrupted' || raw === 'impaired' || raw === 'strained' || raw === 'raided') { return { key: 'impaired', tone: 'warning', dash: '8 3 2 3', labelKey: 'impaired', operational: true }; }
  if (raw === 'blocked' || raw === 'sealed' || raw === 'closed' || raw === 'disabled') { return { key: 'blocked', tone: 'danger', dash: '3 5', labelKey: 'blocked', operational: false }; }
  if (raw === 'bottleneck' || route?.bottleneck) { return { key: 'bottleneck', tone: 'bottleneck', dash: '12 3 2 3', labelKey: 'bottleneck', operational: true }; }
  if (raw === 'open' || raw === 'normal' || raw === '') { return { key: 'open', tone: 'normal', dash: '', labelKey: 'open', operational: true }; }
  return { key: 'unknown', tone: 'neutral', dash: '1 4', labelKey: 'unknown', operational: false };
}

function logisticsVisualFamily(commodity) {
  if (!commodity || typeof commodity !== 'object') { return null; }
  for (const field of ['family', 'familyKey', 'category']) {
    if (typeof commodity[field] === 'string' && commodity[field].trim()) { return commodity[field].trim(); }
  }
  return null;
}

function logisticsVisualNodeMatchesCommodity(node, commodityId, routes, shortages) {
  const has = (value) => Array.isArray(value) && value.some((entry) => (typeof entry === 'string' ? entry : entry?.commodityId) === commodityId);
  return has(node?.commodityIds) || has(node?.production) || has(node?.consumption) || has(node?.storage)
    || (routes || []).some((route) => route?.commodityId === commodityId && (route.fromNodeId === node?.id || route.toNodeId === node?.id))
    || (shortages || []).some((shortage) => shortage?.commodityId === commodityId && shortage.nodeId === node?.id);
}

function logisticsVisualNodeCommodityIds(node, routes, shortages) {
  const ids = new Set();
  const collect = (value) => {
    if (!Array.isArray(value)) { return; }
    for (const entry of value) {
      const id = typeof entry === 'string' ? entry : entry?.commodityId;
      if (typeof id === 'string' && id) { ids.add(id); }
    }
  };
  collect(node?.commodityIds); collect(node?.production); collect(node?.consumption); collect(node?.storage);
  for (const route of routes || []) {
    if (route && (route.fromNodeId === node?.id || route.toNodeId === node?.id) && typeof route.commodityId === 'string') { ids.add(route.commodityId); }
  }
  for (const shortage of shortages || []) {
    if (shortage?.nodeId === node?.id && typeof shortage.commodityId === 'string') { ids.add(shortage.commodityId); }
  }
  return ids;
}

/**
 * Computes stable factual visual tokens.  Family tokens are ordinal tokens,
 * never colours and never derived from commodity identifiers or names.
 */
function computeLogisticsVisualEncoding({ routes, nodes, commodities, selectedCommodityId, selectedRouteId, selectedNodeId, currentLocationId, options } = {}) {
  const safeRoutes = Array.isArray(routes) ? routes.slice().filter(Boolean).sort((a, b) => logisticsVisualCompare(a.id, b.id)) : [];
  const safeNodes = Array.isArray(nodes) ? nodes.slice().filter(Boolean).sort((a, b) => logisticsVisualCompare(a.id, b.id)) : [];
  const safeCommodities = Array.isArray(commodities) ? commodities.slice().filter(Boolean) : [];
  const geometryByRoute = options?.geometryByRoute;
  const shortages = Array.isArray(options?.shortages) ? options.shortages : [];
  const selectedCommodity = typeof selectedCommodityId === 'string' && selectedCommodityId && selectedCommodityId !== 'all' ? selectedCommodityId : null;
  const commodityById = new Map(safeCommodities.filter((item) => typeof item.id === 'string').map((item) => [item.id, item]));
  const selectedFamily = selectedCommodity ? logisticsVisualFamily(commodityById.get(selectedCommodity)) : null;
  const familyKeys = [...new Set(safeCommodities.map(logisticsVisualFamily).filter(Boolean))].sort(logisticsVisualCompare).slice(0, 6);
  const familyTokenByKey = new Map(familyKeys.map((key, index) => [key, `family-${index + 1}`]));
  const volumes = safeRoutes.map((route) => logisticsVisualFiniteVolume(route.volume)).filter((value) => value > 0).sort((a, b) => a - b);
  // A 75th-percentile reference prevents a single extreme from flattening the
  // ordinary routes while the clamp retains monotonicity for every value.
  const reference = volumes.length ? volumes[Math.max(0, Math.ceil(volumes.length * 0.75) - 1)] : 0;
  const widthFor = (volume) => {
    if (!(volume > 0) || !(reference > 0)) { return LOGISTICS_VISUAL_MIN_WIDTH; }
    return LOGISTICS_VISUAL_MIN_WIDTH + (LOGISTICS_VISUAL_MAX_WIDTH - LOGISTICS_VISUAL_MIN_WIDTH) * Math.sqrt(Math.min(volume, reference) / reference);
  };
  const sortedVolumes = [...new Set(volumes)];
  const routeStyles = new Map();
  for (const route of safeRoutes) {
    const throughputValue = logisticsVisualFiniteVolume(route.volume);
    const commodity = commodityById.get(route.commodityId);
    const familyKey = logisticsVisualFamily(commodity);
    const selected = route.id === selectedRouteId;
    const navigationKind = options?.filterModel?.routeMatchKinds?.get(route.id);
    const relevanceKind = selected ? 'primary'
      : selectedRouteId ? 'unrelated'
        : options?.filterModel?.active ? (navigationKind || 'unrelated')
        : !selectedCommodity || route.commodityId === selectedCommodity ? 'primary'
          : selectedFamily && familyKey === selectedFamily ? 'secondary' : 'unrelated';
    const relevance = relevanceKind === 'primary' ? 1
      : relevanceKind === 'secondary' ? LOGISTICS_VISUAL_SECONDARY_OPACITY : LOGISTICS_VISUAL_DIM_OPACITY;
    const status = logisticsVisualStatus(route, geometryByRoute);
    const geometry = geometryByRoute && typeof geometryByRoute.get === 'function' ? geometryByRoute.get(route.id) : null;
    const geometryConflicted = Boolean(route.geometryConflicted || route.conflicted || route.labelConflicted || geometry?.conflicted);
    routeStyles.set(route.id, {
      routeId: route.id,
      statusKey: status.key,
      statusTone: status.tone,
      statusLabelKey: status.labelKey,
      dashPattern: status.dash,
      throughputValue,
      throughputRank: throughputValue > 0 ? sortedVolumes.indexOf(throughputValue) + 1 : 0,
      strokeWidth: Number(widthFor(throughputValue).toFixed(2)),
      relevance,
      relevanceKind,
      commodityFamilyKey: familyKey,
      commodityFamilyToken: familyKey ? (familyTokenByKey.get(familyKey) || 'unclassified') : 'unclassified',
      commodityAccentState: relevanceKind === 'secondary' ? 'secondary'
        : relevanceKind === 'primary' && selectedCommodity && route.commodityId === selectedCommodity ? 'primary' : 'none',
      selected,
      // Geometry diagnostics must never replace the factual movement state.
      // Renderers may add an independent diagnostic affordance while status
      // colour, dash and particle eligibility remain truthful.
      conflicted: geometryConflicted,
      geometryConflicted,
      operational: status.operational,
    });
  }
  const selectedRoute = safeRoutes.find((route) => route.id === selectedRouteId) || null;
  const nodeStyles = new Map();
  for (const node of safeNodes) {
    const endpoint = Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id));
    const current = Boolean(currentLocationId && node.locationId === currentLocationId);
    const selected = node.id === selectedNodeId;
    const commodityIds = logisticsVisualNodeCommodityIds(node, safeRoutes, shortages);
    const exactCommodity = Boolean(selectedCommodity && commodityIds.has(selectedCommodity));
    const sameFamily = Boolean(selectedCommodity && selectedFamily && [...commodityIds].some((id) => id !== selectedCommodity && logisticsVisualFamily(commodityById.get(id)) === selectedFamily));
    const navigationKind = options?.filterModel?.nodeMatchKinds?.get(node.id);
    const relevanceKind = selected || current || endpoint ? 'primary'
      : selectedRouteId ? 'unrelated'
        : options?.filterModel?.active ? (navigationKind || 'unrelated')
        : !selectedCommodity || exactCommodity ? 'primary'
          : sameFamily ? 'secondary' : 'unrelated';
    const relevance = relevanceKind === 'primary' ? 1
      : relevanceKind === 'secondary' ? LOGISTICS_VISUAL_SECONDARY_OPACITY : LOGISTICS_VISUAL_DIM_OPACITY;
    nodeStyles.set(node.id, {
      nodeId: node.id,
      relevance,
      relevanceKind,
      selected,
      current,
      selectedRouteEndpoint: endpoint,
      commodityAccentState: selectedCommodity && relevanceKind === 'primary' && !selected && !current && !endpoint ? 'primary'
        : selectedCommodity && relevanceKind === 'secondary' ? 'secondary' : 'none',
    });
  }
  return {
    routeStyles,
    nodeStyles,
    legend: {
      channels: [
        ['status', 'hue'], ['throughput', 'width'], ['relevance', 'opacity'], ['direction', 'arrow'], ['uncertainty', 'dash'],
      ],
      commodityAccent: selectedCommodity ? 'selected-commodity-only' : 'none',
    },
    diagnostics: {
      familyMetadataAvailable: Boolean(selectedFamily),
      familyTokens: [...familyTokenByKey.entries()].map(([key, token]) => ({ key, token })),
      throughputReference: reference,
    },
  };
}
