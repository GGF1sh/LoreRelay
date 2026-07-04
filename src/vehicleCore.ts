// Vehicle System V1: pure parser, access checks, fleet validation, prompt summaries (no vscode/fs/DOM).

import { normalizeCountCap } from './settlementDioramaCore';

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const VEHICLE_STATE_VERSION = 1 as const;

export const MAX_VEHICLES = 24;
export const MAX_VEHICLE_MODULES = 12;
export const MAX_VEHICLE_CARGO = 24;
export const MAX_VEHICLE_CREW = 12;
export const MAX_VEHICLE_NOTES = 12;
export const MAX_CARRIED_VEHICLE_REFS = 24;
export const MAX_VEHICLE_TAGS = 12;
export const MAX_VEHICLE_NAME_CHARS = 80;
export const MAX_VEHICLE_TEXT_CHARS = 120;
export const MAX_VEHICLE_EFFECTS = 6;
export const MAX_VEHICLE_WARNINGS = 8;
export const MAX_PROMPT_VEHICLES = 3;
export const MAX_PROMPT_CARRIED_NAMES = 4;
export const MAX_PROMPT_LINE_CHARS = 180;
export const MAX_VEHICLE_PROMPT_CHARS = 1200;
export const VEHICLE_OPS_PERSIST_LINE =
    'Persist vehicle changes via turn_result.vehicleOps (max 8, enableVehicleSystem ON): set_active_vehicle, move_vehicle, damage_vehicle, repair_vehicle, refuel_vehicle. Cargo/module/carrier ops are not yet wired.';
export const MAX_CAPACITY_VALUE = 999;
export const MAX_HP_VALUE = 9999;
export const MAX_COMBAT_POWER = 999;
export const MAX_RESOURCE_VALUE = 9999;

export const VALID_VEHICLE_KINDS = [
    'beast', 'wagon', 'cart', 'car', 'bike', 'truck', 'armored_vehicle', 'mech',
    'golem', 'boat', 'ship', 'airship', 'shuttle', 'mobile_base', 'other',
] as const;
export type VehicleKind = (typeof VALID_VEHICLE_KINDS)[number];

export const VALID_VEHICLE_STATUSES = [
    'available', 'parked', 'docked', 'stabled', 'deployed', 'damaged', 'disabled', 'lost',
] as const;
export type VehicleStatus = (typeof VALID_VEHICLE_STATUSES)[number];

export const VALID_VEHICLE_OWNER_TYPES = [
    'player', 'party', 'npc', 'faction', 'settlement', 'unknown',
] as const;
export type VehicleOwnerType = (typeof VALID_VEHICLE_OWNER_TYPES)[number];

export const VALID_SIZE_CLASSES = [
    'tiny', 'small', 'medium', 'large', 'huge', 'colossal',
] as const;
export type VehicleSizeClass = (typeof VALID_SIZE_CLASSES)[number];

export const VALID_WIDTH_CLASSES = ['narrow', 'standard', 'wide', 'oversized'] as const;
export type VehicleWidthClass = (typeof VALID_WIDTH_CLASSES)[number];

export const VALID_ACCESS_TAGS = [
    'indoor', 'road', 'offroad', 'narrow_path', 'wide_gate', 'dock', 'harbor', 'stable',
    'hangar', 'landing_zone', 'open_field', 'dungeon_entry', 'tunnel', 'stairs', 'bridge',
    'shallow_water', 'deep_water', 'airspace', 'spaceport',
] as const;
export type VehicleAccessTag = (typeof VALID_ACCESS_TAGS)[number];

export const VALID_ACCESS_BLOCKERS = [
    'stairs', 'ladder', 'narrow_door', 'narrow_tunnel', 'low_ceiling', 'weak_bridge',
    'deep_mud', 'dense_forest', 'urban_crowd', 'sacred_no_vehicle', 'anti_vehicle_barrier',
    'no_docking', 'no_landing',
] as const;
export type VehicleAccessBlocker = (typeof VALID_ACCESS_BLOCKERS)[number];

export const VALID_TERRAIN_TAGS = [
    'road', 'offroad', 'rail', 'water', 'deep_water', 'air', 'space', 'underground',
    'urban', 'wilderness', 'mountain', 'swamp', 'desert', 'snow', 'lava', 'magical',
] as const;
export type VehicleTerrainTag = (typeof VALID_TERRAIN_TAGS)[number];

export const VALID_ROUTE_TAGS = [
    'road_required', 'dock_required', 'stable_required', 'hangar_required',
    'landing_zone_required', 'rail_required', 'deep_channel_required', 'wide_gate_required',
] as const;
export type VehicleRouteTag = (typeof VALID_ROUTE_TAGS)[number];

export const VALID_SPEED_BANDS = ['slow', 'normal', 'fast', 'very_fast'] as const;
export type VehicleSpeedBand = (typeof VALID_SPEED_BANDS)[number];

export const VALID_RANGE_BANDS = ['local', 'regional', 'long', 'very_long'] as const;
export type VehicleRangeBand = (typeof VALID_RANGE_BANDS)[number];

export const VALID_POWER_TYPES = [
    'none', 'fuel', 'feed', 'battery', 'mana', 'steam', 'wind', 'crew', 'reactor',
] as const;
export type VehiclePowerType = (typeof VALID_POWER_TYPES)[number];

