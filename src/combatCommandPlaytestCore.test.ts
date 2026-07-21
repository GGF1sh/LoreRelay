import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { initialCombatLabScenarios } from './combatLabCore';
import { createCombatStepContext } from './gambitCombatCore';
import {
    CombatCommandPlaytestSession,
    advanceCombatCommandPlaytest,
    combatCommandPlaytestSnapshot,
    createCombatCommandPlaytest,
    issueCombatCommand,
} from './combatCommandPlaytestCore';

const catalog = { abilities: [], statuses: [] };

function start(mode: 'command' | 'spectator' = 'command'): CombatCommandPlaytestSession {
    const result = createCombatCommandPlaytest(initialCombatLabScenarios()[0], catalog, mode);
    assert.equal(result.ok, true);
    return result.value;
}

function issue(session: CombatCommandPlaytestSession, message: unknown): CombatCommandPlaytestSession {
    const result = issueCombatCommand(session, message);
    assert.equal(result.ok, true);
    return result.value;
}

function step(session: CombatCommandPlaytestSession, ticks = 1): CombatCommandPlaytestSession {
    const result = advanceCombatCommandPlaytest(session, ticks);
    assert.equal(result.ok, true);
    return result.value;
}

describe('Combat Lab command playtest adapter', () => {
    test('starts in command mode and renders the real createCombatState roster', () => {
        const session = start();
        const snapshot = combatCommandPlaytestSnapshot(session);
        assert.equal(snapshot.mode, 'command');
        assert.equal(snapshot.tick, 0);
        assert.deepEqual(snapshot.units.map(unit => unit.id), session.spec.participantOrder);
        assert.equal(snapshot.units.length, 10);
        const context = createCombatStepContext(session.spec, session.spec.viewport);
        assert.deepEqual(snapshot.bounds, {
            minX: context.battleRect.x + 12,
            maxX: context.battleRect.x + context.battleRect.w - 12,
            minY: context.battleRect.y + 12,
            maxY: context.battleRect.y + context.battleRect.h - 12,
        });
    });

    test('queues multiple commands for the same next tick without advancing state', () => {
        const original = start();
        const first = issue(original, { unitIds: ['ally_1'], command: 'move_to', point: { x: 100, y: 100 } });
        const second = issue(first, { unitIds: ['ally_1'], command: 'stop' });
        assert.equal(second.state.tick, 0);
        assert.deepEqual(second.commandLog.events.map(event => [event.tick, event.seq, event.command]), [
            [1, 0, 'move_to'],
            [1, 1, 'stop'],
        ]);
        assert.deepEqual(combatCommandPlaytestSnapshot(second).lastIssued, second.commandLog.events[1]);
        const advanced = step(second);
        assert.equal(advanced.state.tick, 1);
        assert.equal(advanced.state.orders.ally_1?.command, 'stop');
        assert.deepEqual(advanced.feedback.map(receipt => receipt.kind), [
            'order_accepted',
            'order_started',
            'order_superseded',
            'order_accepted',
            'order_started',
        ]);
    });

    test('validated move_to, attack_target, and attack_move messages become existing schema events and active orders', () => {
        let session = start();
        session = issue(session, { unitIds: ['ally_1'], command: 'move_to', point: { x: 0.0004, y: 10 } });
        assert.deepEqual(session.lastIssued, { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_1'], command: 'move_to', point: { x: 0, y: 10 } });
        session = step(session);
        assert.equal(session.state.orders.ally_1?.command, 'move_to');

        session = issue(session, { unitIds: ['ally_1'], command: 'attack_target', targetId: 'enemy_1' });
        assert.equal(session.lastIssued?.command, 'attack_target');
        assert.equal(session.lastIssued?.targetId, 'enemy_1');
        session = step(session);
        assert.equal(session.state.orders.ally_1?.command, 'attack_target');

        session = issue(session, { unitIds: ['ally_1'], command: 'attack_move', point: { x: 120, y: 40 } });
        assert.equal(session.lastIssued?.command, 'attack_move');
        session = step(session);
        assert.equal(session.state.orders.ally_1?.command, 'attack_move');
    });

    test('multi-unit fan-out follows participantOrder rather than selection order', () => {
        let session = start();
        session = issue(session, { unitIds: ['ally_3', 'ally_1', 'ally_2'], command: 'stop' });
        session = step(session);
        assert.deepEqual(
            session.feedback.filter(receipt => receipt.kind === 'order_started').map(receipt => receipt.unitId),
            ['ally_1', 'ally_2', 'ally_3'],
        );
    });

    test('stop persists and resume_gambit clears every selected override', () => {
        let session = start();
        session = step(issue(session, { unitIds: ['ally_1', 'ally_2'], command: 'stop' }));
        assert.equal(session.state.orders.ally_1?.command, 'stop');
        assert.equal(session.state.orders.ally_2?.command, 'stop');
        session = step(issue(session, { unitIds: ['ally_2', 'ally_1'], command: 'resume_gambit' }));
        assert.equal(session.state.orders.ally_1, null);
        assert.equal(session.state.orders.ally_2, null);
        assert.deepEqual(
            session.feedback.filter(receipt => receipt.command === 'resume_gambit').map(receipt => receipt.unitId),
            ['ally_1', 'ally_2'],
        );
    });

    test('spectator mode sends commands through the core gate and receives rejection receipts', () => {
        let session = start('spectator');
        session = step(issue(session, { unitIds: ['ally_1'], command: 'stop' }));
        assert.equal(session.state.orders.ally_1, undefined);
        assert.deepEqual(session.feedback.map(receipt => [receipt.kind, receipt.reason]), [
            ['order_rejected', 'mode_forbids_command'],
        ]);
    });

    test('malformed and adversarial webview messages are rejected without changing the session', () => {
        const session = start();
        const before = JSON.stringify(session);
        assert.deepEqual(issueCombatCommand(session, null), { ok: false, error: 'INVALID_COMMAND_MESSAGE' });
        const throwing = new Proxy({}, { get() { throw new Error('untrusted getter'); } });
        assert.deepEqual(issueCombatCommand(session, throwing), { ok: false, error: 'INVALID_COMMAND_MESSAGE' });
        const malformed = issueCombatCommand(session, { unitIds: [], command: 'teleport' });
        assert.equal(malformed.ok, false);
        assert.equal(JSON.stringify(session), before);
    });

    test('issuing and stepping return new state without direct mutation by the UI adapter', () => {
        const original = start();
        const originalState = JSON.stringify(original.state);
        const issued = issue(original, { unitIds: ['ally_1'], command: 'move_to', point: { x: 0, y: 0 } });
        assert.equal(JSON.stringify(original.state), originalState);
        assert.equal(issued.state, original.state);
        const issuedState = JSON.stringify(issued.state);
        const advanced = step(issued);
        assert.equal(JSON.stringify(issued.state), issuedState);
        assert.notEqual(advanced.state, issued.state);
        assert.equal(advanced.state.tick, 1);
    });

    test('the live step loop preserves the existing combat timeout boundary', () => {
        const session = start();
        const nearTimeout = { ...session, state: { ...session.state, tick: 3600 } };
        const advanced = step(nearTimeout);
        assert.equal(advanced.state.tick, 3601);
        assert.equal(advanced.state.outcome, 'Timeout');
    });

    test('battle-spec construction failures are returned instead of thrown', () => {
        const scenario = structuredClone(initialCombatLabScenarios()[0]);
        scenario.enemies[0].id = scenario.allies[0].id;
        const result = createCombatCommandPlaytest(scenario, catalog);
        assert.deepEqual(result, {
            ok: false,
            error: 'INVALID_COMBAT_BATTLE_SPEC',
            detail: 'DUPLICATE_COMBAT_LAB_UNIT_ID',
        });
    });
});
