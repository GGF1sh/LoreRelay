#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-2D-FRAMING-001 — pure projected-bounds / fit tests.
 */

const path = require('path');
const geo = require('../webview/modules/86b0-settlement-iso-geometry.js');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

const {
    computeSettlementProjectedContentBounds,
    computeSettlementFitTransform,
    isSettlementTransformMeaningfullyVisible,
    isoProjectRaw,
    ISO_TILE_W,
    ISO_TILE_H,
} = geo;

function viewFromTiles(tiles, markers = [], over = {}) {
    return {
        settlementId: over.settlementId || 'set_test',
        width: over.width || 24,
        height: over.height || 24,
        layerId: over.layerId || 'z0',
        tiles,
        markers,
    };
}

function tile(x, y, code = 'floor', z = 0) {
    return { x, y, z, code, label: code };
}

function marker(x, y, z = 0) {
    return { x, y, z, id: `m_${x}_${y}`, kind: 'resident', label: 'npc' };
}

const canvas = { width: 266, height: 192 };

// 1. Port-like dense cluster inside padded bounds
{
    const tiles = [];
    for (let x = 0; x <= 7; x++) {
        for (let y = 0; y <= 7; y++) {
            if ((x + y) % 2 === 0) tiles.push(tile(x, y, 'market'));
        }
    }
    const v = viewFromTiles(tiles, [], { settlementId: 'set_sapphire_port', width: 24, height: 24 });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(fit && fit.zoom >= 0.25 && fit.zoom <= 3, '1 Port fit produces zoom');
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, fit.pan, fit.zoom);
    check(vis.ok && vis.centersInside > 0, '1 Port content inside padded canvas');
    check(vis.visibleRatio > 0.5, '1 Port visible ratio high after fit');
}

// 2. Mistgrove sparse
{
    const tiles = [
        tile(0, 0, 'quarters'), tile(7, 1, 'quarters'), tile(1, 7, 'quarters'),
        tile(4, 4, 'shrine'), tile(6, 6, 'clinic'), tile(2, 2, 'workshop'),
    ];
    const v = viewFromTiles(tiles, [marker(3, 3)], { settlementId: 'set_mistgrove', width: 16, height: 16 });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, fit.pan, fit.zoom);
    check(vis.ok && vis.centersInside >= 3, '2 Mistgrove sparse centred and visible');
    // Content should not be a tiny corner (centers spread)
    check(fit.zoom > 0.4, '2 Mistgrove not over-shrunk');
}

// 3. Watchkeep walls — tall extrusion included
{
    const tiles = [];
    for (let i = 0; i < 8; i++) {
        tiles.push(tile(i, 0, 'wall'));
        tiles.push(tile(0, i, 'wall'));
        tiles.push(tile(i, 5, 'wall'));
        tiles.push(tile(6, i, 'wall'));
    }
    tiles.push(tile(3, 2, 'barracks'));
    const v = viewFromTiles(tiles, [marker(3, 1)], { settlementId: 'set_watchkeep' });
    const bounds = computeSettlementProjectedContentBounds(v);
    // Wall elev 16 should raise minY above flat base
    const flat = computeSettlementProjectedContentBounds(viewFromTiles([tile(0, 0, 'floor')]));
    check(bounds.minY < flat.minY - 8, '3 wall tops expand upper bound');
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, fit.pan, fit.zoom);
    check(vis.ok, '3 Watchkeep walls not clipped after fit');
}

// 4. Coordinates exceeding nominal width/height still fit
{
    const tiles = [tile(0, 0, 'floor'), tile(30, 30, 'market')];
    const v = viewFromTiles(tiles, [], { width: 8, height: 8 }); // declared smaller than coords
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, fit.pan, fit.zoom);
    check(vis.ok && vis.centersInside === 2, '4 coords beyond declared size still fit');
}

// 5. Negative tile coordinates
{
    const tiles = [tile(-3, -2, 'floor'), tile(2, 1, 'water')];
    const v = viewFromTiles(tiles, [], { width: 10, height: 10 });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, fit.pan, fit.zoom);
    check(vis.ok && vis.centersInside === 2, '5 negative coords fit');
}

// 6. Tall extrusion in top bound
{
    const floorB = computeSettlementProjectedContentBounds(viewFromTiles([tile(5, 5, 'floor')]));
    const wallB = computeSettlementProjectedContentBounds(viewFromTiles([tile(5, 5, 'wall')]));
    check(wallB.minY < floorB.minY, '6 extrusion included in top bound');
}

// 7. Marker bubbles in top bound
{
    const onlyTile = computeSettlementProjectedContentBounds(viewFromTiles([tile(2, 2, 'floor')]));
    const withMarker = computeSettlementProjectedContentBounds(
        viewFromTiles([tile(2, 2, 'floor')], [marker(2, 2)])
    );
    check(withMarker.minY < onlyTile.minY, '7 marker bubble expands top bound');
}

