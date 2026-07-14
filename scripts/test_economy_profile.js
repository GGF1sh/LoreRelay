#!/usr/bin/env node
'use strict';

// Slice A (GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001):
// economyProfile pacing enum + centralized param resolver + WorldKitTick wiring.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const commercePath = path.join(root, 'out', 'worldSimCommerceCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');
const rulesPath = path.join(root, 'out', 'gameRulesCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

for (const p of [commercePath, kitPath, rulesPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    applyWorldEventsToMarkets,
    tickMarketRecovery,
    resolveEconomyProfile,
    resolveEconomyProfileParams,
    DEFAULT_MARKET_RECOVERY_PER_TICK,
    MAX_PRICE_INDEX,
    FOOD_CRISIS_PRICE_BUMP,
    STEEL_IMPROVEMENT_STOCK,
    STEEL_IMPROVEMENT_PRICE_REDUCTION,
    MIN_PRICE_INDEX,
} = require(commercePath);
const { runLivingWorldTick } = require(kitPath);
const { normalizeGameRules, DEFAULT_GAME_RULES } = require(rulesPath);

const foodEvent = { worldTurn: 1, category: 'resource', severity: 'warning', message: 'food ran out' };
const steelEvent = { worldTurn: 1, category: 'resource', severity: 'info', message: 'steel forge boom' };

const baseForge = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
        { id: 'steel', name: 'Steel', basePrice: 40, weight: 2 },
    ],
    markets: [{ locationId: 'town', commodityIds: ['wheat', 'steel'], targetStock: 30 }],
    transportKinds: [],
};

// 1–3. Parsing: missing / invalid / valid via gameRules + resolveEconomyProfile
{
    const missing = normalizeGameRules({});
    const invalid = normalizeGameRules({ economyProfile: 'nightmare' });
    const easy = normalizeGameRules({ economyProfile: 'easy' });
    const normal = normalizeGameRules({ economyProfile: 'normal' });
    const harsh = normalizeGameRules({ economyProfile: 'harsh' });

    if (missing.economyProfile !== 'normal') {
        fail(`missing profile should be normal, got ${missing.economyProfile}`);
    } else if (invalid.economyProfile !== 'normal') {
        fail(`invalid profile should be normal, got ${invalid.economyProfile}`);
    } else if (easy.economyProfile !== 'easy' || normal.economyProfile !== 'normal' || harsh.economyProfile !== 'harsh') {
        fail('valid economyProfile values not preserved');
    } else if (DEFAULT_GAME_RULES.economyProfile !== 'normal') {
        fail('DEFAULT_GAME_RULES.economyProfile must be normal');
    } else if (
        resolveEconomyProfile(undefined) !== 'normal'
        || resolveEconomyProfile(null) !== 'normal'
        || resolveEconomyProfile('bogus') !== 'normal'
        || resolveEconomyProfile('easy') !== 'easy'
    ) {
        fail('resolveEconomyProfile fallback / accept broken');
    } else {
        ok('missing/invalid → normal; valid easy/normal/harsh parse');
    }
}

// 4. Exact profile parameter mapping
{
    const easy = resolveEconomyProfileParams('easy');
    const normal = resolveEconomyProfileParams('normal');
    const harsh = resolveEconomyProfileParams('harsh');
    const missing = resolveEconomyProfileParams(undefined);

    const expect = {
        easy: { recoveryPerTick: 3, foodCrisisPriceBump: 0.25, positiveMaterialStockGain: 4, positiveMaterialPriceReduction: 0.15, maxPriceIndex: 3.5 },
        normal: {
            recoveryPerTick: DEFAULT_MARKET_RECOVERY_PER_TICK,
            foodCrisisPriceBump: FOOD_CRISIS_PRICE_BUMP,
            positiveMaterialStockGain: STEEL_IMPROVEMENT_STOCK,
            positiveMaterialPriceReduction: STEEL_IMPROVEMENT_PRICE_REDUCTION,
            maxPriceIndex: MAX_PRICE_INDEX,
        },
        harsh: { recoveryPerTick: 1, foodCrisisPriceBump: 0.5, positiveMaterialStockGain: 2, positiveMaterialPriceReduction: 0.05, maxPriceIndex: 5 },
    };

    function sameParams(a, b) {
        return a.recoveryPerTick === b.recoveryPerTick
            && approx(a.foodCrisisPriceBump, b.foodCrisisPriceBump)
            && a.positiveMaterialStockGain === b.positiveMaterialStockGain
            && approx(a.positiveMaterialPriceReduction, b.positiveMaterialPriceReduction)
            && approx(a.maxPriceIndex, b.maxPriceIndex);
    }

    if (!sameParams(easy, expect.easy)) {
        fail(`easy params mismatch: ${JSON.stringify(easy)}`);
    } else if (!sameParams(normal, expect.normal) || !sameParams(missing, expect.normal)) {
        fail(`normal/missing params mismatch: ${JSON.stringify(normal)} / ${JSON.stringify(missing)}`);
    } else if (!sameParams(harsh, expect.harsh)) {
        fail(`harsh params mismatch: ${JSON.stringify(harsh)}`);
    } else {
        ok('exact profile parameter mapping');
    }
}

