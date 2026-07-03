#!/usr/bin/env node
'use strict';

const {
    DOMAIN_BALANCE_STRATEGIES,
    DEFAULT_HARNESS_MONTHS,
    runDomainBalanceStrategy,
    summarizeRun,
} = require('./domain_balance_harness_lib');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

function assertStrategy(name, expectations) {
    const actions = DOMAIN_BALANCE_STRATEGIES[name];
    if (!actions) {
        fail(`unknown strategy ${name}`);
        return;
    }
    const run = runDomainBalanceStrategy(name, actions, { months: DEFAULT_HARNESS_MONTHS, seedBase: 2000 });
    const summary = summarizeRun(run);
    let localFailed = false;

    if (run.log.length !== DEFAULT_HARNESS_MONTHS) {
        fail(`${name}: expected ${DEFAULT_HARNESS_MONTHS} months, got ${run.log.length}`);
        localFailed = true;
    }

    if (expectations.treasuryMoves && run.end.treasury === run.start.treasury) {
        fail(`${name}: treasury should move over ${DEFAULT_HARNESS_MONTHS} months`);
        localFailed = true;
    }

    if (expectations.minUniqueEvents !== undefined && summary.uniqueEvents < expectations.minUniqueEvents) {
        fail(`${name}: expected >=${expectations.minUniqueEvents} unique events, got ${summary.uniqueEvents}`);
        localFailed = true;
    }

    if (expectations.notQuietOnly && summary.quietMonths === run.log.length) {
        fail(`${name}: should roll at least one non-quiet event`);
        localFailed = true;
    }

    if (expectations.troopsGrow && run.end.troops <= run.start.troops) {
        fail(`${name}: troops should grow (${run.start.troops} -> ${run.end.troops})`);
        localFailed = true;
    }

    if (expectations.commerceGrow && run.end.commerce <= run.start.commerce) {
        fail(`${name}: commerce should grow (${run.start.commerce} -> ${run.end.commerce})`);
        localFailed = true;
    }

    if (!localFailed) {
        ok(`balance harness ${name} strategy`);
    }
}

{
    assertStrategy('balanced', {
        treasuryMoves: true,
        minUniqueEvents: 2,
        notQuietOnly: true,
    });
    assertStrategy('martial', {
        treasuryMoves: true,
        troopsGrow: true,
        minUniqueEvents: 1,
    });
    assertStrategy('trade', {
        treasuryMoves: true,
        commerceGrow: true,
        minUniqueEvents: 1,
    });
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain balance core tests passed.');