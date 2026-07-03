// Campaign P0 — pure merge helpers for serialized workspace writes (no vscode/fs).

/** UI writes during GM turn — disk wins over stale turn snapshot on conflict. */
export const UI_PROTECTED_ON_TURN_COMMIT = ['commerce'] as const;

/** GM turn_result commit may overwrite these even when disk revision advanced. */
export const TURN_AUTHORITATIVE_ROOT_KEYS = [
    'status',
    'options',
    'theme',
    'bgm',
    'mood',
    'sfx',
    'latestImage',
    'background',
    'sprite',
    'hiddenDice',
    'gameOver',
    'summary',
    'diceRequest',
    'hiddenState',
    'director',
    'partyDirector',
    'world',
    'schemaVersion',
] as const;

export type GameStateMergeProfile = 'default' | 'turn' | 'commerce-ui' | 'entries-only';

export interface GameStateMergeOptions {
    /** Revision observed when the writer read game_state.json (OCC base). */
    baseRevision?: number;
    profile?: GameStateMergeProfile;
}

export function readStateRevision(state: Record<string, unknown> | undefined): number {
    if (!state || typeof state.stateRevision !== 'number' || !Number.isFinite(state.stateRevision)) {
        return 0;
    }
    return Math.max(0, Math.floor(state.stateRevision));
}

export interface GameEntryLike {
    id: string;
    role?: string;
    sender?: string;
    content?: string;
    [key: string]: unknown;
}

function isEntryLike(entry: unknown): entry is GameEntryLike {
    return typeof entry === 'object'
        && entry !== null
        && typeof (entry as GameEntryLike).id === 'string'
        && (entry as GameEntryLike).id.length > 0;
}

/** Merge entries by id; incoming wins on collision; preserves disk order then appends new ids. */
export function mergeGameStateEntries(
    diskEntries: unknown[],
    incomingEntries: unknown[]
): unknown[] {
    const byId = new Map<string, unknown>();
    const order: string[] = [];

    for (const entry of diskEntries) {
        if (!isEntryLike(entry)) { continue; }
        byId.set(entry.id, entry);
        order.push(entry.id);
    }
    for (const entry of incomingEntries) {
        if (!isEntryLike(entry)) { continue; }
        if (!byId.has(entry.id)) {
            order.push(entry.id);
        }
        byId.set(entry.id, entry);
    }

    return order.map((id) => byId.get(id)).filter((e): e is unknown => e !== undefined);
}

/**
 * Reload-before-write merge for game_state.json.
 * entries are always merged by id; other roots depend on profile / revision conflict.
 */
export function mergeGameStateForPersist(
    disk: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>,
    options: GameStateMergeOptions = {}
): Record<string, unknown> {
    const profile = options.profile ?? 'default';
    const diskRevision = readStateRevision(disk);
    const mergedEntries = mergeGameStateEntries(
        disk && Array.isArray(disk.entries) ? disk.entries : [],
        Array.isArray(incoming.entries) ? incoming.entries : []
    );

    if (!disk) {
        return {
            ...incoming,
            entries: mergedEntries,
            stateRevision: 1,
        };
    }

    const baseRevision = options.baseRevision ?? diskRevision;
    const conflict = diskRevision > baseRevision;

    if (profile === 'entries-only') {
        return {
            ...disk,
            entries: mergedEntries,
            stateRevision: diskRevision + 1,
        };
    }

    if (!conflict) {
        return {
            ...disk,
            ...incoming,
            entries: mergedEntries,
            stateRevision: diskRevision + 1,
        };
    }

    if (profile === 'commerce-ui') {
        const result: Record<string, unknown> = {
            ...disk,
            entries: mergedEntries,
            stateRevision: diskRevision + 1,
        };
        if ('commerce' in incoming) {
            result.commerce = incoming.commerce;
        }
        return result;
    }

    if (profile === 'turn') {
        const result: Record<string, unknown> = {
            ...disk,
            entries: mergedEntries,
            stateRevision: diskRevision + 1,
        };
        for (const key of TURN_AUTHORITATIVE_ROOT_KEYS) {
            if (key in incoming) {
                result[key] = incoming[key];
            }
        }
        for (const key of UI_PROTECTED_ON_TURN_COMMIT) {
            if (key in disk) {
                result[key] = disk[key];
            }
        }
        return result;
    }

    return {
        ...disk,
        ...incoming,
        entries: mergedEntries,
        stateRevision: diskRevision + 1,
    };
}

function mergeRecordMaps<T extends Record<string, unknown>>(
    disk: T | undefined,
    incoming: T | undefined
): T | undefined {
    if (!incoming) { return disk; }
    if (!disk) { return incoming; }
    return { ...disk, ...incoming };
}

/** Deep-merge known world_state maps; scalar/array fields from incoming win when defined. */
export function mergeWorldStateForPersist<T extends Record<string, unknown>>(
    disk: T | undefined,
    incoming: T
): T {
    if (!disk) {
        return { ...incoming };
    }
    const diskRevision = typeof disk.revision === 'number' ? disk.revision : 0;
    return {
        ...disk,
        ...incoming,
        factions: mergeRecordMaps(
            disk.factions as Record<string, unknown> | undefined,
            incoming.factions as Record<string, unknown> | undefined
        ) ?? disk.factions,
        regions: mergeRecordMaps(
            disk.regions as Record<string, unknown> | undefined,
            incoming.regions as Record<string, unknown> | undefined
        ) ?? disk.regions,
        markets: mergeRecordMaps(
            disk.markets as Record<string, unknown> | undefined,
            incoming.markets as Record<string, unknown> | undefined
        ) ?? disk.markets,
        npcPositions: mergeRecordMaps(
            disk.npcPositions as Record<string, unknown> | undefined,
            incoming.npcPositions as Record<string, unknown> | undefined
        ) ?? disk.npcPositions,
        npcRelationships: mergeRecordMaps(
            disk.npcRelationships as Record<string, unknown> | undefined,
            incoming.npcRelationships as Record<string, unknown> | undefined
        ) ?? disk.npcRelationships,
        revision: diskRevision + 1,
    } as T;
}