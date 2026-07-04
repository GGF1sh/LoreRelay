// Mobile Base System MB2/MB4: workspace loaders + GM prompt + Webview panel (no mobileBaseOps writes).

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildCarriedVehicleNameMap,
    buildMobileBasePromptBlock,
    mobileBaseSystemEnabled,
    resolveActiveMobileBaseVehicle,
} from './mobileBaseCore';
import { buildMobileBasePanelSnapshot, type MobileBasePanelSnapshot } from './mobileBaseViewCore';
import { loadSettlementState } from './settlementState';
import { loadVehicleState } from './vehicleState';

export { mobileBaseSystemEnabled } from './mobileBaseCore';

function resolveLocationName(locationId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    const loc = forge?.geography.locations.find((l) => l.id === locationId);
    return loc?.name || locationId;
}

export function buildMobileBasePromptContext(): string {
    const rules = loadGameRules();
    if (!mobileBaseSystemEnabled(rules)) {
        return '';
    }

    const vehicleState = loadVehicleState();
    const vehicle = resolveActiveMobileBaseVehicle(vehicleState);
    if (!vehicle) {
        return '';
    }

    const settlement = loadSettlementState();
    return buildMobileBasePromptBlock(vehicle, settlement, true, {
        carriedVehicleNames: buildCarriedVehicleNameMap(vehicleState),
    });
}

/** Read-only MB4 panel payload for Webview (triple gate). */
export function buildMobileBasePanelWebviewPayload(
    currentLocationId?: string | null
): MobileBasePanelSnapshot | null {
    const rules = loadGameRules();
    if (!mobileBaseSystemEnabled(rules)) {
        return null;
    }
    const vehicleState = loadVehicleState();
    const vehicle = resolveActiveMobileBaseVehicle(vehicleState);
    if (!vehicle) {
        return null;
    }
    const settlement = loadSettlementState();
    const loc = typeof currentLocationId === 'string' && currentLocationId.trim()
        ? currentLocationId.trim()
        : undefined;
    return buildMobileBasePanelSnapshot(vehicle, settlement ?? undefined, {
        currentLocationId: loc,
        resolveLocationName,
        carriedVehicleNames: buildCarriedVehicleNameMap(vehicleState),
    }) ?? null;
}