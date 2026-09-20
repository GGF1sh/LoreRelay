#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const {
    MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS,
    canonicalizeVehicleStateDocument,
    deriveVehicleRepairReceiptIdentity,
    digestMechanicalVehicleStateDocument,
    digestVehicleRepairConfirmationToken,
    digestVehicleRepairEffectPlanFacts,
    digestWholeVehicleStateDocument,
    parseVehicleStateDocument,
    projectCanonicalVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
} = require('../out/vehicleStateDocumentCore');
const { buildVehiclePromptBlock, parseVehicleState } = require('../out/vehicleCore');
const { applyVehicleOps } = require('../out/vehicleOpsCore');
const { applyMobileBaseOps } = require('../out/mobileBaseOpsCore');
const { buildVehicleGarageSnapshot } = require('../out/vehicleViewCore');
const { queryWorldIntent, executeWorldIntent } = require('../out/worldIntentCore');
const {
    planVehicleRepairPreview,
    buildVehicleRepairEffectPlan,
} = require('../out/gameplaySpineVehicleRepairPlanAdapterCore');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function digestChar(char) {
    return char.repeat(64);
}

const mechanicalV1 = {
    version: 1,
    activeVehicleId: 'repair_target',
    updatedTurn: 7,
    warnings: ['warning_b', 'warning_a'],
    vehicles: [
        {
            id: 'repair_target',
            name: 'Repair Target',
            kind: 'truck',
            owner: { type: 'party' },
            status: 'damaged',
            locationId: 'garage',
            capacity: {
                crewRequired: 1,
                crewCapacity: 3,
                passengerCapacity: 2,
                cargoCapacity: 20,
                currentCargoLoad: 4,
            },
            access: { sizeClass: 'large', accessTags: ['wide_gate', 'road'] },
            mobility: {
                speedBand: 'normal',
                rangeBand: 'regional',
                terrainTags: ['offroad', 'road'],
                routeTags: ['wide_gate_required', 'road_required'],
            },
            durability: { hp: 40, maxHp: 100, armorBand: 'medium', condition: 'damaged' },
            resources: { powerType: 'fuel', current: 8, max: 20 },
            modules: [
                { id: 'module_b', slot: 'utility', name: 'Module B', tags: ['tag_b', 'tag_a'] },
                { id: 'module_a', slot: 'cargo', name: 'Module A', effects: ['effect_b', 'effect_a'] },
            ],
            cargo: [
                { id: 'cargo_b', label: 'Cargo B', amount: 2, tags: ['cargo_tag_b', 'cargo_tag_a'] },
                { id: 'cargo_a', label: 'Cargo A', amount: 1 },
            ],
            crew: [
                { npcId: 'crew_b', role: 'gunner' },
                { npcId: 'crew_a', role: 'driver' },
            ],
            notes: [
                { id: 'note_b', text: 'Note B', worldTurn: 6 },
                { id: 'note_a', text: 'Note A', worldTurn: 5 },
            ],
            tags: ['vehicle_tag_b', 'vehicle_tag_a'],
        },
        {
            id: 'base_hull',
            name: 'Base Hull',
            kind: 'mobile_base',
            owner: { type: 'party' },
            status: 'parked',
            locationId: 'garage',
            capacity: {
                crewRequired: 2,
                crewCapacity: 6,
                passengerCapacity: 4,
                cargoCapacity: 40,
            },
            access: { sizeClass: 'huge', accessTags: ['wide_gate', 'road'] },
            mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
            durability: { hp: 80, maxHp: 100, armorBand: 'heavy', condition: 'worn' },
            resources: { powerType: 'fuel', current: 15, max: 30 },
            mobileBase: {
                settlementId: 'base_home',
                mode: 'landship',
                layoutProfile: 'crawler',
                dockedAtLocationId: 'garage',
            },
        },
    ],
};

const committedReceipt = {
    schemaVersion: 1,
    commitId: 'commit_1',
    requestId: 'request_1',
    resolutionId: 'resolution_1',
    planId: 'plan_1',
    actionKey: 'vehicle:repair_vehicle',
    actionVersion: 1,
    status: 'committed',
    ledgerId: 'vehicle_state',
    effectIds: ['effect_1'],
    appliedEffectIds: ['effect_1'],
    skippedEffectIds: [],
    confirmationTokenDigest: digestChar('a'),
    effectPlanDigest: digestChar('b'),
    beforeLedgerDigest: digestChar('c'),
    afterLedgerDigest: digestChar('d'),
    target: { kind: 'vehicle', id: 'repair_target' },
    requestedRepair: 20,
    hpBefore: 40,
    hpAfter: 55,
    effectiveRepair: 15,
    updatedTurnBefore: 7,
    updatedTurnAfter: 8,
    clockSnapshot: [{ clock: 'world', value: 8 }],
};

