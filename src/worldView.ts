import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadWorldForge, loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import { generateWorldMap } from './worldMapGenerator';
import { extractHighlightRegionIds } from './npcBridgeCore';
import { pruneExpiredEvents } from './worldEventLogCore';
import type { Faction } from './worldForgeCore';
import type { FactionWorldState, RegionWorldState, GlobalEvent } from './worldStateCore';
import { loadNpcRegistry } from './npcRegistry';
import { buildNpcTtsCatalog, countNpcVoices } from './ttsProviderCore';
import { normalizeExternalProvider } from './ttsBridgeCore';
import { isLocalTtsConfigured } from './ttsBridgeRunner';
import { getEntriesByLocation } from './visualMemory';
import { safeImageUri } from './gameStateSync';
import { buildCartographyPinPositions, buildCartographyRegionLabels } from './cartographyLayoutCore';
import { buildTileOvermap, resolveOvermapThemeKey } from './tileOvermapCore';
import { resolveWorldMapImagePath } from './cartographyRunner';
import { getGameStatePath, getWorkspacePath } from './workspacePaths';
import type { GameState, GameStateWorld } from './types/GameState';
import {
    buildFogPayload,
    buildFogRegionLayout,
    buildLocationPinCatalog,
    maskCartographyPinsForFog,
    maskCartographyRegionLabelsForFog,
    normalizeFogWorldState,
} from './fogOfWarCore';
import { listActiveMapItems } from './cartographyRevealCore';
import { buildRegionHighlightMeta, buildRegionMapFeedback, classifyDangerTier } from './mapFeedbackCore';
import { loadGameRules } from './gameRules';
import { buildMarketPriceTable } from './commerceCore';
import { resolveCommerceForge, ensureLivingWorldMarkets } from './livingWorldBridge';
import type { CommerceForge, MarketStateMap } from './livingWorldTypes';
import { listNpcPresence } from './npcAgencyCore';

let getPanelRef: (() => vscode.WebviewPanel | undefined) | undefined;

export function initWorldView(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getPanelRef = deps.getPanel;
}

function loadGameStateSnapshotFromDisk(): Pick<GameState, 'world' | 'commerce'> | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Pick<GameState, 'world' | 'commerce'>;
        return raw;
    } catch {
        return undefined;
    }
}

function loadWorldBlockFromDisk(): GameStateWorld | undefined {
    return loadGameStateSnapshotFromDisk()?.world;
}

function buildPlayerCommercePayload(
    commerce: GameState['commerce'] | undefined,
    commerceEnabled: boolean
): {
    credits: number;
    food: number;
    transportId: string;
    cargo: Array<{ commodityId: string; qty: number }>;
} | null {
    if (!commerceEnabled || !commerce || typeof commerce.credits !== 'number') {
        return null;
    }
    const cargo = Array.isArray(commerce.cargo)
        ? commerce.cargo
            .filter((c) => c && typeof c.commodityId === 'string' && typeof c.qty === 'number')
            .map((c) => ({
                commodityId: c.commodityId,
                qty: Math.max(0, Math.floor(c.qty)),
            }))
            .slice(0, 24)
        : [];
    return {
        credits: Math.max(0, Math.floor(commerce.credits)),
        food: typeof commerce.food === 'number' ? Math.max(0, Math.floor(commerce.food)) : 30,
        transportId: typeof commerce.transportId === 'string' ? commerce.transportId : 'wagon',
        cargo,
    };
}

export interface WorldViewFaction {
    id: string;
    name: string;
    type: string;
    power?: number;
    description?: string;
    goals?: string[];
    enemies?: string[];
    allies?: string[];
}

function serializeFaction(f: Faction): WorldViewFaction {
    const out: WorldViewFaction = { id: f.id, name: f.name, type: f.type };
    if (f.power !== undefined) { out.power = f.power; }
    if (f.description) { out.description = f.description; }
    if (f.goals && f.goals.length > 0) { out.goals = f.goals; }
    if (f.enemies && f.enemies.length > 0) { out.enemies = f.enemies; }
    if (f.allies && f.allies.length > 0) { out.allies = f.allies; }
    return out;
}

interface WorldViewMarketQuote {
    commodityId: string;
    commodityName: string;
    unitPrice: number;
    stock: number;
    priceIndex: number;
}

interface WorldViewMarketTable {
    locationId: string;
    locationName: string;
    quotes: WorldViewMarketQuote[];
}

interface WorldViewNpcWhereaboutsEntry {
    npcId: string;
    name: string;
    locationId: string;
    locationName: string;
    arrivesTurn: number;
    inTransit: boolean;
    agenda?: string;
    reason?: string;
}

interface WorldViewNpcWhereabouts {
    entries: WorldViewNpcWhereaboutsEntry[];
    clamped: boolean;
}

