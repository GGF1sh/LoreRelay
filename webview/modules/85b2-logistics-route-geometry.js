// LOGISTICS-GRAPH-CANVAS-SLICE3 - pure, deterministic, obstacle-aware route
// geometry. See docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md SS6.
//
// This module has no DOM, no localStorage, no camera state, no clock, and no
// randomness. It never mutates its inputs. Everything a consumer needs
// (visible stroke, hit path, arrowhead orientation, particle <mpath> target,
// label anchor, warning anchor, bounds) comes from the one geometry object
// this module returns per route.
//
// Bounded candidate policy: direct/lane, above/below/left/right of the union
// envelope of direct blockers, one deterministic graph-envelope outer
// corridor, then a finite honestly-conflicted fallback. Every candidate is
// checked against every unrelated inflated node box.
//   - Path bounds are the convex hull of {start, c1, c2, end} per segment,
//     which contains a cubic Bezier exactly (hull property) rather than a
//     bound derived only from sampled points.
//   - Label/route collapse-control avoidance is scoped to node boxes and
//     already-placed labels; region-collapse-control boxes are not threaded
//     into this pure module in this slice (their bounds live in the DOM
//     render step), so that specific avoidance is a no-op here.

const LOGISTICS_GEOM_LANE_GAP = 14;
const LOGISTICS_GEOM_OBSTACLE_INFLATE = 14;
const LOGISTICS_GEOM_DETOUR_STEP = 28;
const LOGISTICS_GEOM_SAMPLE_COUNT = 24;
const LOGISTICS_GEOM_LABEL_MIN_GAP = 44;
const LOGISTICS_GEOM_LABEL_NODE_GAP = 12;
const LOGISTICS_GEOM_LABEL_CANDIDATES = [0.5, 0.35, 0.65, 0.28, 0.72, 0.2, 0.8];
const LOGISTICS_GEOM_ENVELOPE_CLEARANCE = 28;
const LOGISTICS_GEOM_PAIR_SEPARATOR = '\u001f';

