// LW-W1 host bridge: world-kit tick + GM prompt wiring (vscode allowed).

import type { WorldForge } from './worldForgeCore';
import type { FactionWorldState, WorldState } from './worldStateCore';
import type { NpcRegistry } from './npcRegistryCore';
import type { GameRules } from './gameRules';
import type {
    CommerceForge,
    MarketStateMap,
    MarketStockEntry,
    NpcPositionsMap,
    NpcRegistryLike,
} from './livingWorldTypes';
import type { CaravanPromptSnapshot } from './livingWorldPromptCore';
import { parseCommerceForge } from './livingWorldForgeCore';
import { initializeMarketState } from './commerceCore';
import { runLivingWorldTick } from './worldKitTickCore';
import {
    captureFoodCrisisAgencyDeepTrace,
    resolveDeepTraceEmitGateFlags,
} from './debugTraceEmitHost';
import { ensureDebugTraceLiveRun, getActiveDebugTraceSimulationRunId } from './debugTraceHostCore';
import {
    buildLivingWorldPromptBlocks,
    formatLivingWorldGmInjection,
} from './livingWorldPromptCore';
import { computeSinceLastVisitDelta } from './worldSimCommerceCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import type {
    NpcRelationshipMap,
    NpcRelationshipChange,
    NpcFactionRelationshipMap,
    NpcFactionCohesionMap,
    NpcFactionRelationshipChange,
} from './npcRelationshipCore';
import {
    evolveRelationships,
    listNotableRelationships,
    buildRelationshipPromptLines,
    buildFactionRelationsPromptLines,
    describeRelationship,
    applyIntroductionTrustBoost,
    reconcileRelationshipGraph,
} from './npcRelationshipCore';
import { applyBondMarketEffects } from './npcBondEffectsCore';
import {
    detectLifeEvents,
    buildLifeEventMessage,
    buildLifeEventGmHint,
    reconcileNpcMilestones,
} from './npcLifeEventsCore';
import {
    detectPlayerBondEvents,
    buildPlayerBondMessage,
    buildPlayerBondGmHint,
    buildPlayerBondPromptLines,
    purgeStalePlayerBondMilestones,
    type PlayerBondEvent,
    type PlayerBondRegistryLike,
} from './playerBondCore';
import { makeWorldChangeEvent, mergeRecentChanges } from './worldEventLogCore';

export interface LivingWorldWorldStateExt {
    markets?: MarketStateMap;
    npcPositions?: NpcPositionsMap;
    /** Per-location worldTurn when player last left (Since-last-visit). */
    lastVisitTurnByLocation?: Record<string, number>;
    /** Market stock snapshot when player last left each location. */
    marketSnapshotByLocation?: Record<string, Record<string, MarketStockEntry>>;
    /** LW3: NPC間関係 — ペアキー "idA|idB" → affinity [-100,100]. */
    npcRelationships?: NpcRelationshipMap;
    /** LW3: 派閥間関係(異派閥) — ペアキー "factionA|factionB" → [-100,100]. */
    npcFactionRelationships?: NpcFactionRelationshipMap;
    /** LW3: 派閥内結束(同派閥) — factionId → [-100,100]. */
    npcFactionCohesion?: NpcFactionCohesionMap;
    /** LW3-L: 到達済みライフイベント — ペアキー → マイルストーン id 配列. */
    npcMilestones?: Record<string, string[]>;
    /** LW3-P: プレイヤー↔NPC の到達済み絆マイルストーン — npcId → id 配列. */
    playerNpcMilestones?: Record<string, string[]>;
}

