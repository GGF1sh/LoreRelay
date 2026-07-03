#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'workspaceStateQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(modPath)) {
    fail('out/workspaceStateQueueCore.js missing - run npm run compile');
    process.exit(1);
}

const { mergeGameStateForPersist } = require(modPath);

{
    const diskAfterUiEdit = {
        schemaVersion: 2,
        stateRevision: 9,
        entries: [{ id: 'u1', role: 'user', content: 'use rope and treat poison' }],
        status: {
            hp: { current: 9, max: 12 },
            inventory: ['map'],
            condition: ['tired'],
            skills: ['repair'],
            gold: 7,
        },
    };
    const staleTurnSnapshot = {
        schemaVersion: 2,
        stateRevision: 8,
        entries: [
            { id: 'u1', role: 'user', content: 'use rope and treat poison' },
            { id: 'gm1', role: 'gm', sender: 'GM', content: 'The rope is gone; you feel steadier.' },
        ],
        status: {
            hp: { current: 6, max: 12 },
            inventory: ['map', 'rope', 'antidote'],
            condition: ['tired', 'poisoned'],
            skills: ['repair', 'stealth'],
            gold: 12,
        },
        options: ['Continue'],
    };

    const merged = mergeGameStateForPersist(diskAfterUiEdit, staleTurnSnapshot, {
        baseRevision: 8,
        profile: 'turn',
    });

    if (JSON.stringify(merged.status.inventory) !== JSON.stringify(['map'])) {
        fail(`stale turn revived deleted inventory: ${JSON.stringify(merged.status.inventory)}`);
    } else {
        ok('turn conflict preserves disk inventory');
    }
    if (JSON.stringify(merged.status.condition) !== JSON.stringify(['tired'])) {
        fail(`stale turn revived removed condition: ${JSON.stringify(merged.status.condition)}`);
    } else {
        ok('turn conflict preserves disk condition');
    }
    if (JSON.stringify(merged.status.skills) !== JSON.stringify(['repair'])) {
        fail(`stale turn revived removed skill: ${JSON.stringify(merged.status.skills)}`);
    } else {
        ok('turn conflict preserves disk skills');
    }
    if (merged.status.hp.current !== 6 || merged.status.gold !== 12) {
        fail(`GM-owned scalar status should still apply: ${JSON.stringify(merged.status)}`);
    } else {
        ok('turn conflict still applies non-protected GM status fields');
    }
    if (merged.entries.length !== 2 || merged.options[0] !== 'Continue') {
        fail(`turn commit should merge entries and authoritative roots: ${JSON.stringify(merged)}`);
    } else {
        ok('turn conflict keeps entries/options from GM turn');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [],
        status: { inventory: ['old'], condition: ['old'], skills: ['old'] },
    };
    const freshTurn = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [{ id: 'gm1', role: 'gm', content: 'fresh' }],
        status: { inventory: ['new'], condition: ['new'], skills: ['new'] },
    };
    const merged = mergeGameStateForPersist(disk, freshTurn, {
        baseRevision: 4,
        profile: 'turn',
    });
    if (
        JSON.stringify(merged.status.inventory) !== JSON.stringify(['new'])
        || JSON.stringify(merged.status.condition) !== JSON.stringify(['new'])
        || JSON.stringify(merged.status.skills) !== JSON.stringify(['new'])
    ) {
        fail(`fresh turn should win without revision conflict: ${JSON.stringify(merged.status)}`);
    } else {
        ok('fresh turn can update protected arrays when no conflict exists');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('state merge inventory race: all tests passed.');
