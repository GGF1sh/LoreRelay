// Vehicle System V5: trade/settlement/map integration helpers (pure, no vscode/fs/DOM).

import type { WorldForge, WorldLocation } from './worldForgeCore';
import {
    canVehicleAccessLocation,
    type LocationVehicleAccess,
    type VehicleEntry,
    type VehicleState,
} from './vehicleCore';

export const MAX_VEHICLE_INTEGRATION_LINES = 6;
export const MAX_INTEGRATION_LINE_CHARS = 180;

const REPAIR_SERVICE_TAGS = new Set([
    'repair', 'garage', 'workshop', 'mechanic', 'shipyard', 'blacksmith', 'forge',
]);
const REFUEL_SERVICE_TAGS = new Set([
    'refuel', 'fuel', 'gas', 'dock', 'stable', 'feed', 'granary', 'charging',
]);

export interface VehicleIntegrationPromptInputs {
    state: VehicleState;
    currentLocationId?: string;
    location?: WorldLocation;
    locationAccess?: LocationVehicleAccess;
}

function clampLine(raw: string): string {
    const t = raw.trim().replace(/\s+/g, ' ');
    return t.length <= MAX_INTEGRATION_LINE_CHARS ? t : `${t.slice(0, MAX_INTEGRATION_LINE_CHARS - 3)}...`;
}

function resolveActiveVehicle(state: VehicleState): VehicleEntry | undefined {
    if (state.activeVehicleId) {
        const active = state.vehicles.find((v) => v.id === state.activeVehicleId);
        if (active) { return active; }
    }
    return state.vehicles[0];
}

/** Resolve optional location vehicle access profile from World Forge. */
export function resolveLocationVehicleAccess(
    forge: WorldForge | undefined,
    locationId: string | undefined
): LocationVehicleAccess | undefined {
    if (!forge || !locationId) { return undefined; }
    const loc = forge.geography.locations.find((l) => l.id === locationId);
    return loc?.vehicleAccess;
}

function buildAccessHelperLines(inputs: VehicleIntegrationPromptInputs): string[] {
    const { state, currentLocationId, locationAccess } = inputs;
    if (!currentLocationId || !locationAccess) { return []; }
    const active = resolveActiveVehicle(state);
    if (!active) { return []; }
    const result = canVehicleAccessLocation(active, locationAccess);
    if (result.allowed) { return []; }
    const park = result.parkingLocationId ? `; park at ${result.parkingLocationId}` : '';
    const warn = result.warnings?.length ? ` (${result.warnings[0]})` : '';
    return [clampLine(
        `Cannot enter ${currentLocationId} with ${active.name}: ${result.reason}${park}${warn}.`
    )];
}

function buildTradeRouteLines(active: VehicleEntry | undefined): string[] {
    if (!active) { return []; }
    const lines: string[] = [];
    const cargoCap = active.capacity.cargoCapacity;
    if (cargoCap >= 24) {
        lines.push('Trade: large cargo bay suits bulk caravan runs (narration only; no auto-commerce write).');
    } else if (cargoCap >= 10) {
        lines.push('Trade: moderate cargo capacity supports regional trade loops.');
    }
    const speed = active.mobility?.speedBand;
    if (speed === 'fast' || speed === 'very_fast') {
        lines.push('Trade: fast mobility may shorten overland travel narration.');
    }
    return lines.slice(0, 2);
}

function buildServiceHookLines(
    location: WorldLocation | undefined,
    active: VehicleEntry | undefined
): string[] {
    if (!location?.services?.length || !active) { return []; }
    const services = new Set(location.services.map((s) => s.toLowerCase()));
    const lines: string[] = [];
    const needsRepair = active.durability.condition === 'damaged'
        || active.durability.condition === 'critical'
        || active.durability.hp < active.durability.maxHp * 0.5;
    const fuelMax = active.resources?.max ?? 0;
    const fuelLow = fuelMax > 0 && (active.resources?.current ?? 0) / fuelMax <= 0.25;

    if (needsRepair && [...REPAIR_SERVICE_TAGS].some((tag) => services.has(tag))) {
        lines.push('Services: repair/refit available (persist via turn_result.vehicleOps repair_vehicle).');
    }
    if (fuelLow && [...REFUEL_SERVICE_TAGS].some((tag) => services.has(tag))) {
        lines.push('Services: refuel/resupply available (persist via turn_result.vehicleOps refuel_vehicle).');
    }
    return lines.slice(0, 2);
}

/** GM helper lines for location access, trade narration, and service hooks. */
export function buildVehicleIntegrationPromptLines(
    inputs: VehicleIntegrationPromptInputs
): string[] {
    const active = resolveActiveVehicle(inputs.state);
    const lines = [
        ...buildAccessHelperLines(inputs),
        ...buildTradeRouteLines(active),
        ...buildServiceHookLines(inputs.location, active),
    ];
    return lines.map(clampLine).filter(Boolean).slice(0, MAX_VEHICLE_INTEGRATION_LINES);
}