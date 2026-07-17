// LOGISTICS-GRAPH-CANVAS-SLICE2 - pure deterministic regional layout.
// This module deliberately has no DOM, storage, clock, or random dependency.

const LOGISTICS_LAYOUT_ALGO = 'region-hybrid-1';
const LOGISTICS_LAYOUT_RANK_GAP_X = 260;
const LOGISTICS_LAYOUT_NODE_GAP_Y = 36;
const LOGISTICS_LAYOUT_REGION_PADDING = 28;
const LOGISTICS_LAYOUT_REGION_GAP = 120;
// A fixed pitch is intentional: growth inside region A must not move region B.
const LOGISTICS_LAYOUT_REGION_GRID_PITCH_X = 2400;
const LOGISTICS_LAYOUT_REGION_GRID_PITCH_Y = 1800;

function logisticsLayoutCompareId(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsLayoutFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function logisticsLayoutNodeSize(node, routes) {
  const degree = routes.reduce((total, route) => total + (route.fromNodeId === node.id || route.toNodeId === node.id ? 1 : 0), 0);
  const tier = node.scale === 'major' || degree >= 4 ? 'major' : (node.scale === 'minor' || degree === 1 ? 'minor' : 'standard');
  return tier === 'major'
    ? { w: 184, h: 72, tier }
    : tier === 'minor'
      ? { w: 112, h: 44, tier }
      : { w: 152, h: 60, tier };
}

function logisticsLayoutValidRegionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value !== '__unassigned';
}

function logisticsLayoutManualEntry(manualPositions, id) {
  if (!manualPositions) { return null; }
  if (manualPositions instanceof Map) { return manualPositions.get(id) || null; }
  return manualPositions[id] || null;
}

function logisticsLayoutCanReach(adjacency, from, target) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (id === target) { return true; }
    if (seen.has(id)) { continue; }
    seen.add(id);
    const next = adjacency.get(id) || [];
    for (let i = next.length - 1; i >= 0; i--) { stack.push(next[i]); }
  }
  return false;
}

function logisticsLayoutRegionLocal(memberNodes, routes) {
  const ids = memberNodes.map((node) => node.id).sort(logisticsLayoutCompareId);
  const byId = new Map(memberNodes.map((node) => [node.id, node]));
  const nodeIds = new Set(ids);
  const edges = routes
    .filter((route) => nodeIds.has(route.fromNodeId) && nodeIds.has(route.toNodeId) && route.fromNodeId !== route.toNodeId)
    .slice()
    .sort((a, b) => logisticsLayoutCompareId(a.fromNodeId, b.fromNodeId)
      || logisticsLayoutCompareId(a.toNodeId, b.toNodeId)
      || logisticsLayoutCompareId(a.id, b.id));
  const adjacency = new Map(ids.map((id) => [id, []]));
  const dag = [];
  const droppedRouteIds = [];
  for (const edge of edges) {
    if (logisticsLayoutCanReach(adjacency, edge.toNodeId, edge.fromNodeId)) {
      droppedRouteIds.push(edge.id);
      continue;
    }
    adjacency.get(edge.fromNodeId).push(edge.toNodeId);
    dag.push(edge);
  }
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of dag) { indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) || 0) + 1); }
  const ready = ids.filter((id) => indegree.get(id) === 0).sort(logisticsLayoutCompareId);
  const topo = [];
  while (ready.length) {
    const id = ready.shift();
    topo.push(id);
    for (const next of (adjacency.get(id) || []).slice().sort(logisticsLayoutCompareId)) {
      const value = (indegree.get(next) || 0) - 1;
      indegree.set(next, value);
      if (value === 0) {
        ready.push(next);
        ready.sort(logisticsLayoutCompareId);
      }
    }
  }
  const rank = new Map(ids.map((id) => [id, 0]));
  for (const id of topo) {
    for (const next of adjacency.get(id) || []) {
      rank.set(next, Math.max(rank.get(next) || 0, (rank.get(id) || 0) + 1));
    }
  }
  const ranks = new Map();
  for (const id of ids) {
    const key = rank.get(id) || 0;
    if (!ranks.has(key)) { ranks.set(key, []); }
    ranks.get(key).push(id);
  }
  [...ranks.values()].forEach((list) => list.sort(logisticsLayoutCompareId));
  const incoming = new Map(ids.map((id) => [id, []]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const edge of dag) {
    incoming.get(edge.toNodeId).push(edge.fromNodeId);
    outgoing.get(edge.fromNodeId).push(edge.toNodeId);
  }
  const orderedRanks = [...ranks.keys()].sort((a, b) => a - b);
  const order = new Map();
  function refreshOrder() {
    for (const r of orderedRanks) { (ranks.get(r) || []).forEach((id, index) => order.set(id, index)); }
  }
  function sweep(direction) {
    refreshOrder();
    const targetRanks = direction === 'down' ? orderedRanks : orderedRanks.slice().reverse();
    for (const r of targetRanks) {
      const list = ranks.get(r) || [];
      list.sort((a, b) => {
        const aNeighbors = (direction === 'down' ? incoming.get(a) : outgoing.get(a)) || [];
        const bNeighbors = (direction === 'down' ? incoming.get(b) : outgoing.get(b)) || [];
        const aValues = aNeighbors.filter((id) => (rank.get(id) || 0) !== r).map((id) => order.get(id));
        const bValues = bNeighbors.filter((id) => (rank.get(id) || 0) !== r).map((id) => order.get(id));
        const aBary = aValues.length ? aValues.reduce((sum, value) => sum + value, 0) / aValues.length : order.get(a);
        const bBary = bValues.length ? bValues.reduce((sum, value) => sum + value, 0) / bValues.length : order.get(b);
        return aBary - bBary || logisticsLayoutCompareId(a, b);
      });
      refreshOrder();
    }
  }
  // Exactly four fixed sweeps: no convergence check, no early exit.
  sweep('down'); sweep('up'); sweep('down'); sweep('up');
  const size = new Map(ids.map((id) => [id, logisticsLayoutNodeSize(byId.get(id), routes)]));
  let maxStack = 0;
  const stackHeights = new Map();
  for (const r of orderedRanks) {
    const list = ranks.get(r) || [];
    const height = list.reduce((sum, id, index) => sum + size.get(id).h + (index ? LOGISTICS_LAYOUT_NODE_GAP_Y : 0), 0);
    stackHeights.set(r, height);
    maxStack = Math.max(maxStack, height);
  }
  const positions = new Map();
  for (const r of orderedRanks) {
    const list = ranks.get(r) || [];
    let y = (maxStack - (stackHeights.get(r) || 0)) / 2;
    for (const id of list) {
      const box = size.get(id);
      positions.set(id, { x: r * LOGISTICS_LAYOUT_RANK_GAP_X + box.w / 2, y: y + box.h / 2, ...box, rank: r, manual: false });
      y += box.h + LOGISTICS_LAYOUT_NODE_GAP_Y;
    }
  }
  const maxRank = orderedRanks.length ? Math.max(...orderedRanks) : 0;
  return {
    positions,
    width: maxRank * LOGISTICS_LAYOUT_RANK_GAP_X + Math.max(...ids.map((id) => size.get(id).w), 0),
    height: maxStack,
    droppedRouteIds,
    sweeps: 4,
  };
}