function cloneLocationMarketSnapshot(
    markets: MarketStateMap | undefined,
    locationId: string
): Record<string, MarketStockEntry> | undefined {
    const loc = markets?.[locationId];
    if (!loc) { return undefined; }
    const out: Record<string, MarketStockEntry> = {};
    for (const [commodityId, entry] of Object.entries(loc)) {
        out[commodityId] = { stock: entry.stock, priceIndex: entry.priceIndex };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function livingWorldEnabled(rules: GameRules): boolean {
    return rules.enableCommerce === true || rules.enableNpcAgency === true;
}

/** F3 + Commerce: only meaningful once both faction standing and markets are tracked. */
export function factionMarketDemandEnabled(rules: GameRules): boolean {
    return rules.enableCommerce === true && rules.enableFactionReputation === true;
}

/** Market locationId -> controlling factionId, resolved from World Forge geography. */
function buildMarketFactionIds(
    forge: WorldForge,
    marketLocationIds: string[]
): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const locationId of marketLocationIds) {
        const location = forge.geography.locations.find((l) => l.id === locationId);
        out[locationId] = location?.factionControl;
    }
    return out;
}

function buildFactionReputations(factions: Record<string, FactionWorldState>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, fs] of Object.entries(factions)) {
        if (fs.playerReputation !== undefined) { out[id] = fs.playerReputation; }
    }
    return out;
}

/** LW3: 関係進化は Registry + Agency の上に成り立つ(位置が動かないと関係も動かない)。 */
export function npcRelationshipsEnabled(rules: GameRules): boolean {
    return rules.enableNpcRelationships === true
        && rules.enableNpcRegistry === true
        && rules.enableNpcAgency === true;
}

export function resolveCommerceForge(forge: WorldForge, rawForge?: unknown): CommerceForge | undefined {
    const raw = rawForge && typeof rawForge === 'object'
        ? (rawForge as Record<string, unknown>).commerce
        : undefined;
    return parseCommerceForge(raw);
}

export function ensureLivingWorldMarkets(
    commerce: CommerceForge,
    state: WorldState & LivingWorldWorldStateExt
): MarketStateMap {
    if (state.markets && Object.keys(state.markets).length > 0) {
        return state.markets;
    }
    return initializeMarketState(commerce);
}

function registryToAgencyLike(registry: NpcRegistry | undefined): NpcRegistryLike {
    const out: NpcRegistryLike = {};
    if (!registry) { return out; }
    for (const [id, entry] of Object.entries(registry.npcs)) {
        out[id] = {
            name: entry.name,
            locationId: entry.locationId,
            factionId: entry.factionId,
            playerTrust: entry.disposition?.playerTrust,
        };
    }
    return out;
}

export interface LivingWorldTickOutcome {
    state: WorldState & LivingWorldWorldStateExt;
    injection?: string;
}

/** 直近 tick の関係変化(GM プロンプトの「(変化)」行用。プロセス内キャッシュで十分)。 */
let lastRelationshipChanges: NpcRelationshipChange[] = [];

/** 直近 tick の派閥関係変化(個人のBondsとは別枠のGM プロンプト用)。 */
let lastFactionRelationshipChanges: NpcFactionRelationshipChange[] = [];

/** 直近 tick のプレイヤー絆の転機(★ マーク用)。 */
let lastPlayerBondEvents: PlayerBondEvent[] = [];

/** LW3-P: disposition(romance/fear 含む)を playerBondCore の形に写す。 */
function registryToPlayerBondLike(registry: NpcRegistry | undefined): PlayerBondRegistryLike {
    const out: PlayerBondRegistryLike = {};
    if (!registry) { return out; }
    for (const [id, entry] of Object.entries(registry.npcs)) {
        out[id] = {
            name: entry.name,
            playerTrust: entry.disposition?.playerTrust,
            playerRomance: entry.disposition?.playerRomance,
            playerFear: entry.disposition?.playerFear,
            lastInteractionTurn: entry.disposition?.lastInteractionTurn,
        };
    }
    return out;
}

/**
 * Run Tier-1/Tier-2 living world tick after emergent sim step.
 * Mutates and returns extended world state fields on the same object shape.
 */
