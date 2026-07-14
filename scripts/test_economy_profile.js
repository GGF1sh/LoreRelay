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
    resolveCommodityEconomyParams,
    DEFAULT_MARKET_RECOVERY_PER_TICK,
    MAX_PRICE_INDEX,
    MAX_PROFILE_PRICE_INDEX,
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
// 5-tier scale; legacy easy/harsh canonicalize to plentiful/scarce.
{
    const missing = normalizeGameRules({});
    const invalid = normalizeGameRules({ economyProfile: 'nightmare' });
    const easy = normalizeGameRules({ economyProfile: 'easy' });
    const normal = normalizeGameRules({ economyProfile: 'normal' });
    const harsh = normalizeGameRules({ economyProfile: 'harsh' });
    const abundant = normalizeGameRules({ economyProfile: 'abundant' });
    const barren = normalizeGameRules({ economyProfile: 'barren' });

    if (missing.economyProfile !== 'normal') {
        fail(`missing profile should be normal, got ${missing.economyProfile}`);
    } else if (invalid.economyProfile !== 'normal') {
        fail(`invalid profile should be normal, got ${invalid.economyProfile}`);
    } else if (easy.economyProfile !== 'plentiful' || harsh.economyProfile !== 'scarce') {
        fail(`legacy easy/harsh should canonicalize to plentiful/scarce, got ${easy.economyProfile}/${harsh.economyProfile}`);
    } else if (normal.economyProfile !== 'normal' || abundant.economyProfile !== 'abundant' || barren.economyProfile !== 'barren') {
        fail('valid 5-tier economyProfile values not preserved');
    } else if (DEFAULT_GAME_RULES.economyProfile !== 'normal') {
        fail('DEFAULT_GAME_RULES.economyProfile must be normal');
    } else if (
        resolveEconomyProfile(undefined) !== 'normal'
        || resolveEconomyProfile(null) !== 'normal'
        || resolveEconomyProfile('bogus') !== 'normal'
        || resolveEconomyProfile('easy') !== 'plentiful'
        || resolveEconomyProfile('harsh') !== 'scarce'
        || resolveEconomyProfile('barren') !== 'barren'
    ) {
        fail('resolveEconomyProfile fallback / alias / accept broken');
    } else {
        ok('missing/invalid → normal; 5-tier parse; legacy easy/harsh aliased');
    }
}

