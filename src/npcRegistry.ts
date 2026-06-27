import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    type NpcRegistry,
    type NpcEntry,
    type NpcNeed,
    type NpcMemoryEntry,
    type NpcMemoryUpdate,
    clampDispositionValue,
    defaultDisposition,
    isValidMood,
    isValidEmotionalWeight,
    isValidNeedType
} from './npcRegistryCore';

export type { NpcRegistry, NpcEntry, NpcNeed, NpcMemoryEntry, NpcMemoryUpdate };

const NPC_REGISTRY_FILENAME = 'npc_registry.json';
const MAX_MEMORIES_PER_NPC = 10;
const MEMORY_COMPRESS_THRESHOLD = 12;

let cachePath = '';
let cacheMtime = 0;
let cachedRegistry: NpcRegistry | undefined;

function getNpcRegistryPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, NPC_REGISTRY_FILENAME) : undefined;
}

export function clearNpcRegistryCache(): void {
    cachedRegistry = undefined;
    cachePath = '';
    cacheMtime = 0;
}

export function loadNpcRegistry(): NpcRegistry {
    const registryPath = getNpcRegistryPath();
    if (!registryPath || !fs.existsSync(registryPath)) {
        return { format: 'lorerelay-npc-registry/1.0', npcs: {} };
    }
    try {
        const mtime = fs.statSync(registryPath).mtimeMs;
        if (registryPath === cachePath && mtime === cacheMtime && cachedRegistry) {
            return cachedRegistry;
        }
        const raw = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        const parsed = parseNpcRegistry(raw);
        cachePath = registryPath;
        cacheMtime = mtime;
        cachedRegistry = parsed;
        return parsed;
    } catch {
        return { format: 'lorerelay-npc-registry/1.0', npcs: {} };
    }
}

export function saveNpcRegistry(registry: NpcRegistry): void {
    const registryPath = getNpcRegistryPath();
    if (!registryPath) { return; }
    writeJsonAtomic(registryPath, registry);
    cachedRegistry = registry;
    cachePath = registryPath;
    try {
        cacheMtime = fs.statSync(registryPath).mtimeMs;
    } catch {
        cacheMtime = 0;
    }
}

export function getNpcEntry(npcId: string): NpcEntry | undefined {
    return loadNpcRegistry().npcs[npcId];
}

/**
 * Sets (or clears) the portrait image path for an NPC.
 * Pass `undefined` to remove the portrait link.
 * Returns false if npcId is not found.
 */
export function setNpcPortrait(npcId: string, imagePath: string | undefined): boolean {
    const registry = loadNpcRegistry();
    const entry = registry.npcs[npcId];
    if (!entry) { return false; }
    if (imagePath) {
        entry.portraitImagePath = imagePath;
    } else {
        delete entry.portraitImagePath;
    }
    registry.npcs[npcId] = entry;
    saveNpcRegistry(registry);
    return true;
}

/** urgency の高い順にソートされたNeedsを返す。 */
export function resolveActiveNeeds(npcId: string, minUrgency = 0): NpcNeed[] {
    const entry = getNpcEntry(npcId);
    if (!entry) { return []; }
    return entry.needs
        .filter((n) => n.urgency >= minUrgency)
        .sort((a, b) => b.urgency - a.urgency);
}

/**
 * LLMが game_state.json に書いた npcMemoryUpdates を適用する。
 * profileUpdates と同じパターンで gameStateSync から呼ばれる。
 */