export function tickLivingWorldAfterSim(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    rawForgeDoc?: unknown,
    stepEvents?: WorldChangeEvent[]
): LivingWorldTickOutcome {
    const ext = state as WorldState & LivingWorldWorldStateExt;
    if (!livingWorldEnabled(rules)) {
        return { state: ext };
    }

    const commerce = resolveCommerceForge(forge, rawForgeDoc);
    if (!commerce && rules.enableCommerce) {
        return { state: ext };
    }

    const markets = commerce
        ? ensureLivingWorldMarkets(commerce, ext)
        : (ext.markets ?? {});

    const commerceForge = commerce ?? { commodities: [], markets: [], transportKinds: [] };
    const commerceEnabled = rules.enableCommerce === true && !!commerce;
    const useFactionMarketDemand = commerceEnabled && factionMarketDemandEnabled(rules);
    const maxNamedNpcCount = rules.maxNamedNpcCount ?? 10;

    const mappedStepEvents = mapStepEvents(stepEvents);
    const npcPositionsBeforeTick = ext.npcPositions ?? {};

    const tick = runLivingWorldTick({
        forge: commerceForge,
        markets,
        registry: registryToAgencyLike(registry),
        npcPositions: npcPositionsBeforeTick,
        worldTurn: state.worldTurn,
        stepEvents: mappedStepEvents,
        commerceEnabled,
        agencyEnabled: rules.enableNpcAgency === true && rules.enableNpcRegistry === true,
        marketFactionIds: useFactionMarketDemand
            ? buildMarketFactionIds(forge, commerceForge.markets.map((m) => m.locationId))
            : undefined,
        factionReputations: useFactionMarketDemand
            ? buildFactionReputations(state.factions ?? {})
            : undefined,
        maxNamedNpcCount,
    });

    ext.markets = tick.markets;
    ext.npcPositions = tick.npcPositions;

    if (rules.enableNpcAgency === true && rules.enableNpcRegistry === true) {
        captureFoodCrisisAgencyDeepTrace(resolveDeepTraceEmitGateFlags(), {
            runId: getActiveDebugTraceSimulationRunId()
                ?? ensureDebugTraceLiveRun(state.worldTurn ?? 0),
            worldTurn: state.worldTurn ?? 0,
            stepEvents: mappedStepEvents,
            commerceForge,
            markets: tick.markets,
            registry: registryToAgencyLike(registry),
            npcPositionsBeforeTick,
            npcMoves: tick.npcMoves,
            npcPositionsAfterTick: tick.npcPositions,
            maxNamedNpcCount,
        });
    }

    // LW3: 世界が動いた「結果」として NPC 同士の関係を進める(同席/共通の危機/派閥対立)。
    if (npcRelationshipsEnabled(rules)) {
        const agencyRegistry = registryToAgencyLike(registry);
        ext.npcRelationships = reconcileRelationshipGraph(ext.npcRelationships ?? {}, agencyRegistry, maxNamedNpcCount);
        ext.npcMilestones = reconcileNpcMilestones(ext.npcMilestones ?? {}, agencyRegistry, maxNamedNpcCount);
        const playerBondReg = registryToPlayerBondLike(registry);
        ext.playerNpcMilestones = purgeStalePlayerBondMilestones(
            ext.playerNpcMilestones ?? {},
            playerBondReg,
            state.worldTurn
        );
        const evolved = evolveRelationships({
            registry: agencyRegistry,
            positions: ext.npcPositions ?? {},
            relationships: ext.npcRelationships ?? {},
            worldTurn: state.worldTurn,
            stepEvents: mappedStepEvents,
            agencyMoves: tick.npcMoves,
            maxNamedNpcCount,
            factionRelationships: ext.npcFactionRelationships ?? {},
            factionCohesion: ext.npcFactionCohesion ?? {},
        });
        ext.npcRelationships = evolved.relationships;
        ext.npcFactionRelationships = evolved.factionRelationships;
        ext.npcFactionCohesion = evolved.factionCohesion;
        lastRelationshipChanges = evolved.changes;
        lastFactionRelationshipChanges = evolved.factionChanges;

        // ラベル遷移(中立→友好 等)だけを世界イベントに昇格 — 「留守中に二人が
        // 親しくなっていた」が Since-last-visit / World Changes の伝聞に乗る。
        const bondEvents = buildBondTransitionEvents(evolved.changes, agencyRegistry, state.worldTurn);
        if (bondEvents.length > 0) {
            state.recentChanges = mergeRecentChanges(state.recentChanges ?? [], bondEvents);
        }

        // 派閥レベルの変化(個人のBondsとは別枠)も、世界の噂として昇格させる。
        const factionNameMap: Record<string, { name?: string }> = {};
        for (const f of forge.factions) { factionNameMap[f.id] = { name: f.name }; }
        const factionEvents = evolved.factionChanges.map((c) => makeWorldChangeEvent({
            worldTurn: state.worldTurn,
            category: 'faction',
            severity: c.delta < 0 && c.factionA !== c.factionB ? 'warning' : 'info',
            source: 'simulation',
            message: buildFactionRelationsPromptLines([c], factionNameMap, 1)[0]
                ?? `${factionNameMap[c.factionA]?.name ?? c.factionA} の情勢が変化した`,
            gmHint: 'Narrate this as a faction-level rumor/mood shift, not a specific individual\'s doing; never state numeric values.',
            factionId: c.factionA,
            expiresAfterTurns: 15,
            idSuffix: `faction_${c.factionA}_${c.factionB}_${c.reason}`,
        }));
        if (factionEvents.length > 0) {
            state.recentChanges = mergeRecentChanges(state.recentChanges ?? [], factionEvents);
        }

        // LW3-L: 決定的な転機(盟友の契り/離れがたい仲/宿敵/決別/和解)を一度だけ昇格。
        const life = detectLifeEvents({
            relationships: ext.npcRelationships ?? {},
            milestones: ext.npcMilestones ?? {},
            registry: agencyRegistry,
            worldTurn: state.worldTurn,
        }, maxNamedNpcCount);
        ext.npcMilestones = life.milestones;
        if (life.events.length > 0) {
            const lifeChanges = life.events.map((ev) => makeWorldChangeEvent({
                worldTurn: state.worldTurn,
                category: 'npc',
                severity: ev.kind === 'bitter_enemies' || ev.kind === 'estranged' ? 'warning' : 'info',
                source: 'simulation',
                message: buildLifeEventMessage(ev, agencyRegistry),
                gmHint: buildLifeEventGmHint(ev.kind),
                npcIds: [ev.a, ev.b],
                expiresAfterTurns: 20,
                idSuffix: `life_${ev.a}_${ev.b}_${ev.kind}`,
            }));
            state.recentChanges = mergeRecentChanges(state.recentChanges ?? [], lifeChanges);
        }

        // LW3-P: あなたの絆 — disposition の閾値越えでプレイヤー↔NPC の転機を一度だけ発火。
        const playerBonds = detectPlayerBondEvents({
            registry: playerBondReg,
            milestones: ext.playerNpcMilestones ?? {},
            worldTurn: state.worldTurn,
        });
        ext.playerNpcMilestones = playerBonds.milestones;
        lastPlayerBondEvents = playerBonds.events;
        if (playerBonds.events.length > 0) {
            const playerChanges = playerBonds.events.map((ev) => makeWorldChangeEvent({
                worldTurn: state.worldTurn,
                category: 'npc',
                severity: ev.kind === 'nemesis' || ev.kind === 'estrangement' ? 'warning' : 'info',
                source: 'simulation',
                message: buildPlayerBondMessage(ev),
                gmHint: buildPlayerBondGmHint(ev.kind),
                npcIds: [ev.npcId],
                expiresAfterTurns: 20,
                idSuffix: `pbond_${ev.npcId}_${ev.kind}`,
            }));
            state.recentChanges = mergeRecentChanges(state.recentChanges ?? [], playerChanges);
        }

        // LW3-W: 絆が世界へ波及 — 盟友ペアは市場間に物流(+在庫)、敵対ペアは価格摩擦。
        // recovery(Tier1)の後に適用するのでボーナスが回復に食われない。
        if (rules.enableCommerce === true && commerce && ext.markets) {
            const fx = applyBondMarketEffects({
                relationships: ext.npcRelationships ?? {},
                registry: agencyRegistry,
                positions: ext.npcPositions ?? {},
                worldTurn: state.worldTurn,
                markets: commerce.markets,
                marketState: ext.markets,
            }, maxNamedNpcCount);
            ext.markets = fx.marketState as typeof ext.markets;
        }
    }

    return { state: ext };
}

