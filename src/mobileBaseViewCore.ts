// Mobile Base System MB4: read-only panel snapshot for Webview (pure, no vscode/fs/DOM).

import type { SettlementStateV1, SettlementStructureStatus } from './settlementCore';
import {
    MAX_MOBILE_BASE_CARRIED_NAMES,
    parseMobileBaseLink,
    validateMobileBaseLink,
} from './mobileBaseCore';
import {
    canVehicleAccessLocation,
    type LocationVehicleAccess,
    type VehicleEntry,
    type VehicleState,
} from './vehicleCore';

export const MOBILE_BASE_PANEL_VERSION = 1 as const;

export const MAX_PANEL_FACILITIES = 8;
export const MAX_PANEL_STOCKS = 8;
export const MAX_PANEL_PROBLEMS = 6;
export const MAX_PANEL_ACCESS_LINES = 4;
export const MAX_PANEL_LABEL_CHARS = 64;
export const MAX_PANEL_NAME_CHARS = 80;
export const MAX_PANEL_WARNINGS = 6;

export type MobileBaseStockBand = 'ok' | 'low' | 'empty';

export const MOBILE_BASE_PANEL_FACILITY_KEYS = ['id', 'name', 'status'] as const;
export const MOBILE_BASE_PANEL_STOCK_KEYS = ['id', 'band'] as const;
export const MOBILE_BASE_PANEL_SNAPSHOT_KEYS = [
    'version', 'settlementName', 'vehicleName', 'vehicleId', 'mode', 'layoutProfile',
    'interiorAccess', 'dockLabel', 'atCurrentLocation', 'currentLocationLabel',
    'accessReasonCode', 'parkingFallbackId', 'exteriorLimits', 'facilities', 'stocks',
    'problems', 'communityCount', 'hp', 'maxHp', 'condition', 'armorBand', 'threatBand',
    'powerType', 'fuelCurrent', 'fuelMax', 'fuelBand', 'hangarSummary', 'carriedVehicles',
    'linkWarnings', 'crewRequired', 'crewCapacity', 'passengerCapacity',
] as const;

export interface MobileBaseFacilityRow {
    id: string;
    name: string;
    status: SettlementStructureStatus;
}

export interface MobileBaseStockRow {
    id: string;
    band: MobileBaseStockBand;
}

export interface MobileBasePanelSnapshot {
    version: typeof MOBILE_BASE_PANEL_VERSION;
    settlementName: string;
    vehicleName: string;
    vehicleId: string;
    mode: string;
    layoutProfile: string;
    interiorAccess?: string;
    dockLabel: string;
    atCurrentLocation: boolean;
    currentLocationLabel?: string;
    accessReasonCode?: string;
    parkingFallbackId?: string;
    exteriorLimits: string[];
    facilities: MobileBaseFacilityRow[];
    stocks: MobileBaseStockRow[];
    problems: string[];
    communityCount?: number;
    hp: number;
    maxHp: number;
    condition: string;
    armorBand: string;
    threatBand?: string;
    powerType?: string;
    fuelCurrent?: number;
    fuelMax?: number;
    fuelBand?: MobileBaseStockBand;
    hangarSummary?: string;
    carriedVehicles: string[];
    linkWarnings?: string[];
    crewRequired: number;
    crewCapacity: number;
    passengerCapacity: number;
}

