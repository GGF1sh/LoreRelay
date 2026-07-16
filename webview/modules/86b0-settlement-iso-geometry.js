/* global */

// ---------------------------------------------------------------------------
// SETTLEMENT-2D-FRAMING-001 — pure projected-bounds / fit helpers (no DOM).
// Shared constants must match 86b-settlement-isometric.js tile metrics.
// ---------------------------------------------------------------------------

const ISO_TILE_W = 32;
const ISO_TILE_H = 16;
const ISO_LAYER_HEIGHT = 12;
const ISO_MARKER_BUBBLE = 14; // approx bubble height above base

const ISO_TILE_ELEVATION = {
    floor: 2,
    wall: 16,
    gate: 12,
    market: 8,
    workshop: 9,
    stockpile: 6,
    quarters: 9,
    clinic: 9,
    barracks: 10,
    shrine: 12,
    water: 0,
    ruins: 5,
    hazard: 3,
    empty: 0,
    unknown: 4,
};

function isoProjectRaw(x, y, z) {
    return {
        sx: (x - y) * (ISO_TILE_W / 2),
        sy: (x + y) * (ISO_TILE_H / 2) - (z || 0) * ISO_LAYER_HEIGHT,
    };
}

/**
 * Actual projected content AABB of the active settlement view (origin at 0,0).
 * Includes tile diamonds, extrusion tops, and marker bubbles.
 */
function computeSettlementProjectedContentBounds(view) {
    if (!view) { return null; }
    const tiles = Array.isArray(view.tiles) ? view.tiles : [];
    const markers = Array.isArray(view.markers) ? view.markers : [];
    if (!tiles.length && !markers.length) { return null; }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const hw = ISO_TILE_W / 2;
    const hh = ISO_TILE_H / 2;

    for (const tile of tiles) {
        const x = Number(tile.x) || 0;
        const y = Number(tile.y) || 0;
        const z = Number(tile.z) || 0;
        const { sx, sy } = isoProjectRaw(x, y, z);
        const elev = ISO_TILE_ELEVATION[tile.code] ?? 4;
        const topY = sy - elev;
        // Base diamond + elevated top diamond extents
        minX = Math.min(minX, sx - hw);
        maxX = Math.max(maxX, sx + hw);
        minY = Math.min(minY, topY - hh, sy - hh);
        maxY = Math.max(maxY, sy + hh, topY + hh);
    }

    for (const marker of markers) {
        const x = Number(marker.x) || 0;
        const y = Number(marker.y) || 0;
        const z = Number(marker.z) || 0;
        const { sx, sy } = isoProjectRaw(x, y, z);
        // Marker stem + bubble above base
        minX = Math.min(minX, sx - 10);
        maxX = Math.max(maxX, sx + 10);
        minY = Math.min(minY, sy - ISO_TILE_H - ISO_MARKER_BUBBLE);
        maxY = Math.max(maxY, sy + 6);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) { return null; }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        tileCount: tiles.length,
        markerCount: markers.length,
    };
}

/**
 * Fit zoom + pan so projected content fills the canvas with padding.
 * Transform model matches 86b: origin includes pan; zoom pivots on content center.
 *
 * @returns {{ zoom: number, pan: {x:number,y:number}, bounds: object, origin: object, pivot: object } | null}
 */
function computeSettlementFitTransform(view, canvasSize, options) {
    const pad = (options && options.padding != null) ? options.padding : 24;
    const zoomMin = (options && options.zoomMin != null) ? options.zoomMin : 0.25;
    const zoomMax = (options && options.zoomMax != null) ? options.zoomMax : 3;
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    if (!view || !cw || !ch) { return null; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return null; }

    const usableW = Math.max(1, cw - pad * 2);
    const usableH = Math.max(1, ch - pad * 2);
    let zoom = Math.min(usableW / bounds.width, usableH / bounds.height);
    zoom = Math.max(zoomMin, Math.min(zoomMax, zoom));

    // Place content center at canvas center with pan=0:
    // origin + contentCenter = canvasCenter  (pre-zoom content coords)
    // pivot = canvas center so zoom keeps content centered
    const originX = cw / 2 - bounds.centerX;
    const originY = ch / 2 - bounds.centerY;
    // In 86b, origin = baseOrigin(without pan) + pan, so pan offsets origin.
    // We encode the centering into pan relative to a neutral base of 0:
    //   origin = pan  when base would be 0... Actually 86b:
    //   originX = cssW/2 - declaredBoundsW/2 + pan.x
    // We replace that formula entirely with content-based origin.
    // For compatibility, fit returns pan as the full origin offset from (0,0)
    // and zoom; computeSettlementOrigin will use content bounds + pan.

    return {
        zoom,
        pan: { x: originX, y: originY },
        bounds,
        origin: { x: originX, y: originY },
        pivot: { x: cw / 2, y: ch / 2 },
        padding: pad,
    };
}

