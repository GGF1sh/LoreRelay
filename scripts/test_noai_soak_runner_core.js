#!/usr/bin/env node
'use strict';

// Fast focused tests for NOAI-SOAK-001. These do NOT run hundreds of real turns.
// They prove the scenario contract, deterministic policies, event identity,
// bounded telemetry, machine invariants, determinism drift reporting, and
// workspace retention/cleanup. Registered in normal `npm test` (unit category).
// The full soak scenarios are NOT registered in npm test.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'noaiSoakRunnerCore.js');
const commercePath = path.join(root, 'out', 'commerceCore.js');
const spinePath = path.join(root, 'out', 'determinismSpineCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function check(name, fn) {
    try {
        fn();
        ok(name);
    } catch (err) {
        fail(`${name}: ${err.message}`);
    }
}

if (!fs.existsSync(corePath)) {
    fail('out/noaiSoakRunnerCore.js missing — run npm run compile');
    process.exit(1);
}

const core = require(corePath);
const { applyTradeOp } = require(commercePath);
const { buildDeterminismSnapshot, compareDeterminismSnapshotStreams } = require(spinePath);
const hashText = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Shared commerce fixtures (mirror scripts/noai_soak_scenarios/fixtures/merchant_three_market).
const forge = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
        { id: 'steel', name: 'Steel', basePrice: 45, weight: 2 },
        { id: 'spice', name: 'Spice', basePrice: 80, weight: 1 },
    ],
    markets: [
        { locationId: 'north_farm', regionId: 'r_north', commodityIds: ['wheat'], supplyBias: 0.85, targetStock: 50 },
        { locationId: 'elda_shop', regionId: 'r_central', commodityIds: ['wheat', 'steel'], supplyBias: 1.0, targetStock: 35 },
        { locationId: 'south_port', regionId: 'r_south', commodityIds: ['wheat', 'steel', 'spice'], supplyBias: 1.15, targetStock: 40 },
    ],
    transportKinds: [
        { id: 'wagon', name: 'Wagon', capacity: 20, speed: 1 },
        { id: 'river_boat', name: 'River boat', capacity: 35, speed: 1.4 },
    ],
};
function freshMarkets() {
    return {
        north_farm: { wheat: { stock: 48, priceIndex: 1.0 } },
        elda_shop: { wheat: { stock: 20, priceIndex: 1.1 }, steel: { stock: 10, priceIndex: 1.25 } },
        south_port: { wheat: { stock: 15, priceIndex: 1.35 }, steel: { stock: 20, priceIndex: 1.0 }, spice: { stock: 15, priceIndex: 1.0 } },
    };
}
function baseScenario(overrides = {}) {
    return {
        id: 'noai_unit_scenario',
        version: 1,
        description: 'unit test scenario',
        mode: 'quick',
        seed: 'unit-seed',
        policyId: 'merchant_balanced',
        workspace: { source: 'fixture', fixturePath: 'scripts/noai_soak_scenarios/fixtures/merchant_three_market' },
        horizon: { turns: 5 },
        worldSim: { cadenceTurns: 1, stepsPerCadence: 1, enableNpcRegistry: false },
        limits: { maxTurns: 10, maxStepsPerChunk: 5, maxOpsPerTurn: 2, maxFileBytes: 1000000, maxRecentChanges: 20 },
        invariants: ['no_nan_or_infinity', 'json_parseable', 'world_turn_monotonic'],
        telemetry: { sampleEveryTurns: 1, maxSamples: 10, recentWindow: 10, maxAnomalyWindows: 5 },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// 1. Scenario parser rejects arbitrary commands and unsafe paths
// ---------------------------------------------------------------------------
check('parser accepts a valid scenario', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario());
    assert.ok(parsed.ok, `expected ok, got ${JSON.stringify(parsed.errors)}`);
});
check('parser rejects a forbidden command key', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ command: 'rm -rf /' }));
    assert.ok(!parsed.ok, 'expected rejection');
    assert.ok(parsed.errors.some((e) => e.includes('forbidden')), `expected forbidden error, got ${parsed.errors}`);
});
check('parser rejects a nested code/script key', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ worldSim: { cadenceTurns: 1, stepsPerCadence: 1, enableNpcRegistry: false, script: 'x()' } }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('forbidden')), 'expected forbidden nested key rejection');
});
check('parser rejects an unsafe fixture path (traversal)', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ workspace: { source: 'fixture', fixturePath: '../../etc/passwd' } }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('unsafe')), 'expected unsafe path rejection');
});
check('parser rejects an absolute fixture path', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ workspace: { source: 'fixture', fixturePath: 'C:/Windows/system32' } }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('unsafe')), 'expected absolute path rejection');
});
check('parser rejects a non-allowlisted policy', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ policyId: 'hack_the_world' }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('policyId')), 'expected policy rejection');
});
check('parser rejects a non-allowlisted invariant', () => {
    const parsed = core.parseNoaiSoakScenarioDocument(baseScenario({ invariants: ['no_nan_or_infinity', 'delete_everything'] }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('invariant')), 'expected invariant rejection');
});