// 8–9. Separate transforms for different settlement IDs (source change)
{
    const fixed = viewFromTiles([tile(0, 0, 'market'), tile(3, 3, 'water')], [], { settlementId: 'set_port' });
    const mb = viewFromTiles([tile(0, 0, 'floor'), tile(1, 0, 'quarters')], [], { settlementId: 'mb_barge' });
    const fitF = computeSettlementFitTransform(fixed, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const fitM = computeSettlementFitTransform(mb, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(fitF && fitM, '8/9 both sources produce fits');
    // Transforms need not be equal; both must be valid for their content
    check(isSettlementTransformMeaningfullyVisible(fixed, canvas, fitF.pan, fitF.zoom).ok, '8 fixed fit valid');
    check(isSettlementTransformMeaningfullyVisible(mb, canvas, fitM.pan, fitM.zoom).ok, '9 MB fit valid');
    // Cross-applying wrong transform is less visible
    const cross = isSettlementTransformMeaningfullyVisible(fixed, canvas, fitM.pan, fitM.zoom);
    // May or may not be ok depending on sizes; at least fits differ
    check(
        fitF.pan.x !== fitM.pan.x || fitF.zoom !== fitM.zoom || fitF.bounds.width !== fitM.bounds.width,
        '8/9 transforms not identical across sources'
    );
}

// 10. Layer-like content change (different z tile set) fits new content
{
    const z0 = viewFromTiles([tile(0, 0, 'floor', 0), tile(4, 4, 'market', 0)], [], { layerId: 'z0' });
    const z1 = viewFromTiles([tile(1, 1, 'workshop', 1), tile(2, 2, 'quarters', 1)], [], { layerId: 'z1' });
    const f0 = computeSettlementFitTransform(z0, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const f1 = computeSettlementFitTransform(z1, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(isSettlementTransformMeaningfullyVisible(z1, canvas, f1.pan, f1.zoom).ok, '10 z1 fits active layer');
    check(f0 && f1, '10 both layers produce fits');
}

// 11. Stale large pan rejected
{
    const v = viewFromTiles([tile(2, 2, 'market'), tile(3, 3, 'floor')]);
    const stale = { x: 5000, y: -4000 };
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, stale, 1);
    check(!vis.ok, '11 stale large pan rejected');
}

// 12. Stale min zoom that hides geometry
{
    const v = viewFromTiles([tile(0, 0, 'floor'), tile(1, 0, 'floor')]);
    // pan far away with tiny zoom
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, { x: -2000, y: -2000 }, 0.25);
    check(!vis.ok, '12 extreme transform rejected');
}

// 13. Valid user transform retained (fit is valid)
{
    const v = viewFromTiles([tile(1, 1, 'market'), tile(2, 2, 'water'), tile(3, 1, 'workshop')]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    // slight user pan still visible
    const userPan = { x: fit.pan.x + 10, y: fit.pan.y - 8 };
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, userPan, fit.zoom);
    check(vis.ok, '13 mild user pan retained as visible');
}

// 14. Zero canvas does not produce a fit
{
    const v = viewFromTiles([tile(0, 0, 'floor')]);
    const fit = computeSettlementFitTransform(v, { width: 0, height: 0 }, { padding: 24 });
    check(fit == null, '14 zero-size canvas no fit');
}

// 15. First nonzero canvas size produces valid fit
{
    const v = viewFromTiles([tile(0, 0, 'market'), tile(5, 5, 'wall')]);
    const fit = computeSettlementFitTransform(v, { width: 300, height: 220 }, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(fit && isSettlementTransformMeaningfullyVisible(v, { width: 300, height: 220 }, fit.pan, fit.zoom).ok,
        '15 first nonzero size fits');
}

// 16. Resize that leaves content visible — same pan remains ok
{
    const v = viewFromTiles([tile(2, 2, 'market'), tile(3, 3, 'floor'), tile(4, 2, 'water')]);
    const fit = computeSettlementFitTransform(v, { width: 400, height: 300 }, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const still = isSettlementTransformMeaningfullyVisible(v, { width: 360, height: 280 }, fit.pan, fit.zoom);
    check(still.ok, '16 mild resize keeps content visible');
}

// 17. Resize that moves content outside → not ok (would trigger recovery)
{
    const v = viewFromTiles([tile(0, 0, 'floor'), tile(1, 0, 'floor')]);
    const fit = computeSettlementFitTransform(v, { width: 400, height: 300 }, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    // tiny canvas after huge pan offset
    const bad = isSettlementTransformMeaningfullyVisible(
        v,
        { width: 80, height: 60 },
        { x: fit.pan.x + 500, y: fit.pan.y + 500 },
        fit.zoom
    );
    check(!bad.ok, '17 bad resize/pan triggers recovery condition');
}

// 18. Empty layer safe
{
    const v = viewFromTiles([], [], { settlementId: 'empty' });
    const bounds = computeSettlementProjectedContentBounds(v);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24 });
    check(bounds == null && fit == null, '18 empty layer safe (no divide-by-zero fit)');
}

// 19. Deterministic repeated fits
{
    const v = viewFromTiles([tile(1, 2, 'market'), tile(4, 5, 'wall'), tile(0, 6, 'water')]);
    const a = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const b = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(a && b && a.zoom === b.zoom && a.pan.x === b.pan.x && a.pan.y === b.pan.y, '19 deterministic fit');
}

// 20. Manual Fit uses same projected bounds as helper
{
    const v = viewFromTiles([tile(0, 0, 'barracks'), tile(6, 3, 'gate'), tile(2, 5, 'shrine')]);
    const bounds = computeSettlementProjectedContentBounds(v);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(bounds && fit && fit.bounds.width === bounds.width && fit.bounds.height === bounds.height,
        '20 Fit uses projected content bounds');
}

// Declared-size mismatch evidence (diagnosis support)
{
    const tiles = [];
    for (let x = 0; x <= 7; x++) for (let y = 0; y <= 7; y++) tiles.push(tile(x, y, 'floor'));
    const v = viewFromTiles(tiles, [], { width: 24, height: 24 });
    const content = computeSettlementProjectedContentBounds(v);
    const declaredW = (24 + 24) * (ISO_TILE_W / 2);
    check(content.width < declaredW * 0.6, 'diag: content width << declared bounds (DECLARED_BOUNDS_MISMATCH)');
}

if (failed > 0) {
    console.error(`\n2d framing: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nSettlement 2D framing cases: ${cases}`);
console.log('webview settlement 2d framing: all passed');
