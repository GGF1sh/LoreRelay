#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'debugTraceCore.js');
const sourcePath = path.join(root, 'src', 'debugTraceCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    console.error(`FAIL: ${corePath} missing — run npm run compile`);
    process.exit(1);
}

const {
    appendDebugTraceEntry,
    appendDebugTraceEntries,
    createDebugTraceBuffer,
    parseDebugTraceEntry,
    projectDebugTraceBuffer,
    validateDebugTraceLinks,
    MAX_DEBUG_TRACE_ID_CHARS,
    MAX_DEBUG_TRACE_MESSAGE_CHARS,
    MAX_DEBUG_TRACE_CONDITIONS,
    MAX_DEBUG_TRACE_REFS,
} = require(corePath);

function validEntry(overrides = {}) {
    return {
        version: 1,
        runId: 'sim_142',
        traceId: 'trace_001',
        subsystem: 'npcAgency',
        phase: 'decision',
        message: 'Faction warning is not a food crisis.',
        audience: 'internal',
        ...overrides,
    };
}

{
    const warnings = [];
    const entry = parseDebugTraceEntry(validEntry(), warnings);
    if (!entry || warnings.length > 0) {
        fail(`valid entry should parse: ${JSON.stringify({ entry, warnings })}`);
    } else {
        ok('valid entry is accepted');
    }
}

{
    const warnings = [];
    const entry = parseDebugTraceEntry({ traceId: 'x' }, warnings);
    if (entry || warnings.length === 0) {
        fail('missing required fields should reject');
    } else {
        ok('missing required fields are rejected');
    }
}

{
    const warnings = [];
    const entry = parseDebugTraceEntry(validEntry({
        traceId: 't'.repeat(MAX_DEBUG_TRACE_ID_CHARS + 1),
    }), warnings);
    if (entry) {
        fail('overlong traceId should reject');
    } else {
        ok('long ids are bounded');
    }

    const msgWarnings = [];
    const msgEntry = parseDebugTraceEntry(validEntry({
        message: 'm'.repeat(MAX_DEBUG_TRACE_MESSAGE_CHARS + 1),
    }), msgWarnings);
    if (msgEntry) {
        fail('overlong message should reject');
    } else {
        ok('long messages are bounded');
    }
}

{
    const conditions = [];
    for (let i = 0; i < MAX_DEBUG_TRACE_CONDITIONS + 5; i++) {
        conditions.push({ label: `c${i}`, result: true });
    }
    const parsed = parseDebugTraceEntry(validEntry({ conditions }), []);
    if (!parsed || parsed.conditions.length !== MAX_DEBUG_TRACE_CONDITIONS) {
        fail(`conditions should cap at ${MAX_DEBUG_TRACE_CONDITIONS}`);
    } else {
        ok('too many conditions are bounded');
    }

    const refs = [];
    for (let i = 0; i < MAX_DEBUG_TRACE_REFS + 5; i++) {
        refs.push({ kind: 'event', id: `ev_${i}` });
    }
    const refParsed = parseDebugTraceEntry(validEntry({ inputRefs: refs }), []);
    if (!refParsed || refParsed.inputRefs.length !== MAX_DEBUG_TRACE_REFS) {
        fail(`inputRefs should cap at ${MAX_DEBUG_TRACE_REFS}`);
    } else {
        ok('too many refs are bounded');
    }
}

{
    let buffer = createDebugTraceBuffer(3);
    for (let i = 0; i < 5; i++) {
        const result = appendDebugTraceEntry(buffer, validEntry({ traceId: `t${i}` }));
        buffer = result.buffer;
    }
    if (buffer.entries.length !== 3) {
        fail(`ring buffer should keep 3 entries, got ${buffer.entries.length}`);
    } else if (buffer.entries[0].traceId !== 't2' || buffer.entries[2].traceId !== 't4') {
        fail(`oldest entries should be evicted: ${buffer.entries.map((e) => e.traceId).join(',')}`);
    } else {
        ok('ring buffer evicts oldest entries');
    }
}

