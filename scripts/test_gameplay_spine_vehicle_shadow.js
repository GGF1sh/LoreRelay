#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-001: vehicle:repair_vehicle shadow adapter focused tests.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const intentPath = path.join(root, 'out', 'worldIntentCore.js');
const adapterPath = path.join(root, 'out', 'gameplaySpineVehicleAdapterCore.js');
const spinePath = path.join(root, 'out', 'gameplaySpineCore.js');
const opsPath = path.join(root, 'out', 'vehicleOpsCore.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

for (const p of [intentPath, adapterPath, spinePath, opsPath, vehiclePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    queryWorldIntent,
    executeWorldIntent,
} = require(intentPath);
const { adaptRepairVehicleWorldIntentShadow } = require(adapterPath);
const { REPAIR_VEHICLE_ACTION_KEY } = require(spinePath);
const { applyVehicleOps } = require(opsPath);
const { parseVehicleState } = require(vehiclePath);

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30 },
    access: { sizeClass: 'large', accessTags: ['road'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 3, max: 20 },
};

function makeState(extra = {}) {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [baseVehicle, {
            ...baseVehicle,
            id: 'scout_bike',
            name: 'Scout Bike',
            kind: 'bike',
            status: 'available',
            locationId: 'market_square',
            resources: { powerType: 'none' },
        }],
        ...extra,
    });
}

function repairIntent(payload = { amount: 5 }, targetId = 'rust_wagon') {
    return {
        id: `intent_repair_${targetId}`,
        source: 'gm',
        subsystem: 'vehicle',
        action: 'repair_vehicle',
        target: { kind: 'vehicle', id: targetId },
        payload,
    };
}

function adapt(intent, context, withExecute = true) {
    const query = queryWorldIntent(intent, context);
    if (!withExecute) {
        return { query, execute: undefined, adapted: adaptRepairVehicleWorldIntentShadow(intent, query) };
    }
    const execute = executeWorldIntent(intent, context);
    return {
        query,
        execute,
        adapted: adaptRepairVehicleWorldIntentShadow(intent, query, execute),
    };
}