// ---------------------------------------------------------------------------
// 2. Same seed / policy produces the same actions
// ---------------------------------------------------------------------------
check('same seed produces identical rng stream; different seed differs', () => {
    const a = core.createSoakRng('seed-A');
    const b = core.createSoakRng('seed-A');
    const c = core.createSoakRng('seed-B');
    const seqA = [a.nextU32(), a.nextU32(), a.nextU32(), a.nextU32(), a.nextU32()];
    const seqB = [b.nextU32(), b.nextU32(), b.nextU32(), b.nextU32(), b.nextU32()];
    const seqC = [c.nextU32(), c.nextU32(), c.nextU32(), c.nextU32(), c.nextU32()];
    assert.deepStrictEqual(seqA, seqB, 'same seed must produce same stream');
    assert.notDeepStrictEqual(seqA, seqC, 'different seed must diverge');
});
check('same seed/policy/state yields identical decided ops (stress uses rng)', () => {
    const mk = () => ({
        forge, markets: freshMarkets(),
        commerce: { credits: 500, cargo: [{ commodityId: 'wheat', qty: 12 }], transportId: 'wagon' },
        worldTurn: 5, turnIndex: 3, rng: core.createSoakRng('same'), maxOpsPerTurn: 3,
    });
    const opsA = core.decideTradeIntents('merchant_stress', mk());
    const opsB = core.decideTradeIntents('merchant_stress', mk());
    assert.deepStrictEqual(opsA, opsB, 'same seed must produce same ops');
});

// ---------------------------------------------------------------------------
// 3. Policy never buys without sufficient money
// ---------------------------------------------------------------------------
check('policy proposes no buy when credits cannot afford one unit', () => {
    for (const credits of [0, 5]) {
        const ops = core.decideTradeIntents('merchant_balanced', {
            forge, markets: freshMarkets(),
            commerce: { credits, cargo: [], transportId: 'wagon' },
            worldTurn: 1, turnIndex: 1, rng: core.createSoakRng('m'), maxOpsPerTurn: 2,
        });
        assert.ok(ops.every((o) => o.op !== 'buy'), `credits=${credits} produced a buy op: ${JSON.stringify(ops)}`);
    }
});

// ---------------------------------------------------------------------------
// 4. Policy never sells unavailable cargo
// ---------------------------------------------------------------------------
check('policy only sells held commodities and never exceeds held qty', () => {
    const commerce = { credits: 100, cargo: [{ commodityId: 'wheat', qty: 15 }], transportId: 'wagon' };
    const ops = core.decideTradeIntents('merchant_balanced', {
        forge, markets: freshMarkets(), commerce, worldTurn: 1, turnIndex: 1, rng: core.createSoakRng('s'), maxOpsPerTurn: 2,
    });
    for (const op of ops.filter((o) => o.op === 'sell')) {
        const held = commerce.cargo.find((c) => c.commodityId === op.commodityId);
        assert.ok(held && op.qty <= held.qty, `sell exceeds held cargo: ${JSON.stringify(op)}`);
    }
    assert.ok(!ops.some((o) => o.op === 'sell' && o.commodityId === 'steel'), 'must not sell unheld steel');
});
check('production applyTradeOp rejects selling unavailable cargo', () => {
    const res = applyTradeOp(forge, freshMarkets(), { credits: 100, cargo: [], transportId: 'wagon' },
        { op: 'sell', marketLocationId: 'south_port', commodityId: 'wheat', qty: 5 });
    assert.ok(!res.ok && res.error.code === 'INSUFFICIENT_CARGO', `expected INSUFFICIENT_CARGO, got ${JSON.stringify(res)}`);
});

