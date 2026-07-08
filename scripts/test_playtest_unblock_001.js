#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'webview', 'index.html');
const bundlePath = path.join(root, 'webview', 'script.js');
const scenarioPath = path.join(root, 'sample-scenarios', 'scrapbound-settlement', 'scenario.json');
const scenarioPackCorePath = path.join(root, 'out', 'scenarioPackCore.js');
const protagonistCorePath = path.join(root, 'out', 'protagonistBootstrapCore.js');

let failed = 0;
function fail(message) {
    console.error(`FAIL: ${message}`);
    failed++;
}
function ok(message) {
    console.log(`OK: ${message}`);
}

for (const p of [htmlPath, bundlePath, scenarioPath, scenarioPackCorePath, protagonistCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`missing ${path.relative(root, p)} (run npm run compile first)`);
        process.exit(1);
    }
}

const { applyScenarioLocaleOverlay } = require(scenarioPackCorePath);
const { parseProtagonistDraft } = require(protagonistCorePath);

{
    const html = fs.readFileSync(htmlPath, 'utf8');
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const requiredHtml = ['start-hub-home-btn', 'start-hub-resume-btn'];
    for (const id of requiredHtml) {
        if (!html.includes(id)) {
            fail(`webview/index.html should contain ${id}`);
        }
    }
    const requiredBundle = ['startHubForcedVisible', 'openStartHubHome', 'resumeCurrentSession'];
    for (const symbol of requiredBundle) {
        if (!bundle.includes(symbol)) {
            fail(`webview/script.js should contain ${symbol}`);
        }
    }
    if (failed === 0) {
        ok('start hub home/resume controls are bundled');
    }
}

{
    const rawScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    const localized = applyScenarioLocaleOverlay(rawScenario, 'ja');
    const draft = parseProtagonistDraft(localized.setup && localized.setup.playerCharacter);
    if (localized.meta.title !== 'スクラップバウンド居住区') {
        fail('Scrapbound ja overlay should localize title');
    } else if (!String(localized.opening.narrative || '').includes('スクラップバウンド')) {
        fail('Scrapbound ja overlay should localize opening narrative');
    } else if (!draft || draft.name !== 'レン・ヴェイル') {
        fail('Scrapbound ja overlay should expose a starter protagonist draft');
    } else {
        ok('Scrapbound ja overlay and starter protagonist are present');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('PLAYTEST-UNBLOCK-001 tests passed.');