// 4. Exact tier parameter mapping (5-tier scale)
{
    const abundant = resolveEconomyProfileParams('abundant');
    const plentiful = resolveEconomyProfileParams('plentiful');
    const normal = resolveEconomyProfileParams('normal');
    const scarce = resolveEconomyProfileParams('scarce');
    const barren = resolveEconomyProfileParams('barren');
    const missing = resolveEconomyProfileParams(undefined);

    const expect = {
        abundant: { recoveryPerTick: 4, foodCrisisPriceBump: 0.15, positiveMaterialStockGain: 5, positiveMaterialPriceReduction: 0.20, maxPriceIndex: 2.0, baselinePriceBias: 0.85 },
        plentiful: { recoveryPerTick: 3, foodCrisisPriceBump: 0.25, positiveMaterialStockGain: 4, positiveMaterialPriceReduction: 0.15, maxPriceIndex: 3.0, baselinePriceBias: 0.93 },
        normal: {
            recoveryPerTick: DEFAULT_MARKET_RECOVERY_PER_TICK,
            foodCrisisPriceBump: FOOD_CRISIS_PRICE_BUMP,
            positiveMaterialStockGain: STEEL_IMPROVEMENT_STOCK,
            positiveMaterialPriceReduction: STEEL_IMPROVEMENT_PRICE_REDUCTION,
            maxPriceIndex: MAX_PRICE_INDEX,
            baselinePriceBias: 1.0,
        },
        scarce: { recoveryPerTick: 1, foodCrisisPriceBump: 0.50, positiveMaterialStockGain: 2, positiveMaterialPriceReduction: 0.07, maxPriceIndex: 5.5, baselinePriceBias: 1.15 },
        barren: { recoveryPerTick: 0, foodCrisisPriceBump: 0.70, positiveMaterialStockGain: 1, positiveMaterialPriceReduction: 0.04, maxPriceIndex: 7.0, baselinePriceBias: 1.30 },
    };

    function sameParams(a, b) {
        return a.recoveryPerTick === b.recoveryPerTick
            && approx(a.foodCrisisPriceBump, b.foodCrisisPriceBump)
            && a.positiveMaterialStockGain === b.positiveMaterialStockGain
            && approx(a.positiveMaterialPriceReduction, b.positiveMaterialPriceReduction)
            && approx(a.maxPriceIndex, b.maxPriceIndex)
            && approx(a.baselinePriceBias, b.baselinePriceBias);
    }

    // Monotonic: recovery falls, shock bump rises, ceiling rises, resting price rises.
    const order = [abundant, plentiful, normal, scarce, barren];
    let monotonic = true;
    for (let i = 1; i < order.length; i++) {
        if (!(order[i].recoveryPerTick <= order[i - 1].recoveryPerTick
            && order[i].foodCrisisPriceBump >= order[i - 1].foodCrisisPriceBump
            && order[i].maxPriceIndex >= order[i - 1].maxPriceIndex
            && order[i].baselinePriceBias >= order[i - 1].baselinePriceBias)) {
            monotonic = false;
        }
    }

    if (!sameParams(abundant, expect.abundant)) {
        fail(`abundant params mismatch: ${JSON.stringify(abundant)}`);
    } else if (!sameParams(plentiful, expect.plentiful)) {
        fail(`plentiful params mismatch: ${JSON.stringify(plentiful)}`);
    } else if (!sameParams(normal, expect.normal) || !sameParams(missing, expect.normal)) {
        fail(`normal/missing params mismatch: ${JSON.stringify(normal)} / ${JSON.stringify(missing)}`);
    } else if (!sameParams(scarce, expect.scarce)) {
        fail(`scarce params mismatch: ${JSON.stringify(scarce)}`);
    } else if (!sameParams(barren, expect.barren)) {
        fail(`barren params mismatch: ${JSON.stringify(barren)}`);
    } else if (!monotonic) {
        fail('tier params must be monotonic abundant→barren');
    } else {
        ok('exact 5-tier parameter mapping is monotonic');
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

// max price index: plentiful clamps lower (3.0), scarce allows higher (5.5)
{
    // plentiful ceiling 3.0: a bump from 2.9 clamps at 3.0.
    const high = { town: { wheat: { stock: 20, priceIndex: 2.9 }, steel: { stock: 5, priceIndex: 1 } } };
    const plentifulCap = applyWorldEventsToMarkets(
        baseForge, high, [foodEvent], resolveEconomyProfileParams('plentiful')
    ).markets.town.wheat.priceIndex;
    // scarce ceiling 5.5: a bump from 5.4 clamps at 5.5.
    const scarceHigh = { town: { wheat: { stock: 20, priceIndex: 5.4 }, steel: { stock: 5, priceIndex: 1 } } };
    const scarceCap = applyWorldEventsToMarkets(
        baseForge, scarceHigh, [foodEvent], resolveEconomyProfileParams('scarce')
    ).markets.town.wheat.priceIndex;
    if (!approx(plentifulCap, 3.0)) {
        fail(`plentiful maxPriceIndex clamp expected 3.0, got ${plentifulCap}`);
    } else if (!approx(scarceCap, 5.5)) {
        fail(`scarce maxPriceIndex clamp expected 5.5, got ${scarceCap}`);
    } else if (MAX_PROFILE_PRICE_INDEX !== 7.0) {
        fail(`MAX_PROFILE_PRICE_INDEX should be barren ceiling 7.0, got ${MAX_PROFILE_PRICE_INDEX}`);
    } else {
        ok('tier maxPriceIndex clamps adverse price growth; barren ceiling is global max');
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

// 11. Per-commodity / per-category resolution precedence + custom resources.
{
    const config = {
        globalTier: 'normal',
        categoryTiers: { staple: 'barren' },
        commodityTiers: { sakuradite: 'abundant' },
    };
    // Custom resource by id wins (abundant).
    const sakuradite = resolveCommodityEconomyParams(config, 'sakuradite', 'material');
    // Category/role match (staple → barren) when no id override.
    const rations = resolveCommodityEconomyParams(config, 'rations', 'staple');
    // Falls back to global (normal) when neither id nor category matches.
    const trinket = resolveCommodityEconomyParams(config, 'trinket', undefined);
    // No config at all → normal.
    const bare = resolveCommodityEconomyParams(undefined, 'anything', 'staple');

    if (!approx(sakuradite.baselinePriceBias, 0.85)) {
        fail(`commodity id override should win (abundant 0.85), got ${sakuradite.baselinePriceBias}`);
    } else if (!approx(rations.baselinePriceBias, 1.30) || rations.recoveryPerTick !== 0) {
        fail(`category staple→barren expected, got bias ${rations.baselinePriceBias} recovery ${rations.recoveryPerTick}`);
    } else if (!approx(trinket.baselinePriceBias, 1.0)) {
        fail(`unmatched commodity should fall to global normal, got ${trinket.baselinePriceBias}`);
    } else if (!approx(bare.baselinePriceBias, 1.0)) {
        fail(`no config should resolve normal, got ${bare.baselinePriceBias}`);
    } else {
        ok('per-commodity > per-category > global resolution; custom resources supported');
    }
}

// 12. % modifier scales deviation from normal; price ceiling stays fixed.
{
    const config = { commodityTiers: { fuel: 'scarce' }, modifiers: { fuel: 2 } };
    const fuel = resolveCommodityEconomyParams(config, 'fuel', undefined);
    // scarce baselinePriceBias 1.15 → normal 1.0 + (1.15-1.0)*2 = 1.30
    // scarce recovery 1 → 2 + (1-2)*2 = 0
    // ceiling must stay the fixed scarce value 5.5 (NOT scaled).
    if (!approx(fuel.baselinePriceBias, 1.30)) {
        fail(`modifier x2 on scarce bias expected 1.30, got ${fuel.baselinePriceBias}`);
    } else if (!approx(fuel.recoveryPerTick, 0)) {
        fail(`modifier x2 on scarce recovery expected 0, got ${fuel.recoveryPerTick}`);
    } else if (!approx(fuel.maxPriceIndex, 5.5)) {
        fail(`price ceiling must stay fixed at scarce 5.5 (unmodified), got ${fuel.maxPriceIndex}`);
    } else {
        ok('modifier scales deviation-from-normal; ceiling stays bounded');
    }
}

// 13. economyConfig path: per-commodity resting price applied every tick.
{
    // Well-supplied market (stock at/above target). With a scarce tier the
    // resting price should drift UP toward 1.15, not toward 1.0.
    const forge = {
        commodities: [{ id: 'ore', name: 'Ore', basePrice: 10, weight: 1, role: 'material' }],
        markets: [{ locationId: 'mine', commodityIds: ['ore'], targetStock: 30 }],
        transportKinds: [],
    };
    let markets = { mine: { ore: { stock: 40, priceIndex: 1.0 } } };
    const config = { globalTier: 'scarce' };
    // Run several ticks; price should climb toward 1.15 (scarce resting bias).
    for (let i = 0; i < 5; i++) {
        markets = tickMarketRecovery(forge, markets, {
            worldTurn: i, economyConfig: config,
        }).markets;
    }
    const price = markets.mine.ore.priceIndex;
    if (!(price > 1.0 && price <= 1.15 + 1e-9)) {
        fail(`scarce resting price should drift up toward 1.15, got ${price}`);
    } else {
        ok('economyConfig applies per-commodity resting price each tick');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('economy profile: all tests passed.');