const noopReceipt = {
    schemaVersion: 1,
    commitId: 'commit_2',
    requestId: 'request_2',
    resolutionId: 'resolution_2',
    planId: 'plan_2',
    actionKey: 'vehicle:repair_vehicle',
    actionVersion: 1,
    status: 'valid_noop',
    ledgerId: 'vehicle_state',
    effectIds: ['effect_2'],
    appliedEffectIds: [],
    skippedEffectIds: ['effect_2'],
    confirmationTokenDigest: digestChar('e'),
    effectPlanDigest: digestChar('f'),
    beforeLedgerDigest: digestChar('d'),
    afterLedgerDigest: digestChar('d'),
    target: { kind: 'vehicle', id: 'repair_target' },
    requestedRepair: 10,
    hpBefore: 100,
    hpAfter: 100,
    effectiveRepair: 0,
    clockSnapshot: [],
};

function makeV2(receipts = [committedReceipt, noopReceipt]) {
    const document = clone(mechanicalV1);
    document.version = 2;
    document.gameplayCommitReceipts = clone(receipts);
    return document;
}

function validV2Document(raw = makeV2()) {
    const parsed = parseVehicleStateDocument(raw);
    assert.strictEqual(parsed.kind, 'valid_v2');
    return parsed.document;
}

function expectReceiptFailure(raw, code) {
    const parsed = parseVehicleStateDocument(raw);
    assert.strictEqual(parsed.kind, 'invalid_receipt_metadata');
    assert.strictEqual(parsed.error.code, code);
    return parsed.error;
}

const tests = [];
function test(number, name, fn) {
    tests.push({ number, name, fn });
}

test(1, 'existing v1 document parses as valid_v1', () => {
    assert.strictEqual(parseVehicleStateDocument(clone(mechanicalV1)).kind, 'valid_v1');
});

test(2, 'v1 parsing does not create receipt metadata', () => {
    const parsed = parseVehicleStateDocument(clone(mechanicalV1));
    assert.strictEqual(parsed.kind, 'valid_v1');
    assert.strictEqual(Object.hasOwn(parsed.document, 'gameplayCommitReceipts'), false);
    assert.strictEqual(parsed.document.version, 1);
    const disguised = clone(mechanicalV1);
    disguised.gameplayCommitReceipts = [clone(committedReceipt)];
    const disguisedResult = parseVehicleStateDocument(disguised);
    assert.strictEqual(disguisedResult.kind, 'invalid_document');
    assert.strictEqual(disguisedResult.error.code, 'unexpected_document_field');
});

test(3, 'v1 mechanical projection matches parseVehicleState', () => {
    const parsed = parseVehicleStateDocument(clone(mechanicalV1));
    assert.strictEqual(parsed.kind, 'valid_v1');
    assert.deepStrictEqual(
        projectVehicleStateDocumentMechanical(parsed.document),
        parseVehicleState(mechanicalV1)
    );
});

test(4, 'valid v2 parses', () => {
    const parsed = parseVehicleStateDocument(makeV2());
    assert.strictEqual(parsed.kind, 'valid_v2');
    assert.strictEqual(parsed.document.version, 2);
    assert.strictEqual(parsed.document.gameplayCommitReceipts.length, 2);
    const withoutReceipts = makeV2();
    delete withoutReceipts.gameplayCommitReceipts;
    const optional = parseVehicleStateDocument(withoutReceipts);
    assert.strictEqual(optional.kind, 'valid_v2');
    assert.strictEqual(Object.hasOwn(optional.document, 'gameplayCommitReceipts'), false);
    const empty = parseVehicleStateDocument(makeV2([]));
    assert.strictEqual(empty.kind, 'valid_v2');
    assert.deepStrictEqual(empty.document.gameplayCommitReceipts, []);
});