export const VALID_CONSUMPTION_BANDS = ['low', 'normal', 'high'] as const;
export type VehicleConsumptionBand = (typeof VALID_CONSUMPTION_BANDS)[number];

export const VALID_ARMOR_BANDS = ['none', 'light', 'medium', 'heavy', 'fortified'] as const;
export type VehicleArmorBand = (typeof VALID_ARMOR_BANDS)[number];

export const VALID_CONDITIONS = ['pristine', 'worn', 'damaged', 'critical', 'disabled'] as const;
export type VehicleCondition = (typeof VALID_CONDITIONS)[number];

export const VALID_THREAT_BANDS = ['none', 'light', 'armed', 'heavy', 'siege'] as const;
export type VehicleThreatBand = (typeof VALID_THREAT_BANDS)[number];

export const VALID_COMBAT_ROLES = [
    'transport', 'scout', 'cargo', 'escort', 'artillery', 'siege', 'anti_beast',
    'anti_vehicle', 'support', 'mobile_base',
] as const;
export type VehicleCombatRole = (typeof VALID_COMBAT_ROLES)[number];

export const VALID_MODULE_SLOTS = [
    'engine', 'weapon', 'armor', 'cargo', 'sensor', 'utility', 'comfort', 'navigation',
    'life_support', 'magic_core', 'other',
] as const;
export type VehicleModuleSlot = (typeof VALID_MODULE_SLOTS)[number];

export const VALID_MODULE_CONDITIONS = ['ok', 'worn', 'damaged', 'disabled'] as const;
export type VehicleModuleCondition = (typeof VALID_MODULE_CONDITIONS)[number];

export const VALID_LAUNCH_TAGS = [
    'ground_ramp', 'dock_crane', 'flight_deck', 'hangar_bay', 'submersible_bay',
    'mech_catapult', 'magic_circle', 'external_mount',
] as const;
export type VehicleLaunchTag = (typeof VALID_LAUNCH_TAGS)[number];

export const VALID_PARKING_KINDS = [
    'parked', 'docked', 'stabled', 'anchored', 'landed', 'orbit',
] as const;
export type VehicleParkingKind = (typeof VALID_PARKING_KINDS)[number];

export const VALID_ACCESS_REASONS = [
    'ok', 'vehicle_too_large', 'missing_required_access', 'blocked_by_location',
    'wrong_terrain', 'no_parking', 'vehicle_disabled', 'unknown_location',
] as const;
export type VehicleAccessReason = (typeof VALID_ACCESS_REASONS)[number];

const SIZE_CLASS_RANK: Record<VehicleSizeClass, number> = {
    tiny: 0,
    small: 1,
    medium: 2,
    large: 3,
    huge: 4,
    colossal: 5,
};

export interface VehicleOwner {
    type: VehicleOwnerType;
    id?: string;
}

export interface VehicleCapacity {
    crewRequired: number;
    crewCapacity: number;
    passengerCapacity: number;
    cargoCapacity: number;
    currentCargoLoad?: number;
}

export interface VehicleAccessProfile {
    sizeClass: VehicleSizeClass;
    widthClass?: VehicleWidthClass;
    accessTags: VehicleAccessTag[];
    blockedBy?: VehicleAccessBlocker[];
}

export interface VehicleMobility {
    speedBand: VehicleSpeedBand;
    rangeBand: VehicleRangeBand;
    terrainTags: VehicleTerrainTag[];
    routeTags?: VehicleRouteTag[];
}

export interface VehicleDurability {
    hp: number;
    maxHp: number;
    armorBand: VehicleArmorBand;
    condition: VehicleCondition;
}

export interface VehicleCombatProfile {
    combatPower: number;
    defensePower: number;
    threatBand: VehicleThreatBand;
    roles?: VehicleCombatRole[];
}

export interface VehicleResources {
    powerType: VehiclePowerType;
    current?: number;
    max?: number;
    consumptionBand?: VehicleConsumptionBand;
}

export interface VehicleModule {
    id: string;
    slot: VehicleModuleSlot;
    name: string;
    condition?: VehicleModuleCondition;
    effects?: string[];
    tags?: string[];
}

export interface VehicleHangarProfile {
    bayCapacity: number;
    usedBays?: number;
    maxCarriedSize: VehicleSizeClass;
    allowedKinds?: VehicleKind[];
    launchTags?: VehicleLaunchTag[];
    carriedVehicleIds?: string[];
}

export interface VehicleParking {
    locationId?: string;
    kind?: VehicleParkingKind;
    parkingLocationId?: string;
    note?: string;
}

export interface VehicleCargoItem {
    id: string;
    label?: string;
    amount?: number;
    tags?: string[];
}

export interface VehicleCrewAssignment {
    npcId?: string;
    role?: string;
    slot?: string;
}

export interface VehicleNote {
    id?: string;
    text: string;
    worldTurn?: number;
}

/** Mobile Base link shape — parsed by mobileBaseCore; optional on VehicleEntry. */
export interface VehicleMobileBaseLinkRaw {
    settlementId: string;
    mode?: string;
    layoutProfile?: string;
    homeLocationId?: string;
    dockedAtLocationId?: string;
    interiorAccess?: string;
}

