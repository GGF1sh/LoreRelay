// Mobile Base System MB2: workspace loaders + GM prompt context (no mobileBaseOps).

import { loadGameRules } from './gameRules';
import {
    buildCarriedVehicleNameMap,
    buildMobileBasePromptBlock,
    mobileBaseSystemEnabled,
    resolveActiveMobileBaseVehicle,
} from './mobileBaseCore';
import { loadSettlementState } from './settlementState';
import { loadVehicleState } from './vehicleState';

export { mobileBaseSystemEnabled } from './mobileBaseCore';

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