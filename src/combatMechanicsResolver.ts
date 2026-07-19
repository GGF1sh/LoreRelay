import { AbilityDefinition, Effect, StatusDefinition, SubsystemTag, TargetTag, Vector, WeaponScale } from './combatAbilityTypes';

export type StructureClass = 'flesh' | 'light' | 'armored' | 'structure' | 'capital';
export interface BarrierState { amount: number; blocksVectors: Vector[]; blocksStatusApplication: boolean; }
/** `residualMilli` carries sub-1-HP over-time accrual between ticks (integer milli-HP, JSON safe). */
export interface StatusInstance { id: string; remainingSeconds: number; intensity: number; residualMilli?: number; }
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
/** Attacker penetration implied by weapon scale when the combatant carries no explicit value. */
const SCALE_PENETRATION: Record<WeaponScale, number> = { personal: 0, anti_armor: 10, anti_ship: 25, siege: 20 };
/** Over-time rates in HP per second. Values are unchanged from V1; only their accumulation is corrected. */
function statusRatePerSecond(status: StatusInstance): number {
    if (status.id === 'poison') { return 3 + (status.intensity - 1) * 2; }
    if (status.id === 'burn') { return 5; }
    if (status.id === 'bleed') { return 2; }
    if (status.id === 'regen') { return -2; }
    return 0;
}
const clone = <T>(value: T): T => structuredClone(value);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const hasStatus = (target: MechanicsCombatant, id: string) => (target.statuses || []).some(status => status.id === id && status.remainingSeconds > 0);
/** Shared by the direct heal effect and over-time regeneration so heal-block/healReceivedMul is applied exactly once per healing source. */
const healingMultiplier = (target: MechanicsCombatant): number => hasStatus(target, 'heal_block') ? .25 : (target.healReceivedMul ?? 1);
const statusDefinition = (statuses: readonly StatusDefinition[], id: string) => statuses.find(status => status.id === id);

function targetMatches(effect: Effect, target: MechanicsCombatant): boolean {
    return effect.targetRequirement.length === 0 || effect.targetRequirement.some(tag => (target.tags || []).includes(tag));
}
function penetrationFactor(effect: Effect, target: MechanicsCombatant, receipts: MechanicsReceipt[]): number {
    const barrier = target.barrier;
    if (!barrier || !barrier.blocksVectors.includes(effect.vector)) return 1;
    if (effect.penetration.barrier === 'attenuated') { receipts.push({ stage: 'penetration', kind: 'effect_attenuated', amount: .5 }); return .5; }
    if (effect.penetration.barrier === 'blocked') {
        // Damage must reach the barrier stage so the pool absorbs it and depletes; returning 0 here
        // would skip the effect entirely and make any pool an unlimited immunity.
        if (effect.kind === 'damage') return 1;
        // Non-damage effects are still held off, but only while the pool actually has charge.
        if (barrier.amount > 0 && barrier.blocksStatusApplication) { receipts.push({ stage: 'penetration', kind: 'penetration_blocked', detail: 'barrier' }); return 0; }
    }
    return 1;
}
/** Single choke point for reaching 0 HP: undying and endure may hold the target at 1. */
function resolveLethality(target: MechanicsCombatant, receipts: MechanicsReceipt[], trueDeath: boolean): void {
    if (target.hp > 0) return;
    if (!trueDeath) {
        const lethality = target.lethality;
        if (lethality && lethality.undyingSeconds > 0) { target.hp = 1; receipts.push({ stage: 'lethality', kind: 'undying' }); return; }
        if (lethality && lethality.endureCharges > 0) { target.hp = 1; lethality.endureCharges--; receipts.push({ stage: 'lethality', kind: 'endure' }); return; }
    }
    receipts.push({ stage: 'lethality', kind: 'death' });
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
            const weaponScale = effect.weaponScale || input.attacker.weaponScale || 'personal';
            const scale = SCALE[weaponScale][target.structureClass || 'flesh'];
            const penetration = input.attacker.penetration ?? SCALE_PENETRATION[weaponScale];
            // `passes` ignores armour outright; `reduced` halves it before penetration; `blocked` leaves it intact.
            const armorValue = target.defense || 0;
            const effectiveArmor = effect.penetration.armor === 'passes'
                ? 0
                : Math.max(0, (effect.penetration.armor === 'reduced' ? Math.trunc(armorValue / 2) : armorValue) - penetration);
            const armored = Math.trunc(Math.trunc(input.attacker.attack * scale) - effectiveArmor);
            const resist = clamp(target.resistances?.[effect.vector] || 0, -50, 75);
            let damage = Math.max(1, Math.trunc(armored * (1 - resist / 100)));
            if (hasStatus(target, 'sleep')) { damage = Math.trunc(damage * 1.5); target.statuses = (target.statuses || []).filter(status => status.id !== 'sleep'); receipts.push({ stage: 'status', kind: 'sleep_broken' }); }
            damage = Math.trunc(damage * factor);
            const barrier = target.barrier;
            if (barrier && barrier.blocksVectors.includes(effect.vector) && effect.penetration.barrier !== 'passes' && effect.penetration.barrier !== 'attenuated') { const absorbed = Math.min(barrier.amount, damage); barrier.amount -= absorbed; damage -= absorbed; if (absorbed) receipts.push({ stage: 'barrier', kind: 'barrier_absorbed', amount: absorbed }); }
            const before = target.hp; target.hp = Math.max(0, target.hp - damage);
            if (target.hp === 0 && damage > 0) resolveLethality(target, receipts, input.ability.tags.includes('trueDeath'));
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
            const multiplier = healingMultiplier(target); const amount = Math.trunc(effect.magnitude * multiplier); const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount); receipts.push({ stage: 'heal', kind: 'healed', amount: target.hp - before });
        } else if (effect.kind === 'cleanse') {
            target.buildup = {}; const removable = (target.statuses || []).filter(status => status.id !== 'regen').sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))[0]; if (removable) target.statuses = (target.statuses || []).filter(status => status !== removable); receipts.push({ stage: 'cleanse', kind: 'cleansed', statusId: removable?.id });
        }
    }
    return { target, receipts, damageDealt, dodged, targetLegal };
}

