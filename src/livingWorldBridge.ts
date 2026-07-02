// LW-W1 host bridge: world-kit tick + GM prompt wiring (vscode allowed).

import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';
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
    buildLivingWorldPromptBlocks,
    formatLivingWorldGmInjection,
} from './livingWorldPromptCore';
import { computeSinceLastVisitDelta } from './worldSimCommerceCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import type { NpcRelationshipMap, NpcRelationshipChange } from './npcRelationshipCore';
import {
    evolveRelationships,
    listNotableRelationships,
    buildRelationshipPromptLines,
    describeRelationship,
    applyIntroductionTrustBoost,
} from './npcRelationshipCore';
import { applyBondMarketEffects } from './npcBondEffectsCore';
import { detectLifeEvents, buildLifeEventMessage, buildLifeEventGmHint } from './npcLifeEventsCore';
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
    /** LW3-L: 到達済みライフイベント — ペアキー → マイルストーン id 配列. */
    npcMilestones?: Record<string, string[]>;
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

/**
 * Run Tier-1/Tier-2 living world tick after emergent sim step.
 * Mutates and returns extended world state fields on the same object shape.
 */
export function tickLivingWorldAfterSim(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    rawForgeDoc?: unknown
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

    const tick = runLivingWorldTick({
        forge: commerce ?? { commodities: [], markets: [], transportKinds: [] },
        markets,
        registry: registryToAgencyLike(registry),
        npcPositions: ext.npcPositions ?? {},
        worldTurn: state.worldTurn,
        recentChanges: mapRecentChanges(state.recentChanges),
        commerceEnabled: rules.enableCommerce === true && !!commerce,
        agencyEnabled: rules.enableNpcAgency === true && rules.enableNpcRegistry === true,
    });

    ext.markets = tick.markets;
    ext.npcPositions = tick.npcPositions;

    // LW3: 世界が動いた「結果」として NPC 同士の関係を進める(同席/共通の危機/派閥対立)。
    if (npcRelationshipsEnabled(rules)) {
        const agencyRegistry = registryToAgencyLike(registry);
        const evolved = evolveRelationships({
            registry: agencyRegistry,
            positions: ext.npcPositions ?? {},
            relationships: ext.npcRelationships ?? {},
            worldTurn: state.worldTurn,
            recentChanges: mapRecentChanges(state.recentChanges),
            agencyMoves: tick.npcMoves,
        });
        ext.npcRelationships = evolved.relationships;
        lastRelationshipChanges = evolved.changes;

        // ラベル遷移(中立→友好 等)だけを世界イベントに昇格 — 「留守中に二人が
        // 親しくなっていた」が Since-last-visit / World Changes の伝聞に乗る。
        const bondEvents = buildBondTransitionEvents(evolved.changes, agencyRegistry, state.worldTurn);
        if (bondEvents.length > 0) {
            state.recentChanges = mergeRecentChanges(state.recentChanges ?? [], bondEvents);
        }

        // LW3-L: 決定的な転機(盟友の契り/離れがたい仲/宿敵/決別/和解)を一度だけ昇格。
        const life = detectLifeEvents({
            relationships: ext.npcRelationships ?? {},
            milestones: ext.npcMilestones ?? {},
            registry: agencyRegistry,
            worldTurn: state.worldTurn,
        });
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
            });
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

function mapRecentChanges(events: WorldChangeEvent[] | undefined) {
    return (events ?? []).map((e) => ({
        worldTurn: e.worldTurn,
        category: e.category,
        severity: e.severity,
        message: e.message,
        regionId: e.regionId,
        factionId: e.factionId,
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
    const promptRegistryLike = npcRelationshipsEnabled(rules)
        ? applyIntroductionTrustBoost(baseRegistryLike, ext.npcRelationships ?? {})
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
    });

    let injection = formatLivingWorldGmInjection(blocks);

    // LW3: [Living World — Bonds] — 顕著な関係と直近の変化を伝聞素材として GM に渡す。
    // (livingWorldPromptCore は world-kit 同期対象のため、ここで低侵襲に連結する)
    if (npcRelationshipsEnabled(rules)) {
        const agencyRegistry = registryToAgencyLike(registry);
        const notable = listNotableRelationships(ext.npcRelationships ?? {}, agencyRegistry);
        const bondLines = buildRelationshipPromptLines(notable, lastRelationshipChanges, agencyRegistry);
        if (bondLines.length > 0) {
            const block = ['[Living World — Bonds]', ...bondLines.map((l) => `- ${l}`)].join('\n');
            injection = injection ? `${injection}\n${block}` : block;
        }
    }

    return injection;
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