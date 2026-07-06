import type { WorldForge, FactionResources } from './worldForgeCore';
import type { MarketStateMap, MarketStockEntry, NpcPositionsMap } from './livingWorldTypes';
import {
    type WorldChangeEvent,
    parseRecentChanges,
    isValidEventId,
} from './worldEventLogCore';
import { canonicalizeAffinityPairMap, pairKey } from './npcRelationshipCore';

export type { WorldChangeEvent };

export type WorldEventType = 'environmental' | 'political' | 'military' | 'social' | 'magical' | 'other';
export type WorldEventSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic';

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';
export type QuestSource = 'event' | 'npc' | 'campaign';

export interface QuestHook {
    id: string;
    title: string;
    description: string;
    source: QuestSource;
    relatedId: string;
    status: QuestStatus;
    turnGenerated: number;
    reward?: string;
    /** Only set for source: 'npc' — identifies who to reward on completion. */
    npcId?: string;
    /** Only set for source: 'npc' — the specific need this hook resolves. */
    needId?: string;
    /** Faction associated with the quest, used for reputation rewards. */
    factionId?: string;
}


export interface FactionWorldState {
    power: number;
    resources?: FactionResources;
    morale?: number;
    recentEvents?: string[];
    /** F3: player standing toward this faction (-100..100, default 0). */
    playerReputation?: number;
}

export interface RegionWorldState {
    dangerLevel?: number;
    controllingFaction?: string | null;
    activeEvents?: string[];
}

export interface GlobalEvent {
    id: string;
    type: WorldEventType;
    severity: WorldEventSeverity;
    description: string;
    turnsRemaining?: number;
    triggerCondition?: string | null;
}

export interface WorldState {
    format: string;
    lastUpdated?: string;
    worldTurn: number;
    lastSimulatedGmTurn?: number;
    /** World turn whose "Since Last Visit" block was already injected into a GM prompt. */
    lastInjectedWorldChangeSummaryTurn?: number;
    /** Digest for the world-change summary content last acknowledged at that turn. */
    lastInjectedWorldChangeSummaryDigest?: string;
    /** GM journal turn count when chronicle recap was last injected into a GM prompt. */
    lastInjectedChronicleTurn?: number;
    /** Digest for the chronicle recap content last acknowledged at that journal turn. */
    lastInjectedChronicleDigest?: string;
    factions: Record<string, FactionWorldState>;
    regions?: Record<string, RegionWorldState>;
    globalEvents?: GlobalEvent[];
    /** Structured events emitted by the simulator (v1.4). Max MAX_RECENT_CHANGES entries, FIFO. */
    recentChanges?: WorldChangeEvent[];
    pendingWorldEvents?: unknown[];
    /** Phase 8: Automatically generated quests from events and NPC needs. */
    questHooks?: QuestHook[];
    /** LW1: per-market stock and price index (Commerce ON). */
    markets?: MarketStateMap;
    /** LW2: named NPC positions (Agency ON). */
    npcPositions?: NpcPositionsMap;
    /** LW-W1: worldTurn when player last left each location. */
    lastVisitTurnByLocation?: Record<string, number>;
    /** LW-W1: market stock snapshot when player last left each location. */
    marketSnapshotByLocation?: Record<string, Record<string, MarketStockEntry>>;
    /** LW3: NPC間関係 — 正規化ペアキー "idA|idB" → affinity [-100,100] (Relationships ON). */
    npcRelationships?: Record<string, number>;
    /** LW3: 派閥間関係(異派閥) — 正規化ペアキー "factionA|factionB" → [-100,100]。NPC数に依存しない。 */
    npcFactionRelationships?: Record<string, number>;
    /** LW3: 派閥内結束(同派閥) — factionId → [-100,100]。 */
    npcFactionCohesion?: Record<string, number>;
    /** LW3-L: 到達済みライフイベント — ペアキー → マイルストーン id 配列(一度きり発火の記録). */
    npcMilestones?: Record<string, string[]>;
    /** LW3-P: プレイヤー↔NPC の到達済み絆マイルストーン — npcId → id 配列. */
    playerNpcMilestones?: Record<string, string[]>;
    /** World Observatory: 相場スパークライン用の履歴(直近 MAX_MARKET_PRICE_HISTORY_POINTS 件, 古い順)。 */
    marketPriceHistory?: Record<string, Record<string, number[]>>;
}

// --- パーサーユーティリティ ---

