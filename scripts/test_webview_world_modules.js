const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Webview World / Tile Overmap module wiring...');

const indexHtml = read('webview', 'index.html');
const bundle = read('webview', 'script.js');
const worldModule = read('webview', 'modules', '85-world.js');
const tileModule = read('webview', 'modules', '86-tile-overmap.js');
const buildScript = read('scripts', 'build-webview.js');

const htmlSymbols = [
    'id="pane-world"',
    'id="world-content"',
    'id="world-map-mode-mermaid"',
    'id="world-map-mode-parchment"',
    'id="world-map-mode-tile"',
    'id="world-map-mode-settlement"',
    'id="world-map-mode-diorama"',
    'id="world-mermaid"',
    'id="world-cartography"',
    'id="world-overmap"',
    'id="world-overmap-canvas"',
    'id="world-settlement"',
    'id="world-settlement-canvas"',
    'id="world-diorama"',
    'id="world-diorama-stage"',
    'id="world-diorama-canvas"',
];
for (const symbol of htmlSymbols) {
    assert(indexHtml.includes(symbol), `webview/index.html is missing ${symbol}`);
}
console.log('ok: World tab map mode DOM exists');

assert(
    buildScript.indexOf("'85-world.js'") < buildScript.indexOf("'86-tile-overmap.js'"),
    '85-world.js must be bundled before 86-tile-overmap.js so shared globals are initialized before use'
);
assert(
    buildScript.indexOf("'86-tile-overmap.js'") < buildScript.indexOf("'86b-settlement-isometric.js'"),
    '86b-settlement-isometric.js must be bundled after tile overmap module'
);
assert(
    buildScript.indexOf("'86b-settlement-isometric.js'") < buildScript.indexOf("'86c-settlement-diorama.js'"),
    '86c-settlement-diorama.js must be bundled after 86b-settlement-isometric.js'
);
console.log('ok: World modules are bundled in the expected order');

const worldSymbols = [
    "setWorldMapMode('tile')",
    'applyWorldMapModeVisibility',
    "_tileOvermapMsg = msg",
    'drawTileOvermap()',
    'worldMapMode === \'tile\'',
];
for (const symbol of worldSymbols) {
    assert(worldModule.includes(symbol), `85-world.js is missing ${symbol}`);
    assert(bundle.includes(symbol), `webview/script.js bundle is missing ${symbol}`);
}
console.log('ok: World map mode switch calls tile renderer');

const fogSymbols = [
    'world-fog-overlay',
    'getRegionFogVisibility',
    'renderFogOverlays',
    'resolveTileRegionFog',
    'fogRegionLayout',
];

const pinSymbols = [
    'world-location-detail',
    'selectWorldLocationPin',
    'renderWorldLocationDetailPanel',
    'insertChatText',
    'hitTestWorldPin',
    'WORLD_PIN_HIT_RADIUS_PX',
    'locationPinCatalog',
    'wireParchmentWorldPin',
    'initMermaidPinClicks',
];
for (const symbol of pinSymbols) {
    assert(
        indexHtml.includes(symbol) || worldModule.includes(symbol) || tileModule.includes(symbol) || bundle.includes(symbol),
        `pin interaction symbol missing: ${symbol}`
    );
}
console.log('ok: World pin interaction symbols are bundled');

const feedbackSymbols = [
    'regionMapFeedback',
    'danger-tier-medium',
    'danger-tier-high',
    'world-map-event-badge',
    'faction-tint-friendly',
    'maybeFlashHighDangerEntry',
    'drawDangerRing',
];
for (const symbol of feedbackSymbols) {
    assert(
        worldModule.includes(symbol) || tileModule.includes(symbol) || bundle.includes(symbol),
        `map feedback symbol missing: ${symbol}`
    );
}
console.log('ok: Dynamic map feedback symbols are bundled');
for (const symbol of fogSymbols) {
    assert(worldModule.includes(symbol) || tileModule.includes(symbol), `fog symbol missing: ${symbol}`);
    assert(bundle.includes(symbol), `webview/script.js bundle is missing fog symbol ${symbol}`);
}
console.log('ok: Fog of War webview symbols are bundled');

