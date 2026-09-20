#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'determinismSpineCore.js');
const qaCorePath = path.join(root, 'out', 'gameQaRunnerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, qaCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    DETERMINISM_PARSE_ERROR_SENTINEL,
    buildAggregateHash,
    buildCanonicalFileHash,
    buildCanonicalFileHashes,
    buildDeterminismSnapshot,
    compareDeterminismSnapshotStreams,
    redactVolatileFields,
    stableSerialize,
} = require(corePath);
const {
    GAME_QA_SCENARIO_VERSION,
    parseQaDeterminismConfig,
    parseQaScenarioDocument,
} = require(qaCorePath);

const hashText = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

{
    const a = stableSerialize({ z: 1, a: 2, m: { y: 1, x: 2 } });
    const b = stableSerialize({ m: { x: 2, y: 1 }, a: 2, z: 1 });
    if (a !== b) {
        fail(`stable serializer key order mismatch:\n${a}\n${b}`);
    } else {
        ok('stable serializer sorts object keys');
    }
}

{
    const left = { b: 1, a: 2 };
    const right = { a: 2, b: 1 };
    const leftHash = buildCanonicalFileHash({
        path: 'world_state.json',
        exists: true,
        parsed: left,
    }, hashText).hash?.value;
    const rightHash = buildCanonicalFileHash({
        path: 'world_state.json',
        exists: true,
        parsed: right,
    }, hashText).hash?.value;
    if (leftHash !== rightHash) {
        fail('same object with different insertion order should hash the same');
    } else {
        ok('different key insertion order hashes the same');
    }
}

{
    const one = buildCanonicalFileHash({
        path: 'world_state.json',
        exists: true,
        parsed: { items: [1, 2, 3] },
    }, hashText).hash?.value;
    const two = buildCanonicalFileHash({
        path: 'world_state.json',
        exists: true,
        parsed: { items: [1, 3, 2] },
    }, hashText).hash?.value;
    if (one === two) {
        fail('array order change should change hash');
    } else {
        ok('array order changes hash');
    }
}

{
    const withFile = buildCanonicalFileHashes({
        'world_state.json': {
            path: 'world_state.json',
            exists: true,
            parsed: { worldTurn: 1 },
        },
    }, hashText);
    const missing = buildCanonicalFileHashes({}, hashText);
    const world = withFile.find((f) => f.path === 'world_state.json');
    const missingWorld = missing.find((f) => f.path === 'world_state.json');
    if (!world?.hash || missingWorld?.exists !== false || missingWorld.hash) {
        fail('missing optional file should be deterministic absent record');
    } else {
        ok('missing optional file is represented deterministically');
    }
}

{
    const errA = buildCanonicalFileHash({
        path: 'game_rules.json',
        exists: true,
        parseError: DETERMINISM_PARSE_ERROR_SENTINEL,
    }, hashText);
    const errB = buildCanonicalFileHash({
        path: 'game_rules.json',
        exists: true,
        parseError: DETERMINISM_PARSE_ERROR_SENTINEL,
    }, hashText);
    const aggA = buildAggregateHash([errA], hashText).value;
    const aggB = buildAggregateHash([errB], hashText).value;
    if (aggA !== aggB || errA.parseError !== DETERMINISM_PARSE_ERROR_SENTINEL) {
        fail('parse error sentinel should be deterministic');
    } else {
        ok('parse error sentinel is deterministic');
    }
}

{
    const base = buildDeterminismSnapshot({
        label: 'start',
        inputsByPath: {
            'world_state.json': {
                path: 'world_state.json',
                exists: true,
                parsed: { worldTurn: 1, factions: {} },
            },
        },
        hashText,
    });
    const changed = buildDeterminismSnapshot({
        label: 'start',
        inputsByPath: {
            'world_state.json': {
                path: 'world_state.json',
                exists: true,
                parsed: { worldTurn: 2, factions: {} },
            },
        },
        hashText,
    });
    if (base.aggregateHash.value === changed.aggregateHash.value) {
        fail('aggregate hash should change when canonical file changes');
    } else {
        ok('aggregate hash changes on canonical file change');
    }
}