test(5, 'valid v2 canonical round-trip retains receipts', () => {
    const first = validV2Document();
    const canonicalText = canonicalizeVehicleStateDocument(first);
    const second = parseVehicleStateDocument(JSON.parse(canonicalText));
    assert.strictEqual(second.kind, 'valid_v2');
    assert.deepStrictEqual(second.document, first);
});

test(6, 'receipt order is preserved', () => {
    const document = validV2Document();
    assert.deepStrictEqual(
        document.gameplayCommitReceipts.map((receipt) => receipt.requestId),
        ['request_1', 'request_2']
    );
    assert.deepStrictEqual(
        projectCanonicalVehicleStateDocument(document).gameplayCommitReceipts.map((receipt) => receipt.commitId),
        ['commit_1', 'commit_2']
    );
    const reversed = validV2Document(makeV2([noopReceipt, committedReceipt]));
    assert.notStrictEqual(
        digestWholeVehicleStateDocument(document),
        digestWholeVehicleStateDocument(reversed)
    );
});

test(7, 'vehicle and nested mechanical array ordering is preserved', () => {
    const document = validV2Document();
    const mechanical = projectVehicleStateDocumentMechanical(document);
    const target = mechanical.vehicles[0];
    assert.deepStrictEqual(mechanical.vehicles.map((vehicle) => vehicle.id), ['repair_target', 'base_hull']);
    assert.deepStrictEqual(target.modules.map((item) => item.id), ['module_b', 'module_a']);
    assert.deepStrictEqual(target.modules[0].tags, ['tag_b', 'tag_a']);
    assert.deepStrictEqual(target.cargo.map((item) => item.id), ['cargo_b', 'cargo_a']);
    assert.deepStrictEqual(target.cargo[0].tags, ['cargo_tag_b', 'cargo_tag_a']);
    assert.deepStrictEqual(target.crew.map((item) => item.npcId), ['crew_b', 'crew_a']);
    assert.deepStrictEqual(target.notes.map((item) => item.id), ['note_b', 'note_a']);
    assert.deepStrictEqual(target.tags, ['vehicle_tag_b', 'vehicle_tag_a']);
    assert.deepStrictEqual(mechanical.warnings, ['warning_b', 'warning_a']);
    const reorderedRaw = makeV2();
    reorderedRaw.vehicles[0].modules.reverse();
    const reordered = validV2Document(reorderedRaw);
    assert.notStrictEqual(
        digestMechanicalVehicleStateDocument(document),
        digestMechanicalVehicleStateDocument(reordered)
    );
});

test(8, 'whole-document digest changes when receipts change', () => {
    const first = validV2Document();
    const changed = makeV2();
    changed.gameplayCommitReceipts[1].requestId = 'request_2_changed';
    changed.gameplayCommitReceipts[1].commitId = 'commit_2_changed';
    const second = validV2Document(changed);
    assert.notStrictEqual(
        digestWholeVehicleStateDocument(first),
        digestWholeVehicleStateDocument(second)
    );
});

test(9, 'mechanical digest ignores receipt-only changes', () => {
    const first = validV2Document();
    const changed = makeV2();
    changed.gameplayCommitReceipts[1].requestId = 'request_2_changed';
    changed.gameplayCommitReceipts[1].commitId = 'commit_2_changed';
    const second = validV2Document(changed);
    assert.strictEqual(
        digestMechanicalVehicleStateDocument(first),
        digestMechanicalVehicleStateDocument(second)
    );
});

test(10, 'mechanical digest changes with vehicle state', () => {
    const first = validV2Document();
    const changed = makeV2();
    changed.vehicles[0].durability.hp = 41;
    const second = validV2Document(changed);
    assert.notStrictEqual(
        digestMechanicalVehicleStateDocument(first),
        digestMechanicalVehicleStateDocument(second)
    );
});

test(11, 'invalid receipt digest is rejected', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[0].effectPlanDigest = digestChar('A');
    expectReceiptFailure(raw, 'invalid_digest');
});

test(12, 'invalid action key and action version are rejected', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[0].actionKey = 'vehicle:damage_vehicle';
    expectReceiptFailure(raw, 'invalid_action_key');
    const wrongVersion = makeV2();
    wrongVersion.gameplayCommitReceipts[0].actionVersion = 2;
    expectReceiptFailure(wrongVersion, 'invalid_action_version');
});

test(13, 'invalid ledger ID is rejected', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[0].ledgerId = 'game_state';
    expectReceiptFailure(raw, 'invalid_ledger_id');
});

