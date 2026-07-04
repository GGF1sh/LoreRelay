// Vehicle System V4: read-only garage snapshot for Webview (pure, no vscode/fs/DOM).

import {
    canVehicleAccessLocation,
    parseVehicleState,
    validateVehicleFleet,
    type LocationVehicleAccess,
    type VehicleEntry,
    type VehicleState,
} from './vehicleCore';

export const VEHICLE_GARAGE_VIEW_VERSION = 1 as const;

export const MAX_GARAGE_VEHICLES = 12;
export const MAX_GARAGE_MODULES = 8;
export const MAX_GARAGE_ACCESS_LINES = 4;
export const MAX_GARAGE_NAME_CHARS = 80;
export const MAX_GARAGE_LABEL_CHARS = 64;
export const MAX_GARAGE_WARNINGS = 6;

export const VEHICLE_GARAGE_MODULE_KEYS = [
    'id', 'name', 'slot', 'condition',
] as const;

export const VEHICLE_GARAGE_ITEM_KEYS = [
    'id', 'name', 'kind', 'status', 'sizeClass', 'isActive', 'atCurrentLocation',
    'locationLabel', 'parkingLabel', 'condition', 'hp', 'maxHp', 'armorBand',
    'cargoLoad', 'cargoCapacity', 'passengerCapacity', 'crewRequired', 'crewCapacity',
    'powerType', 'fuelCurrent', 'fuelMax', 'fuelBand', 'modules', 'accessRestrictions',
    'accessWarning', 'parkingFallbackId', 'carriedSummary', 'isMobileBase',
] as const;

export const VEHICLE_GARAGE_SNAPSHOT_KEYS = [
    'version', 'activeVehicleId', 'currentLocationId', 'currentLocationLabel',
    'fleetCount', 'vehicles', 'warnings',
] as const;

export type VehicleGarageFuelBand = 'ok' | 'low' | 'empty';

export interface VehicleGarageModuleChip {
    id: string;
    name: string;
    slot: string;
    condition?: string;
}

export interface VehicleGarageListItem {
    id: string;
    name: string;
    kind: string;
    status: string;
    sizeClass: string;
    isActive: boolean;
    atCurrentLocation: boolean;
    locationLabel: string;
    parkingLabel?: string;
    condition: string;
    hp: number;
    maxHp: number;
    armorBand: string;
    cargoLoad: number;
    cargoCapacity: number;
    passengerCapacity: number;
    crewRequired: number;
    crewCapacity: number;
    powerType?: string;
    fuelCurrent?: number;
    fuelMax?: number;
    fuelBand?: VehicleGarageFuelBand;
    modules: VehicleGarageModuleChip[];
    accessRestrictions: string[];
    accessWarning?: string;
    parkingFallbackId?: string;
    carriedSummary?: string;
    isMobileBase: boolean;
}

export interface VehicleGarageSnapshot {
    version: typeof VEHICLE_GARAGE_VIEW_VERSION;
    activeVehicleId?: string;
    currentLocationId?: string;
    currentLocationLabel?: string;
    fleetCount: number;
    vehicles: VehicleGarageListItem[];
    warnings?: string[];
}

