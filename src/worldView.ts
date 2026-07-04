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
import { buildMapOverlayFromContext } from './mapOverlayBridge';
import { deriveKnownNpcIds } from './mapOverlayCore';
import { loadDiscoveryLedger } from './discoveryLedger';
import { loadSettlementLayout, loadSettlementState } from './settlementState';
import { buildWorkspaceSettlementDiorama, resolveDioramaThemeFromOvermap, settlementDioramaEnabled } from './settlementDioramaBridge';
import { buildSettlementExpansionPreviews, buildSettlementViewSnapshot } from './settlementViewCore';
import type { SettlementLayerId } from './settlementCore';

import { isCampaignKitPromptActive } from './gmPromptBuilderCore';
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
import { pickDomainForWebview } from './domainBridge';
import { pickGuildForWebview } from './guildBridge';
import { buildCampaignKitWebviewPayload } from './campaignKitBridge';
import { getCampaignKitPath } from './campaignKit';
import { livingWorldEnabled } from './livingWorldBridge';
import { readDomainFromGameState } from './domainTurnOps';
import { readGuildFromGameState } from './guildTurnOps';
import { buildMarketPriceTable } from './commerceCore';
import { resolveCommerceForge, ensureLivingWorldMarkets, npcRelationshipsEnabled } from './livingWorldBridge';
import type { CommerceForge, MarketStateMap } from './livingWorldTypes';
import { listNotableRelationships, applyIntroductionTrustBoost } from './npcRelationshipCore';
import { deepestMilestone } from './npcLifeEventsCore';
import { listPlayerBondStandings } from './playerBondCore';
import { listNpcPresence } from './npcAgencyCore';
import {
    formatWhereaboutsForDisplay,
    readNpcPlayerTrust,
    resolveWhereaboutsPrecision,
    type WhereaboutsPrecision,
} from './npcWhereaboutsTrustCore';
import { buildChronicleForWorkspace } from './chronicleLoader';
import { buildMobileBasePanelWebviewPayload, mobileBaseSystemEnabled } from './mobileBaseBridge';
import { buildVehicleGarageWebviewPayload } from './vehicleBridge';

let getPanelRef: (() => vscode.WebviewPanel | undefined) | undefined;
let preferredSettlementLayerId: SettlementLayerId = 'z0';

export function initWorldView(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getPanelRef = deps.getPanel;
}

export function setPreferredSettlementLayer(layerId: string): SettlementLayerId {
    const valid = new Set(['z1', 'z0', 'z-1', 'z-2']);
    preferredSettlementLayerId = valid.has(layerId) ? (layerId as SettlementLayerId) : 'z0';
    return preferredSettlementLayerId;
}

export function getPreferredSettlementLayer(): SettlementLayerId {
    return preferredSettlementLayerId;
}