// ---------------------------------------------------------------------------
// 5. Rejected action is recorded but does not corrupt state
// ---------------------------------------------------------------------------
check('rejected trade leaves commerce/markets untouched and is counted', () => {
    const markets = freshMarkets();
    const commerce = { credits: 500, cargo: [], transportId: 'wagon' };
    const beforeCredits = commerce.credits;
    const beforeStock = markets.north_farm.wheat.stock;
    const res = applyTradeOp(forge, markets, commerce, { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 100 });
    assert.ok(!res.ok && res.error.code === 'INSUFFICIENT_STOCK', `expected INSUFFICIENT_STOCK, got ${JSON.stringify(res)}`);
    assert.strictEqual(commerce.credits, beforeCredits, 'credits must not change on rejection');
    assert.strictEqual(markets.north_farm.wheat.stock, beforeStock, 'market stock must not change on rejection');

    const acc = core.createTelemetryAccumulator({ sampleEveryTurns: 1, maxSamples: 5, recentWindow: 5, maxAnomalyWindows: 2 }, 0);
    core.recordAction(acc, { turn: 1, worldTurn: 0, type: 'buy', accepted: false, rejectCode: 'INSUFFICIENT_STOCK' });
    assert.strictEqual(acc.rejectedActions, 1, 'rejected action must be counted');
    assert.strictEqual(acc.emittedEventIds.size, 0, 'rejected action must not emit an event id');
});

// ---------------------------------------------------------------------------
// 6. Two distinct accepted trades retain distinct event IDs
// ---------------------------------------------------------------------------
check('distinct accepted actions produce distinct event ids', () => {
    const op = { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 3 };
    const e1 = core.buildPlayerTradeEvent(10, 1, op, { accepted: true });
    const e2 = core.buildPlayerTradeEvent(10, 2, op, { accepted: true });
    const e3 = core.buildPlayerTradeEvent(11, 1, op, { accepted: true });
    assert.ok(e1.event && e2.event && e3.event, 'accepted actions must build events');
    assert.notStrictEqual(e1.event.id, e2.event.id, 'same turn, different seq must differ');
    assert.notStrictEqual(e1.event.id, e3.event.id, 'different turn must differ');
    assert.strictEqual(e1.event.source, 'player', 'must be player-sourced');
});

// ---------------------------------------------------------------------------
// 7. Retry of the same action receipt does not duplicate the event
// ---------------------------------------------------------------------------
check('retrying the same receipt does not duplicate the event', () => {
    const op = { op: 'sell', marketLocationId: 'south_port', commodityId: 'wheat', qty: 2 };
    const first = core.buildPlayerTradeEvent(20, 7, op, { accepted: true });
    const retry = core.buildPlayerTradeEvent(20, 7, op, { accepted: true });
    assert.strictEqual(first.receiptId, retry.receiptId, 'receipt id must be stable');
    assert.strictEqual(first.event.id, retry.event.id, 'retry must reuse the same event id');
    const merged1 = core.mergePlayerEventsIntoRecentChanges([], [first.event]);
    const merged2 = core.mergePlayerEventsIntoRecentChanges(merged1, [retry.event]);
    assert.strictEqual(merged1.length, 1, 'first merge yields one event');
    assert.strictEqual(merged2.length, 1, 'retry must be deduped');
});

// ---------------------------------------------------------------------------
// 8. Telemetry stays bounded
// ---------------------------------------------------------------------------
check('telemetry windows/samples/anomalies stay within configured caps', () => {
    const acc = core.createTelemetryAccumulator({ sampleEveryTurns: 1, maxSamples: 3, recentWindow: 5, maxAnomalyWindows: 2 }, 0);
    for (let i = 1; i <= 50; i++) {
        core.recordAction(acc, { turn: i, worldTurn: i, type: i % 2 ? 'buy' : 'sell', accepted: true, eventId: `e${i}` });
        core.observeTurnState(acc, { turn: i, worldTurn: i, credits: 100, cargoUnits: 1, markets: {}, recentChangesLen: 0 });
        core.pushAnomalyWindow(acc, { kind: 'test', turn: i, detail: 'x' });
    }
    assert.ok(acc.recentWindow.length <= 5, `recentWindow ${acc.recentWindow.length} > 5`);
    assert.ok(acc.samples.length <= 3, `samples ${acc.samples.length} > 3`);
    assert.ok(acc.anomalyWindows.length <= 2, `anomalyWindows ${acc.anomalyWindows.length} > 2`);
    const summary = core.finalizeTelemetry(acc);
    assert.ok(summary.actionEntropyBits > 0, 'buy/sell mix must have positive entropy');
});