function asString(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function asNumber(v: unknown, fallback: number): number {
    return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

const MAX_PARSE_FACTIONS = 50;
const MAX_PARSE_REGIONS = 50;
const MAX_PARSE_GLOBAL_EVENTS = 100;
const MAX_PARSE_QUEST_HOOKS = 100;
const MAX_QUEST_TITLE_LEN = 120;
const MAX_QUEST_DESCRIPTION_LEN = 600;
const MAX_FACTION_RESOURCE_KEYS = 20;
const MAX_FACTION_RESOURCE_VALUE = 10_000;

const VALID_EVENT_TYPES = new Set<WorldEventType>([
    'environmental', 'political', 'military', 'social', 'magical', 'other'
]);
const VALID_SEVERITIES = new Set<WorldEventSeverity>([
    'minor', 'moderate', 'major', 'catastrophic'
]);

function parseFactionWorldState(raw: unknown): FactionWorldState | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const power = Math.max(0, Math.min(100, asNumber(r.power, 50)));
    const state: FactionWorldState = { power };
    if (r.morale !== undefined) { state.morale = Math.max(0, Math.min(100, asNumber(r.morale, 50))); }
    if (r.playerReputation !== undefined) {
        state.playerReputation = Math.max(-100, Math.min(100, Math.round(asNumber(r.playerReputation, 0))));
    }
    if (r.recentEvents !== undefined) { state.recentEvents = asStringArray(r.recentEvents); }
    if (r.resources && typeof r.resources === 'object' && !Array.isArray(r.resources)) {
        const res: FactionResources = {};
        for (const [k, v] of Object.entries(r.resources as Record<string, unknown>)) {
            if (Object.keys(res).length >= MAX_FACTION_RESOURCE_KEYS) { break; }
            if (typeof v !== 'number' || !Number.isFinite(v)) { continue; }
            const key = k.slice(0, 64);
            if (!key) { continue; }
            res[key] = Math.max(0, Math.min(MAX_FACTION_RESOURCE_VALUE, v));
        }
        if (Object.keys(res).length > 0) {
            state.resources = res;
        }
    }
    return state;
}

function parseRegionWorldState(raw: unknown): RegionWorldState {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return {}; }
    const r = raw as Record<string, unknown>;
    const state: RegionWorldState = {};
    if (r.dangerLevel !== undefined) { state.dangerLevel = asNumber(r.dangerLevel, 1); }
    if ('controllingFaction' in r) {
        state.controllingFaction = typeof r.controllingFaction === 'string' ? r.controllingFaction : null;
    }
    if (r.activeEvents !== undefined) { state.activeEvents = asStringArray(r.activeEvents); }
    return state;
}

function parseGlobalEvent(raw: unknown): GlobalEvent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (!isValidEventId(r.id)) { return undefined; }
    const id = r.id as string;
    const description = asString(r.description);
    if (!description) { return undefined; }
    const event: GlobalEvent = {
        id,
        type: VALID_EVENT_TYPES.has(r.type as WorldEventType) ? (r.type as WorldEventType) : 'other',
        severity: VALID_SEVERITIES.has(r.severity as WorldEventSeverity) ? (r.severity as WorldEventSeverity) : 'minor',
        description
    };
    if (r.turnsRemaining !== undefined) { event.turnsRemaining = asNumber(r.turnsRemaining, 0); }
    if ('triggerCondition' in r) {
        event.triggerCondition = typeof r.triggerCondition === 'string' ? r.triggerCondition : null;
    }
    return event;
}

const VALID_QUEST_STATUSES = new Set<QuestStatus>(['available', 'active', 'completed', 'failed']);
const VALID_QUEST_SOURCES = new Set<QuestSource>(['event', 'npc', 'campaign']);

function parseQuestHook(raw: unknown): QuestHook | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;

    if (!isValidEventId(r.id) || !isValidEventId(r.relatedId)) { return undefined; }
    const title = asString(r.title).slice(0, MAX_QUEST_TITLE_LEN);
    const description = asString(r.description).slice(0, MAX_QUEST_DESCRIPTION_LEN);
    const relatedId = asString(r.relatedId);

    if (!title || !description || !relatedId) { return undefined; }

    const source = VALID_QUEST_SOURCES.has(r.source as QuestSource) ? (r.source as QuestSource) : 'event';
    const status = VALID_QUEST_STATUSES.has(r.status as QuestStatus) ? (r.status as QuestStatus) : 'available';

    const hook: QuestHook = {
        id: r.id as string,
        title,
        description,
        source,
        relatedId,
        status,
        turnGenerated: Math.max(0, Math.floor(asNumber(r.turnGenerated, 0)))
    };
    if (r.reward !== undefined) { hook.reward = asString(r.reward).slice(0, 200); }
    if (source === 'npc' && isValidEventId(r.npcId)) { hook.npcId = r.npcId; }
    if (source === 'npc' && isValidEventId(r.needId)) { hook.needId = r.needId; }
    if (source === 'campaign' && isValidEventId(r.factionId)) { hook.factionId = r.factionId; }
    return hook;
}