function logisticsGeomCompareId(a, b) {
  const aa = String(a == null ? '' : a);
  const bb = String(b == null ? '' : b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsGeomFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function logisticsGeomFiniteBox(box) {
  return Boolean(box)
    && Number.isFinite(box.x) && Number.isFinite(box.y)
    && Number.isFinite(box.w) && Number.isFinite(box.h)
    && box.w > 0 && box.h > 0;
}

/** 12 deterministic ports on a node's boundary: 3 per side at 25/50/75%. */
function logisticsGeomTwelvePorts(box) {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const offsetsW = [-0.25 * box.w, 0, 0.25 * box.w];
  const offsetsH = [-0.25 * box.h, 0, 0.25 * box.h];
  const ports = [];
  offsetsW.forEach((off, i) => ports.push({ side: 'top', slot: i, x: box.x + off, y: box.y - halfH }));
  offsetsH.forEach((off, i) => ports.push({ side: 'right', slot: i, x: box.x + halfW, y: box.y + off }));
  offsetsW.forEach((off, i) => ports.push({ side: 'bottom', slot: i, x: box.x + off, y: box.y + halfH }));
  offsetsH.forEach((off, i) => ports.push({ side: 'left', slot: i, x: box.x - halfW, y: box.y + off }));
  return ports;
}

/** Which side of `box` the ray from its centre toward (otherX, otherY) exits through. */
function logisticsGeomExitSide(box, otherX, otherY) {
  const dx = otherX - box.x;
  const dy = otherY - box.y;
  if (dx === 0 && dy === 0) { return 'right'; }
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  if (tx <= ty) { return dx >= 0 ? 'right' : 'left'; }
  return dy >= 0 ? 'bottom' : 'top';
}

function logisticsGeomPortsBySide(box) {
  const bySide = new Map([['top', []], ['right', []], ['bottom', []], ['left', []]]);
  for (const port of logisticsGeomTwelvePorts(box)) { bySide.get(port.side).push(port); }
  for (const list of bySide.values()) { list.sort((a, b) => a.slot - b.slot); }
  return bySide;
}

/**
 * Deterministic port assignment for every route endpoint.
 * Returns Map<nodeId, Map<routeId, {port, exitPort}>> keyed by which end
 * (source/target) the route touches that node from.
 */
function logisticsGeomAssignPorts(routes, positions) {
  // exits[nodeId][side] = [{routeId, end, angle}]
  const exits = new Map();
  function pushExit(nodeId, side, entry) {
    if (!exits.has(nodeId)) { exits.set(nodeId, new Map()); }
    const bySide = exits.get(nodeId);
    if (!bySide.has(side)) { bySide.set(side, []); }
    bySide.get(side).push(entry);
  }
  const sideChoice = new Map(); // `${routeId}:${end}` -> side
  for (const route of routes) {
    const fromBox = positions.get(route.fromNodeId);
    const toBox = positions.get(route.toNodeId);
    if (!logisticsGeomFiniteBox(fromBox) || !logisticsGeomFiniteBox(toBox)) { continue; }
    const fromSide = logisticsGeomExitSide(fromBox, toBox.x, toBox.y);
    const toSide = logisticsGeomExitSide(toBox, fromBox.x, fromBox.y);
    sideChoice.set(`${route.id}:from`, fromSide);
    sideChoice.set(`${route.id}:to`, toSide);
    const angleFrom = Math.atan2(toBox.y - fromBox.y, toBox.x - fromBox.x);
    const angleTo = Math.atan2(fromBox.y - toBox.y, fromBox.x - toBox.x);
    pushExit(route.fromNodeId, fromSide, { routeId: route.id, end: 'from', angle: angleFrom, dirRank: 0 });
    pushExit(route.toNodeId, toSide, { routeId: route.id, end: 'to', angle: angleTo, dirRank: 1 });
  }
  const slotOf = new Map(); // `${nodeId}:${side}:${routeId}:${end}` -> slot index (0..2)
  for (const [nodeId, bySide] of exits) {
    for (const [side, list] of bySide) {
      const ordered = list.slice().sort((a, b) => (a.angle - b.angle) || (a.dirRank - b.dirRank) || logisticsGeomCompareId(a.routeId, b.routeId));
      ordered.forEach((entry, index) => {
        slotOf.set(`${nodeId}:${side}:${entry.routeId}:${entry.end}`, index % 3);
      });
    }
  }
  const portTableCache = new Map();
  function portsForBox(nodeId, box) {
    if (!portTableCache.has(nodeId)) { portTableCache.set(nodeId, logisticsGeomPortsBySide(box)); }
    return portTableCache.get(nodeId);
  }
  const result = new Map(); // routeId -> { sourcePort, targetPort }
  for (const route of routes) {
    const fromBox = positions.get(route.fromNodeId);
    const toBox = positions.get(route.toNodeId);
    if (!logisticsGeomFiniteBox(fromBox) || !logisticsGeomFiniteBox(toBox)) { continue; }
    const fromSide = sideChoice.get(`${route.id}:from`);
    const toSide = sideChoice.get(`${route.id}:to`);
    const fromSlot = slotOf.get(`${route.fromNodeId}:${fromSide}:${route.id}:from`) || 0;
    const toSlot = slotOf.get(`${route.toNodeId}:${toSide}:${route.id}:to`) || 0;
    const fromPorts = portsForBox(route.fromNodeId, fromBox).get(fromSide);
    const toPorts = portsForBox(route.toNodeId, toBox).get(toSide);
    result.set(route.id, {
      sourcePort: { ...fromPorts[fromSlot], nodeId: route.fromNodeId },
      targetPort: { ...toPorts[toSlot], nodeId: route.toNodeId },
    });
  }
  return result;
}

/** Deterministic centred lane index per unordered node pair, forward before reverse. */
function logisticsGeomAssignLanes(routes) {
  const groups = new Map(); // pairKey -> [{routeId, dirRank}]
  for (const route of routes) {
    const ids = [route.fromNodeId, route.toNodeId].sort(logisticsGeomCompareId);
    const pairKey = ids.join('\u001f');
    const dirRank = route.fromNodeId === ids[0] ? 0 : 1;
    if (!groups.has(pairKey)) { groups.set(pairKey, []); }
    groups.get(pairKey).push({ routeId: route.id, dirRank });
  }
  const laneOf = new Map();
  for (const list of groups.values()) {
    const ordered = list.slice().sort((a, b) => (a.dirRank - b.dirRank) || logisticsGeomCompareId(a.routeId, b.routeId));
    const n = ordered.length;
    ordered.forEach((entry, index) => {
      laneOf.set(entry.routeId, index - (n - 1) / 2);
    });
  }
  return laneOf;
}

/** Stable topology-only metadata reused by full renders and pointer moves. */
function buildLogisticsRouteTopologyIndex(routes) {
  const routesById = new Map();
  for (const route of Array.isArray(routes) ? routes : []) {
    if (!route || typeof route.id !== 'string' || typeof route.fromNodeId !== 'string' || typeof route.toNodeId !== 'string'
      || route.fromNodeId === route.toNodeId || routesById.has(route.id)) { continue; }
    routesById.set(route.id, { id: route.id, fromNodeId: route.fromNodeId, toNodeId: route.toNodeId });
  }
  const sortedRouteIds = [...routesById.keys()].sort(logisticsGeomCompareId);
  const byNodeId = new Map();
  const byUnorderedEndpointPair = new Map();
  const pairKeyByRouteId = new Map();
  for (const routeId of sortedRouteIds) {
    const route = routesById.get(routeId);
    for (const nodeId of [route.fromNodeId, route.toNodeId]) {
      if (!byNodeId.has(nodeId)) { byNodeId.set(nodeId, []); }
      byNodeId.get(nodeId).push(routeId);
    }
    const endpoints = [route.fromNodeId, route.toNodeId].sort(logisticsGeomCompareId);
    const pairKey = endpoints.join(LOGISTICS_GEOM_PAIR_SEPARATOR);
    pairKeyByRouteId.set(routeId, pairKey);
    if (!byUnorderedEndpointPair.has(pairKey)) { byUnorderedEndpointPair.set(pairKey, []); }
    byUnorderedEndpointPair.get(pairKey).push(routeId);
  }
  for (const ids of byNodeId.values()) { ids.sort(logisticsGeomCompareId); }
  const laneAllocationMetadata = new Map();
  for (const [pairKey, ids] of byUnorderedEndpointPair) {
    const endpoints = pairKey.split(LOGISTICS_GEOM_PAIR_SEPARATOR);
    ids.sort((a, b) => {
      const routeA = routesById.get(a); const routeB = routesById.get(b);
      const dirA = routeA.fromNodeId === endpoints[0] ? 0 : 1;
      const dirB = routeB.fromNodeId === endpoints[0] ? 0 : 1;
      return dirA - dirB || logisticsGeomCompareId(a, b);
    });
    ids.forEach((routeId, rank) => laneAllocationMetadata.set(routeId, {
      pairKey, rank, count: ids.length, laneIndex: rank - (ids.length - 1) / 2,
    }));
  }
  return {
    routesById,
    byNodeId,
    byUnorderedEndpointPair,
    pairKeyByRouteId,
    sortedRouteIds,
    portAllocationMetadata: byNodeId,
    laneAllocationMetadata,
  };
}

/** Routes whose factual source or destination is `nodeId`.
 *
 * A live drag is deliberately endpoint-bounded: port assignment still orders
 * each endpoint against the stable global topology, but no route without the
 * moved node as an endpoint is recomputed or has its DOM/particles touched. */
function logisticsAffectedRouteIdsForNode(nodeId, topologyIndex) {
  return [...(topologyIndex?.byNodeId?.get(nodeId) || [])].sort(logisticsGeomCompareId);
}

/** Assign ports only for requested routes, while ordering each endpoint against
 * every incident route from the stable global topology index. */
function logisticsGeomAssignPortsForRouteIds(topologyIndex, positions, routeIds) {
  const requested = new Set(routeIds);
  const relevantNodes = new Set();
  for (const routeId of routeIds) {
    const route = topologyIndex.routesById.get(routeId);
    if (route) { relevantNodes.add(route.fromNodeId); relevantNodes.add(route.toNodeId); }
  }
  const endpointPorts = new Map();
  for (const nodeId of [...relevantNodes].sort(logisticsGeomCompareId)) {
    const nodeBox = positions.get(nodeId);
    if (!logisticsGeomFiniteBox(nodeBox)) { continue; }
    const bySide = new Map([['top', []], ['right', []], ['bottom', []], ['left', []]]);
    for (const routeId of topologyIndex.byNodeId.get(nodeId) || []) {
      const route = topologyIndex.routesById.get(routeId);
      const end = route.fromNodeId === nodeId ? 'from' : 'to';
      const otherId = end === 'from' ? route.toNodeId : route.fromNodeId;
      const otherBox = positions.get(otherId);
      if (!logisticsGeomFiniteBox(otherBox)) { continue; }
      const side = logisticsGeomExitSide(nodeBox, otherBox.x, otherBox.y);
      bySide.get(side).push({
        routeId, end, side,
        angle: Math.atan2(otherBox.y - nodeBox.y, otherBox.x - nodeBox.x),
        dirRank: end === 'from' ? 0 : 1,
      });
    }
    const portsBySide = logisticsGeomPortsBySide(nodeBox);
    for (const [side, entries] of bySide) {
      entries.sort((a, b) => a.angle - b.angle || a.dirRank - b.dirRank || logisticsGeomCompareId(a.routeId, b.routeId));
      entries.forEach((entry, index) => {
        if (!requested.has(entry.routeId)) { return; }
        const slot = index % 3;
        endpointPorts.set(`${entry.routeId}:${entry.end}`, { ...portsBySide.get(side)[slot], nodeId });
      });
    }
  }
  const result = new Map();
  for (const routeId of routeIds) {
    const sourcePort = endpointPorts.get(`${routeId}:from`);
    const targetPort = endpointPorts.get(`${routeId}:to`);
    if (sourcePort && targetPort) { result.set(routeId, { sourcePort, targetPort }); }
  }
  return result;
}

function logisticsGeomPerpendicularUnit(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  // Rotate the direction vector 90 degrees.
  return { x: -dy / len, y: dx / len };
}

function logisticsGeomCubicPoint(start, c1, c2, end, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
  };
}

function logisticsGeomCubicTangent(start, c1, c2, end, t) {
  const u = 1 - t;
  const dx = 3 * u ** 2 * (c1.x - start.x) + 6 * u * t * (c2.x - c1.x) + 3 * t ** 2 * (end.x - c2.x);
  const dy = 3 * u ** 2 * (c1.y - start.y) + 6 * u * t * (c2.y - c1.y) + 3 * t ** 2 * (end.y - c2.y);
  return Math.atan2(dy, dx);
}

function logisticsGeomSampleCubic(start, c1, c2, end, count) {
  const points = [];
  for (let i = 0; i <= count; i++) { points.push(logisticsGeomCubicPoint(start, c1, c2, end, i / count)); }
  return points;
}

function logisticsGeomPointInBox(point, box) {
  return point.x >= box.x - box.w / 2 && point.x <= box.x + box.w / 2
    && point.y >= box.y - box.h / 2 && point.y <= box.y + box.h / 2;
}

function logisticsGeomInflatedObstacles(positions, excludeIds, inflate) {
  const obstacles = [];
  for (const [id, box] of positions) {
    if (excludeIds.has(id) || !logisticsGeomFiniteBox(box)) { continue; }
    obstacles.push({ id, x: box.x, y: box.y, w: box.w + inflate * 2, h: box.h + inflate * 2 });
  }
  return obstacles.sort((a, b) => logisticsGeomCompareId(a.id, b.id));
}

function logisticsGeomFirstCollision(points, obstacles) {
  for (const obstacle of obstacles) {
    for (const point of points) {
      if (logisticsGeomPointInBox(point, obstacle)) { return obstacle; }
    }
  }
  return null;
}

function logisticsGeomCollisionIdsForSegments(segments, obstacles) {
  const hitIds = [];
  for (const obstacle of obstacles) {
    let hit = false;
    for (const segment of segments) {
      const points = logisticsGeomSampleCubic(segment.start, segment.c1, segment.c2, segment.end, LOGISTICS_GEOM_SAMPLE_COUNT);
      if (points.some((point) => logisticsGeomPointInBox(point, obstacle))) { hit = true; break; }
    }
    if (hit) { hitIds.push(obstacle.id); }
  }
  return hitIds.sort(logisticsGeomCompareId);
}

function logisticsGeomObstacleEnvelope(obstacles) {
  if (!obstacles.length) { return null; }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const obstacle of obstacles) {
    minX = Math.min(minX, obstacle.x - obstacle.w / 2);
    minY = Math.min(minY, obstacle.y - obstacle.h / 2);
    maxX = Math.max(maxX, obstacle.x + obstacle.w / 2);
    maxY = Math.max(maxY, obstacle.y + obstacle.h / 2);
  }
  return { minX, minY, maxX, maxY };
}