// 5. normal matches previous recovery and shock behavior
{
    const markets = {
        town: {
            wheat: { stock: 10, priceIndex: 1 },
            steel: { stock: 5, priceIndex: 1 },
        },
    };
    const recovery = tickMarketRecovery(baseForge, markets, {
        worldTurn: 1,
        economyParams: resolveEconomyProfileParams('normal'),
    });
    const wheatStock = recovery.markets.town.wheat.stock;
    if (wheatStock !== 10 + DEFAULT_MARKET_RECOVERY_PER_TICK) {
        fail(`normal recovery should add ${DEFAULT_MARKET_RECOVERY_PER_TICK}, got stock ${wheatStock}`);
    }

    const shock = applyWorldEventsToMarkets(
        baseForge,
        { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1 } } },
        [foodEvent, steelEvent],
        resolveEconomyProfileParams('normal')
    );
    const wheat = shock.markets.town.wheat;
    const steel = shock.markets.town.steel;
    if (!approx(wheat.priceIndex, 1 + FOOD_CRISIS_PRICE_BUMP)) {
        fail(`normal food crisis bump broken: ${wheat.priceIndex}`);
    } else if (steel.stock !== 5 + STEEL_IMPROVEMENT_STOCK) {
        fail(`normal material stock broken: ${steel.stock}`);
    } else if (!approx(steel.priceIndex, 1 - STEEL_IMPROVEMENT_PRICE_REDUCTION)) {
        fail(`normal material price cut broken: ${steel.priceIndex}`);
    } else {
        ok('normal matches legacy recovery and shock numbers');
    }
}

// 6–7. easy recovers faster / softer shocks; harsh recovers slower / harder shocks
{
    const start = { town: { wheat: { stock: 10, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1 } } };
    const easyRec = tickMarketRecovery(baseForge, start, {
        worldTurn: 1,
        economyParams: resolveEconomyProfileParams('easy'),
    });
    const harshRec = tickMarketRecovery(baseForge, start, {
        worldTurn: 1,
        economyParams: resolveEconomyProfileParams('harsh'),
    });
    const easyStock = easyRec.markets.town.wheat.stock;
    const harshStock = harshRec.markets.town.wheat.stock;
    if (easyStock !== 13 || harshStock !== 11) {
        fail(`recovery easy=13 harsh=11 expected, got easy=${easyStock} harsh=${harshStock}`);
    }

    const easyShock = applyWorldEventsToMarkets(
        baseForge,
        { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1 } } },
        [foodEvent],
        resolveEconomyProfileParams('easy')
    );
    const harshShock = applyWorldEventsToMarkets(
        baseForge,
        { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1 } } },
        [foodEvent],
        resolveEconomyProfileParams('harsh')
    );
    const easyBump = easyShock.markets.town.wheat.priceIndex;
    const harshBump = harshShock.markets.town.wheat.priceIndex;
    if (!approx(easyBump, 1.25) || !approx(harshBump, 1.5)) {
        fail(`food crisis easy=1.25 harsh=1.5 expected, got ${easyBump} / ${harshBump}`);
    }
    if (!(easyBump < 1 + FOOD_CRISIS_PRICE_BUMP && harshBump > 1 + FOOD_CRISIS_PRICE_BUMP)) {
        fail('easy should soften and harsh should strengthen adverse price growth');
    } else {
        ok('easy recovers faster & softer shocks; harsh slower & stronger adverse growth');
    }
}

// max price index: easy clamps lower, harsh allows higher
{
    const high = { town: { wheat: { stock: 20, priceIndex: 3.4 }, steel: { stock: 5, priceIndex: 1 } } };
    const easyCap = applyWorldEventsToMarkets(
        baseForge, high, [foodEvent], resolveEconomyProfileParams('easy')
    ).markets.town.wheat.priceIndex;
    const harshHigh = { town: { wheat: { stock: 20, priceIndex: 4.6 }, steel: { stock: 5, priceIndex: 1 } } };
    const harshCap = applyWorldEventsToMarkets(
        baseForge, harshHigh, [foodEvent], resolveEconomyProfileParams('harsh')
    ).markets.town.wheat.priceIndex;
    if (!approx(easyCap, 3.5)) {
        fail(`easy maxPriceIndex clamp expected 3.5, got ${easyCap}`);
    } else if (!approx(harshCap, 5.0) && !approx(harshCap, 4.6 + 0.5)) {
        // 4.6 + 0.5 = 5.1 → clamp 5
        if (!approx(harshCap, 5)) {
            fail(`harsh maxPriceIndex clamp expected 5, got ${harshCap}`);
        } else {
            ok('profile maxPriceIndex clamps adverse price growth');
        }
    } else {
        ok('profile maxPriceIndex clamps adverse price growth');
    }
}

