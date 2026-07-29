import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { AbilityFixtureDocument } from './combatAbilityTypes';
import { CombatLabDocument, compareCombatLabRuns, emptyCombatLabDocument, exportCombatLabDocument, importCombatLabDocument, initialCombatLabScenarios, refreshBuiltInCombatLabScenarios, runCombatLab, swapCombatLabSides } from './combatLabCore';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/combat-abilities/v1-reference-abilities.json'), 'utf8')) as AbilityFixtureDocument;
const catalog = { abilities: fixture.abilities, statuses: fixture.statuses };
test('Combat Lab scenarios are reproducible, runnable, and preserve legacy isolation', () => { const scenarios = initialCombatLabScenarios(); assert.equal(scenarios.length, 11); const legacy = runCombatLab({ ...scenarios[0], mode: 'legacy_gambit' }, catalog); const mechanics = runCombatLab(scenarios[0], catalog); assert.equal(legacy.output.mechanicsReceipts, undefined); assert.equal(mechanics.deterministic, true); assert.equal(initialCombatLabScenarios().every(scenario => runCombatLab(scenario, catalog).deterministic), true); });

test('Combat Lab multi-unit scenarios never stack two units on the same spawn coordinate', () => {
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    for (const scenario of initialCombatLabScenarios()) {
        const units = [...scenario.allies, ...scenario.enemies];
        const seen = new Map<string, string>();
        for (const u of units) {
            const k = key(u.position);
            const prior = seen.get(k);
            assert.equal(
                prior,
                undefined,
                `${scenario.id}: unit ${u.id} stacks on ${k} with ${prior}`,
            );
            seen.set(k, u.id);
        }
    }
    // Human-play regression: evasion_ace used bare unit() for five mobs at (50,0).
    const evasion = initialCombatLabScenarios().find(s => s.id === 'evasion_ace')!;
    assert.equal(evasion.enemies.length, 5);
    const ys = evasion.enemies.map(e => e.position.y).sort((a, b) => a - b);
    assert.deepEqual(ys, [0, 24, 48, 72, 96]);
    // Keep legacy engagement gap (±50), not ±80.
    assert.ok(evasion.enemies.every(e => e.position.x === 50));
    assert.equal(evasion.allies[0].position.x, -50);
});

test('refreshBuiltInCombatLabScenarios replaces stacked saved built-ins and keeps custom ids', () => {
    const stacked = {
        schemaVersion: 'combat-lab-v1' as const,
        selectedScenarioId: 'evasion_ace',
        scenarios: [
            {
                id: 'evasion_ace',
                name: 'Evasion ace vs many',
                mode: 'mechanics_v1' as const,
                deltaSeconds: 1 / 30,
                allies: [{ id: 'ace', name: 'ace', role: 'Frontline' as const, team: 'allies' as const, hp: 220, maxHp: 220, attack: 15, defense: 5, armor: 0, moveSpeed: 150, attackRange: 120, cooldown: 1, accuracy: 0, evasion: 25, resistances: {}, targetTags: ['living'], subsystemTags: [], normalAttackAbilityId: 'basic_slash', statuses: [], buildup: {}, healBlocked: false, position: { x: -50, y: 0 } }],
                enemies: Array.from({ length: 5 }, (_, i) => ({
                    id: `mob_${i}`, name: `mob ${i}`, role: 'Frontline' as const, team: 'enemies' as const,
                    hp: 100, maxHp: 100, attack: 15, defense: 5, armor: 0, moveSpeed: 150, attackRange: 120, cooldown: 1,
                    accuracy: 0, evasion: 0, resistances: {}, targetTags: ['living'], subsystemTags: [],
                    normalAttackAbilityId: 'basic_slash', statuses: [], buildup: {}, healBlocked: false,
                    position: { x: 50, y: 0 },
                })),
            },
            {
                id: 'user_custom_skirmish',
                name: 'User custom',
                mode: 'mechanics_v1' as const,
                deltaSeconds: 1 / 30,
                allies: [{ id: 'a', name: 'a', role: 'Frontline' as const, team: 'allies' as const, hp: 100, maxHp: 100, attack: 15, defense: 5, armor: 0, moveSpeed: 150, attackRange: 120, cooldown: 1, accuracy: 0, evasion: 0, resistances: {}, targetTags: ['living'], subsystemTags: [], normalAttackAbilityId: 'basic_slash', statuses: [], buildup: {}, healBlocked: false, position: { x: -50, y: 0 } }],
                enemies: [{ id: 'e', name: 'e', role: 'Frontline' as const, team: 'enemies' as const, hp: 100, maxHp: 100, attack: 15, defense: 5, armor: 0, moveSpeed: 150, attackRange: 120, cooldown: 1, accuracy: 0, evasion: 0, resistances: {}, targetTags: ['living'], subsystemTags: [], normalAttackAbilityId: 'basic_slash', statuses: [], buildup: {}, healBlocked: false, position: { x: 50, y: 0 } }],
            },
        ],
    };
    const next = refreshBuiltInCombatLabScenarios(stacked as unknown as CombatLabDocument);
    const evasion = next.scenarios.find(s => s.id === 'evasion_ace')!;
    const keys = new Set(evasion.enemies.map(e => `${e.position.x},${e.position.y}`));
    assert.equal(keys.size, 5);
    assert.ok(next.scenarios.some(s => s.id === 'user_custom_skirmish'));
    assert.equal(next.selectedScenarioId, 'evasion_ace');
});