function logisticsGeomLinearSegment(start, end) {
  return {
    start,
    c1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    c2: { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 },
    end,
  };
}

function logisticsGeomSegmentsThrough(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].x === points[i].x && points[i - 1].y === points[i].y) { continue; }
    segments.push(logisticsGeomLinearSegment(points[i - 1], points[i]));
  }
  return segments;
}

function logisticsGeomPortStub(port, distance) {
  const delta = port.side === 'top' ? { x: 0, y: -distance }
    : port.side === 'right' ? { x: distance, y: 0 }
      : port.side === 'bottom' ? { x: 0, y: distance }
        : { x: -distance, y: 0 };
  return { x: port.x + delta.x, y: port.y + delta.y };
}

function logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor) {
  const sourceStub = logisticsGeomPortStub(sourcePort, LOGISTICS_GEOM_ENVELOPE_CLEARANCE);
  const targetStub = logisticsGeomPortStub(targetPort, LOGISTICS_GEOM_ENVELOPE_CLEARANCE);
  const middle = side === 'above' || side === 'below'
    ? [{ x: sourceStub.x, y: corridor }, { x: targetStub.x, y: corridor }]
    : [{ x: corridor, y: sourceStub.y }, { x: corridor, y: targetStub.y }];
  return logisticsGeomSegmentsThrough([start, sourceStub, ...middle, targetStub, end]);
}

