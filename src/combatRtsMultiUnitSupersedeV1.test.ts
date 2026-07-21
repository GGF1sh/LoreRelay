/**
 * COMBAT-RTS-MULTI-UNIT-SUPERSEDE-001 focused tests.
 *
 * PR6 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md: the multi-unit expansion order,
 * and supersede semantics.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatUnitState, resolveCombat, createCombatState, createCombatStepContext, stepCombat
} from './gambitCombatCore';
import { CommandInputEvent, CommandInputLog, COMMAND_INPUT_SCHEMA_VERSION } from './combatRtsCommandInputCore';

const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.startsWith('fixture_') && f.endsWith('.json')).sort();

function fixtureSpec(file: string): BattleSpec {
    const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
    return {
        activePreset: data.activePreset,
        deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
        fixedFps: data.fixedFps,
        viewport: data.viewport || { width: 1280, height: 720 },
        participantOrder: data.participantOrder,
        initialState: data.initialState,
    } as BattleSpec;
}

function unit(over: Partial<CombatUnitState> & { name: string; team: 0 | 1 }): any {
    return {
        role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0,
        move_speed: 40, attack_range: 40, attack_cooldown: 0.5, radius: 12,
        pos_x: over.team === 0 ? 0 : 200, pos_y: 0,
        ...over,
    };
}

function skirmishSpec(over: Partial<BattleSpec> = {}): BattleSpec {
    return {
        activePreset: 'rts-order-slot-test',
        deltaSeconds: 1 / 30,
        viewport: { width: 1280, height: 720 },
        participantOrder: ['ally_a', 'ally_b', 'ally_c', 'enemy_a'],
        initialState: {
            units: {
                allies: [
                    unit({ name: 'ally_a', team: 0 }),
                    unit({ name: 'ally_b', team: 0, pos_y: 40 }),
                    unit({ name: 'ally_c', team: 0, pos_y: 80 }),
                ],
                enemies: [unit({ name: 'enemy_a', team: 1 })],
            },
        },
        ...over,
    } as BattleSpec;
}

function commandLog(events: CommandInputEvent[], tickRate = 30): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events };
}

describe('RTS multi-unit command expansion — design §4', () => {
    test('reversed unitIds produces byte-identical complete output', () => {
        const eventsFwd: CommandInputEvent[] = [{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b', 'ally_c'], command: 'stop' }];
        const eventsRev: CommandInputEvent[] = [{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_c', 'ally_b', 'ally_a'], command: 'stop' }];
        
        const specFwd = skirmishSpec({ command: commandLog(eventsFwd) });
        const specRev = skirmishSpec({ command: commandLog(eventsRev) });
        
        const outFwd = resolveCombat(specFwd);
        const outRev = resolveCombat(specRev);
        
        assert.equal(JSON.stringify(outFwd), JSON.stringify(outRev));
    });

    test('receipt ordering follows participantOrder, not unitIds order', () => {
        const events: CommandInputEvent[] = [{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_c', 'ally_b', 'ally_a'], command: 'stop' }];
        const spec = skirmishSpec({ command: commandLog(events) });
        const out = resolveCombat(spec);
        
        const startedUnits = out.commandReceipts!.filter(r => r.kind === 'order_started').map(r => r.unitId);
        // Should follow participantOrder: ally_a, ally_b, ally_c
        assert.deepEqual(startedUnits, ['ally_a', 'ally_b', 'ally_c']);
    });

    test('partial unit rejection does not abort valid units', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'enemy_a', 'ally_missing'], command: 'stop' }
        ];
        const spec = skirmishSpec({ command: commandLog(events) });
        const out = resolveCombat(spec);
        
        const receipts = out.commandReceipts!.map(r => [r.unitId, r.kind]);
        // ally_a gets accepted/started
        // enemy_a gets rejected (not your team)
        // ally_missing gets rejected (unit not found)
        assert.deepEqual(receipts, [
            ['ally_a', 'order_accepted'],
            ['ally_a', 'order_started'],
            ['enemy_a', 'order_rejected'], // not_your_team
            ['ally_missing', 'order_rejected'], // unit_not_found
        ]);
    });

    test('overlapping multi-unit selections', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'move_to', point: { x: 10, y: 10 } },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_b', 'ally_c'], command: 'stop' }
        ];
        const spec = skirmishSpec({ command: commandLog(events) });
        const out = resolveCombat(spec);
        
        const receipts = out.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.unitId, r.command, r.kind]);
        assert.deepEqual(receipts, [
            // seq 0 applies to a and b
            ['ally_a', 'move_to', 'order_accepted'],
            ['ally_a', 'move_to', 'order_started'],
            ['ally_b', 'move_to', 'order_accepted'],
            ['ally_b', 'move_to', 'order_started'],
            // seq 1 applies to b and c
            ['ally_b', 'move_to', 'order_superseded'], // b's previous move_to is superseded
            ['ally_b', 'stop', 'order_accepted'],
            ['ally_b', 'stop', 'order_started'],
            ['ally_c', 'stop', 'order_accepted'],
            ['ally_c', 'stop', 'order_started'],
        ]);
    });
});

describe('RTS multi-unit command supersede semantics', () => {
    test('later rejected command does not supersede an active valid order', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'attack_target', targetId: 'ally_b' } // rejected: ally
        ];
        const spec = skirmishSpec({ command: commandLog(events) });
        const ctx = createCombatStepContext(spec);
        let state = createCombatState(spec);
        
        const stepped = stepCombat(state, ctx); // tick 1
        state = stepped.state;
        const eventsRet = stepped.events;
        
        const receipts = eventsRet.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.command, r.kind, r.reason]);
        assert.deepEqual(receipts, [
            ['stop', 'order_accepted', undefined],
            ['stop', 'order_started', undefined],
            ['attack_target', 'order_rejected', 'invalid_target'],
        ]);
        
        // No superseded event. Stop is still active.
        assert.equal(eventsRet.commandReceipts!.some(r => r.kind === 'order_superseded'), false);
        
        // Direct state assertions
        const order = state.orders['ally_a'];
        assert.ok(order, 'ally_a should have an active order');
        assert.equal(order!.command, 'stop');
        
        // Ensure unit did not move or attack
        assert.equal(state.units['ally_a']!.pos_x, 0);
    });

    test('stop -> move_to overlap cases', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 50, y: 50 } }
        ];
        const out = resolveCombat(skirmishSpec({ command: commandLog(events) }));
        const receipts = out.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.command, r.kind]);
        assert.deepEqual(receipts, [
            ['stop', 'order_accepted'],
            ['stop', 'order_started'],
            ['stop', 'order_superseded'],
            ['move_to', 'order_accepted'],
            ['move_to', 'order_started'],
        ]);
    });

    test('move_to -> stop overlap cases', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 50, y: 50 } },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' }
        ];
        const out = resolveCombat(skirmishSpec({ command: commandLog(events) }));
        const receipts = out.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.command, r.kind]);
        assert.deepEqual(receipts, [
            ['move_to', 'order_accepted'],
            ['move_to', 'order_started'],
            ['move_to', 'order_superseded'],
            ['stop', 'order_accepted'],
            ['stop', 'order_started'],
        ]);
    });

    test('attack_target -> resume_gambit overlap cases', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'attack_target', targetId: 'enemy_a' },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' }
        ];
        const out = resolveCombat(skirmishSpec({ command: commandLog(events) }));
        const receipts = out.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.command, r.kind]);
        assert.deepEqual(receipts, [
            ['attack_target', 'order_accepted'],
            ['attack_target', 'order_started'],
            ['attack_target', 'order_superseded'],
            ['resume_gambit', 'order_accepted'], // resume_gambit does not start an order
        ]);
    });

    test('resume_gambit -> attack_move overlap cases', () => {
        // resume_gambit is immediate and clears the slot. It doesn't install an order, so the next
        // command does NOT supersede resume_gambit (it just starts).
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'attack_move', point: { x: 100, y: 100 } }
        ];
        const out = resolveCombat(skirmishSpec({ command: commandLog(events) }));
        const receipts = out.commandReceipts!
            .filter(r => ['order_accepted', 'order_started', 'order_superseded', 'order_rejected'].includes(r.kind))
            .map(r => [r.command, r.kind]);
        assert.deepEqual(receipts, [
            ['resume_gambit', 'order_accepted'], // slot cleared
            ['attack_move', 'order_accepted'],   // slot populated (no supersede emitted because slot was clear)
            ['attack_move', 'order_started'],
        ]);
    });

    test('all same-tick commands are applied globally before any participant acts', () => {
        // participantOrder is: ally_a, ally_b, ally_c, enemy_a
        // enemy_a has 10 HP, so ally_a (10 attack) will kill it in one hit.
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'attack_target', targetId: 'enemy_a' },
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_b'], command: 'attack_target', targetId: 'enemy_a' }
        ];
        
        // enemy_a HP set to 10
        const spec = skirmishSpec({
            command: commandLog(events),
            initialState: {
                units: {
                    allies: [
                        unit({ name: 'ally_a', team: 0 }),
                        unit({ name: 'ally_b', team: 0, pos_y: 40 }),
                        unit({ name: 'ally_c', team: 0, pos_y: 80 })
                    ],
                    enemies: [unit({ name: 'enemy_a', team: 1, hp: 10, max_hp: 10 })],
                }
            }
        });
        
        const out = resolveCombat(spec);
        
        // Assert for ally_b
        const receiptsB = out.commandReceipts!.filter(r => r.unitId === 'ally_b').map(r => [r.command, r.kind, r.reason]);
        assert.deepEqual(receiptsB, [
            ['attack_target', 'order_accepted', undefined],
            ['attack_target', 'order_started', undefined],
            ['attack_target', 'order_completed', 'target_defeated']
        ]);
        
        // Ensure NO order_rejected due to target_defeated exists for ally_b.
        // If commands were applied just-in-time per participant, ally_a would kill enemy_a, 
        // and then ally_b's command would be rejected (invalid_target or target_defeated).
        const rejected = out.commandReceipts!.filter(r => r.unitId === 'ally_b' && r.kind === 'order_rejected');
        assert.equal(rejected.length, 0);
    });
});

describe('RTS multi-unit determinism', () => {
    test('deterministic repeated runs', () => {
        const events: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'move_to', point: { x: 100, y: 100 } },
            { tick: 5, seq: 0, issuerTeam: 0, unitIds: ['ally_b', 'ally_c'], command: 'stop' }
        ];
        const spec = skirmishSpec({ command: commandLog(events) });
        
        const out1 = JSON.stringify(resolveCombat(spec));
        const out2 = JSON.stringify(resolveCombat(spec));
        const out3 = JSON.stringify(resolveCombat(spec));
        
        assert.equal(out1, out2);
        assert.equal(out2, out3);
    });

    for (const file of fixtureFiles) {
        test(`${file}: absent and explicit-empty command logs remain byte-identical`, () => {
            const spec = fixtureSpec(file);
            const withoutField = resolveCombat(spec);
            
            const withEmptyLog = resolveCombat({ ...spec, command: commandLog([]) });
            
            assert.equal(JSON.stringify(withEmptyLog), JSON.stringify(withoutField));
            assert.equal('commandReceipts' in withoutField, false);
            assert.equal('commandReceipts' in withEmptyLog, false);
        });
    }
});