export interface VehicleGarageBuildOptions {
    currentLocationId?: string;
    resolveLocationName?: (locationId: string) => string | undefined;
    locationAccess?: LocationVehicleAccess;
    maxVehicles?: number;
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function vehicleLocationId(vehicle: VehicleEntry): string | undefined {
    return vehicle.locationId || vehicle.parkedAt?.locationId || vehicle.parkedAt?.parkingLocationId;
}

function resolveLocationLabel(
    locationId: string | undefined,
    resolve?: (id: string) => string | undefined
): string {
    if (!locationId) { return 'unknown'; }
    return clampText(resolve?.(locationId) || locationId, MAX_GARAGE_LABEL_CHARS);
}

function fuelBand(current: number | undefined, max: number | undefined): VehicleGarageFuelBand | undefined {
    if (max === undefined || max <= 0) { return undefined; }
    const cur = current ?? 0;
    if (cur <= 0) { return 'empty'; }
    if (cur <= 2 || cur / max <= 0.2) { return 'low'; }
    return 'ok';
}

function buildModuleChips(vehicle: VehicleEntry): VehicleGarageModuleChip[] {
    const modules = vehicle.modules ?? [];
    return modules.slice(0, MAX_GARAGE_MODULES).map((mod) => {
        const chip: VehicleGarageModuleChip = {
            id: mod.id,
            name: clampText(mod.name, MAX_GARAGE_NAME_CHARS),
            slot: mod.slot,
        };
        if (mod.condition && mod.condition !== 'ok') {
            chip.condition = mod.condition;
        }
        return chip;
    });
}

function buildCarriedSummary(vehicle: VehicleEntry, state: VehicleState): string | undefined {
    const ids = vehicle.hangar?.carriedVehicleIds;
    if (!ids?.length) { return undefined; }
    const names = ids
        .map((id) => state.vehicles.find((v) => v.id === id)?.name || id)
        .slice(0, 4);
    const used = vehicle.hangar?.usedBays ?? ids.length;
    const cap = vehicle.hangar?.bayCapacity ?? ids.length;
    return `${used}/${cap}: ${names.join(', ')}`;
}

function buildAccessWarning(
    vehicle: VehicleEntry,
    options?: VehicleGarageBuildOptions
): { warning?: string; parkingFallbackId?: string } {
    if (!options?.locationAccess) { return {}; }
    const result = canVehicleAccessLocation(vehicle, options.locationAccess);
    if (result.allowed) { return {}; }
    const warning = `Cannot enter (${result.reason})`;
    return {
        warning: clampText(warning, MAX_GARAGE_LABEL_CHARS),
        parkingFallbackId: result.parkingLocationId,
    };
}

function buildGarageItem(
    vehicle: VehicleEntry,
    state: VehicleState,
    options?: VehicleGarageBuildOptions
): VehicleGarageListItem {
    const locId = vehicleLocationId(vehicle);
    const current = options?.currentLocationId;
    const atCurrent = Boolean(current && locId && locId === current);
    const access = buildAccessWarning(vehicle, options);
    const resources = vehicle.resources;
    const powerType = resources && resources.powerType !== 'none' ? resources.powerType : undefined;
    const fuelCurrent = powerType ? (resources?.current ?? 0) : undefined;
    const fuelMax = powerType ? (resources?.max ?? 0) : undefined;

    const item: VehicleGarageListItem = {
        id: vehicle.id,
        name: clampText(vehicle.name, MAX_GARAGE_NAME_CHARS),
        kind: vehicle.kind,
        status: vehicle.status,
        sizeClass: vehicle.access.sizeClass,
        isActive: state.activeVehicleId === vehicle.id,
        atCurrentLocation: atCurrent,
        locationLabel: resolveLocationLabel(locId, options?.resolveLocationName),
        condition: vehicle.durability.condition,
        hp: vehicle.durability.hp,
        maxHp: vehicle.durability.maxHp,
        armorBand: vehicle.durability.armorBand,
        cargoLoad: vehicle.capacity.currentCargoLoad ?? 0,
        cargoCapacity: vehicle.capacity.cargoCapacity,
        passengerCapacity: vehicle.capacity.passengerCapacity,
        crewRequired: vehicle.capacity.crewRequired,
        crewCapacity: vehicle.capacity.crewCapacity,
        modules: buildModuleChips(vehicle),
        accessRestrictions: (vehicle.access.blockedBy ?? []).slice(0, MAX_GARAGE_ACCESS_LINES),
        isMobileBase: Boolean(vehicle.mobileBase),
    };

    const parkingId = vehicle.parkedAt?.parkingLocationId;
    if (parkingId) {
        item.parkingLabel = resolveLocationLabel(parkingId, options?.resolveLocationName);
    }
    if (powerType) {
        item.powerType = powerType;
        item.fuelCurrent = fuelCurrent;
        item.fuelMax = fuelMax;
        item.fuelBand = fuelBand(fuelCurrent, fuelMax);
    }
    if (access.warning) { item.accessWarning = access.warning; }
    if (access.parkingFallbackId) { item.parkingFallbackId = access.parkingFallbackId; }
    const carried = buildCarriedSummary(vehicle, state);
    if (carried) { item.carriedSummary = clampText(carried, MAX_GARAGE_LABEL_CHARS); }

    return item;
}

function sortGarageVehicles(items: VehicleGarageListItem[]): VehicleGarageListItem[] {
    return [...items].sort((a, b) => {
        if (a.isActive !== b.isActive) { return a.isActive ? -1 : 1; }
        if (a.atCurrentLocation !== b.atCurrentLocation) { return a.atCurrentLocation ? -1 : 1; }
        return a.name.localeCompare(b.name);
    });
}

/** Build a capped, sanitized garage snapshot for Webview (read-only). */
export function buildVehicleGarageSnapshot(
    state: VehicleState | undefined,
    options?: VehicleGarageBuildOptions
): VehicleGarageSnapshot | undefined {
    if (!state?.vehicles.length) { return undefined; }

    const max = Math.min(MAX_GARAGE_VEHICLES, options?.maxVehicles ?? MAX_GARAGE_VEHICLES);
    const fleet = validateVehicleFleet(state);
    const warnings: string[] = [];
    if (!fleet.ok && fleet.issues.length) {
        warnings.push(...fleet.issues.slice(0, 3).map((w) => clampText(w, MAX_GARAGE_LABEL_CHARS)));
    }

    const vehicles = sortGarageVehicles(
        state.vehicles.slice(0, max).map((v) => buildGarageItem(v, state, options))
    );

    const snapshot: VehicleGarageSnapshot = {
        version: VEHICLE_GARAGE_VIEW_VERSION,
        fleetCount: state.vehicles.length,
        vehicles,
    };
    if (state.activeVehicleId) { snapshot.activeVehicleId = state.activeVehicleId; }
    if (options?.currentLocationId) {
        snapshot.currentLocationId = options.currentLocationId;
        snapshot.currentLocationLabel = resolveLocationLabel(
            options.currentLocationId,
            options.resolveLocationName
        );
    }
    if (warnings.length) {
        snapshot.warnings = warnings.slice(0, MAX_GARAGE_WARNINGS);
    }
    return snapshot;
}

/** Shallow key allow-list for Webview payload tests. */
export function pickVehicleGarageModuleKeys(chip: VehicleGarageModuleChip): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of VEHICLE_GARAGE_MODULE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(chip, key)) {
            out[key] = (chip as unknown as Record<string, unknown>)[key];
        }
    }
    return out;
}

export function pickVehicleGarageItemKeys(item: VehicleGarageListItem): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of VEHICLE_GARAGE_ITEM_KEYS) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
            const val = (item as unknown as Record<string, unknown>)[key];
            if (key === 'modules' && Array.isArray(val)) {
                out.modules = val.map((m) => pickVehicleGarageModuleKeys(m as VehicleGarageModuleChip));
            } else {
                out[key] = val;
            }
        }
    }
    return out;
}

export function pickVehicleGarageSnapshotKeys(
    snapshot: VehicleGarageSnapshot
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of VEHICLE_GARAGE_SNAPSHOT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, key)) { continue; }
        const val = (snapshot as unknown as Record<string, unknown>)[key];
        if (key === 'vehicles' && Array.isArray(val)) {
            out.vehicles = val.map((v) => pickVehicleGarageItemKeys(v as VehicleGarageListItem));
        } else {
            out[key] = val;
        }
    }
    return out;
}

/** Parse + rebuild for host bridge entry (sanitized). */
export function buildVehicleGarageSnapshotFromRaw(
    raw: unknown,
    options?: VehicleGarageBuildOptions
): VehicleGarageSnapshot | undefined {
    return buildVehicleGarageSnapshot(parseVehicleState(raw), options);
}