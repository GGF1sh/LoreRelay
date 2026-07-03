// Domain Mode: pure turn_result.domainOps application (no vscode/fs).

import type { TurnResult } from './types/TurnResult';
import {
    validateDomain,
    parseDomainOps,
    applyDomainOps,
    normalizeDomainConfig,
    type DomainConfig,
    type DomainState,
} from './domainCore';
import { refreshDomainSnapshotOnCommit } from './domainRegionDriftCore';
import {
    assessOfficerBonds,
    isOfficerInRegistry,
    syncOfficerDiscontentFlag,
    type OfficerBondContext,
} from './domainOfficerBondCore';

export interface DomainTurnBondOptions {
    officerBond?: OfficerBondContext;
    registryNpcIds?: ReadonlySet<string>;
}

export function readDomainFromState(gameState: Record<string, unknown>): DomainState | undefined {
    return validateDomain(gameState.domain);
}

export function applyDomainOpsToGameState(
    turnResult: Pick<TurnResult, 'domainOps'>,
    gameState: Record<string, unknown>,
    enabled: boolean,
    config?: Partial<DomainConfig>,
    worldTurnSeed = 0,
    bondOptions?: DomainTurnBondOptions
): Record<string, unknown> {
    if (!enabled) {
        return gameState;
    }

    const ops = parseDomainOps(turnResult.domainOps);
    if (!ops) {
        return gameState;
    }

    let existing = readDomainFromState(gameState);
    if (!existing || !existing.enabled) {
        return gameState;
    }

    if (ops.kind === 'appoint_officer' && ops.officer) {
        if (!isOfficerInRegistry(ops.officer.npcId, bondOptions?.registryNpcIds)) {
            return gameState;
        }
    }

    if (bondOptions?.officerBond) {
        const assessment = assessOfficerBonds(existing.officers, bondOptions.officerBond);
        existing = syncOfficerDiscontentFlag(existing, assessment);
    }

    const normalized = normalizeDomainConfig(config);
    const { domain } = applyDomainOps(existing, ops, normalized, worldTurnSeed);

    let next: Record<string, unknown> = {
        ...gameState,
        domain,
    };
    next = refreshDomainSnapshotOnCommit(next, worldTurnSeed);
    return next;
}