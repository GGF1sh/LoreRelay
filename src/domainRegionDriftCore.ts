// Domain §9.1: game_state region depart/return drift (no vscode/fs).

import {
    type DomainState,
    validateDomain,
    normalizeDomainConfig,
    type DomainConfig,
} from './domainCore';
import {
    createDomainSnapshot,
    domainStateFromSnapshot,
    computeSinceLastDomainVisitDelta,
    parseDomainSnapshot,
    parseSinceLastDomainVisitDelta,
    simulateDomainDrift,
    type DomainSnapshot,
    type SinceLastDomainVisitDelta,
} from './domainDriftCore';

export interface DomainRegionDriftState {
    domainSnapshotAtDepart?: DomainSnapshot;
    lastDomainVisitWorldTurn?: number;
    domainSinceLastVisit?: SinceLastDomainVisitDelta;
}

export function readDomainRegionDriftState(
    gameState: Record<string, unknown>
): DomainRegionDriftState {
    const snapshot = parseDomainSnapshot(gameState.domainSnapshotAtDepart);
    const lastDomainVisitWorldTurn = typeof gameState.lastDomainVisitWorldTurn === 'number'
        && Number.isFinite(gameState.lastDomainVisitWorldTurn)
        ? Math.max(0, Math.floor(gameState.lastDomainVisitWorldTurn))
        : undefined;
    const domainSinceLastVisit = parseSinceLastDomainVisitDelta(gameState.domainSinceLastVisit);
    return { domainSnapshotAtDepart: snapshot, lastDomainVisitWorldTurn, domainSinceLastVisit };
}

export function isLocationInDomainRegion(
    locationId: string | undefined,
    controlledRegionId: string,
    locationToRegion: Record<string, string>
): boolean {
    if (!locationId || !controlledRegionId) { return false; }
    return locationToRegion[locationId] === controlledRegionId;
}

export function recordDomainRegionDepart(
    gameState: Record<string, unknown>,
    worldTurn: number
): Record<string, unknown> {
    const domain = validateDomain(gameState.domain);
    if (!domain || !domain.enabled) { return gameState; }

    const snapshot = createDomainSnapshot(domain, worldTurn);
    return {
        ...gameState,
        domainSnapshotAtDepart: snapshot,
        lastDomainVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
        domainSinceLastVisit: undefined,
    };
}

export function refreshDomainSnapshotOnCommit(
    gameState: Record<string, unknown>,
    worldTurn: number
): Record<string, unknown> {
    const domain = validateDomain(gameState.domain);
    if (!domain || !domain.enabled) { return gameState; }

    const snapshot = createDomainSnapshot(domain, worldTurn);
    return {
        ...gameState,
        domainSnapshotAtDepart: snapshot,
        lastDomainVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
        domainSinceLastVisit: undefined,
    };
}

export function applyDomainRegionReturnDrift(
    gameState: Record<string, unknown>,
    worldTurn: number,
    config?: Partial<DomainConfig>
): Record<string, unknown> {
    const domain = validateDomain(gameState.domain);
    if (!domain || !domain.enabled) { return gameState; }

    const driftState = readDomainRegionDriftState(gameState);
    const snapshot = driftState.domainSnapshotAtDepart;
    const lastVisit = driftState.lastDomainVisitWorldTurn;
    if (!snapshot || lastVisit === undefined) { return gameState; }

    const normalized = normalizeDomainConfig(config);
    const monthDays = normalized.monthDays;
    const turnsAway = Math.max(0, Math.floor(worldTurn - lastVisit));
    const virtualMonths = Math.floor(turnsAway / monthDays);
    const before = domainStateFromSnapshot(snapshot, domain);
    if (virtualMonths <= 0) {
        return {
            ...gameState,
            lastDomainVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
            domainSnapshotAtDepart: createDomainSnapshot(domain, worldTurn),
        };
    }
    const delta = computeSinceLastDomainVisitDelta({
        lastVisitWorldTurn: lastVisit,
        currentWorldTurn: worldTurn,
        regionId: domain.controlledRegionId,
        domainBefore: before,
        monthDays,
        baseSeed: snapshot.worldTurn + lastVisit,
        config: normalized,
    });
    if (!delta) { return gameState; }

    const drifted = simulateDomainDrift(
        before,
        virtualMonths,
        snapshot.worldTurn + lastVisit,
        normalized
    );

    return {
        ...gameState,
        domain: drifted.domain,
        domainSinceLastVisit: delta,
        lastDomainVisitWorldTurn: Math.max(0, Math.floor(worldTurn)),
        domainSnapshotAtDepart: createDomainSnapshot(drifted.domain, worldTurn),
    };
}

export function clearDomainSinceLastVisitReport(
    gameState: Record<string, unknown>
): Record<string, unknown> {
    if (gameState.domainSinceLastVisit === undefined) { return gameState; }
    const next = { ...gameState };
    delete next.domainSinceLastVisit;
    return next;
}