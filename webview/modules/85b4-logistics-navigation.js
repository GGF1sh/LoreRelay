// LOGISTICS-GRAPH-CANVAS-SLICE5 -- pure navigation, filter, and semantic zoom models.

const LOGISTICS_MINIMAP_SIZE = 132;
const LOGISTICS_SEMANTIC_OVERVIEW_ENTER = 0.53;
const LOGISTICS_SEMANTIC_OVERVIEW_EXIT = 0.57;
const LOGISTICS_SEMANTIC_DETAIL_ENTER = 1.17;
const LOGISTICS_SEMANTIC_DETAIL_EXIT = 1.13;

function logisticsNavigationCompare(a, b) { return String(a ?? '').localeCompare(String(b ?? '')); }
function logisticsNavigationFinite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function logisticsNavigationNormalize(value) { return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase(); }
function logisticsNavigationFamily(commodity) { return typeof commodity?.family === 'string' && commodity.family.trim() ? commodity.family.trim() : null; }
function logisticsNavigationRegionNames(regions) {
  const entries = regions instanceof Map ? [...regions.entries()] : Array.isArray(regions) ? regions.map((region) => [region?.id || region?.regionId, region]) : [];
  return new Map(entries.filter(([id]) => typeof id === 'string' && id).sort((a, b) => logisticsNavigationCompare(a[0], b[0])).map(([id, region]) => [id, String(region?.label ?? region?.name ?? region?.title ?? '')]));
}
function logisticsNavigationBounds(bounds) {
  const minX = logisticsNavigationFinite(bounds?.minX); const minY = logisticsNavigationFinite(bounds?.minY);
  const maxX = Math.max(minX + 1, logisticsNavigationFinite(bounds?.maxX, minX + 1));
  const maxY = Math.max(minY + 1, logisticsNavigationFinite(bounds?.maxY, minY + 1));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function computeLogisticsMinimapProjectionBounds({ graphBounds, viewportSize, camera, nodes, regions, options } = {}) {
  const base = logisticsNavigationBounds(graphBounds);
  let minX = base.minX; let minY = base.minY; let maxX = base.maxX; let maxY = base.maxY;
  const include = (x, y, w = 0, h = 0) => {
    const safeX = logisticsNavigationFinite(x); const safeY = logisticsNavigationFinite(y);
    const safeW = Math.max(0, logisticsNavigationFinite(w)); const safeH = Math.max(0, logisticsNavigationFinite(h));
    minX = Math.min(minX, safeX); minY = Math.min(minY, safeY);
    maxX = Math.max(maxX, safeX + safeW); maxY = Math.max(maxY, safeY + safeH);
  };
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const w = Math.max(0, logisticsNavigationFinite(node?.w)); const h = Math.max(0, logisticsNavigationFinite(node?.h));
    include(logisticsNavigationFinite(node?.x) - w / 2, logisticsNavigationFinite(node?.y) - h / 2, w, h);
  }
  for (const [, region] of regions instanceof Map ? regions.entries() : []) {
    include(region?.x, region?.y, region?.w, region?.h);
  }
  const safeCamera = { k: Math.max(0.0001, logisticsNavigationFinite(camera?.k, 1)), tx: logisticsNavigationFinite(camera?.tx), ty: logisticsNavigationFinite(camera?.ty) };
  include(-safeCamera.tx / safeCamera.k, -safeCamera.ty / safeCamera.k,
    Math.max(0, logisticsNavigationFinite(viewportSize?.width)) / safeCamera.k,
    Math.max(0, logisticsNavigationFinite(viewportSize?.height)) / safeCamera.k);
  const worldPadding = Math.max(0, logisticsNavigationFinite(options?.worldPadding, 24));
  return logisticsNavigationBounds({ minX: minX - worldPadding, minY: minY - worldPadding, maxX: maxX + worldPadding, maxY: maxY + worldPadding });
}

