// Guild G2: GM prompt lines — bulk board / parley tier (no vscode/fs).

import type { GuildQuest, GuildState } from './guildCore';
import {
    buildActiveQuestPromptLine,
    GUILD_QUEST_OPS_PROMPT_LINE,
} from './guildQuestCore';
import {
    getRequest,
    type GuildRequestId,
    type RequestRulingId,
} from './guildRequestCore';

export type GuildBoardTier = 'bulk' | 'full';

const RULING_IDS: readonly RequestRulingId[] = ['accept', 'decline', 'negotiate'];

export const GUILD_BOARD_OPS_PROMPT_LINE =
    'Rule each request via turn_result.guildOps: '
    + '{ kind: "resolve_request", requestId: "<id>", rulingId: "accept"|"decline"|"negotiate" }. '
    + 'Then dispatch via { kind: "assign_party", quest: { questId, npcIds: [...], weeks: 1-3 } }. '
    + 'Core applies rewards and outcomes; narrate the client and the adventurers only. '
    + 'Do not invent coffers, renown, or quest results — Core is canonical.';

/** Match a pending request id embedded in player action (parley button inserts requestId). */
export function resolveFocusRequestId(
    guild: GuildState,
    playerAction?: string
): string | undefined {
    if (!playerAction || !guild.pendingRequests?.length) { return undefined; }
    const text = playerAction.toLowerCase();
    for (const id of guild.pendingRequests) {
        if (text.includes(id.toLowerCase())) { return id; }
    }
    return undefined;
}

/** focusRequestId must be in pendingRequests for full (parley) tier. */
export function resolveGuildBoardTier(
    guild: GuildState,
    focusRequestId?: string
): GuildBoardTier {
    if (
        focusRequestId
        && guild.pendingRequests?.includes(focusRequestId)
        && getRequest(focusRequestId)
    ) {
        return 'full';
    }
    return 'bulk';
}

export function buildRequestBoardPromptLines(
    guild: GuildState,
    focusRequestId?: string
): string[] {
    const ids = (guild.pendingRequests ?? []).slice(0, 4);
    if (ids.length === 0) { return []; }

    const tier = resolveGuildBoardTier(guild, focusRequestId);
    if (tier === 'full' && focusRequestId) {
        const def = getRequest(focusRequestId);
        if (!def) { return []; }
        const opts = RULING_IDS
            .map((rid) => `${rid}: ${def.rulings[rid].label}`)
            .join(' / ');
        return [
            '[Guild — Parley]',
            `A client waits for a private audience: ${def.clientArchetype}.`,
            `${def.summary}`,
            `Options — ${opts}.`,
            GUILD_BOARD_OPS_PROMPT_LINE,
            'Play this client in character; do not invent reward or difficulty numbers.',
        ];
    }

    const lines: string[] = [
        '[Guild — Board]',
        'Clients crowd the quest board this week.',
    ];
    for (const id of ids) {
        const def = getRequest(id);
        if (!def) { continue; }
        const opts = RULING_IDS
            .map((rid) => `${rid}: ${def.rulings[rid].label}`)
            .join(' / ');
        lines.push(`- ${def.id} (${def.clientArchetype}): ${def.summary} Options — ${opts}.`);
    }
    lines.push(GUILD_BOARD_OPS_PROMPT_LINE);
    lines.push('Play each client in character; do not invent coffers or renown numbers.');
    return lines;
}

export function buildGuildQuestPromptLines(guild: GuildState): string[] {
    const lines: string[] = [];
    const quests = guild.quests ?? [];
    const activeLine = buildActiveQuestPromptLine(quests);
    if (activeLine) {
        lines.push(activeLine);
    }
    if (guild.lastQuestReports && guild.lastQuestReports.length > 0) {
        lines.push(['[Guild — Quests Returned]', ...guild.lastQuestReports].join('\n'));
    }
    const accepted = quests.filter((q) => q.status === 'accepted');
    if (accepted.length > 0) {
        const pending = accepted
            .map((q: GuildQuest) => `${q.id} (${q.questKind}, reward ${q.rewardCoffers})`)
            .join('; ');
        lines.push(`[Guild — Accepted] Awaiting dispatch: ${pending}.`);
        lines.push(GUILD_QUEST_OPS_PROMPT_LINE);
    }
    return lines;
}