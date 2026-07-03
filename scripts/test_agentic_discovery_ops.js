#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const corePath = path.join(__dirname, '..', 'out', 'agenticGmCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/agenticGmCore.js missing — run npm run compile');
    process.exit(1);
}

const { parseRefereeResultJson, mergeAgenticTurnResult } = require(corePath);

{
    const referee = parseRefereeResultJson(JSON.stringify({
        turnId: 't1',
        discoveryOps: [
            { op: 'add', id: 'find_x', label: 'Shard', discoveryKind: 'material' },
            { op: 'bad', id: 'nope' },
        ],
    }));
    if (!referee?.discoveryOps || referee.discoveryOps.length !== 1) {
        fail(`referee should parse discoveryOps: ${JSON.stringify(referee?.discoveryOps)}`);
    } else {
        ok('parseRefereeResultJson discoveryOps');
    }
    const merged = mergeAgenticTurnResult({
        referee,
        narrator: { narration: 'You pocket the shard.' },
        playerAction: 'take it',
    });
    if (!merged.ok || !merged.result?.discoveryOps?.[0]?.id) {
        fail('merge should carry discoveryOps into turn result');
    } else {
        ok('mergeAgenticTurnResults discoveryOps');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('agentic discovery ops: all tests passed.');