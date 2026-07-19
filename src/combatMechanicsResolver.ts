import { AbilityDefinition, Effect, StatusDefinition, SubsystemTag, TargetTag, Vector, WeaponScale } from './combatAbilityTypes';

export type StructureClass = 'flesh' | 'light' | 'armored' | 'structure' | 'capital';
export interface BarrierState { amount: number; blocksVectors: Vector[]; blocksStatusApplication: boolean; }
export interface StatusInstance { id: string; remainingSeconds: number; intensity: number; }
export interface BuildupState { value: number; procCount: number; idleSeconds: number; }
export interface SubsystemState { tag: SubsystemTag; hp: number; maxHp: number; disabledSeconds: number; }
export interface LethalityState { endureCharges: number; undyingSeconds: number; }
export interface MechanicsCombatant {
    id: string; hp: number; maxHp: number; attack: number; defense: number;
    penetration?: number; accuracy?: number; evasion?: number; incomingHitCount?: number;
    structureClass?: StructureClass; weaponScale?: WeaponScale; tags?: TargetTag[];
    resistances?: Partial<Record<Vector | string, number>>; barrier?: BarrierState;
    statuses?: StatusInstance[]; buildup?: Record<string, BuildupState>;
    subsystems?: SubsystemState[]; lethality?: LethalityState; healReceivedMul?: number;
}
export interface MechanicsReceipt { stage: string; kind: string; detail?: string; amount?: number; statusId?: string; subsystemTag?: SubsystemTag; }
export interface MechanicsResolution { target: MechanicsCombatant; receipts: MechanicsReceipt[]; damageDealt: number; dodged: boolean; targetLegal: boolean; }
export interface MechanicsInput { ability: AbilityDefinition; attacker: MechanicsCombatant; target: MechanicsCombatant; statuses: readonly StatusDefinition[]; }

const SCALE: Record<WeaponScale, Record<StructureClass, number>> = {
    personal: { flesh: 1, light: .6, armored: .25, structure: .15, capital: .05 },
    anti_armor: { flesh: .9, light: 1, armored: 1, structure: .7, capital: .35 },
    anti_ship: { flesh: 1, light: 1, armored: 1, structure: 1, capital: 1 },
    siege: { flesh: 1, light: 1, armored: 1, structure: 1.5, capital: .8 },
};
const PRIORITY = ['doom', 'petrify', 'silence', 'sleep', 'stun', 'paralysis', 'fear', 'taunt', 'burn', 'poison', 'bleed', 'slow'];
const clone = <T>(value: T): T => structuredClone(value);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const hasStatus = (target: MechanicsCombatant, id: string) => (target.statuses || []).some(status => status.id === id && status.remainingSeconds > 0);
const statusDefinition = (statuses: readonly StatusDefinition[], id: string) => statuses.find(status => status.id === id);

