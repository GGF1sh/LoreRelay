import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    type WorldState,
    type FactionWorldState,
    type RegionWorldState,
    type GlobalEvent,
    type WorldStateParseWarning,
    parseWorldStateWithWarnings,
    formatWorldStateParseWarning,
    MAX_WORLD_STATE_PARSE_WARNINGS_LOG,
    buildInitialWorldState
} from './worldStateCore';
import type { WorldForge } from './worldForgeCore';
import { mergeWorldStateForPersist } from './workspaceStateQueueCore';
import { isWorldStateWriteCircuitOpen, runSerializedWorldStateMutation } from './workspaceStateQueue';

export type { WorldState, FactionWorldState, RegionWorldState, GlobalEvent };
export { buildInitialWorldState };

let lastWorldStateParseWarnings: WorldStateParseWarning[] = [];
let cachedWorldStateParseWarnings: WorldStateParseWarning[] = [];

/** Last cap-overflow warnings from the most recent workspace world_state parse (diagnostic buffer). */
export function peekLastWorldStateParseWarnings(): readonly WorldStateParseWarning[] {
    return lastWorldStateParseWarnings;
}

function setWorldStateParseWarnings(warnings: readonly WorldStateParseWarning[]): void {
    lastWorldStateParseWarnings = [...warnings];
}

function clearWorldStateParseWarnings(): void {
    lastWorldStateParseWarnings = [];
}

function warnWorldStateParseCaps(warnings: ReturnType<typeof parseWorldStateWithWarnings>['warnings']): void {
    if (warnings.length === 0) { return; }
    const slice = warnings.slice(0, MAX_WORLD_STATE_PARSE_WARNINGS_LOG);
    for (const warning of slice) {
        console.warn(`[worldState] ${formatWorldStateParseWarning(warning)}`);
    }
    if (warnings.length > MAX_WORLD_STATE_PARSE_WARNINGS_LOG) {
        console.warn(
            `[worldState] ${warnings.length - MAX_WORLD_STATE_PARSE_WARNINGS_LOG} additional parse cap warning(s) omitted`
        );
    }
}

function parseWorldStateFromRaw(raw: unknown) {
    const { state, warnings } = parseWorldStateWithWarnings(raw);
    setWorldStateParseWarnings(warnings);
    warnWorldStateParseCaps(warnings);
    return { state, warnings };
}

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
    cachedWorldStateParseWarnings = [];
    clearWorldStateParseWarnings();
}

export function isWorldStateEnabled(): boolean {
    if (!loadGameRules().enableEmergentSimulation) { return false; }
    const statePath = getWorldStatePath();
    return Boolean(statePath && fs.existsSync(statePath));
}

export function loadWorldState(): WorldState | undefined {
    const statePath = getWorldStatePath();
    if (!statePath) {
        clearWorldStateCache();
        return undefined;
    }

    if (!fs.existsSync(statePath)) {
        cachedState = null;
        cachePath = statePath;
        cacheMtime = 0;
        cachedWorldStateParseWarnings = [];
        clearWorldStateParseWarnings();
        return undefined;
    }

    try {
        const mtime = fs.statSync(statePath).mtimeMs;
        if (statePath === cachePath && mtime === cacheMtime && cachedState !== undefined) {
            setWorldStateParseWarnings(cachedWorldStateParseWarnings);
            return cachedState ?? undefined;
        }
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const parsed = parseWorldStateFromRaw(raw);
        cachePath = statePath;
        cacheMtime = mtime;
        cachedState = parsed.state ?? null;
        cachedWorldStateParseWarnings = [...parsed.warnings];
        return parsed.state;
    } catch {
        cachedState = undefined;
        cachePath = statePath;
        cacheMtime = 0;
        cachedWorldStateParseWarnings = [];
        clearWorldStateParseWarnings();
        return undefined;
    }
}

/** Mark a world-turn "Since Last Visit" block as consumed so it is not re-injected every GM turn. */
export function markWorldChangeSummaryInjected(worldTurn: number): void {
    const state = loadWorldState();
    if (!state) { return; }
    const turn = Math.max(0, Math.floor(worldTurn));
    if ((state.lastInjectedWorldChangeSummaryTurn ?? -1) >= turn) { return; }
    saveWorldState({ ...state, lastInjectedWorldChangeSummaryTurn: turn });
}