export function applyNpcMemoryUpdates(updates: NpcMemoryUpdate[], currentTurn: number): void {
    if (updates.length === 0) { return; }
    const registry = loadNpcRegistry();
    let changed = false;

    for (const update of updates) {
        if (typeof update.npcId !== 'string' || !update.npcId) { continue; }
        const npcId = update.npcId;
        let entry = registry.npcs[npcId];
        if (!entry) { continue; }

        if (update.dispositionDelta) {
            const d = update.dispositionDelta;
            if (typeof d.playerTrust === 'number') {
                entry.disposition.playerTrust = clampDispositionValue(
                    entry.disposition.playerTrust + d.playerTrust
                );
            }
            if (typeof d.playerRomance === 'number') {
                entry.disposition.playerRomance = clampDispositionValue(
                    entry.disposition.playerRomance + d.playerRomance
                );
            }
            if (typeof d.playerFear === 'number') {
                entry.disposition.playerFear = clampDispositionValue(
                    entry.disposition.playerFear + d.playerFear
                );
            }
            if (isValidMood(d.mood)) {
                entry.disposition.mood = d.mood;
            }
            entry.disposition.lastInteractionTurn = currentTurn;
            changed = true;
        }

        if (update.newMemory) {
            const m = update.newMemory;
            if (typeof m.content === 'string' && m.content.trim()) {
                const newMem: NpcMemoryEntry = {
                    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    turn: currentTurn,
                    content: m.content.trim().slice(0, 500),
                    emotionalWeight: isValidEmotionalWeight(m.emotionalWeight) ? m.emotionalWeight : 'neutral',
                    tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string').slice(0, 5) : []
                };
                entry.memories.push(newMem);
                if (entry.memories.length >= MEMORY_COMPRESS_THRESHOLD) {
                    entry.memories = compressMemories(entry.memories);
                }
                changed = true;
            }
        }

        if (Array.isArray(update.needUpdates)) {
            for (const nu of update.needUpdates) {
                if (typeof nu.id !== 'string') { continue; }
                const needIdx = entry.needs.findIndex((n) => n.id === nu.id);
                if (needIdx < 0) { continue; }
                if (nu.resolved === true) {
                    entry.needs.splice(needIdx, 1);
                } else if (typeof nu.urgencyDelta === 'number') {
                    entry.needs[needIdx].urgency = clampDispositionValue(
                        entry.needs[needIdx].urgency + nu.urgencyDelta
                    );
                }
                changed = true;
            }
        }

        registry.npcs[npcId] = entry;
    }

    if (changed) {
        saveNpcRegistry(registry);
    }
}

/** 古い記憶を末尾のMAX_MEMORIES_PER_NPC件に切り詰める。positiveは優先保持。 */
function compressMemories(memories: NpcMemoryEntry[]): NpcMemoryEntry[] {
    if (memories.length <= MAX_MEMORIES_PER_NPC) { return memories; }
    const positive = memories.filter((m) => m.emotionalWeight === 'positive' || m.emotionalWeight === 'suspicious');
    const rest = memories.filter((m) => m.emotionalWeight !== 'positive' && m.emotionalWeight !== 'suspicious');
    const keepPositive = positive.slice(-Math.ceil(MAX_MEMORIES_PER_NPC / 2));
    const keepRest = rest.slice(-(MAX_MEMORIES_PER_NPC - keepPositive.length));
    return [...keepPositive, ...keepRest].sort((a, b) => a.turn - b.turn);
}

// --- パーサー（ファイル読み込み時の正規化） ---