function targetMatches(effect: Effect, target: MechanicsCombatant): boolean {
    return effect.targetRequirement.length === 0 || effect.targetRequirement.some(tag => (target.tags || []).includes(tag));
}
function penetrationFactor(effect: Effect, target: MechanicsCombatant, receipts: MechanicsReceipt[]): number {
    const barrier = target.barrier;
    if (!barrier || !barrier.blocksVectors.includes(effect.vector)) return 1;
    if (effect.penetration.barrier === 'blocked') { receipts.push({ stage: 'penetration', kind: 'penetration_blocked', detail: 'barrier' }); return 0; }
    if (effect.penetration.barrier === 'attenuated') { receipts.push({ stage: 'penetration', kind: 'effect_attenuated', amount: .5 }); return .5; }
    return 1;
}
function applyStatus(target: MechanicsCombatant, status: StatusDefinition, receipts: MechanicsReceipt[]): void {
    const active = target.statuses || (target.statuses = []);
    const existing = active.find(item => item.id === status.id);
    if (existing && status.stacking === 'ignore') return;
    if (existing && status.stacking === 'stack_intensity') { existing.intensity = Math.min(status.maxStacks || 3, existing.intensity + 1); existing.remainingSeconds = status.durationSeconds; }
    else if (existing && status.stacking === 'stack_duration') existing.remainingSeconds = Math.min((status.maxStacks || status.durationSeconds), existing.remainingSeconds + status.durationSeconds);
    else if (existing) existing.remainingSeconds = status.durationSeconds;
    else active.push({ id: status.id, remainingSeconds: status.durationSeconds, intensity: 1 });
    receipts.push({ stage: 'buildup', kind: 'status_applied', statusId: status.id });
}
function applyBuildup(effect: Effect, target: MechanicsCombatant, statuses: readonly StatusDefinition[], receipts: MechanicsReceipt[]): void {
    if (!effect.statusId) return;
    const status = statusDefinition(statuses, effect.statusId);
    if (!status || hasStatus(target, 'petrify')) return;
    const map = target.buildup || (target.buildup = {});
    const item = map[effect.statusId] || (map[effect.statusId] = { value: 0, procCount: 0, idleSeconds: 0 });
    item.value += Math.trunc(effect.magnitude); item.idleSeconds = 0;
    const resist = clamp(target.resistances?.[effect.statusId] || 0, 0, 100);
    const threshold = Math.trunc(status.buildupThreshold * (1 + resist / 100) * (1 + .5 * Math.min(item.procCount, 4)));
    receipts.push({ stage: 'buildup', kind: 'buildup_added', statusId: effect.statusId, amount: Math.trunc(effect.magnitude) });
    if (item.value >= threshold) { item.value = 0; item.procCount = Math.min(4, item.procCount + 1); applyStatus(target, status, receipts); }
}
function isHuge(target: MechanicsCombatant): boolean { return target.structureClass === 'capital' || (target.tags || []).includes('colossal'); }

