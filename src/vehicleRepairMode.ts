import * as vscode from 'vscode';
import type { VehicleRepairMode } from './gameplaySpineVehicleRepairCommitHost';

export function normalizeVehicleRepairMode(raw: unknown): VehicleRepairMode {
    return raw === 'shadow' || raw === 'authoritative' ? raw : 'off';
}

export function getVehicleRepairMode(): VehicleRepairMode {
    try {
        return normalizeVehicleRepairMode(
            vscode.workspace.getConfiguration('textAdventure').get('gameplaySpine.vehicleRepairMode')
        );
    } catch {
        return 'off';
    }
}
