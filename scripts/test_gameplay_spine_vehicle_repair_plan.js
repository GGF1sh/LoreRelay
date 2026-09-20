#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseVehicleState } = require('../out/vehicleCore');
const { applyVehicleOps } = require('../out/vehicleOpsCore');
const { queryWorldIntent, executeWorldIntent } = require('../out/worldIntentCore');
const {
    planVehicleRepairPreview,
    validateVehicleRepairPreviewWitness,
    buildVehicleRepairEffectPlan,
} = require('../out/gameplaySpineVehicleRepairPlanAdapterCore');

function makeState(extra = {}) {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'v1',
        updatedTurn: 3,
        vehicles: [
            {
                id: 'v1', name: 'Test Vehicle', kind: 'land', status: 'damaged', locationId: 'loc1',
                durability: { hp: 50, maxHp: 100, condition: 'damaged', armorBand: 'none' },
                resources: { powerType: 'none', current: 0, max: 0 }, owner: { type: 'party' },
                capacity: { crewRequired: 1, crewCapacity: 4, passengerCapacity: 0, cargoCapacity: 0 },
                access: { sizeClass: 'medium', accessTags: ['road'] },
                mobility: { speedBand: 'normal', rangeBand: 'local', terrainTags: ['road'] },
                cargo: [], modules: [], crew: [], notes: [], tags: [],
            },
            {
                id: 'v2', name: 'Other Vehicle', kind: 'land', status: 'available', locationId: 'loc1',
                durability: { hp: 100, maxHp: 100, condition: 'pristine', armorBand: 'none' },
                resources: { powerType: 'none', current: 0, max: 0 }, owner: { type: 'party' },
                capacity: { crewRequired: 1, crewCapacity: 4, passengerCapacity: 0, cargoCapacity: 0 },
                access: { sizeClass: 'medium', accessTags: ['road'] },
                mobility: { speedBand: 'normal', rangeBand: 'local', terrainTags: ['road'] },
                cargo: [], modules: [], crew: [], notes: [], tags: [],
            },
        ],
        ...extra,
    });
}

function repairIntent(payload = { amount: 30 }, target = { kind: 'vehicle', id: 'v1' }) {
    return {
        id: 'repair-plan-request', source: 'gm', subsystem: 'vehicle', action: 'repair_vehicle',
        target, payload,
    };
}

function normalizedCandidate(state) {
    return parseVehicleState(state);
}

function readyFixture(context = { vehicleState: makeState(), worldTurn: 9 }) {
    const intent = repairIntent();
    const query = queryWorldIntent(intent, context);
    const execute = executeWorldIntent(intent, context);
    const preview = planVehicleRepairPreview(intent, query, execute, context);
    assert.strictEqual(query.status, 'allowed');
    assert.strictEqual(execute.status, 'applied');
    assert.strictEqual(preview.admission.status, 'ready');
    return { intent, context, query, execute, preview };
}

// Actual three-way parity: WorldIntent execution, direct vehicle operation, and EffectPlan evidence.
{
    const { context, execute, preview } = readyFixture();
    const result = buildVehicleRepairEffectPlan(preview, context);
    assert.strictEqual(result.status, 'available');
    const direct = applyVehicleOps(
        context.vehicleState,
        [{ type: 'repair_vehicle', vehicleId: 'v1', amount: 30 }],
        { worldTurn: context.worldTurn }
    );
    assert.ok(execute.nextVehicleState);
    assert.ok(direct);
    const fromExecute = normalizedCandidate(execute.nextVehicleState);
    const fromDirect = normalizedCandidate(direct);
    const fromEffectPlan = normalizedCandidate(result.plan.internal.candidateEvidence.vehicle_state);
    assert.deepStrictEqual(fromExecute, fromDirect);
    assert.deepStrictEqual(fromExecute, fromEffectPlan);
    assert.strictEqual(fromEffectPlan.vehicles.find((vehicle) => vehicle.id === 'v1').durability.hp, 80);
    assert.strictEqual(fromEffectPlan.updatedTurn, 9);
}

// A supplied world turn is material because a state-changing repair writes updatedTurn.
{
    const { context, preview } = readyFixture();
    const staleContext = { ...context, worldTurn: 10 };
    const validation = validateVehicleRepairPreviewWitness(
        preview.internal.witness,
        preview.confirmation.token,
        staleContext
    );
    assert.deepStrictEqual(validation, { valid: false, code: 'stale_world_turn' });
    assert.deepStrictEqual(buildVehicleRepairEffectPlan(preview, staleContext), {
        status: 'unavailable', code: 'stale_world_turn',
    });
}

