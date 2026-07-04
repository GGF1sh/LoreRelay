// Debug Trace: capture shallow step rows for single-tick world steps (GM sim, Observatory, debug scenario).

import { isDeepTraceEmitEnabled } from './debugTraceEmitHost';
import {
    captureDebugTraceSimulationStep,
    ensureDebugTraceLiveRun,
} from './debugTraceHostCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import type { WorldState } from './worldStateCore';

/** Capture one world step into the debug trace buffer when deep emit is gated. Never throws. */
export function captureWorldStepDebugTraceIfGated(
    state: WorldState,
    stepEvents: WorldChangeEvent[]
): void {
    if (!isDeepTraceEmitEnabled()) {
        return;
    }
    const runId = ensureDebugTraceLiveRun(state.worldTurn ?? 0);
    if (!runId) {
        return;
    }
    try {
        captureDebugTraceSimulationStep(runId, state, stepEvents, {
            omitFoodCrisisShallowWhenDeepEmit: true,
        });
    } catch {
        // Debug trace must never affect world simulation.
    }
}