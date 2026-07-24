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
    bvScenarioChange: (state: any, scenarioId: string) => void;
    bvModeChange: (state: any, mode: string) => void;
    bvHasSession: (state: any) => boolean;
    bvObserveViewport: () => void;
    bvRosterRowModel: (unit: any, selected: boolean) => any;
    bvTargetLineModel: (unit: any, unitsById: Record<string, any>, bounds: any, tick: number) => any;
    bvResultRowModel: (unit: any) => any;
    bvFeedEntryModel: (entry: any, unitsById: Record<string, any>) => any;
    bvNewFeedEntries: (prev: any[] | null, next: any[]) => any[];
    bvAttackStyleForUnit: (unit: any) => { kind: string; vector: string };
    bvUnitStatusesModel: (unit: any, max?: number) => any;
    posted: unknown[];
}

interface LoadOptions {
    document?: any;
    ResizeObserver?: any;
}

function loadBattleView(opts: LoadOptions = {}): BattleViewHooks {
    const source = fs.readFileSync(path.join(__dirname, '../webview/battle-view/battle-view.js'), 'utf8');
    const posted: unknown[] = [];
    const context: Record<string, unknown> = {
        acquireVsCodeApi: () => ({ postMessage(message: unknown) { posted.push(message); } }),
        window: {
            BV_I18N: {},
            addEventListener() { /* message + resize registration only */ },
        },
        document: opts.document ?? {
            getElementById() { return null; },
            addEventListener() { /* DOMContentLoaded not fired in the harness */ },
        },
        console,
    };
    if (opts.ResizeObserver) context.ResizeObserver = opts.ResizeObserver;
    vm.runInNewContext(
        `${source}\nglobalThis.__bv = { BV, bvMarkerModel, bvCommandMessageForPointer, bvCommandControlsDisabled, bvScreenToWorld, bvComputeFitScale, bvOnMessage, bvScenarioChange, bvModeChange, bvHasSession, bvObserveViewport, bvRosterRowModel, bvTargetLineModel, bvResultRowModel, bvFeedEntryModel, bvNewFeedEntries, bvAttackStyleForUnit, bvUnitStatusesModel };`,
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

function snapshot(overrides: Record<string, unknown>) {
    return {
        data: {
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 's1', startId: 'ns:1', mode: 'command', tick: 3, outcome: '',
                bounds: BOUNDS, running: true,
                units: [{ id: 'ally_0', team: 0, hp: 10, maxHp: 10, x: 0, y: 0, dead: false, order: null }],
                feedback: [],
                ...overrides,
            },
        },
    };
}
function startsIn(posted: unknown[]) {
    return posted.filter((m: any) => m && m.type === 'startCombatCommandPlaytest');
}

describe('Battle View repair: mid-session scenario change', () => {
    test('replacement-starts exactly once with a fresh startId and preserves the mode', () => {
        const bv = loadBattleView();
        bv.bvOnMessage(snapshot({}));               // adopt s1 / ns:1
        assert.equal(bv.BV.activeStartId, 'ns:1');
        bv.posted.length = 0;
        bv.bvScenarioChange(bv.BV, 's2');
        const starts = startsIn(bv.posted) as any[];
        assert.equal(starts.length, 1);             // exactly one host start
        assert.equal(starts[0].scenarioId, 's2');
        assert.equal(starts[0].mode, 'command');    // mode preserved
        assert.notEqual(starts[0].startId, 'ns:1'); // fresh startId
        assert.equal(bv.BV.pendingStart, true);
        assert.equal(bv.BV.pendingStartId, starts[0].startId);
    });

    test('old-startId snapshots are rejected, the replacement is adopted, and playback keeps flowing', () => {
        const bv = loadBattleView();
        bv.bvOnMessage(snapshot({}));
        bv.posted.length = 0;
        bv.bvScenarioChange(bv.BV, 's2');
        const startId = (startsIn(bv.posted)[0] as any).startId;
        // A trailing snapshot from the retired scenario must not resurrect it.
        bv.bvOnMessage(snapshot({ scenarioId: 's1', startId: 'ns:1', tick: 99 }));
        assert.notEqual(bv.BV.selected, 's1');
        // The replacement snapshot is adopted, and later ticks are not stalled.
        bv.bvOnMessage(snapshot({ scenarioId: 's2', startId, tick: 1 }));
        assert.equal(bv.BV.activeStartId, startId);
        assert.equal(bv.BV.playtest.tick, 1);
        bv.bvOnMessage(snapshot({ scenarioId: 's2', startId, tick: 2 }));
        assert.equal(bv.BV.playtest.tick, 2);
    });

    test('changing scenario with no active session does not start a battle', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvHasSession(bv.BV), false);
        bv.posted.length = 0;
        bv.bvScenarioChange(bv.BV, 's5');
        assert.equal(startsIn(bv.posted).length, 0);
        assert.equal(bv.BV.selected, 's5');
    });
});

