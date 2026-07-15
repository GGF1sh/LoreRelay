#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'rulesProfileCore.js');
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

for (const p of [corePath, gameRulesPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile`);
        process.exit(1);
    }
}

const {
    resolveRulesProfile,
    normalizeGenesisAnswers,
} = require(corePath);
const { DEFAULT_GAME_RULES, normalizeGameRules } = require(gameRulesPath);

const allowedKeys = new Set(Object.keys(DEFAULT_GAME_RULES));
function assertPatchKeysSupported(patch, label) {
    const bad = Object.keys(patch).filter((k) => !allowedKeys.has(k));
    if (bad.length) {
        fail(`${label}: unsupported rulesPatch keys ${bad.join(', ')}`);
    } else {
        ok(`${label}: rulesPatch keys are supported`);
    }
}

function assertDeterministic(input, label) {
    const a = resolveRulesProfile(input);
    const b = resolveRulesProfile(JSON.parse(JSON.stringify(input)));
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail(`${label}: output should be deterministic`);
    } else {
        ok(`${label}: output deterministic`);
    }
}

{
    const result = resolveRulesProfile({});
    eq(result.normalizedAnswers.genre, 'fantasy', 'default genre fantasy');
    eq(result.normalizedAnswers.playstyle, 'adventure', 'default playstyle adventure');
    eq(result.rulesPatch.campaignKitId, 'classic_fantasy_guild', 'fantasy uses classic_fantasy_guild');
    eq(result.rulesPatch.enableWorldForge, true, 'default enables world forge');
    eq(result.rulesPatch.enableCampaignKit, true, 'default enables campaign kit');
    eq(result.rulesPatch.enableVehicleSystem, undefined, 'default does not enable vehicle system');
    eq(result.rulesPatch.enableSettlementMode, undefined, 'default does not enable settlement mode');
    eq(result.rulesPatch.diceDifficulty, 'Normal', 'default pressure normal');
    eq(result.assetHint.guideWebviewPath, 'assets/genesis/guide_fantasy_goddess.png', 'default asset uses fantasy guide');
    eq(result.assetHint.backgroundWebviewPath, 'assets/genesis/background_fantasy.png', 'default asset uses fantasy background');
    assertPatchKeysSupported(result.rulesPatch, 'default fantasy adventure');
    truthy(result.summary.includes('Fantasy / Adventure'), 'summary names default profile');
}

{
    const result = resolveRulesProfile({
        genre: 'post-apocalypse',
        playstyle: 'vehicle',
        pressure: 'survival',
        bookkeeping: 'minimal',
        protagonistMode: 'manual',
        imageGenerationWanted: false,
    });
    eq(result.normalizedAnswers.genre, 'post_apocalypse', 'hyphenated post-apocalypse normalized');
    eq(result.rulesPatch.campaignKitId, 'postapoc_scavenger', 'post-apocalypse uses scavenger kit');
    eq(result.rulesPatch.enableVehicleSystem, true, 'vehicle playstyle enables vehicle system');
    eq(result.rulesPatch.enableCommerce, true, 'vehicle playstyle keeps commerce available');
    eq(result.rulesPatch.enableCommerceUi, false, 'minimal bookkeeping hides commerce UI pressure');
    eq(result.rulesPatch.enableWorldObservatory, false, 'minimal bookkeeping disables observatory pressure');
    eq(result.rulesPatch.diceDifficulty, 'Hard', 'survival pressure is hard');
    eq(result.normalizedAnswers.imageGenerationWanted, false, 'imageGenerationWanted false preserved');
    eq(result.assetHint.guideAssetId, 'guide_post_apocalypse_mechanic', 'post-apocalypse asset uses mechanic guide');
    eq(result.assetHint.backgroundAssetId, 'background_post_apocalypse', 'post-apocalypse asset uses wasteland background');
    assertPatchKeysSupported(result.rulesPatch, 'post-apocalypse vehicle');
}

{
    const result = resolveRulesProfile({
        genre: 'sci fi',
        playstyle: 'mobile base',
        pressure: 'standard',
        bookkeeping: 'light',
    });
    eq(result.normalizedAnswers.genre, 'sci_fi', 'space-separated sci fi normalized');
    eq(result.normalizedAnswers.playstyle, 'mobile_base', 'space-separated mobile base normalized');
    eq(result.rulesPatch.campaignKitId, 'space_frontier', 'sci-fi uses space frontier kit');
    eq(result.rulesPatch.enableVehicleSystem, true, 'mobile base enables vehicle system');
    eq(result.rulesPatch.enableSettlementMode, true, 'mobile base enables settlement mode');
    eq(result.rulesPatch.enableMobileBaseSystem, true, 'mobile base enables mobile base system');
    eq(result.rulesPatch.enableSettlementDiorama, true, 'mobile base enables diorama');
    eq(result.rulesPatch.playerRole, 'merchant', 'mobile base defaults to merchant role');
    eq(result.assetHint.guideWebviewPath, 'assets/genesis/guide_space_alien_mercenary.png', 'sci-fi asset uses space guide');
    eq(result.assetHint.backgroundWebviewPath, 'assets/genesis/background_sci_fi.png', 'sci-fi asset uses space background');
    assertPatchKeysSupported(result.rulesPatch, 'mobile base caravan');
}

{
    const result = resolveRulesProfile({
        genre: 'eastern',
        playstyle: 'settlement',
        pressure: 'tourist',
        bookkeeping: 'detailed',
    });
    eq(result.rulesPatch.campaignKitId, 'eastern_fantasy', 'eastern uses eastern_fantasy kit');
    eq(result.rulesPatch.enableSettlementMode, true, 'settlement builder enables settlement');
    eq(result.rulesPatch.enableSettlementDiorama, true, 'settlement builder enables diorama');
    eq(result.rulesPatch.enableWorldObservatory, true, 'detailed bookkeeping enables observatory');
    eq(result.rulesPatch.maxNamedNpcCount, 20, 'detailed bookkeeping increases named NPC budget');
    eq(result.rulesPatch.diceDifficulty, 'Easy', 'tourist pressure is easy');
    assertPatchKeysSupported(result.rulesPatch, 'settlement builder');
}

{
    const result = resolveRulesProfile({
        genre: 'modern',
        playstyle: 'trade',
        pressure: 'nightmare',
        bookkeeping: 'detailed',
    });
    eq(result.rulesPatch.campaignKitId, 'modern_occult', 'modern uses modern occult kit');
    eq(result.rulesPatch.enableCommerce, true, 'trade enables commerce');
    eq(result.rulesPatch.enableCommerceUi, true, 'trade enables commerce UI');
    eq(result.rulesPatch.enableWorldObservatory, true, 'trade/detailed enables observatory');
    eq(result.rulesPatch.playerRole, 'merchant', 'trade uses merchant role');
    eq(result.rulesPatch.simIntervalTurns, 2, 'nightmare sim interval');
    assertPatchKeysSupported(result.rulesPatch, 'trade nightmare');
}

{
    const result = resolveRulesProfile({
        genre: 'nonsense',
        playstyle: 42,
        pressure: 'brutal',
        bookkeeping: null,
        protagonistMode: 'alien',
        imageGenerationWanted: 'maybe',
    });
    eq(result.normalizedAnswers.genre, 'fantasy', 'invalid genre falls back');
    eq(result.normalizedAnswers.playstyle, 'adventure', 'invalid playstyle falls back');
    eq(result.normalizedAnswers.pressure, 'standard', 'invalid pressure falls back');
    eq(result.normalizedAnswers.bookkeeping, 'light', 'invalid bookkeeping falls back');
    eq(result.normalizedAnswers.protagonistMode, 'generate', 'invalid protagonist mode falls back');
    eq(result.normalizedAnswers.imageGenerationWanted, true, 'invalid image bool falls back');
    eq(result.warnings.length, 6, 'invalid answers produce warnings');
    assertPatchKeysSupported(result.rulesPatch, 'invalid fallback');
}

{
    const n = normalizeGenesisAnswers({
        genre: 'CYBERPUNK',
        playstyle: 'character-chat',
        imageGenerationWanted: 'off',
    });
    eq(n.answers.genre, 'cyberpunk', 'case-insensitive genre normalization');
    eq(n.answers.playstyle, 'character_chat', 'hyphenated character chat normalization');
    eq(n.answers.imageGenerationWanted, false, 'string off normalizes to false');
}

{
    const result = resolveRulesProfile({ genre: 'modern' });
    eq(result.assetHint.guideWebviewPath, 'assets/genesis/guide_modern_occult_librarian.png', 'modern asset uses occult librarian guide');
    eq(result.assetHint.backgroundWebviewPath, 'assets/genesis/background_modern.png', 'modern asset uses occult background');
}

{
    const result = resolveRulesProfile({ playstyle: 'domain' });
    eq(result.rulesPatch.enableDomainMode, true, 'domain enables domain mode');
    eq(result.rulesPatch.enableDomainAudience, true, 'domain enables audience');
    eq(result.rulesPatch.enableDomainRivals, true, 'domain enables rivals');
    eq(result.rulesPatch.enableDomainMissions, true, 'domain enables missions');
    eq(result.rulesPatch.playerRole, 'ruler', 'domain uses ruler role');
    assertPatchKeysSupported(result.rulesPatch, 'domain');
}

{
    const result = resolveRulesProfile({ playstyle: 'guild' });
    eq(result.rulesPatch.enableGuildMode, true, 'guild enables guild mode');
    eq(result.rulesPatch.enableGuildRequests, true, 'guild enables requests');
    eq(result.rulesPatch.enableGuildParties, true, 'guild enables parties');
    assertPatchKeysSupported(result.rulesPatch, 'guild');
}

{
    const result = resolveRulesProfile({ playstyle: 'mobile_base' });
    const full = normalizeGameRules({ ...DEFAULT_GAME_RULES, ...result.rulesPatch });
    eq(full.enableMobileBaseSystem, true, 'mobile base patch survives normalizeGameRules');
    eq(full.enableVehicleSystem, true, 'vehicle dependency survives normalizeGameRules');
    eq(full.enableSettlementMode, true, 'settlement dependency survives normalizeGameRules');
}

assertDeterministic({
    genre: 'horror',
    playstyle: 'vehicle',
    pressure: 'survival',
    bookkeeping: 'minimal',
    protagonistMode: 'sillytavern',
    imageGenerationWanted: true,
}, 'horror vehicle profile');

// GENESIS-CHAT-LIGHTWEIGHT-001: character_chat must not inherit adventure common package
{
    const result = resolveRulesProfile({
        genre: 'fantasy',
        playstyle: 'character_chat',
        pressure: 'standard',
        bookkeeping: 'detailed',
        protagonistMode: 'sillytavern',
    });
    const p = result.rulesPatch;
    eq(p.enableWorldForge, false, 'character_chat disables World Forge');
    eq(p.enableCampaignKit, false, 'character_chat disables Campaign Kit');
    eq(p.campaignKitId, '', 'character_chat clears campaign kit id');
    eq(p.enableNpcRegistry, false, 'character_chat disables NPC registry');
    eq(p.enableNpcRelationships, false, 'character_chat disables NPC relationships');
    eq(p.enableFactionReputation, false, 'character_chat disables faction reputation');
    eq(p.enableEmergentSimulation, false, 'character_chat disables emergent simulation');
    eq(p.enableTravelEncounters, false, 'character_chat disables travel encounters');
    eq(p.enableNpcAgency, false, 'character_chat disables NPC agency');
    eq(p.enableCommerce, false, 'character_chat disables commerce');
    eq(p.enableCommerceUi, false, 'character_chat disables commerce UI');
    eq(p.enableWorldObservatory, false, 'character_chat disables observatory');
    eq(p.enableSettlementMode, false, 'character_chat disables settlement');
    eq(p.enableVehicleSystem, false, 'character_chat disables vehicle');
    eq(p.enableMobileBaseSystem, false, 'character_chat disables mobile base');
    eq(p.enableDomainMode, false, 'character_chat disables domain');
    eq(p.enableGuildMode, false, 'character_chat disables guild');
    eq(p.enableRpgMechanics, false, 'character_chat disables RPG mechanics for plain chat');
    // Pressure/bookkeeping must not re-enable adventure systems for chat.
    truthy(!p.enableWorldForge && !p.enableEmergentSimulation, 'chat ignores pressure re-enable');
    assertPatchKeysSupported(p, 'character_chat lightweight');
    assertDeterministic({
        genre: 'fantasy',
        playstyle: 'character_chat',
        pressure: 'nightmare',
        bookkeeping: 'detailed',
    }, 'character_chat twice is deterministic');
}

// character_chat applied to default rules leaves optional systems OFF after merge
{
    const full = normalizeGameRules({
        ...DEFAULT_GAME_RULES,
        ...resolveRulesProfile({ playstyle: 'character_chat' }).rulesPatch,
    });
    eq(full.enableWorldForge, false, 'merged default+chat: forge off');
    eq(full.enableCampaignKit, false, 'merged default+chat: campaign kit off');
    eq(full.enableNpcRegistry, false, 'merged default+chat: npc registry off');
    eq(full.enableCommerce, false, 'merged default+chat: commerce off');
    eq(full.enableDomainMode, false, 'merged default+chat: domain off');
}

// character_chat applied twice over adventure leaves the same chat-owned keys OFF
{
    const adventure = resolveRulesProfile({ playstyle: 'adventure', genre: 'fantasy' });
    const afterAdventure = normalizeGameRules({ ...DEFAULT_GAME_RULES, ...adventure.rulesPatch });
    eq(afterAdventure.enableWorldForge, true, 'precondition: adventure enables forge');
    const chatOnce = normalizeGameRules({
        ...afterAdventure,
        ...resolveRulesProfile({ playstyle: 'character_chat' }).rulesPatch,
    });
    const chatTwice = normalizeGameRules({
        ...chatOnce,
        ...resolveRulesProfile({ playstyle: 'character_chat' }).rulesPatch,
    });
    eq(chatOnce.enableWorldForge, false, 'chat over adventure disables forge');
    eq(JSON.stringify(chatOnce), JSON.stringify(chatTwice), 'reapplying character_chat is idempotent');
}

// Non-chat profiles still get common package (regression)
{
    const adventure = resolveRulesProfile({ playstyle: 'adventure' });
    eq(adventure.rulesPatch.enableWorldForge, true, 'adventure still enables forge');
    eq(adventure.rulesPatch.enableCampaignKit, true, 'adventure still enables campaign kit');
    const trade = resolveRulesProfile({ playstyle: 'trade' });
    eq(trade.rulesPatch.enableCommerce, true, 'trade still enables commerce');
    const guild = resolveRulesProfile({ playstyle: 'guild' });
    eq(guild.rulesPatch.enableGuildMode, true, 'guild still enables guild mode');
}

if (failed > 0) {
    console.error(`rulesProfileCore: ${failed} test(s) failed`);
    process.exit(1);
}
console.log('rulesProfileCore: all tests passed.');