function logisticsGeomHullBounds(points) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function logisticsGeomMergeBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Builds one cubic segment's d-fragment plus its point/tangent samplers.
 * A "segment" is {start, c1, c2, end}; several are concatenated for a detour.
 */
function logisticsGeomSegmentD(segment, isFirst) {
  const move = isFirst ? `M ${segment.start.x},${segment.start.y} ` : '';
  return `${move}C ${segment.c1.x},${segment.c1.y} ${segment.c2.x},${segment.c2.y} ${segment.end.x},${segment.end.y}`;
}

/** Legacy private helper, not invoked by the public API; production calls
 * logisticsGeomComputeEnvelopeRoute below. */
function logisticsGeomComputeOne(route, sourcePort, targetPort, lane, obstacles) {
  const start = { x: sourcePort.x, y: sourcePort.y };
  const end = { x: targetPort.x, y: targetPort.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const [ux, uy] = [logisticsGeomPerpendicularUnit(start, end).x, logisticsGeomPerpendicularUnit(start, end).y];
  const laneOffset = lane * LOGISTICS_GEOM_LANE_GAP;
  function candidateSegments(extraPush) {
    const push = laneOffset + extraPush;
    const c1 = { x: start.x + dx * 0.36 + ux * push, y: start.y + dy * 0.36 + uy * push };
    const c2 = { x: end.x - dx * 0.36 + ux * push, y: end.y - dy * 0.36 + uy * push };
    return [{ start, c1, c2, end }];
  }
  const obstacleIds = new Set();
  let chosen = null;
  let detourKind = 'direct';
  let conflicted = false;
  // Attempt 0: direct + lane offset. Attempts 1-3: push further perpendicular,
  // away from whichever obstacle was hit, by DETOUR_STEP * attempt.
  let pushSign = 1;
  for (let attempt = 0; attempt <= 3; attempt++) {
    const segments = candidateSegments(attempt === 0 ? 0 : pushSign * LOGISTICS_GEOM_DETOUR_STEP * attempt);
    const points = logisticsGeomSampleCubic(segments[0].start, segments[0].c1, segments[0].c2, segments[0].end, LOGISTICS_GEOM_SAMPLE_COUNT);
    const hit = logisticsGeomFirstCollision(points, obstacles);
    if (!hit) { chosen = segments; detourKind = attempt === 0 ? 'direct' : 'detour'; break; }
    obstacleIds.add(hit.id);
    // Push away from the blocking obstacle's centre on subsequent attempts.
    const cross = (hit.x - start.x) * uy - (hit.y - start.y) * ux;
    pushSign = cross >= 0 ? -1 : 1;
  }
  if (!chosen) {
    // Deterministic 2-segment fallback via the chord midpoint, displaced
    // perpendicular past one deterministic blocking obstacle's bound.
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const blockingObstacleId = [...obstacleIds].sort(logisticsGeomCompareId)[0];
    const blockingObstacle = obstacles.find((o) => o.id === blockingObstacleId) || obstacles[0] || { w: 0, h: 0 };
    const clearance = Math.max(blockingObstacle.w, blockingObstacle.h) / 2 + LOGISTICS_GEOM_DETOUR_STEP;
    const waypoint = { x: mid.x + ux * clearance * pushSign, y: mid.y + uy * clearance * pushSign };
    const seg1 = { start, c1: { x: start.x + (waypoint.x - start.x) * 0.5, y: start.y + (waypoint.y - start.y) * 0.5 }, c2: { x: waypoint.x - (waypoint.x - start.x) * 0.5, y: waypoint.y - (waypoint.y - start.y) * 0.5 }, end: waypoint };
    const seg2 = { start: waypoint, c1: { x: waypoint.x + (end.x - waypoint.x) * 0.5, y: waypoint.y + (end.y - waypoint.y) * 0.5 }, c2: { x: end.x - (end.x - waypoint.x) * 0.5, y: end.y - (end.y - waypoint.y) * 0.5 }, end };
    chosen = [seg1, seg2];
    detourKind = 'fallback';
    const points = [...logisticsGeomSampleCubic(seg1.start, seg1.c1, seg1.c2, seg1.end, LOGISTICS_GEOM_SAMPLE_COUNT), ...logisticsGeomSampleCubic(seg2.start, seg2.c1, seg2.c2, seg2.end, LOGISTICS_GEOM_SAMPLE_COUNT)];
    const stillHit = logisticsGeomFirstCollision(points, obstacles);
    if (stillHit) { obstacleIds.add(stillHit.id); conflicted = true; }
  }
  const pathD = chosen.map((segment, index) => logisticsGeomSegmentD(segment, index === 0)).join(' ');
  let bounds = logisticsGeomHullBounds([chosen[0].start, chosen[0].c1, chosen[0].c2, chosen[0].end]);
  for (let i = 1; i < chosen.length; i++) {
    bounds = logisticsGeomMergeBounds(bounds, logisticsGeomHullBounds([chosen[i].start, chosen[i].c1, chosen[i].c2, chosen[i].end]));
  }
  // pointAt/tangentAt operate on normalized t across the whole (possibly
  // multi-segment) path by mapping t into the owning segment's local t.
  function pointAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    const localT = scaled - index;
    const s = chosen[index];
    return logisticsGeomCubicPoint(s.start, s.c1, s.c2, s.end, localT);
  }
  function tangentAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    const localT = scaled - index;
    const s = chosen[index];
    return logisticsGeomCubicTangent(s.start, s.c1, s.c2, s.end, localT);
  }
  return {
    routeId: route.id,
    fromNodeId: route.fromNodeId,
    toNodeId: route.toNodeId,
    sourcePort,
    targetPort,
    laneIndex: lane,
    laneOffset,
    pathD,
    pathSegments: chosen,
    bounds,
    obstacleIds: [...obstacleIds].sort(logisticsGeomCompareId),
    detourKind,
    conflicted,
    start,
    end,
    d: pathD,
    pointAt,
    tangentAt,
  };
}

