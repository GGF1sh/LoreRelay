import * as fs from 'fs';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { loadWorldState } from './worldState';
import { resolveCommerceForge } from './livingWorldBridge';
import { getGameStatePath } from './workspacePaths';
import { commitGameState } from './stateManager';
import { readStateRevision } from './workspaceStateQueueCore';
import type { GameState } from './types/GameState';
import type { CommerceForge } from './livingWorldTypes';
import type { WorldForge, WorldLocation } from './worldForgeCore';

export type MarketTravelFailureCode =
    | 'CONFIRMATION_REQUIRED' | 'COMMERCE_OFF' | 'NO_FORGE' | 'NO_GAME_STATE'
    | 'NO_WORLD' | 'NO_LOCATION' | 'NO_DESTINATIONS' | 'SAME_LOCATION' | 'UNKNOWN_DESTINATION'
    | 'PERSIST_FAILED' | 'PARTIAL_PERSIST_FAILED' | 'VERIFY_FAILED';

export interface MarketTravelLocation {
    id: string;
    name: string;
}

export interface MarketTravelDestination extends MarketTravelLocation {
    marketAvailable: true;
    reachabilityBasis: 'known_market_location';
}

export interface MarketTravelPreview {
    ok: true;
    current: MarketTravelLocation;
    destination?: MarketTravelDestination;
    destinations: MarketTravelDestination[];
    marketAvailable: boolean;
    routeIdentity?: string;
    reachabilityBasis: 'known_market_location';
    elapsedWorldTurns: 0;
    fixedCosts: [];
    systemsNotAdvanced: string[];
}

export interface MarketTravelFailure {
    ok: false;
    code: MarketTravelFailureCode;
    message: string;
    nextStep: string;
    persistence?: { gameAttempted: boolean; gameOk: boolean; worldAttempted: boolean; worldOk: boolean; partial: boolean };
}

export interface MarketTravelReceipt {
    requestId: string;
    origin: MarketTravelLocation;
    destination: MarketTravelLocation;
    elapsedWorldTurns: 0;
    marketAvailable: true;
    reachabilityBasis: 'known_market_location';
    persisted: true;
    refreshFailed?: boolean;
}

export interface MarketTravelHostDeps {
    loadGameRules: typeof loadGameRules;
    isWorldForgeEnabled: typeof isWorldForgeEnabled;
    loadWorldForge: typeof loadWorldForge;
    loadWorldForgeDocument: typeof loadWorldForgeDocument;
    loadWorldState: typeof loadWorldState;
    getGameStatePath: typeof getGameStatePath;
    commitGameState: typeof commitGameState;
    readStateRevision: typeof readStateRevision;
}

const productionDeps: MarketTravelHostDeps = {
    loadGameRules, isWorldForgeEnabled, loadWorldForge, loadWorldForgeDocument,
    loadWorldState, getGameStatePath, commitGameState, readStateRevision,
};

const SYSTEMS_NOT_ADVANCED = [
    'world turn',
    'end-day progression',
    'bulk world simulation',
    'Living World after-step',
    'market recovery',
    'world events',
    'AI narration',
];

function readGameState(deps: MarketTravelHostDeps): GameState | undefined {
    const statePath = deps.getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try { return JSON.parse(fs.readFileSync(statePath, 'utf8')) as GameState; } catch { return undefined; }
}

function currentLocationId(state: GameState | undefined): string | undefined {
    const id = state?.world?.currentLocationId;
    return typeof id === 'string' && id ? id : undefined;
}

function byId(forge: WorldForge): Map<string, WorldLocation> {
    return new Map(forge.geography.locations.map((location) => [location.id, location]));
}

function locationLabel(location: WorldLocation | undefined, id: string): MarketTravelLocation {
    return { id, name: location?.name || id };
}

function failure(code: MarketTravelFailureCode, message: string, nextStep: string, persistence?: MarketTravelFailure['persistence']): MarketTravelFailure {
    return { ok: false, code, message, nextStep, persistence };
}

function resolveCommerce(deps: MarketTravelHostDeps, forge: WorldForge | undefined): CommerceForge | undefined {
    const rawDoc = deps.loadWorldForgeDocument();
    return forge && rawDoc ? resolveCommerceForge(forge, rawDoc) : undefined;
}

function enumerateDestinations(
    forge: WorldForge,
    commerce: CommerceForge,
    currentId: string
): MarketTravelDestination[] {
    const locations = byId(forge);
    const seen = new Set<string>();
    const out: MarketTravelDestination[] = [];
    for (const market of commerce.markets) {
        if (market.locationId === currentId || seen.has(market.locationId)) { continue; }
        const loc = locations.get(market.locationId);
        if (!loc) { continue; }
        seen.add(market.locationId);
        out.push({
            id: loc.id,
            name: loc.name,
            marketAvailable: true,
            reachabilityBasis: 'known_market_location',
        });
    }
    return out;
}

