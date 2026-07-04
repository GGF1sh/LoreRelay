#!/usr/bin/env node
'use strict';

// P1-2 regression: food crisis must not trigger on faction warning / severity alone.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agency-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}

const sources = [
    path.join(root, 'src', 'livingWorldTypes.ts'),
    path.join(root, 'src', 'commerceCore.ts'),
    path.join(root, 'src', 'npcAgencyCore.ts'),
];

const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(
    sources,
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'ES2020',
    '--strict',
    '--skipLibCheck',
);
const useShell = cmd === 'npx' && process.platform === 'win32';
const compiled = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
if (compiled.status !== 0) {
    console.error('FAIL: npcAgencyCore.ts did not compile');
    process.exit(1);
}

const { isFoodCrisisEvent, reactNpcsToWorld } = require(path.join(outDir, 'npcAgencyCore.js'));

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(actual, expected, m) {
    if (actual === expected) { ok(m); } else { fail(`${m} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}

// isFoodCrisisEvent unit checks
{
    eq(isFoodCrisisEvent({
        worldTurn: 1,
        category: 'resource',
        severity: 'warning',
        message: 'Merchants: food depleted',
    }), true, 'resource + food keyword is food crisis');

    eq(isFoodCrisisEvent({
        worldTurn: 1,
        category: 'faction',
        severity: 'warning',
        message: 'Merchants and Smiths relations soured',
    }), false, 'faction warning is not food crisis');

    eq(isFoodCrisisEvent({
        worldTurn: 1,
        category: 'resource',
        severity: 'warning',
        message: 'Mana reserves low',
    }), false, 'resource without food keyword is not food crisis');

    eq(isFoodCrisisEvent({
        worldTurn: 1,
        severity: 'warning',
        message: 'Alice and Bob estranged',
    }), false, 'warning alone is not food crisis');
}

// reactNpcsToWorld: faction warning in recentChanges must not send NPCs to wheat market
{
    const forge = {
        commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
        markets: [{
            locationId: 'cheap_farm',
            commodityIds: ['wheat'],
            targetStock: 30,
        }],
        transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 100, speed: 1 }],
    };
    const markets = { cheap_farm: { wheat: { stock: 10, priceIndex: 1 } } };
    const registry = {
        npc_elda: { name: 'Elda', locationId: 'home', factionId: 'faction_merchants' },
    };

    const factionWarningOnly = reactNpcsToWorld({
        forge,
        markets,
        registry,
        positions: {},
        worldTurn: 5,
        stepEvents: [{
            worldTurn: 5,
            category: 'faction',
            severity: 'warning',
            message: '外交関係が悪化した',
            factionId: 'faction_merchants',
        }],
    });
    eq(factionWarningOnly.moves.length, 0, 'faction warning stepEvent does not trigger wheat rush');

    const foodCrisis = reactNpcsToWorld({
        forge,
        markets,
        registry,
        positions: {},
        worldTurn: 6,
        stepEvents: [{
            worldTurn: 6,
            category: 'resource',
            severity: 'warning',
            message: 'Merchants: 食料が底をついた',
            factionId: 'faction_merchants',
        }],
    });
    if (foodCrisis.moves.length === 1 && foodCrisis.moves[0].agenda === 'restock_wheat') {
        ok('resource food shortage stepEvent triggers wheat restock');
    } else {
        fail(`food crisis should move NPC to wheat (got ${JSON.stringify(foodCrisis.moves)})`);
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('npcAgency stepEvents: all tests passed.');