/* global */

// ---------------------------------------------------------------------------
// SETTLEMENT-2D-FRAMING-001 / CENTERING-002 — pure projected-bounds + transform.
//
// Unified transform contract (content space → screen space):
//
//   content (sx0, sy0)  = iso projection with origin at (0,0)
//   origin  (originX, originY)  = absolute isometric origin (stored as pan)
//   pivot   = (originX + contentCenterX, originY + contentCenterY)
//   draw    = (originX + sx0, originY + sy0)
//   screen  = pivot + zoom * (draw - pivot)
//           = pivot + zoom * (sx0 - contentCenter)
//
// Automatic Fit sets origin so pivot === canvas centre, and zoom so the
// content AABB has >= padding slack on every edge (when geometrically possible).
// ---------------------------------------------------------------------------

const ISO_TILE_W = 32;
const ISO_TILE_H = 16;
const ISO_LAYER_HEIGHT = 12;
const ISO_MARKER_BUBBLE = 14;

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

/** Preference schema version — v1 absolute-origin prefs from FRAMING-001 may be invalid. */
const SETTLEMENT_TRANSFORM_PREF_VERSION = 2;

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
 * Map content-space point through the unified transform to screen CSS pixels.
 */
function contentToScreen(sx0, sy0, originX, originY, zoom, contentCenterX, contentCenterY) {
    const pivotX = originX + contentCenterX;
    const pivotY = originY + contentCenterY;
    const drawX = originX + sx0;
    const drawY = originY + sy0;
    return {
        x: pivotX + (drawX - pivotX) * zoom,
        y: pivotY + (drawY - pivotY) * zoom,
    };
}

/**
 * Exact screen-space layout of content bounds under the renderer transform.
 * Returns edge slacks, crossings, and centre counts.
 */
