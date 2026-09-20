import {
    AbilityDefinition,
    AbilityFixtureDocument,
    AbilityTier,
    Effect,
    JsonValue,
    SHAPE_MULTIPLIERS,
    Shape,
    StatusDefinition,
    TargetTag,
    TIER_MULTIPLIERS,
    Vector,
} from './combatAbilityTypes';

export enum AbilityValidationErrorCode {
    NON_JSON_VALUE = 'NON_JSON_VALUE',
    CYCLIC_REFERENCE = 'CYCLIC_REFERENCE',
    RUNTIME_CLASS_FORBIDDEN = 'RUNTIME_CLASS_FORBIDDEN',
    REQUIRED_FIELD = 'REQUIRED_FIELD',
    INVALID_ENUM = 'INVALID_ENUM',
    INVALID_NUMBER = 'INVALID_NUMBER',
    INVALID_DELIVERY = 'INVALID_DELIVERY',
    INVALID_EFFECT = 'INVALID_EFFECT',
    DELIVERY_CONTAINS_DAMAGE = 'DELIVERY_CONTAINS_DAMAGE',
    EFFECT_CONTAINS_GEOMETRY = 'EFFECT_CONTAINS_GEOMETRY',
    SHAPE_TARGET_CAP_EXCEEDED = 'SHAPE_TARGET_CAP_EXCEEDED',
    COUNTER_REQUIRED = 'COUNTER_REQUIRED',
    DAMAGE_BEFORE_BUILDUP_REQUIRED = 'DAMAGE_BEFORE_BUILDUP_REQUIRED',
    STATUS_UNKNOWN = 'STATUS_UNKNOWN',
    STATUS_INVALID = 'STATUS_INVALID',
    STATUS_CURE_REQUIRED = 'STATUS_CURE_REQUIRED',
    HARD_CC_COUNTER_REQUIRED = 'HARD_CC_COUNTER_REQUIRED',
    VECTOR_TARGET_INCOMPATIBLE = 'VECTOR_TARGET_INCOMPATIBLE',
    BODY_CONTACT_TARGET_REQUIRED = 'BODY_CONTACT_TARGET_REQUIRED',
    POISON_REQUIRES_BODY_CONTACT = 'POISON_REQUIRES_BODY_CONTACT',
    BLEED_REQUIRES_DAMAGE_DEALT = 'BLEED_REQUIRES_DAMAGE_DEALT',
    DAMAGE_PREREQUISITE_REQUIRED = 'DAMAGE_PREREQUISITE_REQUIRED',
    SUBSYSTEM_TAG_REQUIRED = 'SUBSYSTEM_TAG_REQUIRED',
    POWER_BUDGET_EXCEEDED = 'POWER_BUDGET_EXCEEDED',
    LETHAL_TIMER_TIER_TOO_LOW = 'LETHAL_TIMER_TIER_TOO_LOW',
    LETHAL_TIMER_BUILDUP_TOO_HIGH = 'LETHAL_TIMER_BUILDUP_TOO_HIGH',
    LETHAL_TIMER_COOLDOWN_TOO_LOW = 'LETHAL_TIMER_COOLDOWN_TOO_LOW',
    LETHAL_TIMER_COUNTER_REQUIRED = 'LETHAL_TIMER_COUNTER_REQUIRED',
    LETHAL_TIMER_MULTI_TARGET = 'LETHAL_TIMER_MULTI_TARGET',
    LETHAL_TIMER_WITH_HARD_CONTROL = 'LETHAL_TIMER_WITH_HARD_CONTROL',
    LETHAL_TIMER_IMMEDIATE_ONSET = 'LETHAL_TIMER_IMMEDIATE_ONSET',
    LETHAL_TIMER_COLOSSAL_DEATH = 'LETHAL_TIMER_COLOSSAL_DEATH',
    LETHAL_TIMER_NO_INTERCEPTION = 'LETHAL_TIMER_NO_INTERCEPTION',
}
/** A lethal timer must never land faster than four applying hits against the standard threshold. */
export const LETHAL_TIMER_MAX_BUILDUP = 25;
export const LETHAL_TIMER_MIN_COOLDOWN = 8;
export const LETHAL_TIMER_MIN_COUNTERS = 2;
/** How much of a fan-out's raw value an author is excused from paying for. Below 1, so area beats crowds. */
export const CROWD_EFFICIENCY_DISCOUNT = .6;