function parseMarketStockEntry(raw: unknown): MarketStockEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (typeof r.stock !== 'number' || typeof r.priceIndex !== 'number') { return undefined; }
    if (!Number.isFinite(r.stock) || !Number.isFinite(r.priceIndex)) { return undefined; }
    return { stock: r.stock, priceIndex: r.priceIndex };
}

function parseMarketStateMap(raw: unknown): MarketStateMap | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: MarketStateMap = {};
    for (const [locId, stocks] of Object.entries(raw as Record<string, unknown>)) {
        if (!isValidEventId(locId) || !stocks || typeof stocks !== 'object' || Array.isArray(stocks)) {
            continue;
        }
        const locStocks: Record<string, MarketStockEntry> = {};
        for (const [cid, entry] of Object.entries(stocks as Record<string, unknown>)) {
            if (!isValidEventId(cid)) { continue; }
            const parsed = parseMarketStockEntry(entry);
            if (parsed) { locStocks[cid] = parsed; }
        }
        if (Object.keys(locStocks).length > 0) {
            out[locId] = locStocks;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseLocationSnapshotMap(
    raw: unknown
): Record<string, Record<string, MarketStockEntry>> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, Record<string, MarketStockEntry>> = {};
    for (const [locId, stocks] of Object.entries(raw as Record<string, unknown>)) {
        if (!isValidEventId(locId) || !stocks || typeof stocks !== 'object' || Array.isArray(stocks)) {
            continue;
        }
        const locStocks: Record<string, MarketStockEntry> = {};
        for (const [cid, entry] of Object.entries(stocks as Record<string, unknown>)) {
            if (!isValidEventId(cid)) { continue; }
            const parsed = parseMarketStockEntry(entry);
            if (parsed) { locStocks[cid] = parsed; }
        }
        if (Object.keys(locStocks).length > 0) {
            out[locId] = locStocks;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseNpcPositionsMap(raw: unknown): NpcPositionsMap | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: NpcPositionsMap = {};
    for (const [npcId, pos] of Object.entries(raw as Record<string, unknown>)) {
        if (!isValidEventId(npcId) || !pos || typeof pos !== 'object' || Array.isArray(pos)) {
            continue;
        }
        const p = pos as Record<string, unknown>;
        const locationId = typeof p.locationId === 'string' ? p.locationId.trim() : '';
        const arrivesTurn = typeof p.arrivesTurn === 'number' ? Math.floor(p.arrivesTurn) : 0;
        if (!locationId) { continue; }
        out[npcId] = {
            locationId,
            arrivesTurn,
            agenda: typeof p.agenda === 'string' ? p.agenda as NpcPositionsMap[string]['agenda'] : undefined,
            reason: typeof p.reason === 'string' ? p.reason : undefined,
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseTurnByLocation(raw: unknown): Record<string, number> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, number> = {};
    for (const [locId, turn] of Object.entries(raw as Record<string, unknown>)) {
        if (!isValidEventId(locId) || typeof turn !== 'number' || !Number.isFinite(turn)) { continue; }
        out[locId] = Math.max(0, Math.floor(turn));
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

// レガシー既定値(旧: 10人の全ペア45 + 余裕)。個人relationshipsは実際に関わった
// ペアのみ materialize されるため、maxNamedNpcCount を引き上げても爆発的には
// 増えないが、パース時の安全上限としては余裕を持たせておく(JSONの構造検証であり、
// 計算量には影響しない)。
const MAX_PARSE_NPC_RELATIONSHIPS = 20_000;
// 派閥数(F)にのみ依存するため、これで十分すぎるほど余裕がある。
const MAX_PARSE_FACTION_RELATIONSHIPS = 2_000;
const MAX_PARSE_FACTION_COHESION = 500;

function parseNpcRelationships(raw: unknown): Record<string, number> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const scratch: Record<string, number> = {};
    let count = 0;
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_PARSE_NPC_RELATIONSHIPS) { break; }
        const sep = key.indexOf('|');
        if (sep <= 0 || sep >= key.length - 1) { continue; }
        if (typeof val !== 'number' || !Number.isFinite(val)) { continue; }
        scratch[key] = val;
        count++;
    }
    const out = canonicalizeAffinityPairMap(scratch, MAX_PARSE_NPC_RELATIONSHIPS);
    return Object.keys(out).length > 0 ? out : undefined;
}

/** npcFactionRelationships のパース(構造は npcRelationships と同じ、keyは factionA|factionB)。 */
function parseNpcFactionRelationships(raw: unknown): Record<string, number> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const scratch: Record<string, number> = {};
    let count = 0;
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_PARSE_FACTION_RELATIONSHIPS) { break; }
        const sep = key.indexOf('|');
        if (sep <= 0 || sep >= key.length - 1) { continue; }
        if (typeof val !== 'number' || !Number.isFinite(val)) { continue; }
        scratch[key] = val;
        count++;
    }
    const out = canonicalizeAffinityPairMap(scratch, MAX_PARSE_FACTION_RELATIONSHIPS);
    return Object.keys(out).length > 0 ? out : undefined;
}

/** npcFactionCohesion のパース(key は factionId 単体)。 */
function parseNpcFactionCohesion(raw: unknown): Record<string, number> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, number> = {};
    let count = 0;
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_PARSE_FACTION_COHESION) { break; }
        if (!key) { continue; }
        if (typeof val !== 'number' || !Number.isFinite(val)) { continue; }
        out[key] = Math.max(-100, Math.min(100, Math.round(val)));
        count++;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

