#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const observatoryPath = path.join(root, 'out', 'worldObservatoryCore.js');
const worldStateCorePath = path.join(root, 'out', 'worldStateCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [observatoryPath, worldStateCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    appendMarketPriceHistory,
    normalizeObserverTickMode,
    MAX_MARKET_PRICE_HISTORY_POINTS,
} = require(observatoryPath);
const { parseWorldState } = require(worldStateCorePath);

// 1) Appends current priceIndex onto empty history
{
    const markets = { town_a: { wheat: { stock: 10, priceIndex: 1.05 } } };
    const result = appendMarketPriceHistory(markets, undefined);
    if (result?.town_a?.wheat?.length === 1 && result.town_a.wheat[0] === 1.05) {
        ok('appends first point onto empty history');
    } else {
        fail(`expected [1.05], got ${JSON.stringify(result)}`);
    }
}

// 2) Accumulates across multiple calls, oldest-first order preserved
{
    let history;
    const prices = [1.0, 1.02, 1.05];
    for (const p of prices) {
        history = appendMarketPriceHistory({ town_a: { wheat: { stock: 10, priceIndex: p } } }, history);
    }
    const series = history.town_a.wheat;
    if (JSON.stringify(series) === JSON.stringify(prices)) {
        ok('accumulates in chronological order');
    } else {
        fail(`expected ${JSON.stringify(prices)}, got ${JSON.stringify(series)}`);
    }
}

// 3) Caps at MAX_MARKET_PRICE_HISTORY_POINTS, dropping oldest first
{
    let history;
    for (let i = 0; i < MAX_MARKET_PRICE_HISTORY_POINTS + 10; i++) {
        history = appendMarketPriceHistory({ town_a: { wheat: { stock: 10, priceIndex: i } } }, history);
    }
    const series = history.town_a.wheat;
    if (series.length === MAX_MARKET_PRICE_HISTORY_POINTS && series[0] === 10 && series[series.length - 1] === MAX_MARKET_PRICE_HISTORY_POINTS + 9) {
        ok(`caps at ${MAX_MARKET_PRICE_HISTORY_POINTS} points, drops oldest`);
    } else {
        fail(`cap/drop mismatch: len=${series.length} first=${series[0]} last=${series[series.length - 1]}`);
    }
}

// 4) Pure — does not mutate the passed-in history object
{
    const history = { town_a: { wheat: [1.0] } };
    const frozenCopy = JSON.parse(JSON.stringify(history));
    appendMarketPriceHistory({ town_a: { wheat: { stock: 10, priceIndex: 2.0 } } }, history);
    if (JSON.stringify(history) === JSON.stringify(frozenCopy)) {
        ok('does not mutate input history');
    } else {
        fail('mutated input history in place');
    }
}

// 5) No markets -> returns history unchanged (reference-different is fine, content must match)
{
    const history = { town_a: { wheat: [1.0] } };
    const result = appendMarketPriceHistory(undefined, history);
    if (JSON.stringify(result) === JSON.stringify(history)) {
        ok('no markets leaves history unchanged');
    } else {
        fail(`expected unchanged history, got ${JSON.stringify(result)}`);
    }
}

// 6) Non-finite priceIndex values are skipped
{
    const markets = { town_a: { wheat: { stock: 10, priceIndex: NaN }, salt: { stock: 5, priceIndex: 1.1 } } };
    const result = appendMarketPriceHistory(markets, undefined);
    if (!result.town_a.wheat && result.town_a.salt?.[0] === 1.1) {
        ok('skips non-finite priceIndex, keeps valid entries');
    } else {
        fail(`expected wheat skipped/salt kept, got ${JSON.stringify(result)}`);
    }
}

// 7) normalizeObserverTickMode sanitizes to watch/advance only
{
    const cases = [
        ['advance', 'advance'],
        ['watch', 'watch'],
        [undefined, 'watch'],
        ['bogus', 'watch'],
        [123, 'watch'],
    ];
    let allOk = true;
    for (const [input, expected] of cases) {
        const got = normalizeObserverTickMode(input);
        if (got !== expected) {
            fail(`normalizeObserverTickMode(${JSON.stringify(input)}) expected ${expected}, got ${got}`);
            allOk = false;
        }
    }
    if (allOk) { ok('normalizeObserverTickMode sanitizes all inputs to watch/advance'); }
}

// 8) parseWorldState round-trips marketPriceHistory (via worldStateCore, not this module)
{
    const raw = {
        format: 'lorerelay-world-state/1.0',
        worldTurn: 5,
        factions: {},
        marketPriceHistory: { town_a: { wheat: [1.0, 1.02, 1.05] } },
    };
    const parsed = parseWorldState(raw);
    if (JSON.stringify(parsed?.marketPriceHistory) === JSON.stringify(raw.marketPriceHistory)) {
        ok('parseWorldState round-trips marketPriceHistory');
    } else {
        fail(`round-trip mismatch: ${JSON.stringify(parsed?.marketPriceHistory)}`);
    }
}

// 9) parseWorldState rejects malformed marketPriceHistory shapes (non-finite / non-array / bad ids)
{
    const raw = {
        format: 'lorerelay-world-state/1.0',
        worldTurn: 1,
        factions: {},
        marketPriceHistory: {
            'bad id with spaces!!': { wheat: [1] },
            town_a: { wheat: 'not-an-array', salt: [1, NaN, 2], 'bad commodity!': [1] },
        },
    };
    const parsed = parseWorldState(raw);
    const history = parsed?.marketPriceHistory;
    const hasInvalidLoc = history && 'bad id with spaces!!' in history;
    const saltOk = history?.town_a?.salt && JSON.stringify(history.town_a.salt) === JSON.stringify([1, 2]);
    const wheatDropped = !history?.town_a?.wheat;
    if (!hasInvalidLoc && saltOk && wheatDropped) {
        ok('parseWorldState sanitizes malformed marketPriceHistory entries');
    } else {
        fail(`sanitization mismatch: ${JSON.stringify(history)}`);
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s).`);
    process.exit(1);
} else {
    console.log('\nAll world_observatory_core tests passed.');
}
