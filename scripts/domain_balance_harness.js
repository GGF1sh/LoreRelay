#!/usr/bin/env node
'use strict';

/**
 * Domain balance harness — fixed strategy 12-month simulation (stdout).
 * Usage: node scripts/domain_balance_harness.js
 * Requires: npm run compile
 */

const {
    defaultDomainState,
    applyMonthlyCommit,
    normalizeDomainConfig,
} = require('../out/domainCore');

const STRATEGIES = {
    balanced: ['agriculture', 'public_order'],
    martial: ['train_troops', 'fortify'],
    trade: ['commerce', 'diplomacy'],
};

function runStrategy(name, actions, months = 12) {
    let domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ monthlyActions: 2 });
    const log = [];

    for (let m = 0; m < months; m++) {
        const ops = { kind: 'monthly_commit', actions, intelligence: m % 3 === 0 ? 'gather_rumors' : 'none' };
        const result = applyMonthlyCommit(domain, ops, cfg, 1000 + m);
        domain = result.domain;
        log.push({
            month: domain.calendarMonth,
            year: domain.calendarYear,
            treasury: domain.treasury,
            food: domain.food,
            troops: domain.troops,
            agriculture: domain.agriculture,
            publicOrder: domain.publicOrder,
            prestige: domain.prestige,
            event: result.rolledEventId,
        });
    }

    return { name, start: defaultDomainState('riverhold'), end: domain, log };
}

console.log('=== Domain Balance Harness (12 months) ===\n');

for (const [name, actions] of Object.entries(STRATEGIES)) {
    const run = runStrategy(name, actions);
    const s = run.start;
    const e = run.end;
    console.log(`--- ${name} [${actions.join(' + ')}] ---`);
    console.log(`treasury: ${s.treasury} -> ${e.treasury} (delta ${e.treasury - s.treasury})`);
    console.log(`food: ${s.food} -> ${e.food}`);
    console.log(`troops: ${s.troops} -> ${e.troops}`);
    console.log(`agriculture: ${s.agriculture} -> ${e.agriculture}`);
    console.log(`publicOrder: ${s.publicOrder} -> ${e.publicOrder}`);
    console.log(`prestige: ${s.prestige} -> ${e.prestige} rank=${e.rank}`);
    console.log(`events: ${run.log.map((l) => l.event).join(', ')}`);
    console.log('');
}