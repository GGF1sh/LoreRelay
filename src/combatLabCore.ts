import { AbilityDefinition, StatusDefinition, SubsystemTag, TargetTag, Vector } from './combatAbilityTypes';
import { CombatMode, CombatExpectedOutput, resolveCombat } from './gambitCombatCore';
import { CombatantRank, CombatantSize, MechanicsCombatant, MechanicsReceipt, StatusInstance } from './combatMechanicsResolver';

export type CombatLabTeam = 'allies' | 'enemies';
export type BarrierType = 'kinetic' | 'energy' | 'arcane' | 'vital' | 'universal';

export interface CombatLabUnit {
    id: string; name: string; role: string; team: CombatLabTeam;
    hp: number; maxHp: number; attack: number; defense: number; armor: number;
    moveSpeed: number; attackRange: number; cooldown: number; accuracy: number; evasion: number;
    resistances: Partial<Record<Vector | string, number>>; barrier?: { amount: number; type: BarrierType };
    targetTags: TargetTag[]; subsystemTags: SubsystemTag[]; normalAttackAbilityId?: string; healAbilityId?: string; supportAbilityId?: string;
    statuses: StatusInstance[]; buildup: MechanicsCombatant['buildup']; healBlocked: boolean; position: { x: number; y: number };
    /** Drives the lethal-timer execution threshold. Defaults to `normal` when omitted. */
    rank?: CombatantRank;
    /** Physical bulk, driving engagement slots. Defaults to `medium` when omitted. */
    sizeClass?: CombatantSize;
}

export interface CombatLabScenario {
    id: string; name: string; mode: CombatMode; deltaSeconds: number;
    allies: CombatLabUnit[]; enemies: CombatLabUnit[];
}
export interface CombatLabDocument { schemaVersion: 'combat-lab-v1'; scenarios: CombatLabScenario[]; selectedScenarioId?: string; savedRuns?: Record<string, CombatLabRun>; }
export interface CombatLabCatalog { abilities: readonly AbilityDefinition[]; statuses: readonly StatusDefinition[]; }
export interface CombatLabUnitSummary { id: string; name: string; team: CombatLabTeam; hp: number; maxHp: number; damage: number; healing: number; attacks: number; }
export interface CombatLabSummary {
    outcome: string; ticks: number; durationSeconds: number; survivors: CombatLabUnitSummary[];
    totalDamage: number; totalHealing: number; barrierAbsorbed: number; dodges: number; armorMitigations: number;
    statusApplications: number; cleanses: number; subsystemDamage: number; deaths: number;
}
export interface CombatLabRun { scenario: CombatLabScenario; output: CombatExpectedOutput; summary: CombatLabSummary; timeline: string[]; deterministic: boolean; }
export interface CombatLabComparison { winnerChanged: boolean; durationDelta: number; survivorHpDelta: number; damageDelta: number; healingDelta: number; dodgeDelta: number; barrierAbsorbedDelta: number; statusApplicationDelta: number; abilityUseDelta: number; changedInputs: string[]; }
export interface CombatLabPlayback { cursor: number; speed: 1 | 2 | 4; paused: boolean; run: CombatLabRun; }

const clone = <T>(value: T): T => structuredClone(value);
const barrierVectors = (type: BarrierType): Vector[] => type === 'kinetic' ? ['physical'] : type === 'energy' ? ['magical', 'technological'] : type === 'vital' ? ['biological'] : type === 'arcane' ? ['magical', 'mental'] : ['physical', 'magical', 'technological', 'mental', 'biological'];
const numeric = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function emptyCombatLabDocument(): CombatLabDocument { return { schemaVersion: 'combat-lab-v1', scenarios: [] }; }
export function normalizeCombatLabDocument(value: unknown, existing: CombatLabDocument = emptyCombatLabDocument()): { document: CombatLabDocument; error?: string } {
    if (!value || typeof value !== 'object') return { document: existing, error: 'INVALID_COMBAT_LAB_DOCUMENT' };
    const raw = value as Partial<CombatLabDocument>;
    if (raw.schemaVersion !== 'combat-lab-v1' || !Array.isArray(raw.scenarios) || raw.scenarios.some(scenario => !isValidScenario(scenario))) return { document: existing, error: 'INVALID_COMBAT_LAB_DOCUMENT' };
    return { document: { schemaVersion: 'combat-lab-v1', scenarios: clone(raw.scenarios), selectedScenarioId: typeof raw.selectedScenarioId === 'string' ? raw.selectedScenarioId : undefined, savedRuns: raw.savedRuns && typeof raw.savedRuns === 'object' ? clone(raw.savedRuns) : undefined } };
}
export function importCombatLabDocument(json: string, existing: CombatLabDocument): { document: CombatLabDocument; error?: string } { try { return normalizeCombatLabDocument(JSON.parse(json), existing); } catch { return { document: existing, error: 'INVALID_JSON' }; } }
export function exportCombatLabDocument(document: CombatLabDocument): string { return JSON.stringify(document, null, 2); }
export function isValidScenario(value: unknown): value is CombatLabScenario {
    if (!value || typeof value !== 'object') return false;
    const scenario = value as Partial<CombatLabScenario>;
    return typeof scenario.id === 'string' && typeof scenario.name === 'string' && (scenario.mode === 'legacy_gambit' || scenario.mode === 'mechanics_v1') && numeric(scenario.deltaSeconds) > 0 && Array.isArray(scenario.allies) && Array.isArray(scenario.enemies) && scenario.allies.length <= 10 && scenario.enemies.length <= 10 && scenario.allies.every(unit => isValidUnit(unit, 'allies')) && scenario.enemies.every(unit => isValidUnit(unit, 'enemies'));
}
function isFiniteCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isValidUnitPosition(value: unknown): value is { x: number; y: number } {
    if (!value || typeof value !== 'object') return false;
    const position = value as { x?: unknown; y?: unknown };
    return isFiniteCoordinate(position.x) && isFiniteCoordinate(position.y);
}