export interface VehicleEntry {
    id: string;
    name: string;
    kind: VehicleKind;
    owner: VehicleOwner;
    status: VehicleStatus;
    locationId?: string;
    parkedAt?: VehicleParking;
    capacity: VehicleCapacity;
    access: VehicleAccessProfile;
    mobility: VehicleMobility;
    durability: VehicleDurability;
    combat?: VehicleCombatProfile;
    resources?: VehicleResources;
    modules?: VehicleModule[];
    hangar?: VehicleHangarProfile;
    carriedByVehicleId?: string;
    cargo?: VehicleCargoItem[];
    crew?: VehicleCrewAssignment[];
    notes?: VehicleNote[];
    tags?: string[];
    mobileBase?: VehicleMobileBaseLinkRaw;
}

export interface VehicleState {
    version: typeof VEHICLE_STATE_VERSION;
    vehicles: VehicleEntry[];
    activeVehicleId?: string;
    updatedTurn?: number;
    warnings?: string[];
}

export interface LocationVehicleAccess {
    allowedVehicleSizeMax?: VehicleSizeClass;
    requiredAccessTags?: VehicleAccessTag[];
    blockedVehicleTags?: VehicleAccessBlocker[];
    parkingLocationId?: string;
    notes?: string;
}

/** Parse compact location vehicle access profile from world_forge location metadata. */
export function parseLocationVehicleAccess(raw: unknown): LocationVehicleAccess | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const out: LocationVehicleAccess = {};
    if (r.allowedVehicleSizeMax !== undefined) {
        out.allowedVehicleSizeMax = pickUnion(r.allowedVehicleSizeMax, VALID_SIZE_CLASSES, 'medium');
    }
    const required = pickStringArray(r.requiredAccessTags, VALID_ACCESS_TAGS, 8);
    if (required.length) { out.requiredAccessTags = required; }
    const blocked = pickStringArray(r.blockedVehicleTags, VALID_ACCESS_BLOCKERS, 8);
    if (blocked.length) { out.blockedVehicleTags = blocked; }
    const parkingLocationId = asId(r.parkingLocationId);
    if (parkingLocationId) { out.parkingLocationId = parkingLocationId; }
    const notes = clampText(r.notes, MAX_VEHICLE_TEXT_CHARS);
    if (notes) { out.notes = notes; }
    if (
        !out.allowedVehicleSizeMax
        && !out.requiredAccessTags?.length
        && !out.blockedVehicleTags?.length
        && !out.parkingLocationId
        && !out.notes
    ) {
        return undefined;
    }
    return out;
}

export interface VehicleAccessResult {
    allowed: boolean;
    reason: VehicleAccessReason;
    parkingLocationId?: string;
    warnings?: string[];
}

export interface VehicleFleetValidationResult {
    ok: boolean;
    issues: string[];
    warnings?: string[];
}

export interface VehiclePromptOptions {
    currentLocationId?: string;
    nearbyLocationIds?: readonly string[];
    maxVehicles?: number;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) { return fallback; }
    return Math.max(min, Math.min(max, Math.floor(raw)));
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, max);
}

function asId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return ID_RE.test(id) ? id : '';
}

function pickUnion<T extends string>(raw: unknown, valid: readonly T[], fallback: T): T {
    return typeof raw === 'string' && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function pickStringArray<T extends string>(raw: unknown, valid: readonly T[], max: number): T[] {
    if (!Array.isArray(raw)) { return []; }
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (typeof item !== 'string' || !(valid as readonly string[]).includes(item)) { continue; }
        if (seen.has(item)) { continue; }
        seen.add(item);
        out.push(item as T);
        if (out.length >= max) { break; }
    }
    return out;
}

function parseOwner(raw: unknown): VehicleOwner {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { type: 'unknown' };
    }
    const r = raw as Record<string, unknown>;
    const type = pickUnion(r.type, VALID_VEHICLE_OWNER_TYPES, 'unknown');
    const id = asId(r.id);
    return id ? { type, id } : { type };
}

function parseCapacity(raw: unknown): VehicleCapacity {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const crewRequired = clampInt(r.crewRequired, 0, MAX_CAPACITY_VALUE, 0);
    const crewCapacity = clampInt(r.crewCapacity, 0, MAX_CAPACITY_VALUE, 1);
    const passengerCapacity = clampInt(r.passengerCapacity, 0, MAX_CAPACITY_VALUE, 0);
    const cargoCapacity = clampInt(r.cargoCapacity, 0, MAX_CAPACITY_VALUE, 0);
    let currentCargoLoad = clampInt(r.currentCargoLoad, 0, MAX_CAPACITY_VALUE, 0);
    currentCargoLoad = Math.min(currentCargoLoad, cargoCapacity);
    const cap: VehicleCapacity = {
        crewRequired,
        crewCapacity: Math.max(crewRequired, crewCapacity),
        passengerCapacity,
        cargoCapacity,
        currentCargoLoad,
    };
    return cap;
}

function parseAccessProfile(raw: unknown): VehicleAccessProfile {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const sizeClass = pickUnion(r.sizeClass, VALID_SIZE_CLASSES, 'medium');
    const widthClass = pickUnion(r.widthClass, VALID_WIDTH_CLASSES, 'standard');
    const accessTags = pickStringArray(r.accessTags, VALID_ACCESS_TAGS, MAX_VEHICLE_TAGS);
    const blockedBy = pickStringArray(r.blockedBy, VALID_ACCESS_BLOCKERS, MAX_VEHICLE_TAGS);
    const profile: VehicleAccessProfile = { sizeClass, accessTags: accessTags.length ? accessTags : ['road'] };
    if (widthClass !== 'standard') { profile.widthClass = widthClass; }
    if (blockedBy.length) { profile.blockedBy = blockedBy; }
    return profile;
}

