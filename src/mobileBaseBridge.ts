// Mobile Base System MB2/MB4: workspace loaders + GM prompt + Webview panel (no mobileBaseOps writes).

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildCarriedVehicleNameMap,
    buildMobileBasePromptBlock,
    mobileBaseSystemEnabled,
    resolveActiveMobileBaseVehicle,
    MAX_MOBILE_BASE_PROMPT_BLOCK_CHARS,
} from './mobileBaseCore';
import {
    buildMobileBaseInteriorPayload,
    type MobileBaseInteriorPayload,
} from './mobileBaseInteriorCore';
import { buildMobileBasePanelSnapshot, type MobileBasePanelSnapshot } from './mobileBaseViewCore';
import type { SettlementLayerId } from './settlementCore';
import type { SettlementDioramaTheme } from './settlementDioramaCore';
import { loadSettlementLayout, loadSettlementState } from './settlementState';
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
    const block = buildMobileBasePromptBlock(vehicle, settlement, true, {
        carriedVehicleNames: buildCarriedVehicleNameMap(vehicleState),
    });
    const interior = settlement ? buildMobileBaseInteriorPayload(vehicle, settlement,
        loadSettlementLayout(), rules) : undefined;
    const layers = interior?.settlementView?.layers.map(layer => layer.id).join(', ');
    if (!layers) { return block; }
    const layerLine = `Interior layers: ${layers}.\n`;
    return layerLine + block.slice(0, MAX_MOBILE_BASE_PROMPT_BLOCK_CHARS - layerLine.length);
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

/** Read-only MB5 interior view — reuses Settlement Mode snapshots (triple gate). */
export function buildMobileBaseInteriorWebviewPayload(
    selectedLayerId: SettlementLayerId = 'z0',
    dioramaTheme?: SettlementDioramaTheme
): MobileBaseInteriorPayload | null {
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
    if (!settlement) {
        return null;
    }
    const layout = loadSettlementLayout();
    return buildMobileBaseInteriorPayload(
        vehicle,
        settlement,
        layout ?? undefined,
        rules,
        { selectedLayerId, dioramaTheme }
    ) ?? null;
}