function isValidUnit(value: unknown, team: CombatLabTeam): value is CombatLabUnit {
    const unit = value as Partial<CombatLabUnit>;
    return !!unit
        && typeof unit.id === 'string'
        && typeof unit.name === 'string'
        && unit.team === team
        && numeric(unit.hp) >= 0
        && numeric(unit.maxHp) > 0
        && numeric(unit.attack) >= 0
        && numeric(unit.defense) >= 0
        && numeric(unit.cooldown) > 0
        && isValidUnitPosition(unit.position);
}

function mechanicsFor(unit: CombatLabUnit): MechanicsCombatant {
    return {
        id: unit.id, hp: unit.hp, maxHp: unit.maxHp, attack: unit.attack, defense: unit.defense + unit.armor,
        rank: unit.rank, sizeClass: unit.sizeClass, accuracy: unit.accuracy, evasion: unit.evasion, tags: clone(unit.targetTags), resistances: clone(unit.resistances),
        barrier: unit.barrier ? { amount: unit.barrier.amount, blocksVectors: barrierVectors(unit.barrier.type), blocksStatusApplication: true } : undefined,
        statuses: [...clone(unit.statuses), ...(unit.healBlocked ? [{ id: 'heal_block', remainingSeconds: 3600, intensity: 1 }] : [])],
        buildup: clone(unit.buildup || {}), subsystems: unit.subsystemTags.map(tag => ({ tag, hp: 100, maxHp: 100, disabledSeconds: 0 })),
    };
}

export function battleSpecForCombatLab(scenario: CombatLabScenario, catalog: CombatLabCatalog) {
    if (!isValidScenario(scenario)) throw new Error('INVALID_COMBAT_LAB_SCENARIO');
    const ids = [...scenario.allies, ...scenario.enemies].map(unit => unit.id);
    if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_COMBAT_LAB_UNIT_ID');
    const abilities = new Map(catalog.abilities.map(ability => [ability.id, ability]));
    const convert = (unit: CombatLabUnit) => {
        const result: Record<string, unknown> = { name: unit.id, role: unit.role, max_hp: unit.maxHp, hp: unit.hp, attack: unit.attack, defense: unit.defense + unit.armor, heal_power: unit.role === 'Medic' ? Math.max(1, Math.trunc(unit.attack / 2)) : 0, move_speed: unit.moveSpeed, attack_range: unit.attackRange, attack_cooldown: unit.cooldown, radius: 10, pos_x: unit.position.x, pos_y: unit.position.y };
        if (scenario.mode === 'mechanics_v1') { result.normalAttackAbility = abilities.get(unit.normalAttackAbilityId || ''); result.healAbility = abilities.get(unit.healAbilityId || ''); result.mechanics = mechanicsFor(unit); }
        return result;
    };
    const spec = { activePreset: scenario.id, deltaSeconds: scenario.deltaSeconds, viewport: { width: 1280, height: 720 }, participantOrder: ids, initialState: { units: { allies: scenario.allies.map(convert), enemies: scenario.enemies.map(convert) } } } as Parameters<typeof resolveCombat>[0];
    if (scenario.mode === 'mechanics_v1') { spec.combatMode = 'mechanics_v1'; spec.mechanics = { statuses: clone([...catalog.statuses]) }; }
    return spec;
}