// With no worldTurn in both source execution and direct candidate calculation, it cannot affect updatedTurn.
{
    const context = { vehicleState: makeState() };
    const { execute, preview } = readyFixture(context);
    const direct = applyVehicleOps(context.vehicleState, [{ type: 'repair_vehicle', vehicleId: 'v1', amount: 30 }], {});
    assert.strictEqual(execute.nextVehicleState.updatedTurn, 3);
    assert.strictEqual(direct.updatedTurn, 3);
    assert.strictEqual(buildVehicleRepairEffectPlan(preview, context).status, 'available');
}

// The complete parsed vehicle ledger is witnessed: unrelated changes and order changes are stale.
{
    const { context, preview } = readyFixture();
    const unrelated = makeState();
    unrelated.vehicles.find((vehicle) => vehicle.id === 'v2').durability.hp = 90;
    assert.deepStrictEqual(
        validateVehicleRepairPreviewWitness(preview.internal.witness, preview.confirmation.token, { ...context, vehicleState: unrelated }),
        { valid: false, code: 'stale_vehicle_ledger' }
    );
    const reordered = makeState({ vehicles: [...makeState().vehicles].reverse() });
    assert.deepStrictEqual(
        validateVehicleRepairPreviewWitness(preview.internal.witness, preview.confirmation.token, { ...context, vehicleState: reordered }),
        { valid: false, code: 'stale_vehicle_ledger' }
    );
}

// Target-specific stale codes remain diagnostic refinements of whole-ledger witnessing.
{
    const { context, preview } = readyFixture();
    const changedHp = makeState();
    changedHp.vehicles.find((vehicle) => vehicle.id === 'v1').durability.hp = 60;
    assert.strictEqual(
        validateVehicleRepairPreviewWitness(preview.internal.witness, preview.confirmation.token, { ...context, vehicleState: changedHp }).code,
        'stale_vehicle_hp'
    );
    const changedStatus = makeState();
    changedStatus.vehicles.find((vehicle) => vehicle.id === 'v1').status = 'available';
    assert.strictEqual(
        validateVehicleRepairPreviewWitness(preview.internal.witness, preview.confirmation.token, { ...context, vehicleState: changedStatus }).code,
        'stale_vehicle_status'
    );
    assert.strictEqual(
        validateVehicleRepairPreviewWitness(preview.internal.witness, preview.confirmation.token, { ...context, gameRules: { enableVehicleSystem: false } }).code,
        'stale_rules'
    );
}

// All admission reason codes come directly from queryWorldIntent; no blocked, invalid, or noop case gets a plan.
for (const testCase of [
    {
        name: 'valid_noop',
        intent: repairIntent({ amount: 1 }),
        context: { vehicleState: makeState({ vehicles: [{ ...makeState().vehicles[0], durability: { ...makeState().vehicles[0].durability, hp: 100 } }] }) },
    },
    { name: 'vehicle system disabled', intent: repairIntent(), context: { vehicleState: makeState(), gameRules: { enableVehicleSystem: false } } },
    { name: 'vehicle not found', intent: repairIntent({ amount: 1 }, { kind: 'vehicle', id: 'missing' }), context: { vehicleState: makeState() } },
    {
        name: 'vehicle lost', intent: repairIntent(),
        context: { vehicleState: makeState({ vehicles: [{ ...makeState().vehicles[0], status: 'lost' }] }) },
    },
    { name: 'invalid entity kind', intent: repairIntent({ amount: 1 }, { kind: 'npc', id: 'v1' }), context: { vehicleState: makeState() } },
    { name: 'invalid repair payload', intent: repairIntent({ amount: 0 }), context: { vehicleState: makeState() } },
]) {
    const query = queryWorldIntent(testCase.intent, testCase.context);
    const execute = executeWorldIntent(testCase.intent, testCase.context);
    const preview = planVehicleRepairPreview(testCase.intent, query, execute, testCase.context);
    assert.notStrictEqual(query.status, 'allowed', testCase.name);
    assert.strictEqual(preview.admission.status, query.status, testCase.name);
    assert.strictEqual(preview.admission.reasonCode, query.reasonCode, testCase.name);
    assert.strictEqual(buildVehicleRepairEffectPlan(preview, testCase.context).status, 'unavailable', testCase.name);
}

console.log('Gameplay Spine vehicle repair EffectPlan tests passed.');
