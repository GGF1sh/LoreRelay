import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, test } from 'node:test';

/**
 * Battle View webview adapter tests.
 *
 * Battle View owns only presentation/interaction; the single
 * CombatCommandPlaytestHost stays the session authority. These tests load the
 * standalone webview bundle with document.getElementById stubbed to null (so the
 * render path is a no-op) and exercise the pure marker/pointer/zoom helpers plus
 * the peer-adoption state machine that keeps Battle View sharing the one session.
 */

interface BattleViewHooks {
    BV: Record<string, any>;
    bvMarkerModel: (unit: any, bounds: any, selected: boolean) => any;
    bvCommandMessageForPointer: (ui: any, target: any, point: any) => any;
    bvCommandControlsDisabled: (state: any) => boolean;
    bvScreenToWorld: (rect: any, x: number, y: number, bounds: any) => { x: number; y: number };
    bvComputeFitScale: (vw: number, vh: number, ww: number, wh: number) => number;
    bvOnMessage: (event: { data: unknown }) => void;
    posted: unknown[];
}

function loadBattleView(): BattleViewHooks {
    const source = fs.readFileSync(path.join(__dirname, '../webview/battle-view/battle-view.js'), 'utf8');
    const posted: unknown[] = [];
    const context: Record<string, unknown> = {
        acquireVsCodeApi: () => ({ postMessage(message: unknown) { posted.push(message); } }),
        window: {
            BV_I18N: {},
            addEventListener() { /* message + resize registration only */ },
        },
        document: {
            getElementById() { return null; },
            addEventListener() { /* DOMContentLoaded not fired in the harness */ },
        },
        console,
    };
    vm.runInNewContext(
        `${source}\nglobalThis.__bv = { BV, bvMarkerModel, bvCommandMessageForPointer, bvCommandControlsDisabled, bvScreenToWorld, bvComputeFitScale, bvOnMessage };`,
        context,
    );
    const hooks = (context as any).__bv as Omit<BattleViewHooks, 'posted'>;
    return { ...hooks, posted };
}

const BOUNDS = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

describe('Battle View marker model', () => {
    test('HP bar and numeric value derive from hp / maxHp', () => {
        const bv = loadBattleView();
        const model = bv.bvMarkerModel(
            { id: 'ally_0', team: 0, hp: 50, maxHp: 100, x: 0, y: 0, dead: false, order: 'move_to' },
            BOUNDS, false,
        );
        assert.equal(model.displayHp, 50);
        assert.equal(model.maxHp, 100);
        assert.equal(model.hpPercent, 50);
        assert.equal(model.left, 50);
        assert.equal(model.top, 50);
        assert.equal(model.order.label, 'MOVE');
        assert.equal(model.selected, false);
        assert.equal(model.dead, false);
    });

    test('selected units carry a distinct selected flag', () => {
        const bv = loadBattleView();
        const model = bv.bvMarkerModel(
            { id: 'ally_1', team: 0, hp: 10, maxHp: 40, x: -100, y: 100, dead: false, order: 'stop' },
            BOUNDS, true,
        );
        assert.equal(model.selected, true);
        assert.equal(model.order.label, 'HOLD');
        assert.equal(model.hpPercent, 25);
    });

    test('dead units render a distinct state but keep their final position', () => {
        const bv = loadBattleView();
        const model = bv.bvMarkerModel(
            { id: 'enemy_2', team: 1, hp: 0, maxHp: 30, x: 50, y: -50, dead: true, order: 'attack_target' },
            BOUNDS, false,
        );
        assert.equal(model.dead, true);
        assert.equal(model.displayHp, 0);
        assert.equal(model.hpPercent, 0);
        assert.equal(model.order.label, ''); // dead units show no order badge
        assert.equal(model.left, 75);  // x=50 within -100..100 → 75%
        assert.equal(model.top, 25);   // y=-50 → 25%
    });

    test('order badges reflect the snapshot order', () => {
        const bv = loadBattleView();
        const order = (o: unknown) => bv.bvMarkerModel(
            { id: 'ally_0', team: 0, hp: 1, maxHp: 1, x: 0, y: 0, dead: false, order: o }, BOUNDS, false,
        ).order.label;
        assert.equal(order('attack_target'), 'ATK');
        assert.equal(order('attack_move'), 'A-MV');
        assert.equal(order('move_to'), 'MOVE');
        assert.equal(order('stop'), 'HOLD');
        assert.equal(order(null), 'GMBT');
    });
});

describe('Battle View pointer → command messages', () => {
    test('attack_move pending emits attack_move with a point', () => {
        const bv = loadBattleView();
        const msg = bv.bvCommandMessageForPointer(
            { selection: ['ally_0'], pendingOrder: 'attack_move' }, null, { x: 5, y: 6 },
        );
        // Normalize across the vm realm boundary before a structural compare.
        assert.deepEqual(JSON.parse(JSON.stringify(msg)), { type: 'issueCombatCommand', unitIds: ['ally_0'], command: 'attack_move', point: { x: 5, y: 6 } });
    });
    test('right-click on a live enemy emits attack_target', () => {
        const bv = loadBattleView();
        const msg = bv.bvCommandMessageForPointer(
            { selection: ['ally_0'], pendingOrder: null }, { id: 'enemy_1', team: 1, dead: false }, { x: 1, y: 1 },
        );
        assert.equal(msg.command, 'attack_target');
        assert.equal(msg.targetId, 'enemy_1');
    });
    test('right-click on ground emits move_to', () => {
        const bv = loadBattleView();
        const msg = bv.bvCommandMessageForPointer(
            { selection: ['ally_0'], pendingOrder: null }, null, { x: 2, y: 3 },
        );
        assert.equal(msg.command, 'move_to');
        assert.deepEqual(JSON.parse(JSON.stringify(msg.point)), { x: 2, y: 3 });
    });
    test('no selection yields no message', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvCommandMessageForPointer({ selection: [], pendingOrder: null }, null, { x: 0, y: 0 }), null);
    });
});

