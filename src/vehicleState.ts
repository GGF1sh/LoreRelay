// Vehicle System V2: workspace vehicle_state.json loader + GM prompt context.
// PRE2: reads v1/v2 documents and projects mechanical VehicleState only.

import * as fs from 'fs';
import * as path from 'path';
import { loadGameRules } from './gameRules';
import type { PromptBudgetPolicy } from './gmPromptBuilderCore';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { getGameStatePath, getWorkspacePath } from './workspacePaths';
import {
    buildVehicleIntegrationPromptLines,
    resolveLocationVehicleAccess,
} from './vehicleIntegrationCore';
import {
    buildVehiclePromptBlock,
    vehicleModeEnabled,
    type VehicleState,
} from './vehicleCore';
import {
    parseVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
} from './vehicleStateDocumentCore';

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

/**
 * Project mechanical VehicleState from a raw JSON document.
 * Valid v1/v2 → mechanical only (receipts never leak).
 * Invalid / unsupported / empty fleet → undefined (fail closed; does not invent empty fleet).
 */
export function projectMechanicalVehicleStateFromRaw(raw: unknown): VehicleState | undefined {
    const parsed = parseVehicleStateDocument(raw);
    if (parsed.kind !== 'valid_v1' && parsed.kind !== 'valid_v2') {
        return undefined;
    }
    const mechanical = projectVehicleStateDocumentMechanical(parsed.document);
    return mechanical.vehicles.length ? mechanical : undefined;
}

/** Fresh disk read for serialized mutations (bypasses loader cache). Mechanical only. */
export function readVehicleStateFromDisk(statePath?: string): VehicleState | undefined {
    const resolved = statePath ?? getVehicleStatePath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return projectMechanicalVehicleStateFromRaw(raw);
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

export function buildVehiclePromptContext(policy?: Pick<PromptBudgetPolicy, 'mode'>): string {
    const rules = loadGameRules();
    if (!vehicleModeEnabled(rules)) {
        return '';
    }
    const state = loadVehicleState();
    if (!state) {
        return '';
    }
    const currentLocationId = readCurrentLocationIdFromGameState();
    const block = buildVehiclePromptBlock(state, true, { currentLocationId });
    if (!block) { return ''; }

    if (policy?.mode === 'compact') {
        return block;
    }

    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    const location = currentLocationId
        ? forge?.geography.locations.find((l) => l.id === currentLocationId)
        : undefined;
    const integrationLines = buildVehicleIntegrationPromptLines({
        state,
        currentLocationId,
        location,
        locationAccess: resolveLocationVehicleAccess(forge, currentLocationId),
    });
    if (!integrationLines.length) { return block; }
    return `${block}\n${integrationLines.join('\n')}`;
}
