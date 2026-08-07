#!/usr/bin/env node
'use strict';

// COMBAT-STORY-ENCOUNTER-OPS-V1-001: the GM may declare that a fight begins and
// may never declare how it ends. These tests pin that split, the enable gate,
// and the identity carried into the campaign combat request.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'combatEncounterTurnOpsCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/combatEncounterTurnOpsCore.js missing — run npm run compile');
    process.exit(1);
}
const core = require(corePath);
const host = require(path.join(root, 'out', 'combatEncounterTurnOps.js'));
const { validateCampaignCombatRequest } = require(path.join(root, 'out', 'campaignCombatRequestCore.js'));
const { initialCombatLabScenarios } = require(path.join(root, 'out', 'combatLabCore.js'));
const { compileCampaignCombatRequest } = require(path.join(root, 'out', 'campaignCombatCompileCore.js'));
const { normalizeGameRules } = require(path.join(root, 'out', 'gameRulesCore.js'));

let failed = 0;
function check(name, fn) {
    try { fn(); console.log(`OK: ${name}`); } catch (err) { console.error(`FAIL: ${name}: ${err.message}`); failed++; }
}

const identity = {
    campaignInstanceId: 'ci-1111',
    timelineEpochId: 'ep-1',
    acceptedTurnId: 'turn-42',
    sourceCampaignRevision: 7,
};
const startOp = { op: 'start_combat', encounterId: 'ambush_on_the_road' };

// ---------------------------------------------------------------------------
// Parsing: absence is normal, outcome fields are refused
// ---------------------------------------------------------------------------
check('absent or empty encounterOps parse to no ops, not an error', () => {
    for (const raw of [undefined, null, []]) {
        const parsed = core.parseEncounterTurnOps(raw);
        assert.ok(parsed.ok, `expected ok for ${JSON.stringify(raw)}`);
        assert.strictEqual(parsed.ops.length, 0);
    }
});

check('a minimal start_combat op parses with safe defaults', () => {
    const parsed = core.parseEncounterTurnOps([startOp]);
    assert.ok(parsed.ok, JSON.stringify(parsed));
    assert.strictEqual(parsed.ops[0].fixtureId, core.DEFAULT_ENCOUNTER_FIXTURE_ID);
    assert.strictEqual(parsed.ops[0].mode, 'command');
});

check('the AI cannot declare an outcome', () => {
    for (const key of ['winner', 'outcome', 'finalHp', 'damage', 'loot', 'casualties', 'receiptHash']) {
        const parsed = core.parseEncounterTurnOps([{ ...startOp, [key]: 'anything' }]);
        assert.ok(!parsed.ok, `${key} must be refused`);
        assert.strictEqual(parsed.error, 'FORBIDDEN_OUTCOME_FIELD');
        assert.strictEqual(parsed.detail, key);
    }
});

check('unknown ops, fixtures and modes are refused rather than ignored', () => {
    assert.strictEqual(core.parseEncounterTurnOps([{ ...startOp, op: 'end_combat' }]).error, 'UNKNOWN_ENCOUNTER_OP');
    assert.strictEqual(core.parseEncounterTurnOps([{ ...startOp, fixtureId: 'dragon_god' }]).error, 'UNKNOWN_ENCOUNTER_FIXTURE');
    assert.strictEqual(core.parseEncounterTurnOps([{ ...startOp, mode: 'godmode' }]).error, 'INVALID_ENCOUNTER_MODE');
    assert.strictEqual(core.parseEncounterTurnOps([{ op: 'start_combat' }]).error, 'INVALID_ENCOUNTER_ID');
    assert.strictEqual(core.parseEncounterTurnOps('nope').error, 'ENCOUNTER_OPS_NOT_ARRAY');
});

check('at most one encounter per turn', () => {
    const two = core.parseEncounterTurnOps([startOp, { ...startOp, encounterId: 'second' }]);
    assert.ok(!two.ok);
    assert.strictEqual(two.error, 'TOO_MANY_ENCOUNTER_OPS');
});

// ---------------------------------------------------------------------------
// Request building: real identity, and a request the production validator accepts
// ---------------------------------------------------------------------------
check('the built request carries real campaign identity, never debug placeholders', () => {
    const op = core.parseEncounterTurnOps([startOp]).ops[0];
    const built = core.buildCampaignCombatRequestFromEncounterOp(op, identity, 'req-1');
    assert.ok(built.ok, JSON.stringify(built));
    assert.strictEqual(built.request.campaignInstanceId, 'ci-1111');
    assert.strictEqual(built.request.timelineEpochId, 'ep-1');
    assert.strictEqual(built.request.sourceAcceptedTurnId, 'turn-42');
    assert.strictEqual(built.request.sourceCampaignRevision, 7);
    assert.ok(!JSON.stringify(built.request).includes('debug-campaign'), 'must not carry debug identity');
});

check('the built request passes the production request validator', () => {
    const op = core.parseEncounterTurnOps([startOp]).ops[0];
    const built = core.buildCampaignCombatRequestFromEncounterOp(op, identity, 'req-1');
    const validated = validateCampaignCombatRequest(built.request);
    assert.ok(validated.ok, `validator rejected the request: ${JSON.stringify(validated)}`);
});

