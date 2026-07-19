import { AbilityDefinition, Effect, StatusDefinition, SubsystemTag, TargetTag, Vector, WeaponScale } from './combatAbilityTypes';

export type StructureClass = 'flesh' | 'light' | 'armored' | 'structure' | 'capital';
export interface BarrierState { amount: number; blocksVectors: Vector[]; blocksStatusApplication: boolean; }
/**
 * `residualMilli` carries sub-1-HP over-time accrual between ticks (integer milli-HP, JSON safe).
 * `sourceId`/`sourceAbilityId` identify who applied it, so a lethal timer dies with its caster.
 * `imminent` marks the final warning window; `wasBelowThreshold` tracks execution-band transitions.
 * Every field is a JSON primitive so the whole instance round-trips through persisted state.
 */
export interface StatusInstance {
    id: string; remainingSeconds: number; intensity: number; residualMilli?: number;
    sourceId?: string; sourceAbilityId?: string; imminent?: boolean; wasBelowThreshold?: boolean;
}
export interface BuildupState { value: number; procCount: number; idleSeconds: number; }
/** `destroyed` is permanent critical loss; `disabledSeconds` is a temporary outage. */
export interface SubsystemState { tag: SubsystemTag; hp: number; maxHp: number; disabledSeconds: number; destroyed?: boolean; }
export interface LethalityState { endureCharges: number; undyingSeconds: number; }
/** Drives the doom execution threshold. `colossal` never dies to a lethal timer. */
export type CombatantRank = 'normal' | 'elite' | 'boss' | 'colossal';
export interface MechanicsCombatant {
    id: string; hp: number; maxHp: number; attack: number; defense: number;
    rank?: CombatantRank;
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
/** HP fraction at or below which an expiring lethal timer executes. Colossal never executes. */
export const LETHAL_TIMER_EXECUTE_THRESHOLD: Record<CombatantRank, number> = { normal: .5, elite: .35, boss: .2, colossal: 0 };
/** Fraction of maxHp dealt when an expiring lethal timer finds the target above its threshold. */
export const LETHAL_TIMER_FALLBACK_FRACTION = .2;
/** Seconds of visible warning before a lethal timer resolves. */
export const LETHAL_TIMER_IMMINENT_SECONDS = 3;
/** Critical subsystems a lethal timer destroys on a colossal target, highest priority first. */
export const LETHAL_TIMER_SUBSYSTEM_PRIORITY: readonly SubsystemTag[] = ['power', 'command', 'primary_weapon', 'locomotion', 'sensor'];
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
/**
 * Single choke point for applying HP loss. Every damage source — ability effects and expiring
 * lethal timers alike — funnels through here so none of them writes HP directly and all of them
 * reach the lethality gate identically. Returns the HP actually removed.
 */
function applyHpDamage(target: MechanicsCombatant, amount: number, receipts: MechanicsReceipt[], trueDeath = false): number {
    const before = target.hp;
    target.hp = Math.max(0, target.hp - Math.max(0, Math.trunc(amount)));
    const dealt = before - target.hp;
    if (target.hp === 0 && dealt > 0) resolveLethality(target, receipts, trueDeath);
    return dealt;
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
interface StatusSource { sourceId?: string; sourceAbilityId?: string; }
function applyStatus(target: MechanicsCombatant, status: StatusDefinition, receipts: MechanicsReceipt[], source: StatusSource = {}): void {
    const active = target.statuses || (target.statuses = []);
    const existing = active.find(item => item.id === status.id);
    if (existing && status.stacking === 'ignore') return;
    if (existing && status.stacking === 'stack_intensity') { existing.intensity = Math.min(status.maxStacks || 3, existing.intensity + 1); existing.remainingSeconds = status.durationSeconds; }
    else if (existing && status.stacking === 'stack_duration') existing.remainingSeconds = Math.min((status.maxStacks || status.durationSeconds), existing.remainingSeconds + status.durationSeconds);
    else if (existing) existing.remainingSeconds = status.durationSeconds;
    else {
        const instance: StatusInstance = { id: status.id, remainingSeconds: status.durationSeconds, intensity: 1 };
        // Only lethal timers need a caster link; keeping it narrow avoids bloating every DoT instance.
        if (status.statusClass === 'lethal_timer') {
            if (source.sourceId) instance.sourceId = source.sourceId;
            if (source.sourceAbilityId) instance.sourceAbilityId = source.sourceAbilityId;
        }
        active.push(instance);
    }
    receipts.push({ stage: 'buildup', kind: 'status_applied', statusId: status.id });
}
function applyBuildup(effect: Effect, target: MechanicsCombatant, statuses: readonly StatusDefinition[], receipts: MechanicsReceipt[], source: StatusSource = {}): void {
    if (!effect.statusId) return;
    const status = statusDefinition(statuses, effect.statusId);
    if (!status || hasStatus(target, 'petrify')) return;
    const map = target.buildup || (target.buildup = {});
    const item = map[effect.statusId] || (map[effect.statusId] = { value: 0, procCount: 0, idleSeconds: 0 });
    item.value += Math.trunc(effect.magnitude); item.idleSeconds = 0;
    const resist = clamp(target.resistances?.[effect.statusId] || 0, 0, 100);
    const threshold = Math.trunc(status.buildupThreshold * (1 + resist / 100) * (1 + .5 * Math.min(item.procCount, 4)));
    receipts.push({ stage: 'buildup', kind: 'buildup_added', statusId: effect.statusId, amount: Math.trunc(effect.magnitude) });
    if (item.value >= threshold) { item.value = 0; item.procCount = Math.min(4, item.procCount + 1); applyStatus(target, status, receipts, source); }
}
function isHuge(target: MechanicsCombatant): boolean { return target.structureClass === 'capital' || (target.tags || []).includes('colossal'); }
function rankOf(target: MechanicsCombatant): CombatantRank { return isHuge(target) ? 'colossal' : (target.rank || 'normal'); }
/** True when the target currently sits inside its rank's execution band. Colossal is never inside one. */
function insideExecuteBand(target: MechanicsCombatant): boolean {
    const rank = rankOf(target);
    if (rank === 'colossal' || target.maxHp <= 0) return false;
    return target.hp / target.maxHp <= LETHAL_TIMER_EXECUTE_THRESHOLD[rank];
}
/**
 * Resolves one expired lethal timer. Colossal targets lose a critical subsystem permanently and
 * never die; everyone else is executed only from inside their execution band, and otherwise takes
 * a flat share of maxHp. Both damage paths go through applyHpDamage so the lethality gate applies.
 */
function resolveLethalTimer(target: MechanicsCombatant, statusId: string, receipts: MechanicsReceipt[]): void {
    if (rankOf(target) === 'colossal') {
        const tag = LETHAL_TIMER_SUBSYSTEM_PRIORITY.find(candidate => (target.subsystems || []).some(system => system.tag === candidate && !system.destroyed));
        const subsystem = tag ? (target.subsystems || []).find(system => system.tag === tag && !system.destroyed) : undefined;
        if (!subsystem) { receipts.push({ stage: 'lethal_timer', kind: 'doom_no_subsystem', statusId }); return; }
        subsystem.destroyed = true; subsystem.hp = 0; subsystem.disabledSeconds = 0;
        receipts.push({ stage: 'lethal_timer', kind: 'doom_subsystem_destroyed', statusId, subsystemTag: subsystem.tag });
        return;
    }
    const hpBefore = target.hp;
    if (insideExecuteBand(target)) {
        applyHpDamage(target, target.hp, receipts);
        // The gate may have held the target at 1 HP via endure/undying.
        receipts.push({ stage: 'lethal_timer', kind: target.hp > 0 ? 'doom_prevented' : 'doom_executed', statusId, amount: hpBefore - target.hp });
        return;
    }
    const dealt = applyHpDamage(target, Math.trunc(target.maxHp * LETHAL_TIMER_FALLBACK_FRACTION), receipts);
    receipts.push({ stage: 'lethal_timer', kind: 'doom_fallback_damage', statusId, amount: dealt });
    if (target.hp === 0) receipts.push({ stage: 'lethal_timer', kind: 'doom_executed', statusId, detail: 'fallback_lethal' });
}

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
            const dealt = applyHpDamage(target, damage, receipts, input.ability.tags.includes('trueDeath'));
            damageDealt += dealt; receipts.push({ stage: 'hp', kind: 'damage', amount: dealt });
        } else if (effect.kind === 'buildup') {
            if (effect.penetration.requiresDamageDealt && damageDealt < 1) { receipts.push({ stage: 'buildup', kind: 'damage_prerequisite_failed', statusId: effect.statusId }); continue; }
            if (effect.penetration.requiresBodyContact && !(target.tags || []).includes('living')) { receipts.push({ stage: 'buildup', kind: 'body_contact_failed', statusId: effect.statusId }); continue; }
            // Lethal timers are the exception: they apply normally even to a colossal and convert to
            // permanent subsystem destruction when they expire, rather than to a disable on contact.
            const isLethalTimer = statusDefinition(input.statuses, effect.statusId || '')?.statusClass === 'lethal_timer';
            if (!isLethalTimer && isHuge(target) && input.ability.scaleBehavior.huge === 'convert_subsystem') {
                const tag = input.ability.scaleBehavior.hugeSubsystemTags?.find(candidate => target.subsystems?.some(system => system.tag === candidate));
                const subsystem = tag && target.subsystems?.find(system => system.tag === tag);
                if (subsystem) { subsystem.disabledSeconds = Math.max(subsystem.disabledSeconds, statusDefinition(input.statuses, effect.statusId || '')?.durationSeconds || 0); receipts.push({ stage: 'scale', kind: 'subsystem_disabled', subsystemTag: tag, statusId: effect.statusId }); continue; }
            }
            applyBuildup(effect, target, input.statuses, receipts, { sourceId: input.attacker.id, sourceAbilityId: input.ability.id });
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
    /** Combatants defeated this tick. A lethal timer whose `sourceId` matches one of them is lifted. */
    defeatedIds?: readonly string[];
}

/** Advances timers, DoTs, lethality windows, and buildup decay by a supplied deterministic delta. */
export function advanceMechanicsState(state: MechanicsCombatant, deltaSeconds: number, options: AdvanceMechanicsOptions = {}): MechanicsCombatant {
    const next = clone(state); const delta = Math.max(0, deltaSeconds);
    const receipts = options.receipts || [];
    for (const item of Object.values(next.buildup || {})) { item.idleSeconds += delta; if (item.idleSeconds > 2) item.value = Math.max(0, item.value - Math.trunc(10 * delta)); }
    for (const subsystem of next.subsystems || []) subsystem.disabledSeconds = Math.max(0, subsystem.disabledSeconds - delta);
    if (next.lethality) next.lethality.undyingSeconds = Math.max(0, next.lethality.undyingSeconds - delta);

    // A lethal timer dies with its caster. Only instances carrying a matching sourceId are lifted, so
    // legacy data without a source and timers cast by anyone still alive are untouched.
    const defeated = options.defeatedIds || [];
    if (defeated.length && (next.statuses || []).length) {
        const isLethal = (status: StatusInstance) => statusDefinition(options.statuses || [], status.id)?.statusClass === 'lethal_timer';
        const lifted = (next.statuses || []).filter(status => isLethal(status) && status.sourceId !== undefined && defeated.includes(status.sourceId));
        for (const status of lifted) receipts.push({ stage: 'lethal_timer', kind: 'doom_source_defeated', statusId: status.id, detail: status.sourceId });
        if (lifted.length) next.statuses = (next.statuses || []).filter(status => !lifted.includes(status));
    }

    const expiredLethalTimers: string[] = [];
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
        if (statusDefinition(options.statuses || [], status.id)?.statusClass !== 'lethal_timer') continue;
        if (before > 0 && status.remainingSeconds === 0) { expiredLethalTimers.push(status.id); continue; }
        if (status.remainingSeconds <= 0) continue;
        // Final warning window, announced once on entry so the GM and gambits can react.
        if (!status.imminent && status.remainingSeconds <= LETHAL_TIMER_IMMINENT_SECONDS) {
            status.imminent = true;
            receipts.push({ stage: 'lethal_timer', kind: 'doom_imminent', statusId: status.id, amount: status.remainingSeconds });
        }
        // Healing the target out of its execution band is a counter in its own right, so it is reported.
        const below = insideExecuteBand(next);
        if (status.wasBelowThreshold && !below) receipts.push({ stage: 'lethal_timer', kind: 'doom_threshold_escaped', statusId: status.id });
        status.wasBelowThreshold = below;
    }
    next.statuses = (next.statuses || []).filter(status => status.remainingSeconds > 0);

    for (const statusId of expiredLethalTimers) {
        receipts.push({ stage: 'lethal_timer', kind: 'lethal_timer_expired', statusId });
        resolveLethalTimer(next, statusId, receipts);
    }
    if (next.hp === 0 && !expiredLethalTimers.length) resolveLethality(next, receipts, false);
    return next;
}

export function canMove(state: MechanicsCombatant): boolean { return !hasStatus(state, 'paralysis') && !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
export function canAct(state: MechanicsCombatant): boolean { return !hasStatus(state, 'stun') && !hasStatus(state, 'sleep') && !hasStatus(state, 'petrify'); }
