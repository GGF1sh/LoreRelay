import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    type WorldState,
    type FactionWorldState,
    type RegionWorldState,
    type GlobalEvent,
    parseWorldState,
    buildInitialWorldState
} from './worldStateCore';
import type { WorldForge } from './worldForgeCore';

export type { WorldState, FactionWorldState, RegionWorldState, GlobalEvent };
export { buildInitialWorldState };

const WORLD_STATE_FILENAME = 'world_state.json';

let cachePath = '';
let cacheMtime = 0;
let cachedState: WorldState | undefined | null = undefined; // null = file checked, doesn't exist

function getWorldStatePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, WORLD_STATE_FILENAME) : undefined;
}

export function clearWorldStateCache(): void {
    cachedState = undefined;
    cachePath = '';
    cacheMtime = 0;
}

export function isWorldStateEnabled(): boolean {
    if (!loadGameRules().enableEmergentSimulation) { return false; }
    const statePath = getWorldStatePath();
    return Boolean(statePath && fs.existsSync(statePath));
}

export function loadWorldState(): WorldState | undefined {
    const statePath = getWorldStatePath();
    if (!statePath) { return undefined; }

    if (!fs.existsSync(statePath)) {
        cachedState = null;
        return undefined;
    }

    try {
        const mtime = fs.statSync(statePath).mtimeMs;
        if (statePath === cachePath && mtime === cacheMtime && cachedState !== undefined) {
            return cachedState ?? undefined;
        }
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const parsed = parseWorldState(raw);
        cachePath = statePath;
        cacheMtime = mtime;
        cachedState = parsed ?? null;
        return parsed;
    } catch {
        return undefined;
    }
}

export function saveWorldState(state: WorldState): void {
    const statePath = getWorldStatePath();
    if (!statePath) { return; }
    const toSave = { ...state, lastUpdated: new Date().toISOString() };
    writeJsonAtomic(statePath, toSave);
    cachedState = toSave;
    cachePath = statePath;
    try {
        cacheMtime = fs.statSync(statePath).mtimeMs;
    } catch {
        cacheMtime = 0;
    }
}

export function getWorldTurn(): number {
    return loadWorldState()?.worldTurn ?? 0;
}

export function getFactionState(id: string): FactionWorldState | undefined {
    return loadWorldState()?.factions[id];
}

export function getRegionState(id: string): RegionWorldState | undefined {
    return loadWorldState()?.regions?.[id];
}

export function getActiveGlobalEvents(): GlobalEvent[] {
    return loadWorldState()?.globalEvents ?? [];
}

/**
 * world_forge.json が存在するのに world_state.json がない場合、初期状態を生成して保存する。
 * emergentSimulator の最初のステップ前に呼ぶ。
 */
export function ensureWorldStateExists(forge: WorldForge): WorldState {
    const existing = loadWorldState();
    if (existing) { return existing; }
    const initial = buildInitialWorldState(forge);
    saveWorldState(initial);
    return initial;
}
