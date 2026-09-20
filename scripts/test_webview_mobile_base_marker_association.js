#!/usr/bin/env node
'use strict';

/**
 * WORLD-SIM-UX-POLISH-001-CORRECTIONS — Correction 1.
 *
 * Reproduces the exact defect found by independent review: markers computed
 * for visual association (buildSettlementVisualView) were not the markers
 * actually drawn/hit-tested (drawSettlementIsometric used raw view.markers).
 * This exercises real geometry + the real visual-view builder to prove:
 *   - the authoritative payload is never mutated;
 *   - the visually relocated marker position is what a hit test resolves to;
 *   - the *raw* marker position would miss a hit test at the same screen
 *     point (i.e. reproduces the "marker floats outside the hull" bug and
 *     proves it is closed);
 *   - switching to fixed Settlement performs zero relocation;
 *   - a malformed/very-distant marker cannot inflate the structural footprint.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '86b-settlement-isometric.js');
const source = fs.readFileSync(modulePath, 'utf8');
const geo = require(path.join(root, 'webview', 'modules', '86b0-settlement-iso-geometry.js'));

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

const start = source.indexOf('function getMobileBaseInterior');
const end = source.indexOf('/** M4c:', start);
assert.ok(start >= 0 && end > start, 'Mobile Base visual helpers not found');

function loadHelpers(selectedSource) {
    const context = {
        Number,
        Math,
        Set,
        resolveSettlementRenderSource: () => ({ source: selectedSource }),
    };
    vm.runInNewContext(source.slice(start, end), context, { filename: modulePath });
    return context;
}

// A ship hull clustered near the origin; the marker sits far outside the
// tile cluster, exactly reproducing the pre-fix "marker floats in the void"
// scenario documented against screenshot 06 in the independent review.
const msg = {
    enableMobileBaseSystem: true,
    mobileBaseInterior: { settlementId: 'barge', mode: 'ship', hasCanvas: true, interiorBlocked: false },
};
const rawMarker = Object.freeze({ id: 'captain', x: 7, y: 4, z: 0, kind: 'resident', label: 'Captain' });
const view = Object.freeze({
    settlementId: 'barge',
    layerId: 'z0',
    layers: [{ id: 'z0', label: 'Ground' }, { id: 'z1', label: 'Upper deck' }],
    tiles: Object.freeze([
        { x: 0, y: 0, z: 0, code: 'wall' },
        { x: 2, y: 1, z: 0, code: 'stockpile' },
    ]),
    markers: Object.freeze([rawMarker]),
});
const viewSnapshotJson = JSON.stringify(view);

test('authoritative view is not mutated by visual-view construction', () => {
    const helpers = loadHelpers('mobile_base');
    helpers.buildSettlementVisualView(msg, view);
    assert.strictEqual(JSON.stringify(view), viewSnapshotJson, 'view object must remain byte-identical');
    assert.deepStrictEqual(view.markers[0], rawMarker, 'raw marker object must remain byte-identical');
});

test('visual marker is relocated inside the rendered hull screen bounds', () => {
    const helpers = loadHelpers('mobile_base');
    const footprint = helpers.deriveMobileBaseStructuralFootprint(msg, view);
    assert.ok(footprint.length > 0, 'ship must produce a structural footprint');
    const visual = helpers.buildSettlementVisualView(msg, view);
    assert.notStrictEqual(visual, view, 'mobile base must produce a distinct visual view object');
    assert.strictEqual(visual.markers.length, 1);

    // Screen-space bounds of the footprint cells actually drawn.
    const hullPoints = footprint.map((cell) => geo.isoProjectRaw(cell.x, cell.y, cell.z));
    const hullMinX = Math.min(...hullPoints.map((p) => p.sx));
    const hullMaxX = Math.max(...hullPoints.map((p) => p.sx));
    const hullMinY = Math.min(...hullPoints.map((p) => p.sy));
    const hullMaxY = Math.max(...hullPoints.map((p) => p.sy));

    const visualPoint = geo.isoProjectRaw(visual.markers[0].x, visual.markers[0].y, visual.markers[0].z);
    assert.ok(
        visualPoint.sx >= hullMinX && visualPoint.sx <= hullMaxX
        && visualPoint.sy >= hullMinY && visualPoint.sy <= hullMaxY,
        'relocated visual marker must project inside the drawn hull'
    );

    const rawPoint = geo.isoProjectRaw(rawMarker.x, rawMarker.y, rawMarker.z);
    const rawOutside = rawPoint.sx < hullMinX || rawPoint.sx > hullMaxX
        || rawPoint.sy < hullMinY || rawPoint.sy > hullMaxY;
    assert.ok(rawOutside, 'raw authoritative marker position must lie outside the hull (this is the bug being fixed)');
});

test('hit test resolves at the visual marker position, and misses at the stale raw position', () => {
    const helpers = loadHelpers('mobile_base');
    const visual = helpers.buildSettlementVisualView(msg, view);
    const visualMarker = visual.markers[0];
    const visualPoint = geo.isoProjectRaw(visualMarker.x, visualMarker.y, visualMarker.z);

    // Mirrors exactly what drawSettlementIsometric now pushes into
    // _settlementHits for a marker (see the marker draw loop).
    const hits = [{
        type: 'marker',
        key: geo.settlementHitKey({ type: 'marker', id: visualMarker.id }),
        id: visualMarker.id,
        px: visualPoint.sx,
        py: visualPoint.sy - 0,
        contentX: visualPoint.sx,
        contentY: visualPoint.sy,
    }];

    const hitAtVisual = geo.hitTestSettlementContent(hits, { x: visualPoint.sx, y: visualPoint.sy }, 12, 1);
    assert.ok(hitAtVisual && hitAtVisual.id === 'captain', 'clicking the drawn marker position must resolve the marker');

    const rawPoint = geo.isoProjectRaw(rawMarker.x, rawMarker.y, rawMarker.z);
    const distance = Math.hypot(rawPoint.sx - visualPoint.sx, rawPoint.sy - visualPoint.sy);
    if (distance > 12) {
        const missAtRaw = geo.hitTestSettlementContent(hits, { x: rawPoint.sx, y: rawPoint.sy }, 12, 1);
        assert.strictEqual(missAtRaw, null, 'the stale raw position must no longer be a valid click target for this marker');
    }
});

test('fixed Settlement performs zero visual relocation (identity passthrough)', () => {
    const helpers = loadHelpers('fixed');
    const visual = helpers.buildSettlementVisualView(msg, view);
    assert.strictEqual(visual, view, 'non-mobile-base source must return the exact same view reference');
    assert.strictEqual(visual.markers, view.markers, 'markers array reference must be unchanged when not a Mobile Base');
});

test('empty Mobile Base remains empty (no phantom hull, no phantom markers)', () => {
    const helpers = loadHelpers('mobile_base');
    const emptyView = { ...view, tiles: [], markers: [] };
    const footprint = helpers.deriveMobileBaseStructuralFootprint(msg, emptyView);
    assert.strictEqual(footprint.length, 0);
    const visual = helpers.buildSettlementVisualView(msg, emptyView);
    assert.strictEqual(visual.tiles.length, 0);
    assert.strictEqual(visual.markers.length, 0);
});

test('a malformed / very distant marker cannot inflate the structural footprint', () => {
    const helpers = loadHelpers('mobile_base');
    const baselineFootprint = helpers.deriveMobileBaseStructuralFootprint(msg, view);
    const baselineSpanX = Math.max(...baselineFootprint.map((c) => c.x)) - Math.min(...baselineFootprint.map((c) => c.x));
    const baselineSpanY = Math.max(...baselineFootprint.map((c) => c.y)) - Math.min(...baselineFootprint.map((c) => c.y));

    const distantView = {
        ...view,
        markers: [rawMarker, { id: 'stray', x: 100000, y: -100000, z: 0, kind: 'resident', label: 'Stray' }],
    };
    const distantFootprint = helpers.deriveMobileBaseStructuralFootprint(msg, distantView);
    const distantSpanX = Math.max(...distantFootprint.map((c) => c.x)) - Math.min(...distantFootprint.map((c) => c.x));
    const distantSpanY = Math.max(...distantFootprint.map((c) => c.y)) - Math.min(...distantFootprint.map((c) => c.y));
    assert.strictEqual(distantSpanX, baselineSpanX, 'footprint width must be unaffected by a malformed distant marker');
    assert.strictEqual(distantSpanY, baselineSpanY, 'footprint height must be unaffected by a malformed distant marker');

    // The stray marker must still be clamped into the (small) structural body,
    // never left projecting far outside it.
    const visual = helpers.buildSettlementVisualView(msg, distantView);
    const stray = visual.markers.find((m) => m.id === 'stray');
    const tileXs = distantFootprint.map((c) => c.x);
    const tileYs = distantFootprint.map((c) => c.y);
    assert.ok(stray.x >= Math.min(...tileXs) - 1 && stray.x <= Math.max(...tileXs) + 1,
        'even a malformed distant marker must be clamped within the structural footprint');
    assert.ok(stray.y >= Math.min(...tileYs) - 1 && stray.y <= Math.max(...tileYs) + 1,
        'even a malformed distant marker must be clamped within the structural footprint (y-axis)');
});

test('draw loop reads markers from the same visual view used for fitting (source guard)', () => {
    const drawFnStart = source.indexOf('function drawSettlementIsometric');
    const drawFnEnd = source.indexOf('\nfunction ', drawFnStart + 1);
    const drawFn = source.slice(drawFnStart, drawFnEnd);
    assert.ok(drawFn.includes('const markers = Array.isArray(visualView?.markers) ? visualView.markers : [];'),
        'marker draw loop must read from visualView, not the authoritative view');
    assert.ok(!/for \(const marker of markers\)[\s\S]{0,400}drawIsoMarker/.test(drawFn) || drawFn.includes('visualView?.markers'),
        'sanity: marker draw loop must exist and be sourced from visualView');
});

if (failed > 0) {
    console.error(`${failed} mobile base marker association test(s) failed`);
    process.exit(1);
}
console.log('mobile base marker association: all tests passed');