/** Mark chronicle recap as consumed for this journal turn count. */
export function markChronicleInjected(journalTurnCount: number): void {
    const state = loadWorldState();
    if (!state) { return; }
    const turn = Math.max(0, Math.floor(journalTurnCount));
    if ((state.lastInjectedChronicleTurn ?? -1) >= turn) { return; }
    saveWorldState({ ...state, lastInjectedChronicleTurn: turn });
}

function readWorldStateFromDisk(statePath: string): WorldState | undefined {
    if (!fs.existsSync(statePath)) {
        cachedWorldStateParseWarnings = [];
        clearWorldStateParseWarnings();
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const parsed = parseWorldStateFromRaw(raw);
        cachedWorldStateParseWarnings = [...parsed.warnings];
        return parsed.state;
    } catch {
        cachedWorldStateParseWarnings = [];
        clearWorldStateParseWarnings();
        return undefined;
    }
}

function writeWorldStateToDisk(statePath: string, state: WorldState): void {
    const toSave = {
        ...state,
        format: 'lorerelay-world-state/1.1',
        lastUpdated: new Date().toISOString(),
    };
    writeJsonAtomic(statePath, toSave);
    cachedState = toSave;
    cachePath = statePath;
    cachedWorldStateParseWarnings = [];
    clearWorldStateParseWarnings();
    try {
        cacheMtime = fs.statSync(statePath).mtimeMs;
    } catch {
        cacheMtime = 0;
    }
}

export function saveWorldState(state: WorldState): boolean {
    const statePath = getWorldStatePath();
    if (!statePath) { return false; }
    if (isWorldStateWriteCircuitOpen()) {
        console.error('[worldState] circuit open — skipping world_state write');
        return false;
    }
    let ok = false;
    runSerializedWorldStateMutation(() => {
        const disk = readWorldStateFromDisk(statePath);
        const merged = mergeWorldStateForPersist(
            disk as Record<string, unknown> | undefined,
            state as unknown as Record<string, unknown>
        ) as unknown as WorldState;
        try {
            writeWorldStateToDisk(statePath, merged);
            ok = true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`world_state io write failed: ${msg}`);
        }
    });
    return ok;
}

/**
 * Patch questHooks on the latest disk snapshot inside the world_state write queue.
 * Avoids clobbering concurrent observer ticks (markets/worldTurn) with a stale full snapshot.
 */
export function patchWorldStateQuestHooks(
    updater: (
        hooks: NonNullable<WorldState['questHooks']>,
        state: WorldState
    ) => { hooks: NonNullable<WorldState['questHooks']>; changed: boolean }
): boolean {
    const statePath = getWorldStatePath();
    if (!statePath) { return false; }

    let applied = false;
    runSerializedWorldStateMutation(() => {
        const disk = readWorldStateFromDisk(statePath);
        if (!disk) { return; }
        const hooks = Array.isArray(disk.questHooks) ? [...disk.questHooks] : [];
        const { hooks: nextHooks, changed } = updater(hooks, disk);
        if (!changed) { return; }
        const merged = mergeWorldStateForPersist(
            disk as unknown as Record<string, unknown>,
            { questHooks: nextHooks } as Record<string, unknown>
        ) as unknown as WorldState;
        writeWorldStateToDisk(statePath, merged);
        applied = true;
    });
    return applied;
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
    return resetWorldStateFromForge(forge);
}

/** 新規生成・上書き時に world_state.json を forge から再構築する。 */
export function resetWorldStateFromForge(forge: WorldForge, createBackup = false): WorldState {
    const initial = buildInitialWorldState(forge);
    const statePath = getWorldStatePath();
    if (!statePath) {
        return initial;
    }
    let saved = initial;
    runSerializedWorldStateMutation(() => {
        const toSave = { ...initial, lastUpdated: new Date().toISOString() };
        writeJsonAtomic(statePath, toSave, createBackup);
        cachedState = toSave;
        cachePath = statePath;
        cachedWorldStateParseWarnings = [];
        clearWorldStateParseWarnings();
        try {
            cacheMtime = fs.statSync(statePath).mtimeMs;
        } catch {
            cacheMtime = 0;
        }
        saved = toSave;
    });
    return saved;
}
