import * as fs from 'fs';
import * as path from 'path';
import { writeJsonAtomic } from './workspacePaths';
import type { GameEntry } from './types/GameState';
import type { CombatBattleHistoryEntry } from './campaignCombatApplyCore';
import {
    attachCombatBattleHistoryToSnapshot,
    extractCombatBattleHistoryForCheckpoint,
} from './checkpointCombatCore';
import { parseModContext } from './mods/modSafeModeCore';
import {
    areModCanonicalWritesAllowed,
    getModActivationGateResult,
    isModCanonicalAuthorizationCurrent,
    type ModCanonicalAuthorization,
} from './mods/modActivationGateHost';
import { validateModLock, type ModLock } from './mods/modProfileCore';
import { migrateGameState } from './migrateGameState';
import { sanitizeGameStateForPersist } from './gameStateSanitize';
import { validateGameState } from './validateGameState';
import {
    captureCheckpointStateSnapshot,
    isCheckpointStateSnapshotCurrent,
    parseCheckpointStateSnapshot,
    type CheckpointStateSnapshot,
} from './checkpointSnapshot';

export type { CombatBattleHistoryEntry };
export {
    attachCombatBattleHistoryToSnapshot,
    extractCombatBattleHistoryForCheckpoint,
} from './checkpointCombatCore';

export interface CheckpointMeta {
    id: string;
    label: string;
    createdAt: string;
    turnId: string;
    turnLabel: string;
}

export interface CheckpointFile {
    /** 1.0: history. 1.1: combat history. 1.2: MOD evidence. 1.3: complete mutable-state snapshot. */
    format: 'text-adventure-checkpoint/1.0' | 'text-adventure-checkpoint/1.1' | 'text-adventure-checkpoint/1.2' | 'text-adventure-checkpoint/1.3';
    meta: CheckpointMeta;
    history: GameEntry[];
    /**
     * Snapshot of combatBattleHistory at save time (Bridge V1-C).
     * Required so restore/rebuild does not drop un-ACKed combat consequence facts.
     */
    combatBattleHistory?: CombatBattleHistoryEntry[];
    /** Complete path-free lock. Present together with modLockFingerprint only in 1.2. */
    modLockSnapshot?: ModLock;
    /** Exact aggregateHash of modLockSnapshot. */
    modLockFingerprint?: string;
    /** Complete enumerated mutable-state snapshot. Required in 1.3 and absent from legacy formats. */
    stateSnapshot?: CheckpointStateSnapshot;
}

export interface GmSnapshot {
    entries: GameEntry[];
    status?: Record<string, unknown>;
    options?: string[];
    theme?: string;
    bgm?: string;
    mood?: string;
    sfx?: string | string[];
    latestImage?: string;
    background?: string;
    sprite?: unknown;
    summary?: string;
    gameOver?: unknown;
    combatBattleHistory?: CombatBattleHistoryEntry[];
}

const MAX_CHECKPOINT_FILE_BYTES = 64 * 1024 * 1024;

export function serializeCheckpointForStorage(value: unknown): string | undefined {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return undefined;
    }
}

function readCheckpointJson(filePath: string): unknown {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CHECKPOINT_FILE_BYTES) {
        throw new Error('checkpoint file is not a bounded regular file');
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
}

export function getCheckpointsDir(ws: string): string {
    return path.join(ws, '.text-adventure', 'checkpoints');
}

const CHECKPOINT_ID_RE = /^cp-\d+$/;

export function isValidCheckpointId(checkpointId: string): boolean {
    return CHECKPOINT_ID_RE.test(checkpointId);
}

