/**
 * CombatOutcomeReceipt + non-apply closures for Bridge V1-A.
 */
import { createHash } from 'crypto';
import { BattleSpec, CombatState } from './gambitCombatCore';
import { CommandInputLog } from './combatRtsCommandInputCore';
import { stableSerialize } from './determinismSpineCore';
import { CampaignCombatRequest } from './campaignCombatRequestCore';

export type ApplyEligibleOutcomeCode = 'ALLY_WIN' | 'ENEMY_WIN' | 'TIMEOUT';

export interface CombatOutcomeParticipant {
    entityId: string;
    unitId: string;
    team: 0 | 1;
    finalHp: number;
    maxHp: number;
    alive: boolean;
    dead: boolean;
}

export interface CombatOutcomeReceipt {
    schemaVersion: 'combat-outcome-receipt-v1';
    applyEligible: true;
    combatSessionId: string;
    encounterId: string;
    requestId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    sourceCampaignRevision: number;
    sourceAcceptedTurnId?: string;
    requestedMode: 'command' | 'spectator';
    effectiveMode: 'command' | 'spectator';
    terminalOutcomeCode: ApplyEligibleOutcomeCode;
    terminalOutcomeLabel?: string;
    finalTick: number;
    participants: CombatOutcomeParticipant[];
    objective: { type: 'annihilate'; result: 'success' | 'failure' | 'timeout' };
    simulationResultHash: string;
    /** Hash of compile-time BattleSpec + roster snapshot (session identity for recovery). */
    compiledSnapshotHash?: string;
    commandReplayHash?: string;
    receiptHash: string;
}

export interface CombatSessionClosureRecord {
    schemaVersion: 'combat-session-closure-v1';
    applyEligible: false;
    combatSessionId: string;
    requestId: string;
    encounterId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    reasonCode: 'ABORT' | 'ERROR';
    detail?: string;
    recordHash: string;
}

export function mapCombatTerminalLabel(label: string): ApplyEligibleOutcomeCode | null {
    const s = String(label || '');
    if (s.includes('勝利') || /ally\s*win/i.test(s) || s === 'ALLY_WIN') return 'ALLY_WIN';
    if (s.includes('敗北') || /enemy\s*win/i.test(s) || s === 'ENEMY_WIN') return 'ENEMY_WIN';
    if (/timeout/i.test(s) || s === 'Timeout' || s === 'TIMEOUT') return 'TIMEOUT';
    return null;
}

export function sha256Stable(payload: unknown): string {
    return createHash('sha256').update(stableSerialize(payload), 'utf8').digest('hex');
}

export function computeSimulationResultHash(input: {
    battleSpec: BattleSpec;
    commandLog: CommandInputLog;
    state: CombatState;
    outcomeLabel: string;
    participantOrder: readonly string[];
}): string {
    const units = input.participantOrder.map(unitId => {
        const u = input.state.units[unitId];
        return {
            unitId,
            team: u.team,
            hp: u.hp,
            maxHp: u.max_hp,
            dead: !!(u._dead || u.hp <= 0),
            x: u.pos_x,
            y: u.pos_y,
        };
    });
    return sha256Stable({
        domain: 'lorerelay-combat-simulation-result-v1',
        battleSpec: input.battleSpec,
        commandLog: input.commandLog,
        finalState: {
            tick: input.state.tick,
            outcomeLabel: input.outcomeLabel,
            units,
        },
    });
}

export function buildCombatOutcomeReceipt(input: {
    combatSessionId: string;
    request: CampaignCombatRequest;
    effectiveMode: 'command' | 'spectator';
    outcomeLabel: string;
    state: CombatState;
    battleSpec: BattleSpec;
    commandLog: CommandInputLog;
    entityToUnitId: Record<string, string>;
    compiledSnapshotHash?: string;
    commandReplayHash?: string;
}): CombatOutcomeReceipt | { ok: false; error: string } {
    const code = mapCombatTerminalLabel(input.outcomeLabel);
    if (!code) return { ok: false, error: 'NON_APPLY_OUTCOME' };

    const unitToEntity = new Map<string, string>();
    for (const [entityId, unitId] of Object.entries(input.entityToUnitId)) {
        unitToEntity.set(unitId, entityId);
    }

    const participants: CombatOutcomeParticipant[] = input.battleSpec.participantOrder.map(unitId => {
        const u = input.state.units[unitId];
        const dead = !!(u._dead || u.hp <= 0);
        return {
            entityId: unitToEntity.get(unitId) || unitId,
            unitId,
            team: u.team as 0 | 1,
            finalHp: u.hp,
            maxHp: u.max_hp,
            alive: !dead,
            dead,
        };
    });

    const objectiveResult = code === 'ALLY_WIN' ? 'success' as const
        : code === 'ENEMY_WIN' ? 'failure' as const
            : 'timeout' as const;

    const simulationResultHash = computeSimulationResultHash({
        battleSpec: input.battleSpec,
        commandLog: input.commandLog,
        state: input.state,
        outcomeLabel: input.outcomeLabel,
        participantOrder: input.battleSpec.participantOrder,
    });

    const body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: input.combatSessionId,
        encounterId: input.request.encounterId,
        requestId: input.request.requestId,
        campaignInstanceId: input.request.campaignInstanceId,
        timelineEpochId: input.request.timelineEpochId,
        sourceCampaignRevision: input.request.sourceCampaignRevision,
        ...(input.request.sourceAcceptedTurnId
            ? { sourceAcceptedTurnId: input.request.sourceAcceptedTurnId }
            : {}),
        requestedMode: input.request.requestedMode,
        effectiveMode: input.effectiveMode,
        terminalOutcomeCode: code,
        terminalOutcomeLabel: input.outcomeLabel,
        finalTick: input.state.tick,
        participants,
        objective: { type: 'annihilate', result: objectiveResult },
        simulationResultHash,
        ...(input.compiledSnapshotHash ? { compiledSnapshotHash: input.compiledSnapshotHash } : {}),
        ...(input.commandReplayHash ? { commandReplayHash: input.commandReplayHash } : {}),
    };

    const receiptHash = sha256Stable(body);
    return { ...body, receiptHash };
}

export function buildCombatSessionClosure(input: {
    combatSessionId: string;
    request: CampaignCombatRequest;
    reasonCode: 'ABORT' | 'ERROR';
    detail?: string;
}): CombatSessionClosureRecord {
    const body: Omit<CombatSessionClosureRecord, 'recordHash'> = {
        schemaVersion: 'combat-session-closure-v1',
        applyEligible: false,
        combatSessionId: input.combatSessionId,
        requestId: input.request.requestId,
        encounterId: input.request.encounterId,
        campaignInstanceId: input.request.campaignInstanceId,
        timelineEpochId: input.request.timelineEpochId,
        reasonCode: input.reasonCode,
        ...(input.detail ? { detail: input.detail } : {}),
    };
    return { ...body, recordHash: sha256Stable(body) };
}