// 8. positive material events remain beneficial in all profiles
{
    for (const profile of ['easy', 'normal', 'harsh']) {
        const params = resolveEconomyProfileParams(profile);
        const res = applyWorldEventsToMarkets(
            baseForge,
            { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1.2 } } },
            [steelEvent],
            params
        );
        const steel = res.markets.town.steel;
        const stockGain = steel.stock - 5;
        const priceDelta = steel.priceIndex - 1.2;
        if (stockGain <= 0) {
            fail(`${profile}: material stock gain must be positive, got ${stockGain}`);
        } else if (priceDelta >= 0) {
            fail(`${profile}: material price must fall (beneficial), delta=${priceDelta}`);
        } else if (steel.priceIndex < MIN_PRICE_INDEX - 1e-9) {
            fail(`${profile}: price under min: ${steel.priceIndex}`);
        }
    }
    // harsh must not strengthen the positive event relative to normal
    const normalMat = applyWorldEventsToMarkets(
        baseForge,
        { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1.2 } } },
        [steelEvent],
        resolveEconomyProfileParams('normal')
    ).markets.town.steel;
    const harshMat = applyWorldEventsToMarkets(
        baseForge,
        { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1.2 } } },
        [steelEvent],
        resolveEconomyProfileParams('harsh')
    ).markets.town.steel;
    if (harshMat.stock > normalMat.stock) {
        fail('harsh must not give more material stock than normal');
    } else if (harshMat.priceIndex < normalMat.priceIndex) {
        fail('harsh must not cut material price more than normal');
    } else {
        ok('positive material events remain beneficial in all profiles');
    }
}

// 9. profile reaches commerce tick through real WorldKitTickInput path
{
    const markets = {
        town: {
            wheat: { stock: 10, priceIndex: 1 },
            steel: { stock: 5, priceIndex: 1 },
        },
    };
    const emptyRegistry = {};
    const easyTick = runLivingWorldTick({
        forge: baseForge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 2,
        stepEvents: [foodEvent],
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'easy',
    });
    const harshTick = runLivingWorldTick({
        forge: baseForge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 2,
        stepEvents: [foodEvent],
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'harsh',
    });
    const omittedTick = runLivingWorldTick({
        forge: baseForge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 2,
        stepEvents: [foodEvent],
        commerceEnabled: true,
        agencyEnabled: false,
    });

    const easyWheat = easyTick.markets.town.wheat;
    const harshWheat = harshTick.markets.town.wheat;
    const omittedWheat = omittedTick.markets.town.wheat;

    // recovery + food crisis in one tick
    if (easyWheat.stock !== 13) {
        fail(`WorldKit easy recovery expected stock 13, got ${easyWheat.stock}`);
    } else if (harshWheat.stock !== 11) {
        fail(`WorldKit harsh recovery expected stock 11, got ${harshWheat.stock}`);
    } else if (omittedWheat.stock !== 12) {
        fail(`WorldKit omitted profile should recover like normal (12), got ${omittedWheat.stock}`);
    } else if (!approx(easyWheat.priceIndex, 1.25) || !approx(harshWheat.priceIndex, 1.5)) {
        fail(`WorldKit shock not profile-aware: easy=${easyWheat.priceIndex} harsh=${harshWheat.priceIndex}`);
    } else if (!approx(omittedWheat.priceIndex, 1 + FOOD_CRISIS_PRICE_BUMP)) {
        fail(`omitted economyProfile should use normal bump, got ${omittedWheat.priceIndex}`);
    } else {
        ok('economyProfile reaches commerce tick via WorldKitTickInput');
    }
}

// 10. Slice B1 role-based commodity targets still work with profile params
{
    const roleForge = {
        commodities: [
            { id: 'rations', name: 'Rations', basePrice: 5, weight: 1, role: 'staple' },
            { id: 'parts', name: 'Parts', basePrice: 8, weight: 1, role: 'material' },
        ],
        markets: [{ locationId: 'wastes', commodityIds: ['rations', 'parts'] }],
        transportKinds: [],
    };
    const markets = {
        wastes: {
            rations: { stock: 20, priceIndex: 1 },
            parts: { stock: 5, priceIndex: 1 },
        },
    };
    const res = applyWorldEventsToMarkets(
        roleForge,
        markets,
        [foodEvent, steelEvent],
        resolveEconomyProfileParams('harsh')
    );
    if (!approx(res.markets.wastes.rations.priceIndex, 1.5)) {
        fail(`role staple should take harsh food bump: ${res.markets.wastes.rations.priceIndex}`);
    } else if (res.markets.wastes.parts.stock !== 5 + 2) {
        fail(`role material should take harsh stock gain: ${res.markets.wastes.parts.stock}`);
    } else {
        ok('Slice B1 role-based targets still work with economy profile');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('economy profile: all tests passed.');
