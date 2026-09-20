import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createGameActionService, hashGameActionValue, type GameActionBindings, type GameActionId,
    type GameActionMutationOutcome, type PublicGameAction } from './gameActionService';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { readWorldStateSnapshotReadOnly } from './worldState';
import { resolveCommerceForge, ensureLivingWorldMarkets } from './livingWorldBridge';
import { getOrInitPlayerCommerce } from './livingWorldTurnOpsCore';
import { executeDirectTrade, resolveDefaultPlayerRole, type DirectTradeInput } from './livingWorldCommerceUiCore';
import { buildShopkeeperSnapshot } from './shopkeeperDirectTradeCore';
import { executeLivingWorldDirectTrade, flushScheduledCommercePersist } from './livingWorldCommerceUi';
import { previewMarketTravel, executeMarketTravel } from './deterministicMarketTravel';
import { previewEndDay, executeEndDay } from './endDayWorldProgression';
import { loadExistingAcceptedTurnScope, getAcceptedTurnRestoreRepairLatchOutcome } from './acceptedTurnReplayGuard';
import { acquireModCanonicalAuthorization, isModCanonicalAuthorizationCurrent } from './mods/modActivationGateHost';
import type { GameState } from './types/GameState';
import type { WorldIntent, JsonValue } from './worldIntentCore';
import { validateGameState } from './validateGameState';
import { projectWorldPacing } from './worldPacingCore';
import { buildFogPayload, normalizeFogWorldState } from './fogOfWarCore';
import { publishedMarketLocationIds } from './publishedMarketLocationsCore';
import { pruneExpiredEvents } from './worldEventLogCore';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function readJson(file: string): unknown {
    if (!fs.existsSync(file)) return undefined;
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('state_limit');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function readCommerceSnapshot(workspaceId: string) {
    if (getWorkspacePath() !== workspaceId) throw new Error('workspace_changed');
    const game = readJson(getGameStatePath()!) as GameState | undefined;
    const world = readWorldStateSnapshotReadOnly().state;
    const forge = loadWorldForge();
    const rawForge = loadWorldForgeDocument();
    const rules = loadGameRules();
    if (!game || validateGameState(game).length || !world || !forge || !rawForge) throw new Error('state_unavailable');
    const commerceForge = resolveCommerceForge(forge, rawForge);
    const commerce = getOrInitPlayerCommerce(clone(game));
    commerce.playerRole = resolveDefaultPlayerRole(rules.playerRole, commerce.playerRole);
    const markets = commerceForge ? clone(ensureLivingWorldMarkets(commerceForge, clone(world))) : {};
    const shop = commerceForge ? buildShopkeeperSnapshot(commerceForge, markets, commerce, game.world?.currentLocationId ?? '') : undefined;
    const travel = previewMarketTravel();
    const day = previewEndDay();
    const npc = rules.enableNpcRegistry ? readJson(path.join(workspaceId, 'npc_registry.json')) : undefined;
    return { game, world, forge, rawForge, rules, commerceForge, commerce, markets, shop, travel, day, npc };
}
type Snapshot = ReturnType<typeof readCommerceSnapshot>;
function projectPublicGeography(state: Snapshot) {
    const fog = buildFogPayload(normalizeFogWorldState(state.game.world, state.forge, state.game.world?.currentLocationId), state.forge);
    const discovered = new Set(fog.discoveredRegionIds);
    const visibleLocations = publishedMarketLocationIds(state.forge, state.game.world);
    const regions = state.forge.geography.regions.filter(region => discovered.has(region.id)).map(region => ({
        id: region.id, name: region.name, x: region.x, y: region.y,
        connectedTo: (region.connectedTo ?? []).filter(id => discovered.has(id)),
    }));
    const locations = state.forge.geography.locations.filter(location => visibleLocations.has(location.id)).map(location => ({
        id: location.id, name: location.name,
        regionId: location.regionId && discovered.has(location.regionId) ? location.regionId : undefined,
    }));
    const current = locations.find(location => location.id === state.game.world?.currentLocationId);
    return { regions, locations, currentLocation: current ?? null,
        currentRegion: regions.find(region => region.id === current?.regionId) ?? null };
}
function projectPublicRecentEvents(state: Snapshot) {
    if (!state.rules.enableEmergentSimulation) return [];
    const geography = projectPublicGeography(state);
    const regions = new Set(geography.regions.map(region => region.id));
    const locations = new Set(geography.locations.map(location => location.id));
    const factions = new Set(state.forge.geography.locations.filter(location => locations.has(location.id))
        .flatMap(location => location.factionControl ? [location.factionControl] : []));
    return pruneExpiredEvents(state.world.recentChanges ?? [], state.world.worldTurn)
        .filter(event => event.worldTurn <= state.world.worldTurn
            && (!event.regionId || regions.has(event.regionId))
            && (!event.locationId || locations.has(event.locationId))
            && (!event.factionId || factions.has(event.factionId))
            && (!event.targetFactionId || factions.has(event.targetFactionId))
            && !event.npcIds?.length)
        .slice(-20).map(event => ({ worldTurn: event.worldTurn, category: event.category,
            severity: event.severity, message: event.message }));
}
function projectActions(state: Snapshot): PublicGameAction[] {
    const tradeAvailable = state.rules.enableCommerce && state.rules.enableCommerceUi && isWorldForgeEnabled()
        && !!state.shop?.commodities.length;
    const destinations = state.travel.ok ? state.travel.destinations : [];
    return [
        { actionId: 'commerce:trade', version: 1, available: Boolean(tradeAvailable), parameters: {
            type: 'object', additionalProperties: false, required: ['op', 'marketLocationId', 'commodityId', 'qty'],
            properties: { op: { enum: ['buy', 'sell'] }, marketLocationId: { enum: state.shop ? [state.shop.currentLocationId] : [] },
                commodityId: { enum: state.shop?.commodities.map(item => item.commodityId) ?? [] },
                qty: { type: 'integer', minimum: 1, maximum: 999 } },
        }, estimate: state.shop ? { credits: state.shop.credits, cargoWeight: state.shop.cargoWeight,
            cargoCapacity: state.shop.cargoCapacity, commodities: state.shop.commodities } : {} },
        { actionId: 'commerce:travel', version: 1, available: destinations.length > 0, parameters: {
            type: 'object', additionalProperties: false, required: ['destinationId'],
            properties: { destinationId: { enum: destinations.map(destination => destination.id) } },
        }, estimate: { destinations: destinations.map(destination => ({ id: destination.id, name: destination.name })),
            elapsedWorldTurns: 0, fixedCosts: [] } },
        { actionId: 'commerce:end_day', version: 1, available: state.day.ok, parameters: {
            type: 'object', additionalProperties: false, properties: {},
        }, estimate: state.day.ok ? { currentWorldTurn: state.day.currentWorldTurn, targetWorldTurn: state.day.targetWorldTurn,
            fixedResourceConsumption: state.day.fixedResourceConsumption } : {} },
    ];
}
const PUBLIC_TRADE_ERRORS = new Set(['INSUFFICIENT_CREDITS', 'INSUFFICIENT_CARGO', 'INSUFFICIENT_STOCK', 'CARGO_CAPACITY', 'INVALID_QTY']);
function quote(state: Snapshot, action: GameActionId, parameters: Record<string, unknown>): ReturnType<GameActionBindings<Snapshot>['quote']> {
    if (action === 'commerce:trade') {
        if (!state.commerceForge || !state.shop || parameters.marketLocationId !== state.shop.currentLocationId
            || !state.shop.commodities.some(item => item.commodityId === parameters.commodityId)) return { ok: false, code: 'UNAVAILABLE' };
        const result = executeDirectTrade(state.commerceForge, clone(state.markets), clone(state.commerce),
            { ...(parameters as unknown as DirectTradeInput), currentLocationId: state.shop.currentLocationId });
        if (!result.ok) return { ok: false, code: PUBLIC_TRADE_ERRORS.has(result.code ?? '') ? result.code! : 'UNAVAILABLE' };
        return { ok: true, quote: { op: parameters.op, commodityId: parameters.commodityId, qty: parameters.qty,
            total: parameters.op === 'buy' ? result.totalCost : result.totalRevenue,
            creditsBefore: state.commerce.credits, creditsAfter: result.commerce.credits } };
    }
    if (action === 'commerce:travel') {
        if (!state.travel.ok) return { ok: false, code: 'UNAVAILABLE' };
        const destination = state.travel.destinations.find(item => item.id === parameters.destinationId);
        if (!destination) return { ok: false, code: 'UNAVAILABLE' };
        return { ok: true, quote: { current: state.travel.current, destination, elapsedWorldTurns: 0, fixedCosts: [] } };
    }
    return state.day.ok ? { ok: true, quote: { currentWorldTurn: state.day.currentWorldTurn,
        targetWorldTurn: state.day.targetWorldTurn, currentLocationId: state.day.currentLocationId,
        fixedResourceConsumption: state.day.fixedResourceConsumption } } : { ok: false, code: 'UNAVAILABLE' };
}
function failed(outcome: { code?: string; persistence?: { gameAttempted?: boolean; gameOk?: boolean; worldAttempted?: boolean; worldOk?: boolean; partial?: boolean; npcAttempted?: boolean; npcOk?: boolean } }): GameActionMutationOutcome {
    const p = outcome.persistence;
    const anyCommitted = p && ((p.gameAttempted && p.gameOk) || (p.worldAttempted && p.worldOk) || (p.npcAttempted && p.npcOk));
    return { classification: p?.partial || (anyCommitted && outcome.code !== 'VERIFY_FAILED') ? 'committed_partial'
        : p || outcome.code === 'VERIFY_FAILED' ? 'outcome_unknown' : 'rejected_invalid',
    result: { code: 'ACTION_NOT_CONFIRMED' }, diagnostic: { code: outcome.code, persistence: p } };
}
function execute(action: GameActionId, parameters: Record<string, unknown>, requestId: string): GameActionMutationOutcome {
    // Bounded WorldIntent vocabulary adapter. source is provenance, never authorization.
    const intent: WorldIntent = { id: requestId, source: 'player', subsystem: 'commerce',
        action: action.slice('commerce:'.length), payload: parameters as JsonValue };
    if (intent.action === 'trade') {
        const result = executeLivingWorldDirectTrade(parameters as unknown as DirectTradeInput);
        if (!result.ok) return failed({ code: result.code ?? result.reason });
        const persistence = flushScheduledCommercePersist();
        if (!persistence.ok || !persistence.gameAttempted || !persistence.gameOk || !persistence.worldAttempted || !persistence.worldOk)
            return failed({ code: 'PERSIST_FAILED', persistence });
        const disk = readJson(getGameStatePath()!) as GameState;
        const world = readWorldStateSnapshotReadOnly().state;
        const expected = result.trade;
        const actualMarkets = world && (world as typeof world & { markets?: Snapshot['markets'] }).markets;
        if (!expected || disk.commerce?.credits !== expected.commerce.credits
            || hashGameActionValue(disk.commerce?.cargo) !== hashGameActionValue(expected.commerce.cargo)
            || hashGameActionValue(actualMarkets?.[String(parameters.marketLocationId)]) !== hashGameActionValue(expected.markets[String(parameters.marketLocationId)]))
            return { classification: 'outcome_unknown', result: { code: 'VERIFY_FAILED' }, diagnostic: { persistence } };
        return { classification: 'committed', result: { op: parameters.op, commodityId: parameters.commodityId,
            qty: parameters.qty, total: parameters.op === 'buy' ? expected.totalCost : expected.totalRevenue,
            applied: expected.applied, persisted: true }, diagnostic: { persistence } };
    }
    if (intent.action === 'travel') {
        const outcome = executeMarketTravel(requestId, String(parameters.destinationId), true);
        if ('ok' in outcome) return failed(outcome);
        return { classification: 'committed', result: { origin: outcome.origin, destination: outcome.destination,
            elapsedWorldTurns: outcome.elapsedWorldTurns, marketAvailable: true, persisted: true } };
    }
    const outcome = executeEndDay(requestId, true);
    if ('ok' in outcome) return failed(outcome);
    const disk = readJson(getGameStatePath()!) as GameState;
    const world = readWorldStateSnapshotReadOnly().state;
    if (disk.world?.worldTurnAtLastSync !== outcome.worldTurn.after || world?.worldTurn !== outcome.worldTurn.after)
        return { classification: 'outcome_unknown', result: { code: 'VERIFY_FAILED' } };
    // Internal event counts/categories/quiet are deliberately not player result fields.
    return { classification: 'committed', result: { worldTurn: outcome.worldTurn, currentLocationId: outcome.currentLocationId,
        marketChanges: outcome.marketChanges, resourceChanges: outcome.resourceChanges, persisted: true },
    diagnostic: { eventCount: outcome.eventCount, eventCategories: outcome.eventCategories } };
}

/** The runner and Webview both call this production binding, with the same owners.
 * No import of extension.ts and no alternate persistence implementation. */
async function buildCommerceActionRuntime(mutationGate: DeterministicWorkspaceMutationGate) {
    const workspaceId = getWorkspacePath();
    if (!workspaceId) throw new Error('workspace_unavailable');
    const authorization = await acquireModCanonicalAuthorization(workspaceId);
    if (!authorization) throw new Error('rejected_forbidden');
    const uninitializedScope = randomUUID();
    const authorized = () => getWorkspacePath() === workspaceId && isModCanonicalAuthorizationCurrent(authorization)
        && !getAcceptedTurnRestoreRepairLatchOutcome(workspaceId);
    const bindings: GameActionBindings<Snapshot> = {
        mutationGate, authorized,
        scope: () => {
            const scope = loadExistingAcceptedTurnScope(workspaceId);
            return { workspaceId, campaignId: scope?.campaignInstanceId ?? uninitializedScope,
                timelineEpoch: scope?.timelineEpochId ?? uninitializedScope, authorizationGeneration: authorization.generation };
        },
        read: () => readCommerceSnapshot(workspaceId),
        playerView: state => ({ currentLocationId: state.game.world?.currentLocationId, worldTurn: state.world.worldTurn,
            geography: projectPublicGeography(state),
            recentEvents: projectPublicRecentEvents(state),
            availableActions: projectActions(state).filter(action => action.available),
            worldPacing: state.rules.enableEmergentSimulation ? projectWorldPacing(state.forge, state.world,
                state.forge.geography.locations.filter(location => location.id === state.game.world?.currentLocationId
                    || state.travel.ok && state.travel.destinations.some(d => d.id === location.id)).flatMap(l => l.regionId ? [l.regionId] : [])) : null,
            commerce: { credits: state.commerce.credits, cargo: state.commerce.cargo.map(item => ({ commodityId: item.commodityId, qty: item.qty })),
                food: state.commerce.food, transportId: state.commerce.transportId } }),
        actions: projectActions, quote, execute,
        diagnostic: entry => console.error('[GameAction]', JSON.stringify(entry)),
        witness: state => hashGameActionValue({ game: state.game, world: state.world, forge: state.rawForge, rules: state.rules, npc: state.npc }),
        inspect: state => ({ game: state.game, world: state.world, ...(state.npc ? { npc: state.npc } : {}) }),
    };
    return { service: createGameActionService(bindings), authorized, workspaceId, scope: bindings.scope };
}

const runtimes = new WeakMap<DeterministicWorkspaceMutationGate, Map<string, Promise<Awaited<ReturnType<typeof buildCommerceActionRuntime>>>>>();
export async function createCommerceActionRuntime(mutationGate: DeterministicWorkspaceMutationGate) {
    const workspaceId = getWorkspacePath();
    if (!workspaceId) throw new Error('workspace_unavailable');
    let workspaces = runtimes.get(mutationGate);
    if (!workspaces) { workspaces = new Map(); runtimes.set(mutationGate, workspaces); }
    const prior = workspaces.get(workspaceId);
    if (prior) {
        const runtime = await prior;
        if (runtime.authorized()) return runtime;
    }
    const pending = buildCommerceActionRuntime(mutationGate);
    workspaces.set(workspaceId, pending);
    try { return await pending; }
    catch (error) { if (workspaces.get(workspaceId) === pending) workspaces.delete(workspaceId); throw error; }
}
