// Debug Trace P2 Phase A: session buffer host + simulation step capture (pure core, no I/O).

import {
    appendDebugTraceEntries,
    createDebugTraceBuffer,
    validateDebugTraceLinks,
    type DebugTraceBuffer,
    type DebugTraceEntry,
    type DebugTraceWarning,
} from './debugTraceCore';
import { isFoodCrisisEvent } from './livingWorldTypes';

/**
 * Phase A capture options.
 * When deep emit is ON, food-crisis classification is owned by P1a (`debugTraceEmitCore`);
 * Phase A must not duplicate `food_crisis_classifier` rows.
 */
export interface SimulationStepTraceOptions {
    omitFoodCrisisShallowWhenDeepEmit?: boolean;
}
import type { WorldState } from './worldStateCore';
import type { WorldChangeEvent, WorldChangeSeverity } from './worldEventLogCore';

export const DEBUG_TRACE_UPDATE_MESSAGE_TYPE = 'debugTraceUpdate' as const;

export interface DebugTraceUpdateMessage {
    type: typeof DEBUG_TRACE_UPDATE_MESSAGE_TYPE;
    buffer: DebugTraceBuffer;
    linkWarnings: DebugTraceWarning[];
}

const NOTABLE_SEVERITIES = new Set<WorldChangeSeverity>(['warning', 'critical']);
const MAX_EVENTS_TRACED_PER_STEP = 16;

let buffer: DebugTraceBuffer = createDebugTraceBuffer();
let runSequence = 0;
let activeSimulationRunId: string | undefined;

export type DebugTraceHostUpdateListener = () => void;

let updateListener: DebugTraceHostUpdateListener | undefined;

/** Test-only reset. */
export function resetDebugTraceHostForTests(): void {
    buffer = createDebugTraceBuffer();
    runSequence = 0;
    activeSimulationRunId = undefined;
    updateListener = undefined;
}

export function getActiveDebugTraceSimulationRunId(): string | undefined {
    return activeSimulationRunId;
}

export function setDebugTraceHostUpdateListener(listener: DebugTraceHostUpdateListener | undefined): void {
    updateListener = listener;
}

export function getDebugTraceHostBuffer(): DebugTraceBuffer {
    return buffer;
}

export function buildDebugTraceUpdateMessage(): DebugTraceUpdateMessage {
    return {
        type: DEBUG_TRACE_UPDATE_MESSAGE_TYPE,
        buffer: {
            version: buffer.version,
            maxEntries: buffer.maxEntries,
            entries: [...buffer.entries],
        },
        linkWarnings: validateDebugTraceLinks(buffer),
    };
}

function notifyUpdated(): void {
    try {
        updateListener?.();
    } catch {
        // Listener failures must not break simulation or append paths.
    }
}

/** Append one or more entries; never throws into callers. */
export function appendDebugTraceHostEntries(entries: unknown[]): void {
    if (!entries.length) {
        return;
    }
    try {
        const result = appendDebugTraceEntries(buffer, entries);
        buffer = result.buffer;
        notifyUpdated();
    } catch {
        // Swallow — debug trace must never affect game behavior.
    }
}

export function beginDebugTraceSimulationRun(startWorldTurn: number): string {
    runSequence += 1;
    activeSimulationRunId = `sim_${startWorldTurn}_${runSequence}`;
    return activeSimulationRunId;
}

function buildNotableEventEntry(
    runId: string,
    parentTraceId: string,
    ev: WorldChangeEvent,
    options?: SimulationStepTraceOptions
): DebugTraceEntry | undefined {
    const foodCrisis = isFoodCrisisEvent(ev);
    if (foodCrisis && options?.omitFoodCrisisShallowWhenDeepEmit) {
        return undefined;
    }

    const entry: DebugTraceEntry = {
        version: 1,
        runId,
        traceId: `trace_ev_${ev.id}`,
        parentTraceId,
        worldTurn: ev.worldTurn,
        subsystem: 'worldEvent',
        phase: ev.severity === 'critical' ? 'warning' : 'event',
        ruleId: 'notable_event',
        decision: 'notable',
        message: ev.message,
        inputRefs: [{ kind: 'event', id: ev.id }],
        audience: ev.severity === 'critical' ? 'gm_safe' : 'internal',
    };
    if (ev.factionId) {
        entry.outputRefs = [{ kind: 'faction', id: ev.factionId }];
    }
    return entry;
}

/** Pure builder for unit tests and capture path. */
export function buildSimulationStepTraceEntries(
    runId: string,
    state: WorldState,
    stepEvents: WorldChangeEvent[],
    options?: SimulationStepTraceOptions
): DebugTraceEntry[] {
    const worldTurn = state.worldTurn ?? 0;
    const parentTraceId = `trace_step_${worldTurn}`;
    const entries: DebugTraceEntry[] = [
        {
            version: 1,
            runId,
            traceId: parentTraceId,
            worldTurn,
            subsystem: 'worldSim',
            phase: 'event',
            message: `Simulation step emitted ${stepEvents.length} event(s).`,
            audience: 'internal',
        },
    ];

    let traced = 0;
    for (const ev of stepEvents) {
        if (!NOTABLE_SEVERITIES.has(ev.severity)) {
            continue;
        }
        if (traced >= MAX_EVENTS_TRACED_PER_STEP) {
            break;
        }
        const notable = buildNotableEventEntry(runId, parentTraceId, ev, options);
        if (notable) {
            entries.push(notable);
        }
        traced += 1;
    }

    return entries;
}

/** Capture one simulation step into the host buffer; never throws. */
export function captureDebugTraceSimulationStep(
    runId: string,
    state: WorldState,
    stepEvents: WorldChangeEvent[],
    options?: SimulationStepTraceOptions
): void {
    try {
        const entries = buildSimulationStepTraceEntries(runId, state, stepEvents, options);
        appendDebugTraceHostEntries(entries);
    } catch {
        // Swallow — debug trace must never affect game behavior.
    }
}