test(14, 'unknown receipt and document versions are distinguished', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[0].schemaVersion = 2;
    expectReceiptFailure(raw, 'unknown_receipt_version');
    const unsupported = parseVehicleStateDocument({ version: 3, vehicles: [] });
    assert.deepStrictEqual(unsupported, { kind: 'unsupported_document_version', version: 3 });
});

test(15, 'receipt count above 32 is rejected without slicing', () => {
    const receipts = Array.from(
        { length: MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS + 1 },
        (_, index) => ({
            ...clone(committedReceipt),
            commitId: `commit_${index}`,
            requestId: `request_${index}`,
            resolutionId: `resolution_${index}`,
            planId: `plan_${index}`,
            effectIds: [`effect_${index}`],
            appliedEffectIds: [`effect_${index}`],
        })
    );
    expectReceiptFailure(makeV2(receipts), 'too_many_receipts');
});

test(16, 'duplicate request ID is rejected', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[1].requestId = 'request_1';
    expectReceiptFailure(raw, 'duplicate_request_id');
});

test(17, 'duplicate commit ID and duplicate receipt object are rejected', () => {
    const duplicateCommit = makeV2();
    duplicateCommit.gameplayCommitReceipts[1].commitId = 'commit_1';
    expectReceiptFailure(duplicateCommit, 'duplicate_commit_id');
    expectReceiptFailure(makeV2([committedReceipt, committedReceipt]), 'duplicate_receipt');
});

test(18, 'inconsistent HP facts are rejected', () => {
    const raw = makeV2();
    raw.gameplayCommitReceipts[0].hpAfter = 54;
    expectReceiptFailure(raw, 'inconsistent_hp');
});

test(19, 'negative and unsafe numeric facts are rejected', () => {
    const unsafe = makeV2();
    unsafe.gameplayCommitReceipts[0].hpBefore = Number.MAX_SAFE_INTEGER + 1;
    expectReceiptFailure(unsafe, 'unsafe_integer');
    const negative = makeV2();
    negative.gameplayCommitReceipts[0].requestedRepair = -1;
    expectReceiptFailure(negative, 'unsafe_integer');
});

test(20, 'malformed effect arrays and accounting are rejected', () => {
    const wrongLength = makeV2();
    wrongLength.gameplayCommitReceipts[0].appliedEffectIds = [];
    expectReceiptFailure(wrongLength, 'invalid_effect_cardinality');
    const wrongIdentity = makeV2();
    wrongIdentity.gameplayCommitReceipts[0].appliedEffectIds = ['different_effect'];
    expectReceiptFailure(wrongIdentity, 'invalid_effect_accounting');
    const wrongStatus = makeV2();
    wrongStatus.gameplayCommitReceipts[0].status = 'failed';
    expectReceiptFailure(wrongStatus, 'invalid_status');
    const wrongClock = makeV2();
    wrongClock.gameplayCommitReceipts[0].clockSnapshot = [{ clock: 'gm', value: 8 }];
    expectReceiptFailure(wrongClock, 'invalid_clock_snapshot');
});

test(21, 'malformed metadata is rejected rather than truncated or repaired', () => {
    const tooLong = makeV2();
    tooLong.gameplayCommitReceipts[0].commitId = `c${'x'.repeat(160)}`;
    const originalLongId = tooLong.gameplayCommitReceipts[0].commitId;
    expectReceiptFailure(tooLong, 'invalid_id');
    assert.strictEqual(tooLong.gameplayCommitReceipts[0].commitId, originalLongId);

    const pathLike = makeV2();
    pathLike.gameplayCommitReceipts[0].commitId = '../commit';
    expectReceiptFailure(pathLike, 'invalid_id');

    const extension = makeV2();
    extension.gameplayCommitReceipts[0].arbitrary = true;
    expectReceiptFailure(extension, 'unexpected_receipt_field');

    const extraTarget = makeV2();
    extraTarget.gameplayCommitReceipts[0].target.path = 'garage/repair_target';
    expectReceiptFailure(extraTarget, 'invalid_target');

    const polluted = makeV2();
    const receiptJson = JSON.stringify(polluted.gameplayCommitReceipts[0]);
    polluted.gameplayCommitReceipts[0] = JSON.parse(
        `${receiptJson.slice(0, -1)},"__proto__":{"polluted":true}}`
    );
    expectReceiptFailure(polluted, 'unsafe_object_key');
    assert.strictEqual({}.polluted, undefined);

    const rootExtension = makeV2();
    rootExtension.arbitrary = true;
    const rootResult = parseVehicleStateDocument(rootExtension);
    assert.strictEqual(rootResult.kind, 'invalid_document');
    assert.strictEqual(rootResult.error.code, 'unexpected_document_field');
});