export interface MobileBasePanelBuildOptions {
    currentLocationId?: string;
    resolveLocationName?: (locationId: string) => string | undefined;
    locationAccess?: LocationVehicleAccess;
    carriedVehicleNames?: Readonly<Record<string, string>>;
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function resolveLabel(
    locationId: string | undefined,
    resolve?: (id: string) => string | undefined
): string {
    if (!locationId) { return 'unknown'; }
    return clampText(resolve?.(locationId) || locationId, MAX_PANEL_LABEL_CHARS);
}

function stockBand(amount: number): MobileBaseStockBand {
    if (amount <= 0) { return 'empty'; }
    if (amount <= 2) { return 'low'; }
    return 'ok';
}

function fuelBand(current: number | undefined, max: number | undefined): MobileBaseStockBand | undefined {
    if (max === undefined || max <= 0) { return undefined; }
    const cur = current ?? 0;
    if (cur <= 0) { return 'empty'; }
    if (cur <= 2 || cur / max <= 0.2) { return 'low'; }
    return 'ok';
}

function listFacilities(settlement: SettlementStateV1, max: number): MobileBaseFacilityRow[] {
    const rows: MobileBaseFacilityRow[] = [];
    for (const s of settlement.structures) {
        if (s.status === 'ruined') { continue; }
        rows.push({
            id: s.id,
            name: clampText(s.name, MAX_PANEL_NAME_CHARS),
            status: s.status,
        });
        if (rows.length >= max) { break; }
    }
    return rows;
}

function listStocks(settlement: SettlementStateV1, max: number): MobileBaseStockRow[] {
    const rows: MobileBaseStockRow[] = [];
    for (const stock of settlement.stocks) {
        rows.push({ id: stock.id, band: stockBand(stock.amount) });
        if (rows.length >= max) { break; }
    }
    return rows;
}

function listProblems(settlement: SettlementStateV1, max: number): string[] {
    const problems: string[] = [];
    for (const incident of settlement.incidents) {
        if (incident.resolved) { continue; }
        problems.push(clampText(incident.text, MAX_PANEL_LABEL_CHARS));
        if (problems.length >= max) { break; }
    }
    for (const s of settlement.structures) {
        if (s.status !== 'damaged' && s.status !== 'under_construction') { continue; }
        problems.push(clampText(`${s.name} (${s.status})`, MAX_PANEL_LABEL_CHARS));
        if (problems.length >= max) { break; }
    }
    return problems.filter(Boolean);
}

function dockLocationId(
    vehicle: VehicleEntry,
    settlement: SettlementStateV1,
    link: NonNullable<ReturnType<typeof parseMobileBaseLink>>
): string | undefined {
    return link.dockedAtLocationId
        || vehicle.parkedAt?.parkingLocationId
        || vehicle.parkedAt?.locationId
        || vehicle.locationId
        || settlement.locationId;
}

/** Build capped mobile-base panel snapshot (read-only Webview). */
export function buildMobileBasePanelSnapshot(
    vehicle: VehicleEntry | undefined,
    settlement: SettlementStateV1 | undefined,
    options?: MobileBasePanelBuildOptions
): MobileBasePanelSnapshot | undefined {
    if (!vehicle || !settlement) { return undefined; }

    const validation = validateMobileBaseLink(vehicle, settlement);
    if (!validation.isMobileBase || !validation.ok) { return undefined; }

    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) { return undefined; }

    const dockId = dockLocationId(vehicle, settlement, link);
    const dockLabel = resolveLabel(dockId, options?.resolveLocationName);
    const current = options?.currentLocationId;
    const atCurrent = Boolean(current && dockId && dockId === current);

    let accessReasonCode: string | undefined;
    let parkingFallbackId: string | undefined;
    if (options?.locationAccess) {
        const access = canVehicleAccessLocation(vehicle, options.locationAccess);
        if (!access.allowed && access.reason !== 'ok') {
            accessReasonCode = access.reason;
            parkingFallbackId = access.parkingLocationId;
        }
    }

    const exteriorLimits = (vehicle.access.blockedBy ?? []).slice(0, MAX_PANEL_ACCESS_LINES);
    const nameMap = options?.carriedVehicleNames ?? {};
    const carriedIds = vehicle.hangar?.carriedVehicleIds ?? [];
    const carriedVehicles = carriedIds
        .slice(0, MAX_MOBILE_BASE_CARRIED_NAMES)
        .map((id) => clampText(nameMap[id] || id, MAX_PANEL_NAME_CHARS));

