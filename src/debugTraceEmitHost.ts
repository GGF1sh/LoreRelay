// Debug Trace Deep Emit P1b: host adapter append (no vscode — gate resolved by caller).

import {
    buildFoodCrisisAgencyTraceEntries,
    shouldEmitDeepDebugTrace,
    type DeepTraceEmitGateFlags,
} from './debugTraceEmitCore';
import {
    appendDebugTraceHostEntries,
    getActiveDebugTraceSimulationRunId,
} from './debugTraceHostCore';
import { advanceNpcArrivals, type AgencyReactionInput } from './npcAgencyCore';
import type {
    CommerceForge,
    MarketStateMap,
    NpcAgencyOp,
    NpcPositionsMap,
    NpcRegistryLike,
    WorldChangeEventLike,
} from './livingWorldTypes';

export type { DeepTraceEmitGateFlags };

export interface LivingWorldTickDeepTraceParams {
    worldTurn: number;
    stepEvents: WorldChangeEventLike[];
    commerceForge: CommerceForge;
    markets: MarketStateMap;
    registry: NpcRegistryLike;
    npcPositionsBeforeTick: NpcPositionsMap;
    npcMoves: NpcAgencyOp[];
    npcPositionsAfterTick: NpcPositionsMap;
    maxNamedNpcCount: number;
}

/** Append food-crisis npcAgency deep trace entries when gated. Never throws. */
export function captureFoodCrisisAgencyDeepTrace(
    flags: DeepTraceEmitGateFlags,
    params: LivingWorldTickDeepTraceParams
): void {
    if (!shouldEmitDeepDebugTrace(flags)) {
        return;
    }
    const runId = getActiveDebugTraceSimulationRunId();
    if (!runId) {
        return;
    }
    try {
        const worldTurn = Math.floor(params.worldTurn);
        const positionsForAgency = advanceNpcArrivals(params.npcPositionsBeforeTick, worldTurn);
        const agencyInput: AgencyReactionInput = {
            forge: params.commerceForge,
            markets: params.markets,
            registry: params.registry,
            positions: positionsForAgency,
            worldTurn,
            stepEvents: params.stepEvents,
            maxNamedNpcCount: params.maxNamedNpcCount,
        };
        const entries = buildFoodCrisisAgencyTraceEntries({
            runId,
            worldTurn,
            parentTraceId: `trace_step_${worldTurn}`,
            stepEvents: params.stepEvents,
            agencyInput,
            agencyResult: {
                moves: params.npcMoves,
                positions: params.npcPositionsAfterTick,
            },
            maxNpcTraces: params.maxNamedNpcCount,
        });
        appendDebugTraceHostEntries(entries);
    } catch {
        // Debug trace must never affect Living World behavior.
    }
}