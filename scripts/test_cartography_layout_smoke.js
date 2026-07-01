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