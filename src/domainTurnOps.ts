// Domain Mode D1.5: apply turn_result.domainOps to game_state (host layer).

import type { TurnResult } from './types/TurnResult';
import type { GameState } from './types/GameState';
import { loadGameRules } from './gameRules';
import { loadWorldState } from './worldState';
import { loadNpcRegistry } from './npcRegistry';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    applyDomainOpsToGameState,
    readDomainFromState,
} from './domainTurnOpsCore';
import { registryToOfficerBondContext, buildOfficerTrustMap } from './domainOfficerBondCore';
import type { DomainState } from './domainCore';

/** §F8: prefer an explicit config id, else the first Forge-adjacent region, else any other region. */
function resolveRivalRegionId(controlledRegionId: string, explicitId?: string): string | undefined {
    if (explicitId && explicitId !== controlledRegionId) { return explicitId; }
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const regions = forge.geography.regions;
    const own = regions.find((r) => r.id === controlledRegionId);
    const adjacent = own?.connectedTo?.find((id) => id !== controlledRegionId && regions.some((r) => r.id === id));
    if (adjacent) { return adjacent; }
    return regions.find((r) => r.id !== controlledRegionId)?.id;
}

export { applyDomainOpsToGameState, readDomainFromState } from './domainTurnOpsCore';

export function domainModeEnabled(rules: ReturnType<typeof loadGameRules>): boolean {
    return rules.enableDomainMode === true;
}

export function readDomainFromGameState(gameState: GameState | Record<string, unknown>): DomainState | undefined {
    return readDomainFromState(gameState as Record<string, unknown>);
}

export function applyDomainTurnOps(
    turnResult: TurnResult,
    gameState: GameState
): GameState {
    const rules = loadGameRules();
    const ws = loadWorldState();
    const worldTurnSeed = ws?.worldTurn ?? 0;

    const registry = rules.enableNpcRegistry === true ? loadNpcRegistry() : undefined;
    const registryNpcIds = registry
        ? new Set(Object.keys(registry.npcs))
        : undefined;
    const officerBond = registry && ws
        ? registryToOfficerBondContext(
            registry.npcs,
            (ws as { playerNpcMilestones?: Record<string, string[]> }).playerNpcMilestones ?? {}
        )
        : undefined;

    const existingDomain = readDomainFromState(gameState as unknown as Record<string, unknown>);
    const rivalsEnabled = rules.enableDomainRivals === true;
    const rivalRegionId = rivalsEnabled && existingDomain
        ? resolveRivalRegionId(existingDomain.controlledRegionId, rules.domainRivalRegionId)
        : undefined;
    const officerTrustMap = rules.enableDomainMissions === true && registry
        ? buildOfficerTrustMap(registry.npcs)
        : undefined;

    const next = applyDomainOpsToGameState(
        turnResult,
        gameState as unknown as Record<string, unknown>,
        domainModeEnabled(rules),
        {
            monthDays: rules.domainMonthDays,
            monthlyActions: rules.domainMonthlyActions,
            audienceSize: rules.domainAudienceSize,
            rivalsEnabled,
            rivalRegionId,
            maxActiveMissions: rules.domainMaxActiveMissions,
            officerTrustMap,
            enableMassBattle: rules.enableMassBattle === true,
        },
        worldTurnSeed,
        { officerBond, registryNpcIds }
    );
    return next as unknown as GameState;
}