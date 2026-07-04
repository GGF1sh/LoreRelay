// Debug Trace Deep Emit P1b: host adapter append (no vscode — gate resolved by caller).

import {
    buildFoodCrisisAgencyTraceEntries,
    shouldEmitDeepDebugTrace,
    type DeepTraceEmitGateFlags,
} from './debugTraceEmitCore';

export type { DeepTraceEmitGateFlags };

/** Resolve debug deep-emit gate from workspace settings (lazy vscode — safe in node tests). */
export function resolveDeepTraceEmitGateFlags(): DeepTraceEmitGateFlags {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscode = require('vscode') as typeof import('vscode');
        if (!vscode?.workspace) {
            return { bulkWorldSimDebug: false, debugScenarioActive: false };
        }
        const bulkWorldSimDebug =
            vscode.workspace.getConfiguration('textAdventure.debug').get<boolean>('bulkWorldSim') === true;
        const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        let debugScenarioActive = false;
        if (wsPath) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { isActiveDebugScenario } = require('./debugScenarioRunnerCore') as typeof import('./debugScenarioRunnerCore');
            debugScenarioActive = isActiveDebugScenario(wsPath);
        }
        return { bulkWorldSimDebug, debugScenarioActive };
    } catch {
        return { bulkWorldSimDebug: false, debugScenarioActive: false };
    }
}

export function isDeepTraceEmitEnabled(): boolean {
    return shouldEmitDeepDebugTrace(resolveDeepTraceEmitGateFlags());
}
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