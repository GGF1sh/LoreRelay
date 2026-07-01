import type { WorldForge, FactionResources } from './worldForgeCore';
import {
    type WorldChangeEvent,
    parseRecentChanges,
    isValidEventId,
} from './worldEventLogCore';

export type { WorldChangeEvent };

export type WorldEventType = 'environmental' | 'political' | 'military' | 'social' | 'magical' | 'other';
export type WorldEventSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic';

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';
export type QuestSource = 'event' | 'npc';

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
}


export interface FactionWorldState {
    power: number;
    resources?: FactionResources;
    morale?: number;
    recentEvents?: string[];
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
    factions: Record<string, FactionWorldState>;
    regions?: Record<string, RegionWorldState>;
    globalEvents?: GlobalEvent[];
    /** Structured events emitted by the simulator (v1.4). Max MAX_RECENT_CHANGES entries, FIFO. */
    recentChanges?: WorldChangeEvent[];
    pendingWorldEvents?: unknown[];
    /** Phase 8: Automatically generated quests from events and NPC needs. */
    questHooks?: QuestHook[];
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
const VALID_QUEST_SOURCES = new Set<QuestSource>(['event', 'npc']);

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
    return hook;
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
        factions,
        regions,
        globalEvents,
        recentChanges,
        pendingWorldEvents: Array.isArray(doc.pendingWorldEvents) ? doc.pendingWorldEvents : [],
        questHooks: Array.isArray(doc.questHooks)
            ? doc.questHooks.slice(0, MAX_PARSE_QUEST_HOOKS).map(parseQuestHook).filter((x): x is QuestHook => x !== undefined)
            : []
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