describe('Battle View repair: mid-session mode change', () => {
    test('replacement-starts once with the new mode and keeps the scenario', () => {
        const bv = loadBattleView();
        bv.bvOnMessage(snapshot({}));
        bv.posted.length = 0;
        bv.bvModeChange(bv.BV, 'spectator');
        const starts = startsIn(bv.posted) as any[];
        assert.equal(starts.length, 1);
        assert.equal(starts[0].mode, 'spectator');
        assert.equal(starts[0].scenarioId, 's1');
        // Adopting the replacement keeps the authoritative mode and startId aligned.
        bv.bvOnMessage(snapshot({ scenarioId: 's1', startId: starts[0].startId, mode: 'spectator' }));
        assert.equal(bv.BV.playtestMode, 'spectator');
        assert.equal(bv.BV.activeStartId, starts[0].startId);
    });

    test('changing mode with no active session is display-only (no host start)', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvHasSession(bv.BV), false);
        bv.posted.length = 0;
        bv.bvModeChange(bv.BV, 'spectator');
        assert.equal(startsIn(bv.posted).length, 0);
        assert.equal(bv.BV.playtestMode, 'spectator');
    });
});

describe('Battle View repair: ResizeObserver lifecycle', () => {
    function fakeEl() {
        return {
            style: {} as Record<string, string>, textContent: '', clientWidth: 0, clientHeight: 0,
            getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        };
    }
    function viewportOf(w: number, h: number) { const e = fakeEl(); e.clientWidth = w; e.clientHeight = h; return e; }

    function harness() {
        let viewport = viewportOf(800, 600);
        const stage = fakeEl();
        const readout = fakeEl();
        const root = {
            className: '',
            querySelector(sel: string) {
                if (sel === '[data-bv="viewport"]') return viewport;
                if (sel === '[data-bv="stage"]') return stage;
                if (sel === '[data-bv="zoom-readout"]') return readout;
                return null;
            },
        };
        const observed: any[] = [];
        let disconnects = 0;
        let cb: () => void = () => {};
        class FakeResizeObserver {
            constructor(fn: () => void) { cb = fn; }
            observe(target: any) { observed.push(target); }
            disconnect() { disconnects += 1; }
        }
        const doc = { getElementById: (id: string) => (id === 'bv-root' ? root : null), addEventListener() {} };
        const bv = loadBattleView({ document: doc, ResizeObserver: FakeResizeObserver });
        return {
            bv, observed,
            get disconnects() { return disconnects; },
            fireResize: () => cb(),
            swapViewport: () => { viewport = viewportOf(400, 300); return viewport; },
            get currentViewport() { return viewport; },
        };
    }

    test('re-observes the fresh viewport after a structural rerender', () => {
        const h = harness();
        h.bv.bvObserveViewport();
        assert.equal(h.observed[h.observed.length - 1], h.currentViewport);
        const before = h.disconnects;
        const next = h.swapViewport();
        h.bv.bvObserveViewport();
        assert.ok(h.disconnects > before);                    // old target released
        assert.equal(h.observed[h.observed.length - 1], next); // new viewport observed
    });

    test('a resize never sends a host command', () => {
        const h = harness();
        h.bv.bvObserveViewport();
        h.bv.BV.view.mode = 'fit';
        h.bv.posted.length = 0;
        h.fireResize();
        assert.equal(h.bv.posted.length, 0);
    });

    test('manual zoom is not reset to Fit by an ordinary resize', () => {
        const h = harness();
        h.bv.bvObserveViewport();
        h.bv.BV.view.mode = 'manual';
        h.bv.BV.view.scale = 3;
        h.fireResize();
        assert.equal(h.bv.BV.view.scale, 3); // untouched
        assert.equal(h.bv.BV.view.mode, 'manual');
    });
});