function parseMobility(raw: unknown): VehicleMobility {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const terrainTags = pickStringArray(r.terrainTags, VALID_TERRAIN_TAGS, MAX_VEHICLE_TAGS);
    const routeTags = pickStringArray(r.routeTags, VALID_ROUTE_TAGS, MAX_VEHICLE_TAGS);
    const mobility: VehicleMobility = {
        speedBand: pickUnion(r.speedBand, VALID_SPEED_BANDS, 'normal'),
        rangeBand: pickUnion(r.rangeBand, VALID_RANGE_BANDS, 'local'),
        terrainTags: terrainTags.length ? terrainTags : ['road'],
    };
    if (routeTags.length) { mobility.routeTags = routeTags; }
    return mobility;
}

function parseDurability(raw: unknown): VehicleDurability {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const maxHp = clampInt(r.maxHp, 1, MAX_HP_VALUE, 10);
    const hp = Math.min(clampInt(r.hp, 0, MAX_HP_VALUE, maxHp), maxHp);
    return {
        hp,
        maxHp,
        armorBand: pickUnion(r.armorBand, VALID_ARMOR_BANDS, 'none'),
        condition: pickUnion(r.condition, VALID_CONDITIONS, 'worn'),
    };
}

function parseCombat(raw: unknown): VehicleCombatProfile | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const roles = pickStringArray(r.roles, VALID_COMBAT_ROLES, MAX_VEHICLE_TAGS);
    const combat: VehicleCombatProfile = {
        combatPower: clampInt(r.combatPower, 0, MAX_COMBAT_POWER, 0),
        defensePower: clampInt(r.defensePower, 0, MAX_COMBAT_POWER, 0),
        threatBand: pickUnion(r.threatBand, VALID_THREAT_BANDS, 'none'),
    };
    if (roles.length) { combat.roles = roles; }
    return combat;
}

function parseResources(raw: unknown): VehicleResources | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const powerType = pickUnion(r.powerType, VALID_POWER_TYPES, 'none');
    if (powerType === 'none') { return { powerType: 'none' }; }
    const max = clampInt(r.max, 0, MAX_RESOURCE_VALUE, 0);
    const current = Math.min(clampInt(r.current, 0, MAX_RESOURCE_VALUE, max), max);
    const res: VehicleResources = { powerType, current, max };
    const band = pickUnion(r.consumptionBand, VALID_CONSUMPTION_BANDS, 'normal');
    if (band !== 'normal') { res.consumptionBand = band; }
    return res;
}

function parseModule(raw: unknown): VehicleModule | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = clampText(r.name, MAX_VEHICLE_NAME_CHARS);
    if (!id || !name) { return undefined; }
    const mod: VehicleModule = {
        id,
        slot: pickUnion(r.slot, VALID_MODULE_SLOTS, 'other'),
        name,
    };
    const cond = pickUnion(r.condition, VALID_MODULE_CONDITIONS, 'ok');
    if (cond !== 'ok') { mod.condition = cond; }
    const effects = Array.isArray(r.effects)
        ? r.effects.map((e) => clampText(e, 48)).filter(Boolean).slice(0, MAX_VEHICLE_EFFECTS)
        : [];
    if (effects.length) { mod.effects = effects; }
    const tags = Array.isArray(r.tags)
        ? r.tags.map((t) => clampText(t, 32)).filter(Boolean).slice(0, MAX_VEHICLE_TAGS)
        : [];
    if (tags.length) { mod.tags = tags; }
    return mod;
}

function parseHangar(raw: unknown): VehicleHangarProfile | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const bayCapacity = clampInt(r.bayCapacity, 0, MAX_CARRIED_VEHICLE_REFS, 0);
    const usedBays = clampInt(r.usedBays, 0, bayCapacity, 0);
    const carriedVehicleIds: string[] = [];
    if (Array.isArray(r.carriedVehicleIds)) {
        const seen = new Set<string>();
        for (const item of r.carriedVehicleIds) {
            const id = asId(item);
            if (!id || seen.has(id)) { continue; }
            seen.add(id);
            carriedVehicleIds.push(id);
            if (carriedVehicleIds.length >= MAX_CARRIED_VEHICLE_REFS) { break; }
        }
    }
    const hangar: VehicleHangarProfile = {
        bayCapacity,
        maxCarriedSize: pickUnion(r.maxCarriedSize, VALID_SIZE_CLASSES, 'small'),
    };
    if (usedBays > 0) { hangar.usedBays = usedBays; }
    const allowedKinds = pickStringArray(r.allowedKinds, VALID_VEHICLE_KINDS, MAX_VEHICLE_TAGS);
    if (allowedKinds.length) { hangar.allowedKinds = allowedKinds; }
    const launchTags = pickStringArray(r.launchTags, VALID_LAUNCH_TAGS, MAX_VEHICLE_TAGS);
    if (launchTags.length) { hangar.launchTags = launchTags; }
    if (carriedVehicleIds.length) { hangar.carriedVehicleIds = carriedVehicleIds; }
    return hangar;
}