describe('Battle View zoom / coordinate conversion', () => {
    test('screen→world uses the post-transform stage rect (scale-independent)', () => {
        const bv = loadBattleView();
        // A stage scaled to 400px wide still maps its center to world origin.
        const center = bv.bvScreenToWorld({ left: 0, top: 0, width: 400, height: 400 }, 200, 200, BOUNDS);
        assert.equal(center.x, 0);
        assert.equal(center.y, 0);
        const quarter = bv.bvScreenToWorld({ left: 0, top: 0, width: 400, height: 400 }, 100, 100, BOUNDS);
        assert.equal(quarter.x, -50);
        assert.equal(quarter.y, -50);
    });
    test('fit scale fits the world into the viewport with margin', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvComputeFitScale(400, 300, 200, 150), 1.88); // min(2,2)*0.94
        assert.ok(bv.bvComputeFitScale(100, 100, 200, 200) < 1);      // shrink to fit
    });
});

describe('Battle View command-control gating', () => {
    test('controls disabled without a session or in spectator mode', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvCommandControlsDisabled({ playtest: null, playtestMode: 'command' }), true);
        assert.equal(bv.bvCommandControlsDisabled({ playtest: {}, playtestMode: 'spectator' }), true);
        assert.equal(bv.bvCommandControlsDisabled({ playtest: {}, playtestMode: 'command' }), false);
    });
});

describe('Battle View peer adoption / shared session', () => {
    function stateMsg(overrides: Record<string, unknown>) {
        return {
            data: {
                type: 'combatCommandPlaytestState',
                state: {
                    scenarioId: 's1', startId: 'ns:1', mode: 'command', tick: 3, outcome: '',
                    bounds: BOUNDS, running: true,
                    units: [
                        { id: 'ally_0', team: 0, hp: 10, maxHp: 10, x: 0, y: 0, dead: false, order: null },
                        { id: 'enemy_0', team: 1, hp: 8, maxHp: 10, x: 10, y: 0, dead: false, order: null },
                    ],
                    feedback: [],
                    ...overrides,
                },
            },
        };
    }

    test('a fresh Battle View restores an existing host session without a startId of its own', () => {
        const bv = loadBattleView();
        assert.equal(bv.BV.eligibleForHostRestore, true);
        bv.bvOnMessage(stateMsg({}));
        assert.equal(bv.BV.selected, 's1');
        assert.equal(bv.BV.activeStartId, 'ns:1');
        assert.ok(bv.BV.playtest);
        assert.equal(bv.BV.eligibleForHostRestore, false);
    });

    test('a matching pending start is adopted; a stale startId is ignored', () => {
        const bv = loadBattleView();
        bv.BV.eligibleForHostRestore = false;
        bv.BV.selected = 's2';
        bv.BV.pendingStart = true;
        bv.BV.pendingStartId = 'me:2';
        // Wrong startId must not adopt.
        bv.bvOnMessage(stateMsg({ scenarioId: 's2', startId: 'someone-else:9' }));
        assert.equal(bv.BV.activeStartId, null);
        assert.equal(bv.BV.pendingStart, true);
        // Matching startId adopts.
        bv.bvOnMessage(stateMsg({ scenarioId: 's2', startId: 'me:2' }));
        assert.equal(bv.BV.activeStartId, 'me:2');
        assert.equal(bv.BV.pendingStart, false);
    });

    test('a peer replacement (replaced-null then new snapshot) is adopted', () => {
        const bv = loadBattleView();
        // Establish a session first.
        bv.bvOnMessage(stateMsg({}));
        assert.equal(bv.BV.activeStartId, 'ns:1');
        // Host retires the old session for a peer's replacement.
        bv.bvOnMessage({ data: { type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' } });
        assert.equal(bv.BV.playtest, null);
        assert.equal(bv.BV.pendingPeerAdopt, true);
        // The authoritative replacement is adopted even with a different scenario/startId.
        bv.bvOnMessage(stateMsg({ scenarioId: 's9', startId: 'peer:7', mode: 'spectator' }));
        assert.equal(bv.BV.selected, 's9');
        assert.equal(bv.BV.activeStartId, 'peer:7');
        assert.equal(bv.BV.playtestMode, 'spectator');
    });

    test('outcome stops running and clears dead units from the selection', () => {
        const bv = loadBattleView();
        bv.bvOnMessage(stateMsg({}));
        bv.BV.selection = ['ally_0'];
        bv.bvOnMessage(stateMsg({
            outcome: 'Team 1 wins',
            units: [
                { id: 'ally_0', team: 0, hp: 0, maxHp: 10, x: 0, y: 0, dead: true, order: null },
                { id: 'enemy_0', team: 1, hp: 8, maxHp: 10, x: 10, y: 0, dead: false, order: null },
            ],
        }));
        assert.equal(bv.BV.running, false);
        assert.deepEqual([...bv.BV.selection], []); // dead ally dropped from selection
        assert.equal(bv.BV.playtest.outcome, 'Team 1 wins');
    });
});