const tileSymbols = [
    'TILE_OVERMAP_ASCII_THEME',
    'TILE_OVERMAP_THEME_OVERRIDES',
    'function drawTileOvermap()',
    "msg.overmapThemeKey || 'fantasy'",
    'TILE_OVERMAP_ASCII_THEME[code] || TILE_OVERMAP_ASCII_THEME.o',
    'world-overmap-empty',
];
for (const symbol of tileSymbols) {
    assert(tileModule.includes(symbol), `86-tile-overmap.js is missing ${symbol}`);
    assert(bundle.includes(symbol), `webview/script.js bundle is missing ${symbol}`);
}
console.log('ok: Tile overmap renderer and fallback theme are bundled');

const overlaySymbols = [
    'MAP_OVERLAY_MARKER_STYLE',
    'drawMapOverlayMarkers',
    'initMapOverlayHover',
    'hitTestMapOverlayMarker',
    'msg.mapOverlay',
    'world-map-overlay-tooltip',
    'fogVisibility',
];
for (const symbol of overlaySymbols) {
    assert(
        tileModule.includes(symbol) || worldModule.includes(symbol) || bundle.includes(symbol),
        `map overlay symbol missing: ${symbol}`
    );
}
console.log('ok: Settlement map overlay symbols are bundled');

const settlementSymbols = [
    'function drawSettlementIsometric()',
    'initSettlementIsometricControls',
    'SETTLEMENT_TILE_COLORS',
    "type: 'setSettlementViewLayer'",
    'syncSettlementMapModeUi',
    "worldMapMode === 'settlement'",
    'world-settlement-detail',
    'world-settlement-marker-fallback',
    'data-settlement-layer',
];
const settlementModule = read('webview', 'modules', '86b-settlement-isometric.js');
for (const symbol of settlementSymbols) {
    assert(
        settlementModule.includes(symbol) || worldModule.includes(symbol) || bundle.includes(symbol),
        `settlement isometric symbol missing: ${symbol}`
    );
}
console.log('ok: Settlement isometric renderer symbols are bundled');

// M4c: UX preview/request flow — ghost preview + GM request only, no disk writes.
const settlementExpandSymbols = [
    'function renderSettlementExpandPanel(',
    'function drawSettlementGhostPreview(',
    'getSettlementExpansionPreviews',
    'settlementExpansionPreviews',
    'buildSettlementExpandRequestText',
    "type: 'insertChatText'",
    'world-settlement-expand-panel',
    'world-settlement-expand-buttons',
    'data-expand-layer',
    'data-expand-profile',
];
for (const symbol of settlementExpandSymbols) {
    assert(
        settlementModule.includes(symbol) || worldModule.includes(symbol) || bundle.includes(symbol),
        `settlement M4c expand symbol missing: ${symbol}`
    );
}
assert(
    !settlementModule.includes('writeJsonAtomic') && !settlementModule.includes("require('fs')") && !settlementModule.includes('require("fs")'),
    'settlement isometric module must not touch fs/disk (M4c UX stays preview/request only)'
);
assert(indexHtml.includes('id="world-settlement-expand-panel"'), 'world-settlement-expand-panel markup missing from index.html');
console.log('ok: Settlement M4c expand preview/request symbols are bundled');

