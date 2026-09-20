// Guild Master G1–G3: host bridge — prompt injection + webview payload.

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildRequestBoardPromptLines,
    buildGuildQuestPromptLines,
    buildGuildSinceLastVisitPrompt,
    resolveFocusRequestId,
} from './guildPromptCore';
import { readGuildHallDriftState } from './guildHallDriftCore';
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
    if (!guildModeEnabled(rules)) {
        return '';
    }

    const guild = gameState ? readGuildFromState(gameState) : undefined;
    if (!guild || !guild.enabled) {
        return '';
    }

    const lines: string[] = [];

    if (rules.enableGuildRequests === true && guild.pendingRequests?.length) {
        const focusRequestId = resolveFocusRequestId(guild, playerAction);
        lines.push(...buildRequestBoardPromptLines(guild, focusRequestId));
    }

    if (rules.enableGuildParties === true) {
        lines.push(...buildGuildQuestPromptLines(guild));
    }

    const { guildSinceLastVisit } = readGuildHallDriftState(gameState ?? {});
    const sinceLastVisit = buildGuildSinceLastVisitPrompt(guildSinceLastVisit);
    if (sinceLastVisit) {
        lines.push(sinceLastVisit);
    }

    return lines.filter(Boolean).join('\n\n');
}

/** FoW-safe subset for World tab (G1 stats/roster; G2 board; G3 quests when enabled). */
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
            partyNpcIds: q.partyNpcIds,
            weeksRemaining: q.weeksRemaining,
        })),
        lastQuestReports: guild.lastQuestReports?.slice(0, 3) ?? [],
    };
}