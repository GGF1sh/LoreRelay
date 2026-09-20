#!/usr/bin/env node
/**
 * Sample scenario pack validation (v1.0).
 */
const fs = require('fs');
const path = require('path');
const { validateScenarioDirectorBlock } = require('../out/scenarioDirectorCore');

const root = path.join(__dirname, '..', 'sample-scenarios');
const REQUIRED = ['lost-catacombs', 'neon-rain', 'harbor-mist', 'debug-sandbox', 'trade-routes', 'scrapbound-settlement'];
const { resolveBundledSampleDir, BUNDLED_SAMPLE_IDS } = require('../out/scenarioPackCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

for (const id of REQUIRED) {
    const dir = path.join(root, id);
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        fail(`missing ${id}/scenario.json`);
        continue;
    }
    let doc;
    try {
        doc = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
    } catch (e) {
        fail(`${id} JSON parse: ${e.message}`);
        continue;
    }
    if (doc.format !== 'text-adventure-scenario/1.0') {
        fail(`${id} format`);
        continue;
    }
    if (!doc.meta?.title || !doc.setup?.world || !doc.opening?.narrative) {
        fail(`${id} required fields`);
        continue;
    }
    if (doc.director) {
        const dErr = validateScenarioDirectorBlock(doc.director);
        if (dErr.length > 0) {
            fail(`${id} director: ${dErr.join('; ')}`);
            continue;
        }
    }
    ok(`sample scenario ${id}`);
}

for (const id of BUNDLED_SAMPLE_IDS) {
    const dir = resolveBundledSampleDir(id);
    if (!dir || !fs.existsSync(path.join(dir, 'scenario.json'))) {
        fail(`resolveBundledSampleDir(${id})`);
    } else {
        ok(`resolveBundledSampleDir(${id})`);
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All sample scenario tests passed.');