// M5b: read-only Three.js diorama renderer — no state writes, no chat insertion, no fs.
const dioramaModule = read('webview', 'modules', '86c-settlement-diorama.js');
const dioramaSymbols = [
    'function renderSettlementDiorama()',
    'function disposeSettlementDiorama()',
    'function initSettlementDioramaControls()',
    'enableSettlementDiorama',
    'settlementDiorama',
    "worldMapMode === 'diorama'",
    'syncDioramaMapModeUi',
    'world-diorama-detail',
    'world-diorama-marker-fallback',
    'world-diorama-unavailable',
];
for (const symbol of dioramaSymbols) {
    assert(
        dioramaModule.includes(symbol) || worldModule.includes(symbol) || bundle.includes(symbol),
        `settlement diorama (M5b) symbol missing: ${symbol}`
    );
}
assert(
    !dioramaModule.includes('insertChatText')
    && !dioramaModule.includes('writeJsonAtomic')
    && !dioramaModule.includes("require('fs')")
    && !dioramaModule.includes('require("fs")')
    && !dioramaModule.includes('settlementOps'),
    '86c-settlement-diorama.js must stay read-only: no insertChatText/writeJsonAtomic/fs/settlementOps'
);
assert(indexHtml.includes('id="world-diorama-marker-fallback"'), 'world-diorama-marker-fallback markup missing from index.html');
assert(indexHtml.includes('id="world-diorama-unavailable"'), 'world-diorama-unavailable markup missing from index.html');
assert(
    indexHtml.includes('__LR_THREE_SCRIPT_URI__'),
    'index.html must expose threeUri for M5 lazy loading'
);
assert(
    !bundle.includes('Three.js Authors'),
    'Three.js vendor must not be prepended into script.js (M5 lazy load)'
);
assert(
    dioramaModule.includes('loadThreeJsLazy'),
    '86c-settlement-diorama.js must lazy-load Three.js'
);
assert(
    !buildScript.includes('fs.readFileSync(threeMinPath'),
    'build-webview.js must not prepend three.min.js into script.js'
);
console.log('ok: Settlement Diorama (M5b) renderer symbols are bundled and read-only');

const worldPaneStart = indexHtml.indexOf('<div id="pane-world"');
const worldPaneEnd = indexHtml.indexOf('</div> <!-- /pane-world -->');
assert(worldPaneStart >= 0 && worldPaneEnd > worldPaneStart, 'pane-world markers are invalid');
const worldPaneHtml = indexHtml.slice(worldPaneStart, worldPaneEnd + '</div>'.length);
const opens = (worldPaneHtml.match(/<div\b/g) || []).length;
const closes = (worldPaneHtml.match(/<\/div>/g) || []).length;
assert.strictEqual(opens, closes, `pane-world has unbalanced div tags (${opens} opens, ${closes} closes)`);
console.log('ok: pane-world div structure is balanced');

const animModule = read('webview', 'modules', '84a-webview-anim.js');
assert(
    buildScript.indexOf("'84-party.js'") < buildScript.indexOf("'84a-webview-anim.js'")
    && buildScript.indexOf("'84a-webview-anim.js'") < buildScript.indexOf("'85-world.js'"),
    '84a-webview-anim.js must be bundled after 84-party.js and before 85-world.js'
);
const animSymbols = [
    'window.LR_anim',
    'register',
    'unregister',
    'isMotionEnabled',
    'getEffectsTier',
    'setEffectsTier',
    'prefers-reduced-motion',
    'visibilitychange',
];
for (const symbol of animSymbols) {
    assert(animModule.includes(symbol), `84a-webview-anim.js is missing ${symbol}`);
    assert(bundle.includes(symbol), `webview/script.js bundle is missing anim symbol ${symbol}`);
}
console.log('ok: Graphics Upgrade Track 1 animation driver (LR_anim) is bundled');

const atmosphereSymbols = [
    'registerTileOvermapAnimation',
    'unregisterTileOvermapAnimation',
    '_tileAnimPhase',
    'drawEmberParticle',
    'scaleRgbaAlpha',
    'world-effects-tier-btn',
];
for (const symbol of atmosphereSymbols) {
    assert(
        tileModule.includes(symbol) || indexHtml.includes(symbol),
        `Atmosphere Pass symbol missing: ${symbol}`
    );
    assert(bundle.includes(symbol) || indexHtml.includes(symbol), `Atmosphere Pass symbol missing from bundle/html: ${symbol}`);
}
assert(
    worldModule.includes('registerTileOvermapAnimation') && worldModule.includes('unregisterTileOvermapAnimation'),
    '85-world.js must register/unregister the tile atmosphere animation on map mode switch'
);
console.log('ok: Tile Overmap Atmosphere Pass (Track 1) is wired');

console.log('Webview World / Tile Overmap smoke test passed.');
