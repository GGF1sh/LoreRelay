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
    validateCartographyGeneratedImagePath,
    resolveWorldMapImagePath,
    resolveWorldMapLayoutPath,
    WORLD_FORGE_BASENAME,
    WORLD_MAP_LAYOUT_BASENAME,
    WORLD_MAP_IMAGE_BASENAME,
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

const tempMap = path.join(tmp, 'world_map_a1b2c3d4.png');
fs.writeFileSync(tempMap, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
if (validateCartographyGeneratedImagePath(tempMap, tmp)) {
    ok('accepts valid temp world_map PNG in workspace root');
} else {
    fail('should accept valid temp world_map PNG in workspace root');
}

if (!validateCartographyGeneratedImagePath(path.join(tmp, 'evil.png'), tmp)) {
    ok('rejects non-temp map basename');
} else {
    fail('should reject non-temp map basename');
}

const nestedMap = path.join(tmp, 'output', 'world_map_a1b2c3d4.png');
fs.mkdirSync(path.join(tmp, 'output'), { recursive: true });
fs.writeFileSync(nestedMap, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
if (!validateCartographyGeneratedImagePath(nestedMap, tmp)) {
    ok('rejects nested temp world_map PNG');
} else {
    fail('should reject nested temp world_map PNG');
}

if (!validateCartographyGeneratedImagePath(path.join(tmp, 'world_map_NOTHEX.png'), tmp)) {
    ok('rejects invalid temp map hex pattern');
} else {
    fail('should reject invalid temp map hex pattern');
}

if (!validateForgePathInWorkspace(forgePath, '')) {
    ok('rejects empty workspace path');
} else {
    fail('should reject empty workspace path');
}

if (!validateCartographyOutputDir('', tmp)) {
    ok('rejects empty output dir');
} else {
    fail('should reject empty output dir');
}

if (resolveWorldMapImagePath(tmp) === path.join(tmp, WORLD_MAP_IMAGE_BASENAME)) {
    ok('resolveWorldMapImagePath');
} else {
    fail('resolveWorldMapImagePath');
}

if (resolveWorldMapLayoutPath(tmp) === path.join(tmp, WORLD_MAP_LAYOUT_BASENAME)) {
    ok('resolveWorldMapLayoutPath');
} else {
    fail('resolveWorldMapLayoutPath');
}

try {
    fs.rmSync(tmp, { recursive: true, force: true });
} catch { /* ignore */ }

if (failed > 0) {
    process.exit(1);
}
console.log('All cartography path core tests passed.');
process.exit(0);