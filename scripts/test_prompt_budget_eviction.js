#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/gmPromptBuilderCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    evictPromptChunksByBudget,
    resolvePromptChunkPriority,
    isPromptChunkNeverEvict,
} = require(corePath);

if (resolvePromptChunkPriority('gameRules') <= resolvePromptChunkPriority('vision')) {
    fail('gameRules priority should exceed vision');
} else if (resolvePromptChunkPriority('narrativeTime') <= resolvePromptChunkPriority('director')) {
    fail('narrativeTime priority should exceed director');
} else if (resolvePromptChunkPriority('campaignKit') <= resolvePromptChunkPriority('domain')) {
    fail('campaignKit priority should exceed domain/guild simulation helpers');
} else if (resolvePromptChunkPriority('discoveryLedger') <= resolvePromptChunkPriority('domain')) {
    fail('discoveryLedger priority should exceed domain/guild simulation helpers');
} else if (resolvePromptChunkPriority('campaignJobBoard') <= resolvePromptChunkPriority('domain')) {
    fail('campaignJobBoard priority should exceed domain/guild simulation helpers');
} else if (resolvePromptChunkPriority('discoveryLedger') <= resolvePromptChunkPriority('campaignJobBoard')) {
    fail('discoveryLedger priority should exceed campaignJobBoard');
} else {
    ok('priority ordering');
}

if (resolvePromptChunkPriority('worldState') <= resolvePromptChunkPriority('livingWorldNpcBonds')) {
    fail('worldState priority should exceed livingWorldNpcBonds');
} else if (resolvePromptChunkPriority('livingWorldNpcBonds') <= resolvePromptChunkPriority('livingWorldPlayerBonds')) {
    fail('livingWorldNpcBonds priority should exceed livingWorldPlayerBonds');
} else if (resolvePromptChunkPriority('settlement') >= resolvePromptChunkPriority('vehicles')) {
    fail('settlement should evict before vehicles under bloat mitigation');
} else if (resolvePromptChunkPriority('worldForge') <= resolvePromptChunkPriority('vehicles')) {
    fail('worldForge priority should exceed vehicles');
} else {
    ok('LW bond + vehicle priority ordering');
}

{
    const chunks = [
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'vision', text: 'v'.repeat(5000), priority: 35 },
        { id: 'lorebook', text: 'l'.repeat(5000), priority: 40 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 6000);
    const joined = kept.join('\n');
    if (!joined.includes('rules')) {
        fail('high-priority gameRules preserved');
    } else {
        ok('high-priority gameRules preserved');
    }
    if (joined.includes('v'.repeat(4000))) {
        fail('low-priority vision evicted or truncated first');
    } else {
        ok('low-priority vision evicted or truncated first');
    }
}

{
    const bondPad = 'b'.repeat(4000);
    const chunks = [
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'worldState', text: 'world-core', priority: 68 },
        { id: 'livingWorldNpcBonds', text: bondPad, priority: 62 },
        { id: 'livingWorldPlayerBonds', text: bondPad, priority: 61 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 200);
    const joined = kept.join('\n');
    if (!joined.includes('rules') || !joined.includes('world-core')) {
        fail(`core chunks preserved under budget: ${joined.length}`);
    } else if (joined.includes(bondPad)) {
        fail('LW bond chunks should evict before worldState');
    } else {
        ok('LW bond chunks evicted before worldState under tight budget');
    }
}

{
    const domainPad = 'd'.repeat(5000);
    const guildPad = 'g'.repeat(5000);
    const bondPad = 'b'.repeat(4000);
    const chunks = [
        { id: 'gameRules', text: 'rules-must-stay', priority: 100 },
        { id: 'narrativeTime', text: 'time-anchor', priority: 98 },
        { id: 'domain', text: domainPad, priority: 67 },
        { id: 'guild', text: guildPad, priority: 66 },
        { id: 'livingWorldNpcBonds', text: bondPad, priority: 62 },
        { id: 'vision', text: 'v'.repeat(3000), priority: 35 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 400);
    const joined = kept.join('\n');
    if (!joined.includes('rules-must-stay') || !joined.includes('time-anchor')) {
        fail(`simulation competition must keep core rules/time: ${joined.length}`);
    } else if (joined.includes(domainPad) || joined.includes(guildPad) || joined.includes(bondPad)) {
        fail('domain/guild/bonds should evict or truncate under tight budget');
    } else {
        ok('domain+guild+bonds evicted before gameRules under tight budget');
    }
}

{
    const { clampSimulationPromptModule, MAX_SIMULATION_MODULE_PROMPT_CHARS } = require(corePath);
    const huge = 'x'.repeat(MAX_SIMULATION_MODULE_PROMPT_CHARS + 500);
    const clamped = clampSimulationPromptModule(huge);
    if (clamped.length > MAX_SIMULATION_MODULE_PROMPT_CHARS || !clamped.includes('[truncated]')) {
        fail(`clampSimulationPromptModule: len=${clamped.length}`);
    } else {
        ok('clampSimulationPromptModule caps domain/guild blocks');
    }
}

{
    const vehiclePad = 'v'.repeat(3000);
    const chunks = [
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'worldForge', text: 'world', priority: 65 },
        { id: 'vehicles', text: vehiclePad, priority: 64 },
        { id: 'mobileBase', text: 'm'.repeat(2000), priority: 63 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 250);
    const joined = kept.join('\n');
    if (!joined.includes('rules') || !joined.includes('world')) {
        fail('core + worldForge should survive before vehicles');
    } else if (joined.includes(vehiclePad)) {
        fail('vehicles chunk should evict under tight budget');
    } else {
        ok('vehicles evicted before worldForge under tight budget');
    }
}

{
    if (!isPromptChunkNeverEvict('gameRules') || !isPromptChunkNeverEvict('narrativeTime')) {
        fail('Tier 0 chunks marked never-evict');
    } else if (isPromptChunkNeverEvict('vision')) {
        fail('vision should remain evictable');
    } else {
        ok('Tier 0 never-evict ids');
    }
}

{
    const rulesText = 'SYSTEM RULES: never remove player agency';
    const timeText = 'TIME: day 3';
    const chunks = [
        { id: 'gameRules', text: rulesText, priority: 100 },
        { id: 'narrativeTime', text: timeText, priority: 98 },
        { id: 'vision', text: 'v'.repeat(8000), priority: 35 },
        { id: 'lorebook', text: 'l'.repeat(8000), priority: 40 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 120);
    const joined = kept.join('\n');
    if (!joined.includes(rulesText) || !joined.includes(timeText)) {
        fail(`Tier 0 chunks must survive tiny budget: ${joined}`);
    } else if (joined.includes('v'.repeat(4000))) {
        fail('evictable vision should drop before Tier 0');
    } else {
        ok('Tier 0 preserved under extreme budget pressure');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('prompt budget eviction: all tests passed.');
