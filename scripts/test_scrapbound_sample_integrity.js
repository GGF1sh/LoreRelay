#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sampleDir = path.join(root, 'sample-scenarios', 'scrapbound-settlement');

const worldForgeCore = path.join(root, 'out', 'worldForgeCore.js');
const commerceCore = path.join(root, 'out', 'livingWorldForgeCore.js');
const kitCore = path.join(root, 'out', 'campaignKitCore.js');
const ledgerCore = path.join(root, 'out', 'discoveryLedgerCore.js');
const scenarioPackCore = path.join(root, 'out', 'scenarioPackCore.js');
const protagonistCore = path.join(root, 'out', 'protagonistBootstrapCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [worldForgeCore, commerceCore, kitCore, ledgerCore, scenarioPackCore, protagonistCore]) {
    if (!fs.existsSync(p)) {
        fail(`${path.basename(p)} missing — run npm run compile`);
        process.exit(1);
    }
}

const { parseWorldForge } = require(worldForgeCore);
const { parseCommerceForge } = require(commerceCore);
const { parseCampaignKitConfig } = require(kitCore);
const { parseDiscoveryLedger } = require(ledgerCore);
const { applyScenarioLocaleOverlay } = require(scenarioPackCore);
const { parseProtagonistDraft } = require(protagonistCore);

function readJson(name) {
    return JSON.parse(fs.readFileSync(path.join(sampleDir, name), 'utf-8'));
}

{
    const rules = readJson('game_rules.json');
    if (rules.playerRole !== 'adventurer') {
        fail(`playerRole must be a valid LW role, got ${rules.playerRole}`);
    } else if (!rules.enableCampaignKit || rules.campaignKitId !== 'postapoc_scavenger') {
        fail('game_rules should enable postapoc scavenger kit');
    } else {
        ok('game_rules valid playerRole and campaign kit flags');
    }
}

{
    const rawForge = readJson('world_forge.json');
    const forge = parseWorldForge(rawForge);
    const commerce = parseCommerceForge(rawForge.commerce);
    if (!forge || forge.geography.locations.length < 3) {
        fail('world_forge should parse with locations');
    } else if (!commerce || commerce.commodities.length < 4 || commerce.markets.length < 1) {
        fail('commerce block should parse commodities and markets');
    } else {
        ok('world_forge and commerce block parse');
    }
}

{
    const kit = parseCampaignKitConfig(readJson('campaign_kit.json'));
    const ledger = parseDiscoveryLedger(readJson('discoveries.json'));
    if (!kit || kit.id !== 'scrapbound_demo') {
        fail('campaign_kit.json should parse');
    } else if (!ledger || ledger.entries.length < 2) {
        fail('discoveries.json should parse seed entries');
    } else {
        ok('campaign kit and discoveries parse');
    }
}

{
    const localized = applyScenarioLocaleOverlay(readJson('scenario.json'), 'ja');
    const starter = parseProtagonistDraft(localized.setup && localized.setup.playerCharacter);
    if (!starter || !starter.name || !starter.description) {
        fail('localized starter protagonist should parse');
    } else if (localized.meta.title !== 'スクラップバウンド居住区') {
        fail('ja overlay should localize sample title');
    } else if (localized.opening.status.location !== 'スクラップバウンド市場通り') {
        fail('ja overlay should localize opening status');
    } else {
        ok('localized starter protagonist and opening data parse');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('scrapbound sample integrity: all tests passed.');