/** Bounded obstacle-envelope route. Accepted routes report no obstacle IDs;
 * the finite fallback reports every inflated obstacle actually intersected. */
function logisticsGeomComputeEnvelopeRoute(route, sourcePort, targetPort, laneMetadata, obstacles) {
  const start = { x: sourcePort.x, y: sourcePort.y };
  const end = { x: targetPort.x, y: targetPort.y };
  const dx = end.x - start.x; const dy = end.y - start.y;
  const perpendicular = logisticsGeomPerpendicularUnit(start, end);
  const laneIndex = laneMetadata?.laneIndex || 0;
  const laneOffset = laneIndex * LOGISTICS_GEOM_LANE_GAP;
  const directSegments = [{
    start,
    c1: { x: start.x + dx * 0.36 + perpendicular.x * laneOffset, y: start.y + dy * 0.36 + perpendicular.y * laneOffset },
    c2: { x: end.x - dx * 0.36 + perpendicular.x * laneOffset, y: end.y - dy * 0.36 + perpendicular.y * laneOffset },
    end,
  }];
  const directBlockingIds = logisticsGeomCollisionIdsForSegments(directSegments, obstacles);
  let chosen = directBlockingIds.length ? null : directSegments;
  let detourKind = 'direct';
  const laneRank = laneMetadata?.rank || 0;
  if (!chosen) {
    const blockingObstacles = obstacles.filter((obstacle) => directBlockingIds.includes(obstacle.id));
    const obstacleEnvelope = logisticsGeomObstacleEnvelope(blockingObstacles);
    const gap = LOGISTICS_GEOM_ENVELOPE_CLEARANCE + 1 + laneRank * LOGISTICS_GEOM_LANE_GAP;
    const candidates = [
      ['above', obstacleEnvelope.minY - gap],
      ['below', obstacleEnvelope.maxY + gap],
      ['left', obstacleEnvelope.minX - gap],
      ['right', obstacleEnvelope.maxX + gap],
    ];
    for (const [side, corridor] of candidates) {
      const segments = logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor);
      if (!logisticsGeomCollisionIdsForSegments(segments, obstacles).length) {
        chosen = segments; detourKind = side; break;
      }
    }
    if (!chosen && obstacles.length) {
      const graphEnvelope = logisticsGeomObstacleEnvelope(obstacles);
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const side = horizontal ? 'above' : 'left';
      const corridor = horizontal
        ? graphEnvelope.minY - LOGISTICS_GEOM_ENVELOPE_CLEARANCE - 1 - laneRank * LOGISTICS_GEOM_LANE_GAP
        : graphEnvelope.minX - LOGISTICS_GEOM_ENVELOPE_CLEARANCE - 1 - laneRank * LOGISTICS_GEOM_LANE_GAP;
      const outerCorridor = logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor);
      if (!logisticsGeomCollisionIdsForSegments(outerCorridor, obstacles).length) {
        chosen = outerCorridor; detourKind = 'outerCorridor';
      }
    }
  }
  const conflicted = !chosen;
  if (!chosen) { chosen = directSegments; detourKind = 'fallback'; }
  const obstacleIds = conflicted ? logisticsGeomCollisionIdsForSegments(chosen, obstacles) : [];
  const pathD = chosen.map((segment, index) => logisticsGeomSegmentD(segment, index === 0)).join(' ');
  let bounds = logisticsGeomHullBounds([chosen[0].start, chosen[0].c1, chosen[0].c2, chosen[0].end]);
  for (let i = 1; i < chosen.length; i++) {
    bounds = logisticsGeomMergeBounds(bounds, logisticsGeomHullBounds([chosen[i].start, chosen[i].c1, chosen[i].c2, chosen[i].end]));
  }
  function segmentAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    return { segment: chosen[index], localT: scaled - index };
  }
  function pointAt(t) {
    const value = segmentAt(t); const s = value.segment;
    return logisticsGeomCubicPoint(s.start, s.c1, s.c2, s.end, value.localT);
  }
  function tangentAt(t) {
    const value = segmentAt(t); const s = value.segment;
    return logisticsGeomCubicTangent(s.start, s.c1, s.c2, s.end, value.localT);
  }
  return {
    routeId: route.id, fromNodeId: route.fromNodeId, toNodeId: route.toNodeId,
    sourcePort, targetPort, laneIndex, laneOffset, pathD, pathSegments: chosen,
    bounds, obstacleIds, detourKind, conflicted, start, end, d: pathD, pointAt, tangentAt,
  };
}