    let hangarSummary: string | undefined;
    if (carriedIds.length) {
        const used = vehicle.hangar?.usedBays ?? carriedIds.length;
        const cap = vehicle.hangar?.bayCapacity ?? carriedIds.length;
        hangarSummary = `${used}/${cap}: ${carriedVehicles.join(', ')}`;
    }

    const resources = vehicle.resources;
    const powerType = resources && resources.powerType !== 'none' ? resources.powerType : undefined;
    const fuelCurrent = powerType ? (resources?.current ?? 0) : undefined;
    const fuelMax = powerType ? (resources?.max ?? 0) : undefined;

    const snapshot: MobileBasePanelSnapshot = {
        version: MOBILE_BASE_PANEL_VERSION,
        settlementName: clampText(settlement.name, MAX_PANEL_NAME_CHARS),
        vehicleName: clampText(vehicle.name, MAX_PANEL_NAME_CHARS),
        vehicleId: vehicle.id,
        mode: link.mode,
        layoutProfile: link.layoutProfile,
        dockLabel,
        atCurrentLocation: atCurrent,
        exteriorLimits,
        facilities: listFacilities(settlement, MAX_PANEL_FACILITIES),
        stocks: listStocks(settlement, MAX_PANEL_STOCKS),
        problems: listProblems(settlement, MAX_PANEL_PROBLEMS),
        hp: vehicle.durability.hp,
        maxHp: vehicle.durability.maxHp,
        condition: vehicle.durability.condition,
        armorBand: vehicle.durability.armorBand,
        carriedVehicles,
        crewRequired: vehicle.capacity.crewRequired,
        crewCapacity: vehicle.capacity.crewCapacity,
        passengerCapacity: vehicle.capacity.passengerCapacity,
    };

    if (link.interiorAccess && link.interiorAccess !== 'open') {
        snapshot.interiorAccess = link.interiorAccess;
    }
    if (current) {
        snapshot.currentLocationLabel = resolveLabel(current, options?.resolveLocationName);
    }
    if (accessReasonCode) { snapshot.accessReasonCode = accessReasonCode; }
    if (parkingFallbackId) { snapshot.parkingFallbackId = parkingFallbackId; }
    if (vehicle.combat?.threatBand) { snapshot.threatBand = vehicle.combat.threatBand; }
    if (powerType) {
        snapshot.powerType = powerType;
        snapshot.fuelCurrent = fuelCurrent;
        snapshot.fuelMax = fuelMax;
        snapshot.fuelBand = fuelBand(fuelCurrent, fuelMax);
    }
    if (hangarSummary) { snapshot.hangarSummary = clampText(hangarSummary, MAX_PANEL_LABEL_CHARS); }
    if (validation.warnings?.length) {
        snapshot.linkWarnings = validation.warnings
            .map((w) => clampText(w, MAX_PANEL_LABEL_CHARS))
            .slice(0, MAX_PANEL_WARNINGS);
    }
    if (link.mode === 'caravan' || link.mode === 'mobile_community') {
        snapshot.communityCount = settlement.residents.length
            + settlement.visitors.length
            + settlement.merchants.length;
    }

    return snapshot;
}

export function buildMobileBasePanelFromState(
    vehicleState: VehicleState | undefined,
    settlement: SettlementStateV1 | undefined,
    vehicle: VehicleEntry | undefined,
    options?: MobileBasePanelBuildOptions
): MobileBasePanelSnapshot | undefined {
    return buildMobileBasePanelSnapshot(vehicle, settlement, options);
}

export function pickMobileBasePanelSnapshotKeys(
    snapshot: MobileBasePanelSnapshot
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of MOBILE_BASE_PANEL_SNAPSHOT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, key)) { continue; }
        out[key] = (snapshot as unknown as Record<string, unknown>)[key];
    }
    return out;
}