const BOND_LABEL_JA: Record<string, string> = {
    ally: '盟友', friend: '友好', neutral: '中立', rival: '不和', enemy: '敵対',
};

/** affinity のラベルが変わった変化のみ、噂イベントとして返す(スパム防止)。 */
function buildBondTransitionEvents(
    changes: NpcRelationshipChange[],
    registry: NpcRegistryLike,
    worldTurn: number
) {
    const events = [];
    for (const c of changes) {
        const beforeLabel = describeRelationship(c.affinity - c.delta);
        const afterLabel = describeRelationship(c.affinity);
        if (beforeLabel === afterLabel) { continue; }
        const nameA = registry[c.a]?.name ?? c.a;
        const nameB = registry[c.b]?.name ?? c.b;
        // ally への昇格は物流(LW3-W)が動き出す合図なので、噂にもその気配を乗せる
        const message = afterLabel === 'ally'
            ? `${nameA}と${nameB}が盟友となった — 二人の間で商いが動き始めたらしい`
            : c.delta > 0
                ? `${nameA}と${nameB}が${BOND_LABEL_JA[afterLabel]}の間柄になったと噂されている`
                : `${nameA}と${nameB}の間に${BOND_LABEL_JA[afterLabel]}の空気が流れていると噂されている`;
        events.push(makeWorldChangeEvent({
            worldTurn,
            category: 'npc',
            severity: 'info',
            source: 'simulation',
            message,
            gmHint: 'Narrate this bond as hearsay only; never state numeric affinity.',
            npcIds: [c.a, c.b],
            expiresAfterTurns: 10,
            idSuffix: `bond_${c.a}_${c.b}_${afterLabel}`,
        }));
        if (events.length >= 4) { break; } // 1tick の噂は最大4件
    }
    return events;
}

