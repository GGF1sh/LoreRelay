// Guild Master G1–G2: host bridge — prompt injection + webview payload.

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { buildRequestBoardPromptLines, resolveFocusRequestId } from './guildPromptCore';
import {
    getRequest,
    MAX_GUILD_REQUEST_QUEUE,
    type RequestRulingId,
} from './guildRequestCore';
import type { GuildState } from './guildCore';
import { readGuildFromState } from './guildTurnOpsCore';
import { guildModeEnabled } from './guildTurnOps';

export function resolveHallLocationName(locationId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const location = forge.geography.locations.find((l) => l.id === locationId);
    return location?.name || locationId;
}

const RULING_IDS: readonly RequestRulingId[] = ['accept', 'decline', 'negotiate'];

export { resolveFocusRequestId } from './guildPromptCore';

export function buildGuildPromptContext(
    gameState: Record<string, unknown> | undefined,
    playerAction?: string
): string {
    const rules = loadGameRules();
    if (!guildModeEnabled(rules) || rules.enableGuildRequests !== true) {
        return '';
    }

    const guild = gameState ? readGuildFromState(gameState) : undefined;
    if (!guild || !guild.enabled || !guild.pendingRequests?.length) {
        return '';
    }

    const focusRequestId = resolveFocusRequestId(guild, playerAction);
    const lines = buildRequestBoardPromptLines(guild, focusRequestId);
    return lines.length > 0 ? lines.join('\n') : '';
}

/** FoW-safe subset for World tab (G1 stats/roster; G2 request board when enabled). */
export function pickGuildForWebview(guild: GuildState | undefined): Record<string, unknown> | undefined {
    if (!guild || !guild.enabled) { return undefined; }

    const pendingRequests = (guild.pendingRequests ?? [])
        .slice(0, MAX_GUILD_REQUEST_QUEUE)
        .map((id) => getRequest(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({
            id: r.id,
            clientArchetype: r.clientArchetype,
            summary: r.summary,
            rulings: RULING_IDS.map((rulingId) => ({
                rulingId,
                label: r.rulings[rulingId].label,
            })),
        }));

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
        pendingRequests: pendingRequests.length > 0 ? pendingRequests : undefined,
        quests: (guild.quests ?? []).map((q) => ({
            id: q.id,
            requestId: q.requestId,
            questKind: q.questKind,
            status: q.status,
            difficulty: q.difficulty,
            rewardCoffers: q.rewardCoffers,
        })),
    };
}