test(22, 'canonical output, digests, and derived identities are deterministic', () => {
    const first = validV2Document();
    const second = validV2Document(clone(makeV2()));
    assert.strictEqual(canonicalizeVehicleStateDocument(first), canonicalizeVehicleStateDocument(second));
    assert.strictEqual(digestWholeVehicleStateDocument(first), digestWholeVehicleStateDocument(second));

    const confirmationTokenDigest = digestVehicleRepairConfirmationToken('lr_vrp_v1.confirmation');
    const beforeLedgerDigest = digestChar('1');
    const afterLedgerDigest = digestChar('2');
    const effectPlanDigest = digestVehicleRepairEffectPlanFacts({
        requestId: 'request_identity',
        resolutionId: 'resolution_identity',
        target: { kind: 'vehicle', id: 'repair_target' },
        requestedRepair: 20,
        hpBefore: 40,
        hpAfter: 55,
        effectiveRepair: 15,
        confirmationTokenDigest,
        beforeLedgerDigest,
        afterLedgerDigest,
    });
    const facts = {
        requestId: 'request_identity',
        resolutionId: 'resolution_identity',
        effectPlanDigest,
        confirmationTokenDigest,
        beforeLedgerDigest,
        afterLedgerDigest,
        status: 'committed',
        target: { kind: 'vehicle', id: 'repair_target' },
        requestedRepair: 20,
        hpBefore: 40,
        hpAfter: 55,
        effectiveRepair: 15,
    };
    assert.deepStrictEqual(
        deriveVehicleRepairReceiptIdentity(facts),
        deriveVehicleRepairReceiptIdentity(clone(facts))
    );
    const identity = deriveVehicleRepairReceiptIdentity(facts);
    assert.match(identity.planId, /^vrp_[a-f0-9]{64}$/);
    assert.match(identity.effectId, /^vre_[a-f0-9]{64}$/);
    assert.match(identity.commitId, /^vrc_[a-f0-9]{64}$/);
});

test(23, 'parsing and projections leave inputs deeply unchanged', () => {
    const raw = makeV2();
    const before = clone(raw);
    const parsed = parseVehicleStateDocument(raw);
    assert.strictEqual(parsed.kind, 'valid_v2');
    const parsedBefore = clone(parsed.document);
    projectVehicleStateDocumentMechanical(parsed.document);
    projectCanonicalVehicleStateDocument(parsed.document);
    canonicalizeVehicleStateDocument(parsed.document);
    assert.deepStrictEqual(raw, before);
    assert.deepStrictEqual(parsed.document, parsedBefore);
});

test(24, 'receipt metadata is absent from the mechanical projection', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    assert.strictEqual(mechanical.version, 1);
    assert.strictEqual(Object.hasOwn(mechanical, 'gameplayCommitReceipts'), false);
    assert.strictEqual(JSON.stringify(mechanical).includes('commit_1'), false);
});

test(25, 'receipt metadata is absent from prompt projection', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    const prompt = buildVehiclePromptBlock(mechanical, true, { currentLocationId: 'garage' });
    assert.ok(prompt.includes('Repair Target'));
    assert.strictEqual(prompt.includes('gameplayCommitReceipts'), false);
    assert.strictEqual(prompt.includes('commit_1'), false);
});

test(26, 'receipt metadata is absent from garage/view projection', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    const garage = buildVehicleGarageSnapshot(mechanical, { currentLocationId: 'garage' });
    const serialized = JSON.stringify(garage);
    assert.ok(serialized.includes('repair_target'));
    assert.strictEqual(serialized.includes('gameplayCommitReceipts'), false);
    assert.strictEqual(serialized.includes('commit_1'), false);
});

test(27, 'current production parseVehicleState behavior remains explicit and unchanged', () => {
    assert.deepStrictEqual(parseVehicleState(makeV2()), { version: 1, vehicles: [] });
    assert.deepStrictEqual(parseVehicleState(mechanicalV1), parseVehicleState(clone(mechanicalV1)));
});

