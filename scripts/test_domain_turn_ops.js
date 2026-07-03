#!/usr/bin/env node
'use strict';

const { applyDomainOpsToGameState, readDomainFromState } = require('../out/domainTurnOpsCore');
const { defaultDomainState } = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    const gameState = {
        domain: defaultDomainState('riverhold'),
    };
    const turn = {
        domainOps: {
            kind: 'monthly_commit',
            actions: ['agriculture', 'inspect'],
        },
    };
    const next = applyDomainOpsToGameState(turn, gameState, false);
    if (readDomainFromState(next)?.treasury !== gameState.domain.treasury) {
        fail('domain OFF should not mutate');
    } else {
        ok('domain OFF leaves state unchanged');
    }

    const on = applyDomainOpsToGameState(turn, gameState, true, { monthlyActions: 2 }, 50);
    const after = readDomainFromState(on);
    if (!after || after.treasury >= gameState.domain.treasury) {
        fail('domain ON should spend treasury on actions', after);
    } else if (after.calendarMonth !== 2) {
        fail('domain ON should advance calendar');
    } else {
        ok('domain ON applies monthly_commit');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain turn ops tests passed.');