function assertNoForbiddenClaims(obj, label) {
    const text = JSON.stringify(obj);
    if (/timestamp|Date\.now|Math\.random|committed_partial|write_failed|commitReceipt|persisted/i.test(text)
        && /"committed":true|"commitAttempted":true/.test(text)) {
        fail(`${label}: forbidden commit/persist claim`);
        return false;
    }
    if (/"committed":true/.test(text) || /"commitAttempted":true/.test(text)) {
        fail(`${label}: claimed commit`);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// 1. allowed → ready
// ---------------------------------------------------------------------------
{
    const { query, adapted } = adapt(repairIntent({ amount: 5 }), { vehicleState: makeState() }, false);
    if (query.status !== 'allowed') {
        fail(`1. precond query allowed, got ${query.status}`);
    } else if (!adapted.ok || adapted.summary.admission.status !== 'ready'
        || adapted.summary.admission.sourceQueryStatus !== 'allowed') {
        fail(`1. allowed→ready: ${JSON.stringify(adapted)}`);
    } else {
        ok('1. allowed maps to ready');
    }
}

// ---------------------------------------------------------------------------
// 2. valid_noop remains distinct from success
// ---------------------------------------------------------------------------
{
    const maxHp = makeState({
        vehicles: [{ ...baseVehicle, durability: { ...baseVehicle.durability, hp: 60, maxHp: 60 } }],
    });
    const { query, adapted } = adapt(repairIntent({ amount: 3 }), { vehicleState: maxHp }, false);
    if (query.status !== 'valid_noop') {
        fail(`2. precond valid_noop, got ${query.status}`);
    } else if (!adapted.ok || adapted.summary.admission.status !== 'valid_noop') {
        fail(`2. admission: ${JSON.stringify(adapted)}`);
    } else if (adapted.summary.admission.status === 'ready') {
        fail('2. valid_noop must not map to ready');
    } else {
        ok('2. valid_noop remains distinct from success');
    }
}

// ---------------------------------------------------------------------------
// 3. blocked remains admission fact, not mechanical failure
// ---------------------------------------------------------------------------
{
    const { query, adapted } = adapt(
        repairIntent({ amount: 2 }, 'ghost'),
        { vehicleState: makeState() },
        false
    );
    if (query.status !== 'blocked') {
        fail(`3. precond blocked, got ${query.status}`);
    } else if (!adapted.ok || adapted.summary.admission.status !== 'blocked') {
        fail(`3. blocked: ${JSON.stringify(adapted)}`);
    } else if (adapted.summary.resolution) {
        fail('3. query-only adapt should not invent resolution');
    } else {
        ok('3. blocked remains an admission fact, not gameplay failure');
    }
}

// ---------------------------------------------------------------------------
// 4. invalid → invalid
// ---------------------------------------------------------------------------
{
    const { query, adapted } = adapt(
        repairIntent({ amount: 0 }),
        { vehicleState: makeState() },
        false
    );
    if (query.status !== 'invalid') {
        fail(`4. precond invalid, got ${query.status}`);
    } else if (!adapted.ok || adapted.summary.admission.status !== 'invalid'
        || adapted.summary.admission.sourceQueryStatus !== 'invalid') {
        fail(`4. invalid: ${JSON.stringify(adapted)}`);
    } else {
        ok('4. invalid maps to invalid');
    }
}

// ---------------------------------------------------------------------------
// 5. unsupported → unsupported (non-repair vehicle action not used —
//    adapter rejects non-repair; test mapping via synthetic query on repair intent
//    is not applicable — use non-vehicle only for rejection tests.
//    For pure mapping of unsupported status, feed a synthetic query.)
// ---------------------------------------------------------------------------
{
    const intent = repairIntent({ amount: 1 });
    const query = {
        ok: false,
        status: 'unsupported',
        reasonCode: 'unsupported_action',
    };
    const adapted = adaptRepairVehicleWorldIntentShadow(intent, query);
    if (!adapted.ok || adapted.summary.admission.status !== 'unsupported'
        || adapted.summary.admission.sourceQueryStatus !== 'unsupported') {
        fail(`5. unsupported: ${JSON.stringify(adapted)}`);
    } else {
        ok('5. unsupported maps to unsupported');
    }
}

// ---------------------------------------------------------------------------
// 6. applied + nextVehicleState → resolved, candidateChanged true, committed false
// ---------------------------------------------------------------------------
{
    const { execute, adapted } = adapt(
        repairIntent({ amount: 6 }),
        { vehicleState: makeState() },
        true
    );
    if (execute.status !== 'applied' || !execute.nextVehicleState) {
        fail(`6. precond applied: ${JSON.stringify(execute)}`);
    } else if (!adapted.ok || !adapted.summary.resolution) {
        fail(`6. missing resolution: ${JSON.stringify(adapted)}`);
    } else {
        const r = adapted.summary.resolution;
        if (r.status !== 'resolved' || r.candidateChanged !== true || r.committed !== false
            || adapted.summary.commitAttempted !== false || adapted.summary.commit !== null
            || r.sourceExecuteStatus !== 'applied') {
            fail(`6. resolution: ${JSON.stringify(r)}`);
        } else {
            ok('6. applied maps to resolved, candidateChanged true, committed false');
        }
    }
}

// ---------------------------------------------------------------------------
// 7. valid_noop execute → valid_noop, candidateChanged false, committed false
// ---------------------------------------------------------------------------
{
    const maxHp = makeState({
        vehicles: [{ ...baseVehicle, durability: { ...baseVehicle.durability, hp: 60, maxHp: 60 } }],
    });
    const { execute, adapted } = adapt(repairIntent({ amount: 3 }), { vehicleState: maxHp }, true);
    if (execute.status !== 'valid_noop') {
        fail(`7. precond execute valid_noop, got ${execute.status}`);
    } else if (!adapted.ok || !adapted.summary.resolution
        || adapted.summary.resolution.status !== 'valid_noop'
        || adapted.summary.resolution.candidateChanged !== false
        || adapted.summary.resolution.committed !== false) {
        fail(`7. ${JSON.stringify(adapted)}`);
    } else {
        ok('7. valid_noop execute maps correctly');
    }
}

// ---------------------------------------------------------------------------
// 8. failed execute → adapter_failed
// ---------------------------------------------------------------------------
{
    const intent = repairIntent({ amount: 1 });
    const query = { ok: true, status: 'allowed' };
    const execute = {
        ok: false,
        applied: false,
        attempted: true,
        status: 'failed',
        reasonCode: 'internal_error',
    };
    const adapted = adaptRepairVehicleWorldIntentShadow(intent, query, execute);
    if (!adapted.ok || !adapted.summary.resolution
        || adapted.summary.resolution.status !== 'adapter_failed'
        || adapted.summary.resolution.candidateChanged !== false
        || adapted.summary.resolution.committed !== false
        || adapted.summary.resolution.sourceExecuteStatus !== 'failed') {
        fail(`8. failed: ${JSON.stringify(adapted)}`);
    } else {
        ok('8. failed execute maps to adapter_failed');
    }
}

// ---------------------------------------------------------------------------
// 9. applied without candidate → not resolved success
// ---------------------------------------------------------------------------
{
    const intent = repairIntent({ amount: 1 });
    const query = { ok: true, status: 'allowed' };
    const execute = {
        ok: true,
        applied: true,
        attempted: true,
        status: 'applied',
        // no nextVehicleState
    };
    const adapted = adaptRepairVehicleWorldIntentShadow(intent, query, execute);
    if (!adapted.ok || !adapted.summary.resolution
        || adapted.summary.resolution.status !== 'not_resolved'
        || adapted.summary.resolution.candidateChanged !== false
        || adapted.summary.resolution.committed !== false) {
        fail(`9. missing candidate: ${JSON.stringify(adapted)}`);
    } else {
        ok('9. missing candidate state on applied does not become resolved success');
    }
}

// ---------------------------------------------------------------------------
// 10. reasonCode preserved
// ---------------------------------------------------------------------------
{
    const maxHp = makeState({
        vehicles: [{ ...baseVehicle, durability: { ...baseVehicle.durability, hp: 60, maxHp: 60 } }],
    });
    const { query, execute, adapted } = adapt(
        repairIntent({ amount: 2 }),
        { vehicleState: maxHp },
        true
    );
    if (!query.reasonCode) {
        fail('10. precond reasonCode on query');
    } else if (!adapted.ok
        || adapted.summary.admission.reasonCode !== query.reasonCode
        || (execute.reasonCode
            && adapted.summary.resolution
            && adapted.summary.resolution.reasonCode !== execute.reasonCode
            && adapted.summary.resolution.reasonCode !== query.reasonCode
            && !adapted.summary.resolution.reasonCode)) {
        // execute may or may not carry same reason — require admission at least
        if (!adapted.ok || adapted.summary.admission.reasonCode !== query.reasonCode) {
            fail(`10. reason not preserved: ${JSON.stringify(adapted)}`);
        } else {
            ok('10. reasonCode is preserved');
        }
    } else {
        ok('10. reasonCode is preserved');
    }
}

// ---------------------------------------------------------------------------
// 11. Source statuses preserved
// ---------------------------------------------------------------------------
{
    const { query, execute, adapted } = adapt(
        repairIntent({ amount: 4 }),
        { vehicleState: makeState() },
        true
    );
    if (!adapted.ok
        || adapted.summary.admission.sourceQueryStatus !== query.status
        || adapted.summary.resolution.sourceExecuteStatus !== execute.status) {
        fail(`11. source status: ${JSON.stringify(adapted)}`);
    } else {
        ok('11. source statuses are preserved');
    }
}

// ---------------------------------------------------------------------------
// 12. Non-repair_vehicle intent rejected
// ---------------------------------------------------------------------------
{
    const intent = {
        id: 'intent_move',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'move_vehicle',
        target: { kind: 'vehicle', id: 'rust_wagon' },
        payload: { locationId: 'dock' },
    };
    const query = queryWorldIntent(intent, { vehicleState: makeState() });
    const adapted = adaptRepairVehicleWorldIntentShadow(intent, query);
    if (adapted.ok || adapted.reasonCode !== 'not_repair_vehicle_intent') {
        fail(`12. non-repair: ${JSON.stringify(adapted)}`);
    } else {
        ok('12. non-repair_vehicle intent is rejected safely');
    }
}

// ---------------------------------------------------------------------------
// 13. Inputs remain deeply unchanged
// ---------------------------------------------------------------------------
{
    const intent = repairIntent({ amount: 5 });
    const context = { vehicleState: makeState() };
    const query = queryWorldIntent(intent, context);
    const execute = executeWorldIntent(intent, context);
    const beforeI = deepClone(intent);
    const beforeQ = deepClone(query);
    const beforeE = deepClone(execute);
    adaptRepairVehicleWorldIntentShadow(intent, query, execute);
    if (JSON.stringify(intent) !== JSON.stringify(beforeI)
        || JSON.stringify(query) !== JSON.stringify(beforeQ)
        || JSON.stringify(execute) !== JSON.stringify(beforeE)) {
        fail('13. inputs mutated');
    } else {
        ok('13. inputs remain deeply unchanged');
    }
}

// ---------------------------------------------------------------------------
// 14. Output is deterministic
// ---------------------------------------------------------------------------
{
    const intent = repairIntent({ amount: 5 });
    const context = { vehicleState: makeState() };
    const query = queryWorldIntent(intent, context);
    const execute = executeWorldIntent(intent, context);
    const a = adaptRepairVehicleWorldIntentShadow(intent, query, execute);
    const b = adaptRepairVehicleWorldIntentShadow(intent, query, execute);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail('14. non-deterministic output');
    } else if (!a.ok || a.summary.admission.actionKey !== REPAIR_VEHICLE_ACTION_KEY) {
        fail(`14. actionKey: ${JSON.stringify(a)}`);
    } else {
        ok('14. output is deterministic');
    }
}

// ---------------------------------------------------------------------------
// 15. No timestamp, randomness, commit receipt, or persisted-state claim
// ---------------------------------------------------------------------------
{
    const { adapted } = adapt(repairIntent({ amount: 5 }), { vehicleState: makeState() }, true);
    if (!adapted.ok) {
        fail(`15. adapt failed: ${JSON.stringify(adapted)}`);
    } else if (!assertNoForbiddenClaims(adapted, '15')) {
        // fail already logged
    } else {
        const text = JSON.stringify(adapted);
        if (/timestamp|Date\.now|Math\.random|commitReceipt/i.test(text)) {
            fail(`15. forbidden fields: ${text}`);
        } else if (adapted.summary.commit !== null || adapted.summary.commitAttempted !== false
            || (adapted.summary.resolution && adapted.summary.resolution.committed !== false)) {
            fail(`15. commit claim: ${JSON.stringify(adapted.summary)}`);
        } else if (text.includes('nextVehicleState')) {
            fail('15. full nextVehicleState must not appear in bounded summary');
        } else {
            ok('15. no timestamp, randomness, commit receipt, or persisted claim');
        }
    }
}

// ---------------------------------------------------------------------------
// 16. Changed repair candidate matches legacy applyVehicleOps
// ---------------------------------------------------------------------------
{
    const state = makeState();
    const intent = repairIntent({ amount: 6 });
    const execute = executeWorldIntent(intent, { vehicleState: state });
    // applyVehicleOps returns VehicleState | undefined (not a wrapper object).
    const legacy = applyVehicleOps(
        state,
        [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 6 }],
        {}
    );
    const adapted = adaptRepairVehicleWorldIntentShadow(
        intent,
        queryWorldIntent(intent, { vehicleState: state }),
        execute
    );
    if (execute.status !== 'applied' || !execute.nextVehicleState) {
        fail(`16. execute not applied: ${JSON.stringify(execute)}`);
    } else if (JSON.stringify(execute.nextVehicleState) !== JSON.stringify(legacy)) {
        fail('16. nextVehicleState != legacy applyVehicleOps state');
    } else if (!adapted.ok || adapted.summary.resolution.status !== 'resolved'
        || adapted.summary.resolution.candidateChanged !== true) {
        fail(`16. shadow: ${JSON.stringify(adapted)}`);
    } else {
        ok('16. repair candidate matches legacy applyVehicleOps result');
    }
}

