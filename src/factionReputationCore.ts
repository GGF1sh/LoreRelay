// F3 Faction Reputation: deterministic player standing per faction (no vscode/fs).

import type { NpcRegistry } from './npcRegistryCore';
import { isValidEventId } from './worldEventLogCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import type { FactionWorldState, QuestHook } from './worldStateCore';

export const MIN_REPUTATION = -100;
export const MAX_REPUTATION = 100;
export const DEFAULT_QUEST_REPUTATION_DELTA = 10;
export const MAX_REPUTATION_OPS = 20;
export const MAX_REPUTATION_DELTA_PER_OP = 50;
export const MAX_REPUTATION_PROMPT_FACTIONS = 4;

export type ReputationTier = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';

export interface ReputationDelta {
    factionId: string;
    delta: number;
    reason?: string;
}

export function clampReputation(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return 0; }
    return Math.max(MIN_REPUTATION, Math.min(MAX_REPUTATION, Math.round(value)));
}

export function reputationTier(value: number): ReputationTier {
    const rep = clampReputation(value);
    if (rep <= -60) { return 'hostile'; }
    if (rep <= -20) { return 'unfriendly'; }
    if (rep < 20) { return 'neutral'; }
    if (rep < 60) { return 'friendly'; }
    return 'allied';
}

export function applyReputationDeltas(
    current: Record<string, number>,
    deltas: ReputationDelta[]
): Record<string, number> {
    const out = { ...current };
    for (const item of deltas) {
        if (!isValidEventId(item.factionId)) { continue; }
        const delta = Math.max(
            -MAX_REPUTATION_DELTA_PER_OP,
            Math.min(MAX_REPUTATION_DELTA_PER_OP, Math.round(item.delta))
        );
        if (delta === 0) { continue; }
        out[item.factionId] = clampReputation((out[item.factionId] ?? 0) + delta);
    }
    return out;
}

export function applyPlayerReputationToFactions(
    factions: Record<string, FactionWorldState>,
    deltas: ReputationDelta[],
    validFactionIds?: Set<string>
): Record<string, FactionWorldState> {
    if (deltas.length === 0) { return factions; }
    const repMap: Record<string, number> = {};
    for (const [id, fs] of Object.entries(factions)) {
        if (fs.playerReputation !== undefined) {
            repMap[id] = fs.playerReputation;
        }
    }
    const filtered = validFactionIds
        ? deltas.filter((d) => validFactionIds.has(d.factionId))
        : deltas;
    const merged = applyReputationDeltas(repMap, filtered);
    const out = { ...factions };
    for (const [factionId, rep] of Object.entries(merged)) {
        const prev = out[factionId] ?? { power: 50 };
        out[factionId] = { ...prev, playerReputation: rep };
    }
    return out;
}

export function parseReputationOps(raw: unknown): ReputationDelta[] {
    if (!Array.isArray(raw)) { return []; }
    const ops: ReputationDelta[] = [];
    for (const item of raw.slice(0, MAX_REPUTATION_OPS)) {
        if (!item || typeof item !== 'object') { continue; }
        const doc = item as Record<string, unknown>;
        const factionId = typeof doc.factionId === 'string' ? doc.factionId.trim() : '';
        if (!isValidEventId(factionId)) { continue; }
        if (typeof doc.delta !== 'number' || !Number.isFinite(doc.delta)) { continue; }
        const delta = Math.round(doc.delta);
        if (delta === 0) { continue; }
        const reason = typeof doc.reason === 'string' ? doc.reason.trim().slice(0, 64) : undefined;
        ops.push({
            factionId,
            delta: Math.max(-MAX_REPUTATION_DELTA_PER_OP, Math.min(MAX_REPUTATION_DELTA_PER_OP, delta)),
            reason
        });
    }
    return ops;
}

export function resolveFactionIdForQuestHook(
    hook: QuestHook,
    recentChanges: WorldChangeEvent[] | undefined,
    npcRegistry: NpcRegistry | undefined
): string | undefined {
    if (hook.source === 'npc' && hook.npcId && npcRegistry?.npcs[hook.npcId]?.factionId) {
        const factionId = npcRegistry.npcs[hook.npcId].factionId;
        return factionId && isValidEventId(factionId) ? factionId : undefined;
    }
    if (hook.source === 'event' && recentChanges?.length) {
        const event = recentChanges.find((ev) => ev.id === hook.relatedId);
        if (event?.factionId && isValidEventId(event.factionId)) {
            return event.factionId;
        }
    }
    return undefined;
}

export function deriveQuestCompletionDeltas(
    questHooks: QuestHook[],
    resolvedIds: Set<string>,
    recentChanges: WorldChangeEvent[] | undefined,
    npcRegistry: NpcRegistry | undefined,
    delta: number = DEFAULT_QUEST_REPUTATION_DELTA
): ReputationDelta[] {
    const deltas: ReputationDelta[] = [];
    const reward = Math.max(1, Math.min(MAX_REPUTATION_DELTA_PER_OP, Math.round(delta)));
    for (const hook of questHooks) {
        if (!resolvedIds.has(hook.id) || hook.status !== 'active') { continue; }
        const factionId = resolveFactionIdForQuestHook(hook, recentChanges, npcRegistry);
        if (!factionId) { continue; }
        deltas.push({ factionId, delta: reward, reason: 'quest' });
    }
    return deltas;
}

export function buildReputationPromptLine(
    factions: { id: string; name: string; rep: number }[],
    max: number = MAX_REPUTATION_PROMPT_FACTIONS
): string {
    const cap = Math.max(1, Math.min(MAX_REPUTATION_PROMPT_FACTIONS, Math.floor(max)));
    const notable = factions
        .filter((f) => f.rep !== 0)
        .sort((a, b) => Math.abs(b.rep) - Math.abs(a.rep))
        .slice(0, cap);
    if (notable.length === 0) { return ''; }
    const parts = notable.map((f) => {
        const sign = f.rep >= 0 ? '+' : '';
        return `${f.name}: ${reputationTier(f.rep)} (${sign}${f.rep})`;
    });
    return `[Player Reputation]\n${parts.join(' | ')}\n(Factions remember the player's standing; reflect it in access, prices, and attitudes.)`;
}