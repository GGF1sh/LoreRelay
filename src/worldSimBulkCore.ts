// Bulk world simulation steps for debug / time-passage prototypes.
// No vscode/fs/DOM imports — see docs/WORLD_TIME_PASSAGE_IDEA.md

import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';
import type { NpcRegistry } from './npcRegistryCore';
import type { WorldChangeEvent, WorldChangeSeverity } from './worldEventLogCore';
import { runSimulationStep } from './emergentSimulator';
import { applyEventsToNpcRegistry } from './npcBridgeCore';
import { generateQuestHooks } from './questGeneratorCore';

export const DEFAULT_MAX_BULK_WORLD_STEPS = 50;
export const ABSOLUTE_MAX_BULK_WORLD_STEPS = 100;
/** Yield to the extension-host event loop every N sim steps (async bulk path). */
export const BULK_WORLD_SIM_YIELD_EVERY_STEPS = 5;

export interface BulkWorldSimOptions {
    steps: number;
    enableNpcRegistry: boolean;
    maxSteps?: number;
    /** Optional hook after each simulation step (e.g. Living World market/NPC tick). */
    afterStep?: (state: WorldState, stepEvents: WorldChangeEvent[], registry?: NpcRegistry) => WorldState;
    /** Async bulk only — override steps between event-loop yields (default BULK_WORLD_SIM_YIELD_EVERY_STEPS). */
    yieldEverySteps?: number;
}

export interface BulkWorldSimNotableEvent {
    worldTurn: number;
    severity: WorldChangeSeverity;
    message: string;
}

export interface BulkWorldSimSummary {
    startWorldTurn: number;
    endWorldTurn: number;
    stepsExecuted: number;
    totalEventsEmitted: number;
    notableEvents: BulkWorldSimNotableEvent[];
    questHooksAvailable: number;
    questHooksActive: number;
}

export type BulkWorldSimFailureReason = 'INVALID_STEPS';

export interface BulkWorldSimSuccess {
    ok: true;
    state: WorldState;
    registry?: NpcRegistry;
    summary: BulkWorldSimSummary;
}

export interface BulkWorldSimFailure {
    ok: false;
    reason: BulkWorldSimFailureReason;
}

export type BulkWorldSimResult = BulkWorldSimSuccess | BulkWorldSimFailure;

/** Clamp requested steps to [1, maxSteps] capped by ABSOLUTE_MAX_BULK_WORLD_STEPS. Returns 0 if invalid. */
export function clampBulkWorldSimSteps(raw: unknown, maxSteps = DEFAULT_MAX_BULK_WORLD_STEPS): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 0;
    }
    const ceiling = Math.max(1, Math.min(ABSOLUTE_MAX_BULK_WORLD_STEPS, Math.floor(maxSteps)));
    const n = Math.floor(raw);
    if (n < 1) {
        return 0;
    }
    return Math.min(n, ceiling);
}

const NOTABLE_SEVERITIES = new Set<WorldChangeSeverity>(['warning', 'critical']);
const MAX_NOTABLE_EVENTS = 8;

function collectNotableEvents(bucket: BulkWorldSimNotableEvent[], events: WorldChangeEvent[]): void {
    for (const e of events) {
        if (!NOTABLE_SEVERITIES.has(e.severity)) {
            continue;
        }
        bucket.push({
            worldTurn: e.worldTurn,
            severity: e.severity,
            message: e.message,
        });
    }
}

/** Release the extension-host event loop between bulk sim chunks. */
export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

function runBulkWorldSimulationLoop(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    steps: number,
    options: BulkWorldSimOptions
): Omit<BulkWorldSimSuccess, 'ok'> {
    let current: WorldState = state;
    let reg = registry;
    const notable: BulkWorldSimNotableEvent[] = [];
    let totalEvents = 0;
    const startTurn = current.worldTurn ?? 0;

    for (let i = 0; i < steps; i++) {
        const { state: next, stepEvents } = runSimulationStep(forge, current);
        totalEvents += stepEvents.length;
        collectNotableEvents(notable, stepEvents);
        if (options.enableNpcRegistry && reg && stepEvents.length > 0) {
            const { registry: updated } = applyEventsToNpcRegistry(stepEvents, reg, forge);
            reg = updated;
        }
        current = options.afterStep ? options.afterStep(next, stepEvents, reg) : next;
    }

    generateQuestHooks(current, reg, false);

    const hooks = current.questHooks ?? [];
    const summary: BulkWorldSimSummary = {
        startWorldTurn: startTurn,
        endWorldTurn: current.worldTurn ?? 0,
        stepsExecuted: steps,
        totalEventsEmitted: totalEvents,
        notableEvents: notable.slice(-MAX_NOTABLE_EVENTS),
        questHooksAvailable: hooks.filter((h) => h.status === 'available').length,
        questHooksActive: hooks.filter((h) => h.status === 'active').length,
    };

    return {
        state: current,
        registry: reg,
        summary,
    };
}

/**
 * Run N emergent simulation steps without advancing GM turn count.
 * Does not persist — caller saves state/registry.
 */
export function runBulkWorldSimulation(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    options: BulkWorldSimOptions
): BulkWorldSimResult {
    const steps = clampBulkWorldSimSteps(options.steps, options.maxSteps ?? DEFAULT_MAX_BULK_WORLD_STEPS);
    if (steps === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    const outcome = runBulkWorldSimulationLoop(forge, state, registry, steps, options);
    return { ok: true, ...outcome };
}

/**
 * Async bulk sim — yields to the event loop every N steps so the extension host stays responsive.
 */
export async function runBulkWorldSimulationAsync(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    options: BulkWorldSimOptions
): Promise<BulkWorldSimResult> {
    const steps = clampBulkWorldSimSteps(options.steps, options.maxSteps ?? DEFAULT_MAX_BULK_WORLD_STEPS);
    if (steps === 0) {
        return { ok: false, reason: 'INVALID_STEPS' };
    }

    const yieldEvery = Math.max(
        1,
        Math.floor(options.yieldEverySteps ?? BULK_WORLD_SIM_YIELD_EVERY_STEPS)
    );

    let current: WorldState = state;
    let reg = registry;
    const notable: BulkWorldSimNotableEvent[] = [];
    let totalEvents = 0;
    const startTurn = current.worldTurn ?? 0;

    for (let i = 0; i < steps; i++) {
        const { state: next, stepEvents } = runSimulationStep(forge, current);
        totalEvents += stepEvents.length;
        collectNotableEvents(notable, stepEvents);
        if (options.enableNpcRegistry && reg && stepEvents.length > 0) {
            const { registry: updated } = applyEventsToNpcRegistry(stepEvents, reg, forge);
            reg = updated;
        }
        current = options.afterStep ? options.afterStep(next, stepEvents, reg) : next;

        const isChunkEnd = (i + 1) % yieldEvery === 0;
        if (isChunkEnd && i + 1 < steps) {
            await yieldToEventLoop();
        }
    }

    generateQuestHooks(current, reg, false);

    const hooks = current.questHooks ?? [];
    const summary: BulkWorldSimSummary = {
        startWorldTurn: startTurn,
        endWorldTurn: current.worldTurn ?? 0,
        stepsExecuted: steps,
        totalEventsEmitted: totalEvents,
        notableEvents: notable.slice(-MAX_NOTABLE_EVENTS),
        questHooksAvailable: hooks.filter((h) => h.status === 'available').length,
        questHooksActive: hooks.filter((h) => h.status === 'active').length,
    };

    return {
        ok: true,
        state: current,
        registry: reg,
        summary,
    };
}