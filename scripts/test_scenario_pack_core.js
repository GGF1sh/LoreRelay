#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const corePath = path.join(__dirname, '..', 'out', 'scenarioPackCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/scenarioPackCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    applyScenarioLocaleOverlay,
    resolveBundledSampleDir,
    BUNDLED_SAMPLE_IDS,
    OPTIONAL_PACK_FILES,
} = require(corePath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!Array.isArray(BUNDLED_SAMPLE_IDS) || BUNDLED_SAMPLE_IDS.length !== 6) {
    fail('BUNDLED_SAMPLE_IDS length');
} else {
    ok('BUNDLED_SAMPLE_IDS length');
}

if (!OPTIONAL_PACK_FILES.includes('world_forge.json') || !OPTIONAL_PACK_FILES.includes('world_map.layout.png')) {
    fail('OPTIONAL_PACK_FILES contents');
} else if (!OPTIONAL_PACK_FILES.includes('campaign_kit.json') || !OPTIONAL_PACK_FILES.includes('discoveries.json')) {
    fail('OPTIONAL_PACK_FILES should include campaign_kit.json and discoveries.json');
} else {
    ok('OPTIONAL_PACK_FILES contents');
}

if (resolveBundledSampleDir('not-a-pack') !== undefined) {
    fail('reject unknown sample id');
} else {
    ok('reject unknown sample id');
}

if (resolveBundledSampleDir('') !== undefined) {
    fail('reject empty sample id');
} else {
    ok('reject empty sample id');
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-pack-'));

const fallback = resolveBundledSampleDir('lost-catacombs', tmpRoot);
if (!fallback || fallback.includes(tmpRoot)) {
    fail('falls back to repo when extRoot lacks scenario.json', fallback);
} else {
    ok('falls back to repo when extRoot lacks scenario.json');
}

// extRoot only works for ids in BUNDLED_SAMPLE_IDS — use harbor-mist with custom extRoot layout
const harborDir = path.join(tmpRoot, 'sample-scenarios', 'harbor-mist');
fs.mkdirSync(harborDir, { recursive: true });
fs.writeFileSync(path.join(harborDir, 'scenario.json'), '{"format":"text-adventure-scenario/1.0"}', 'utf-8');
const viaExt = resolveBundledSampleDir('harbor-mist', tmpRoot);
if (!viaExt || !viaExt.includes('harbor-mist')) {
    fail('resolve via extRoot + sample-scenarios layout', viaExt);
} else {
    ok('resolve via extRoot + sample-scenarios layout');
}

for (const id of BUNDLED_SAMPLE_IDS) {
    const dir = resolveBundledSampleDir(id);
    if (!dir || !fs.existsSync(path.join(dir, 'scenario.json'))) {
        fail(`resolveBundledSampleDir(${id}) from repo`);
    } else {
        ok(`resolveBundledSampleDir(${id}) from repo`);
    }
}

{
    const localized = applyScenarioLocaleOverlay({
        meta: { title: 'Base' },
        opening: { status: { location: 'Market' } },
        locales: {
            ja: {
                meta: { title: 'Japanese' },
                opening: { status: { location: '市場', time: '夕方' } }
            }
        }
    }, 'ja');
    if (localized.meta?.title !== 'Japanese' || localized.opening?.status?.location !== '市場') {
        fail('applyScenarioLocaleOverlay merges localized fields');
    } else if (localized.opening.status.time !== '夕方') {
        fail('applyScenarioLocaleOverlay preserves nested additions');
    } else if ('locales' in localized) {
        fail('applyScenarioLocaleOverlay strips locale table from localized copy');
    } else {
        ok('applyScenarioLocaleOverlay merges locale data');
    }
}

try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch { /* ignore */ }

if (failed > 0) {
    process.exit(1);
}
console.log('All scenario pack core tests passed.');
