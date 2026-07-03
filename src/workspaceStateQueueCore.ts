// Campaign P0 — pure merge helpers for serialized workspace writes (no vscode/fs).

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
 * Top-level fields from incoming win; entries are merged by id.
 */
export function mergeGameStateForPersist(
    disk: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>
): Record<string, unknown> {
    if (!disk) {
        return { ...incoming };
    }
    const diskEntries = Array.isArray(disk.entries) ? disk.entries : [];
    const incomingEntries = Array.isArray(incoming.entries) ? incoming.entries : [];
    const mergedEntries = mergeGameStateEntries(diskEntries, incomingEntries);
    const diskRevision = typeof disk.stateRevision === 'number' ? disk.stateRevision : 0;
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