export interface AdvanceMechanicsOptions {
    /** Needed to recognise `lethal_timer` statuses on expiry. Without it, timers simply lapse. */
    statuses?: readonly StatusDefinition[];
    /** Receipts produced while advancing (lethality outcomes). Appended to, never replaced. */
    receipts?: MechanicsReceipt[];
}

/** Advances timers, DoTs, lethality windows, and buildup decay by a supplied deterministic delta. */
export function advanceMechanicsState(state: MechanicsCombatant, deltaSeconds: number, options: AdvanceMechanicsOptions = {}): MechanicsCombatant {
    const next = clone(state); const delta = Math.max(0, deltaSeconds);
    const receipts = options.receipts || [];
    for (const item of Object.values(next.buildup || {})) { item.idleSeconds += delta; if (item.idleSeconds > 2) item.value = Math.max(0, item.value - Math.trunc(10 * delta)); }
    for (const subsystem of next.subsystems || []) subsystem.disabledSeconds = Math.max(0, subsystem.disabledSeconds - delta);
    if (next.lethality) next.lethality.undyingSeconds = Math.max(0, next.lethality.undyingSeconds - delta);

    let lethalTimerExpired = false;
    for (const status of next.statuses || []) {
        const before = status.remainingSeconds;
        status.remainingSeconds = Math.max(0, before - delta);
        const rate = statusRatePerSecond(status);
        if (rate !== 0) {
            // A negative rate is healing (regen); positive is damage (poison/burn/bleed) and must not
            // be scaled by heal-block/healReceivedMul. Scaling the rate before accumulation keeps the
            // milli-HP residual math (and therefore tick-width invariance) unchanged for both cases.
            const effectiveRate = rate < 0 ? rate * healingMultiplier(next) : rate;
            // Accumulate in integer milli-HP: a bare Math.trunc(rate * delta) discards every tick
            // whose contribution is below 1 HP, which zeroed all over-time effects at fine tick rates.
            const residual = (status.residualMilli || 0) + Math.round(effectiveRate * delta * 1000);
            const whole = Math.trunc(residual / 1000);
            status.residualMilli = residual - whole * 1000;
            if (whole > 0) next.hp = Math.max(0, next.hp - whole);
            else if (whole < 0) next.hp = Math.min(next.maxHp, next.hp - whole);
        }
        if (before > 0 && status.remainingSeconds === 0 && statusDefinition(options.statuses || [], status.id)?.statusClass === 'lethal_timer') lethalTimerExpired = true;
    }
    next.statuses = (next.statuses || []).filter(status => status.remainingSeconds > 0);

    // A lapsed lethal timer executes through the same gate as lethal damage, so undying/endure still apply.
    if (lethalTimerExpired && next.hp > 0) { next.hp = 0; receipts.push({ stage: 'lethal_timer', kind: 'lethal_timer_expired' }); }
    if (next.hp === 0) resolveLethality(next, receipts, false);
    return next;
}

export function canMove(state: MechanicsCombatant): boolean { return !hasStatus(state, 'paralysis') && !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
export function canAct(state: MechanicsCombatant): boolean { return !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