/**
 * After applying zoom about content pivot with origin=pan, is a meaningful
 * fraction of content inside the canvas?
 * @returns {{ ok: boolean, visibleRatio: number, centersInside: number, interArea: number, contentArea: number, screenBounds: object }}
 */
function isSettlementTransformMeaningfullyVisible(view, canvasSize, pan, zoom, options) {
    const minRatio = (options && options.minVisibleRatio != null) ? options.minVisibleRatio : 0.12;
    const minCenters = (options && options.minTileCenters != null) ? options.minTileCenters : 1;
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    const empty = {
        ok: false,
        visibleRatio: 0,
        centersInside: 0,
        interArea: 0,
        contentArea: 0,
        screenBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
    if (!view || !cw || !ch || !zoom || zoom <= 0 || !pan) { return empty; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return empty; }

    const originX = pan.x;
    const originY = pan.y;
    const pivotX = originX + bounds.centerX;
    const pivotY = originY + bounds.centerY;

    function contentToScreen(sx0, sy0) {
        const drawX = originX + sx0;
        const drawY = originY + sy0;
        return {
            x: pivotX + (drawX - pivotX) * zoom,
            y: pivotY + (drawY - pivotY) * zoom,
        };
    }

    const corners = [
        contentToScreen(bounds.minX, bounds.minY),
        contentToScreen(bounds.maxX, bounds.minY),
        contentToScreen(bounds.minX, bounds.maxY),
        contentToScreen(bounds.maxX, bounds.maxY),
    ];
    let sMinX = Infinity;
    let sMinY = Infinity;
    let sMaxX = -Infinity;
    let sMaxY = -Infinity;
    for (const c of corners) {
        sMinX = Math.min(sMinX, c.x);
        sMinY = Math.min(sMinY, c.y);
        sMaxX = Math.max(sMaxX, c.x);
        sMaxY = Math.max(sMaxY, c.y);
    }

    const ix0 = Math.max(0, sMinX);
    const iy0 = Math.max(0, sMinY);
    const ix1 = Math.min(cw, sMaxX);
    const iy1 = Math.min(ch, sMaxY);
    const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    const contentArea = Math.max(1, (sMaxX - sMinX) * (sMaxY - sMinY));
    const ratio = interArea / contentArea;

    let centersInside = 0;
    const tiles = Array.isArray(view.tiles) ? view.tiles : [];
    for (const tile of tiles) {
        const p0 = isoProjectRaw(Number(tile.x) || 0, Number(tile.y) || 0, Number(tile.z) || 0);
        const sc = contentToScreen(p0.sx, p0.sy);
        if (sc.x >= 0 && sc.x <= cw && sc.y >= 0 && sc.y <= ch) {
            centersInside++;
        }
    }

    return {
        ok: ratio >= minRatio && (centersInside >= minCenters || tiles.length === 0),
        visibleRatio: ratio,
        centersInside,
        interArea,
        contentArea,
        screenBounds: { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY },
    };
}

// Export for Node tests (vm) and browser globals
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ISO_TILE_W,
        ISO_TILE_H,
        ISO_LAYER_HEIGHT,
        ISO_TILE_ELEVATION,
        isoProjectRaw,
        computeSettlementProjectedContentBounds,
        computeSettlementFitTransform,
        isSettlementTransformMeaningfullyVisible,
    };
}