describe('Battle View roster rows', () => {
    test('a living ally row carries HP, action and target readouts', () => {
        const bv = loadBattleView();
        const model = bv.bvRosterRowModel(
            { id: 'ally_1', team: 0, hp: 42.6, maxHp: 100, dead: false, action: '攻撃', targetId: 'enemy_3' },
            true,
        );
        assert.equal(model.shortId, '1');
        assert.equal(model.displayHp, 43); // display-rounded
        assert.equal(model.hpPercent, 43);
        assert.equal(model.selected, true);
        assert.equal(model.action, '攻撃');
        assert.equal(model.targetShort, '3');
    });

    test('a dead row shows no action or target', () => {
        const bv = loadBattleView();
        const model = bv.bvRosterRowModel(
            { id: 'ally_2', team: 0, hp: 0, maxHp: 100, dead: true, action: '攻撃', targetId: 'enemy_1' },
            false,
        );
        assert.equal(model.dead, true);
        assert.equal(model.displayHp, 0);
        assert.equal(model.action, '');
        assert.equal(model.targetShort, '');
    });
});

describe('Battle View target lines', () => {
    const bounds = { minX: 20, maxX: 220, minY: 10, maxY: 160 };
    const alive = (id: string, team: 0 | 1, x: number, y: number, targetId: string | null = null, targetTick: number | null = null) =>
        ({ id, team, x, y, dead: false, targetId, targetTick });

    test('a fresh engagement draws a world-space line to the target', () => {
        const bv = loadBattleView();
        const attacker = alive('ally_1', 0, 60, 40, 'enemy_1', 95);
        const target = alive('enemy_1', 1, 180, 120);
        const line = bv.bvTargetLineModel(attacker, { ally_1: attacker, enemy_1: target }, bounds, 100);
        // Field-by-field: vm-context objects fail deepEqual on prototype identity.
        assert.equal(line.x1, 40);
        assert.equal(line.y1, 30);
        assert.equal(line.x2, 160);
        assert.equal(line.y2, 110);
        assert.equal(line.team, 0);
        assert.equal(line.stale, false);
    });

    test('an old sighting fades, and a very old one disappears', () => {
        const bv = loadBattleView();
        const attacker = alive('ally_1', 0, 60, 40, 'enemy_1', 0);
        const target = alive('enemy_1', 1, 180, 120);
        const units = { ally_1: attacker, enemy_1: target };
        assert.equal(bv.bvTargetLineModel(attacker, units, bounds, 91).stale, true);
        assert.equal(bv.bvTargetLineModel(attacker, units, bounds, 301), null);
    });

    test('no line for dead attackers, dead targets, or missing targets', () => {
        const bv = loadBattleView();
        const target = alive('enemy_1', 1, 180, 120);
        const deadAttacker = { ...alive('ally_1', 0, 60, 40, 'enemy_1', 95), dead: true };
        assert.equal(bv.bvTargetLineModel(deadAttacker, { enemy_1: target }, bounds, 100), null);
        const attacker = alive('ally_1', 0, 60, 40, 'enemy_1', 95);
        const deadTarget = { ...target, dead: true };
        assert.equal(bv.bvTargetLineModel(attacker, { ally_1: attacker, enemy_1: deadTarget }, bounds, 100), null);
        assert.equal(bv.bvTargetLineModel(attacker, { ally_1: attacker }, bounds, 100), null);
        assert.equal(bv.bvTargetLineModel(alive('ally_2', 0, 0, 0), {}, bounds, 100), null);
    });
});

