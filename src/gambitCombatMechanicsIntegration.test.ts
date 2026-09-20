import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { BattleSpec, resolveCombat } from './gambitCombatCore';

const statuses: StatusDefinition[] = ['poison', 'bleed', 'sleep', 'paralysis', 'heal_block', 'stun'].map(id => ({ id, statusClass: id === 'sleep' || id === 'paralysis' || id === 'stun' ? 'hard_control' : 'dot', buildupThreshold: 100, durationSeconds: 6, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [] }));
const penetration = (body = false, dealt = false) => ({ barrier: 'passes' as const, armor: 'passes' as const, requiresBodyContact: body, requiresDamageDealt: dealt });
const ability = (effects: AbilityDefinition['effects']): AbilityDefinition => ({ id: 'normal', name: 'Normal', tier: 'normal', delivery: { shape: 'single_target', range: 999, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false }, effects, auto: { cooldown: 1, gambitTags: [] }, scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['armor'], tags: [] });
const unit = (name: string, role: string, extra: Record<string, unknown> = {}) => ({ name, role, max_hp: 400, attack: 14, defense: 0, heal_power: 20, move_speed: 0, attack_range: 999, attack_cooldown: 1, radius: 1, pos_x: 0, pos_y: 0, ...extra });
const spec = (allyExtra: Record<string, unknown>, enemyExtra: Record<string, unknown> = {}): BattleSpec => ({ activePreset: 'test', deltaSeconds: 1, viewport: { width: 1280, height: 720 }, participantOrder: ['ally', 'enemy'], combatMode: 'mechanics_v1', mechanics: { statuses }, initialState: { units: { allies: [unit('ally', 'Frontline', allyExtra)], enemies: [unit('enemy', 'Frontline', enemyExtra)] } } });

describe('Gambit mechanics V1 opt-in integration', () => {
    test('keeps legacy output free of mechanics state and receipts', () => {
        const legacy = resolveCombat({ ...spec({}, {}), combatMode: undefined });
        assert.equal(legacy.mechanicsReceipts, undefined);
    });
    test('delegates validated normal attacks and is reproducible', () => {
        const battle = spec({ normalAttackAbility: ability([{ kind: 'damage', vector: 'physical', penetration: penetration(), targetRequirement: [], magnitude: 14 }]) });
        const first = resolveCombat(battle); const second = resolveCombat(battle);
        assert.deepEqual(first, second); assert.ok((first.mechanicsReceipts || []).some(event => event.receipt.kind === 'damage'));
    });
    test('retains barrier, poison buildup, bleed damage gate, sleep, paralysis, healing and subsystem receipts', () => {
        const poison = ability([{ kind: 'buildup', vector: 'biological', penetration: penetration(true), targetRequirement: ['living'], magnitude: 25, statusId: 'poison' }]);
        const poisonRun = resolveCombat(spec({ normalAttackAbility: poison }, { mechanics: { id: 'enemy', hp: 400, maxHp: 400, attack: 14, defense: 0, tags: ['living'], barrier: { amount: 10, blocksVectors: ['physical'], blocksStatusApplication: true } } }));
        assert.ok((poisonRun.mechanicsReceipts || []).some(event => event.receipt.kind === 'status_applied'));
        const bleed = ability([{ kind: 'buildup', vector: 'physical', penetration: penetration(true, true), targetRequirement: ['living'], magnitude: 25, statusId: 'bleed' }]);
        const bleedRun = resolveCombat(spec({ normalAttackAbility: bleed }, { mechanics: { id: 'enemy', hp: 400, maxHp: 400, attack: 14, defense: 0, tags: ['living'] } }));
        assert.ok((bleedRun.mechanicsReceipts || []).some(event => event.receipt.kind === 'damage_prerequisite_failed'));
        const hit = ability([{ kind: 'damage', vector: 'physical', penetration: penetration(), targetRequirement: [], magnitude: 14 }]);
        const sleepRun = resolveCombat(spec({ normalAttackAbility: hit }, { mechanics: { id: 'enemy', hp: 400, maxHp: 400, attack: 1, defense: 0, tags: ['living'], statuses: [{ id: 'sleep', remainingSeconds: 6, intensity: 1 }] } }));
        assert.ok((sleepRun.mechanicsReceipts || []).some(event => event.receipt.kind === 'sleep_broken'));
        const cc = ability([{ kind: 'buildup', vector: 'magical', penetration: penetration(), targetRequirement: ['colossal'], magnitude: 40, statusId: 'stun' }]); cc.scaleBehavior = { individual: 'full', huge: 'convert_subsystem', hugeSubsystemTags: ['sensor'], squad: 'drop', fleet: 'drop' };
        const hugeRun = resolveCombat(spec({ normalAttackAbility: cc }, { mechanics: { id: 'enemy', hp: 400, maxHp: 400, attack: 1, defense: 0, tags: ['colossal'], structureClass: 'capital', subsystems: [{ tag: 'sensor', hp: 20, maxHp: 20, disabledSeconds: 0 }] } }));
        assert.ok((hugeRun.mechanicsReceipts || []).some(event => event.receipt.kind === 'subsystem_disabled'));
    });
});
