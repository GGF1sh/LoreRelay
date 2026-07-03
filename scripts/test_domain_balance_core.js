#!/usr/bin/env node
'use strict';

const {
    defaultDomainState,
    applyMonthlyCommit,
    normalizeDomainConfig,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

function simulate(actions, months = 12) {
    let domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ monthlyActions: 2 });
    const events = new Set();
    let quietOnly = true;

    for (let m = 0; m < months; m++) {
        const result = applyMonthlyCommit(domain, {
            kind: 'monthly_commit',
            actions,
            intelligence: m % 4 === 0 ? 'gather_rumors' : 'none',
        }, cfg, 2000 + m);
        domain = result.domain;
        events.add(result.rolledEventId);
        if (result.rolledEventId !== 'domain_quiet_month') {
            quietOnly = false;
        }
    }
    return { domain, events, quietOnly };
}

{
    const balanced = simulate(['agriculture', 'public_order']);
    if (balanced.domain.treasury === 300) {
        fail('balanced strategy should move treasury over 12 months');
    } else if (balanced.quietOnly) {
        fail('balanced strategy should roll at least one non-quiet event');
    } else if (balanced.events.size < 2) {
        fail('balanced strategy should see event variety');
    } else {
        ok('balance harness balanced strategy');
    }

    const martial = simulate(['train_troops', 'fortify']);
    if (martial.domain.troops <= 80) {
        fail('martial strategy should grow troops');
    } else {
        ok('balance harness martial strategy');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain balance core tests passed.');