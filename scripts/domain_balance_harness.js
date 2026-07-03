#!/usr/bin/env node
'use strict';

/**
 * Domain balance harness — fixed strategy 12-month simulation (stdout).
 * §14: stat trajectory + event frequency for tuning (optional CI; not in npm test).
 *
 * Usage:
 *   npm run domain:balance
 *   node scripts/domain_balance_harness.js [--months N] [--json]
 *
 * Requires: npm run compile
 */

const {
    DOMAIN_BALANCE_STRATEGIES,
    DEFAULT_HARNESS_MONTHS,
    TRAJECTORY_STATS,
    runDomainBalanceStrategy,
    summarizeRun,
    formatEventFrequency,
    formatTrajectoryLine,
} = require('./domain_balance_harness_lib');

function parseArgs(argv) {
    let months = DEFAULT_HARNESS_MONTHS;
    let json = false;
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--json') {
            json = true;
        } else if (argv[i] === '--months' && argv[i + 1]) {
            months = Math.max(1, Math.min(36, parseInt(argv[++i], 10) || DEFAULT_HARNESS_MONTHS));
        }
    }
    return { months, json };
}

function main() {
    const { months, json } = parseArgs(process.argv);
    const runs = [];

    for (const [name, actions] of Object.entries(DOMAIN_BALANCE_STRATEGIES)) {
        const run = runDomainBalanceStrategy(name, actions, { months, seedBase: 1000 });
        runs.push({ ...run, summary: summarizeRun(run) });
    }

    if (json) {
        const payload = runs.map(({ name, actions, start, end, log, summary }) => ({
            name,
            actions,
            months: log.length,
            start: {
                treasury: start.treasury,
                food: start.food,
                troops: start.troops,
                agriculture: start.agriculture,
                publicOrder: start.publicOrder,
                prestige: start.prestige,
            },
            end: {
                treasury: end.treasury,
                food: end.food,
                troops: end.troops,
                agriculture: end.agriculture,
                publicOrder: end.publicOrder,
                prestige: end.prestige,
                rank: end.rank,
            },
            eventFrequency: summary.eventFrequency,
            trajectories: summary.trajectories,
            log,
        }));
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    console.log(`=== Domain Balance Harness (${months} months) ===\n`);

    for (const run of runs) {
        const { summary } = run;
        console.log(`--- ${run.name} [${run.actions.join(' + ')}] ---`);
        for (const key of TRAJECTORY_STATS) {
            console.log(formatTrajectoryLine(key, summary.trajectories[key]));
        }
        console.log(`rank: ${run.start.rank ?? 'minor_lord'} -> ${run.end.rank}`);
        console.log(`event frequency (${summary.uniqueEvents} unique): ${formatEventFrequency(summary.eventFrequency)}`);
        console.log(`quiet months: ${summary.quietMonths}/${run.log.length}`);
        console.log('');
    }
}

main();