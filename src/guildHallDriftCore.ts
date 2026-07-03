// Guild G4: hall depart/return drift (no vscode/fs).

import {
    validateGuild,
    normalizeGuildConfig,
    type GuildConfig,
    type GuildState,
} from './guildCore';
import {
    createGuildSnapshot,
    guildStateFromSnapshot,
    computeSinceLastGuildVisitDelta,
    parseGuildSnapshot,
    parseSinceLastGuildVisitDelta,
    DEFAULT_GUILD_TURNS_PER_WEEK,
    type GuildSnapshot,
    type SinceLastGuildVisitDelta,
    type GuildVisitChange,
} from './guildDriftCore';
import {
    makeWorldChangeEvent,
    mergeRecentChanges,
    type WorldChangeEvent,
} from './worldEventLogCore';

export interface GuildHallDriftState {
    guildSnapshotAtDepart?: GuildSnapshot;
    lastGuildVisitWorldTurn?: number;
    guildSinceLastVisit?: SinceLastGuildVisitDelta;
}

export function readGuildHallDriftState(
    gameState: Record<string, unknown>
): GuildHallDriftState {
    const snapshot = parseGuildSnapshot(gameState.guildSnapshotAtDepart);
    const lastGuildVisitWorldTurn = typeof gameState.lastGuildVisitWorldTurn === 'number'
        && Number.isFinite(gameState.lastGuildVisitWorldTurn)
        ? Math.max(0, Math.floor(gameState.lastGuildVisitWorldTurn))
        : undefined;
    const guildSinceLastVisit = parseSinceLastGuildVisitDelta(gameState.guildSinceLastVisit);
    return { guildSnapshotAtDepart: snapshot, lastGuildVisitWorldTurn, guildSinceLastVisit };
}

export function isLocationAtGuildHall(
    locationId: string | undefined,
    hallLocationId: string
): boolean {
    if (!locationId || !hallLocationId) { return false; }
    return locationId === hallLocationId;
}

export function recordGuildHallDepart(
    gameState: Record<string, unknown>,
    worldTurn: number
): Record<string, unknown> {
    const guild = validateGuild(gameState.guild);
    if (!guild || !guild.enabled) { return gameState; }

    const snapshot = createGuildSnapshot(guild, worldTurn);
    return {
        ...gameState,
        guildSnapshotAtDepart: snapshot,
        lastGuildVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
        guildSinceLastVisit: undefined,
    };
}

export function refreshGuildSnapshotOnCommit(
    gameState: Record<string, unknown>,
    worldTurn: number
): Record<string, unknown> {
    const guild = validateGuild(gameState.guild);
    if (!guild || !guild.enabled) { return gameState; }

    const snapshot = createGuildSnapshot(guild, worldTurn);
    return {
        ...gameState,
        guildSnapshotAtDepart: snapshot,
        lastGuildVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
    };
}

/** Promote guild visit changes into world recentChanges (LW3 rumor path). */
export function buildGuildVisitWorldEvents(
    changes: readonly GuildVisitChange[],
    worldTurn: number,
    hallLocationId: string
): WorldChangeEvent[] {
    const turn = Math.max(0, Math.floor(worldTurn));
    const loc = hallLocationId.trim().slice(0, 64);
    return changes.map((ch, index) => makeWorldChangeEvent({
        worldTurn: turn,
        category: 'guild',
        severity: ch.eventId === 'adventurer_brawl' || ch.eventId === 'supply_shortage' ? 'warning' : 'info',
        source: 'simulation',
        message: ch.message.slice(0, 200),
        locationId: loc || undefined,
        gmHint: `Guild hall drift: ${ch.eventId}. Narrate hearsay only — stats are already canonical.`,
        expiresAfterTurns: 20,
        idSuffix: `guild_${ch.eventId}_${turn}_${index}`,
    }));
}

export function mergeGuildVisitChangesIntoRecentChanges(
    existing: WorldChangeEvent[] | undefined,
    changes: readonly GuildVisitChange[],
    worldTurn: number,
    hallLocationId: string
): WorldChangeEvent[] {
    const events = buildGuildVisitWorldEvents(changes, worldTurn, hallLocationId);
    if (events.length === 0) { return existing ?? []; }
    return mergeRecentChanges(existing ?? [], events);
}

export function applyGuildHallReturnDrift(
    gameState: Record<string, unknown>,
    worldTurn: number,
    config?: Partial<GuildConfig>
): Record<string, unknown> {
    const guild = validateGuild(gameState.guild);
    if (!guild || !guild.enabled) { return gameState; }

    const driftState = readGuildHallDriftState(gameState);
    const snapshot = driftState.guildSnapshotAtDepart;
    const lastVisit = driftState.lastGuildVisitWorldTurn;
    if (!snapshot || lastVisit === undefined) { return gameState; }

    const normalized = normalizeGuildConfig(config);
    const turnsPerWeek = DEFAULT_GUILD_TURNS_PER_WEEK;
    const turnsAway = Math.max(0, Math.floor(worldTurn - lastVisit));
    const virtualWeeks = Math.floor(turnsAway / turnsPerWeek);
    const before = guildStateFromSnapshot(snapshot, guild);
    if (virtualWeeks <= 0) {
        return {
            ...gameState,
            lastGuildVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
            guildSnapshotAtDepart: createGuildSnapshot(guild, worldTurn),
        };
    }

    const result = computeSinceLastGuildVisitDelta({
        lastVisitWorldTurn: lastVisit,
        currentWorldTurn: worldTurn,
        hallLocationId: guild.hallLocationId,
        guildBefore: before,
        turnsPerWeek,
        baseSeed: snapshot.worldTurn + lastVisit,
        config: normalized,
    });
    if (!result) { return gameState; }

    return {
        ...gameState,
        guild: result.guildAfter,
        guildSinceLastVisit: result.delta,
        lastGuildVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
        guildSnapshotAtDepart: createGuildSnapshot(result.guildAfter, worldTurn),
    };
}

export function clearGuildSinceLastVisitReport(
    gameState: Record<string, unknown>
): Record<string, unknown> {
    if (gameState.guildSinceLastVisit === undefined) { return gameState; }
    const next = { ...gameState };
    delete next.guildSinceLastVisit;
    return next;
}