test('Mixed Arms & Status Showcase exercises melee, both projectile flavors, AoE-DoT, healing, and a status crossing its buildup threshold', () => {
    const scenario = initialCombatLabScenarios().find(s => s.id === 'mixed_arms_showcase')!;
    const run = runCombatLab(scenario, catalog);
    assert.equal(run.deterministic, true);

    // Every ally archetype actually swung at least once — a scenario that never
    // gets a ranged/AoE unit into range would defeat the point of this fixture.
    const attacksBy = (unitName: string) => run.output.attacks.filter(event => event.unit === unitName);
    assert.ok(attacksBy('vanguard').length > 0, 'melee (basic_slash) never attacked');
    assert.ok(attacksBy('ranger').length > 0, 'physical projectile DoT (poison_arrow) never attacked');
    assert.ok(attacksBy('gunner').length > 0, 'anti-armor projectile (ap_round) never attacked');
    assert.ok(attacksBy('mage').length > 0, 'AoE magic DoT (ignite) never attacked');

    // sentinel (0 evasion, 500 HP; `attack` is not overridden since mechanics_v1
    // ability damage ignores it entirely — see the scenario comment in
    // combatLabCore.ts) exists specifically so poison and/or burn reliably cross
    // their buildupThreshold before the fight ends.
    assert.ok(run.summary.statusApplications > 0, 'no status crossed its buildup threshold — rebalance sentinel or the DoT sources');
    const sentinelStatuses = run.output.mechanicsReceipts?.filter(
        event => event.target === 'sentinel' && event.receipt.kind === 'status_applied',
    ) ?? [];
    assert.ok(sentinelStatuses.length > 0, 'sentinel never visibly gained a status — Battle View has nothing to show for this fixture');

    // The medic's heal_lowest_hp_ally gambit should fire in a real 5v5 fight.
    assert.ok(run.output.heals.some(event => event.unit === 'medic' || event.source === 'medic'), 'medic never healed');

    // dodger (50 evasion, paired with gunner's single-target lock-on so it
    // actually gets hit) exists so a dodge is observable; not asserted as a
    // hard requirement since which unit reaches it first is not pinned down,
    // but the run must at least record some dodge somewhere in a 5v5 fight.
    assert.ok(run.summary.dodges > 0, 'no dodge occurred anywhere in the fight');
});
test('Combat Lab documents round-trip, safely recover, swap sides, and compare', () => { const scenario = initialCombatLabScenarios()[0]; const document = { ...emptyCombatLabDocument(), scenarios: [scenario] }; assert.equal(exportCombatLabDocument(importCombatLabDocument(exportCombatLabDocument(document), emptyCombatLabDocument()).document), exportCombatLabDocument(document)); assert.equal(importCombatLabDocument('{', document).document.scenarios.length, 1); const left = runCombatLab(scenario, catalog); const right = runCombatLab(swapCombatLabSides(scenario), catalog); assert.ok(Array.isArray(compareCombatLabRuns(left, right).changedInputs)); });
test('Combat Lab accepts a validated custom Ability without mutating any external state', () => { const custom = structuredClone(fixture.abilities.find(ability => ability.id === 'basic_slash')!); custom.id = 'custom_lab_slash'; const scenario = structuredClone(initialCombatLabScenarios()[0]); scenario.allies[0].normalAttackAbilityId = custom.id; const before = JSON.stringify(scenario); const run = runCombatLab(scenario, { abilities: [...fixture.abilities, custom], statuses: fixture.statuses }); assert.ok(run.output.attacks.length > 0); assert.equal(JSON.stringify(scenario), before); });
