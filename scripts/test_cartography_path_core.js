#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const corePath = path.join(__dirname, '..', 'out', 'cartographyPathCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/cartographyPathCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    validateForgePathInWorkspace,
    resolveValidatedForgePath,
    validateCartographyOutputPath,
    validateCartographyOutputDir,
    WORLD_FORGE_BASENAME,
    WORLD_MAP_LAYOUT_BASENAME,
} = require(corePath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-cart-path-'));
const forgePath = path.join(tmp, WORLD_FORGE_BASENAME);
fs.writeFileSync(forgePath, '{"format":"lorerelay-world-forge/1.0"}', 'utf-8');

if (validateForgePathInWorkspace(forgePath, tmp)) {
    ok('accepts workspace world_forge.json');
} else {
    fail('should accept workspace world_forge.json');
}

if (!validateForgePathInWorkspace(path.join(tmp, 'evil.json'), tmp)) {
    ok('rejects wrong basename');
} else {
    fail('should reject wrong basename');
}

if (!validateForgePathInWorkspace(forgePath, path.join(tmp, 'other-ws'))) {
    ok('rejects forge outside workspace');
} else {
    fail('should reject forge outside workspace');
}

if (resolveValidatedForgePath(tmp) === validateForgePathInWorkspace(forgePath, tmp)) {
    ok('resolveValidatedForgePath');
} else {
    fail('resolveValidatedForgePath mismatch');
}

const layoutOut = path.join(tmp, WORLD_MAP_LAYOUT_BASENAME);
if (validateCartographyOutputPath(layoutOut, tmp, WORLD_MAP_LAYOUT_BASENAME) === layoutOut) {
    ok('accepts workspace root layout path');
} else {
    fail('should accept workspace root layout path');
}

if (!validateCartographyOutputPath(path.join(tmp, 'output', WORLD_MAP_LAYOUT_BASENAME), tmp, WORLD_MAP_LAYOUT_BASENAME)) {
    ok('rejects nested layout path');
} else {
    fail('should reject nested layout path');
}

if (validateCartographyOutputDir(tmp, tmp) === path.normalize(tmp)) {
    ok('accepts workspace as output dir');
} else {
    fail('should accept workspace as output dir');
}

if (!validateCartographyOutputDir(path.join(tmp, 'output'), tmp)) {
    ok('rejects non-root output dir');
} else {
    fail('should reject non-root output dir');
}

try {
    fs.rmSync(tmp, { recursive: true, force: true });
} catch { /* ignore */ }

if (failed > 0) {
    process.exit(1);
}
console.log('All cartography path core tests passed.');
process.exit(0);