function logisticsGeomEstimateLabelSize(text) {
  const value = typeof text === 'string' ? text : '';
  let units = 0;
  for (const ch of value) { units += ch.codePointAt(0) > 0x2E7F ? 2 : 1; }
  return { width: Math.max(18, units * 6), height: 14 };
}

function logisticsGeomBoxFromCentre(cx, cy, w, h) {
  return { x: cx, y: cy, w, h };
}

function logisticsGeomBoxesOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/**
 * Chooses a deterministic label anchor for each route, avoiding node boxes,
 * unrelated node boxes, and already-placed labels. Routes are scored in a
 * stable order (routeId) so placement never depends on render/iteration order.
 */
function logisticsGeomPlaceLabels(routeGeoms, positions, labelMetrics, fixedLabelBoxes) {
  const placed = fixedLabelBoxes instanceof Map
    ? [...fixedLabelBoxes.entries()].sort((a, b) => logisticsGeomCompareId(a[0], b[0])).map(([, box]) => box).filter(logisticsGeomFiniteBox)
    : [];
  const anchors = new Map();
  const ordered = [...routeGeoms.values()].sort((a, b) => logisticsGeomCompareId(a.routeId, b.routeId));
  const nodeBoxes = [...positions.values()].filter(logisticsGeomFiniteBox);
  for (const geom of ordered) {
    const metric = labelMetrics && labelMetrics.get ? labelMetrics.get(geom.routeId) : null;
    const size = logisticsGeomEstimateLabelSize(metric && metric.text);
    let chosen = null;
    let conflicted = true;
    for (const t of LOGISTICS_GEOM_LABEL_CANDIDATES) {
      const point = geom.pointAt(t);
      const box = logisticsGeomBoxFromCentre(point.x, point.y, size.width, size.height);
      const hitsNode = nodeBoxes.some((nb) => {
        const inflated = { x: nb.x, y: nb.y, w: nb.w + LOGISTICS_GEOM_LABEL_NODE_GAP * 2, h: nb.h + LOGISTICS_GEOM_LABEL_NODE_GAP * 2 };
        return logisticsGeomBoxesOverlap(box, inflated);
      });
      const hitsLabel = placed.some((p) => {
        const inflated = { x: p.x, y: p.y, w: p.w + LOGISTICS_GEOM_LABEL_MIN_GAP, h: p.h + LOGISTICS_GEOM_LABEL_MIN_GAP };
        return logisticsGeomBoxesOverlap(box, inflated);
      });
      if (!hitsNode && !hitsLabel) { chosen = { t, point, box }; conflicted = false; break; }
    }
    if (!chosen) {
      // Least-conflicting deterministic fallback: first candidate, flagged.
      const t = LOGISTICS_GEOM_LABEL_CANDIDATES[0];
      const point = geom.pointAt(t);
      chosen = { t, point, box: logisticsGeomBoxFromCentre(point.x, point.y, size.width, size.height) };
    }
    placed.push(chosen.box);
    anchors.set(geom.routeId, {
      x: chosen.point.x,
      y: chosen.point.y,
      t: chosen.t,
      conflicted,
      warningAnchor: { x: chosen.point.x, y: chosen.point.y + size.height },
    });
  }
  return anchors;
}

