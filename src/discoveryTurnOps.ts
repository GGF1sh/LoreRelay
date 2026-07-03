// Campaign Kit Phase D-lite: persist discoveryOps to discoveries.json.

import type { TurnResult } from './types/TurnResult';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    clearDiscoveryLedgerCache,
    getDiscoveriesPath,
    loadDiscoveryLedger,
} from './discoveryLedger';
import {
    applyDiscoveryOpsToLedger,
    parseDiscoveryOps,
} from './discoveryTurnOpsCore';
import { loadWorldState } from './worldState';
import { writeJsonAtomic } from './workspacePaths';

export function applyDiscoveryTurnOps(turnResult: Pick<TurnResult, 'discoveryOps'>): boolean {
    if (!resolveActiveCampaignKit()) {
        return false;
    }
    const ops = parseDiscoveryOps(turnResult.discoveryOps);
    if (!ops.length) {
        return false;
    }
    const ledgerPath = getDiscoveriesPath();
    if (!ledgerPath) {
        return false;
    }
    const worldTurn = loadWorldState()?.worldTurn;
    const current = loadDiscoveryLedger();
    const next = applyDiscoveryOpsToLedger(current, ops, worldTurn);
    if (JSON.stringify(current) === JSON.stringify(next)) {
        return false;
    }
    try {
        writeJsonAtomic(ledgerPath, next);
        clearDiscoveryLedgerCache();
        return true;
    } catch (e) {
        console.warn('[discoveryTurnOps] failed to save discoveries.json', e);
        return false;
    }
}