function mapStepEvents(events: WorldChangeEvent[] | undefined) {
    return (events ?? []).map((e) => ({
        id: e.id,
        worldTurn: e.worldTurn,
        category: e.category,
        severity: e.severity,
        message: e.message,
        regionId: e.regionId,
        factionId: e.factionId,
        targetFactionId: e.targetFactionId,
    }));
}

export function buildLivingWorldGmLines(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    rawForgeDoc: unknown,
    playerLocationId?: string,
    playerCommerce?: CaravanPromptSnapshot
): string {
    if (!livingWorldEnabled(rules)) { return ''; }

    const commerce = resolveCommerceForge(forge, rawForgeDoc);
    if (!commerce && !rules.enableNpcAgency) { return ''; }

    const ext = state as WorldState & LivingWorldWorldStateExt;
    const markets = ext.markets ?? (commerce ? initializeMarketState(commerce) : {});
    const snapshot = playerLocationId
        ? ext.marketSnapshotByLocation?.[playerLocationId]
        : undefined;
    const lastVisitTurn = playerLocationId
        ? ext.lastVisitTurnByLocation?.[playerLocationId]
        : undefined;
    const commodityIds = commerce?.markets.find((m) => m.locationId === playerLocationId)?.commodityIds ?? [];
    const lastVisit = (
        playerLocationId
        && snapshot
        && lastVisitTurn !== undefined
        && commodityIds.length > 0
    )
        ? computeSinceLastVisitDelta({
            lastVisitTurn,
            currentTurn: state.worldTurn,
            locationId: playerLocationId,
            marketsBefore: { [playerLocationId]: snapshot },
            marketsAfter: markets,
            commodityIds,
        })
        : undefined;

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

    // LW3-W: 紹介効果 — 盟友の playerTrust がペナルティ付きで伝播し、
    // whereabouts の精度(exact/approximate/unknown)が引き上がる(太閤の紹介状)。
    const baseRegistryLike = registryToAgencyLike(registry);
    const factionReputation: Record<string, number> = {};
    for (const [factionId, factionState] of Object.entries(state.factions ?? {})) {
        if (typeof factionState.playerReputation === 'number') {
            factionReputation[factionId] = factionState.playerReputation;
        }
    }
    const maxNamedNpcCount = rules.maxNamedNpcCount ?? 10;
    const promptRegistryLike = npcRelationshipsEnabled(rules)
        ? applyIntroductionTrustBoost(baseRegistryLike, ext.npcRelationships ?? {}, factionReputation, maxNamedNpcCount)
        : baseRegistryLike;

    const blocks = buildLivingWorldPromptBlocks({
        forge: commerce ?? { commodities: [], markets: [], transportKinds: [] },
        markets,
        registry: promptRegistryLike,
        npcPositions: ext.npcPositions ?? {},
        worldTurn: state.worldTurn,
        commerceEnabled: rules.enableCommerce === true && !!commerce,
        agencyEnabled: rules.enableNpcAgency === true,
        playerLocationId,
        sinceLastVisit: lastVisit && lastVisit.turnsAway > 0 ? lastVisit : undefined,
        locationNames,
        regionNames,
        locationToRegion,
        playerCommerce: rules.enableCommerce === true ? playerCommerce : undefined,
        maxNamedNpcCount,
    });

    return formatLivingWorldGmInjection(blocks);
}