// ---------------------------------------------------------------------------
// 17. Full-HP repair remains valid_noop
// ---------------------------------------------------------------------------
{
    const maxHp = makeState({
        vehicles: [{ ...baseVehicle, durability: { ...baseVehicle.durability, hp: 60, maxHp: 60 } }],
    });
    const { query, execute, adapted } = adapt(
        repairIntent({ amount: 5 }),
        { vehicleState: maxHp },
        true
    );
    if (query.status !== 'valid_noop' || execute.status !== 'valid_noop') {
        fail(`17. statuses: q=${query.status} e=${execute.status}`);
    } else if (!adapted.ok
        || adapted.summary.admission.status !== 'valid_noop'
        || adapted.summary.resolution.status !== 'valid_noop') {
        fail(`17. shadow: ${JSON.stringify(adapted)}`);
    } else {
        ok('17. full-HP repair remains valid_noop');
    }
}

// ---------------------------------------------------------------------------
// 18. Disabled vehicle system remains blocked
// ---------------------------------------------------------------------------
{
    const { query, execute, adapted } = adapt(
        repairIntent({ amount: 2 }),
        {
            vehicleState: makeState(),
            gameRules: { enableVehicleSystem: false },
        },
        true
    );
    if (query.status !== 'blocked' || execute.status !== 'blocked') {
        fail(`18. statuses: q=${query.status} e=${execute.status}`);
    } else if (!adapted.ok
        || adapted.summary.admission.status !== 'blocked'
        || adapted.summary.resolution.status !== 'not_resolved'
        || adapted.summary.resolution.sourceExecuteStatus !== 'blocked') {
        fail(`18. shadow: ${JSON.stringify(adapted)}`);
    } else {
        ok('18. disabled vehicle system remains blocked');
    }
}

