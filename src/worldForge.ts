import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    type WorldForge,
    type Region,
    type WorldLocation,
    type Faction,
    parseWorldForge
} from './worldForgeCore';
import type { NpcRegistry, NpcEntry } from './npcRegistryCore';
import { defaultDisposition } from './npcRegistryCore';
import { clearNpcRegistryCache } from './npcRegistry';

export type { WorldForge, Region, WorldLocation, Faction };

const WORLD_FORGE_FILENAME = 'world_forge.json';

let cachePath = '';
let cacheMtime = 0;
let cachedForge: WorldForge | undefined | null = undefined; // null = file checked, doesn't exist

function getWorldForgePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, WORLD_FORGE_FILENAME) : undefined;
}

export function clearWorldForgeCache(): void {
    cachedForge = undefined;
    cachePath = '';
    cacheMtime = 0;
}

export function isWorldForgeEnabled(): boolean {
    if (!loadGameRules().enableWorldForge) { return false; }
    const forgePath = getWorldForgePath();
    return Boolean(forgePath && fs.existsSync(forgePath));
}

export function loadWorldForge(): WorldForge | undefined {
    const forgePath = getWorldForgePath();
    if (!forgePath) { return undefined; }

    if (!fs.existsSync(forgePath)) {
        cachedForge = null;
        return undefined;
    }

    try {
        const mtime = fs.statSync(forgePath).mtimeMs;
        if (forgePath === cachePath && mtime === cacheMtime && cachedForge !== undefined) {
            return cachedForge ?? undefined;
        }
        const raw = JSON.parse(fs.readFileSync(forgePath, 'utf-8'));
        const parsed = parseWorldForge(raw);
        cachePath = forgePath;
        cacheMtime = mtime;
        cachedForge = parsed ?? null;
        return parsed;
    } catch {
        return undefined;
    }
}

export function getWorldForgeLocation(id: string): WorldLocation | undefined {
    return loadWorldForge()?.geography.locations.find((l) => l.id === id);
}

export function getWorldForgeLocationByName(name: string): WorldLocation | undefined {
    const lower = name.toLowerCase();
    return loadWorldForge()?.geography.locations.find(
        (l) => l.name.toLowerCase() === lower || l.id.toLowerCase() === lower
    );
}

export function getWorldForgeRegion(id: string): Region | undefined {
    return loadWorldForge()?.geography.regions.find((r) => r.id === id);
}

export function getWorldForgeFaction(id: string): Faction | undefined {
    return loadWorldForge()?.factions.find((f) => f.id === id);
}

/** game_state.status.location の文字列から最も近い WorldLocation を探す。 */
export function resolveCurrentLocation(statusLocation: string | undefined): WorldLocation | undefined {
    if (!statusLocation) { return undefined; }
    return getWorldForgeLocationByName(statusLocation);
}

// ---------------------------------------------------------------------------
// NPC bootstrap
// ---------------------------------------------------------------------------

const NPC_REGISTRY_FILENAME = 'npc_registry.json';

const TRAITS_BY_ROLE: Record<string, string[]> = {
    'quest-giver': ['knowledgeable', 'determined', 'secretive'],
    merchant: ['shrewd', 'friendly', 'cautious'],
    guard: ['disciplined', 'alert', 'loyal'],
    scholar: ['curious', 'meticulous', 'absent-minded'],
    innkeeper: ['hospitable', 'talkative', 'observant'],
    scout: ['perceptive', 'quick', 'solitary'],
    blacksmith: ['skilled', 'gruff', 'honest'],
    healer: ['compassionate', 'calm', 'resourceful'],
};

function inferTraitsFromRole(role?: string): string[] {
    return role ? (TRAITS_BY_ROLE[role] ?? ['mysterious']) : ['mysterious'];
}

/**
 * `world_forge.json` の `initialNpcs` から `npc_registry.json` を生成する。
 * 既存ファイルがある場合は createBackup=true のとき .bak に退避する。
 * 既存 NPC と ID が衝突する場合は上書きしない（スキップ）。
 */
export function bootstrapNpcRegistryFromForge(
    forge: WorldForge,
    options: { createBackup?: boolean; overwrite?: boolean } = {}
): { created: string[]; skipped: string[] } {
    const ws = getWorkspacePath();
    if (!ws) { return { created: [], skipped: [] }; }

    const registryPath = path.join(ws, NPC_REGISTRY_FILENAME);

    let existing: NpcRegistry = { format: 'lorerelay-npc-registry/1.0', npcs: {} };
    if (fs.existsSync(registryPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
            if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.npcs) {
                existing = raw as NpcRegistry;
            }
        } catch {
            // corrupt file — start fresh
        }
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const npc of forge.initialNpcs) {
        if (!options.overwrite && existing.npcs[npc.id]) {
            skipped.push(npc.id);
            continue;
        }

        const memId = `mem_seed_${npc.id}`;
        const entry: NpcEntry = {
            name: npc.name,
            disposition: defaultDisposition(),
            needs: [],
            memories: [{
                id: memId,
                turn: 0,
                content: npc.description ?? `${npc.name} appears in this world.`,
                emotionalWeight: 'neutral',
                tags: ['world-gen'],
            }],
            personalityTraits: inferTraitsFromRole(npc.role),
            dialogueHints: {},
        };
        if (npc.locationId) { entry.locationId = npc.locationId; }
        if (npc.factionId) { entry.factionId = npc.factionId; }

        existing.npcs[npc.id] = entry;
        created.push(npc.id);
    }

    if (created.length > 0) {
        writeJsonAtomic(registryPath, existing, options.createBackup ?? true);
        clearNpcRegistryCache();
    }

    return { created, skipped };
}