function computeSettlementScreenLayout(view, canvasSize, pan, zoom) {
    const empty = {
        ok: false,
        leftSlack: 0,
        rightSlack: 0,
        topSlack: 0,
        bottomSlack: 0,
        crossingLeft: 0,
        crossingRight: 0,
        crossingTop: 0,
        crossingBottom: 0,
        centersInside: 0,
        visibleRatio: 0,
        screenBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        contentBounds: null,
        pivot: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        zoom: zoom || 1,
    };
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    if (!view || !cw || !ch || !zoom || zoom <= 0 || !pan) { return empty; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return empty; }

    const originX = pan.x;
    const originY = pan.y;
    const pivotX = originX + bounds.centerX;
    const pivotY = originY + bounds.centerY;

    const corners = [
        contentToScreen(bounds.minX, bounds.minY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.maxX, bounds.minY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.minX, bounds.maxY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.maxX, bounds.maxY, originX, originY, zoom, bounds.centerX, bounds.centerY),
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

    const leftSlack = sMinX;
    const rightSlack = cw - sMaxX;
    const topSlack = sMinY;
    const bottomSlack = ch - sMaxY;

    // Crossing counts: corners of content AABB outside edge (strict)
    let crossingLeft = 0;
    let crossingRight = 0;
    let crossingTop = 0;
    let crossingBottom = 0;
    if (sMinX < -0.5) { crossingLeft = 1; }
    if (sMaxX > cw + 0.5) { crossingRight = 1; }
    if (sMinY < -0.5) { crossingTop = 1; }
    if (sMaxY > ch + 0.5) { crossingBottom = 1; }

    let centersInside = 0;
    const tiles = Array.isArray(view.tiles) ? view.tiles : [];
    for (const tile of tiles) {
        const p0 = isoProjectRaw(Number(tile.x) || 0, Number(tile.y) || 0, Number(tile.z) || 0);
        const sc = contentToScreen(p0.sx, p0.sy, originX, originY, zoom, bounds.centerX, bounds.centerY);
        if (sc.x >= 0 && sc.x <= cw && sc.y >= 0 && sc.y <= ch) {
            centersInside++;
        }
    }

    const ix0 = Math.max(0, sMinX);
    const iy0 = Math.max(0, sMinY);
    const ix1 = Math.min(cw, sMaxX);
    const iy1 = Math.min(ch, sMaxY);
    const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    const contentArea = Math.max(1, (sMaxX - sMinX) * (sMaxY - sMinY));

    return {
        ok: crossingLeft === 0 && crossingRight === 0 && crossingTop === 0 && crossingBottom === 0
            && centersInside > 0,
        leftSlack,
        rightSlack,
        topSlack,
        bottomSlack,
        crossingLeft,
        crossingRight,
        crossingTop,
        crossingBottom,
        centersInside,
        visibleRatio: interArea / contentArea,
        screenBounds: { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY },
        contentBounds: bounds,
        pivot: { x: pivotX, y: pivotY },
        origin: { x: originX, y: originY },
        zoom,
    };
}

/**
 * Fit zoom + origin so content is centred with equal slack on opposite sides.
 *
 * @returns {{ zoom, pan: {x,y}, origin, pivot, bounds, padding, layout } | null}
 */
function computeSettlementFitTransform(view, canvasSize, options) {
    const pad = (options && options.padding != null) ? options.padding : 24;
    const minPad = (options && options.minPadding != null) ? options.minPadding : 18;
    const zoomMin = (options && options.zoomMin != null) ? options.zoomMin : 0.25;
    const zoomMax = (options && options.zoomMax != null) ? options.zoomMax : 3;
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    if (!view || !cw || !ch) { return null; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return null; }

    // Uniform scale: content must fit inside canvas with target padding on all sides.
    const usableW = Math.max(1, cw - pad * 2);
    const usableH = Math.max(1, ch - pad * 2);
    let zoom = Math.min(usableW / bounds.width, usableH / bounds.height);
    zoom = Math.max(zoomMin, Math.min(zoomMax, zoom));

    // Pivot at canvas centre; origin so content centre maps to canvas centre.
    // screen = canvasCentre + zoom * (sx0 - contentCentre)
    // ⇒ origin + contentCentre = canvasCentre  (for pre-zoom draw position of centre)
    const originX = cw / 2 - bounds.centerX;
    const originY = ch / 2 - bounds.centerY;
    const pan = { x: originX, y: originY };
    const pivot = { x: cw / 2, y: ch / 2 };

    const layout = computeSettlementScreenLayout(view, canvasSize, pan, zoom);

    // If zoom was clamped by zoomMin and still clips, accept best-effort (caller may still use it).
    return {
        zoom,
        pan,
        origin: { x: originX, y: originY },
        pivot,
        bounds,
        padding: pad,
        minPadding: minPad,
        layout,
        version: SETTLEMENT_TRANSFORM_PREF_VERSION,
    };
}

/**
 * Whether a stored transform is acceptable to keep (centred enough, no clipping).
 */
function isSettlementTransformMeaningfullyVisible(view, canvasSize, pan, zoom, options) {
    const minPad = (options && options.minPadding != null) ? options.minPadding : 12;
    const requireSymmetric = options && options.requireSymmetric === true;
    const maxAsym = (options && options.maxAsymmetry != null) ? options.maxAsymmetry : 24;
    const layout = computeSettlementScreenLayout(view, canvasSize, pan, zoom);
    if (!layout || !layout.contentBounds) {
        return {
            ok: false,
            visibleRatio: 0,
            centersInside: 0,
            interArea: 0,
            contentArea: 0,
            screenBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
            layout,
        };
    }

    const noCross = layout.crossingLeft === 0 && layout.crossingRight === 0
        && layout.crossingTop === 0 && layout.crossingBottom === 0;
    const enoughPad = layout.leftSlack >= minPad && layout.rightSlack >= minPad
        && layout.topSlack >= minPad && layout.bottomSlack >= minPad;
    const symOk = !requireSymmetric
        || (Math.abs(layout.leftSlack - layout.rightSlack) <= maxAsym
            && Math.abs(layout.topSlack - layout.bottomSlack) <= maxAsym);

    return {
        ok: noCross && enoughPad && layout.centersInside > 0 && symOk,
        visibleRatio: layout.visibleRatio,
        centersInside: layout.centersInside,
        interArea: layout.visibleRatio, // kept for older callers
        contentArea: 1,
        screenBounds: layout.screenBounds,
        layout,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ISO_TILE_W,
        ISO_TILE_H,
        ISO_LAYER_HEIGHT,
        ISO_TILE_ELEVATION,
        SETTLEMENT_TRANSFORM_PREF_VERSION,
        isoProjectRaw,
        contentToScreen,
        computeSettlementProjectedContentBounds,
        computeSettlementScreenLayout,
        computeSettlementFitTransform,
        isSettlementTransformMeaningfullyVisible,
    };
}