test(28, 'current vehicle operations remain unchanged', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    const before = clone(mechanical);
    const next = applyVehicleOps(
        mechanical,
        [{ type: 'repair_vehicle', vehicleId: 'repair_target', amount: 20 }],
        { worldTurn: 12 }
    );
    assert.deepStrictEqual(mechanical, before);
    assert.strictEqual(next.vehicles[0].durability.hp, 60);
    assert.strictEqual(next.updatedTurn, 12);
    assert.strictEqual(Object.hasOwn(next, 'gameplayCommitReceipts'), false);
});

test(29, 'current mobile-base operations remain unchanged', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    const next = applyMobileBaseOps(
        mechanical,
        [{ type: 'move_mobile_base', vehicleId: 'base_hull', locationId: 'north_road' }],
        { worldTurn: 13 }
    );
    const hull = next.vehicles.find((vehicle) => vehicle.id === 'base_hull');
    assert.strictEqual(hull.locationId, 'north_road');
    assert.strictEqual(hull.mobileBase.dockedAtLocationId, 'north_road');
    assert.strictEqual(next.updatedTurn, 13);
    assert.strictEqual(Object.hasOwn(next, 'gameplayCommitReceipts'), false);
});

test(30, 'current repair preview and EffectPlan remain unchanged and public-safe', () => {
    const mechanical = projectVehicleStateDocumentMechanical(validV2Document());
    const intent = {
        id: 'repair_contract_request',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'repair_vehicle',
        target: { kind: 'vehicle', id: 'repair_target' },
        payload: { amount: 30 },
    };
    const context = { vehicleState: mechanical, worldTurn: 14 };
    const query = queryWorldIntent(intent, context);
    const execute = executeWorldIntent(intent, context);
    const preview = planVehicleRepairPreview(intent, query, execute, context);
    const planResult = buildVehicleRepairEffectPlan(preview, context);
    assert.strictEqual(query.status, 'allowed');
    assert.strictEqual(execute.status, 'applied');
    assert.strictEqual(preview.admission.status, 'ready');
    assert.deepStrictEqual(
        {
            hpBefore: preview.mechanicalPreview.hpBefore,
            hpAfter: preview.mechanicalPreview.hpAfter,
            effectiveRepair: preview.mechanicalPreview.effectiveRepair,
        },
        { hpBefore: 40, hpAfter: 70, effectiveRepair: 30 }
    );
    assert.strictEqual(planResult.status, 'available');
    assert.deepStrictEqual(planResult.plan.effects, [{
        order: 0,
        effectType: 'repair_vehicle',
        ledgerId: 'vehicle_state',
        target: { kind: 'vehicle', id: 'repair_target' },
        amount: 30,
    }]);
    const { internal, ...publicPreview } = preview;
    assert.ok(internal);
    assert.strictEqual(Object.hasOwn(publicPreview, 'internal'), false);
    assert.strictEqual(JSON.stringify(publicPreview).includes('gameplayCommitReceipts'), false);
    assert.strictEqual(JSON.stringify(planResult.plan.internal.candidateEvidence).includes('commit_1'), false);
});

test(31, 'pure core has no host, writer, mutation, wall-clock, or random dependency', () => {
    const sourcePath = path.join(root, 'src', 'vehicleStateDocumentCore.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
    assert.deepStrictEqual(
        imports,
        ['./gameplaySpineCore', './gameplaySpinePreviewCore', './vehicleCore']
    );
    for (const [label, pattern] of [
        ['filesystem', /from\s+['"](?:fs|path|node:fs|node:path)['"]/],
        ['VS Code', /from\s+['"]vscode['"]/],
        ['host writer', /from\s+['"].*(?:vehicleState|TurnOps|Bridge|extension)['"]/i],
        ['mutation gate', /deterministicWorkspaceMutationGate|runSerializedMutation/],
        ['wall clock', /\bDate\.now\b|\bnew\s+Date\b/],
        ['random', /Math\.random|randomUUID|randomBytes|randomInt/],
    ]) {
        assert.strictEqual(pattern.test(source), false, `${label} dependency found`);
    }
});

for (const { number, name, fn } of tests) {
    try {
        fn();
    } catch (error) {
        error.message = `Case ${number} (${name}): ${error.message}`;
        throw error;
    }
}

assert.strictEqual(tests.length, 31);
console.log('VehicleState v2 document and durable receipt contract tests passed (31 cases).');