export function buildStateFromGmEntry(entry: GameEntry & Record<string, unknown>): GmSnapshot {
    const modContext = parseModContext(entry.modContext);
    const state: GmSnapshot = {
        entries: [{
            id: entry.id,
            role: entry.role,
            sender: entry.sender,
            content: entry.content,
            ...(entry.image ? { image: entry.image as string } : {}),
            ...(entry.imagePrompt ? { imagePrompt: entry.imagePrompt as string } : {}),
            ...(typeof entry.imageBlocked === 'boolean' ? { imageBlocked: entry.imageBlocked as boolean } : {}),
            ...(typeof entry.excludedFromPrompt === 'boolean' ? { excludedFromPrompt: entry.excludedFromPrompt as boolean } : {}),
            ...(entry.editedAt ? { editedAt: entry.editedAt as string } : {}),
            ...(modContext ? { modContext: { ...modContext } } : {})
        }],
        status: (entry.status as Record<string, unknown>) || {},
        options: Array.isArray(entry.options) ? [...(entry.options as string[])] : [],
        theme: (entry.theme as string) || 'fantasy'
    };
    if (entry.bgm) { state.bgm = entry.bgm as string; }
    if (entry.mood) { state.mood = entry.mood as string; }
    if (entry.sfx) {
        state.sfx = Array.isArray(entry.sfx) ? [...(entry.sfx as string[])] : (entry.sfx as string);
    }
    if (entry.latestImage) { state.latestImage = entry.latestImage as string; }
    if (entry.background) { state.background = entry.background as string; }
    if (entry.sprite) { state.sprite = entry.sprite; }
    if (entry.summary) { state.summary = entry.summary as string; }
    if (entry.gameOver) { state.gameOver = entry.gameOver; }
    return state;
}

export function findLastGmEntry(history: GameEntry[]): (GameEntry & Record<string, unknown>) | undefined {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'gm') {
            return history[i] as GameEntry & Record<string, unknown>;
        }
    }
    return undefined;
}

export function truncateHistoryToGmEntry(
    history: GameEntry[],
    entryId: string
): { history: GameEntry[]; seenIds: Set<string> } | undefined {
    let targetIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].id === entryId && history[i].role === 'gm') {
            targetIndex = i;
            break;
        }
    }
    if (targetIndex < 0) {
        return undefined;
    }
    const truncated = history.slice(0, targetIndex + 1);
    const seenIds = new Set(truncated.map((e) => e.id).filter(Boolean) as string[]);
    return { history: truncated, seenIds };
}

export function truncateHistoryOneTurn(history: GameEntry[]): GameEntry[] {
    const copy = [...history];
    const last = copy[copy.length - 1];
    if (last?.role === 'user') {
        copy.pop();
    }
    const last2 = copy[copy.length - 1];
    if (last2?.role === 'gm') {
        copy.pop();
    }
    return copy;
}