export interface LivingWorldBondPromptBlocks {
    npcBonds: string;
    playerBonds: string;
    factionRelations: string;
}

/** LW3 bond blocks as separate GM prompt chunks (evictable independently from worldState). */
export function buildLivingWorldBondPromptBlocks(
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    forge?: WorldForge
): LivingWorldBondPromptBlocks {
    if (!npcRelationshipsEnabled(rules)) {
        return { npcBonds: '', playerBonds: '', factionRelations: '' };
    }

    const ext = state as WorldState & LivingWorldWorldStateExt;
    const agencyRegistry = registryToAgencyLike(registry);
    const maxNamedNpcCount = rules.maxNamedNpcCount ?? 10;
    const notable = listNotableRelationships(
        ext.npcRelationships ?? {},
        agencyRegistry,
        8,
        maxNamedNpcCount,
        ext.npcFactionRelationships ?? {},
        ext.npcFactionCohesion ?? {}
    );
    const bondLines = buildRelationshipPromptLines(notable, lastRelationshipChanges, agencyRegistry);
    const npcBonds = bondLines.length > 0
        ? ['[Living World — Bonds]', ...bondLines.map((l) => `- ${l}`)].join('\n')
        : '';

    const yourLines = buildPlayerBondPromptLines(
        registryToPlayerBondLike(registry),
        ext.playerNpcMilestones ?? {},
        lastPlayerBondEvents
    );
    const playerBonds = yourLines.length > 0
        ? ['[Living World — Your Bonds]', ...yourLines.map((l) => `- ${l}`)].join('\n')
        : '';

    // 派閥レベルの空気(個人のBondsとは別枠) — 「国が戦争になった」規模の話。
    const factionNameMap: Record<string, { name?: string }> = {};
    for (const f of forge?.factions ?? []) { factionNameMap[f.id] = { name: f.name }; }
    const factionLines = buildFactionRelationsPromptLines(lastFactionRelationshipChanges, factionNameMap);
    const factionRelations = factionLines.length > 0
        ? ['[Living World — Faction Relations]', ...factionLines.map((l) => `- ${l}`)].join('\n')
        : '';

    return { npcBonds, playerBonds, factionRelations };
}

/**
 * Record player departure from a location: stamp turn + market snapshot for Since-last-visit.
 */
export function recordLocationVisit(
    state: WorldState,
    departedLocationId: string,
    markets?: MarketStateMap
): WorldState & LivingWorldWorldStateExt {
    const ext = state as WorldState & LivingWorldWorldStateExt;
    if (!departedLocationId) { return ext; }

    const visits = { ...(ext.lastVisitTurnByLocation ?? {}) };
    visits[departedLocationId] = state.worldTurn;
    ext.lastVisitTurnByLocation = visits;

    const snapshot = cloneLocationMarketSnapshot(markets ?? ext.markets, departedLocationId);
    if (snapshot) {
        const snapshots = { ...(ext.marketSnapshotByLocation ?? {}) };
        snapshots[departedLocationId] = snapshot;
        ext.marketSnapshotByLocation = snapshots;
    }

    return ext;
}