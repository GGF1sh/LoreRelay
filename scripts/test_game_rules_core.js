#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFile = path.join(root, 'src', 'gameRulesCore.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-rules-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}

const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat([
    srcFile,
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'ES2020',
    '--strict',
    '--skipLibCheck',
]);
const useShell = cmd === 'npx' && process.platform === 'win32';
const compiled = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
if (compiled.status !== 0) {
    console.error('FAIL: gameRulesCore.ts did not compile');
    process.exit(1);
}

const {
    DEFAULT_GAME_RULES,
    normalizeGameRules,
    normalizeGuildRuleFlags,
} = require(path.join(outDir, 'gameRulesCore.js'));

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(actual, expected, m) {
    if (actual === expected) { ok(m); } else { fail(`${m} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}

// defaults
{
    const n = normalizeGameRules({});
    eq(n.maxNamedNpcCount, 10, 'default maxNamedNpcCount');
    eq(n.maxMemoriesPerNpc, 10, 'default maxMemoriesPerNpc');
    eq(n.simIntervalTurns, 5, 'default simIntervalTurns');
    eq(n.aiParticipationPolicy, 'always', 'default aiParticipationPolicy');
    eq(n.economyProfile, 'normal', 'default economyProfile');
}

// economyProfile: 5-tier scale, legacy aliases, missing, invalid
{
    eq(normalizeGameRules({ economyProfile: 'abundant' }).economyProfile, 'abundant', 'economyProfile abundant');
    eq(normalizeGameRules({ economyProfile: 'plentiful' }).economyProfile, 'plentiful', 'economyProfile plentiful');
    eq(normalizeGameRules({ economyProfile: 'normal' }).economyProfile, 'normal', 'economyProfile normal');
    eq(normalizeGameRules({ economyProfile: 'scarce' }).economyProfile, 'scarce', 'economyProfile scarce');
    eq(normalizeGameRules({ economyProfile: 'barren' }).economyProfile, 'barren', 'economyProfile barren');
    // legacy aliases canonicalize
    eq(normalizeGameRules({ economyProfile: 'easy' }).economyProfile, 'plentiful', 'legacy easy → plentiful');
    eq(normalizeGameRules({ economyProfile: 'harsh' }).economyProfile, 'scarce', 'legacy harsh → scarce');
    eq(normalizeGameRules({}).economyProfile, 'normal', 'missing economyProfile → normal');
    eq(normalizeGameRules({ economyProfile: 'brutal' }).economyProfile, 'normal', 'invalid economyProfile → normal');
    eq(normalizeGameRules({ economyProfile: 3 }).economyProfile, 'normal', 'non-string economyProfile → normal');
}

// economyResourceProfiles / economyCommodityProfiles / economyResourceModifiers
{
    const rp = normalizeGameRules({
        economyResourceProfiles: { staple: 'barren', material: 'abundant', junk: 'nope' },
    }).economyResourceProfiles;
    eq(rp.staple, 'barren', 'category staple tier kept');
    eq(rp.material, 'abundant', 'category material tier kept');
    eq(rp.junk, undefined, 'invalid tier value dropped');

    // legacy alias inside the map is canonicalized too
    const rpAlias = normalizeGameRules({
        economyCommodityProfiles: { sakuradite: 'abundant', ore: 'harsh' },
    }).economyCommodityProfiles;
    eq(rpAlias.sakuradite, 'abundant', 'custom resource tier kept');
    eq(rpAlias.ore, 'scarce', 'legacy alias inside commodity map canonicalized');

    // modifiers: finite numbers clamped to [0,3], non-numbers dropped
    const mods = normalizeGameRules({
        economyResourceModifiers: { fuel: 2, water: 9, bad: 'x', ammo: -1 },
    }).economyResourceModifiers;
    eq(mods.fuel, 2, 'modifier kept');
    eq(mods.water, 3, 'modifier clamped to 3');
    eq(mods.ammo, 0, 'negative modifier clamped to 0');
    eq(mods.bad, undefined, 'non-number modifier dropped');

    // absent maps stay undefined (no churn)
    eq(normalizeGameRules({}).economyResourceProfiles, undefined, 'absent resource profiles → undefined');
    eq(normalizeGameRules({}).economyResourceModifiers, undefined, 'absent modifiers → undefined');
}

// load-time clamp: negative maxNamedNpcCount
{
    const n = normalizeGameRules({ maxNamedNpcCount: -1 });
    eq(n.maxNamedNpcCount, 1, 'negative maxNamedNpcCount clamped to 1');
}

// load-time clamp: huge maxMemoriesPerNpc
{
    const n = normalizeGameRules({ maxMemoriesPerNpc: 99999 });
    eq(n.maxMemoriesPerNpc, 5000, 'maxMemoriesPerNpc capped at 5000');
}

// invalid diceDifficulty keeps base
{
    const base = { ...DEFAULT_GAME_RULES, diceDifficulty: 'Hard' };
    const n = normalizeGameRules({ diceDifficulty: 'bogus' }, base);
    eq(n.diceDifficulty, 'Hard', 'invalid diceDifficulty keeps base');
}

// partial update preserves unspecified fields via base
{
    const base = { ...DEFAULT_GAME_RULES, enableCommerce: true, maxNamedNpcCount: 42, aiParticipationPolicy: 'simulationOnly' };
    const n = normalizeGameRules({ enableNpcAgency: true }, base);
    eq(n.enableCommerce, true, 'partial update preserves enableCommerce');
    eq(n.maxNamedNpcCount, 42, 'partial update preserves maxNamedNpcCount');
    eq(n.aiParticipationPolicy, 'simulationOnly', 'partial update preserves aiParticipationPolicy');
    eq(n.enableNpcAgency, true, 'partial update applies enableNpcAgency');
}

// aiParticipationPolicy accepts only the Phase 0 core enum
{
    const n = normalizeGameRules({ aiParticipationPolicy: 'onDemand' });
    eq(n.aiParticipationPolicy, 'onDemand', 'valid aiParticipationPolicy preserved');
}

{
    const base = { ...DEFAULT_GAME_RULES, aiParticipationPolicy: 'simulationOnly' };
    const n = normalizeGameRules({ aiParticipationPolicy: 'directActionEverything' }, base);
    eq(n.aiParticipationPolicy, 'simulationOnly', 'invalid aiParticipationPolicy keeps base');
}

// guild flags gated when guild mode off
{
    const n = normalizeGuildRuleFlags({
        ...DEFAULT_GAME_RULES,
        enableGuildMode: false,
        enableGuildRequests: true,
        enableGuildParties: true,
        enableRivalGuild: true,
    });
    eq(n.enableGuildRequests, false, 'guild requests off when guild mode off');
    eq(n.enableGuildParties, false, 'guild parties off when guild mode off');
    eq(n.enableRivalGuild, false, 'rival guild off when guild mode off');
}

// null/invalid raw falls back to defaults
{
    const n = normalizeGameRules(null);
    eq(n.enableRpgMechanics, DEFAULT_GAME_RULES.enableRpgMechanics, 'null raw uses defaults');
}

if (failed > 0) {
    process.exit(1);
}
console.log('gameRulesCore: all tests passed.');