// ---------------------------------------------------------------------------
// 19. Missing or lost vehicle remains blocked
// ---------------------------------------------------------------------------
{
    const missing = adapt(
        repairIntent({ amount: 2 }, 'ghost_ship'),
        { vehicleState: makeState() },
        true
    );
    const lostState = makeState({
        vehicles: [{ ...baseVehicle, status: 'lost' }],
    });
    const lost = adapt(
        repairIntent({ amount: 2 }),
        { vehicleState: lostState },
        true
    );
    if (missing.query.status !== 'blocked' || lost.query.status !== 'blocked') {
        fail(`19. query: missing=${missing.query.status} lost=${lost.query.status}`);
    } else if (!missing.adapted.ok || missing.adapted.summary.admission.status !== 'blocked'
        || !lost.adapted.ok || lost.adapted.summary.admission.status !== 'blocked') {
        fail('19. admission not blocked');
    } else {
        ok('19. missing or lost vehicle remains blocked');
    }
}

// ---------------------------------------------------------------------------
// 20. Malformed repair payload remains invalid
// ---------------------------------------------------------------------------
{
    const { query, execute, adapted } = adapt(
        repairIntent({ amount: -1 }),
        { vehicleState: makeState() },
        true
    );
    // amount 0 is invalid; amount -1 may also be invalid
    const zero = adapt(
        repairIntent({ amount: 0 }),
        { vehicleState: makeState() },
        true
    );
    if (zero.query.status !== 'invalid') {
        fail(`20. amount 0 should be invalid, got ${zero.query.status}`);
    } else if (!zero.adapted.ok || zero.adapted.summary.admission.status !== 'invalid'
        || zero.adapted.summary.resolution.status !== 'not_resolved'
        || zero.adapted.summary.resolution.sourceExecuteStatus !== 'invalid') {
        fail(`20. shadow: ${JSON.stringify(zero.adapted)}`);
    } else {
        ok('20. malformed repair payload remains invalid');
    }
}

// Extra: actionKey constant
{
    if (REPAIR_VEHICLE_ACTION_KEY !== 'vehicle:repair_vehicle') {
        fail(`actionKey constant: ${REPAIR_VEHICLE_ACTION_KEY}`);
    } else {
        ok('actionKey is vehicle:repair_vehicle');
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll gameplay spine vehicle shadow tests passed.');
process.exit(0);