function parseParking(raw: unknown): VehicleParking | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const parking: VehicleParking = {};
    const locationId = asId(r.locationId);
    if (locationId) { parking.locationId = locationId; }
    const parkingLocationId = asId(r.parkingLocationId);
    if (parkingLocationId) { parking.parkingLocationId = parkingLocationId; }
    const kind = pickUnion(r.kind, VALID_PARKING_KINDS, 'parked');
    if (kind) { parking.kind = kind; }
    const note = clampText(r.note, MAX_VEHICLE_TEXT_CHARS);
    if (note) { parking.note = note; }
    return Object.keys(parking).length ? parking : undefined;
}

function parseCargoItem(raw: unknown): VehicleCargoItem | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    if (!id) { return undefined; }
    const item: VehicleCargoItem = { id };
    const label = clampText(r.label, MAX_VEHICLE_NAME_CHARS);
    if (label) { item.label = label; }
    if (typeof r.amount === 'number' && Number.isFinite(r.amount)) {
        item.amount = Math.max(0, Math.min(MAX_CAPACITY_VALUE, Math.floor(r.amount)));
    }
    const tags = Array.isArray(r.tags)
        ? r.tags.map((t) => clampText(t, 32)).filter(Boolean).slice(0, MAX_VEHICLE_TAGS)
        : [];
    if (tags.length) { item.tags = tags; }
    return item;
}

function parseCrew(raw: unknown): VehicleCrewAssignment | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const crew: VehicleCrewAssignment = {};
    const npcId = asId(r.npcId);
    if (npcId) { crew.npcId = npcId; }
    const role = clampText(r.role, 48);
    if (role) { crew.role = role; }
    const slot = clampText(r.slot, 48);
    if (slot) { crew.slot = slot; }
    return crew.npcId || crew.role || crew.slot ? crew : undefined;
}

function parseNote(raw: unknown): VehicleNote | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const text = clampText(r.text, MAX_VEHICLE_TEXT_CHARS);
    if (!text) { return undefined; }
    const note: VehicleNote = { text };
    const id = asId(r.id);
    if (id) { note.id = id; }
    if (typeof r.worldTurn === 'number' && Number.isFinite(r.worldTurn)) {
        note.worldTurn = Math.max(0, Math.floor(r.worldTurn));
    }
    return note;
}

function parseMobileBaseLinkRaw(raw: unknown): VehicleMobileBaseLinkRaw | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const settlementId = asId(r.settlementId);
    if (!settlementId) { return undefined; }
    const link: VehicleMobileBaseLinkRaw = { settlementId };
    const mode = clampText(r.mode, 32);
    if (mode) { link.mode = mode; }
    const layoutProfile = clampText(r.layoutProfile, 32);
    if (layoutProfile) { link.layoutProfile = layoutProfile; }
    const homeLocationId = asId(r.homeLocationId);
    if (homeLocationId) { link.homeLocationId = homeLocationId; }
    const dockedAtLocationId = asId(r.dockedAtLocationId);
    if (dockedAtLocationId) { link.dockedAtLocationId = dockedAtLocationId; }
    const interiorAccess = clampText(r.interiorAccess, 32);
    if (interiorAccess) { link.interiorAccess = interiorAccess; }
    return link;
}

function parseVehicleEntry(raw: unknown): VehicleEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = clampText(r.name, MAX_VEHICLE_NAME_CHARS);
    if (!id || !name) { return undefined; }
    const entry: VehicleEntry = {
        id,
        name,
        kind: pickUnion(r.kind, VALID_VEHICLE_KINDS, 'other'),
        owner: parseOwner(r.owner),
        status: pickUnion(r.status, VALID_VEHICLE_STATUSES, 'available'),
        capacity: parseCapacity(r.capacity),
        access: parseAccessProfile(r.access),
        mobility: parseMobility(r.mobility),
        durability: parseDurability(r.durability),
    };
    const locationId = asId(r.locationId);
    if (locationId) { entry.locationId = locationId; }
    const parkedAt = parseParking(r.parkedAt);
    if (parkedAt) { entry.parkedAt = parkedAt; }
    const combat = parseCombat(r.combat);
    if (combat) { entry.combat = combat; }
    const resources = parseResources(r.resources);
    if (resources) { entry.resources = resources; }
    if (Array.isArray(r.modules)) {
        const modules: VehicleModule[] = [];
        for (const item of r.modules) {
            const mod = parseModule(item);
            if (mod) { modules.push(mod); }
            if (modules.length >= MAX_VEHICLE_MODULES) { break; }
        }
        if (modules.length) { entry.modules = modules; }
    }
    const hangar = parseHangar(r.hangar);
    if (hangar) { entry.hangar = hangar; }
    const carriedByVehicleId = asId(r.carriedByVehicleId);
    if (carriedByVehicleId) { entry.carriedByVehicleId = carriedByVehicleId; }
    if (Array.isArray(r.cargo)) {
        const cargo: VehicleCargoItem[] = [];
        for (const item of r.cargo) {
            const c = parseCargoItem(item);
            if (c) { cargo.push(c); }
            if (cargo.length >= MAX_VEHICLE_CARGO) { break; }
        }
        if (cargo.length) { entry.cargo = cargo; }
    }
    if (Array.isArray(r.crew)) {
        const crew: VehicleCrewAssignment[] = [];
        for (const item of r.crew) {
            const c = parseCrew(item);
            if (c) { crew.push(c); }
            if (crew.length >= MAX_VEHICLE_CREW) { break; }
        }
        if (crew.length) { entry.crew = crew; }
    }
    if (Array.isArray(r.notes)) {
        const notes: VehicleNote[] = [];
        for (const item of r.notes) {
            const n = parseNote(item);
            if (n) { notes.push(n); }
            if (notes.length >= MAX_VEHICLE_NOTES) { break; }
        }
        if (notes.length) { entry.notes = notes; }
    }
    const tags = Array.isArray(r.tags)
        ? r.tags.map((t) => clampText(t, 32)).filter(Boolean).slice(0, MAX_VEHICLE_TAGS)
        : [];
    if (tags.length) { entry.tags = tags; }
    const mobileBase = parseMobileBaseLinkRaw(r.mobileBase);
    if (mobileBase) { entry.mobileBase = mobileBase; }
    return entry;
}