function buildLivingWorldMarketPayload(
    forge: NonNullable<ReturnType<typeof loadWorldForge>>,
    commerce: CommerceForge | undefined,
    markets: MarketStateMap | undefined
): WorldViewMarketTable[] {
    if (!commerce || !markets) { return []; }

    const locationNames = new Map(forge.geography.locations.map((loc) => [loc.id, loc.name]));
    const commodityNames = new Map(commerce.commodities.map((commodity) => [commodity.id, commodity.name]));

    return buildMarketPriceTable(commerce, markets)
        .map((market) => ({
            locationId: market.locationId,
            locationName: locationNames.get(market.locationId) ?? market.locationId,
            quotes: market.quotes.map((quote) => ({
                commodityId: quote.commodityId,
                commodityName: commodityNames.get(quote.commodityId) ?? quote.commodityId,
                unitPrice: quote.unitPrice,
                stock: quote.stock,
                priceIndex: quote.priceIndex,
            })),
        }))
        .filter((market) => market.quotes.length > 0);
}

function buildNpcWhereaboutsPayload(
    forge: NonNullable<ReturnType<typeof loadWorldForge>>,
    registry: ReturnType<typeof loadNpcRegistry>,
    worldState: ReturnType<typeof loadWorldState> | undefined,
    agencyEnabled: boolean
): WorldViewNpcWhereabouts {
    const npcEntries = Object.entries(registry.npcs);
    const registryLike: Record<string, { name: string; locationId?: string; factionId?: string }> = {};
    for (const [id, npc] of npcEntries) {
        registryLike[id] = {
            name: npc.name,
            locationId: npc.locationId,
            factionId: npc.factionId,
        };
    }

    const locationNames = new Map(forge.geography.locations.map((loc) => [loc.id, loc.name]));
    const presence = listNpcPresence(
        registryLike,
        worldState?.npcPositions ?? {},
        worldState?.worldTurn ?? 0,
        agencyEnabled
    );

    return {
        entries: presence.map((npc) => ({
            npcId: npc.npcId,
            name: npc.name,
            locationId: npc.locationId,
            locationName: locationNames.get(npc.locationId) ?? npc.locationId,
            arrivesTurn: npc.arrivesTurn,
            inTransit: npc.inTransit,
            agenda: npc.agenda,
            reason: npc.reason,
        })),
        clamped: npcEntries.length > presence.length,
    };
}

/**
 * World Forge データを Webview の World タブへ送信する。
 * gameStateSync から呼ばれる（scenarioDirector の push パターンに倣う）。
 */
