// Vehicle System V2: workspace vehicle_state.json loader + GM prompt context.

import * as fs from 'fs';
import * as path from 'path';
import { loadGameRules } from './gameRules';
import { getGameStatePath, getWorkspacePath } from './workspacePaths';
import {
    buildVehiclePromptBlock,
    parseVehicleState,
    vehicleModeEnabled,
    type VehicleState,
} from './vehicleCore';

export const VEHICLE_STATE_FILENAME = 'vehicle_state.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedDoc: VehicleState | undefined;

export function getVehicleStatePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, VEHICLE_STATE_FILENAME) : undefined;
}

export function clearVehicleStateCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedDoc = undefined;
}

/** Fresh disk read for serialized mutations (bypasses loader cache). */
export function readVehicleStateFromDisk(statePath?: string): VehicleState | undefined {
    const resolved = statePath ?? getVehicleStatePath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        const parsed = parseVehicleState(raw);
        return parsed.vehicles.length ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export function loadVehicleState(): VehicleState | undefined {
    const statePath = getVehicleStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(statePath);
        if (cachedDoc && cachedPath === statePath && cachedMtime === stat.mtimeMs) {
            return cachedDoc;
        }
        const parsed = readVehicleStateFromDisk(statePath);
        if (!parsed) {
            clearVehicleStateCache();
            return undefined;
        }
        cachedPath = statePath;
        cachedMtime = stat.mtimeMs;
        cachedDoc = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

function readCurrentLocationIdFromGameState(): string | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { world?: { currentLocationId?: unknown } };
        const loc = raw.world?.currentLocationId;
        return typeof loc === 'string' && loc.trim() ? loc.trim() : undefined;
    } catch {
        return undefined;
    }
}

export function buildVehiclePromptContext(): string {
    const rules = loadGameRules();
    if (!vehicleModeEnabled(rules)) {
        return '';
    }
    const state = loadVehicleState();
    if (!state) {
        return '';
    }
    return buildVehiclePromptBlock(state, true, {
        currentLocationId: readCurrentLocationIdFromGameState(),
    });
}