/**
 * @param {object} input
 * @param {Array} input.routes - [{id, fromNodeId, toNodeId, ...}], read-only.
 * @param {Map} input.positions - Map<nodeId, {x,y,w,h,...}>, read-only. This
 *   is the already-collapsed/aggregate-remapped rendered graph's position
 *   map (SLICE 2 output as consumed by logisticsBuildRenderedGraph): it is
 *   the sole obstacle source, so region containers are never obstacles and
 *   collapsed aggregates are ordinary obstacles by construction.
 * @param {Map} [input.labelMetrics] - Map<routeId, {text}> for conservative
 *   deterministic label-size estimation (CJK-aware).
 * @param {object} [input.topologyIndex] - topology-only reusable index.
 * @param {Array|Set} [input.routeIds] - optional bounded subset to compute.
 * @param {Map} [input.fixedLabelBoxes] - unrelated labels treated as obstacles.
 * @param {object} [input.options]
 * @returns {{routes: Map, diagnostics: object}}
 */
function computeLogisticsRouteGeometry(input) {
  const routesIn = Array.isArray(input && input.routes) ? input.routes : [];
  const positions = input && input.positions instanceof Map ? input.positions : new Map();
  const labelMetrics = input && input.labelMetrics instanceof Map ? input.labelMetrics : null;
  const topologyIndex = input?.topologyIndex || buildLogisticsRouteTopologyIndex(routesIn);
  const requestedIds = input?.routeIds instanceof Set ? [...input.routeIds]
    : Array.isArray(input?.routeIds) ? input.routeIds.slice()
      : topologyIndex.sortedRouteIds.slice();
  const orderedIds = [...new Set(requestedIds)]
    .filter((routeId) => topologyIndex.routesById.has(routeId))
    .sort(logisticsGeomCompareId);
  const orderedForCompute = orderedIds.map((routeId) => topologyIndex.routesById.get(routeId))
    .filter((route) => positions.has(route.fromNodeId) && positions.has(route.toNodeId));
  const ports = logisticsGeomAssignPortsForRouteIds(topologyIndex, positions, orderedForCompute.map((route) => route.id));
  const inflate = LOGISTICS_GEOM_OBSTACLE_INFLATE;

  const routeGeoms = new Map();
  const conflictedIds = [];
  for (const route of orderedForCompute) {
    const portPair = ports.get(route.id);
    if (!portPair) { continue; }
    const laneMetadata = topologyIndex.laneAllocationMetadata.get(route.id) || { laneIndex: 0, rank: 0, count: 1 };
    const obstacles = logisticsGeomInflatedObstacles(positions, new Set([route.fromNodeId, route.toNodeId]), inflate);
    const geom = logisticsGeomComputeEnvelopeRoute(route, portPair.sourcePort, portPair.targetPort, laneMetadata, obstacles);
    routeGeoms.set(route.id, geom);
    if (geom.conflicted) { conflictedIds.push(route.id); }
  }
  const labelAnchors = logisticsGeomPlaceLabels(routeGeoms, positions, labelMetrics, input?.fixedLabelBoxes);
  for (const [routeId, geom] of routeGeoms) {
    const anchor = labelAnchors.get(routeId);
    geom.labelAnchor = anchor ? { x: anchor.x, y: anchor.y, t: anchor.t } : { x: geom.start.x, y: geom.start.y, t: 0 };
    geom.warningAnchor = anchor ? anchor.warningAnchor : { x: geom.start.x, y: geom.start.y + 14 };
    geom.labelConflicted = anchor ? anchor.conflicted : true;
  }
  const orderedOutput = new Map();
  for (const routeId of orderedIds) { if (routeGeoms.has(routeId)) { orderedOutput.set(routeId, routeGeoms.get(routeId)); } }
  return {
    routes: orderedOutput,
    diagnostics: {
      conflictedIds: conflictedIds.sort(logisticsGeomCompareId),
      routeCount: orderedOutput.size,
      computedRouteIds: [...orderedOutput.keys()],
    },
  };
}
