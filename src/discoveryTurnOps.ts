// Campaign Kit Phase D-lite: persist discoveryOps to discoveries.json.

import type { TurnResult } from './types/TurnResult';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    clearDiscoveryLedgerCache,
    getDiscoveriesPath,
    readDiscoveryLedgerFromDisk,
} from './discoveryLedger';
import {
    applyDiscoveryOpsToLedger,
    parseDiscoveryOps,
} from './discoveryTurnOpsCore';
import { loadWorldState } from './worldState';
import { writeJsonAtomic } from './workspacePaths';
import { runSerializedDiscoveryMutation } from './workspaceStateQueue';

export function tryApplyDiscoveryTurnOps(
    turnResult: Pick<TurnResult, 'discoveryOps'>
): TurnLedgerApplyResult {
    if (!resolveActiveCampaignKit()) {
        return { ok: false, applied: false };
    }
    const ops = parseDiscoveryOps(turnResult.discoveryOps);
    if (!ops.length) {
        return { ok: true, applied: false };
    }
    const ledgerPath = getDiscoveriesPath();
    if (!ledgerPath) {
        return { ok: false, applied: false };
    }

    const result: TurnLedgerApplyResult = { ok: true, applied: false };
    runSerializedDiscoveryMutation(() => {
        const worldTurn = loadWorldState()?.worldTurn;
        const current = readDiscoveryLedgerFromDisk(ledgerPath);
        const next = applyDiscoveryOpsToLedger(current, ops, worldTurn);
        if (JSON.stringify(current) === JSON.stringify(next)) {
            return;
        }
        try {
            writeJsonAtomic(ledgerPath, next);
            clearDiscoveryLedgerCache();
            result.applied = true;
        } catch (e) {
            result.ok = false;
            console.warn('[discoveryTurnOps] failed to save discoveries.json', e);
        }
    });
    return result;
}

export function applyDiscoveryTurnOps(turnResult: Pick<TurnResult, 'discoveryOps'>): boolean {
    return tryApplyDiscoveryTurnOps(turnResult).applied;
}