export type VehicleParseIssueCode =
    | 'invalid_root'
    | 'invalid_version'
    | 'duplicate_vehicle_id'
    | 'resource_over_max';

export interface VehicleParseIssue {
    code: VehicleParseIssueCode;
    message: string;
    vehicleId?: string;
}

/** Structural checks on raw JSON before parseVehicleState normalization. */
export function diagnoseVehicleStateRaw(raw: unknown): VehicleParseIssue[] {
    const issues: VehicleParseIssue[] = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        issues.push({
            code: 'invalid_root',
            message: 'vehicle_state.json root must be a JSON object.',
        });
        return issues;
    }
    const r = raw as Record<string, unknown>;
    if (r.version !== VEHICLE_STATE_VERSION) {
        issues.push({
            code: 'invalid_version',
            message: `Expected version ${VEHICLE_STATE_VERSION}, got ${String(r.version)}.`,
        });
    }
    if (!Array.isArray(r.vehicles)) { return issues; }

    const seenIds = new Set<string>();
    for (const item of r.vehicles) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) { continue; }
        const row = item as Record<string, unknown>;
        const id = asId(row.id);
        if (!id) { continue; }
        if (seenIds.has(id)) {
            issues.push({
                code: 'duplicate_vehicle_id',
                message: `Duplicate vehicle id "${id}" in raw vehicle_state.json.`,
                vehicleId: id,
            });
        } else {
            seenIds.add(id);
        }
        const resources = row.resources;
        if (!resources || typeof resources !== 'object' || Array.isArray(resources)) { continue; }
        const res = resources as Record<string, unknown>;
        if (res.powerType === 'none') { continue; }
        const current = typeof res.current === 'number' && Number.isFinite(res.current)
            ? res.current
            : undefined;
        const max = typeof res.max === 'number' && Number.isFinite(res.max)
            ? res.max
            : undefined;
        if (current !== undefined && max !== undefined && current > max) {
            issues.push({
                code: 'resource_over_max',
                message: `Vehicle ${id} raw resource current (${current}) exceeds max (${max}).`,
                vehicleId: id,
            });
        }
    }
    return issues;
}

export function parseVehicleState(input: unknown): VehicleState {
    const empty: VehicleState = { version: VEHICLE_STATE_VERSION, vehicles: [] };
    if (!input || typeof input !== 'object' || Array.isArray(input)) { return empty; }
    const r = input as Record<string, unknown>;
    if (r.version !== VEHICLE_STATE_VERSION) { return empty; }
    const vehicles: VehicleEntry[] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(r.vehicles)) {
        for (const item of r.vehicles) {
            const entry = parseVehicleEntry(item);
            if (!entry || seenIds.has(entry.id)) { continue; }
            seenIds.add(entry.id);
            vehicles.push(entry);
            if (vehicles.length >= MAX_VEHICLES) { break; }
        }
    }
    const state: VehicleState = { version: VEHICLE_STATE_VERSION, vehicles };
    const activeVehicleId = asId(r.activeVehicleId);
    if (activeVehicleId && seenIds.has(activeVehicleId)) {
        state.activeVehicleId = activeVehicleId;
    }
    if (typeof r.updatedTurn === 'number' && Number.isFinite(r.updatedTurn)) {
        state.updatedTurn = Math.max(0, Math.floor(r.updatedTurn));
    }
    if (Array.isArray(r.warnings)) {
        const warnings = r.warnings
            .map((w) => clampText(w, MAX_VEHICLE_TEXT_CHARS))
            .filter(Boolean)
            .slice(0, MAX_VEHICLE_WARNINGS);
        if (warnings.length) { state.warnings = warnings; }
    }
    return state;
}

function sizeRank(size: VehicleSizeClass): number {
    return SIZE_CLASS_RANK[size] ?? 2;
}

