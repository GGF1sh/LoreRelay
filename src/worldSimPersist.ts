// Persist world simulation steps (no debug-setting gate). Used by debug sandbox, Inspector, turn_result.

import { loadGameRules } from './gameRules';
import { loadWorldForge } from './worldForge';
import { ensureWorldStateExists, saveWorldState } from './worldState';
import { loadNpcRegistry, saveNpcRegistry } from './npcRegistry';
import {
    ABSOLUTE_MAX_BULK_WORLD_STEPS,
    clampBulkWorldSimSteps,
    runBulkWorldSimulation,
    runBulkWorldSimulationAsync,
    type BulkWorldSimSummary,
} from './worldSimBulkCore';
import { applyLivingWorldAfterSimulationStep } from './emergentSimulator';

export type WorldSimPersistFailureReason = 'SIM_OFF' | 'NO_FORGE' | 'INVALID_STEPS';

export interface WorldSimPersistSuccess {
    ok: true;
    summary: BulkWorldSimSummary;
}

export interface WorldSimPersistFailure {
    ok: false;
    reason: WorldSimPersistFailureReason;
}

export type WorldSimPersistResult = WorldSimPersistSuccess | WorldSimPersistFailure;

/** Run emergent simulation N steps and persist world_state (+ npc_registry). */
export function persistWorldSimulationSteps(
    steps: number,
    maxSteps = ABSOLUTE_MAX_BULK_WORLD_STEPS
): WorldSimPersistResult {
    const rules = loadGameRules();
    if (!rules.enableEmergentSimulation) {
        return { ok: false, reason: 'SIM_OFF' };
    }

    const forge = loadWorldForge();
    if (!forge) {
        return { ok: false, reason: 'NO_FORGE' };
    }

    const clamped = clampBulkWorldSimSteps(steps, maxSteps);
    if (clamped === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    const state = ensureWorldStateExists(forge);
    const enableNpc = rules.enableNpcRegistry === true;
    const registry = enableNpc ? loadNpcRegistry() : undefined;

    const result = runBulkWorldSimulation(forge, state, registry, {
        steps: clamped,
        enableNpcRegistry: enableNpc,
        maxSteps,
        afterStep: (next, events, reg) => applyLivingWorldAfterSimulationStep(forge, next, reg, events),
    });

    if (!result.ok) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    saveWorldState(result.state);
    if (enableNpc && result.registry) {
        saveNpcRegistry(result.registry);
    }

    return { ok: true, summary: result.summary };
}

/** Async bulk persist — yields during multi-step sim to avoid extension-host freezes. */
export async function persistWorldSimulationStepsAsync(
    steps: number,
    maxSteps = ABSOLUTE_MAX_BULK_WORLD_STEPS
): Promise<WorldSimPersistResult> {
    const rules = loadGameRules();
    if (!rules.enableEmergentSimulation) {
        return { ok: false, reason: 'SIM_OFF' };
    }

    const forge = loadWorldForge();
    if (!forge) {
        return { ok: false, reason: 'NO_FORGE' };
    }

    const clamped = clampBulkWorldSimSteps(steps, maxSteps);
    if (clamped === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    const state = ensureWorldStateExists(forge);
    const enableNpc = rules.enableNpcRegistry === true;
    const registry = enableNpc ? loadNpcRegistry() : undefined;

    const result = await runBulkWorldSimulationAsync(forge, state, registry, {
        steps: clamped,
        enableNpcRegistry: enableNpc,
        maxSteps,
        afterStep: (next, events, reg) => applyLivingWorldAfterSimulationStep(forge, next, reg, events),
    });

    if (!result.ok) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    saveWorldState(result.state);
    if (enableNpc && result.registry) {
        saveNpcRegistry(result.registry);
    }

    return { ok: true, summary: result.summary };
}