{
    const redacted = redactVolatileFields({
        worldTurn: 1,
        lastSavedAt: '2026-07-05T00:00:00Z',
        lastUpdated: '2026-07-05T01:02:03Z',
        debug: { trace: 1 },
        report: { ok: true },
        meta: { generatedAt: '2026-07-05T00:00:00Z', worldName: 'Test' },
        nested: {
            debug: { keepThis: 123 },
            lastSavedAt: 'preserve_me',
        }
    });
    if (redacted.lastSavedAt || redacted.lastUpdated || redacted.debug || redacted.report || redacted.meta.generatedAt) {
        fail('volatile exclusions should remove named root fields');
    } else if (redacted.meta.worldName !== 'Test' || redacted.worldTurn !== 1) {
        fail('volatile exclusions should preserve non-volatile fields');
    } else if (!redacted.nested || !redacted.nested.debug || redacted.nested.debug.keepThis !== 123 || redacted.nested.lastSavedAt !== 'preserve_me') {
        fail('volatile exclusions should not remove deep nested fields with identical names');
    } else {
        ok('volatile path exclusion is narrow and only applies to root fields');
    }
}

{
    const snap = (label, turn) => buildDeterminismSnapshot({
        label,
        inputsByPath: {
            'world_state.json': {
                path: 'world_state.json',
                exists: true,
                parsed: { worldTurn: turn },
            },
        },
        hashText,
    });
    const left = [snap('start', 0), snap('finish', 3)];
    const right = [snap('start', 0), snap('finish', 3)];
    const same = compareDeterminismSnapshotStreams(left, right);
    if (!same.ok || same.snapshots !== 2) {
        fail(`identical snapshot streams should compare OK: ${JSON.stringify(same)}`);
    } else {
        ok('snapshot stream compare OK');
    }

    const drift = compareDeterminismSnapshotStreams(left, [snap('start', 0), snap('finish', 4)]);
    if (drift.ok || drift.firstDifferentSnapshot.index !== 1 || drift.fileDiffs.length === 0) {
        fail(`drift comparison should report first differing snapshot: ${JSON.stringify(drift)}`);
    } else {
        ok('snapshot stream compare reports drift');
    }
}

{
    const defaults = parseQaDeterminismConfig(undefined);
    if (!defaults.ok || defaults.config.enabled || defaults.config.compareRuns !== 1 || defaults.config.failOnDrift) {
        fail(`unexpected determinism defaults: ${JSON.stringify(defaults)}`);
    } else {
        ok('determinism config parser applies defaults');
    }

    const enabled = parseQaDeterminismConfig({
        enabled: true,
        snapshotOn: ['start', 'after_step', 'finish'],
        compareRuns: 2,
    });
    if (!enabled.ok || !enabled.config.enabled || enabled.config.compareRuns !== 2 || !enabled.config.failOnDrift) {
        fail(`enabled determinism config parse failed: ${JSON.stringify(enabled)}`);
    } else {
        ok('determinism config parser accepts valid config');
    }

    const bad = parseQaDeterminismConfig({ enabled: true, compareRuns: 3 });
    if (bad.ok) {
        fail('compareRuns:3 should be rejected in D1');
    } else {
        ok('determinism config parser rejects unsupported compareRuns');
    }

    const configWithCustom = parseQaDeterminismConfig({
        enabled: true,
        customFiles: ['custom_data.json', 'another_file.json']
    });
    if (configWithCustom.ok) {
        fail('determinism config parser should reject customFiles in D1');
    } else {
        ok('determinism config parser rejects customFiles in D1');
    }

    const scenario = parseQaScenarioDocument({
        id: 'qa_determinism_world_sim',
        version: GAME_QA_SCENARIO_VERSION,
        description: 'determinism scenario',
        mode: 'full',
        workspace: { source: 'sample', sampleId: 'debug-sandbox' },
        determinism: {
            enabled: true,
            snapshotOn: ['start', 'finish'],
            compareRuns: 2,
            failOnDrift: true,
        },
        steps: [{ id: 'advance_world', type: 'world_sim', steps: 3 }],
    });
    if (!scenario.ok || !scenario.scenario.determinism?.enabled || scenario.scenario.determinism.compareRuns !== 2) {
        fail(`scenario parser should accept determinism config: ${JSON.stringify(scenario)}`);
    } else {
        ok('scenario parser accepts determinism config');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll determinismSpineCore tests passed.');