function computeLogisticsLayout(nodes, routes, options = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes.filter((node) => node && typeof node.id === 'string' && node.id) : [];
  const safeRoutes = Array.isArray(routes) ? routes.filter((route) => route && typeof route.fromNodeId === 'string' && typeof route.toNodeId === 'string') : [];
  const ids = new Set();
  const uniqueNodes = safeNodes.filter((node) => !ids.has(node.id) && ids.add(node.id)).slice().sort((a, b) => logisticsLayoutCompareId(a.id, b.id));
  const populatedRegionIds = new Set(uniqueNodes.filter((node) => node.kind !== 'region' && logisticsLayoutValidRegionId(node.regionId)).map((node) => node.regionId));
  const regionIdentity = new Map();
  for (const node of uniqueNodes) {
    if (node.kind === 'region' && populatedRegionIds.has(node.id) && !regionIdentity.has(node.id)) {
      regionIdentity.set(node.id, node);
    }
  }
  const buckets = new Map([...populatedRegionIds].sort(logisticsLayoutCompareId).map((id) => [id, []]));
  buckets.set('__unassigned', []);
  for (const node of uniqueNodes) {
    if (node.kind === 'region' && regionIdentity.get(node.id) === node) { continue; }
    const regionId = node.kind !== 'region' && logisticsLayoutValidRegionId(node.regionId) ? node.regionId : '__unassigned';
    buckets.get(regionId).push(node);
  }
  const regions = new Map();
  const local = new Map();
  for (const [regionId, members] of [...buckets.entries()].sort((a, b) => logisticsLayoutCompareId(a[0], b[0]))) {
    if (!members.length) { continue; }
    local.set(regionId, logisticsLayoutRegionLocal(members, safeRoutes));
  }
  const visibleRegionIds = [...local.keys()].filter((id) => id !== '__unassigned').sort(logisticsLayoutCompareId);
  const pairWeights = new Map();
  for (const route of safeRoutes) {
    const from = uniqueNodes.find((node) => node.id === route.fromNodeId);
    const to = uniqueNodes.find((node) => node.id === route.toNodeId);
    const fromRegion = from && from.kind !== 'region' && logisticsLayoutValidRegionId(from.regionId) ? from.regionId : '__unassigned';
    const toRegion = to && to.kind !== 'region' && logisticsLayoutValidRegionId(to.regionId) ? to.regionId : '__unassigned';
    if (fromRegion === toRegion || fromRegion === '__unassigned' || toRegion === '__unassigned') { continue; }
    const key = `${fromRegion}\u0000${toRegion}`;
    const value = Math.max(0, logisticsLayoutFinite(route.volume, 0));
    const capacity = Math.max(0, logisticsLayoutFinite(route.effectiveCapacity, logisticsLayoutFinite(route.capacity, 0)));
    const old = pairWeights.get(key) || { volume: 0, capacity: 0 };
    old.volume += value; old.capacity += capacity; pairWeights.set(key, old);
  }
  const allVolumesZero = [...pairWeights.values()].every((entry) => entry.volume === 0);
  const totalWeight = new Map(visibleRegionIds.map((id) => [id, 0]));
  for (const [key, value] of pairWeights) {
    const [from, to] = key.split('\u0000');
    const weight = allVolumesZero ? value.capacity : value.volume;
    totalWeight.set(from, (totalWeight.get(from) || 0) + weight);
    totalWeight.set(to, (totalWeight.get(to) || 0) + weight);
  }
  const placementOrder = visibleRegionIds.slice().sort((a, b) => (totalWeight.get(b) || 0) - (totalWeight.get(a) || 0) || logisticsLayoutCompareId(a, b));
  const columns = Math.max(1, Math.ceil(Math.sqrt(placementOrder.length)));
  const regionOffset = new Map();
  placementOrder.forEach((id, index) => regionOffset.set(id, {
    x: (index % columns) * (LOGISTICS_LAYOUT_REGION_GRID_PITCH_X + LOGISTICS_LAYOUT_REGION_GAP),
    y: Math.floor(index / columns) * (LOGISTICS_LAYOUT_REGION_GRID_PITCH_Y + LOGISTICS_LAYOUT_REGION_GAP),
  }));
  const positions = new Map();
  const manualPositions = options.manualPositions || options.positions || null;
  const droppedManualIds = [];
  for (const [regionId, result] of local) {
    const offset = regionOffset.get(regionId) || (regionId === '__unassigned'
      ? { x: 0, y: Math.max(1, Math.ceil(placementOrder.length / columns)) * (LOGISTICS_LAYOUT_REGION_GRID_PITCH_Y + LOGISTICS_LAYOUT_REGION_GAP) }
      : { x: 0, y: 0 });
    const members = buckets.get(regionId) || [];
    for (const node of members) {
      const value = result.positions.get(node.id);
      const stored = logisticsLayoutManualEntry(manualPositions, node.id);
      const validStored = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)
        && Math.abs(stored.x) <= 50000 && Math.abs(stored.y) <= 50000
        && stored.regionId === regionId;
      if (stored && !validStored) { droppedManualIds.push(node.id); }
      positions.set(node.id, {
        ...value,
        x: validStored ? stored.x : value.x + offset.x + (regionId === '__unassigned' ? LOGISTICS_LAYOUT_REGION_PADDING : LOGISTICS_LAYOUT_REGION_PADDING),
        y: validStored ? stored.y : value.y + offset.y + LOGISTICS_LAYOUT_REGION_PADDING,
        regionId,
        manual: Boolean(validStored),
      });
    }
    if (regionId !== '__unassigned') {
      const identity = regionIdentity.get(regionId);
      regions.set(regionId, {
        x: offset.x,
        y: offset.y,
        w: result.width + LOGISTICS_LAYOUT_REGION_PADDING * 2,
        h: result.height + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24,
        label: identity?.label || regionId,
        memberIds: members.map((node) => node.id).sort(logisticsLayoutCompareId),
        collapsed: Boolean(options.collapsedRegionIds && (options.collapsedRegionIds instanceof Set ? options.collapsedRegionIds.has(regionId) : options.collapsedRegionIds.includes(regionId))),
      });
    }
  }
  const manuals = [...positions.entries()].filter(([, pos]) => pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  const automatics = [...positions.entries()].filter(([, pos]) => !pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }
  for (const [, automatic] of automatics) {
    for (let attempt = 0; attempt < 8 && manuals.some(([, manual]) => overlaps(automatic, manual)); attempt++) {
      automatic.y += LOGISTICS_LAYOUT_NODE_GAP_Y;
    }
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x - pos.w / 2); minY = Math.min(minY, pos.y - pos.h / 2);
    maxX = Math.max(maxX, pos.x + pos.w / 2); maxY = Math.max(maxY, pos.y + pos.h / 2);
  }
  for (const region of regions.values()) {
    minX = Math.min(minX, region.x); minY = Math.min(minY, region.y);
    maxX = Math.max(maxX, region.x + region.w); maxY = Math.max(maxY, region.y + region.h);
  }
  return {
    nodes: positions,
    // Compatibility alias for the existing camera helper; both references are
    // the same read-only-by-convention Map.
    positions,
    regions,
    bounds: positions.size || regions.size ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    algo: LOGISTICS_LAYOUT_ALGO,
    diagnostics: { sweeps: 4, droppedManualIds: droppedManualIds.sort(logisticsLayoutCompareId), cycleBreaks: [...local.values()].flatMap((item) => item.droppedRouteIds).sort(logisticsLayoutCompareId) },
  };
}