const VALID_MILESTONE_KINDS = new Set([
    'sworn_allies', 'inseparable', 'bitter_enemies', 'estranged', 'reconciled',
]);
// レガシー既定値(旧: 64)。milestonesもnpcRelationshipsと同様、実際に関わった
// ペアのみ記録されるので、maxNamedNpcCount 引き上げに合わせて余裕を持たせる。
const MAX_PARSE_MILESTONE_PAIRS = 20_000;
const MAX_PARSE_MILESTONES_PER_PAIR = 8;

function parseNpcMilestones(raw: unknown): Record<string, string[]> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, string[]> = {};
    let count = 0;
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_PARSE_MILESTONE_PAIRS) { break; }
        const sep = key.indexOf('|');
        if (sep <= 0 || sep >= key.length - 1) { continue; }
        if (!Array.isArray(val)) { continue; }
        const kinds = val
            .filter((k): k is string => typeof k === 'string' && VALID_MILESTONE_KINDS.has(k))
            .slice(0, MAX_PARSE_MILESTONES_PER_PAIR);
        if (kinds.length === 0) { continue; }
        const a = key.slice(0, sep);
        const b = key.slice(sep + 1);
        const canonKey = pairKey(a, b);
        const prev = out[canonKey];
        out[canonKey] = prev
            ? [...new Set([...prev, ...kinds])].slice(0, MAX_PARSE_MILESTONES_PER_PAIR)
            : kinds;
        count++;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

const VALID_PLAYER_BOND_KINDS = new Set([
    'trusted_companion', 'romance', 'nemesis', 'feared', 'estrangement',
]);
/** World Observatory: 相場スパークラインの履歴長・許容ロケーション/商品数の上限。 */
export const MAX_MARKET_PRICE_HISTORY_POINTS = 24;
const MAX_PARSE_PRICE_HISTORY_LOCATIONS = 30;
const MAX_PARSE_PRICE_HISTORY_COMMODITIES = 20;

