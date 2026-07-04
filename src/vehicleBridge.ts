// Vehicle System V4: host bridge for read-only Webview garage panel.

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { loadVehicleState } from './vehicleState';
import { vehicleModeEnabled } from './vehicleCore';
import { resolveLocationVehicleAccess } from './vehicleIntegrationCore';
import {
    buildVehicleGarageSnapshot,
    type VehicleGarageSnapshot,
} from './vehicleViewCore';

function resolveLocationName(locationId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    const loc = forge?.geography.locations.find((l) => l.id === locationId);
    return loc?.name || locationId;
}

export function buildVehicleGarageWebviewPayload(
    currentLocationId?: string | null
): VehicleGarageSnapshot | null {
    const rules = loadGameRules();
    if (!vehicleModeEnabled(rules)) {
        return null;
    }
    const state = loadVehicleState();
    if (!state) {
        return null;
    }
    const loc = typeof currentLocationId === 'string' && currentLocationId.trim()
        ? currentLocationId.trim()
        : undefined;
    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    return buildVehicleGarageSnapshot(state, {
        currentLocationId: loc,
        resolveLocationName,
        locationAccess: resolveLocationVehicleAccess(forge, loc),
    }) ?? null;
}