/** Preview only reads canonical state and never schedules or writes a mutation. */
export function previewMarketTravel(destinationId?: string, deps: MarketTravelHostDeps = productionDeps): MarketTravelPreview | MarketTravelFailure {
    const rules = deps.loadGameRules();
    if (!rules.enableCommerce) {
        return failure('COMMERCE_OFF', '市場機能が有効ではありません。', 'ゲームルールを確認してください。');
    }
    if (!deps.isWorldForgeEnabled()) {
        return failure('NO_FORGE', '世界設定を確認できません。', 'World Forge を確認してください。');
    }
    const forge = deps.loadWorldForge();
    const commerce = resolveCommerce(deps, forge);
    if (!forge || !commerce) {
        return failure('NO_FORGE', '市場の定義を確認できません。', 'world_forge.json の commerce.markets を確認してください。');
    }
    const game = readGameState(deps);
    if (!game) {
        return failure('NO_GAME_STATE', 'ゲーム状態を確認できません。', '現在のワークスペースの game_state.json を確認してください。');
    }
    if (!deps.loadWorldState()) {
        return failure('NO_WORLD', '世界状態を確認できません。', '現在のワークスペースの world_state.json を確認してください。');
    }
    const currentId = currentLocationId(game);
    if (!currentId) {
        return failure('NO_LOCATION', '現在地を確認できません。', '現在地を設定してからやり直してください。');
    }
    const locations = byId(forge);
    const current = locationLabel(locations.get(currentId), currentId);
    const destinations = enumerateDestinations(forge, commerce, currentId);
    if (!destinations.length) {
        return failure('NO_DESTINATIONS', '移動できる別の市場がありません。', '別の市場を含む world_forge.json を読み込んでください。');
    }
    const selected = typeof destinationId === 'string' && destinationId ? destinations.find((entry) => entry.id === destinationId) : undefined;
    if (destinationId && destinationId === currentId) {
        return failure('SAME_LOCATION', '現在地へは移動できません。', '別の市場を選んでください。');
    }
    if (destinationId && !selected) {
        return failure('UNKNOWN_DESTINATION', '選択された市場は現在の正規データにありません。', '一覧を開き直して、表示された市場から選んでください。');
    }
    return {
        ok: true,
        current,
        destination: selected,
        destinations,
        marketAvailable: Boolean(selected),
        reachabilityBasis: 'known_market_location',
        elapsedWorldTurns: 0,
        fixedCosts: [],
        systemsNotAdvanced: [...SYSTEMS_NOT_ADVANCED],
    };
}

/**
 * Re-reads canonical state at commit. The host must call this only after the
 * shared deterministic workspace mutation gate has been acquired.
 */
export function executeMarketTravel(
    requestId: string,
    destinationId: string,
    confirmed: boolean,
    deps: MarketTravelHostDeps = productionDeps
): MarketTravelReceipt | MarketTravelFailure {
    if (!confirmed) {
        return failure('CONFIRMATION_REQUIRED', '移動には明示的な確認が必要です。', '確認画面で移動を確定してください。');
    }
    const preview = previewMarketTravel(destinationId, deps);
    if (!preview.ok) { return preview; }
    if (!preview.destination) {
        return failure('UNKNOWN_DESTINATION', '移動先を確認できません。', '一覧から移動先を選び直してください。');
    }

    const gameBefore = readGameState(deps);
    const worldBefore = deps.loadWorldState();
    const originId = currentLocationId(gameBefore);
    if (!gameBefore || !originId) {
        return failure('NO_GAME_STATE', '移動直前のゲーム状態を再読込できません。', '現在のワークスペースを確認してください。');
    }
    if (!worldBefore) {
        return failure('NO_WORLD', '移動直前の世界状態を再読込できません。', '現在のワークスペースを確認してください。');
    }
    const baseRevision = deps.readStateRevision(gameBefore as unknown as Record<string, unknown>);
    const nextGame: GameState = {
        ...gameBefore,
        world: { ...(gameBefore.world ?? {}), currentLocationId: preview.destination.id },
    };

    let gameOk = false;
    try {
        gameOk = deps.commitGameState(nextGame, { mode: 'salvage', baseRevision, mergeProfile: 'turn' }).ok;
    } catch {
        gameOk = false;
    }
    if (!gameOk) {
        return failure('PERSIST_FAILED', '移動先を game_state.json に保存できませんでした。', '現在の状態を確認してから、新しい受付番号でやり直してください。', {
            gameAttempted: true,
            gameOk: false,
            worldAttempted: false,
            worldOk: true,
            partial: false,
        });
    }

    const reloaded = readGameState(deps);
    if (currentLocationId(reloaded) !== preview.destination.id) {
        return failure('VERIFY_FAILED', '保存後の再読込で移動先が一致しませんでした。', 'game_state.json を確認してください。', {
            gameAttempted: true,
            gameOk: true,
            worldAttempted: false,
            worldOk: true,
            partial: false,
        });
    }

    return {
        requestId,
        origin: preview.current,
        destination: { id: preview.destination.id, name: preview.destination.name },
        elapsedWorldTurns: 0,
        marketAvailable: true,
        reachabilityBasis: 'known_market_location',
        persisted: true,
    };
}