function parseMarketPriceHistory(raw: unknown): Record<string, Record<string, number[]>> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, Record<string, number[]>> = {};
    let locCount = 0;
    for (const [locId, byCommodity] of Object.entries(raw as Record<string, unknown>)) {
        if (locCount >= MAX_PARSE_PRICE_HISTORY_LOCATIONS) { break; }
        if (!isValidEventId(locId) || !byCommodity || typeof byCommodity !== 'object' || Array.isArray(byCommodity)) {
            continue;
        }
        const locOut: Record<string, number[]> = {};
        let cCount = 0;
        for (const [cid, points] of Object.entries(byCommodity as Record<string, unknown>)) {
            if (cCount >= MAX_PARSE_PRICE_HISTORY_COMMODITIES) { break; }
            if (!isValidEventId(cid) || !Array.isArray(points)) { continue; }
            const cleaned = points
                .filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
                .slice(-MAX_MARKET_PRICE_HISTORY_POINTS);
            if (cleaned.length > 0) {
                locOut[cid] = cleaned;
                cCount++;
            }
        }
        if (Object.keys(locOut).length > 0) {
            out[locId] = locOut;
            locCount++;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

const MAX_PARSE_PLAYER_BONDS = 32;

function parsePlayerNpcMilestones(raw: unknown): Record<string, string[]> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: Record<string, string[]> = {};
    let count = 0;
    for (const [npcId, val] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_PARSE_PLAYER_BONDS) { break; }
        if (!npcId || !Array.isArray(val)) { continue; }
        const kinds = val
            .filter((k): k is string => typeof k === 'string' && VALID_PLAYER_BOND_KINDS.has(k))
            .slice(0, MAX_PARSE_MILESTONES_PER_PAIR);
        if (kinds.length > 0) { out[npcId] = kinds; count++; }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export interface WorldStateParseWarning {
    code: 'parse_cap_exceeded';
    field: string;
    dropped: number;
    cap: number;
}

export interface WorldStateParseResult {
    state?: WorldState;
    warnings: WorldStateParseWarning[];
}

function countRecordKeys(raw: unknown): number {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return 0; }
    return Object.keys(raw as Record<string, unknown>).length;
}

function countArrayLen(raw: unknown): number {
    return Array.isArray(raw) ? raw.length : 0;
}

function pushCapWarning(
    warnings: WorldStateParseWarning[],
    field: string,
    total: number,
    cap: number
): void {
    if (total > cap) {
        warnings.push({
            code: 'parse_cap_exceeded',
            field,
            dropped: total - cap,
            cap,
        });
    }
}

export const MAX_WORLD_STATE_PARSE_WARNINGS_LOG = 8;

export function formatWorldStateParseWarning(warning: WorldStateParseWarning): string {
    return `world_state parse cap: ${warning.field} dropped ${warning.dropped} entries (cap ${warning.cap})`;
}

/** Parse world_state with bounded-field overflow accounting (no I/O). */
export function parseWorldStateWithWarnings(raw: unknown): WorldStateParseResult {
    const warnings: WorldStateParseWarning[] = [];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const doc = raw as Record<string, unknown>;
        pushCapWarning(warnings, 'factions', countRecordKeys(doc.factions), MAX_PARSE_FACTIONS);
        pushCapWarning(warnings, 'regions', countRecordKeys(doc.regions), MAX_PARSE_REGIONS);
        pushCapWarning(warnings, 'globalEvents', countArrayLen(doc.globalEvents), MAX_PARSE_GLOBAL_EVENTS);
        pushCapWarning(warnings, 'questHooks', countArrayLen(doc.questHooks), MAX_PARSE_QUEST_HOOKS);
        pushCapWarning(warnings, 'npcRelationships', countRecordKeys(doc.npcRelationships), MAX_PARSE_NPC_RELATIONSHIPS);
        pushCapWarning(warnings, 'npcFactionRelationships', countRecordKeys(doc.npcFactionRelationships), MAX_PARSE_FACTION_RELATIONSHIPS);
        pushCapWarning(warnings, 'npcFactionCohesion', countRecordKeys(doc.npcFactionCohesion), MAX_PARSE_FACTION_COHESION);
        pushCapWarning(warnings, 'npcMilestones', countRecordKeys(doc.npcMilestones), MAX_PARSE_MILESTONE_PAIRS);
        pushCapWarning(warnings, 'playerNpcMilestones', countRecordKeys(doc.playerNpcMilestones), MAX_PARSE_PLAYER_BONDS);
    }
    const state = parseWorldState(raw);
    return { state, warnings };
}

