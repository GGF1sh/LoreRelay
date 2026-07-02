import * as vscode from 'vscode';
import { loadGameRules } from './gameRules';
import { loadWorldForge } from './worldForge';
import {
    ABSOLUTE_MAX_BULK_WORLD_STEPS,
    clampBulkWorldSimSteps,
    DEFAULT_MAX_BULK_WORLD_STEPS,
    type BulkWorldSimSummary,
} from './worldSimBulkCore';
import { persistWorldSimulationSteps } from './worldSimPersist';

export type BulkWorldSimRunnerFailureReason =
    | 'DISABLED'
    | 'SIM_OFF'
    | 'NO_FORGE'
    | 'INVALID_STEPS';

export interface BulkWorldSimRunnerSuccess {
    ok: true;
    summary: BulkWorldSimSummary;
}

export interface BulkWorldSimRunnerFailure {
    ok: false;
    reason: BulkWorldSimRunnerFailureReason;
}

export type BulkWorldSimRunnerResult = BulkWorldSimRunnerSuccess | BulkWorldSimRunnerFailure;

export function isBulkWorldSimDebugEnabled(): boolean {
    return vscode.workspace.getConfiguration('textAdventure.debug').get<boolean>('bulkWorldSim') === true;
}

export function getBulkWorldSimMaxSteps(): number {
    const raw = vscode.workspace.getConfiguration('textAdventure.debug').get<number>('bulkWorldSimMaxSteps');
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return DEFAULT_MAX_BULK_WORLD_STEPS;
    }
    return Math.max(1, Math.min(ABSOLUTE_MAX_BULK_WORLD_STEPS, Math.floor(raw)));
}

/** Execute bulk world simulation and persist world_state (+ npc_registry when enabled). */
export async function executeBulkWorldSimulation(steps: number): Promise<BulkWorldSimRunnerResult> {
    if (!isBulkWorldSimDebugEnabled()) {
        return { ok: false, reason: 'DISABLED' };
    }

    const rules = loadGameRules();
    if (!rules.enableEmergentSimulation) {
        return { ok: false, reason: 'SIM_OFF' };
    }

    const forge = loadWorldForge();
    if (!forge) {
        return { ok: false, reason: 'NO_FORGE' };
    }

    const maxSteps = getBulkWorldSimMaxSteps();
    const clamped = clampBulkWorldSimSteps(steps, maxSteps);
    if (clamped === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    const result = persistWorldSimulationSteps(clamped, maxSteps);
    if (!result.ok) {
        return { ok: false, reason: result.reason === 'SIM_OFF' ? 'SIM_OFF' : result.reason === 'NO_FORGE' ? 'NO_FORGE' : 'INVALID_STEPS' };
    }

    return { ok: true, summary: result.summary };
}

/** Advance world simulation without the debug-setting gate (debug sandbox Inspector). */
export function executeWorldSimulationAdvance(steps: number, maxSteps?: number): BulkWorldSimRunnerResult {
    const rules = loadGameRules();
    if (!rules.enableEmergentSimulation) {
        return { ok: false, reason: 'SIM_OFF' };
    }
    if (!loadWorldForge()) {
        return { ok: false, reason: 'NO_FORGE' };
    }
    const ceiling = maxSteps ?? ABSOLUTE_MAX_BULK_WORLD_STEPS;
    const clamped = clampBulkWorldSimSteps(steps, ceiling);
    if (clamped === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }
    const result = persistWorldSimulationSteps(clamped, ceiling);
    if (!result.ok) {
        return { ok: false, reason: result.reason === 'SIM_OFF' ? 'SIM_OFF' : result.reason === 'NO_FORGE' ? 'NO_FORGE' : 'INVALID_STEPS' };
    }
    return { ok: true, summary: result.summary };
}