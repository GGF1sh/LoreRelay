#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const applyPath = path.join(root, 'out', 'rulesProfileApplyCore.js');
const gameRulesPath = path.join(root, 'out', 'gameRulesCore.js');

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(actual, expected, m) {
    if (actual === expected) { ok(m); } else { fail(`${m} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}
function truthy(value, m) {
    if (value) { ok(m); } else { fail(`${m} (got ${JSON.stringify(value)})`); }
}
function falsy(value, m) {
    if (!value) { ok(m); } else { fail(`${m} (got ${JSON.stringify(value)})`); }
}

for (const p of [applyPath, gameRulesPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile`);
        process.exit(1);
    }
}

const { buildRulesProfileApplication } = require(applyPath);
const { DEFAULT_GAME_RULES } = require(gameRulesPath);

{
    const current = { ...DEFAULT_GAME_RULES, defaultMaxHp: 77, enableCommerce: false };
    const result = buildRulesProfileApplication(current, {
        genre: 'post_apocalypse',
        playstyle: 'vehicle',
        pressure: 'survival',
        bookkeeping: 'minimal',
    });
    eq(result.profile.normalizedAnswers.genre, 'post_apocalypse', 'host gate normalizes answers');
    eq(result.mergedRules.defaultMaxHp, 77, 'unrelated manual rule survives profile apply');
    eq(result.mergedRules.enableVehicleSystem, true, 'vehicle profile enables vehicle system');
    eq(result.mergedRules.campaignKitId, 'postapoc_scavenger', 'campaign kit applied');
    eq(result.mergedRules.enableCommerceUi, false, 'minimal bookkeeping profile applied');
    truthy(result.changedKeys.includes('enableVehicleSystem'), 'changedKeys includes enabled vehicle');
    falsy(result.changedKeys.includes('defaultMaxHp'), 'changedKeys excludes unchanged unrelated rule');
}

{
    const a = buildRulesProfileApplication(DEFAULT_GAME_RULES, {
        genre: 'sci fi',
        playstyle: 'mobile base',
        pressure: 'standard',
        bookkeeping: 'light',
    });
    const b = buildRulesProfileApplication(DEFAULT_GAME_RULES, {
        genre: 'sci fi',
        playstyle: 'mobile base',
        pressure: 'standard',
        bookkeeping: 'light',
    });
    eq(JSON.stringify(a), JSON.stringify(b), 'application output is deterministic');
    eq(a.mergedRules.enableMobileBaseSystem, true, 'mobile base survives normalize');
    eq(a.mergedRules.enableSettlementMode, true, 'mobile base dependency settlement enabled');
    eq(a.mergedRules.enableVehicleSystem, true, 'mobile base dependency vehicle enabled');
}

{
    const result = buildRulesProfileApplication({ diceDifficulty: 'Bogus', maxNamedNpcCount: -5 }, {
        genre: '???',
        playstyle: '???',
        imageGenerationWanted: 'maybe',
    });
    eq(result.currentRules.diceDifficulty, DEFAULT_GAME_RULES.diceDifficulty, 'invalid current dice falls back');
    eq(result.currentRules.maxNamedNpcCount, 1, 'invalid current cap clamps to safe minimum');
    eq(result.profile.normalizedAnswers.genre, 'fantasy', 'invalid answer genre falls back');
    truthy(result.profile.warnings.length >= 3, 'invalid answers produce warnings through gate');
}

{
    const result = buildRulesProfileApplication({ unsupportedGenesisKey: true }, {});
    eq(result.mergedRules.unsupportedGenesisKey, undefined, 'merged output drops unsupported input keys');
}

// GENESIS-CHAT-LIGHTWEIGHT-001: host apply gate matches lightweight chat patch
{
    const a = buildRulesProfileApplication(DEFAULT_GAME_RULES, {
        genre: 'fantasy',
        playstyle: 'character_chat',
        pressure: 'standard',
        bookkeeping: 'detailed',
    });
    const b = buildRulesProfileApplication(DEFAULT_GAME_RULES, {
        genre: 'fantasy',
        playstyle: 'character_chat',
        pressure: 'standard',
        bookkeeping: 'detailed',
    });
    eq(JSON.stringify(a.mergedRules), JSON.stringify(b.mergedRules), 'host chat apply is deterministic');
    eq(a.mergedRules.enableWorldForge, false, 'host chat: forge off');
    eq(a.mergedRules.enableCampaignKit, false, 'host chat: campaign kit off');
    eq(a.mergedRules.enableNpcRegistry, false, 'host chat: npc registry off');
    eq(a.mergedRules.enableCommerce, false, 'host chat: commerce off');
    eq(a.mergedRules.enableRpgMechanics, false, 'host chat: RPG mechanics off');
    // Preview/host parity: patch keys that host applies must keep chat systems off.
    eq(a.profile.rulesPatch.enableWorldForge, false, 'profile patch forge matches host');
    eq(a.profile.rulesPatch.enableCampaignKit, a.mergedRules.enableCampaignKit, 'preview patch campaign matches merged');
}

// Manual hp survives; chat-owned keys still forced off
{
    const current = { ...DEFAULT_GAME_RULES, defaultMaxHp: 42, enableWorldForge: true, enableCampaignKit: true };
    const result = buildRulesProfileApplication(current, { playstyle: 'character_chat' });
    eq(result.mergedRules.defaultMaxHp, 42, 'unrelated manual hp survives chat apply');
    eq(result.mergedRules.enableWorldForge, false, 'chat owns forge key and turns it off over prior adventure');
    eq(result.mergedRules.enableCampaignKit, false, 'chat owns campaign kit key');
}

if (failed > 0) {
    console.error(`rulesProfileApplyCore: ${failed} test(s) failed`);
    process.exit(1);
}
console.log('rulesProfileApplyCore: all tests passed.');
