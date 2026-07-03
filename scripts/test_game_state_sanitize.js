#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const sanitizePath = path.join(root, 'out', 'gameStateSanitize.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(sanitizePath)) {
    fail('out/gameStateSanitize.js missing — run npm run compile first');
    process.exit(1);
}

const { sanitizeGameStateForPersist, salvageGameStateFromUnknown } = require(sanitizePath);
const { validateGameState } = require(path.join(root, 'out', 'validateGameState.js'));

const hpFixed = sanitizeGameStateForPersist({
    schemaVersion: 2,
    entries: [],
    status: { hp: { current: NaN, max: Infinity } },
    hiddenDice: [null, { notation: '1d20', purpose: 'stealth' }],
});

if (hpFixed.status.hp.current !== 1 || hpFixed.status.hp.max !== 1) {
    fail(`hp sanitize: ${JSON.stringify(hpFixed.status.hp)}`);
} else {
    ok('hp NaN/Infinity clamped');
}

if (!Array.isArray(hpFixed.hiddenDice) || hpFixed.hiddenDice.length !== 1) {
    fail(`hiddenDice null filtered: ${JSON.stringify(hpFixed.hiddenDice)}`);
} else {
    ok('hiddenDice null filtered');
}

const inv = sanitizeGameStateForPersist({
    schemaVersion: 2,
    entries: [],
    status: {
        inventory: Array.from({ length: 150 }, (_, i) => `item-${i}`),
        location: 'x'.repeat(900),
    },
});

if (inv.status.inventory.length !== 100) {
    fail(`inventory capped: ${inv.status.inventory.length}`);
} else {
    ok('inventory array capped');
}

if (inv.status.location.length !== 500) {
    fail(`location string capped: ${inv.status.location.length}`);
} else {
    ok('location string capped');
}

{
    const salvaged = salvageGameStateFromUnknown({
        schemaVersion: 2,
        entries: [
            { id: 'turn-1', role: 'gm', sender: 'GM', content: 'Hello' },
            { id: 'bad id', role: 'gm', sender: 'GM', content: 'drop me' },
            null,
            { id: 'turn-2', role: 'user', sender: 'Player', content: 123 },
        ],
        status: {
            hp: { current: '5', max: 10 },
            inventory: ['a', 2, 'b'],
            location: 'x'.repeat(900),
        },
        options: 'not-an-array',
        theme: 42,
    });

    if (!salvaged || !Array.isArray(salvaged.entries) || salvaged.entries.length !== 2) {
        fail(`salvage keeps valid entries: ${JSON.stringify(salvaged?.entries)}`);
    } else {
        ok('salvage keeps valid entries');
    }

    const errors = validateGameState(salvaged);
    if (errors.length > 0) {
        fail(`salvaged state validates: ${errors.join('; ')}`);
    } else {
        ok('salvaged state validates');
    }

    if (salvaged.entries[1].content !== '') {
        fail('salvage coerces non-string content to empty string');
    } else {
        ok('salvage coerces non-string content to empty string');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('gameStateSanitize tests passed.');