export function listCheckpointMetas(ws: string): CheckpointMeta[] {
    const dir = getCheckpointsDir(ws);
    if (!fs.existsSync(dir)) {
        return [];
    }
    const metas: CheckpointMeta[] = [];
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) {
            continue;
        }
        try {
            const data = parseCheckpointFile(readCheckpointJson(path.join(dir, file)));
            if (data?.meta.id) {
                metas.push(data.meta);
            }
        } catch {
            // skip corrupt checkpoint
        }
    }
    return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveCheckpointFile(
    ws: string,
    history: GameEntry[],
    label?: string,
    options?: {
        /** Explicit combat history; if omitted, read from game_state.json when present. */
        combatBattleHistory?: CombatBattleHistoryEntry[];
        gameState?: Record<string, unknown>;
        /** Trusted active lock from the campaign activation gate. */
        modLockSnapshot?: ModLock;
        /** Short-lived gate lease checked at the final filesystem write boundary. */
        modAuthorization?: ModCanonicalAuthorization;
    },
): CheckpointMeta | undefined {
    if (!areModCanonicalWritesAllowed(ws)) return undefined;
    const authorization = options?.modAuthorization;
    if (authorization
        && (path.resolve(ws) !== authorization.workspaceRoot || !isModCanonicalAuthorizationCurrent(authorization))) {
        return undefined;
    }
    const active = getModActivationGateResult(ws);
    if (!authorization && (active?.decision.mode === 'normal' || options?.modLockSnapshot)) return undefined;
    if (authorization?.mode === 'unmodded' && options?.modLockSnapshot) return undefined;
    const authorizedLock = authorization?.mode === 'modded' ? authorization.lock : undefined;
    if (authorizedLock && options?.modLockSnapshot
        && authorizedLock.aggregateHash !== options.modLockSnapshot.aggregateHash) return undefined;
    if (!authorizedLock && history.some(entry => entry.modContext !== undefined)) return undefined;
    const gm = findLastGmEntry(history);
    if (!gm?.id) {
        return undefined;
    }
    const id = `cp-${Date.now()}`;
    const turnNum = history.filter((e) => e.role === 'gm').length;
    const meta: CheckpointMeta = {
        id,
        label: (label || '').trim() || `Turn ${turnNum}`,
        createdAt: new Date().toISOString(),
        turnId: gm.id,
        turnLabel: gm.content.slice(0, 60).replace(/\s+/g, ' ').trim()
    };

    let rawGameState = options?.gameState;
    if (!rawGameState) {
        try {
            const statePath = path.join(ws, 'game_state.json');
            const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown;
            if (isRecord(raw)) rawGameState = raw;
        } catch {
            return undefined;
        }
    }
    if (!rawGameState) return undefined;
    const migrated = migrateGameState(rawGameState).state as Record<string, unknown>;
    const snapshotGameState = sanitizeGameStateForPersist(migrated);
    if (validateGameState(snapshotGameState).length > 0) return undefined;
    const stateSnapshot = captureCheckpointStateSnapshot(ws, snapshotGameState);
    if (!stateSnapshot) return undefined;

    let combatBattleHistory = options?.combatBattleHistory
        ? options.combatBattleHistory.map((e) => ({ ...e }))
        : extractCombatBattleHistoryForCheckpoint(options?.gameState);
    if (combatBattleHistory === undefined) {
        // Best-effort read of live game_state so post-combat / pre-turn saves keep V1-C facts.
        try {
            const statePath = path.join(ws, 'game_state.json');
            if (fs.existsSync(statePath)) {
                const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
                combatBattleHistory = extractCombatBattleHistoryForCheckpoint(raw);
            }
        } catch {
            combatBattleHistory = undefined;
        }
    }

    const validatedLock = authorizedLock
        ? validateModLock(authorizedLock)
        : undefined;
    if (validatedLock && !validatedLock.ok) {
        return undefined;
    }
    const modLockSnapshot = validatedLock?.ok
        ? JSON.parse(JSON.stringify(validatedLock.value)) as ModLock
        : undefined;
    const payload: CheckpointFile = {
        format: 'text-adventure-checkpoint/1.3',
        meta,
        history: JSON.parse(JSON.stringify(history)),
        stateSnapshot,
        ...(combatBattleHistory && combatBattleHistory.length > 0
            ? { combatBattleHistory: JSON.parse(JSON.stringify(combatBattleHistory)) }
            : {}),
        ...(modLockSnapshot
            ? {
                modLockSnapshot,
                modLockFingerprint: modLockSnapshot.aggregateHash,
            }
            : {}),
    };
    const dir = getCheckpointsDir(ws);
    if (options?.modAuthorization
        && !isModCanonicalAuthorizationCurrent(options.modAuthorization)) {
        return undefined;
    }
    if (!isCheckpointStateSnapshotCurrent(ws, stateSnapshot, options?.gameState === undefined)) return undefined;
    fs.mkdirSync(dir, { recursive: true });
    if (options?.modAuthorization
        && !isModCanonicalAuthorizationCurrent(options.modAuthorization)) {
        return undefined;
    }
    const serializedPayload = serializeCheckpointForStorage(payload);
    if (!serializedPayload || Buffer.byteLength(serializedPayload, 'utf8') > MAX_CHECKPOINT_FILE_BYTES) return undefined;
    writeJsonAtomic(path.join(dir, `${id}.json`), payload);
    return meta;
}

