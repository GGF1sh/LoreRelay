/**
 * Pure checkpoint helpers for Bridge V1-C combat history preservation.
 * No vscode / workspacePaths dependency.
 */
import {
    listBattleHistory,
    type CombatBattleHistoryEntry,
} from './campaignCombatApplyCore';

export interface CheckpointCombatGmSnapshot {
    entries: unknown[];
    status?: Record<string, unknown>;
    options?: string[];
    theme?: string;
    combatBattleHistory?: CombatBattleHistoryEntry[];
    [key: string]: unknown;
}

/** Pure: extract durable combat history from a game_state-like object for checkpointing. */
export function extractCombatBattleHistoryForCheckpoint(
    state: Record<string, unknown> | undefined,
): CombatBattleHistoryEntry[] | undefined {
    if (!state) return undefined;
    const list = listBattleHistory(state);
    return list.length > 0 ? list.map((e) => ({ ...e })) : undefined;
}

/** Pure: attach combat history onto a restored GM snapshot / game_state shell. */
export function attachCombatBattleHistoryToSnapshot<T extends object>(
    snapshot: T,
    combatBattleHistory: CombatBattleHistoryEntry[] | undefined,
): T & { combatBattleHistory?: CombatBattleHistoryEntry[] } {
    if (!combatBattleHistory || combatBattleHistory.length === 0) {
        return { ...snapshot };
    }
    return {
        ...snapshot,
        combatBattleHistory: combatBattleHistory.map((e) => ({ ...e })),
    };
}
