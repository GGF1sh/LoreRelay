/**
 * JSON-only authoring contract for combat abilities.  These definitions are
 * intentionally resolver-agnostic: they can be validated before an ability
 * is admitted to either the gambit or a future direct-control resolver.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }

export type AbilityTier = 'normal' | 'elite' | 'boss' | 'legendary';
export type Shape = 'single_target' | 'cone' | 'line' | 'area' | 'beam' | 'barrage' | 'sweep' | 'self' | 'aura';
export type Vector = 'physical' | 'magical' | 'technological' | 'mental' | 'biological';
export type TargetTag = 'living' | 'construct' | 'undead' | 'spirit' | 'structure' | 'vehicle' | 'swarm' | 'colossal';
export type SubsystemTag = 'locomotion' | 'primary_weapon' | 'sensor' | 'command' | 'power' | 'structure' | 'life_support';
export type CureChannel = 'cleanse' | 'dispel' | 'antitoxin' | 'emp' | 'extinguish' | 'damage' | 'time' | 'none';
export type StatusStacking = 'refresh' | 'stack_intensity' | 'stack_duration' | 'ignore';
export type StatusClass = 'dot' | 'soft_control' | 'hard_control' | 'lethal_timer' | 'beneficial' | 'debuff';
export type EffectKind = 'damage' | 'buildup' | 'heal' | 'barrier' | 'dispel' | 'cleanse' | 'displace' | 'revive' | 'stat_mod' | 'subsystem_damage' | 'untargetable';
export type PenetrationMode = 'blocked' | 'passes' | 'consumed' | 'attenuated';
export type WeaponScale = 'personal' | 'anti_armor' | 'anti_ship' | 'siege';

export interface Delivery {
    shape: Shape;
    range: number;
    width?: number;
    angle?: number;
    radius?: number;
    pulses?: number;
    maxTargets: number;
    falloff: number;
    dodgeable: boolean;
    blockedByCover: boolean;
    pierces: boolean;
}

export interface PenetrationProfile {
    barrier: PenetrationMode;
    armor: 'blocked' | 'passes' | 'reduced';
    requiresBodyContact: boolean;
    requiresDamageDealt: boolean;
}

export interface Effect {
    kind: EffectKind;
    vector: Vector;
    penetration: PenetrationProfile;
    targetRequirement: TargetTag[];
    magnitude: number;
    statusId?: string;
    weaponScale?: WeaponScale;
    barrierType?: 'kinetic' | 'energy' | 'arcane' | 'vital' | 'universal';
    blocksVectors?: Vector[];
}

export interface StatusDefinition {
    id: string;
    statusClass: StatusClass;
    buildupThreshold: number;
    durationSeconds: number;
    stacking: StatusStacking;
    maxStacks?: number;
    cureChannels: CureChannel[];
    tags: string[];
}

export interface AutoProfile {
    cooldown: number;
    buildupValue?: number;
    gambitTags: string[];
}

export interface DirectProfile {
    windupMs: number;
    activeMs: number;
    recoveryMs: number;
    staminaCost: number;
    iframeMs?: number;
    justWindowMs?: number;
}

export interface ScaleBehavior {
    individual: 'full';
    huge: 'full' | 'convert_subsystem' | 'attenuate' | 'drop';
    squad: 'full' | 'aggregate' | 'drop';
    fleet: 'full' | 'single_member' | 'flagship_only' | 'drop';
    /** Required only for huge: convert_subsystem; names never appear here. */
    hugeSubsystemTags?: SubsystemTag[];
}

export interface AbilityDefinition {
    id: string;
    name: string;
    tier: AbilityTier;
    delivery: Delivery;
    effects: Effect[];
    auto: AutoProfile;
    direct?: DirectProfile;
    scaleBehavior: ScaleBehavior;
    counters: string[];
    tags: string[];
}

export interface AbilityFixtureDocument {
    schemaVersion: 'combat-ability-v1';
    statuses: StatusDefinition[];
    abilities: AbilityDefinition[];
}

export const SHAPE_MULTIPLIERS: Readonly<Record<Shape, number>> = {
    single_target: 1,
    cone: 1.6,
    line: 1.8,
    area: 2,
    beam: 2.2,
    barrage: 2.2,
    sweep: 2.5,
    self: 1.4,
    aura: 1.4,
};

export const TIER_MULTIPLIERS: Readonly<Record<AbilityTier, number>> = {
    normal: 1,
    elite: 1.5,
    boss: 2.5,
    legendary: 4,
};
