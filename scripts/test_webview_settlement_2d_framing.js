#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-2D-FRAMING-001 + CENTERING-002 — projected-bounds / fit / centre tests.
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
    computeSettlementScreenLayout,
    isSettlementTransformMeaningfullyVisible,
    contentToScreen,
    screenToSettlementContent,
    hitTestSettlementContent,
    settlementHitKey,
    isoProjectRaw,
    ISO_TILE_W,
    ISO_TILE_H,
    ISO_TILE_ELEVATION,
} = geo;

function assertCentred(layout, label, minPad = 18) {
    check(layout && layout.crossingLeft === 0 && layout.crossingRight === 0
        && layout.crossingTop === 0 && layout.crossingBottom === 0, `${label} no edge crossing`);
    check(layout.leftSlack >= minPad && layout.rightSlack >= minPad
        && layout.topSlack >= minPad && layout.bottomSlack >= minPad, `${label} min pad ${minPad}`);
    check(Math.abs(layout.leftSlack - layout.rightSlack) <= 3, `${label} L/R symmetric`);
    check(Math.abs(layout.topSlack - layout.bottomSlack) <= 3, `${label} T/B symmetric`);
}

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

// ---- CENTERING-002 ----

// C1–C4 Port: no clip, symmetric, water-edge inside
{
    const tiles = [];
    for (let x = 0; x <= 7; x++) {
        for (let y = 0; y <= 7; y++) {
            if ((x + y) % 2 === 0) tiles.push(tile(x, y, 'market'));
        }
    }
    // water edge along bottom-right of cluster
    for (let x = 0; x <= 4; x++) tiles.push(tile(x, 7, 'water'));
    const v = viewFromTiles(tiles, [marker(0, 0)], { settlementId: 'set_sapphire_port', width: 24, height: 24 });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    assertCentred(layout, 'C1-4 Port');
    check(layout.centersInside > 0, 'C4 Port water/tiles have centres inside');
}

// C5 Glass Oasis centre
{
    const tiles = [
        tile(4, 4, 'water'), tile(4, 3, 'market'), tile(5, 4, 'market'), tile(3, 4, 'market'),
        tile(4, 5, 'market'), tile(4, 1, 'quarters'), tile(7, 4, 'quarters'),
        tile(4, 7, 'quarters'), tile(1, 4, 'quarters'),
    ];
    const v = viewFromTiles(tiles, [marker(4, 4)], { settlementId: 'set_glass_oasis' });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    assertCentred(layout, 'C5 Glass Oasis');
    const centre = isoProjectRaw(4, 4, 0);
    const sc = contentToScreen(centre.sx, centre.sy, fit.pan.x, fit.pan.y, fit.zoom,
        layout.contentBounds.centerX, layout.contentBounds.centerY);
    check(sc.x > 40 && sc.x < canvas.width - 40 && sc.y > 40 && sc.y < canvas.height - 40,
        'C5 Oasis centre well inside viewport');
}

// C6 Watchkeep wall tops
{
    const tiles = [];
    for (let i = 0; i < 7; i++) {
        tiles.push(tile(i, 0, 'wall'));
        tiles.push(tile(0, i, 'wall'));
        tiles.push(tile(i, 5, 'wall'));
        tiles.push(tile(6, i, 'wall'));
    }
    tiles.push(tile(3, 2, 'barracks'));
    const v = viewFromTiles(tiles, [marker(3, 1)], { settlementId: 'set_watchkeep' });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    assertCentred(layout, 'C6 Watchkeep');
    check(layout.topSlack >= 18, 'C6 wall tops have top pad');
}

