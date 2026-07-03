// PR-C impl — workspace write health / split-brain risk signals (in-memory host layer).

import type { CrossFileDualWriteOutcome, SplitBrainRiskEvent } from './workspaceWriteCircuitBreakerCore';
import { buildSplitBrainRiskEvent } from './workspaceWriteCircuitBreakerCore';

let lastSplitBrainRisk: SplitBrainRiskEvent | undefined;
let splitBrainRiskCount = 0;

export function recordSplitBrainRisk(
    outcome: CrossFileDualWriteOutcome,
    source: string
): SplitBrainRiskEvent | undefined {
    const event = buildSplitBrainRiskEvent(outcome, source);
    if (!event) {
        return undefined;
    }
    lastSplitBrainRisk = event;
    splitBrainRiskCount++;
    console.error(
        '[workspaceWriteHealth] split-brain risk detected;',
        'game_state retained per compensation policy.',
        event
    );
    return event;
}

export function getLastSplitBrainRiskForTests(): SplitBrainRiskEvent | undefined {
    return lastSplitBrainRisk ? { ...lastSplitBrainRisk, failedTargets: [...lastSplitBrainRisk.failedTargets] } : undefined;
}

export function getSplitBrainRiskCountForTests(): number {
    return splitBrainRiskCount;
}

export function resetWorkspaceWriteHealthForTests(): void {
    lastSplitBrainRisk = undefined;
    splitBrainRiskCount = 0;
}