describe('Battle View result rows', () => {
    test('stats are display-rounded and the top target is shortened', () => {
        const bv = loadBattleView();
        const model = bv.bvResultRowModel({
            id: 'ally_5', team: 0, dead: false,
            stats: { damageDealt: 184.66, damageTaken: 123.2, healingGiven: 196.4, kills: 2, topTargetId: 'enemy_2' },
        });
        assert.equal(model.damageDealt, 185);
        assert.equal(model.damageTaken, 123);
        assert.equal(model.healingGiven, 196);
        assert.equal(model.kills, 2);
        assert.equal(model.topTargetShort, '2');
    });

    test('missing stats degrade to zeros instead of NaN', () => {
        const bv = loadBattleView();
        const model = bv.bvResultRowModel({ id: 'enemy_1', team: 1, dead: true });
        assert.equal(model.damageDealt, 0);
        assert.equal(model.kills, 0);
        assert.equal(model.topTargetShort, '');
    });
});

describe('Battle View feed entries', () => {
    const roster = {
        ally_1: { id: 'ally_1', team: 0 },
        enemy_2: { id: 'enemy_2', team: 1 },
    };

    test('an attack line names both sides with roster-derived teams', () => {
        const bv = loadBattleView();
        const model = bv.bvFeedEntryModel(
            { tick: 12, kind: 'attack', sourceId: 'ally_1', targetId: 'enemy_2', amount: 17.6 },
            roster,
        );
        assert.equal(model.sourceShort, '1');
        assert.equal(model.sourceTeam, 0);
        assert.equal(model.targetShort, '2');
        assert.equal(model.targetTeam, 1);
        assert.equal(model.amountText, '−18');
        assert.equal(model.lethal, false);
    });

    test('a dodged attack suppresses the amount, a lethal one is flagged', () => {
        const bv = loadBattleView();
        const dodged = bv.bvFeedEntryModel(
            { tick: 3, kind: 'attack', sourceId: 'ally_1', targetId: 'enemy_2', amount: 0, dodged: true }, roster);
        assert.equal(dodged.dodged, true);
        assert.equal(dodged.amountText, '');
        const lethal = bv.bvFeedEntryModel(
            { tick: 9, kind: 'attack', sourceId: 'ally_1', targetId: 'enemy_2', amount: 30, lethal: true }, roster);
        assert.equal(lethal.lethal, true);
    });

    test('heals read as positive amounts, deaths have no source', () => {
        const bv = loadBattleView();
        const heal = bv.bvFeedEntryModel(
            { tick: 5, kind: 'heal', sourceId: 'ally_1', targetId: 'ally_1', amount: 23.5 }, roster);
        assert.equal(heal.amountText, '+24');
        const death = bv.bvFeedEntryModel({ tick: 6, kind: 'death', targetId: 'enemy_2' }, roster);
        assert.equal(death.sourceShort, '');
        assert.equal(death.targetTeam, 1);
    });

    test('units already gone from the roster fall back to id-prefix teams', () => {
        const bv = loadBattleView();
        const model = bv.bvFeedEntryModel(
            { tick: 30, kind: 'death', targetId: 'enemy_9' }, roster);
        assert.equal(model.targetTeam, 1);
    });
});