function receiptMetrics(receipts: readonly (Record<string, unknown> & { receipt: MechanicsReceipt })[]) {
    return { barrierAbsorbed: receipts.filter(entry => entry.receipt.kind === 'barrier_absorbed').reduce((sum, entry) => sum + numeric(entry.receipt.amount), 0), dodges: receipts.filter(entry => entry.receipt.kind === 'dodged').length, armorMitigations: receipts.filter(entry => entry.receipt.kind === 'damage').length, statusApplications: receipts.filter(entry => entry.receipt.kind === 'status_applied').length, cleanses: receipts.filter(entry => entry.receipt.kind === 'cleansed').length, subsystemDamage: receipts.filter(entry => entry.receipt.kind === 'subsystem_disabled').length };
}
function timelineFor(output: CombatExpectedOutput): string[] {
    const events = [...output.attacks.map(event => ({ tick: event.tick, message: `${event.unit} dealt ${event.damage} to ${event.target}.` })), ...output.heals.map(event => ({ tick: event.tick, message: `${event.source || event.unit} restored ${event.amount} HP to ${event.unit}.` })), ...(output.mechanicsReceipts || []).map(event => ({ tick: event.tick, message: `${event.unit}: ${event.receipt.kind}${event.receipt.statusId ? ` (${event.receipt.statusId})` : ''}.` })), ...output.deaths.map(event => ({ tick: event.tick, message: `${event.unit} was defeated.` }))];
    return events.sort((a, b) => a.tick - b.tick || a.message.localeCompare(b.message)).map(event => `[${event.tick}] ${event.message}`);
}
export function runCombatLab(scenario: CombatLabScenario, catalog: CombatLabCatalog): CombatLabRun {
    const spec = battleSpecForCombatLab(scenario, catalog); const output = resolveCombat(spec); const again = resolveCombat(spec); const receipts = output.mechanicsReceipts || []; const metrics = receiptMetrics(receipts);
    const damage = output.attacks.reduce((sum, event) => sum + numeric(event.damage), 0); const healing = output.heals.reduce((sum, event) => sum + numeric(event.amount), 0); const ticks = Math.max(0, ...[...output.attacks, ...output.heals, ...output.deaths, ...output.decisions].map(event => numeric(event.tick)));
    const byId = new Map([...scenario.allies, ...scenario.enemies].map(unit => [unit.id, unit]));
    const summary: CombatLabSummary = { outcome: output.outcome, ticks, durationSeconds: ticks * scenario.deltaSeconds, totalDamage: damage, totalHealing: healing, deaths: output.deaths.length, ...metrics, survivors: output.finalState.units.filter(unit => unit.hp > 0).map(unit => ({ id: unit.name, name: byId.get(unit.name)?.name || unit.name, team: byId.get(unit.name)?.team || 'allies', hp: unit.hp, maxHp: byId.get(unit.name)?.maxHp || unit.hp, damage: output.attacks.filter(event => event.unit === unit.name).reduce((sum, event) => sum + numeric(event.damage), 0), healing: output.heals.filter(event => event.source === unit.name).reduce((sum, event) => sum + numeric(event.amount), 0), attacks: output.attacks.filter(event => event.unit === unit.name).length })) };
    return { scenario: clone(scenario), output, summary, timeline: timelineFor(output), deterministic: JSON.stringify(output) === JSON.stringify(again) };
}
function flatten(value: unknown, path = '$', output: string[] = []): string[] { if (value === null || typeof value !== 'object') { output.push(`${path}=${JSON.stringify(value)}`); return output; } if (Array.isArray(value)) { value.forEach((entry, index) => flatten(entry, `${path}[${index}]`, output)); return output; } Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, entry]) => flatten(entry, `${path}.${key}`, output)); return output; }
export function compareCombatLabRuns(left: CombatLabRun, right: CombatLabRun): CombatLabComparison {
    const hp = (run: CombatLabRun) => run.summary.survivors.reduce((sum, unit) => sum + unit.hp, 0); const changed = new Set(flatten(left.scenario)); const changedInputs = flatten(right.scenario).filter(value => !changed.has(value)).map(value => value.split('=')[0]);
    return { winnerChanged: left.summary.outcome !== right.summary.outcome, durationDelta: right.summary.durationSeconds - left.summary.durationSeconds, survivorHpDelta: hp(right) - hp(left), damageDelta: right.summary.totalDamage - left.summary.totalDamage, healingDelta: right.summary.totalHealing - left.summary.totalHealing, dodgeDelta: right.summary.dodges - left.summary.dodges, barrierAbsorbedDelta: right.summary.barrierAbsorbed - left.summary.barrierAbsorbed, statusApplicationDelta: right.summary.statusApplications - left.summary.statusApplications, abilityUseDelta: right.output.attacks.length - left.output.attacks.length, changedInputs };
}
export function swapCombatLabSides(scenario: CombatLabScenario): CombatLabScenario { const swap = (unit: CombatLabUnit, team: CombatLabTeam) => ({ ...clone(unit), team, position: { x: -unit.position.x, y: unit.position.y } }); return { ...clone(scenario), allies: scenario.enemies.map(unit => swap(unit, 'allies')), enemies: scenario.allies.map(unit => swap(unit, 'enemies')) }; }
export function createCombatLabPlayback(run: CombatLabRun): CombatLabPlayback { return { cursor: 0, speed: 1, paused: true, run }; }
export function advanceCombatLabPlayback(playback: CombatLabPlayback, ticks = 1): CombatLabPlayback { return { ...playback, cursor: Math.min(playback.run.timeline.length, playback.cursor + Math.max(0, Math.trunc(ticks * playback.speed))) }; }