export enum AbilityValidationWarningCode {
    LOW_COOLDOWN = 'LOW_COOLDOWN',
    MANY_EFFECTS = 'MANY_EFFECTS',
    HIGH_TARGET_CAP = 'HIGH_TARGET_CAP',
    LONG_STATUS_DURATION = 'LONG_STATUS_DURATION',
}

export interface AbilityValidationIssue<TCode extends string = string> {
    code: TCode;
    path: string;
    message: string;
}

export interface PowerBudget {
    cost: number;
    budget: number;
    toleratedBudget: number;
}

export interface AbilityValidationResult {
    valid: boolean;
    errors: AbilityValidationIssue<AbilityValidationErrorCode>[];
    warnings: AbilityValidationIssue<AbilityValidationWarningCode>[];
    powerBudget?: PowerBudget;
}

export interface AbilityValidationOptions {
    statuses: readonly StatusDefinition[];
}

const SHAPE_CAPS: Readonly<Record<Shape, number>> = {
    single_target: 1, cone: 6, line: 6, area: 8, beam: 4,
    barrage: 12, sweep: 12, self: 1, aura: 12,
};
const VALID_TARGET_TAGS = new Set<TargetTag>(['living', 'construct', 'undead', 'spirit', 'structure', 'vehicle', 'swarm', 'colossal']);
const INCOMPATIBLE_TARGETS: Readonly<Partial<Record<Vector, readonly TargetTag[]>>> = {
    biological: ['construct', 'structure', 'spirit'],
    mental: ['construct', 'structure'],
    technological: ['spirit'],
};
const GEOMETRY_KEYS = new Set(['range', 'width', 'angle', 'radius', 'pulses', 'maxTargets', 'falloff', 'dodgeable', 'blockedByCover', 'pierces', 'shape']);
const DAMAGE_KEYS = new Set(['damage', 'damageValue', 'magnitude', 'power']);
const VALID_SHAPES = new Set<Shape>(Object.keys(SHAPE_MULTIPLIERS) as Shape[]);
const VALID_TIERS = new Set<AbilityTier>(['normal', 'elite', 'boss', 'legendary']);
const VALID_EFFECT_KINDS = new Set(['damage', 'buildup', 'heal', 'barrier', 'dispel', 'cleanse', 'displace', 'revive', 'stat_mod', 'subsystem_damage', 'untargetable']);
const VALID_VECTORS = new Set<Vector>(['physical', 'magical', 'technological', 'mental', 'biological']);
const VALID_SUBSYSTEM_TAGS = new Set(['locomotion', 'primary_weapon', 'sensor', 'command', 'power', 'structure', 'life_support']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function jsonSafetyIssues(value: unknown): AbilityValidationIssue<AbilityValidationErrorCode>[] {
    const issues: AbilityValidationIssue<AbilityValidationErrorCode>[] = [];
    const active = new Set<object>();
    const visit = (current: unknown, path: string): void => {
        if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
        if (typeof current === 'number') {
            if (!Number.isFinite(current)) issues.push({ code: AbilityValidationErrorCode.NON_JSON_VALUE, path, message: 'Numbers must be finite JSON numbers.' });
            return;
        }
        if (typeof current === 'function' || typeof current === 'undefined' || typeof current === 'symbol' || typeof current === 'bigint') {
            issues.push({ code: AbilityValidationErrorCode.NON_JSON_VALUE, path, message: 'Callbacks and non-JSON values are forbidden.' });
            return;
        }
        if (typeof current !== 'object') {
            issues.push({ code: AbilityValidationErrorCode.NON_JSON_VALUE, path, message: 'Value is not JSON serializable.' });
            return;
        }
        if (active.has(current)) {
            issues.push({ code: AbilityValidationErrorCode.CYCLIC_REFERENCE, path, message: 'Circular references are forbidden.' });
            return;
        }
        if (!Array.isArray(current) && !isPlainObject(current)) {
            issues.push({ code: AbilityValidationErrorCode.RUNTIME_CLASS_FORBIDDEN, path, message: 'Runtime classes are forbidden; use plain JSON objects.' });
            return;
        }
        active.add(current);
        if (Array.isArray(current)) current.forEach((item, index) => visit(item, `${path}[${index}]`));
        else Object.entries(current).forEach(([key, item]) => visit(item, `${path}.${key}`));
        active.delete(current);
    };
    visit(value, '$');
    return issues;
}

function hasStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function finitePositive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasRequiredKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

/**
 * Expected value delivered across a fan-out: the area under the falloff ramp, discounted so that
 * hitting a crowd is genuinely better than hitting one target while a duel still favours single
 * target. `maxTargets` is therefore a commitment an author pays for, not a free ceiling.
 */
export function pricedTargetsFor(maxTargets: number, falloff: number): number {
    const targets = Math.max(1, Math.trunc(maxTargets));
    const ramp = Math.max(0, Math.min(1, falloff));
    const targetValue = targets * (1 + ramp) / 2;
    return 1 + (targetValue - 1) * CROWD_EFFICIENCY_DISCOUNT;
}
function budgetFor(ability: AbilityDefinition): PowerBudget {
    const base = ability.effects.reduce((total, effect) => {
        if (effect.kind === 'damage' || effect.kind === 'barrier') return total + effect.magnitude;
        if (effect.kind === 'buildup') return total + effect.magnitude * 1.5;
        if (effect.kind === 'heal') return total + effect.magnitude * 1.2;
        return total;
    }, 0);
    // Priced by how many targets the delivery actually reaches now that fan-out is implemented; a
    // fixed per-shape constant under-priced a twelve-target sweep by roughly five times.
    const cost = base * pricedTargetsFor(ability.delivery.maxTargets, ability.delivery.falloff);
    const budget = 15 * ability.auto.cooldown * TIER_MULTIPLIERS[ability.tier];
    return { cost, budget, toleratedBudget: budget * 1.1 };
}

/** Validates one runtime value before it is cast to an AbilityDefinition. */
export function validateAbilityDefinition(value: unknown, options: AbilityValidationOptions): AbilityValidationResult {
    const errors = jsonSafetyIssues(value);
    const warnings: AbilityValidationIssue<AbilityValidationWarningCode>[] = [];
    const error = (code: AbilityValidationErrorCode, path: string, message: string) => errors.push({ code, path, message });
    const warning = (code: AbilityValidationWarningCode, path: string, message: string) => warnings.push({ code, path, message });
    if (!isPlainObject(value)) {
        error(AbilityValidationErrorCode.REQUIRED_FIELD, '$', 'Ability must be a plain JSON object.');
        return { valid: false, errors, warnings };
    }
    const raw = value as Record<string, unknown>;
    const required = ['id', 'name', 'tier', 'delivery', 'effects', 'auto', 'scaleBehavior', 'counters', 'tags'];
    if (!hasRequiredKeys(raw, required)) error(AbilityValidationErrorCode.REQUIRED_FIELD, '$', 'Ability is missing one or more required fields.');
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') error(AbilityValidationErrorCode.REQUIRED_FIELD, '$.id', 'id and name must be strings.');
    if (!VALID_TIERS.has(raw.tier as AbilityTier)) error(AbilityValidationErrorCode.INVALID_ENUM, '$.tier', 'tier is invalid.');
    if (!hasStringArray(raw.counters) || raw.counters.length === 0) error(AbilityValidationErrorCode.COUNTER_REQUIRED, '$.counters', 'At least one counter is required.');
    if (!hasStringArray(raw.tags)) error(AbilityValidationErrorCode.REQUIRED_FIELD, '$.tags', 'tags must be a string array.');

    if (!isPlainObject(raw.delivery)) {
        error(AbilityValidationErrorCode.INVALID_DELIVERY, '$.delivery', 'delivery must be an object.');
    } else {
        const delivery = raw.delivery;
        for (const key of DAMAGE_KEYS) if (key in delivery) error(AbilityValidationErrorCode.DELIVERY_CONTAINS_DAMAGE, `$.delivery.${key}`, 'Damage belongs in an Effect, never Delivery.');
        if (!VALID_SHAPES.has(delivery.shape as Shape)) error(AbilityValidationErrorCode.INVALID_ENUM, '$.delivery.shape', 'Unknown delivery shape.');
        if (!finitePositive(delivery.range) || !Number.isInteger(delivery.maxTargets) || (delivery.maxTargets as number) < 1 || typeof delivery.falloff !== 'number' || (delivery.falloff as number) < 0 || (delivery.falloff as number) > 1 || typeof delivery.dodgeable !== 'boolean' || typeof delivery.blockedByCover !== 'boolean' || typeof delivery.pierces !== 'boolean') {
            error(AbilityValidationErrorCode.INVALID_DELIVERY, '$.delivery', 'Delivery values are invalid.');
        }
        const shape = delivery.shape as Shape;
        if (VALID_SHAPES.has(shape) && typeof delivery.maxTargets === 'number' && delivery.maxTargets > SHAPE_CAPS[shape]) error(AbilityValidationErrorCode.SHAPE_TARGET_CAP_EXCEEDED, '$.delivery.maxTargets', `${shape} permits at most ${SHAPE_CAPS[shape]} targets.`);
        if ((shape === 'cone' && !finitePositive(delivery.angle)) || ((shape === 'line' || shape === 'beam') && !finitePositive(delivery.width)) || ((shape === 'area' || shape === 'aura') && !finitePositive(delivery.radius))) error(AbilityValidationErrorCode.INVALID_DELIVERY, '$.delivery', 'Shape-specific geometry is missing.');
        if (typeof delivery.maxTargets === 'number' && delivery.maxTargets > 8 && shape !== 'sweep' && shape !== 'barrage') warning(AbilityValidationWarningCode.HIGH_TARGET_CAP, '$.delivery.maxTargets', 'Target cap above eight is unusual for this shape.');
    }

    const statusMap = new Map(options.statuses.map(status => [status.id, status]));
    const effects = raw.effects;
    if (!Array.isArray(effects) || effects.length === 0) {
        error(AbilityValidationErrorCode.INVALID_EFFECT, '$.effects', 'At least one Effect is required.');
    } else {
        let encounteredBuildup = false;
        effects.forEach((entry, index) => {
            const path = `$.effects[${index}]`;
            if (!isPlainObject(entry)) { error(AbilityValidationErrorCode.INVALID_EFFECT, path, 'Effect must be an object.'); return; }
            for (const key of GEOMETRY_KEYS) if (key in entry) error(AbilityValidationErrorCode.EFFECT_CONTAINS_GEOMETRY, `${path}.${key}`, 'Geometry belongs in Delivery, never Effect.');
            if (!VALID_EFFECT_KINDS.has(entry.kind as string) || !VALID_VECTORS.has(entry.vector as Vector) || !finitePositive(entry.magnitude) || !isPlainObject(entry.penetration) || !hasStringArray(entry.targetRequirement)) {
                error(AbilityValidationErrorCode.INVALID_EFFECT, path, 'Effect fields are invalid.'); return;
            }
            const effect = entry as unknown as Effect;
            const penetration = entry.penetration;
            if (!['blocked', 'passes', 'consumed', 'attenuated'].includes(penetration.barrier as string)
                || !['blocked', 'passes', 'reduced'].includes(penetration.armor as string)
                || typeof penetration.requiresBodyContact !== 'boolean'
                || typeof penetration.requiresDamageDealt !== 'boolean') {
                error(AbilityValidationErrorCode.INVALID_EFFECT, `${path}.penetration`, 'Penetration requirements are incomplete or invalid.');
                return;
            }
            if (encounteredBuildup && effect.kind === 'damage') error(AbilityValidationErrorCode.DAMAGE_BEFORE_BUILDUP_REQUIRED, path, 'Damage Effects must precede buildup Effects.');
            if (effect.kind === 'buildup') encounteredBuildup = true;
            const incompatible = INCOMPATIBLE_TARGETS[effect.vector] || [];
            if (effect.targetRequirement.some(tag => !VALID_TARGET_TAGS.has(tag) || incompatible.includes(tag))) error(AbilityValidationErrorCode.VECTOR_TARGET_INCOMPATIBLE, `${path}.targetRequirement`, `${effect.vector} is incompatible with one or more target tags.`);
            if (effect.penetration.requiresBodyContact && !effect.targetRequirement.includes('living')) error(AbilityValidationErrorCode.BODY_CONTACT_TARGET_REQUIRED, `${path}.targetRequirement`, 'Body-contact effects must require living targets.');
            if (effect.kind === 'buildup') {
                const status = typeof effect.statusId === 'string' ? statusMap.get(effect.statusId) : undefined;
                if (!status) error(AbilityValidationErrorCode.STATUS_UNKNOWN, `${path}.statusId`, 'Buildup must refer to a known status.');
                else {
                    if (effect.statusId === 'poison' && (!effect.penetration.requiresBodyContact || !effect.targetRequirement.includes('living'))) error(AbilityValidationErrorCode.POISON_REQUIRES_BODY_CONTACT, path, 'Poison requires body contact with a living target.');
                    if (effect.statusId === 'bleed' && !effect.penetration.requiresDamageDealt) error(AbilityValidationErrorCode.BLEED_REQUIRES_DAMAGE_DEALT, path, 'Bleed requires damage dealt.');
                    if (effect.penetration.requiresDamageDealt && !effects.slice(0, index).some((previous: unknown) => isPlainObject(previous) && previous.kind === 'damage')) error(AbilityValidationErrorCode.DAMAGE_PREREQUISITE_REQUIRED, path, 'requiresDamageDealt needs a preceding damage Effect.');
                    if (status.statusClass === 'hard_control' && !status.cureChannels.some(channel => channel !== 'time' && channel !== 'none')) error(AbilityValidationErrorCode.HARD_CC_COUNTER_REQUIRED, `${path}.statusId`, 'Hard control needs a removal channel or countermeasure.');
                }
            }
        });
        if (effects.length > 3) warning(AbilityValidationWarningCode.MANY_EFFECTS, '$.effects', 'More than three Effects increases authoring risk.');
    }

    if (!isPlainObject(raw.auto) || !finitePositive(raw.auto.cooldown) || !hasStringArray(raw.auto.gambitTags)) error(AbilityValidationErrorCode.REQUIRED_FIELD, '$.auto', 'A valid automated profile is required.');
    else if ((raw.auto.cooldown as number) < 0.5) warning(AbilityValidationWarningCode.LOW_COOLDOWN, '$.auto.cooldown', 'Cooldown below 0.5 seconds is advisory.');
    const direct = raw.direct;
    if (direct !== undefined && (!isPlainObject(direct) || !['windupMs', 'activeMs', 'recoveryMs', 'staminaCost'].every(key => typeof direct[key] === 'number' && (direct[key] as number) >= 0))) error(AbilityValidationErrorCode.REQUIRED_FIELD, '$.direct', 'Direct profile timing and stamina values must be non-negative numbers.');

    if (!isPlainObject(raw.scaleBehavior) || raw.scaleBehavior.individual !== 'full' || !['full', 'convert_subsystem', 'attenuate', 'drop'].includes(raw.scaleBehavior.huge as string) || !['full', 'aggregate', 'drop'].includes(raw.scaleBehavior.squad as string) || !['full', 'single_member', 'flagship_only', 'drop'].includes(raw.scaleBehavior.fleet as string)) {
        error(AbilityValidationErrorCode.REQUIRED_FIELD, '$.scaleBehavior', 'Scale behavior must declare every grain.');
    } else if (raw.scaleBehavior.huge === 'convert_subsystem' && (!hasStringArray(raw.scaleBehavior.hugeSubsystemTags) || raw.scaleBehavior.hugeSubsystemTags.length === 0 || raw.scaleBehavior.hugeSubsystemTags.some(tag => !VALID_SUBSYSTEM_TAGS.has(tag)))) {
        error(AbilityValidationErrorCode.SUBSYSTEM_TAG_REQUIRED, '$.scaleBehavior.hugeSubsystemTags', 'Huge conversion must target declared subsystem tags.');
    }

    for (const status of options.statuses) {
        if (!status.id || status.buildupThreshold !== 100 || !finitePositive(status.durationSeconds) || !hasStringArray(status.cureChannels) || status.cureChannels.length === 0) error(AbilityValidationErrorCode.STATUS_INVALID, `$.statuses.${status.id || '?'}`, 'Status threshold (100), duration, and cure channels are required.');
        if (status.cureChannels.includes('none') && raw.tier !== 'boss' && raw.tier !== 'legendary') error(AbilityValidationErrorCode.STATUS_CURE_REQUIRED, `$.statuses.${status.id}`, 'Uncurable statuses require boss or legendary tier.');
        if (status.statusClass === 'hard_control' && !status.cureChannels.some(channel => channel !== 'time' && channel !== 'none')) error(AbilityValidationErrorCode.HARD_CC_COUNTER_REQUIRED, `$.statuses.${status.id}`, 'Hard control status needs a removal channel or countermeasure.');
        if (status.durationSeconds > 6) warning(AbilityValidationWarningCode.LONG_STATUS_DURATION, `$.statuses.${status.id}.durationSeconds`, 'Status exceeds 30% of a typical 20-second engagement.');
    }

    // Lethal timers bypass durability entirely, so they carry constraints no other effect needs.
    const statusById = new Map(options.statuses.map(status => [status.id, status]));
    const effectList = Array.isArray(raw.effects) ? raw.effects as Record<string, unknown>[] : [];
    const lethalEffects = effectList.filter(effect => {
        const definition = typeof effect?.statusId === 'string' ? statusById.get(effect.statusId) : undefined;
        return definition?.statusClass === 'lethal_timer';
    });
    if (lethalEffects.length > 0) {
        const delivery = isPlainObject(raw.delivery) ? raw.delivery : undefined;
        if (raw.tier !== 'elite' && raw.tier !== 'boss' && raw.tier !== 'legendary') error(AbilityValidationErrorCode.LETHAL_TIMER_TIER_TOO_LOW, '$.tier', 'A lethal timer requires elite tier or above.');
        // Cap aggregate buildup per status so splitting 25+25 across two effects cannot bypass the four-hit onset floor.
        const lethalBuildupByStatus = new Map<string, number>();
        for (const effect of lethalEffects) {
            const statusId = typeof effect.statusId === 'string' ? effect.statusId : '';
            const magnitude = typeof effect.magnitude === 'number' ? effect.magnitude : 0;
            lethalBuildupByStatus.set(statusId, (lethalBuildupByStatus.get(statusId) || 0) + magnitude);
        }
        for (const [statusId, total] of lethalBuildupByStatus) {
            if (total > LETHAL_TIMER_MAX_BUILDUP) error(AbilityValidationErrorCode.LETHAL_TIMER_BUILDUP_TOO_HIGH, '$.effects.magnitude', `Lethal timer buildup may not exceed ${LETHAL_TIMER_MAX_BUILDUP} in aggregate per status.`);
            const definition = statusById.get(statusId);
            if (definition && total >= definition.buildupThreshold) error(AbilityValidationErrorCode.LETHAL_TIMER_IMMEDIATE_ONSET, '$.effects.magnitude', 'A lethal timer may not apply on a single hit.');
        }
        if (isPlainObject(raw.auto) && typeof raw.auto.cooldown === 'number' && raw.auto.cooldown < LETHAL_TIMER_MIN_COOLDOWN) error(AbilityValidationErrorCode.LETHAL_TIMER_COOLDOWN_TOO_LOW, '$.auto.cooldown', `A lethal timer requires a cooldown of at least ${LETHAL_TIMER_MIN_COOLDOWN} seconds.`);
        if (!hasStringArray(raw.counters) || raw.counters.length < LETHAL_TIMER_MIN_COUNTERS) {
            error(AbilityValidationErrorCode.LETHAL_TIMER_COUNTER_REQUIRED, '$.counters', `A lethal timer must declare at least ${LETHAL_TIMER_MIN_COUNTERS} counters.`);
        } else if (!raw.counters.some(counter => counter === 'cleanse' || counter === 'dispel')) {
            error(AbilityValidationErrorCode.LETHAL_TIMER_COUNTER_REQUIRED, '$.counters', 'A lethal timer must declare cleanse or dispel among its counters.');
        }
        if (delivery && (delivery.shape !== 'single_target' || (typeof delivery.maxTargets === 'number' && delivery.maxTargets !== 1))) error(AbilityValidationErrorCode.LETHAL_TIMER_MULTI_TARGET, '$.delivery', 'A lethal timer must be single_target with a target cap of one.');
        if (effectList.some(effect => statusById.get(effect?.statusId as string)?.statusClass === 'hard_control')) error(AbilityValidationErrorCode.LETHAL_TIMER_WITH_HARD_CONTROL, '$.effects', 'A lethal timer may not be combined with hard control in one ability.');
        if (isPlainObject(raw.scaleBehavior) && raw.scaleBehavior.huge !== 'convert_subsystem') error(AbilityValidationErrorCode.LETHAL_TIMER_COLOSSAL_DEATH, '$.scaleBehavior.huge', 'A lethal timer must convert to subsystem destruction against colossal targets.');
        // At least one interception layer must exist: dodgeable delivery, or a lethal effect that does not pass barriers.
        if (delivery && delivery.dodgeable === false) {
            const allPassBarrier = lethalEffects.every(effect => {
                const pen = isPlainObject(effect.penetration) ? effect.penetration : undefined;
                return pen?.barrier === 'passes';
            });
            if (allPassBarrier) {
                error(AbilityValidationErrorCode.LETHAL_TIMER_NO_INTERCEPTION, '$.delivery.dodgeable', 'A lethal timer may not be undodgeable while every lethal effect passes barriers.');
            }
        }
    }

    let powerBudget: PowerBudget | undefined;
    if (errors.length === 0) {
        powerBudget = budgetFor(value as unknown as AbilityDefinition);
        if (powerBudget.cost > powerBudget.toleratedBudget) error(AbilityValidationErrorCode.POWER_BUDGET_EXCEEDED, '$.effects', `Cost ${powerBudget.cost} exceeds tolerated budget ${powerBudget.toleratedBudget}.`);
    }
    return { valid: errors.length === 0, errors, warnings, powerBudget };
}

export function validateAbilityFixtureDocument(value: unknown): AbilityValidationResult[] {
    const safety = jsonSafetyIssues(value);
    if (!isPlainObject(value) || value.schemaVersion !== 'combat-ability-v1' || !Array.isArray(value.statuses) || !Array.isArray(value.abilities)) {
        return [{ valid: false, errors: [...safety, { code: AbilityValidationErrorCode.REQUIRED_FIELD, path: '$', message: 'Fixture document is invalid.' }], warnings: [] }];
    }
    return (value as unknown as AbilityFixtureDocument).abilities.map(ability => validateAbilityDefinition(ability, { statuses: (value as unknown as AbilityFixtureDocument).statuses }));
}

export function isJsonSerializable(value: unknown): value is JsonValue {
    return jsonSafetyIssues(value).length === 0;
}