check('every allowed fixture builds a request that compiles', () => {
    const scenarios = initialCombatLabScenarios();
    for (const fixtureId of core.ALLOWED_ENCOUNTER_FIXTURE_IDS) {
        const op = core.parseEncounterTurnOps([{ ...startOp, fixtureId }]).ops[0];
        const built = core.buildCampaignCombatRequestFromEncounterOp(op, identity, `req-${fixtureId}`);
        assert.ok(built.ok, `${fixtureId}: ${JSON.stringify(built)}`);
        assert.ok(validateCampaignCombatRequest(built.request).ok, `${fixtureId} failed validation`);

        // Ally ids must match the real fixture, or the compiled battle would
        // disagree with the request's roster.
        const scenario = scenarios.find(s => s.id === fixtureId);
        assert.ok(scenario, `${fixtureId} is not a real Lab scenario`);
        assert.deepStrictEqual(
            built.request.allies.map(a => a.entityId).sort(),
            scenario.allies.map(u => u.id).sort(),
            `${fixtureId} ally roster drifted from the fixture`,
        );
    }
});

check('request ids are deterministic for the same turn and encounter', () => {
    const a = core.encounterRequestId('turn-42', 'ambush');
    const b = core.encounterRequestId('turn-42', 'ambush');
    const c = core.encounterRequestId('turn-43', 'ambush');
    assert.strictEqual(a, b, 'replaying a turn must not mint a new request id');
    assert.notStrictEqual(a, c);
});

check('identity is required; nothing is invented when it is missing', () => {
    const op = core.parseEncounterTurnOps([startOp]).ops[0];
    assert.strictEqual(
        core.buildCampaignCombatRequestFromEncounterOp(op, { ...identity, campaignInstanceId: '' }, 'r').error,
        'INVALID_CAMPAIGN_IDENTITY',
    );
    assert.strictEqual(
        core.buildCampaignCombatRequestFromEncounterOp(op, { ...identity, acceptedTurnId: '' }, 'r').error,
        'INVALID_ACCEPTED_TURN_ID',
    );
    assert.strictEqual(
        core.buildCampaignCombatRequestFromEncounterOp(op, { ...identity, sourceCampaignRevision: -1 }, 'r').error,
        'INVALID_SOURCE_REVISION',
    );
});

// ---------------------------------------------------------------------------
// Host gate
// ---------------------------------------------------------------------------
function hostDeps(overrides = {}) {
    const started = [];
    return {
        started,
        deps: {
            storyCombatEnabled: () => true,
            identity: () => identity,
            startFromRequest: (request) => { started.push(request); return { ok: true, combatSessionId: 'cs-1' }; },
            warn: () => { /* silence expected rejections */ },
            ...overrides,
        },
    };
}

check('enableStoryCombat defaults to off', () => {
    assert.strictEqual(normalizeGameRules({}).enableStoryCombat, false);
});

check('ops are ignored entirely while the rule is off', () => {
    const { started, deps } = hostDeps({ storyCombatEnabled: () => false });
    const out = host.applyEncounterTurnOps({ encounterOps: [startOp] }, deps);
    assert.strictEqual(out.started, false);
    assert.strictEqual(out.skipped, 'disabled');
    assert.strictEqual(started.length, 0, 'no session may start while disabled');
});

check('a valid op starts exactly one session when enabled', () => {
    const { started, deps } = hostDeps();
    const out = host.applyEncounterTurnOps({ encounterOps: [startOp] }, deps);
    assert.strictEqual(out.started, true);
    assert.strictEqual(out.combatSessionId, 'cs-1');
    assert.strictEqual(started.length, 1);
    assert.ok(validateCampaignCombatRequest(started[0]).ok, 'host must dispatch a valid request');
});

check('a turn with no encounterOps starts nothing', () => {
    const { started, deps } = hostDeps();
    assert.strictEqual(host.applyEncounterTurnOps({}, deps).skipped, 'no_ops');
    assert.strictEqual(started.length, 0);
});

check('missing identity refuses the start instead of inventing one', () => {
    const { started, deps } = hostDeps({ identity: () => undefined });
    const out = host.applyEncounterTurnOps({ encounterOps: [startOp] }, deps);
    assert.strictEqual(out.skipped, 'no_identity');
    assert.strictEqual(started.length, 0);
});

check('a coordinator refusal is reported, not thrown', () => {
    const { deps } = hostDeps({
        startFromRequest: () => ({ ok: false, error: 'COMBAT_ALREADY_RUNNING' }),
    });
    const out = host.applyEncounterTurnOps({ encounterOps: [startOp] }, deps);
    assert.strictEqual(out.started, false);
    assert.strictEqual(out.skipped, 'start_rejected');
    assert.strictEqual(out.error, 'COMBAT_ALREADY_RUNNING');
});

check('a malformed op never throws out of the post-commit path', () => {
    const { started, deps } = hostDeps();
    const out = host.applyEncounterTurnOps({ encounterOps: [{ ...startOp, winner: 'player' }] }, deps);
    assert.strictEqual(out.started, false);
    assert.strictEqual(out.skipped, 'invalid_ops');
    assert.strictEqual(out.error, 'FORBIDDEN_OUTCOME_FIELD');
    assert.strictEqual(started.length, 0);
});

// ---------------------------------------------------------------------------
// End-to-end: op -> request -> compiled battle
// ---------------------------------------------------------------------------
check('a declared encounter compiles into a real battle spec', () => {
    const { started, deps } = hostDeps();
    host.applyEncounterTurnOps({ encounterOps: [startOp] }, deps);
    const catalog = JSON.parse(fs.readFileSync(
        path.join(root, 'resources', 'combat-abilities', 'v1-reference-abilities.json'), 'utf8',
    ));
    const compiled = compileCampaignCombatRequest(
        started[0],
        { abilities: catalog.abilities, statuses: catalog.statuses },
        initialCombatLabScenarios(),
    );
    assert.ok(compiled.ok, `compile failed: ${JSON.stringify(compiled)}`);
});

if (failed > 0) {
    console.error(`\ncombat encounter turn ops: ${failed} check(s) failed.`);
    process.exit(1);
}
console.log('\ncombat encounter turn ops tests passed.');
