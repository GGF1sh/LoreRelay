// LOGISTICS-GRAPH-CANVAS-SLICE2 - pure deterministic regional layout.
// This module deliberately has no DOM, storage, clock, or random dependency.

const LOGISTICS_LAYOUT_ALGO = 'region-hybrid-1';
const LOGISTICS_LAYOUT_RANK_GAP_X = 260;
const LOGISTICS_LAYOUT_NODE_GAP_Y = 36;
const LOGISTICS_LAYOUT_REGION_PADDING = 28;
const LOGISTICS_LAYOUT_REGION_GAP = 120;

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
  const nodeById = new Map(uniqueNodes.map((node) => [node.id, node]));
  // Region ordering is topology-only. Flow metrics must never move a graph.
  const interRegionRouteCount = new Map(visibleRegionIds.map((id) => [id, 0]));
  for (const route of safeRoutes) {
    const from = nodeById.get(route.fromNodeId);
    const to = nodeById.get(route.toNodeId);
    const fromRegion = from && from.kind !== 'region' && logisticsLayoutValidRegionId(from.regionId) ? from.regionId : '__unassigned';
    const toRegion = to && to.kind !== 'region' && logisticsLayoutValidRegionId(to.regionId) ? to.regionId : '__unassigned';
    if (fromRegion === toRegion || fromRegion === '__unassigned' || toRegion === '__unassigned') { continue; }
    interRegionRouteCount.set(fromRegion, (interRegionRouteCount.get(fromRegion) || 0) + 1);
    interRegionRouteCount.set(toRegion, (interRegionRouteCount.get(toRegion) || 0) + 1);
  }
  const placementOrder = visibleRegionIds.slice().sort((a, b) => (interRegionRouteCount.get(b) || 0) - (interRegionRouteCount.get(a) || 0)
    || (buckets.get(b)?.length || 0) - (buckets.get(a)?.length || 0) || logisticsLayoutCompareId(a, b));
  const columns = Math.max(1, Math.ceil(Math.sqrt(placementOrder.length)));
  const regionOffset = new Map();
  let cursorX = 0; let cursorY = 0; let rowHeight = 0;
  placementOrder.forEach((id, index) => {
    if (index > 0 && index % columns === 0) { cursorX = 0; cursorY += rowHeight + LOGISTICS_LAYOUT_REGION_GAP; rowHeight = 0; }
    const result = local.get(id);
    const w = result.width + LOGISTICS_LAYOUT_REGION_PADDING * 2;
    const h = result.height + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24;
    regionOffset.set(id, { x: cursorX, y: cursorY });
    cursorX += w + LOGISTICS_LAYOUT_REGION_GAP;
    rowHeight = Math.max(rowHeight, h);
  });
  const unassignedOffset = { x: 0, y: cursorY + rowHeight + LOGISTICS_LAYOUT_REGION_GAP };
  const positions = new Map();
  const manualPositions = options.manualPositions || options.positions || null;
  const droppedManualIds = [];
  const wrongRegionManualIds = [];
  for (const [regionId, result] of local) {
    const offset = regionOffset.get(regionId) || (regionId === '__unassigned' ? unassignedOffset : { x: 0, y: 0 });
    const members = buckets.get(regionId) || [];
    for (const node of members) {
      const value = result.positions.get(node.id);
      const stored = logisticsLayoutManualEntry(manualPositions, node.id);
      const validStored = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)
        && Math.abs(stored.x) <= 50000 && Math.abs(stored.y) <= 50000
        && stored.regionId === regionId;
      if (stored && !validStored) {
        droppedManualIds.push(node.id);
        if (stored.regionId !== regionId) { wrongRegionManualIds.push(node.id); }
      }
      // Region-local storage (space === 'local'): world = pack offset + local.
      // Legacy absolute world entries omit space / use space === 'world'.
      const pad = LOGISTICS_LAYOUT_REGION_PADDING;
      let worldX = value.x + offset.x + pad;
      let worldY = value.y + offset.y + pad;
      if (validStored) {
        if (stored.space === 'local') {
          worldX = stored.x + offset.x;
          worldY = stored.y + offset.y;
        } else {
          worldX = stored.x;
          worldY = stored.y;
        }
      }
      positions.set(node.id, {
        ...value,
        x: worldX,
        y: worldY,
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
  // Pure-layout invariant (independent of the UI drag clamp): a manual node of
  // region A must never occupy another populated region's packed container.
  // Empty space outside A is allowed (region A may later expand into free
  // space); intrusion into B is projected back into A's valid interior.
  // Input manual objects are never mutated — only layout output coordinates.
  const crossRegionManualIds = [];
  function logisticsLayoutNodeIntersectsRegion(pos, region) {
    if (!pos || !region) { return false; }
    const left = pos.x - pos.w / 2;
    const right = pos.x + pos.w / 2;
    const top = pos.y - pos.h / 2;
    const bottom = pos.y + pos.h / 2;
    return right > region.x && left < region.x + region.w
      && bottom > region.y && top < region.y + region.h;
  }
  function logisticsLayoutClampManualToRegionInterior(pos, region) {
    const pad = LOGISTICS_LAYOUT_REGION_PADDING;
    const title = 24;
    const halfW = (Number.isFinite(pos.w) ? pos.w : 152) / 2;
    const halfH = (Number.isFinite(pos.h) ? pos.h : 60) / 2;
    const minX = region.x + pad + halfW;
    const maxX = region.x + region.w - pad - halfW;
    const minY = region.y + pad + title + halfH;
    const maxY = region.y + region.h - pad - halfH;
    pos.x = minX <= maxX
      ? Math.min(maxX, Math.max(minX, pos.x))
      : region.x + region.w / 2;
    pos.y = minY <= maxY
      ? Math.min(maxY, Math.max(minY, pos.y))
      : region.y + region.h / 2;
  }
  // Deterministic order: id ascending. Only populated-region manuals are checked
  // against other populated packed boxes (__unassigned is not a container).
  for (const id of [...positions.keys()].sort(logisticsLayoutCompareId)) {
    const pos = positions.get(id);
    if (!pos || !pos.manual || pos.regionId === '__unassigned') { continue; }
    const own = regions.get(pos.regionId);
    if (!own) { continue; }
    let crosses = false;
    for (const [otherId, other] of regions) {
      if (otherId === pos.regionId) { continue; }
      if (logisticsLayoutNodeIntersectsRegion(pos, other)) {
        crosses = true;
        break;
      }
    }
    if (!crosses) { continue; }
    crossRegionManualIds.push(id);
    logisticsLayoutClampManualToRegionInterior(pos, own);
  }
  // Manual nodes are fixed obstacles: place them at (corrected) coordinates
  // first, never mutate them during collision resolution. Collision is strictly
  // region-local so a drag in region A cannot displace region B members.
  const manuals = [...positions.entries()].filter(([, pos]) => pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  const automatics = [...positions.entries()].filter(([, pos]) => !pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }
  function sameRegion(a, b) {
    return a.regionId === b.regionId;
  }
  const finalized = [];
  const overflowPlacedIds = [];
  const unresolvedOverlapIds = [];
  // 1) Place every valid manual node exactly; overlapping manuals keep both
  // stored coordinates and surface an honest diagnostic (no silent move).
  for (const [id, manual] of manuals) {
    if (finalized.some((other) => sameRegion(manual, other) && overlaps(manual, other))) {
      unresolvedOverlapIds.push(id);
    }
    finalized.push(manual);
  }
  // 2–3) Resolve automatic nodes around the fixed-obstacle set, per region only.
  for (const [id, automatic] of automatics) {
    const startX = automatic.x;
    const startY = automatic.y;
    let clear = !finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other));
    if (!clear) {
      for (let attempt = 0; attempt < 8; attempt++) {
        automatic.y += LOGISTICS_LAYOUT_NODE_GAP_Y;
        if (!finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other))) {
          clear = true;
          break;
        }
      }
    }
    if (!clear) {
      // Bounded overflow lane inside this region only.
      automatic.x = startX;
      automatic.y = startY;
      for (let lane = 1; lane <= 8 && !clear; lane++) {
        automatic.x = startX + lane * (automatic.w + LOGISTICS_LAYOUT_NODE_GAP_Y);
        automatic.y = startY;
        if (!finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other))) {
          clear = true;
        }
      }
      if (clear) {
        overflowPlacedIds.push(id);
      } else {
        // Exhausted bounded attempts: restore start pose, keep deterministic
        // output, and report unresolved overlap honestly (do not claim success).
        automatic.x = startX;
        automatic.y = startY;
        unresolvedOverlapIds.push(id);
      }
    }
    finalized.push(automatic);
  }
  // Final containers are derived from final member boxes (including manuals).
  // Expansion may grow a region to contain its members, but region packing
  // offsets of unrelated regions are never recomputed — only this region's
  // measured box changes — so other regions remain byte-identical.
  for (const [regionId, region] of regions) {
    const members = region.memberIds.map((id) => positions.get(id)).filter(Boolean);
    if (!members.length) { continue; }
    const minX = Math.min(...members.map((pos) => pos.x - pos.w / 2));
    const minY = Math.min(...members.map((pos) => pos.y - pos.h / 2));
    const maxX = Math.max(...members.map((pos) => pos.x + pos.w / 2));
    const maxY = Math.max(...members.map((pos) => pos.y + pos.h / 2));
    region.x = minX - LOGISTICS_LAYOUT_REGION_PADDING;
    region.y = minY - LOGISTICS_LAYOUT_REGION_PADDING - 24;
    region.w = maxX - minX + LOGISTICS_LAYOUT_REGION_PADDING * 2;
    region.h = maxY - minY + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24;
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
    diagnostics: {
      sweeps: 4,
      droppedManualIds: droppedManualIds.sort(logisticsLayoutCompareId),
      wrongRegionManualIds: wrongRegionManualIds.sort(logisticsLayoutCompareId),
      // Manuals whose stored world/local position intersected another populated
      // region's packed container and were projected back into the owner interior.
      // Distinct from wrongRegionManualIds (stored.regionId mismatch / dropped).
      crossRegionManualIds: crossRegionManualIds.sort(logisticsLayoutCompareId),
      overflowPlacedIds: overflowPlacedIds.sort(logisticsLayoutCompareId),
      // Honest residual overlaps after bounded Y/lane attempts (manual-manual
      // or automatic exhaustion). Prefer reporting over silently moving manuals.
      unresolvedOverlapIds: unresolvedOverlapIds.sort(logisticsLayoutCompareId),
      cycleBreaks: [...local.values()].flatMap((item) => item.droppedRouteIds).sort(logisticsLayoutCompareId),
    },
  };
}
