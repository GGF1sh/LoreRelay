#!/usr/bin/env node
'use strict';

/**
 * Domain PR-A: turn merge keeps domain authoritative when commerce-ui bumped stateRevision.
 */

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'workspaceStateQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(modPath)) {
    fail('out/workspaceStateQueueCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    mergeGameStateForPersist,
    DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS,
} = require(modPath);

const baseDomain = {
    enabled: true,
    controlledRegionId: 'riverhold',
    rank: 'minor_lord',
    calendarMonth: 1,
    calendarYear: 1,
    treasury: 300,
    food: 500,
    troops: 80,
    publicOrder: 55,
    popularSupport: 50,
    agriculture: 45,
    commerce: 40,
    defense: 35,
    culture: 20,
    prestige: 10,
    monthlyActionsRemaining: 2,
    officers: [],
    pendingEvents: [],
    flags: {},
};

const committedDomain = {
    ...baseDomain,
    calendarMonth: 2,
    calendarYear: 1,
    treasury: 265,
    monthlyActionsRemaining: 2,
    lastEventId: 'merchant_visit',
    pendingEvents: ['merchant_visit'],
};

{
    const keys = [...DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS];
    if (!keys.includes('domain') || keys.length < 4) {
        fail(`DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS: ${keys.join(',')}`);
    } else {
        ok('DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS includes domain drift roots');
    }
}

{
    const diskAfterCommerceFlush = {
        schemaVersion: 2,
        stateRevision: 9,
        entries: [{ id: 'u1', role: 'user', content: '今月: 農地開発' }],
        commerce: { credits: 120, food: 40, transportId: 'wagon', playerRole: 'merchant', cargo: [] },
        domain: baseDomain,
    };
    const staleTurnCommit = {
        schemaVersion: 2,
        stateRevision: 8,
        entries: [
            { id: 'u1', role: 'user', content: '今月: 農地開発' },
            { id: 'gm1', role: 'gm', sender: 'GM', content: 'Month advances.' },
        ],
        commerce: { credits: 90, food: 40, transportId: 'wagon', playerRole: 'merchant', cargo: [{ commodityId: 'wheat', qty: 2 }] },
        domain: committedDomain,
        domainSnapshotAtDepart: {
            worldTurn: 30,
            treasury: 265,
            food: 500,
            troops: 80,
            publicOrder: 55,
            popularSupport: 50,
            calendarMonth: 2,
            calendarYear: 1,
            officers: [],
        },
        lastDomainVisitWorldTurn: 30,
    };

    const merged = mergeGameStateForPersist(diskAfterCommerceFlush, staleTurnCommit, {
        baseRevision: 8,
        profile: 'turn',
    });

    if (merged.domain?.calendarMonth !== 2 || merged.domain?.treasury !== 265) {
        fail(`turn conflict should keep committed domain: ${JSON.stringify(merged.domain)}`);
    } else {
        ok('turn conflict preserves domain monthly_commit');
    }

    if (merged.commerce?.credits !== 120) {
        fail(`turn conflict should keep disk commerce: ${JSON.stringify(merged.commerce)}`);
    } else {
        ok('turn conflict preserves commerce-ui disk state');
    }

    if (merged.domainSnapshotAtDepart?.worldTurn !== 30 || merged.lastDomainVisitWorldTurn !== 30) {
        fail(`turn conflict should keep drift snapshot roots: ${JSON.stringify({
            snap: merged.domainSnapshotAtDepart,
            last: merged.lastDomainVisitWorldTurn,
        })}`);
    } else {
        ok('turn conflict preserves domain drift authoritative roots');
    }

    if (merged.entries.length !== 2 || merged.entries[1].id !== 'gm1') {
        fail(`turn conflict should merge GM entry: ${JSON.stringify(merged.entries)}`);
    } else {
        ok('turn conflict merges entries from turn commit');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [],
        domain: baseDomain,
        commerce: { credits: 50, food: 10, transportId: 'wagon', playerRole: 'merchant', cargo: [] },
    };
    const freshTurn = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [{ id: 'gm1', role: 'gm', content: 'ok' }],
        domain: committedDomain,
    };
    const merged = mergeGameStateForPersist(disk, freshTurn, {
        baseRevision: 4,
        profile: 'turn',
    });
    if (merged.domain?.calendarMonth !== 2) {
        fail(`no conflict should apply turn domain: ${JSON.stringify(merged.domain)}`);
    } else {
        ok('fresh turn applies domain without revision conflict');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain turn merge conflict tests passed.');