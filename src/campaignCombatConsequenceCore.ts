/**
 * Bridge V1-C pure combat consequence facts for GM prompt injection.
 * Authority: APPLIED marker + combatBattleHistory only. Never mutates HP or re-runs combat.
 */
import {
    CombatBattleHistoryEntry,
    listBattleHistory,
} from './campaignCombatApplyCore';

export const COMBAT_CONSEQUENCE_CHUNK_ID = 'combatConsequence' as const;
export const COMBAT_CONSEQUENCE_FACT_SCHEMA = 'combat-consequence-fact-v1' as const;
export const COMBAT_CONSEQUENCE_INJECTED_SCHEMA = 'combat-consequence-injected-v1' as const;

export interface CombatConsequenceFactV1 {
    schemaVersion: typeof COMBAT_CONSEQUENCE_FACT_SCHEMA;
    combatSessionId: string;
    encounterId: string;
    requestId: string;
    terminalOutcomeCode: string;
    finalTick: number;
    receiptHash: string;
    simulationResultHash: string;
    compiledSnapshotHash?: string;
    sourceCampaignRevision: number;
    playerHpBefore?: number;
    playerHpAfter?: number;
    playerMaxHp?: number;
    playerIncapacitated?: boolean;
}

export interface CombatAppliedMarkerLike {
    combatSessionId: string;
    receiptHash: string;
}

export interface CombatConsequenceInjectedMarkerV1 {
    schemaVersion: typeof COMBAT_CONSEQUENCE_INJECTED_SCHEMA;
    combatSessionId: string;
    receiptHash: string;
    sourceDigest: string;
}

/**
 * Build one authoritative fact when history entry and APPLIED marker agree on identity hashes.
 * Mismatch or missing APPLIED → undefined (not eligible).
 */
export function tryBuildCombatConsequenceFact(
    history: CombatBattleHistoryEntry,
    applied: CombatAppliedMarkerLike | undefined,
): CombatConsequenceFactV1 | undefined {
    if (!applied) return undefined;
    if (applied.receiptHash !== history.receiptHash) return undefined;
    if (applied.combatSessionId !== history.combatSessionId) return undefined;
    if (typeof history.receiptHash !== 'string' || !history.receiptHash) return undefined;
    if (typeof history.combatSessionId !== 'string' || !history.combatSessionId) return undefined;
    if (typeof history.terminalOutcomeCode !== 'string') return undefined;
    if (typeof history.simulationResultHash !== 'string') return undefined;

    return {
        schemaVersion: COMBAT_CONSEQUENCE_FACT_SCHEMA,
        combatSessionId: history.combatSessionId,
        encounterId: String(history.encounterId ?? ''),
        requestId: String(history.requestId ?? ''),
        terminalOutcomeCode: history.terminalOutcomeCode,
        finalTick: Number.isFinite(history.finalTick) ? history.finalTick : 0,
        receiptHash: history.receiptHash,
        simulationResultHash: history.simulationResultHash,
        ...(history.compiledSnapshotHash ? { compiledSnapshotHash: history.compiledSnapshotHash } : {}),
        sourceCampaignRevision: Number.isFinite(history.sourceCampaignRevision)
            ? history.sourceCampaignRevision
            : 0,
        ...(typeof history.playerHpBefore === 'number' ? { playerHpBefore: history.playerHpBefore } : {}),
        ...(typeof history.playerHpAfter === 'number' ? { playerHpAfter: history.playerHpAfter } : {}),
        ...(typeof history.playerMaxHp === 'number' ? { playerMaxHp: history.playerMaxHp } : {}),
        ...(typeof history.playerIncapacitated === 'boolean'
            ? { playerIncapacitated: history.playerIncapacitated }
            : {}),
    };
}

/** Oldest uninjected eligible fact in stored history order. */
export function selectOldestUninjectedCombatConsequenceFact(
    state: Record<string, unknown>,
    resolveApplied: (combatSessionId: string) => CombatAppliedMarkerLike | undefined,
    isInjected: (receiptHash: string) => boolean,
): CombatConsequenceFactV1 | undefined {
    const history = listBattleHistory(state);
    for (const entry of history) {
        if (!entry.receiptHash || isInjected(entry.receiptHash)) {
            continue;
        }
        const fact = tryBuildCombatConsequenceFact(entry, resolveApplied(entry.combatSessionId));
        if (fact) {
            return fact;
        }
    }
    return undefined;
}

function formatPlayerHpLine(fact: CombatConsequenceFactV1): string | undefined {
    if (typeof fact.playerHpAfter !== 'number') {
        return undefined;
    }
    const maxPart = typeof fact.playerMaxHp === 'number' ? `/${fact.playerMaxHp}` : '';
    const incap = fact.playerIncapacitated ? ' (incapacitated)' : '';
    return `Player HP after: ${fact.playerHpAfter}${maxPart}${incap}`;
}

/** Bounded structured prompt block — mechanics fixed; narration only. */
export function formatCombatConsequencePromptBlock(fact: CombatConsequenceFactV1): string {
    const lines = [
        '[Authoritative Combat Consequence]',
        `Encounter: ${fact.encounterId || '(unknown)'}`,
        `Outcome: ${fact.terminalOutcomeCode}`,
        `Final tick: ${fact.finalTick}`,
    ];
    const hpLine = formatPlayerHpLine(fact);
    if (hpLine) {
        lines.push(hpLine);
    }
    lines.push(
        `Receipt: ${fact.receiptHash}`,
        `Simulation result: ${fact.simulationResultHash}`,
        '',
        'These mechanics are fixed. Narrate their immediate consequences naturally.',
        'Do not change the winner, HP result, hashes, or apply combat state again.',
    );
    return lines.join('\n');
}

export function combatConsequenceTokenId(receiptHash: string): string {
    return `${COMBAT_CONSEQUENCE_CHUNK_ID}:${receiptHash}`;
}