function expandLogisticsMinimapProjectionBounds(current, candidate) {
  const a = logisticsNavigationBounds(current); const b = logisticsNavigationBounds(candidate);
  return logisticsNavigationBounds({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
}

function computeLogisticsMinimapModel({ graphBounds, viewportSize, camera, nodes, regions, options } = {}) {
  const worldBounds = options?.projectionBounds
    ? logisticsNavigationBounds(options.projectionBounds)
    : computeLogisticsMinimapProjectionBounds({ graphBounds, viewportSize, camera, nodes, regions, options });
  const width = Math.max(1, logisticsNavigationFinite(options?.width, LOGISTICS_MINIMAP_SIZE));
  const height = Math.max(1, logisticsNavigationFinite(options?.height, LOGISTICS_MINIMAP_SIZE));
  const pad = Math.max(0, logisticsNavigationFinite(options?.padding, 6));
  const scale = Math.min((width - pad * 2) / worldBounds.w, (height - pad * 2) / worldBounds.h);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const project = (x, y) => ({ x: pad + (x - worldBounds.minX) * safeScale, y: pad + (y - worldBounds.minY) * safeScale });
  const safeCamera = { k: Math.max(0.0001, logisticsNavigationFinite(camera?.k, 1)), tx: logisticsNavigationFinite(camera?.tx), ty: logisticsNavigationFinite(camera?.ty) };
  const vpW = Math.max(0, logisticsNavigationFinite(viewportSize?.width)); const vpH = Math.max(0, logisticsNavigationFinite(viewportSize?.height));
  const worldX = -safeCamera.tx / safeCamera.k; const worldY = -safeCamera.ty / safeCamera.k;
  const start = project(worldX, worldY);
  const regionRects = [...(regions instanceof Map ? regions.entries() : [])].sort((a, b) => logisticsNavigationCompare(a[0], b[0])).map(([id, region]) => {
    const p = project(region.x, region.y); return { id, x: p.x, y: p.y, w: Math.max(1, region.w * safeScale), h: Math.max(1, region.h * safeScale) };
  });
  const nodeMarkers = (Array.isArray(nodes) ? nodes : []).slice().sort((a, b) => logisticsNavigationCompare(a.id, b.id)).map((node) => {
    const p = project(node.x, node.y); return { id: node.id, x: p.x, y: p.y, selected: Boolean(node.selected), current: Boolean(node.current) };
  });
  return { worldBounds, minimapBounds: { width, height, padding: pad }, scale: safeScale, contentRect: { x: pad, y: pad, w: worldBounds.w * safeScale, h: worldBounds.h * safeScale }, viewportRect: { x: start.x, y: start.y, w: vpW / safeCamera.k * safeScale, h: vpH / safeCamera.k * safeScale }, regionRects, nodeMarkers, selectedMarker: nodeMarkers.find((node) => node.selected) || null, currentLocationMarker: nodeMarkers.find((node) => node.current) || null };
}

function isLogisticsRouteFlowEligible({ flowEnabled, reducedMotion, relevanceKind, volume, status } = {}) {
  const movementStatuses = new Set(['open', 'strained', 'raided']);
  return flowEnabled === true
    && reducedMotion !== true
    && relevanceKind === 'primary'
    && Number.isFinite(volume) && volume > 0
    && movementStatuses.has(String(status || 'open'));
}

function logisticsMinimapCameraAt(model, point, viewportSize, camera) {
  const k = Math.max(0.0001, logisticsNavigationFinite(camera?.k, 1));
  const worldX = model.worldBounds.minX + (logisticsNavigationFinite(point?.x) - model.minimapBounds.padding) / model.scale;
  const worldY = model.worldBounds.minY + (logisticsNavigationFinite(point?.y) - model.minimapBounds.padding) / model.scale;
  return { k, tx: logisticsNavigationFinite(viewportSize?.width) / 2 - worldX * k, ty: logisticsNavigationFinite(viewportSize?.height) / 2 - worldY * k, userModified: true };
}

function computeLogisticsSemanticZoom({ cameraScale, selection, options } = {}) {
  const k = logisticsNavigationFinite(cameraScale, 1);
  const previous = options?.previousLevel;
  let level = 'standard';
  if (previous === 'overview' ? k < LOGISTICS_SEMANTIC_OVERVIEW_EXIT : k < LOGISTICS_SEMANTIC_OVERVIEW_ENTER) { level = 'overview'; }
  else if (previous === 'detail' ? k >= LOGISTICS_SEMANTIC_DETAIL_EXIT : k >= LOGISTICS_SEMANTIC_DETAIL_ENTER) { level = 'detail'; }
  return { level, selectedProtection: Boolean(selection), hideRouteLabels: level === 'overview', hideMinorDetail: level === 'overview', hideParticles: level === 'overview' };
}

function computeLogisticsFilterModel({ nodes, routes, commodities, regions, query, commodityId, statusKeys } = {}) {
  const normalizedQuery = logisticsNavigationNormalize(query);
  const activeStatuses = new Set(Array.isArray(statusKeys) ? statusKeys.map((value) => String(value)) : []);
  const commodityById = new Map((Array.isArray(commodities) ? commodities : []).map((item) => [item.id, item]));
  const nodeById = new Map((Array.isArray(nodes) ? nodes : []).map((item) => [item.id, item]));
  const regionNameById = logisticsNavigationRegionNames(regions);
  const selectedCommodityId = typeof commodityId === 'string' && commodityId && commodityId !== 'all' ? commodityId : null;
  const selectedFamily = logisticsNavigationFamily(commodityById.get(selectedCommodityId));
  const active = Boolean(normalizedQuery || activeStatuses.size || selectedCommodityId);
  const routeMatchKinds = new Map(); const nodeMatchKinds = new Map();
  const routeList = Array.isArray(routes) ? routes : [];
  for (const route of routeList) {
    const from = nodeById.get(route.fromNodeId); const to = nodeById.get(route.toNodeId); const commodity = commodityById.get(route.commodityId);
    const text = logisticsNavigationNormalize([route.id, from?.id, to?.id, from?.label, to?.label, from?.regionId, to?.regionId, regionNameById.get(from?.regionId), regionNameById.get(to?.regionId), commodity?.name, route.commodityId].filter(Boolean).join(' '));
    const queryMatch = !normalizedQuery || text.includes(normalizedQuery);
    const statusMatch = !activeStatuses.size || activeStatuses.has(String(route.status || 'open'));
    const family = logisticsNavigationFamily(commodity);
    const commodityKind = !selectedCommodityId ? 'primary'
      : route.commodityId === selectedCommodityId ? 'primary'
        : selectedFamily && family === selectedFamily ? 'secondary' : 'unrelated';
    routeMatchKinds.set(route.id, queryMatch && statusMatch ? commodityKind : 'unrelated');
  }
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const text = logisticsNavigationNormalize([node.id, node.label, node.regionId, regionNameById.get(node.regionId)].filter(Boolean).join(' '));
    const incidentKinds = routeList.filter((route) => route.fromNodeId === node.id || route.toNodeId === node.id).map((route) => routeMatchKinds.get(route.id));
    const incidentKind = incidentKinds.includes('primary') ? 'primary' : incidentKinds.includes('secondary') ? 'secondary' : 'unrelated';
    const directQueryMatch = Boolean(normalizedQuery) && text.includes(normalizedQuery) && !activeStatuses.size && !selectedCommodityId;
    nodeMatchKinds.set(node.id, !active ? 'primary' : incidentKind !== 'unrelated' ? incidentKind : directQueryMatch ? 'primary' : 'unrelated');
  }
  return { active, query: normalizedQuery, routeMatchKinds, nodeMatchKinds, matchCount: [...routeMatchKinds.values()].filter((value) => value !== 'unrelated').length, regionNameById };
}