describe('Battle View feed diffing for effects', () => {
    const entry = (tick: number, extra: Record<string, unknown> = {}) =>
        ({ tick, kind: 'attack', sourceId: 'a', targetId: 'b', amount: 5, ...extra });

    // vm-realm arrays fail deepStrictEqual on prototype identity, so results
    // are re-materialized host-side via Array.from before comparison.
    const ticks = (list: any[]) => Array.from(list, (e: any) => e.tick);

    test('appended entries are detected as new', () => {
        const bv = loadBattleView();
        const prev = [entry(1), entry(2)];
        const next = [entry(1), entry(2), entry(3), entry(4)];
        assert.deepEqual(ticks(bv.bvNewFeedEntries(prev, next)), [3, 4]);
    });

    test('a capped (shifted) feed still yields only the tail after the old last entry', () => {
        const bv = loadBattleView();
        const prev = [entry(10), entry(11), entry(12)];
        const next = [entry(11), entry(12), entry(13)]; // 10 fell off the cap
        assert.deepEqual(ticks(bv.bvNewFeedEntries(prev, next)), [13]);
    });

    test('an unrelated feed (restart) counts everything as new', () => {
        const bv = loadBattleView();
        assert.deepEqual(ticks(bv.bvNewFeedEntries([entry(500)], [entry(1), entry(2)])), [1, 2]);
    });

    test('an empty previous list treats the whole feed as new', () => {
        const bv = loadBattleView();
        assert.deepEqual(ticks(bv.bvNewFeedEntries([], [entry(1)])), [1]);
        assert.deepEqual(ticks(bv.bvNewFeedEntries(null, [entry(1)])), [1]);
    });

    test('identical snapshots produce no new entries', () => {
        const bv = loadBattleView();
        const list = [entry(1), entry(2)];
        assert.equal(bv.bvNewFeedEntries(list, list).length, 0);
    });
});

describe('Battle View attack style classification', () => {
    test('delivery shape and tags win over range', () => {
        const bv = loadBattleView();
        const style = bv.bvAttackStyleForUnit({
            attackRange: 48, attackDeliveryShape: 'cone', attackTags: ['magical'],
        });
        assert.equal(style.kind, 'projectile'); // non-single-target is never a melee lunge
        assert.equal(style.vector, 'magical');
    });

    test('a short-range single-target attack reads as melee', () => {
        const bv = loadBattleView();
        const style = bv.bvAttackStyleForUnit({
            attackRange: 48, attackDeliveryShape: 'single_target', attackTags: ['physical'],
        });
        assert.equal(style.kind, 'melee');
        assert.equal(style.vector, 'physical');
    });

    test('the weapon\'s own delivery range outranks the engagement radius', () => {
        const bv = loadBattleView();
        // basic_slash: a 48-reach sword on a unit with a 120 engagement radius is still melee.
        const sword = bv.bvAttackStyleForUnit({
            attackRange: 120, attackDeliveryRange: 48, attackDeliveryShape: 'single_target', attackTags: ['physical'],
        });
        assert.equal(sword.kind, 'melee');
        const bow = bv.bvAttackStyleForUnit({
            attackRange: 120, attackDeliveryRange: 220, attackDeliveryShape: 'single_target', attackTags: ['biological'],
        });
        assert.equal(bow.kind, 'projectile');
        assert.equal(bow.vector, 'biological');
    });

    test('without ability data the engagement range decides, defaulting to physical', () => {
        const bv = loadBattleView();
        assert.equal(bv.bvAttackStyleForUnit({ attackRange: 60 }).kind, 'melee');
        assert.equal(bv.bvAttackStyleForUnit({ attackRange: 200 }).kind, 'projectile');
        assert.equal(bv.bvAttackStyleForUnit({ attackRange: 200 }).vector, 'physical');
    });

    test('non-vector tags (support, mobility) fall back to physical', () => {
        const bv = loadBattleView();
        const style = bv.bvAttackStyleForUnit({
            attackRange: 95, attackDeliveryShape: 'single_target', attackTags: ['support'],
        });
        assert.equal(style.vector, 'physical');
    });
});

