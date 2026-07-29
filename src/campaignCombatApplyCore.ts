/**
 * Bridge V1-B pure consequence builder + receipt validation.
 * Exactly-once semantics rely on APPLIED markers + history receiptHash (no wall-clock).
 */
import { CombatOutcomeReceipt } from './campaignCombatReceiptCore';
import { sha256Stable } from './campaignCombatReceiptCore';

export const COMBAT_BATTLE_HISTORY_KEY = 'combatBattleHistory';
export const COMBAT_BATTLE_HISTORY_LIMIT = 20;

export type CombatApplyBlockedReason =
    | 'NOT_APPLY_ELIGIBLE'
    | 'INVALID_RECEIPT'
    | 'RECEIPT_HASH_MISMATCH'
    | 'STALE_CAMPAIGN_REVISION'
    | 'ALREADY_APPLIED'
    | 'NO_GAME_STATE';

export interface CombatBattleHistoryEntry {
    combatSessionId: string;
    encounterId: string;
    requestId: string;
    terminalOutcomeCode: string;
    finalTick: number;
    receiptHash: string;
    simulationResultHash: string;
    compiledSnapshotHash?: string;
    sourceCampaignRevision: number;
}

export interface CombatApplyPlan {
    nextState: Record<string, unknown>;
    historyAppended: boolean;
    playerHpUpdated: boolean;
    playerHpBefore?: number;
    playerHpAfter?: number;
    alreadyPresent: boolean;
}

export function isApplyEligibleReceipt(raw: unknown): raw is CombatOutcomeReceipt {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const r = raw as Partial<CombatOutcomeReceipt>;
    return r.schemaVersion === 'combat-outcome-receipt-v1'
        && r.applyEligible === true
        && typeof r.combatSessionId === 'string'
        && typeof r.receiptHash === 'string'
        && typeof r.simulationResultHash === 'string'
        && typeof r.encounterId === 'string'
        && typeof r.terminalOutcomeCode === 'string'
        && Array.isArray(r.participants);
}

/** Recompute integrity hash over body without receiptHash. */
export function verifyReceiptHash(receipt: CombatOutcomeReceipt): boolean {
    const { receiptHash, ...body } = receipt;
    return sha256Stable(body) === receiptHash;
}

export function listBattleHistory(state: Record<string, unknown>): CombatBattleHistoryEntry[] {
    const raw = state[COMBAT_BATTLE_HISTORY_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is CombatBattleHistoryEntry =>
        !!e && typeof e === 'object' && typeof (e as CombatBattleHistoryEntry).receiptHash === 'string');
}

export function stateHasReceiptApplied(state: Record<string, unknown>, receiptHash: string): boolean {
    return listBattleHistory(state).some(e => e.receiptHash === receiptHash);
}

/**
 * Build next game_state from a validated receipt.
 * Minimal mutations: bounded battle history + optional player HP for mapped ally.
 */
export function buildCombatConsequencePlan(
    state: Record<string, unknown>,
    receipt: CombatOutcomeReceipt,
): CombatApplyPlan {
    if (stateHasReceiptApplied(state, receipt.receiptHash)) {
        return {
            nextState: state,
            historyAppended: false,
            playerHpUpdated: false,
            alreadyPresent: true,
        };
    }

    const historyEntry: CombatBattleHistoryEntry = {
        combatSessionId: receipt.combatSessionId,
        encounterId: receipt.encounterId,
        requestId: receipt.requestId,
        terminalOutcomeCode: receipt.terminalOutcomeCode,
        finalTick: receipt.finalTick,
        receiptHash: receipt.receiptHash,
        simulationResultHash: receipt.simulationResultHash,
        ...(receipt.compiledSnapshotHash ? { compiledSnapshotHash: receipt.compiledSnapshotHash } : {}),
        sourceCampaignRevision: receipt.sourceCampaignRevision,
    };

    const prevHistory = listBattleHistory(state);
    const nextHistory = [...prevHistory, historyEntry].slice(-COMBAT_BATTLE_HISTORY_LIMIT);

    const next: Record<string, unknown> = {
        ...state,
        [COMBAT_BATTLE_HISTORY_KEY]: nextHistory,
    };

    let playerHpUpdated = false;
    let playerHpBefore: number | undefined;
    let playerHpAfter: number | undefined;

    const playerParticipant = receipt.participants.find(p =>
        p.team === 0 && (p.entityId === 'player' || p.entityId === 'protagonist' || p.entityId === 'ally_1'));

    if (playerParticipant) {
        const status = next.status;
        if (status && typeof status === 'object' && !Array.isArray(status)) {
            const s = { ...(status as Record<string, unknown>) };
            const hp = s.hp;
            if (hp && typeof hp === 'object' && !Array.isArray(hp)) {
                const h = { ...(hp as Record<string, unknown>) };
                const max = typeof h.max === 'number' && Number.isFinite(h.max) ? h.max : playerParticipant.maxHp;
                const before = typeof h.current === 'number' && Number.isFinite(h.current) ? h.current : undefined;
                const clamped = Math.max(0, Math.min(max, Math.floor(playerParticipant.finalHp)));
                if (before !== clamped) {
                    h.current = clamped;
                    s.hp = h;
                    next.status = s;
                    playerHpUpdated = true;
                    playerHpBefore = before;
                    playerHpAfter = clamped;
                }
                // Soft dead/incap marker via existing condition array only
                if (playerParticipant.dead && Array.isArray(s.condition)) {
                    const cond = [...s.condition.map(String)];
                    if (!cond.includes('incapacitated') && !cond.includes('dead')) {
                        cond.push('incapacitated');
                        s.condition = cond;
                        next.status = s;
                    }
                }
            }
        }
    }

    return {
        nextState: next,
        historyAppended: true,
        playerHpUpdated,
        playerHpBefore,
        playerHpAfter,
        alreadyPresent: false,
    };
}

export interface CombatAppliedMarker {
    schemaVersion: 'combat-outcome-applied-v1';
    combatSessionId: string;
    receiptHash: string;
    simulationResultHash: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    compiledSnapshotHash?: string;
    historyAppended: boolean;
    playerHpUpdated: boolean;
}

export function buildAppliedMarker(
    receipt: CombatOutcomeReceipt,
    plan: CombatApplyPlan,
): CombatAppliedMarker {
    return {
        schemaVersion: 'combat-outcome-applied-v1',
        combatSessionId: receipt.combatSessionId,
        receiptHash: receipt.receiptHash,
        simulationResultHash: receipt.simulationResultHash,
        campaignInstanceId: receipt.campaignInstanceId,
        timelineEpochId: receipt.timelineEpochId,
        ...(receipt.compiledSnapshotHash ? { compiledSnapshotHash: receipt.compiledSnapshotHash } : {}),
        historyAppended: plan.historyAppended || plan.alreadyPresent,
        playerHpUpdated: plan.playerHpUpdated,
    };
}