function parseNpcEntry(raw: unknown): NpcEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) { return undefined; }

    const disp = r.disposition && typeof r.disposition === 'object' && !Array.isArray(r.disposition)
        ? r.disposition as Record<string, unknown>
        : {};

    const disposition = {
        playerTrust: clampDispositionValue(disp.playerTrust, 50),
        playerRomance: clampDispositionValue(disp.playerRomance, 0),
        playerFear: clampDispositionValue(disp.playerFear, 0),
        mood: isValidMood(disp.mood) ? disp.mood : 'neutral' as const,
        lastInteractionTurn: typeof disp.lastInteractionTurn === 'number' ? disp.lastInteractionTurn : 0
    };

    const needs: NpcNeed[] = Array.isArray(r.needs)
        ? r.needs.filter((n): n is Record<string, unknown> => {
            if (!n || typeof n !== 'object' || Array.isArray(n)) { return false; }
            const nd = n as Record<string, unknown>;
            return typeof nd.id === 'string' && typeof nd.description === 'string' && isValidNeedType(nd.type);
        }).map((nd) => ({
            id: String(nd.id),
            type: nd.type as NpcNeed['type'],
            description: String(nd.description).trim().slice(0, 300),
            urgency: clampDispositionValue(nd.urgency, 50),
            relatedEventId: typeof nd.relatedEventId === 'string' ? nd.relatedEventId : null
        }))
        : [];

    const memories: NpcMemoryEntry[] = Array.isArray(r.memories)
        ? r.memories.filter((m): m is Record<string, unknown> => {
            if (!m || typeof m !== 'object' || Array.isArray(m)) { return false; }
            const me = m as Record<string, unknown>;
            return typeof me.id === 'string' && typeof me.content === 'string';
        }).map((me) => ({
            id: String(me.id),
            turn: typeof me.turn === 'number' ? me.turn : 0,
            content: String(me.content).trim().slice(0, 500),
            emotionalWeight: isValidEmotionalWeight(me.emotionalWeight) ? me.emotionalWeight : 'neutral',
            tags: Array.isArray(me.tags) ? me.tags.filter((t) => typeof t === 'string').slice(0, 5) : []
        }))
        : [];

    const entry: NpcEntry = { name, disposition, needs, memories };
    if (typeof r.locationId === 'string') { entry.locationId = r.locationId; }
    if (typeof r.factionId === 'string') { entry.factionId = r.factionId; }
    if (Array.isArray(r.personalityTraits)) {
        entry.personalityTraits = r.personalityTraits.filter((t) => typeof t === 'string') as string[];
    }
    if (r.dialogueHints && typeof r.dialogueHints === 'object' && !Array.isArray(r.dialogueHints)) {
        const dh = r.dialogueHints as Record<string, unknown>;
        entry.dialogueHints = {};
        for (const key of ['highTrust', 'lowTrust', 'highUrgency', 'highFear', 'romance'] as const) {
            if (typeof dh[key] === 'string') { entry.dialogueHints[key] = dh[key] as string; }
        }
    }
    return entry;
}

function parseNpcRegistry(raw: unknown): NpcRegistry {
    const empty: NpcRegistry = { format: 'lorerelay-npc-registry/1.0', npcs: {} };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return empty; }
    const doc = raw as Record<string, unknown>;
    const npcs: Record<string, NpcEntry> = {};
    if (doc.npcs && typeof doc.npcs === 'object' && !Array.isArray(doc.npcs)) {
        for (const [id, value] of Object.entries(doc.npcs as Record<string, unknown>)) {
            if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) { continue; }
            const entry = parseNpcEntry(value);
            if (entry) { npcs[id] = entry; }
        }
    }
    return { format: 'lorerelay-npc-registry/1.0', npcs };
}

/** NpcMemoryUpdate 配列を game_state.json から読んだ生データとして軽くバリデートする。 */
export function parseNpcMemoryUpdatesFromGameState(raw: unknown): NpcMemoryUpdate[] {
    if (!Array.isArray(raw)) { return []; }
    const result: NpcMemoryUpdate[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) { continue; }
        const r = item as Record<string, unknown>;
        if (typeof r.npcId !== 'string' || !r.npcId) { continue; }
        const update: NpcMemoryUpdate = { npcId: r.npcId };
        if (r.dispositionDelta && typeof r.dispositionDelta === 'object' && !Array.isArray(r.dispositionDelta)) {
            update.dispositionDelta = r.dispositionDelta as NpcMemoryUpdate['dispositionDelta'];
        }
        if (r.newMemory && typeof r.newMemory === 'object' && !Array.isArray(r.newMemory)) {
            update.newMemory = r.newMemory as NpcMemoryUpdate['newMemory'];
        }
        if (Array.isArray(r.needUpdates)) {
            update.needUpdates = r.needUpdates as NpcMemoryUpdate['needUpdates'];
        }
        result.push(update);
    }
    return result;
}
