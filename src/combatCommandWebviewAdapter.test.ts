import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, test } from 'node:test';

type PointerHelper = (
    ui: { selection: string[]; pendingOrder: string | null },
    target: { id: string; team: number; dead?: boolean } | null,
    point: { x: number; y: number },
) => Record<string, unknown> | null;

function loadPointerHelper(): PointerHelper {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const context: Record<string, unknown> = {
        window: { addEventListener() { /* registration only */ } },
        document: { addEventListener() { /* registration only */ } },
        navigator: {},
        vscode: { postMessage() { /* registration only */ } },
        setInterval() { return 1; },
        clearInterval() { /* no-op */ },
    };
    vm.runInNewContext(`${source}\nglobalThis.__combatHooks = { combatCommandMessageForPointer };`, context);
    return (context.__combatHooks as { combatCommandMessageForPointer: PointerHelper }).combatCommandMessageForPointer;
}

function transportValue(value: Record<string, unknown> | null): Record<string, unknown> | null {
    return value === null ? null : JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('Combat Lab command pointer translation', () => {
    const translate = loadPointerHelper();

    test('ground right-click translates to move_to for the current selection', () => {
        const message = translate({ selection: ['ally_2', 'ally_1'], pendingOrder: null }, null, { x: 12.5, y: -8 });
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_2', 'ally_1'], command: 'move_to', point: { x: 12.5, y: -8 },
        });
    });

    test('enemy right-click translates to attack_target', () => {
        const message = translate(
            { selection: ['ally_1'], pendingOrder: null },
            { id: 'enemy_3', team: 1 },
            { x: 80, y: 24 },
        );
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_1'], command: 'attack_target', targetId: 'enemy_3',
        });
    });

    test('pending attack-move plus a ground target translates to attack_move', () => {
        const message = translate(
            { selection: ['ally_3', 'ally_1'], pendingOrder: 'attack_move' },
            null,
            { x: 100, y: 50 },
        );
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_3', 'ally_1'], command: 'attack_move', point: { x: 100, y: 50 },
        });
    });
});
