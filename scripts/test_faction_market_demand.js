#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'worldSimCommerceCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, kitPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    tickFactionReputationMarketDemand,
    REPUTATION_PRICE_DRIFT_PER_TICK,
} = require(corePath);
const { runLivingWorldTick } = require(kitPath);

const FORGE = {
    commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
    markets: [
        { locationId: 'allied_town', commodityIds: ['wheat'], targetStock: 30 },
        { locationId: 'hostile_town', commodityIds: ['wheat'], targetStock: 30 },
        { locationId: 'no_faction_town', commodityIds: ['wheat'], targetStock: 30 },
    ],
    transportKinds: [],
};

function baseMarkets() {
    return {
        allied_town: { wheat: { stock: 30, priceIndex: 1 } },
        hostile_town: { wheat: { stock: 30, priceIndex: 1 } },
        no_faction_town: { wheat: { stock: 30, priceIndex: 1 } },
    };
}

{
    const result = tickFactionReputationMarketDemand(
        FORGE,
        baseMarkets(),
        { allied_town: 'f_allies', hostile_town: 'f_enemies' },
        { f_allies: 80, f_enemies: -80 }
    );
    const allied = result.markets.allied_town.wheat.priceIndex;
    const hostile = result.markets.hostile_town.wheat.priceIndex;
    const untouched = result.markets.no_faction_town.wheat.priceIndex;
    if (allied >= 1) {
        fail(`allied faction market should drift priceIndex down: ${allied}`);
    } else if (hostile <= 1) {
        fail(`hostile faction market should drift priceIndex up: ${hostile}`);
    } else if (untouched !== 1) {
        fail(`market without a controlling faction should be untouched: ${untouched}`);
    } else if (result.applied !== 2) {
        fail(`applied count should count only faction-controlled commodities: ${result.applied}`);
    } else {
        ok('tickFactionReputationMarketDemand drifts priceIndex by reputation tier');
    }
}

{
    // Drift is capped per tick, not an instant snap to target.
    const result = tickFactionReputationMarketDemand(
        FORGE,
        baseMarkets(),
        { hostile_town: 'f_enemies' },
        { f_enemies: -80 }
    );
    const delta = result.markets.hostile_town.wheat.priceIndex - 1;
    if (delta > REPUTATION_PRICE_DRIFT_PER_TICK + 1e-9) {
        fail(`single tick drift should be capped at REPUTATION_PRICE_DRIFT_PER_TICK: ${delta}`);
    } else {
        ok('reputation price drift is capped per tick');
    }
}

{
    // Neutral reputation should not move priceIndex away from 1.
    const result = tickFactionReputationMarketDemand(
        FORGE,
        baseMarkets(),
        { allied_town: 'f_unknown' },
        {}
    );
    if (result.markets.allied_town.wheat.priceIndex !== 1 || result.applied !== 0) {
        fail(`unknown/neutral faction reputation should not move price: ${JSON.stringify(result)}`);
    } else {
        ok('neutral reputation applies no drift');
    }
}

{
    // Wired through runLivingWorldTick only when both maps are provided.
    const withDemand = runLivingWorldTick({
        forge: FORGE,
        markets: baseMarkets(),
        registry: {},
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        marketFactionIds: { hostile_town: 'f_enemies' },
        factionReputations: { f_enemies: -80 },
    });
    const withoutDemand = runLivingWorldTick({
        forge: FORGE,
        markets: baseMarkets(),
        registry: {},
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (withDemand.markets.hostile_town.wheat.priceIndex <= 1) {
        fail('runLivingWorldTick should apply faction demand drift when maps are provided');
    } else if (withoutDemand.markets.hostile_town.wheat.priceIndex !== 1) {
        fail('runLivingWorldTick should skip faction demand drift when maps are omitted');
    } else {
        ok('runLivingWorldTick wires faction market demand only when opted in');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('faction market demand: all tests passed.');
