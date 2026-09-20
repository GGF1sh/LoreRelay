#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const forgePath = path.join(root, 'sample-scenarios', 'lost-catacombs', 'world_forge.json');
const renderScript = path.join(root, 'scripts', 'render_cartography_layout.py');
const bundledLayout = path.join(root, 'sample-scenarios', 'lost-catacombs', 'world_map.layout.png');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(forgePath)) {
    fail('lost-catacombs world_forge.json missing');
    process.exit(1);
}

const forge = JSON.parse(fs.readFileSync(forgePath, 'utf-8'));
const regions = forge?.geography?.regions ?? [];
if (regions.length < 2) {
    fail('demo forge should have at least 2 regions');
} else {
    ok('demo forge has regions');
}

const withCoords = regions.filter((r) => typeof r.x === 'number' && typeof r.y === 'number');
if (withCoords.length !== regions.length) {
    fail('all demo regions should have x/y');
} else {
    ok('demo regions have x/y coordinates');
}

const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-layout-smoke-'));
const tmpForge = path.join(tmpWs, 'world_forge.json');
fs.copyFileSync(forgePath, tmpForge);
const tmpOut = path.join(tmpWs, 'world_map.layout.png');
const python = process.platform === 'win32' ? 'python' : 'python3';
// Regression: a 128-grid sea must cover every output pixel, not isolated dots;
// rivers must remain blue in external-AI layouts and black in lineart masks.
const hydroPixels = spawnSync(python, ['-c', `
import sys
sys.path.insert(0, sys.argv[1])
import render_cartography_layout as r
s = {"size":256,"waterways":{"seaRows":["1"*128]*128,"roads":[],"crossings":[],"edges":[{"kind":"major","points":[{"x":200,"y":500},{"x":800,"y":500}]}]}}
c = r.Canvas(256,256,r.WHITE)
r.draw_waterways(c,s,r.LINE_RGB)
pixel = lambda x,y: tuple(c.pixels[(y*256+x)*3:(y*256+x)*3+3])
assert pixel(20,20) == r.BIOME_RGB["coast"] and pixel(21,20) == r.BIOME_RGB["coast"]
assert pixel(128,r.map_to_px(500,256)) == (50,160,225)
assert c.to_png().startswith(bytes([137,80,78,71,13,10,26,10]))
r.draw_waterways(c,s,r.LINE_RGB,True)
assert pixel(128,r.map_to_px(500,256)) == (0,0,0)
`, path.dirname(renderScript)], { encoding: 'utf8', timeout: 60000 });
if (hydroPixels.status !== 0) fail(`hydrology PNG coverage/color failed: ${hydroPixels.stderr}`);
else ok('hydrology covers full sea cells and preserves river color/lineart');
const proc = spawnSync(python, [renderScript, tmpForge, tmpOut, '--size', '512', '--layout-mode', 'voronoi'], {
    encoding: 'utf-8',
    timeout: 60000,
});

if (proc.status !== 0) {
    fail(`render_cartography_layout.py exited ${proc.status}: ${proc.stderr || proc.stdout}`);
} else {
    ok('render_cartography_layout.py succeeds');
}

if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 100) {
    fail('layout PNG missing or too small');
} else {
    ok('layout PNG generated');
}

try { fs.rmSync(tmpWs, { recursive: true, force: true }); } catch { /* ignore */ }

if (!fs.existsSync(bundledLayout) || fs.statSync(bundledLayout).size < 100) {
    fail('bundled sample world_map.layout.png missing — regenerate with scripts/regenerate_cartography_demo_layout.js');
} else {
    ok('bundled sample world_map.layout.png present');
}

if (failed > 0) {
    process.exit(1);
}
console.log('Cartography layout smoke test passed.');
process.exit(0);