{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntry(buffer, validEntry({ traceId: 'dup' })).buffer;
    buffer = appendDebugTraceEntry(buffer, validEntry({ traceId: 'dup' })).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'duplicate_trace_id')) {
        fail('duplicate traceId should warn');
    } else {
        ok('duplicate traceId warning');
    }
}

{
    const buffer = appendDebugTraceEntry(
        createDebugTraceBuffer(),
        validEntry({ traceId: 'child', parentTraceId: 'missing_parent' })
    ).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'missing_parent')) {
        fail('missing parent should warn');
    } else {
        ok('missing parent warning');
    }
}

{
    const buffer = appendDebugTraceEntry(
        createDebugTraceBuffer(),
        validEntry({ traceId: 'self', parentTraceId: 'self' })
    ).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'self_parent')) {
        fail('self-parent should warn');
    } else {
        ok('self-parent warning');
    }
}

{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntry(buffer, validEntry({ traceId: 'a', parentTraceId: 'b' })).buffer;
    buffer = appendDebugTraceEntry(buffer, validEntry({ traceId: 'b', parentTraceId: 'a' })).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'parent_cycle')) {
        fail('direct parent cycle should warn');
    } else {
        ok('parent cycle warning');
    }
}

{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntries(buffer, [
        validEntry({ traceId: 'i1', audience: 'internal' }),
        validEntry({ traceId: 'g1', audience: 'gm_safe' }),
        validEntry({ traceId: 'p1', audience: 'player_safe' }),
    ]).buffer;
    const internalProj = projectDebugTraceBuffer(buffer, 'internal');
    if (internalProj.entries.length !== 3) {
        fail(`internal projection should keep all entries (${internalProj.entries.length})`);
    } else {
        ok('projection internal sees all');
    }
    const gmProj = projectDebugTraceBuffer(buffer, 'gm_safe');
    if (gmProj.entries.length !== 2) {
        fail(`gm_safe projection should hide internal (${gmProj.entries.length})`);
    } else if (gmProj.entries.some((e) => e.audience === 'internal')) {
        fail('gm_safe projection still contains internal');
    } else {
        ok('projection gm_safe hides internal');
    }
    const playerProj = projectDebugTraceBuffer(buffer, 'player_safe');
    if (playerProj.entries.length !== 1 || playerProj.entries[0].audience !== 'player_safe') {
        fail(`player_safe projection should keep only player_safe (${playerProj.entries.length})`);
    } else {
        ok('projection player_safe hides internal and gm_safe');
    }
}

{
    const base = createDebugTraceBuffer();
    const batch = appendDebugTraceEntries(base, [
        validEntry({ traceId: 'first' }),
        validEntry({ traceId: 'second' }),
        validEntry({ traceId: 'third' }),
    ]);
    const ids = batch.buffer.entries.map((e) => e.traceId);
    if (ids.join('|') !== 'first|second|third') {
        fail(`append order should be deterministic: ${ids.join('|')}`);
    } else {
        ok('deterministic append order');
    }
}

{
    const base = createDebugTraceBuffer();
    const beforeEntries = base.entries;
    const result = appendDebugTraceEntry(base, validEntry({ traceId: 'immutable' }));
    if (base.entries === result.buffer.entries || base.entries.length !== 0) {
        fail('input buffer should not be mutated');
    } else if (beforeEntries.length !== 0) {
        fail('input buffer entries array should stay empty');
    } else {
        ok('no mutation of input buffer');
    }
}

{
    const reject = appendDebugTraceEntry(createDebugTraceBuffer(), validEntry({ metadata: { x: 1 } }));
    if (reject.accepted !== 0) {
        fail('unknown top-level fields should reject entry');
    } else {
        ok('unknown fields are rejected');
    }
}

{
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const forbidden = ['vscode', 'writeJsonAtomic', 'statePatch'];
    for (const token of forbidden) {
        if (new RegExp(`\\b${token}\\b`).test(source)) {
            fail(`debugTraceCore must not reference forbidden token: ${token}`);
        }
    }
    if (/\bimport\b.*\bfs\b/.test(source) || /\brequire\s*\(\s*['"]fs['"]\s*\)/.test(source)) {
        fail('debugTraceCore must not import fs');
    } else {
        ok('debugTraceCore is pure with no host imports');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_core tests passed');