function unit(id: string, team: CombatLabTeam, overrides: Partial<CombatLabUnit> = {}): CombatLabUnit { return { id, name: id.replaceAll('_', ' '), role: 'Frontline', team, hp: 100, maxHp: 100, attack: 15, defense: 5, armor: 0, moveSpeed: 150, attackRange: 120, cooldown: 1, accuracy: 0, evasion: 0, resistances: {}, targetTags: ['living'], subsystemTags: [], normalAttackAbilityId: 'basic_slash', statuses: [], buildup: {}, healBlocked: false, position: { x: team === 'allies' ? -50 : 50, y: 0 }, ...overrides }; }
const duel = (id: string, name: string, allies: CombatLabUnit[], enemies: CombatLabUnit[], mode: CombatMode = 'mechanics_v1'): CombatLabScenario => ({ id, name, mode, deltaSeconds: 1 / 30, allies, enemies });
export function initialCombatLabScenarios(): CombatLabScenario[] {
    const standardAllies = Array.from({ length: 5 }, (_, index) => unit(`ally_${index + 1}`, 'allies', { position: { x: -80, y: index * 24 }, role: index === 4 ? 'Medic' : 'Frontline', healAbilityId: index === 4 ? 'heal' : undefined }));
    const standardEnemies = Array.from({ length: 5 }, (_, index) => unit(`enemy_${index + 1}`, 'enemies', { position: { x: 80, y: index * 24 } }));
    return [
        duel('standard_5v5', 'Standard 5 vs 5', standardAllies, standardEnemies),
        duel('evasion_ace', 'Evasion ace vs many', [unit('ace', 'allies', { evasion: 25, hp: 220, maxHp: 220 })], Array.from({ length: 5 }, (_, i) => unit(`mob_${i}`, 'enemies'))),
        duel('armor_vs_normal', 'Heavy armor vs normal attacks', [unit('normal', 'allies')], [unit('heavy', 'enemies', { armor: 30, defense: 20 })]),
        duel('armor_vs_ap', 'Heavy armor vs armor-piercing attack', [unit('ap', 'allies', { normalAttackAbilityId: 'ap_round' })], [unit('heavy_ap', 'enemies', { armor: 30, defense: 20 })]),
        duel('barrier_vs_burst', 'Barrier vs burst', [unit('burst', 'allies', { normalAttackAbilityId: 'area_bombardment', attack: 30 })], [unit('barrier', 'enemies', { barrier: { amount: 100, type: 'kinetic' } })]),
        duel('barrier_vs_dot', 'Barrier vs penetrating DoT', [unit('dot', 'allies', { normalAttackAbilityId: 'ignite' })], [unit('barrier_dot', 'enemies', { barrier: { amount: 100, type: 'kinetic' } })]),
        duel('healing_vs_block', 'Healing squad vs heal block', [unit('medic', 'allies', { role: 'Medic', healAbilityId: 'heal', hp: 60 }), unit('guard', 'allies', { hp: 50 })], [unit('blocker', 'enemies', { attack: 20 })]),
        duel('sleep_break', 'Sleep and damage break', [unit('sleeper', 'allies', { statuses: [{ id: 'sleep', remainingSeconds: 5, intensity: 1 }] })], [unit('waker', 'enemies')]),
        duel('petrify_colossal', 'Petrify vs colossal target', [unit('petrifier', 'allies', { normalAttackAbilityId: 'petrify_ray' })], [unit('colossal', 'enemies', { targetTags: ['colossal', 'structure'], subsystemTags: ['locomotion', 'command'], hp: 500, maxHp: 500 })]),
        duel('infantry_vs_battleship', 'Infantry vs battleship-class target', Array.from({ length: 5 }, (_, i) => unit(`infantry_${i}`, 'allies')), [unit('battleship', 'enemies', { targetTags: ['colossal', 'vehicle'], subsystemTags: ['primary_weapon', 'power'], hp: 1000, maxHp: 1000, armor: 35, defense: 30 })]),
        // Every other scenario above is a single archetype (or a 1-vs-1 mechanic
        // probe). This one exists purely as a Battle View / human-smoke fixture:
        // one of every attack flavor (melee, physical projectile, DoT projectile,
        // AoE magic DoT, support) on both sides at once, so melee-vs-ranged VFX,
        // status icons, and a dodge can all be observed in a single real battle
        // instead of only in a static harness.
        //
        // Two things had to be tuned empirically against the real resolver
        // (see the "Mixed Arms & Status Showcase" test in combatLabCore.test.ts):
        // (1) `mechanics_v1` ability damage comes entirely from the ability's own
        //     `effects[].magnitude` — a unit's `attack` stat is never read once it
        //     has a `normalAttackAbility`. So `basic_slash` (14 dmg/0.9s) hits
        //     exactly as hard whichever unit swings it; the only real levers here
        //     are HP, evasion, and positioning/targeting.
        // (2) Frontline's gambit targets the nearest enemy, recomputed whenever
        //     the current target dies or leaves range. Mirroring `standard_5v5`'s
        //     pattern (ally index i paired with enemy index i at the same y) is
        //     what makes `ranger`'s nearest enemy reliably resolve to `sentinel`
        //     from the opening tick, so poison_arrow gets repeated, uninterrupted
        //     hits on one living target instead of splitting buildup across
        //     whichever enemy happens to be nearest after each death.
        // `sentinel` is HP-heavy and non-evasive so it survives long enough for
        // poison/burn to actually cross their buildupThreshold (100, in ~25-per-
        // hit steps) instead of the target dying to raw damage first. Ally HP is
        // raised across the board because every enemy (including `sentinel`)
        // still swings a full-strength `basic_slash`; without the buffer the
        // slower-cadence ranged/support kit (3s/1.2s/5.5s cooldowns vs. melee's
        // 0.9s) loses the 5v5 damage race before any of this is observable.
        duel('mixed_arms_showcase', 'Mixed Arms & Status Showcase', [
            unit('vanguard', 'allies', { hp: 180, maxHp: 180, position: { x: -80, y: -48 } }),
            unit('ranger', 'allies', { hp: 160, maxHp: 160, normalAttackAbilityId: 'poison_arrow', attackRange: 220, position: { x: -80, y: -24 } }),
            unit('gunner', 'allies', { hp: 160, maxHp: 160, normalAttackAbilityId: 'ap_round', attackRange: 240, position: { x: -80, y: 0 } }),
            unit('mage', 'allies', { hp: 160, maxHp: 160, normalAttackAbilityId: 'ignite', attackRange: 120, position: { x: -80, y: 24 } }),
            unit('medic', 'allies', { hp: 160, maxHp: 160, role: 'Medic', healAbilityId: 'heal', position: { x: -80, y: 48 } }),
        ], [
            unit('brawler', 'enemies', { hp: 140, maxHp: 140, position: { x: 80, y: -48 } }),
            unit('sentinel', 'enemies', { hp: 500, maxHp: 500, evasion: 0, position: { x: 80, y: -24 } }),
            // Paired (by y) with `gunner`, whose single-target ap_round locks onto
            // its nearest enemy the same reliable way ranger locks onto sentinel —
            // `ignite`'s multi-target sweep (primary + next living enemies in
            // roster order, not true cone geometry) otherwise never reaches
            // whichever enemy sits 4th/5th here, so a dedicated single-target
            // attacker is what actually guarantees dodger gets hit at all.
            // evasion 50 -> ceil(100/50)=2, so a dodge is guaranteed by its
            // second incoming dodgeable hit rather than needing it to survive four.
            unit('dodger', 'enemies', { hp: 90, maxHp: 90, evasion: 50, position: { x: 80, y: 0 } }),
            unit('juggernaut', 'enemies', { hp: 140, maxHp: 140, position: { x: 80, y: 24 } }),
            unit('grunt', 'enemies', { hp: 140, maxHp: 140, position: { x: 80, y: 48 } }),
        ]),
    ];
}