export function canVehicleAccessLocation(
    vehicle: VehicleEntry,
    locationAccess: LocationVehicleAccess | undefined
): VehicleAccessResult {
    if (vehicle.status === 'disabled' || vehicle.status === 'lost') {
        return { allowed: false, reason: 'vehicle_disabled' };
    }
    if (!locationAccess) {
        return { allowed: false, reason: 'unknown_location' };
    }
    const parkingLocationId = asId(locationAccess.parkingLocationId) || undefined;
    const warnings: string[] = [];
    if (locationAccess.notes) {
        const note = clampText(locationAccess.notes, MAX_VEHICLE_TEXT_CHARS);
        if (note) { warnings.push(note); }
    }

    if (locationAccess.allowedVehicleSizeMax) {
        if (sizeRank(vehicle.access.sizeClass) > sizeRank(locationAccess.allowedVehicleSizeMax)) {
            const result: VehicleAccessResult = {
                allowed: false,
                reason: 'vehicle_too_large',
                warnings,
            };
            if (parkingLocationId) {
                result.parkingLocationId = parkingLocationId;
            } else {
                result.reason = 'no_parking';
                warnings.push('No safe parking location is defined for this oversized vehicle.');
            }
            return result;
        }
    }

    const required = locationAccess.requiredAccessTags ?? [];
    for (const tag of required) {
        if (!vehicle.access.accessTags.includes(tag)) {
            const result: VehicleAccessResult = {
                allowed: false,
                reason: 'missing_required_access',
                warnings: [...warnings, `Vehicle lacks required access: ${tag}.`],
            };
            if (parkingLocationId) { result.parkingLocationId = parkingLocationId; }
            return result;
        }
    }

    const blocked = locationAccess.blockedVehicleTags ?? [];
    const vehicleBlockers = new Set(vehicle.access.blockedBy ?? []);
    for (const blocker of blocked) {
        if (vehicleBlockers.has(blocker)) {
            const result: VehicleAccessResult = {
                allowed: false,
                reason: 'blocked_by_location',
                warnings: [...warnings, `Blocked by location rule: ${blocker}.`],
            };
            if (parkingLocationId) { result.parkingLocationId = parkingLocationId; }
            return result;
        }
    }

    return { allowed: true, reason: 'ok', parkingLocationId, warnings: warnings.length ? warnings : undefined };
}

function collectCarrierGraph(state: VehicleState): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const v of state.vehicles) {
        const children = new Set<string>();
        if (v.hangar?.carriedVehicleIds) {
            for (const id of v.hangar.carriedVehicleIds) { children.add(id); }
        }
        for (const other of state.vehicles) {
            if (other.carriedByVehicleId === v.id) { children.add(other.id); }
        }
        graph.set(v.id, [...children]);
    }
    return graph;
}

function hasCycleFrom(startId: string, graph: Map<string, string[]>, visiting: Set<string>, visited: Set<string>): boolean {
    if (visiting.has(startId)) { return true; }
    if (visited.has(startId)) { return false; }
    visiting.add(startId);
    for (const child of graph.get(startId) ?? []) {
        if (hasCycleFrom(child, graph, visiting, visited)) { return true; }
    }
    visiting.delete(startId);
    visited.add(startId);
    return false;
}

export function validateVehicleFleet(state: VehicleState): VehicleFleetValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const byId = new Map(state.vehicles.map((v) => [v.id, v]));

    for (const vehicle of state.vehicles) {
        if (vehicle.carriedByVehicleId === vehicle.id) {
            issues.push(`Vehicle ${vehicle.id} cannot carry itself.`);
        }
        if (vehicle.carriedByVehicleId && !byId.has(vehicle.carriedByVehicleId)) {
            issues.push(`Vehicle ${vehicle.id} references missing carrier ${vehicle.carriedByVehicleId}.`);
        }
        const carried = vehicle.hangar?.carriedVehicleIds ?? [];
        if (carried.length > MAX_CARRIED_VEHICLE_REFS) {
            warnings.push(`Vehicle ${vehicle.id} hangar list was capped at parse time.`);
        }
        const checkChild = (childId: string, via: 'hangar' | 'carriedBy') => {
            if (childId === vehicle.id) {
                issues.push(
                    via === 'hangar'
                        ? `Vehicle ${vehicle.id} hangar cannot list itself.`
                        : `Vehicle ${vehicle.id} cannot carry itself.`
                );
                return;
            }
            const child = byId.get(childId);
            if (!child) {
                issues.push(`Vehicle ${vehicle.id} ${via} references missing vehicle ${childId}.`);
                return;
            }
            const maxSize = vehicle.hangar?.maxCarriedSize ?? 'small';
            if (sizeRank(child.access.sizeClass) > sizeRank(maxSize)) {
                issues.push(
                    `Vehicle ${childId} (${child.access.sizeClass}) exceeds carrier ${vehicle.id} maxCarriedSize (${maxSize}).`
                );
            }
        };
        for (const childId of carried) {
            checkChild(childId, 'hangar');
        }
    }

    for (const vehicle of state.vehicles) {
        if (!vehicle.carriedByVehicleId) { continue; }
        const carrier = byId.get(vehicle.carriedByVehicleId);
        if (!carrier) { continue; }
        const maxSize = carrier.hangar?.maxCarriedSize ?? 'small';
        if (sizeRank(vehicle.access.sizeClass) > sizeRank(maxSize)) {
            issues.push(
                `Vehicle ${vehicle.id} (${vehicle.access.sizeClass}) exceeds carrier ${carrier.id} maxCarriedSize (${maxSize}).`
            );
        }
    }

    const graph = collectCarrierGraph(state);
    const visited = new Set<string>();
    for (const id of graph.keys()) {
        if (hasCycleFrom(id, graph, new Set(), visited)) {
            issues.push('Carrier/hangar graph contains a cycle.');
            break;
        }
    }

    return { ok: issues.length === 0, issues, warnings: warnings.length ? warnings : undefined };
}

