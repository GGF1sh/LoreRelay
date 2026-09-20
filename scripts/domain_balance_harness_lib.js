'use strict';

const {
    defaultDomainState,
    applyMonthlyCommit,
    normalizeDomainConfig,
} = require('../out/domainCore');

/** Fixed strategies for 12-month balance tuning (§14). */
const DOMAIN_BALANCE_STRATEGIES = {
    balanced: ['agriculture', 'public_order'],
    martial: ['train_troops', 'fortify'],
    trade: ['commerce', 'diplomacy'],
};

const DEFAULT_HARNESS_MONTHS = 12;

const TRAJECTORY_STATS = ['treasury', 'food', 'troops', 'agriculture', 'publicOrder', 'prestige'];

function runDomainBalanceStrategy(strategyName, actions, options = {}) {
    const months = options.months ?? DEFAULT_HARNESS_MONTHS;
    const seedBase = options.seedBase ?? 1000;
    const cfg = normalizeDomainConfig({ monthlyActions: 2 });
    let domain = defaultDomainState('riverhold');
    const start = defaultDomainState('riverhold');
    const log = [];

    for (let m = 0; m < months; m++) {
        const ops = {
            kind: 'monthly_commit',
            actions,
            intelligence: m % 3 === 0 ? 'gather_rumors' : 'none',
        };
        const result = applyMonthlyCommit(domain, ops, cfg, seedBase + m);
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

    return { name: strategyName, actions, start, end: domain, log, months };
}

function summarizeEventFrequency(log) {
    const freq = {};
    for (const entry of log) {
        freq[entry.event] = (freq[entry.event] ?? 0) + 1;
    }
    return freq;
}

function summarizeStatTrajectory(log, key) {
    const values = log.map((entry) => entry[key]);
    const start = values[0];
    const end = values[values.length - 1];
    return {
        start,
        end,
        min: Math.min(...values),
        max: Math.max(...values),
        delta: end - start,
    };
}

function summarizeRun(run) {
    const eventFrequency = summarizeEventFrequency(run.log);
    const trajectories = {};
    for (const key of TRAJECTORY_STATS) {
        trajectories[key] = summarizeStatTrajectory(run.log, key);
    }
    const uniqueEvents = Object.keys(eventFrequency).length;
    const quietMonths = eventFrequency.domain_quiet_month ?? 0;
    return { eventFrequency, trajectories, uniqueEvents, quietMonths };
}

function formatEventFrequency(freq) {
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => `${id}:${count}`)
        .join(', ');
}

function formatTrajectoryLine(key, traj) {
    return `${key}: ${traj.start} -> ${traj.end} (min ${traj.min}, max ${traj.max}, delta ${traj.delta >= 0 ? '+' : ''}${traj.delta})`;
}

module.exports = {
    DOMAIN_BALANCE_STRATEGIES,
    DEFAULT_HARNESS_MONTHS,
    TRAJECTORY_STATS,
    runDomainBalanceStrategy,
    summarizeEventFrequency,
    summarizeStatTrajectory,
    summarizeRun,
    formatEventFrequency,
    formatTrajectoryLine,
};