export function parseWorldState(raw: unknown): WorldState | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const doc = raw as Record<string, unknown>;

    const factions: Record<string, FactionWorldState> = {};
    if (doc.factions && typeof doc.factions === 'object' && !Array.isArray(doc.factions)) {
        let factionCount = 0;
        for (const [id, val] of Object.entries(doc.factions as Record<string, unknown>)) {
            if (factionCount >= MAX_PARSE_FACTIONS) { break; }
            const parsed = parseFactionWorldState(val);
            if (parsed) {
                factions[id] = parsed;
                factionCount++;
            }
        }
    }

    const regions: Record<string, RegionWorldState> = {};
    if (doc.regions && typeof doc.regions === 'object' && !Array.isArray(doc.regions)) {
        let regionCount = 0;
        for (const [id, val] of Object.entries(doc.regions as Record<string, unknown>)) {
            if (regionCount >= MAX_PARSE_REGIONS) { break; }
            regions[id] = parseRegionWorldState(val);
            regionCount++;
        }
    }

    const globalEvents: GlobalEvent[] = Array.isArray(doc.globalEvents)
        ? doc.globalEvents.slice(0, MAX_PARSE_GLOBAL_EVENTS).map(parseGlobalEvent).filter((x): x is GlobalEvent => x !== undefined)
        : [];

    const recentChanges = parseRecentChanges(doc.recentChanges);

    return {
        format: asString(doc.format, 'lorerelay-world-state/1.0'),
        lastUpdated: typeof doc.lastUpdated === 'string' ? doc.lastUpdated : undefined,
        worldTurn: asNumber(doc.worldTurn, 0),
        lastSimulatedGmTurn: doc.lastSimulatedGmTurn !== undefined ? asNumber(doc.lastSimulatedGmTurn, 0) : undefined,
        lastInjectedWorldChangeSummaryTurn: doc.lastInjectedWorldChangeSummaryTurn !== undefined
            ? asNumber(doc.lastInjectedWorldChangeSummaryTurn, 0)
            : undefined,
        lastInjectedWorldChangeSummaryDigest: doc.lastInjectedWorldChangeSummaryDigest !== undefined
            ? asString(doc.lastInjectedWorldChangeSummaryDigest)
            : undefined,
        lastInjectedChronicleTurn: doc.lastInjectedChronicleTurn !== undefined
            ? asNumber(doc.lastInjectedChronicleTurn, 0)
            : undefined,
        lastInjectedChronicleDigest: doc.lastInjectedChronicleDigest !== undefined
            ? asString(doc.lastInjectedChronicleDigest)
            : undefined,
        factions,
        regions,
        globalEvents,
        recentChanges,
        pendingWorldEvents: Array.isArray(doc.pendingWorldEvents) ? doc.pendingWorldEvents : [],
        questHooks: Array.isArray(doc.questHooks)
            ? doc.questHooks.slice(0, MAX_PARSE_QUEST_HOOKS).map(parseQuestHook).filter((x): x is QuestHook => x !== undefined)
            : [],
        markets: parseMarketStateMap(doc.markets),
        npcPositions: parseNpcPositionsMap(doc.npcPositions),
        lastVisitTurnByLocation: parseTurnByLocation(doc.lastVisitTurnByLocation),
        marketSnapshotByLocation: parseLocationSnapshotMap(doc.marketSnapshotByLocation),
        npcRelationships: parseNpcRelationships(doc.npcRelationships),
        npcFactionRelationships: parseNpcFactionRelationships(doc.npcFactionRelationships),
        npcFactionCohesion: parseNpcFactionCohesion(doc.npcFactionCohesion),
        npcMilestones: parseNpcMilestones(doc.npcMilestones),
        playerNpcMilestones: parsePlayerNpcMilestones(doc.playerNpcMilestones),
        marketPriceHistory: parseMarketPriceHistory(doc.marketPriceHistory),
    };
}

/** world_forge.json の初期データから WorldState を生成する。 */
export function buildInitialWorldState(forge: WorldForge): WorldState {
    const factions: Record<string, FactionWorldState> = {};
    for (const faction of forge.factions) {
        const resources: FactionResources = {};
        if (faction.resources) {
            for (const [k, v] of Object.entries(faction.resources)) {
                if (typeof v === 'number') { resources[k] = v; }
            }
        }
        factions[faction.id] = {
            power: faction.power ?? 50,
            resources,
            morale: 60,
            recentEvents: []
        };
    }

    const regions: Record<string, RegionWorldState> = {};
    for (const region of forge.geography.regions) {
        regions[region.id] = {
            dangerLevel: region.dangerLevel ?? 1,
            controllingFaction: null,
            activeEvents: []
        };
    }

    // ロケーションの派閥支配をリージョンに反映（最初に見つかったものを優先）
    for (const loc of forge.geography.locations) {
        if (loc.factionControl && loc.regionId && regions[loc.regionId]) {
            if (!regions[loc.regionId].controllingFaction) {
                regions[loc.regionId].controllingFaction = loc.factionControl;
            }
        }
    }

    return {
        format: 'lorerelay-world-state/1.1',
        lastUpdated: new Date().toISOString(),
        worldTurn: 0,
        lastSimulatedGmTurn: 0,
        factions,
        regions,
        globalEvents: [],
        recentChanges: [],
        pendingWorldEvents: [],
        questHooks: []
    };
}
