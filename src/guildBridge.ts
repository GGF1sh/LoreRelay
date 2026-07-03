// Guild Master G1: host bridge — webview payload (read-only panel).

import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import type { GuildState } from './guildCore';

export function resolveHallLocationName(locationId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const location = forge.geography.locations.find((l) => l.id === locationId);
    return location?.name || locationId;
}

/** FoW-safe subset for World tab (G1: stats + roster only). */
export function pickGuildForWebview(guild: GuildState | undefined): Record<string, unknown> | undefined {
    if (!guild || !guild.enabled) { return undefined; }
    return {
        hallLocationId: guild.hallLocationId,
        hallLocationName: resolveHallLocationName(guild.hallLocationId),
        rank: guild.rank,
        calendarWeek: guild.calendarWeek,
        calendarYear: guild.calendarYear,
        coffers: guild.coffers,
        supplies: guild.supplies,
        renown: guild.renown,
        discipline: guild.discipline,
        townFavor: guild.townFavor,
        facilities: guild.facilities,
        safety: guild.safety,
        lore: guild.lore,
        weeklyActionsRemaining: guild.weeklyActionsRemaining,
        lastEventId: guild.lastEventId,
        adventurers: guild.adventurers.map((a) => ({ npcId: a.npcId, klass: a.klass })),
        pendingEvents: guild.pendingEvents.slice(-5),
    };
}