function clampPromptLine(line: string): string {
    const t = line.trim().replace(/\s+/g, ' ');
    return t.length <= MAX_PROMPT_LINE_CHARS ? t : `${t.slice(0, MAX_PROMPT_LINE_CHARS - 3)}...`;
}

function vehicleLocationId(vehicle: VehicleEntry): string | undefined {
    return vehicle.locationId || vehicle.parkedAt?.locationId || vehicle.parkedAt?.parkingLocationId;
}

function summarizeVehicleLine(vehicle: VehicleEntry, state: VehicleState): string[] {
    const lines: string[] = [];
    const loc = vehicleLocationId(vehicle);
    const locPart = loc ? ` at ${loc}` : '';
    lines.push(clampPromptLine(
        `Vehicle: ${vehicle.name} (${vehicle.kind}, ${vehicle.access.sizeClass})${locPart}.`
    ));
    const cap = vehicle.capacity;
    lines.push(clampPromptLine(
        `Capacity: crew ${cap.crewRequired}/${cap.crewCapacity}, passengers ${cap.passengerCapacity}, cargo ${cap.currentCargoLoad ?? 0}/${cap.cargoCapacity}.`
    ));
    const dur = vehicle.durability;
    const fuelPart = vehicle.resources && vehicle.resources.powerType !== 'none'
        ? `, ${vehicle.resources.powerType} ${vehicle.resources.current ?? 0}/${vehicle.resources.max ?? 0}`
        : '';
    lines.push(clampPromptLine(
        `Condition: ${dur.condition}, HP ${dur.hp}/${dur.maxHp}, armor ${dur.armorBand}${fuelPart}.`
    ));
    if (vehicle.hangar?.carriedVehicleIds?.length) {
        const names = vehicle.hangar.carriedVehicleIds
            .map((id) => state.vehicles.find((v) => v.id === id)?.name)
            .filter((n): n is string => Boolean(n))
            .slice(0, MAX_PROMPT_CARRIED_NAMES);
        if (names.length) {
            const used = vehicle.hangar.usedBays ?? names.length;
            const capBays = vehicle.hangar.bayCapacity;
            lines.push(clampPromptLine(`Carrier: carries ${used}/${capBays}: ${names.join(', ')}.`));
        }
    }
    return lines;
}

function selectPromptVehicles(state: VehicleState, options?: VehiclePromptOptions): VehicleEntry[] {
    const max = normalizeCountCap(options?.maxVehicles, MAX_PROMPT_VEHICLES);
    const current = options?.currentLocationId;
    const nearby = new Set(options?.nearbyLocationIds ?? []);
    const selected: VehicleEntry[] = [];
    const seen = new Set<string>();

    const tryAdd = (v: VehicleEntry | undefined) => {
        if (!v || seen.has(v.id)) { return; }
        seen.add(v.id);
        selected.push(v);
    };

    if (state.activeVehicleId) {
        tryAdd(state.vehicles.find((v) => v.id === state.activeVehicleId));
    }
    if (current) {
        for (const v of state.vehicles) {
            if (vehicleLocationId(v) === current) { tryAdd(v); }
            if (selected.length >= max) { return selected; }
        }
    }
    for (const v of state.vehicles) {
        const loc = vehicleLocationId(v);
        if (loc && nearby.has(loc)) { tryAdd(v); }
        if (selected.length >= max) { return selected; }
    }
    for (const v of state.vehicles) {
        tryAdd(v);
        if (selected.length >= max) { break; }
    }
    return selected;
}

export function vehicleModeEnabled(rules: { enableVehicleSystem?: boolean } | undefined): boolean {
    return rules?.enableVehicleSystem === true;
}

/** Prompt-safe vehicle summary; pass enabled=false or omit state to emit nothing. */
export function buildVehiclePromptBlock(
    state: VehicleState | undefined,
    enabled: boolean,
    options?: VehiclePromptOptions
): string {
    if (!enabled || !state || !state.vehicles.length) { return ''; }

    const fleet = validateVehicleFleet(state);
    const lines: string[] = ['[Vehicles]'];
    if (!fleet.ok && fleet.issues.length) {
        lines.push(
            clampPromptLine(`Fleet issues: ${fleet.issues.slice(0, 3).join('; ')}.`)
        );
    }
    lines.push(...buildVehiclePromptLines(state, options));
    lines.push(VEHICLE_OPS_PERSIST_LINE);

    let block = lines.join('\n');
    if (block.length > MAX_VEHICLE_PROMPT_CHARS) {
        block = `${block.slice(0, MAX_VEHICLE_PROMPT_CHARS - 20)}...[truncated]`;
    }
    return block;
}

export function buildVehiclePromptLines(state: VehicleState, options?: VehiclePromptOptions): string[] {
    if (!state.vehicles.length) { return []; }
    const lines: string[] = [];
    if (state.vehicles.length > 1) {
        lines.push(clampPromptLine(`Fleet: ${state.vehicles.length} vehicles owned.`));
    }
    const vehicles = selectPromptVehicles(state, options);
    for (const vehicle of vehicles) {
        lines.push(...summarizeVehicleLine(vehicle, state));
        if (vehicle.id === state.activeVehicleId && vehicle.access.blockedBy?.length) {
            lines.push(clampPromptLine(
                `Access limits: blocked by ${vehicle.access.blockedBy.slice(0, 4).join(', ')}.`
            ));
        }
    }
    return lines.slice(0, MAX_PROMPT_VEHICLES * 4 + 1);
}