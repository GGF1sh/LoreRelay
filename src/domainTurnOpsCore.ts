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

export function readDomainFromState(gameState: Record<string, unknown>): DomainState | undefined {
    return validateDomain(gameState.domain);
}

export function applyDomainOpsToGameState(
    turnResult: Pick<TurnResult, 'domainOps'>,
    gameState: Record<string, unknown>,
    enabled: boolean,
    config?: Partial<DomainConfig>,
    worldTurnSeed = 0
): Record<string, unknown> {
    if (!enabled) {
        return gameState;
    }

    const ops = parseDomainOps(turnResult.domainOps);
    if (!ops) {
        return gameState;
    }

    const existing = readDomainFromState(gameState);
    if (!existing || !existing.enabled) {
        return gameState;
    }

    const normalized = normalizeDomainConfig(config);
    const { domain } = applyDomainOps(existing, ops, normalized, worldTurnSeed);

    return {
        ...gameState,
        domain,
    };
}