// ---------------------------------------------------------------------------
// 9. NaN/Infinity invariant detects synthetic corruption
// ---------------------------------------------------------------------------
check('no_nan_or_infinity detects synthetic NaN/Infinity', () => {
    const clean = { a: 1, b: { c: [2, 3] } };
    assert.strictEqual(core.findNonFiniteNumbers(clean).length, 0, 'clean doc must have no hits');
    const corrupt = { credits: NaN, markets: { m: { wheat: { stock: Infinity } } } };
    assert.ok(core.findNonFiniteNumbers(corrupt).length >= 2, 'must find NaN and Infinity');
    const ctx = makeInvariantCtx({ 'game_state.json': corrupt });
    const results = core.evaluateInvariants(['no_nan_or_infinity'], ctx);
    assert.ok(!results[0].ok, 'invariant must fail on corruption');
});

// ---------------------------------------------------------------------------
// 10. Negative-resource invariant detects synthetic corruption
// ---------------------------------------------------------------------------
check('nonnegative_resources detects synthetic negatives', () => {
    const corrupt = { commerce: { credits: -5 }, world: { markets: { m: { wheat: { stock: -3 } } } } };
    const hits = core.findNegativeResources(corrupt);
    assert.ok(hits.some((h) => h.path.endsWith('.credits')), 'must flag negative credits');
    assert.ok(hits.some((h) => h.path.endsWith('.stock')), 'must flag negative stock');
    const ctx = makeInvariantCtx({ 'game_state.json': corrupt });
    const results = core.evaluateInvariants(['nonnegative_resources'], ctx);
    assert.ok(!results[0].ok, 'invariant must fail on negative resource');
});

// ---------------------------------------------------------------------------
// 11. Determinism drift produces a useful first-difference report
// ---------------------------------------------------------------------------
check('determinism drift yields a first-difference report (canonical + action stream)', () => {
    const mkSnap = (turn, wheatStock) => buildDeterminismSnapshot({
        label: `turn_${turn}`, worldTurn: turn,
        inputsByPath: { 'world_state.json': { path: 'world_state.json', exists: true, bytes: 10, parsed: { worldTurn: turn, markets: { m: { wheat: { stock: wheatStock } } } } } },
        hashText,
    });
    const left = [mkSnap(1, 10), mkSnap(2, 20)];
    const right = [mkSnap(1, 10), mkSnap(2, 99)];
    const cmp = compareDeterminismSnapshotStreams(left, right);
    assert.ok(!cmp.ok, 'differing streams must drift');
    assert.strictEqual(cmp.firstDifferentSnapshot.index, 1, 'first difference at index 1');
    assert.ok(cmp.fileDiffs.some((d) => d.path === 'world_state.json'), 'must name the differing file');

    const streamA = core.serializeActionStream([{ turn: 1, worldTurn: 1, type: 'buy', accepted: true, qty: 3 }]);
    const streamB = core.serializeActionStream([{ turn: 1, worldTurn: 1, type: 'buy', accepted: true, qty: 4 }]);
    assert.notStrictEqual(streamA, streamB, 'differing action streams must serialize differently');
});

// ---------------------------------------------------------------------------
// 12/13. Failure workspace retained; successful workspace cleaned
// 14. Runner performs no network/AI/ComfyUI calls (static guard)
// ---------------------------------------------------------------------------
function makeInvariantCtx(canonicalDocs) {
    return {
        canonicalDocs,
        parseErrors: [],
        markets: {},
        recentChangesLen: 0,
        worldTurn: 0,
        previousWorldTurn: 0,
        expectedWorldTurnDelta: 0,
        telemetry: core.createTelemetryAccumulator({ sampleEveryTurns: 1, maxSamples: 1, recentWindow: 1, maxAnomalyWindows: 1 }, 0),
        limits: { maxTurns: 1, maxStepsPerChunk: 1, maxOpsPerTurn: 1, maxFileBytes: 1000000, maxRecentChanges: 20 },
        fileBytes: {},
    };
}

const tempScenarioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-soak-unit-'));
const tempRoots = [];
try {
    const passScenario = baseScenario({ id: 'noai_unit_pass', horizon: { turns: 3 }, invariants: ['no_nan_or_infinity', 'json_parseable', 'world_turn_monotonic', 'output_files_bounded'] });
    const failScenario = baseScenario({ id: 'noai_unit_fail', horizon: { turns: 3 }, invariants: ['output_files_bounded'], limits: { maxTurns: 10, maxStepsPerChunk: 5, maxOpsPerTurn: 2, maxFileBytes: 1, maxRecentChanges: 20 } });
    fs.writeFileSync(path.join(tempScenarioDir, 'noai_unit_pass.json'), JSON.stringify(passScenario));
    fs.writeFileSync(path.join(tempScenarioDir, 'noai_unit_fail.json'), JSON.stringify(failScenario));

    const runRunner = (scenarioId) => spawnSync(process.execPath, [path.join(root, 'scripts', 'run_noai_soak.js'), '--scenario', scenarioId], {
        cwd: root,
        env: { ...process.env, NOAI_SOAK_SCENARIO_DIR: tempScenarioDir },
        encoding: 'utf-8',
    });

    check('successful run cleans its temporary workspace', () => {
        const res = runRunner('noai_unit_pass');
        assert.strictEqual(res.status, 0, `pass scenario should exit 0:\n${res.stdout}\n${res.stderr}`);
        const scenarioTemp = path.join(root, '.tmp', 'noai_soak', 'noai_unit_pass');
        tempRoots.push(scenarioTemp);
        const hasRunDir = fs.existsSync(scenarioTemp)
            && fs.readdirSync(scenarioTemp).some((d) => fs.existsSync(path.join(scenarioTemp, d, 'report.json')));
        assert.ok(!hasRunDir, 'successful run dir should be cleaned');
    });

    check('failed run retains its workspace and reports', () => {
        const res = runRunner('noai_unit_fail');
        assert.strictEqual(res.status, 1, 'fail scenario should exit 1');
        const scenarioTemp = path.join(root, '.tmp', 'noai_soak', 'noai_unit_fail');
        tempRoots.push(scenarioTemp);
        assert.ok(fs.existsSync(scenarioTemp), 'failed scenario temp dir must exist');
        const runDirs = fs.readdirSync(scenarioTemp);
        assert.ok(runDirs.length >= 1, 'failed run dir must be retained');
        const runDir = path.join(scenarioTemp, runDirs[0]);
        assert.ok(fs.existsSync(path.join(runDir, 'report.json')), 'failed run must retain report.json');
        assert.ok(fs.existsSync(path.join(runDir, 'workspace')), 'failed run must retain workspace');
    });
} finally {
    fs.rmSync(tempScenarioDir, { recursive: true, force: true });
    for (const dir of tempRoots) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

check('runner and core contain no network / AI / ComfyUI / spawn calls', () => {
    // Strip comments so documentation ("NO ComfyUI", "no network") is not mistaken
    // for actual usage; the guard asserts the executable code makes no such calls.
    const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const runnerSrc = stripComments(fs.readFileSync(path.join(root, 'scripts', 'run_noai_soak.js'), 'utf-8'));
    const coreSrc = stripComments(fs.readFileSync(path.join(root, 'src', 'noaiSoakRunnerCore.ts'), 'utf-8'));
    const forbidden = [
        "require('http')", "require('https')", "require('net')", "require('dgram')",
        "require('child_process')", 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket',
        'comfyui', 'comfyUI', 'ComfyUI', 'antigravity', 'anthropic', 'openai', 'localhost', '127.0.0.1',
    ];
    for (const src of [runnerSrc, coreSrc]) {
        const lower = src;
        for (const token of forbidden) {
            assert.ok(!lower.includes(token), `forbidden token present in code: ${token}`);
        }
    }
});

if (failed > 0) {
    console.error(`\n${failed} NOAI soak core test(s) FAILED`);
    process.exit(1);
}
console.log('\nAll NOAI soak core tests passed');