export function pushWorldViewToWebview(currentLocationId?: string): void {
    const panel = getPanelRef?.();
    if (!panel) { return; }

    if (!isWorldForgeEnabled()) {
        panel.webview.postMessage({ type: 'worldView', enabled: false });
        return;
    }

    const forge = loadWorldForge();
    if (!forge) {
        panel.webview.postMessage({ type: 'worldView', enabled: false });
        return;
    }

    // シミュレーション状態（有効かつファイルが存在する場合のみ）
    const simEnabled = isWorldStateEnabled();
    const worldState = simEnabled ? loadWorldState() : undefined;
    const gameRules = loadGameRules();
    const factionStates: Record<string, FactionWorldState> | undefined = worldState?.factions;
    const regionStates: Record<string, RegionWorldState> | undefined = worldState?.regions;
    const globalEvents: GlobalEvent[] | undefined = worldState?.globalEvents;
    const worldTurn: number | undefined = worldState?.worldTurn;

    const activeChanges = pruneExpiredEvents(
        worldState?.recentChanges ?? [],
        worldState?.worldTurn ?? 0
    );
    const highlightRegionIds = extractHighlightRegionIds(activeChanges);

    let worldBlock = loadWorldBlockFromDisk();
    worldBlock = normalizeFogWorldState(worldBlock, forge, currentLocationId) ?? worldBlock;
    const fog = buildFogPayload(worldBlock, forge);
    const fogDiscovered = new Set(fog.discoveredRegionIds);
    const fogRumored = new Set(fog.rumoredRegionIds);

    const worldMap = generateWorldMap(
        forge,
        currentLocationId,
        regionStates,
        factionStates,
        highlightRegionIds,
        { discovered: fogDiscovered, rumored: fogRumored }
    );
    const factions = forge.factions.map(serializeFaction);

    // Location image history — up to 4 most-recent analyzed entries for current location
    const locationImages = currentLocationId
        ? getEntriesByLocation(currentLocationId)
            .slice(0, 4)
            .map((e) => ({
                src: safeImageUri(e.imagePath) ?? '',
                rawImagePath: e.imagePath,
                description: e.description,
                worldTurn: e.worldTurn,
            }))
            .filter((e) => e.src)
        : [];

    // NPCs at current location with portrait URIs
    const registry = loadNpcRegistry();
    const MAX_NPCS_AT_LOCATION = 10;
    const npcsAtLocation = currentLocationId
        ? Object.entries(registry.npcs)
            .filter(([, npc]) => npc.locationId === currentLocationId)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .slice(0, MAX_NPCS_AT_LOCATION)
            .map(([id, npc]) => ({
                id,
                name: npc.name,
                mood: npc.disposition.mood,
                playerTrust: npc.disposition.playerTrust,
                portraitUri: npc.portraitImagePath ? (safeImageUri(npc.portraitImagePath) ?? undefined) : undefined,
                hasPortrait: Boolean(npc.portraitImagePath),
                hasVoice: Boolean(npc.voice),
                voiceLabel: npc.voice?.label,
                voice: npc.voice,
                urgentNeedCount: npc.needs.filter((n) => n.urgency >= 70).length,
            }))
        : [];

    // Phase 11 TTS: push voiced-NPC catalog for Webview sender attribution (61-tts-npc.js).
    const ttsConfig = vscode.workspace.getConfiguration('textAdventure');
    const ttsExternalEnabled = ttsConfig.get<boolean>('tts.external.enabled', false);
    const ttsLocalAvailable = isLocalTtsConfigured();
    const ttsExternalProvider = normalizeExternalProvider(ttsConfig.get('tts.external.provider', ''));
    const npcTtsCatalog = buildNpcTtsCatalog(registry);
    const npcVoiceCount = countNpcVoices(registry);
    const npcWhereabouts = buildNpcWhereaboutsPayload(
        forge,
        registry,
        worldState,
        gameRules.enableNpcAgency === true && gameRules.enableNpcRegistry === true
    );

    const wsPath = getWorkspacePath();
    const worldMapImagePath = resolveWorldMapImagePath(wsPath);
    const cartographyImage = worldMapImagePath && fs.existsSync(worldMapImagePath)
        ? safeImageUri(worldMapImagePath) ?? null
        : null;
    const cartographyPins = maskCartographyPinsForFog(
        buildCartographyPinPositions(forge),
        forge,
        fog
    );
    const cartographyRegionLabels = maskCartographyRegionLabelsForFog(
        buildCartographyRegionLabels(forge),
        fog
    );
    const fogRegionLayout = buildFogRegionLayout(forge);
    const regionHighlightMeta = buildRegionHighlightMeta(activeChanges);
    const regionMapFeedback = buildRegionMapFeedback(
        forge,
        fog,
        activeChanges,
        regionStates,
        worldBlock?.regions
    );
    const locationPinCatalog = buildLocationPinCatalog(
        forge,
        currentLocationId ?? null,
        regionStates,
        fog,
        regionHighlightMeta
    ).map((pin) => ({
        ...pin,
        dangerTier: pin.fogVisibility === 'discovered' && pin.dangerLevel !== undefined
            ? classifyDangerTier(pin.dangerLevel)
            : pin.dangerTier,
    }));
    // Derived display data only — never persisted, never sent to the GM.
    const tileOvermap = buildTileOvermap(forge);
    const overmapThemeKey = resolveOvermapThemeKey(forge.meta.theme);
    const rawForgeDoc = loadWorldForgeDocument();
    const commerceForge = gameRules.enableCommerce === true && rawForgeDoc
        ? resolveCommerceForge(forge, rawForgeDoc)
        : undefined;
    const livingWorldMarkets = commerceForge && worldState
        ? buildLivingWorldMarketPayload(
            forge,
            commerceForge,
            ensureLivingWorldMarkets(commerceForge, worldState as any)
        )
        : [];
    const gameSnapshot = loadGameStateSnapshotFromDisk();
    const playerCommerce = buildPlayerCommercePayload(
        gameSnapshot?.commerce,
        gameRules.enableCommerce === true
    );

    panel.webview.postMessage({
        type: 'worldView',
        enabled: true,
        worldName: forge.meta.worldName,
        theme: forge.meta.theme ?? '',
        overmapThemeKey,
        worldMap,
        cartographyImage,
        cartographyPins,
        cartographyRegionLabels,
        cartographyHasImage: Boolean(cartographyImage),
        fog,
        fogRegionLayout,
        locationPinCatalog,
        regionMapFeedback,
        highlightRegionIds: [...highlightRegionIds],
        tileOvermap,
        factions,
        factionStates: factionStates ?? null,
        regionStates: regionStates ?? null,
        globalEvents: globalEvents ?? [],
        recentChanges: activeChanges,
        questHooks: worldState?.questHooks ?? [],
        livingWorldMarkets,
        playerCommerce,
        worldTurn: worldTurn ?? null,
        simEnabled,
        enableCommerce: gameRules.enableCommerce === true,
        enableFactionReputation: gameRules.enableFactionReputation === true,
        currentLocationId: currentLocationId ?? null,
        locationCount: forge.geography.locations.length,
        regionCount: forge.geography.regions.length,
        locationImages,
        npcsAtLocation,
        npcWhereabouts,
        npcTtsCatalog,
        ttsExternalEnabled,
        ttsLocalAvailable,
        ttsExternalProvider,
        npcVoiceCount,
        mapItems: listActiveMapItems(worldBlock).map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            consumable: item.consumable === true,
        })),
    });
}
