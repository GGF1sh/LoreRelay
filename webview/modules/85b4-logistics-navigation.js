// LOGISTICS-GRAPH-CANVAS-SLICE5 -- pure navigation, filter, and semantic zoom models.

const LOGISTICS_MINIMAP_SIZE = 132;
const LOGISTICS_SEMANTIC_OVERVIEW_ENTER = 0.53;
const LOGISTICS_SEMANTIC_OVERVIEW_EXIT = 0.57;
const LOGISTICS_SEMANTIC_DETAIL_ENTER = 1.17;
const LOGISTICS_SEMANTIC_DETAIL_EXIT = 1.13;

function logisticsNavigationCompare(a, b) { return String(a ?? '').localeCompare(String(b ?? '')); }
function logisticsNavigationFinite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function logisticsNavigationNormalize(value) { return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase(); }
function logisticsNavigationBounds(bounds) {
  const minX = logisticsNavigationFinite(bounds?.minX); const minY = logisticsNavigationFinite(bounds?.minY);
  const maxX = Math.max(minX + 1, logisticsNavigationFinite(bounds?.maxX, minX + 1));
  const maxY = Math.max(minY + 1, logisticsNavigationFinite(bounds?.maxY, minY + 1));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function computeLogisticsMinimapModel({ graphBounds, viewportSize, camera, nodes, regions, options } = {}) {
  const worldBounds = logisticsNavigationBounds(graphBounds);
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

function computeLogisticsFilterModel({ nodes, routes, commodities, query, commodityId, statusKeys, selection } = {}) {
  const normalizedQuery = logisticsNavigationNormalize(query);
  const activeStatuses = new Set(Array.isArray(statusKeys) ? statusKeys.map((value) => String(value)) : []);
  const commodityById = new Map((Array.isArray(commodities) ? commodities : []).map((item) => [item.id, item]));
  const nodeById = new Map((Array.isArray(nodes) ? nodes : []).map((item) => [item.id, item]));
  const active = Boolean(normalizedQuery || activeStatuses.size || (commodityId && commodityId !== 'all'));
  const routeMatchKinds = new Map(); const nodeMatchKinds = new Map();
  const routeList = Array.isArray(routes) ? routes : [];
  for (const route of routeList) {
    const from = nodeById.get(route.fromNodeId); const to = nodeById.get(route.toNodeId); const commodity = commodityById.get(route.commodityId);
    const text = logisticsNavigationNormalize([route.id, from?.label, to?.label, commodity?.name, route.commodityId].filter(Boolean).join(' '));
    const queryMatch = !normalizedQuery || text.includes(normalizedQuery);
    const statusMatch = !activeStatuses.size || activeStatuses.has(String(route.status || 'open'));
    const commodityMatch = !commodityId || commodityId === 'all' || route.commodityId === commodityId;
    const selected = selection?.type === 'route' && selection.id === route.id;
    routeMatchKinds.set(route.id, selected || (queryMatch && statusMatch && commodityMatch) ? 'primary' : 'unrelated');
  }
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const text = logisticsNavigationNormalize([node.id, node.label, node.regionId].filter(Boolean).join(' '));
    const selected = selection?.type === 'node' && selection.id === node.id;
    const incident = routeList.some((route) => (route.fromNodeId === node.id || route.toNodeId === node.id) && routeMatchKinds.get(route.id) === 'primary');
    const ownQueryMatch = Boolean(normalizedQuery) && text.includes(normalizedQuery);
    nodeMatchKinds.set(node.id, selected || !active || ownQueryMatch || incident ? 'primary' : 'unrelated');
  }
  return { active, query: normalizedQuery, routeMatchKinds, nodeMatchKinds, matchCount: [...routeMatchKinds.values()].filter((value) => value === 'primary').length };
}