// C7 marker bubble at min X
{
    const v = viewFromTiles([tile(0, 3, 'floor'), tile(5, 3, 'floor')], [marker(0, 3)]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    check(layout.crossingLeft === 0 && layout.leftSlack >= 18, 'C7 min-X marker bubble not clipped');
}

// C8 tall wall at min Y
{
    const v = viewFromTiles([tile(3, 0, 'wall'), tile(3, 4, 'floor')]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    check(layout.crossingTop === 0 && layout.topSlack >= 18, 'C8 tall wall min-Y not clipped');
}

// C9 negative coords centre
{
    const v = viewFromTiles([tile(-4, -2, 'floor'), tile(2, 3, 'market')]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    assertCentred(computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom), 'C9 negative coords');
}

// C10 beyond declared dims centre
{
    const v = viewFromTiles([tile(0, 0, 'floor'), tile(20, 18, 'wall')], [], { width: 8, height: 8 });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    assertCentred(computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom), 'C10 beyond declared');
}

// C11 sparse Mistgrove centres (not upper-left)
{
    const tiles = [
        tile(0, 0, 'quarters'), tile(7, 1, 'quarters'), tile(1, 7, 'quarters'),
        tile(4, 4, 'shrine'), tile(6, 6, 'clinic'),
    ];
    const v = viewFromTiles(tiles, [marker(3, 3)], { settlementId: 'set_mistgrove' });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    assertCentred(layout, 'C11 Mistgrove');
    const cx = (layout.screenBounds.minX + layout.screenBounds.maxX) / 2;
    const cy = (layout.screenBounds.minY + layout.screenBounds.maxY) / 2;
    check(Math.abs(cx - canvas.width / 2) <= 3 && Math.abs(cy - canvas.height / 2) <= 3,
        'C11 Mistgrove content centre near canvas centre');
}

// C12 compact Ironspire centres
{
    const tiles = [tile(2, 2, 'workshop'), tile(3, 2, 'workshop'), tile(4, 2, 'stockpile'), tile(2, 3, 'barracks')];
    const v = viewFromTiles(tiles, [], { settlementId: 'set_ironspire' });
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const layout = computeSettlementScreenLayout(v, canvas, fit.pan, fit.zoom);
    assertCentred(layout, 'C12 Ironspire');
}

// C13–C14 source-independent fits
{
    const fixed = viewFromTiles([tile(0, 0, 'market'), tile(4, 4, 'water')], [], { settlementId: 'set_port' });
    const mb = viewFromTiles([tile(0, 0, 'floor'), tile(1, 1, 'quarters')], [], { settlementId: 'mb_barge' });
    const fitF = computeSettlementFitTransform(fixed, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const fitM = computeSettlementFitTransform(mb, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    assertCentred(computeSettlementScreenLayout(fixed, canvas, fitF.pan, fitF.zoom), 'C13 fixed');
    assertCentred(computeSettlementScreenLayout(mb, canvas, fitM.pan, fitM.zoom), 'C14 mobile base');
}

// C15 layer change centres active layer
{
    const z1 = viewFromTiles([tile(1, 1, 'workshop', 1), tile(3, 2, 'quarters', 1)], [], { layerId: 'z1' });
    const fit = computeSettlementFitTransform(z1, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    assertCentred(computeSettlementScreenLayout(z1, canvas, fit.pan, fit.zoom), 'C15 layer z1');
}

// C16 valid mild user pan remains ok (min pad 12 for retention)
{
    const v = viewFromTiles([tile(1, 1, 'market'), tile(2, 2, 'water'), tile(3, 1, 'workshop')]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const userPan = { x: fit.pan.x + 8, y: fit.pan.y - 6 };
    const vis = isSettlementTransformMeaningfullyVisible(v, canvas, userPan, fit.zoom, { minPadding: 12 });
    check(vis.ok, 'C16 mild user pan retained');
}

// C17 old incompatible pan=0 zoom=1 rejected for Port-like declared mismatch
{
    const tiles = [];
    for (let x = 0; x <= 7; x++) for (let y = 0; y <= 7; y++) tiles.push(tile(x, y, 'floor'));
    const v = viewFromTiles(tiles, [], { width: 24, height: 24 });
    const legacy = isSettlementTransformMeaningfullyVisible(v, canvas, { x: 0, y: 0 }, 1, { minPadding: 12 });
    check(!legacy.ok, 'C17 legacy pan0 zoom1 rejected');
}

// C18 manual Fit same transform (idempotent)
{
    const v = viewFromTiles([tile(0, 0, 'barracks'), tile(6, 3, 'gate'), tile(2, 5, 'shrine')]);
    const a = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const b = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    check(a.zoom === b.zoom && a.pan.x === b.pan.x && a.pan.y === b.pan.y, 'C18 manual Fit deterministic');
}

// C19 hit-test inversion: content centre maps to canvas centre after fit
{
    const v = viewFromTiles([tile(2, 2, 'market'), tile(4, 3, 'floor')]);
    const fit = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const b = fit.bounds;
    const sc = contentToScreen(b.centerX, b.centerY, fit.pan.x, fit.pan.y, fit.zoom, b.centerX, b.centerY);
    check(Math.abs(sc.x - canvas.width / 2) < 0.01 && Math.abs(sc.y - canvas.height / 2) < 0.01,
        'C19 content centre → canvas centre (hit-test pivot)');
}

// C20 repeated fit deterministic (already covered) + screen layout stable
{
    const v = viewFromTiles([tile(1, 2, 'market'), tile(4, 5, 'wall'), tile(0, 6, 'water')]);
    const a = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const la = computeSettlementScreenLayout(v, canvas, a.pan, a.zoom);
    const b = computeSettlementFitTransform(v, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
    const lb = computeSettlementScreenLayout(v, canvas, b.pan, b.zoom);
    check(Math.abs(la.leftSlack - lb.leftSlack) < 1e-9 && Math.abs(la.topSlack - lb.topSlack) < 1e-9,
        'C20 repeated fit screen layout identical');
}

// ---- HUMAN-PLAY-GATE-BLOCKERS-001: exact screen/content/hit contract ----

function tileHit(t) {
    const projected = isoProjectRaw(t.x, t.y, t.z || 0);
    const elev = ISO_TILE_ELEVATION[t.code] ?? 4;
    return {
        type: 'tile',
        key: settlementHitKey({ type: 'tile', x: t.x, y: t.y, z: t.z || 0, code: t.code }),
        x: t.x,
        y: t.y,
        z: t.z || 0,
        code: t.code,
        contentX: projected.sx,
        contentY: projected.sy - elev,
    };
}

function markerHit(m) {
    const projected = isoProjectRaw(m.x, m.y, m.z || 0);
    return {
        type: 'marker',
        key: settlementHitKey({ type: 'marker', id: m.id }),
        id: m.id,
        contentX: projected.sx,
        contentY: projected.sy - ISO_TILE_H,
    };
}

function roundTripHit(view, transform, target, label) {
    const bounds = computeSettlementProjectedContentBounds(view);
    const screen = contentToScreen(
        target.contentX,
        target.contentY,
        transform.pan.x,
        transform.pan.y,
        transform.zoom,
        bounds.centerX,
        bounds.centerY
    );
    const content = screenToSettlementContent(
        screen.x,
        screen.y,
        transform.pan.x,
        transform.pan.y,
        transform.zoom,
        bounds.centerX,
        bounds.centerY
    );
    const hits = [
        ...(view.tiles || []).map(tileHit),
        ...(view.markers || []).map(markerHit),
    ];
    const resolved = hitTestSettlementContent(hits, content, 12, transform.zoom);
    check(
        Math.abs(content.x - target.contentX) < 1e-9 && Math.abs(content.y - target.contentY) < 1e-9,
        `${label} content -> screen -> content`
    );
    check(resolved?.key === target.key, `${label} resolves intended hit`);
    return { screen, resolved };
}

const hitView = viewFromTiles([
    tile(-4, 1, 'floor'),       // minimum X
    tile(0, 0, 'market'),       // centre
    tile(5, 1, 'floor'),        // maximum X
    tile(1, -3, 'floor'),       // minimum Y
    tile(1, 6, 'water'),        // maximum Y + water
    tile(3, 3, 'wall'),         // elevated wall top
], [marker(2, 2)], { settlementId: 'set_sapphire_port' });
hitView.markers[0].id = 'npc_quartermaster';
const hitFit = computeSettlementFitTransform(hitView, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
const hitTargets = [
    tileHit(hitView.tiles[0]),
    tileHit(hitView.tiles[1]),
    tileHit(hitView.tiles[2]),
    tileHit(hitView.tiles[3]),
    tileHit(hitView.tiles[4]),
    tileHit(hitView.tiles[5]),
    markerHit(hitView.markers[0]),
];
const hitLabels = ['minimum-X tile', 'centre tile', 'maximum-X tile', 'minimum-Y tile', 'water/maximum-Y tile', 'elevated wall top', 'marker bubble'];
for (let i = 0; i < hitTargets.length; i++) {
    roundTripHit(hitView, hitFit, hitTargets[i], `H${i + 1} ${hitLabels[i]} after automatic Fit`);
}

// Zoom in, zoom out, and pan use exactly the same inverse contract.
roundTripHit(hitView, { pan: hitFit.pan, zoom: Math.min(3, hitFit.zoom + 0.6) }, hitTargets[2], 'H8 zoom in');
roundTripHit(hitView, { pan: hitFit.pan, zoom: Math.max(0.25, hitFit.zoom - 0.35) }, hitTargets[3], 'H9 zoom out');
roundTripHit(hitView, { pan: { x: hitFit.pan.x + 63, y: hitFit.pan.y - 41 }, zoom: hitFit.zoom }, hitTargets[4], 'H10 pan');

// Resize recovery recomputes a fit but preserves hit inversion.
const resizedFit = computeSettlementFitTransform(hitView, { width: 520, height: 310 }, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
roundTripHit(hitView, resizedFit, hitTargets[0], 'H11 resize recovery');

// Fixed -> Mobile Base -> fixed and settlement preview changes cannot retain stale hit geometry.
const mobileView = viewFromTiles([tile(0, 0, 'floor'), tile(2, 0, 'quarters')], [marker(1, 0)], { settlementId: 'mb_barge' });
mobileView.markers[0].id = 'captain';
const mobileFit = computeSettlementFitTransform(mobileView, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
roundTripHit(mobileView, mobileFit, tileHit(mobileView.tiles[1]), 'H12 fixed -> Mobile Base');
roundTripHit(hitView, hitFit, hitTargets[1], 'H13 Mobile Base -> fixed');
const reedView = viewFromTiles([tile(-2, 0, 'water'), tile(3, 4, 'market')], [], { settlementId: 'set_reedmarket' });
const reedFit = computeSettlementFitTransform(reedView, canvas, { padding: 24, zoomMin: 0.25, zoomMax: 3 });
roundTripHit(reedView, reedFit, tileHit(reedView.tiles[1]), 'H14 settlement preview change');

// Outside geometry is a miss and distinct screen points cannot collapse to the first tile.
const outside = screenToSettlementContent(2, 2, hitFit.pan.x, hitFit.pan.y, hitFit.zoom, hitFit.bounds.centerX, hitFit.bounds.centerY);
check(hitTestSettlementContent(hitTargets, outside, 12, hitFit.zoom) == null, 'H15 outside geometry returns no tile');
const distinct = hitTargets.slice(0, 5).map((target, i) => roundTripHit(hitView, hitFit, target, `H16.${i + 1} distinct point`).resolved?.key);
check(new Set(distinct).size === 5, 'H16 different screen points resolve to different tiles');
check(hitTargets[0].key !== hitTargets[1].key, 'H17 tile identity never matches on undefined ids');

if (failed > 0) {
    console.error(`\n2d framing: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nSettlement 2D framing cases: ${cases}`);
console.log('webview settlement 2d framing: all passed');