describe('Battle View unit status strip', () => {
    test('shows up to three icons with an overflow count and a duration title', () => {
        const bv = loadBattleView();
        const model = bv.bvUnitStatusesModel({
            statuses: [
                { id: 'poison', remainingSeconds: 4.2, intensity: 1 },
                { id: 'burn', remainingSeconds: 2.9, intensity: 1 },
                { id: 'stun', remainingSeconds: 0.8, intensity: 1 },
                { id: 'slow', remainingSeconds: 5, intensity: 1 },
                { id: 'fear', remainingSeconds: 1, intensity: 1 },
            ],
        });
        assert.equal(model.shown.length, 3);
        assert.equal(model.shown[0].icon, '☠');
        assert.equal(model.overflow, 2);
        assert.ok(model.title.includes('poison 5s')); // ceil(4.2)
        assert.ok(model.title.includes('burn 3s'));
    });

    test('regen is flagged beneficial; unknown ids get the fallback glyph', () => {
        const bv = loadBattleView();
        const model = bv.bvUnitStatusesModel({
            statuses: [
                { id: 'regen', remainingSeconds: 3, intensity: 1 },
                { id: 'custom_curse', remainingSeconds: 9, intensity: 1 },
            ],
        });
        assert.equal(model.shown[0].beneficial, true);
        assert.equal(model.shown[1].icon, '◈');
        assert.equal(model.overflow, 0);
    });

    test('a unit without statuses renders nothing', () => {
        const bv = loadBattleView();
        const model = bv.bvUnitStatusesModel({ statuses: [] });
        assert.equal(model.shown.length, 0);
        assert.equal(model.overflow, 0);
        assert.equal(model.title, '');
    });
});

describe('Battle View status feed entries', () => {
    test('a status entry carries id and action with no amount text', () => {
        const bv = loadBattleView();
        const model = bv.bvFeedEntryModel(
            { tick: 7, kind: 'status', sourceId: 'ally_1', targetId: 'enemy_2', statusId: 'poison', statusAction: 'applied' },
            { ally_1: { id: 'ally_1', team: 0 }, enemy_2: { id: 'enemy_2', team: 1 } },
        );
        assert.equal(model.kind, 'status');
        assert.equal(model.statusId, 'poison');
        assert.equal(model.statusAction, 'applied');
        assert.equal(model.amountText, '');
        assert.equal(model.targetTeam, 1);
    });
});

describe('Battle View outcome banner state', () => {
    test('a new outcome clears a previous battle dismissal', () => {
        const bv = loadBattleView();
        bv.BV.selected = 'sc';
        bv.BV.activeStartId = 's1';
        bv.BV.playtest = { scenarioId: 'sc', startId: 's1', tick: 5, outcome: '', units: [], recentEvents: [], feedback: [] };
        bv.BV.outcomeDismissed = true; // left over from an earlier battle
        bv.bvOnMessage({
            data: {
                type: 'combatCommandPlaytestState',
                state: { scenarioId: 'sc', startId: 's1', tick: 6, outcome: 'Victory', units: [], recentEvents: [], feedback: [] },
            },
        });
        assert.equal(bv.BV.outcomeDismissed, false);
        assert.equal(bv.BV.playtest.outcome, 'Victory');
    });

    test('a dismissal survives later snapshots of the same decided battle', () => {
        const bv = loadBattleView();
        bv.BV.selected = 'sc';
        bv.BV.activeStartId = 's1';
        bv.BV.playtest = { scenarioId: 'sc', startId: 's1', tick: 6, outcome: 'Victory', units: [], recentEvents: [], feedback: [] };
        bv.BV.outcomeDismissed = true;
        bv.bvOnMessage({
            data: {
                type: 'combatCommandPlaytestState',
                state: { scenarioId: 'sc', startId: 's1', tick: 6, outcome: 'Victory', units: [], recentEvents: [], feedback: [] },
            },
        });
        assert.equal(bv.BV.outcomeDismissed, true);
    });
});