export function loadCheckpointFile(ws: string, checkpointId: string): CheckpointFile | undefined {
    if (!isValidCheckpointId(checkpointId)) {
        return undefined;
    }
    const filePath = path.join(getCheckpointsDir(ws), `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return parseCheckpointFile(readCheckpointJson(filePath));
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the format-level contract while preserving legacy 1.0/1.1 payload compatibility. */
export function parseCheckpointFile(value: unknown): CheckpointFile | undefined {
    if (!isRecord(value)
        || !['text-adventure-checkpoint/1.0', 'text-adventure-checkpoint/1.1', 'text-adventure-checkpoint/1.2', 'text-adventure-checkpoint/1.3'].includes(String(value.format))
        || !isRecord(value.meta)
        || !isValidCheckpointId(value.meta.id as string)
        || typeof value.meta.label !== 'string'
        || typeof value.meta.createdAt !== 'string'
        || typeof value.meta.turnId !== 'string'
        || typeof value.meta.turnLabel !== 'string'
        || !Array.isArray(value.history)) {
        return undefined;
    }
    if (value.format === 'text-adventure-checkpoint/1.2') {
        const lock = validateModLock(value.modLockSnapshot);
        if (!lock.ok
            || typeof value.modLockFingerprint !== 'string'
            || value.modLockFingerprint !== lock.value.aggregateHash) {
            return undefined;
        }
    } else if (value.format === 'text-adventure-checkpoint/1.3') {
        const snapshot = parseCheckpointStateSnapshot(value.stateSnapshot);
        if (!snapshot || validateGameState(snapshot.gameState).length > 0) return undefined;
        const hasLock = value.modLockSnapshot !== undefined || value.modLockFingerprint !== undefined;
        const snapshotFingerprints = new Set<string>();
        const snapshotEntries = Array.isArray(snapshot.gameState.entries) ? snapshot.gameState.entries : [];
        for (const entry of snapshotEntries) {
            if (!isRecord(entry) || !Object.prototype.hasOwnProperty.call(entry, 'modContext')) continue;
            const context = parseModContext(entry.modContext);
            if (!context) return undefined;
            snapshotFingerprints.add(context.lockFingerprint);
        }
        if (snapshotFingerprints.size > 0 && !hasLock) return undefined;
        if (hasLock) {
            const lock = validateModLock(value.modLockSnapshot);
            if (!lock.ok
                || typeof value.modLockFingerprint !== 'string'
                || value.modLockFingerprint !== lock.value.aggregateHash
                || [...snapshotFingerprints].some(fingerprint => fingerprint !== lock.value.aggregateHash)) {
                return undefined;
            }
        }
    } else if (value.modLockSnapshot !== undefined || value.modLockFingerprint !== undefined) {
        return undefined;
    }
    if (value.format !== 'text-adventure-checkpoint/1.3' && value.stateSnapshot !== undefined) return undefined;
    return value as unknown as CheckpointFile;
}

export function deleteCheckpointFile(ws: string, checkpointId: string): boolean {
    if (!areModCanonicalWritesAllowed(ws)) return false;
    if (!isValidCheckpointId(checkpointId)) {
        return false;
    }
    const filePath = path.join(getCheckpointsDir(ws), `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
        return false;
    }
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
}

export function listRewindTargets(history: GameEntry[], maxItems = 20): Array<{ id: string; label: string; index: number }> {
    const targets: Array<{ id: string; label: string; index: number }> = [];
    for (let i = history.length - 1; i >= 0 && targets.length < maxItems; i--) {
        const e = history[i];
        if (e.role !== 'gm' || !e.id) {
            continue;
        }
        const turnNum = history.slice(0, i + 1).filter((x) => x.role === 'gm').length;
        const preview = e.content.slice(0, 48).replace(/\s+/g, ' ').trim();
        targets.push({
            id: e.id,
            label: `#${turnNum} ${preview}${e.content.length > 48 ? '…' : ''}`,
            index: i
        });
    }
    return targets;
}