function loadGameStateSnapshotFromDisk(): (Pick<GameState, 'world' | 'commerce'> & { domain?: unknown }) | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Pick<GameState, 'world' | 'commerce'> & { domain?: unknown };
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
    playerRole: string;
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
    const role = typeof commerce.playerRole === 'string' && commerce.playerRole
        ? commerce.playerRole
        : 'merchant';
    return {
        credits: Math.max(0, Math.floor(commerce.credits)),
        food: typeof commerce.food === 'number' ? Math.max(0, Math.floor(commerce.food)) : 30,
        transportId: typeof commerce.transportId === 'string' ? commerce.transportId : 'wagon',
        playerRole: role,
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
    locationId?: string;
    locationName: string;
    regionName?: string;
    precision: WhereaboutsPrecision;
    arrivesTurn?: number;
    inTransit?: boolean;
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

interface WorldViewNpcBond {
    nameA: string;
    nameB: string;
    /** 'ally' | 'friend' | 'rival' | 'enemy' — raw affinity never leaves the host. */
    label: string;
    /** LW3-L: 到達した決定的な転機(sworn_allies/inseparable/estranged 等)。無ければ省略。 */
    milestone?: string;
}

/** LW3: notable bonds between named NPCs (labels only, no numbers). */
function buildNpcBondsPayload(
    registry: ReturnType<typeof loadNpcRegistry>,
    worldState: { npcRelationships?: Record<string, number>; npcMilestones?: Record<string, string[]> } | undefined,
    relationshipsEnabled: boolean
): WorldViewNpcBond[] {
    if (!relationshipsEnabled || !worldState?.npcRelationships) { return []; }
    const registryLike: Record<string, { name: string; locationId?: string; factionId?: string }> = {};
    for (const [id, npc] of Object.entries(registry.npcs)) {
        registryLike[id] = { name: npc.name, locationId: npc.locationId, factionId: npc.factionId };
    }
    const milestones = worldState.npcMilestones ?? {};
    return listNotableRelationships(worldState.npcRelationships, registryLike)
        .map((n) => ({
            nameA: n.nameA,
            nameB: n.nameB,
            label: n.label,
            milestone: deepestMilestone(milestones, n.a, n.b),
        }));
}

function buildNpcWhereaboutsPayload(
    forge: NonNullable<ReturnType<typeof loadWorldForge>>,
    registry: ReturnType<typeof loadNpcRegistry>,
    worldState: ReturnType<typeof loadWorldState> | undefined,
    agencyEnabled: boolean,
    relationshipsEnabled = false
): WorldViewNpcWhereabouts {
    const npcEntries = Object.entries(registry.npcs);
    let registryLike: Record<string, {
        name: string;
        locationId?: string;
        factionId?: string;
        playerTrust?: number;
        introducedBy?: string;
    }> = {};
    for (const [id, npc] of npcEntries) {
        registryLike[id] = {
            name: npc.name,
            locationId: npc.locationId,
            factionId: npc.factionId,
            playerTrust: npc.disposition?.playerTrust,
        };
    }
    // LW3-W: 紹介効果 — 盟友の信頼がペナルティ付きで伝播(whereabouts 精度に効く)
    if (relationshipsEnabled && worldState) {
        const relationships = (worldState as { npcRelationships?: Record<string, number> }).npcRelationships;
        if (relationships) {
            const factionReputation: Record<string, number> = {};
            for (const [factionId, factionState] of Object.entries(worldState.factions ?? {})) {
                if (typeof factionState.playerReputation === 'number') {
                    factionReputation[factionId] = factionState.playerReputation;
                }
            }
            registryLike = applyIntroductionTrustBoost(registryLike, relationships, factionReputation);
        }
    }

    const locationNames: Record<string, string> = {};
    const locationToRegion: Record<string, string> = {};
    for (const loc of forge.geography.locations) {
        locationNames[loc.id] = loc.name;
        if (loc.regionId) {
            locationToRegion[loc.id] = loc.regionId;
        }
    }
    const regionNames: Record<string, string> = {};
    for (const reg of forge.geography.regions) {
        regionNames[reg.id] = reg.name;
    }

    const presence = listNpcPresence(
        registryLike,
        worldState?.npcPositions ?? {},
        worldState?.worldTurn ?? 0,
        agencyEnabled
    );

    return {
        entries: presence.map((npc) => {
            const trust = readNpcPlayerTrust(registryLike[npc.npcId]?.playerTrust);
            const formatted = formatWhereaboutsForDisplay(
                resolveWhereaboutsPrecision(trust),
                npc.locationId,
                npc.inTransit,
                { locationNames, regionNames, locationToRegion }
            );
            const introducerId = registryLike[npc.npcId]?.introducedBy;
            return {
                npcId: npc.npcId,
                name: npc.name,
                locationId: formatted.precision === 'unknown' ? undefined : npc.locationId,
                locationName: formatted.locationLabel,
                regionName: formatted.regionLabel,
                precision: formatted.precision,
                arrivesTurn: formatted.precision === 'unknown' ? undefined : npc.arrivesTurn,
                inTransit: formatted.precision === 'unknown' ? undefined : npc.inTransit,
                agenda: formatted.showAgenda ? npc.agenda : undefined,
                reason: formatted.showReason ? npc.reason : undefined,
                // LW3-W: 紹介で見えている場合は紹介者名(unknown 時は出さない)
                introducedByName: formatted.precision !== 'unknown' && introducerId
                    ? registryLike[introducerId]?.name
                    : undefined,
            };
        }),
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
        gameRules.enableNpcAgency === true && gameRules.enableNpcRegistry === true,
        npcRelationshipsEnabled(gameRules)
    );
    // LW3: notable NPC-to-NPC bonds. Labels only — raw affinity numbers stay host-side (v1.27.1 leak policy).
    const npcBonds = buildNpcBondsPayload(
        registry,
        worldState as { npcRelationships?: Record<string, number> } | undefined,
        npcRelationshipsEnabled(gameRules)
    );
    // LW3-P: プレイヤー自身の絆(kind ラベルのみ。数値は送らない)。
    const playerBonds = npcRelationshipsEnabled(gameRules) && worldState
        ? listPlayerBondStandings(
            Object.fromEntries(Object.entries(registry.npcs).map(([id, npc]) => [id, {
                name: npc.name,
                playerTrust: npc.disposition?.playerTrust,
                playerRomance: npc.disposition?.playerRomance,
                playerFear: npc.disposition?.playerFear,
            }])),
            (worldState as { playerNpcMilestones?: Record<string, string[]> }).playerNpcMilestones ?? {}
        ).map((s) => ({ name: s.name, kind: s.kind }))
        : [];

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
    const campaignKitActive = isCampaignKitPromptActive({
        enableCampaignKit: gameRules.enableCampaignKit === true,
        hasCampaignKitFile: Boolean(getCampaignKitPath() && fs.existsSync(getCampaignKitPath()!)),
        enableDomainMode: gameRules.enableDomainMode === true,
        enableGuildMode: gameRules.enableGuildMode === true,
        enableEmergentSimulation: gameRules.enableEmergentSimulation === true,
        enableWorldObservatory: gameRules.enableWorldObservatory === true,
        chronicleRecapInPrompt: false,
        enableCommerce: gameRules.enableCommerce === true,
        enableNpcRegistry: gameRules.enableNpcRegistry === true,
        enableNpcRelationships: gameRules.enableNpcRelationships === true,
        livingWorldEnabled: livingWorldEnabled(gameRules),
        worldStateEnabled: simEnabled,
        worldForgeEnabled: true,
        enableTravelEncounters: gameRules.enableTravelEncounters === true,
        enableSettlementMode: gameRules.enableSettlementMode === true,
        enableVehicleSystem: gameRules.enableVehicleSystem === true,
        enableMobileBaseSystem: gameRules.enableMobileBaseSystem === true,
    });
    const settlementState = gameRules.enableSettlementMode === true ? loadSettlementState() : undefined;
    const settlementLayout = settlementState ? loadSettlementLayout() : undefined;
    const settlementView = settlementState
        ? buildSettlementViewSnapshot({
            state: settlementState,
            layout: settlementLayout,
            selectedLayerId: preferredSettlementLayerId,
        })
        : undefined;
    // M4c: read-only ghost previews for layers missing from settlement_layout.json.
    // Pure in-memory use of applyExpandLayerToLayout — never persisted here.
    const settlementExpansionPreviews = settlementState
        ? buildSettlementExpansionPreviews(settlementState, settlementLayout)
        : [];
    const dioramaTheme = resolveDioramaThemeFromOvermap(overmapThemeKey);
    const settlementDiorama = buildWorkspaceSettlementDiorama(
        settlementView,
        gameRules,
        { theme: dioramaTheme, includeLabels: true }
    );

    const mapOverlay = buildMapOverlayFromContext({
        forge,
        fog: {
            discoveredRegionIds: fog.discoveredRegionIds,
            rumoredRegionIds: fog.rumoredRegionIds,
        },
        gameRules,
        simEnabled,
        worldState,
        registry,
        settlementState,
        campaignKitActive,
        discoveryLedger: campaignKitActive ? loadDiscoveryLedger() : undefined,
        knownNpcIds: deriveKnownNpcIds(registry, fog.visitedLocationIds),
    });
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

    // §D3: Domain Mode panel (F7 Audience / F8 Rivals / F9 Missions / F10 Battle all surface here).
    const domainState = gameRules.enableDomainMode === true && gameSnapshot
        ? readDomainFromGameState(gameSnapshot as unknown as Record<string, unknown>)
        : undefined;
    const domain = pickDomainForWebview(domainState);

    const guildState = gameRules.enableGuildMode === true && gameSnapshot
        ? readGuildFromGameState(gameSnapshot as unknown as Record<string, unknown>)
        : undefined;
    const guild = pickGuildForWebview(guildState);

    const campaignKitPayload = buildCampaignKitWebviewPayload(
        currentLocationId ?? null,
        worldTurn ?? 0,
        worldState?.questHooks
    );

    // World Observatory (§4): only compute when the feature is on — buildChronicleForWorkspace
    // re-reads state_journal.ndjson, so gate it to avoid extra I/O on every worldView push.
    const worldObservatoryEnabled = gameRules.enableWorldObservatory === true;
    const MAX_OBSERVATORY_CHRONICLE_EVENTS = 30;
    const observatoryChronicle = worldObservatoryEnabled && wsPath
        ? buildChronicleForWorkspace(wsPath)
            .flatMap((chapter) => chapter.events)
            .slice(-MAX_OBSERVATORY_CHRONICLE_EVENTS)
        : [];

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
        mapOverlay,
        enableSettlementMode: gameRules.enableSettlementMode === true,
        settlementView: settlementView ?? null,
        enableSettlementDiorama: settlementDioramaEnabled(gameRules),
        settlementDiorama: settlementDiorama ?? null,
        settlementExpansionPreviews,
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
        enableCommerceUi: gameRules.enableCommerceUi === true,
        playerRoles: ['merchant', 'adventurer', 'retainer', 'smith', 'ruler'],
        enableFactionReputation: gameRules.enableFactionReputation === true,
        currentLocationId: currentLocationId ?? null,
        locationCount: forge.geography.locations.length,
        regionCount: forge.geography.regions.length,
        locationImages,
        npcsAtLocation,
        npcWhereabouts,
        npcBonds,
        playerBonds,
        npcTtsCatalog,
        ttsExternalEnabled,
        ttsLocalAvailable,
        ttsExternalProvider,
        npcVoiceCount,
        enableDomainMode: gameRules.enableDomainMode === true,
        enableDomainAudience: gameRules.enableDomainAudience === true,
        enableDomainRivals: gameRules.enableDomainRivals === true,
        enableDomainMissions: gameRules.enableDomainMissions === true,
        enableMassBattle: gameRules.enableMassBattle === true,
        domain: domain ?? null,
        enableGuildMode: gameRules.enableGuildMode === true,
        enableGuildRequests: gameRules.enableGuildRequests === true,
        enableGuildParties: gameRules.enableGuildParties === true,
        guild: guild ?? null,
        enableCampaignKit: campaignKitPayload.enabled,
        campaignKit: campaignKitPayload.campaignKit ?? null,
        campaignDiscoveries: campaignKitPayload.discoveries ?? null,
        campaignJobBoard: campaignKitPayload.jobBoard ?? null,
        campaignResources: campaignKitPayload.resources ?? null,
        mapItems: listActiveMapItems(worldBlock).map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            consumable: item.consumable === true,
        })),
        enableWorldObservatory: worldObservatoryEnabled,
        marketPriceHistory: worldObservatoryEnabled ? (worldState?.marketPriceHistory ?? null) : null,
        chronicle: observatoryChronicle,
        enableVehicleSystem: gameRules.enableVehicleSystem === true,
        vehicleGarage: buildVehicleGarageWebviewPayload(currentLocationId ?? worldBlock?.currentLocationId),
        enableMobileBaseSystem: mobileBaseSystemEnabled(gameRules),
        mobileBasePanel: buildMobileBasePanelWebviewPayload(currentLocationId ?? worldBlock?.currentLocationId),
    });
}
