#!/usr/bin/env node
'use strict';

/**
 * World Observatory side-effect contract (watch vs advance).
 * Pure tests — no vscode/fs.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'worldObservatoryCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/worldObservatoryCore.js missing - run npm run compile first');
    process.exit(1);
}

const {
    OBSERVER_TICK_CONTRACT,
    observerPersistSequence,
    normalizeObserverTickMode,
} = require(corePath);

{
    const watch = OBSERVER_TICK_CONTRACT.watch;
    if (!watch.writes.includes('world_state') || !watch.writes.includes('npc_registry')) {
        fail(`watch should write world_state and npc_registry: ${JSON.stringify(watch.writes)}`);
    } else if (!watch.doesNotWrite.includes('game_state')) {
        fail('watch should not write game_state');
    } else if (!watch.worldStepEffects.includes('questHooks')) {
        fail('contract should list questHooks as a world step effect');
    } else {
        ok('watch contract: world_state + npc_registry, not game_state');
    }
}

{
    const advance = OBSERVER_TICK_CONTRACT.advance;
    if (!advance.writes.includes('game_state')) {
        fail('advance should list game_state (commerce.food) as writable');
    } else if (!advance.worldStepEffects.includes('markets')) {
        fail('advance should share world step effects with watch');
    } else {
        ok('advance contract includes game_state commerce path');
    }
}

{
    const seqNoRegistry = observerPersistSequence(false);
    if (seqNoRegistry.length !== 1 || seqNoRegistry[0] !== 'world_state') {
        fail(`persist sequence without registry: ${JSON.stringify(seqNoRegistry)}`);
    } else {
        ok('persist sequence is world_state only when registry unchanged');
    }
}

{
    const seqWithRegistry = observerPersistSequence(true);
    if (
        seqWithRegistry.length !== 2
        || seqWithRegistry[0] !== 'npc_registry'
        || seqWithRegistry[1] !== 'world_state'
    ) {
        fail(`persist sequence with registry: ${JSON.stringify(seqWithRegistry)}`);
    } else {
        ok('persist sequence writes npc_registry before world_state');
    }
}

{
    if (normalizeObserverTickMode('advance') !== 'advance') {
        fail('normalizeObserverTickMode should accept advance');
    } else if (normalizeObserverTickMode('bogus') !== 'watch') {
        fail('normalizeObserverTickMode should default to watch');
    } else {
        ok('normalizeObserverTickMode sanitizes mode');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('observer tick side-effect contract: all tests passed.');