/** Resolves one validated ability with no I/O, clock, RNG, callbacks, or mutation of the input objects. */
export function resolveMechanics(input: MechanicsInput): MechanicsResolution {
    const target = clone(input.target); const receipts: MechanicsReceipt[] = []; let damageDealt = 0; let dodged = false;
    const targetLegal = !hasStatus(target, 'untargetable') || ['area', 'beam'].includes(input.ability.delivery.shape);
    if (!targetLegal) return { target, receipts: [{ stage: 'targeting', kind: 'target_illegal' }], damageDealt, dodged, targetLegal };
    const cannotDodge = ['area', 'beam'].includes(input.ability.delivery.shape);
    if (!cannotDodge) {
        const evasion = hasStatus(target, 'paralysis') ? 0 : clamp((target.evasion || 0) - (input.attacker.accuracy || 0), 0, 50);
        if (evasion > 0) { const count = (target.incomingHitCount || 0) + 1; target.incomingHitCount = count; dodged = count % Math.ceil(100 / evasion) === 0; }
        if (dodged) return { target, receipts: [{ stage: 'hit', kind: 'dodged' }], damageDealt, dodged, targetLegal };
    }
    for (const effect of input.ability.effects) {
        if (!targetMatches(effect, target)) { receipts.push({ stage: 'targeting', kind: 'effect_target_invalid' }); continue; }
        const factor = penetrationFactor(effect, target, receipts); if (factor === 0) continue;
        if (effect.kind === 'damage') {
            const scale = SCALE[effect.weaponScale || input.attacker.weaponScale || 'personal'][target.structureClass || 'flesh'];
            const armored = Math.trunc(Math.trunc(input.attacker.attack * scale) - Math.max(0, (target.defense || 0) - (input.attacker.penetration || 0)));
            const resist = clamp(target.resistances?.[effect.vector] || 0, -50, 75);
            let damage = Math.max(1, Math.trunc(armored * (1 - resist / 100)));
            if (hasStatus(target, 'sleep')) { damage = Math.trunc(damage * 1.5); target.statuses = (target.statuses || []).filter(status => status.id !== 'sleep'); receipts.push({ stage: 'status', kind: 'sleep_broken' }); }
            damage = Math.trunc(damage * factor);
            const barrier = target.barrier;
            if (barrier && barrier.blocksVectors.includes(effect.vector) && effect.penetration.barrier !== 'passes' && effect.penetration.barrier !== 'attenuated') { const absorbed = Math.min(barrier.amount, damage); barrier.amount -= absorbed; damage -= absorbed; if (absorbed) receipts.push({ stage: 'barrier', kind: 'barrier_absorbed', amount: absorbed }); }
            const before = target.hp; target.hp = Math.max(0, target.hp - damage);
            if (target.hp === 0 && damage > 0 && !input.ability.tags.includes('trueDeath')) {
                const lethality = target.lethality;
                if (lethality && lethality.undyingSeconds > 0) { target.hp = 1; receipts.push({ stage: 'lethality', kind: 'undying' }); }
                else if (lethality && lethality.endureCharges > 0) { target.hp = 1; lethality.endureCharges--; receipts.push({ stage: 'lethality', kind: 'endure' }); }
                else receipts.push({ stage: 'lethality', kind: 'death' });
            }
            damageDealt += before - target.hp; receipts.push({ stage: 'hp', kind: 'damage', amount: before - target.hp });
        } else if (effect.kind === 'buildup') {
            if (effect.penetration.requiresDamageDealt && damageDealt < 1) { receipts.push({ stage: 'buildup', kind: 'damage_prerequisite_failed', statusId: effect.statusId }); continue; }
            if (effect.penetration.requiresBodyContact && !(target.tags || []).includes('living')) { receipts.push({ stage: 'buildup', kind: 'body_contact_failed', statusId: effect.statusId }); continue; }
            if (isHuge(target) && input.ability.scaleBehavior.huge === 'convert_subsystem') {
                const tag = input.ability.scaleBehavior.hugeSubsystemTags?.find(candidate => target.subsystems?.some(system => system.tag === candidate));
                const subsystem = tag && target.subsystems?.find(system => system.tag === tag);
                if (subsystem) { subsystem.disabledSeconds = Math.max(subsystem.disabledSeconds, statusDefinition(input.statuses, effect.statusId || '')?.durationSeconds || 0); receipts.push({ stage: 'scale', kind: 'subsystem_disabled', subsystemTag: tag, statusId: effect.statusId }); continue; }
            }
            applyBuildup(effect, target, input.statuses, receipts);
        } else if (effect.kind === 'heal') {
            const multiplier = hasStatus(target, 'heal_block') ? .25 : (target.healReceivedMul ?? 1); const amount = Math.trunc(effect.magnitude * multiplier); const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount); receipts.push({ stage: 'heal', kind: 'healed', amount: target.hp - before });
        } else if (effect.kind === 'cleanse') {
            target.buildup = {}; const removable = (target.statuses || []).filter(status => status.id !== 'regen').sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))[0]; if (removable) target.statuses = (target.statuses || []).filter(status => status !== removable); receipts.push({ stage: 'cleanse', kind: 'cleansed', statusId: removable?.id });
        }
    }
    return { target, receipts, damageDealt, dodged, targetLegal };
}

/** Advances timers, DoTs, lethality windows, and buildup decay by a supplied deterministic delta. */
export function advanceMechanicsState(state: MechanicsCombatant, deltaSeconds: number): MechanicsCombatant {
    const next = clone(state); const delta = Math.max(0, deltaSeconds);
    for (const item of Object.values(next.buildup || {})) { item.idleSeconds += delta; if (item.idleSeconds > 2) item.value = Math.max(0, item.value - Math.trunc(10 * delta)); }
    for (const subsystem of next.subsystems || []) subsystem.disabledSeconds = Math.max(0, subsystem.disabledSeconds - delta);
    if (next.lethality) next.lethality.undyingSeconds = Math.max(0, next.lethality.undyingSeconds - delta);
    for (const status of next.statuses || []) { status.remainingSeconds = Math.max(0, status.remainingSeconds - delta); const rate = status.id === 'poison' ? 3 + (status.intensity - 1) * 2 : status.id === 'burn' ? 5 : status.id === 'bleed' ? 2 : status.id === 'regen' ? -2 : 0; if (rate > 0) next.hp = Math.max(0, next.hp - Math.trunc(rate * delta)); else if (rate < 0) next.hp = Math.min(next.maxHp, next.hp - Math.trunc(rate * delta)); }
    next.statuses = (next.statuses || []).filter(status => status.remainingSeconds > 0);
    return next;
}

export function canMove(state: MechanicsCombatant): boolean { return !hasStatus(state, 'paralysis') && !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
export function canAct(state: MechanicsCombatant): boolean { return !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
