// Settlement Mode M1: workspace settlement_state.json loader.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import { isWorldForgeEnabled, loadWorldForge, resolveCurrentLocation } from './worldForge';
import { loadVehicleState } from './vehicleState';
import { extractActiveMobileBaseSettlementId, loadFixedSettlementForWorldView } from './worldViewFixedSettlement';
import { buildSettlementViewSnapshot } from './settlementViewCore';
import {
    buildSettlementPromptBlock,
    parseSettlementLayout,
    parseSettlementState,
    settlementModeEnabled,
    type SettlementLayoutV1,
    type SettlementStateV1,
} from './settlementCore';
import type { PromptBudgetPolicy } from './gmPromptBuilderCore';

export const SETTLEMENT_STATE_FILENAME = 'settlement_state.json';
export const SETTLEMENT_LAYOUT_FILENAME = 'settlement_layout.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedDoc: SettlementStateV1 | undefined;

let cachedLayoutPath = '';
let cachedLayoutMtime = 0;
let cachedLayoutDoc: SettlementLayoutV1 | undefined;

export function getSettlementStatePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, SETTLEMENT_STATE_FILENAME) : undefined;
}

export function clearSettlementLayoutCache(): void {
    cachedLayoutPath = '';
    cachedLayoutMtime = 0;
    cachedLayoutDoc = undefined;
}

export function clearSettlementStateCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedDoc = undefined;
    clearSettlementLayoutCache();
}

/** Fresh disk read for serialized mutations (bypasses loader cache). */
export function readSettlementLayoutFromDisk(layoutPath?: string): SettlementLayoutV1 | undefined {
    const resolved = layoutPath ?? getSettlementLayoutPath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return parseSettlementLayout(raw);
    } catch {
        return undefined;
    }
}

export function getSettlementLayoutPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, SETTLEMENT_LAYOUT_FILENAME) : undefined;
}

export function readSettlementStateFromDisk(statePath?: string): SettlementStateV1 | undefined {
    const resolved = statePath ?? getSettlementStatePath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return parseSettlementState(raw);
    } catch {
        return undefined;
    }
}

export function loadSettlementState(): SettlementStateV1 | undefined {
    const statePath = getSettlementStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(statePath);
        if (cachedDoc && cachedPath === statePath && cachedMtime === stat.mtimeMs) {
            return cachedDoc;
        }
        const parsed = readSettlementStateFromDisk(statePath);
        if (!parsed) {
            clearSettlementStateCache();
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

export function loadSettlementLayout(): SettlementLayoutV1 | undefined {
    const layoutPath = getSettlementLayoutPath();
    if (!layoutPath || !fs.existsSync(layoutPath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(layoutPath);
        if (cachedLayoutDoc && cachedLayoutPath === layoutPath && cachedLayoutMtime === stat.mtimeMs) {
            return cachedLayoutDoc;
        }
        const parsed = readSettlementLayoutFromDisk(layoutPath);
        if (!parsed) {
            clearSettlementLayoutCache();
            return undefined;
        }
        cachedLayoutPath = layoutPath;
        cachedLayoutMtime = stat.mtimeMs;
        cachedLayoutDoc = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

export function buildSettlementPromptContext(policy?: Pick<PromptBudgetPolicy, 'mode'>): string {
    const rules = loadGameRules();
    if (!settlementModeEnabled(rules)) { return ''; }
    const workspaceRoot = getWorkspacePath();
    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    if (workspaceRoot && forge) {
        let game: Record<string, unknown> | undefined;
        try {
            const gamePath = path.join(workspaceRoot, 'game_state.json');
            game = fs.existsSync(gamePath) ? JSON.parse(fs.readFileSync(gamePath, 'utf8')) : undefined;
        } catch {
            game = undefined;
        }
        const world = game?.world && typeof game.world === 'object' ? game.world as Record<string, unknown> : undefined;
        const exactId = typeof world?.currentLocationId === 'string' ? world.currentLocationId : undefined;
        const statusLocation = game?.status && typeof game.status === 'object'
            ? (game.status as Record<string, unknown>).location
            : undefined;
        const resolved = exactId || (typeof statusLocation === 'string' ? resolveCurrentLocation(statusLocation)?.id : undefined);
        const scoped = loadFixedSettlementForWorldView({
            enableSettlementMode: true,
            workspaceRoot,
            currentLocationId: resolved,
            forgeLocationIds: new Set(forge.geography.locations.map((location) => location.id)),
            activeMobileBaseSettlementId: extractActiveMobileBaseSettlementId(loadVehicleState()),
        });
        // Match the displayed positions (including coordinate clamping) and disclosure.
        const visibleLayout = scoped.state && scoped.layout ? {
            ...scoped.layout,
            zones: scoped.layout.layers.flatMap(layerId => {
                const view = buildSettlementViewSnapshot({ state: scoped.state, layout: scoped.layout, selectedLayerId: layerId });
                return (view?.tiles ?? []).map((tile, index) => ({ id: `visible_${layerId}_${index}`, layerId, label: tile.label, x: tile.x, y: tile.y }));
            }),
            markers: scoped.layout.layers.flatMap(layerId => {
                const view = buildSettlementViewSnapshot({ state: scoped.state, layout: scoped.layout, selectedLayerId: layerId });
                return (view?.markers ?? []).map(marker => ({ id: marker.id, layerId, label: marker.label, x: marker.x, y: marker.y }));
            }),
        } : undefined;
        return buildSettlementPromptBlock(scoped.state, true, {
            layout: visibleLayout,
            summaryOnly: policy?.mode === 'compact',
        });
    }
    return buildSettlementPromptBlock(loadSettlementState(), true, {
        layout: loadSettlementLayout(),
        summaryOnly: policy?.mode === 'compact',
    });
}
