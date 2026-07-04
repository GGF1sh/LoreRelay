// Pure types and utilities for the Living World event log (v1.4.0).
// No vscode or fs imports — safe for Node.js test environment.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorldChangeCategory = 'faction' | 'region' | 'resource' | 'npc' | 'global' | 'guild';
export type WorldChangeSeverity = 'info' | 'warning' | 'critical';
export type WorldChangeSource = 'simulation' | 'player' | 'gm';

export interface WorldChangeEvent {
    /** Unique event ID, e.g. "wce_12_region_dark_moor". */
    id: string;
    worldTurn: number;
    source: WorldChangeSource;
    category: WorldChangeCategory;
    severity: WorldChangeSeverity;
    factionId?: string;
    /** 紛争/外交イベントの相手派閥(派閥動態のペアバインド用)。 */
    targetFactionId?: string;
    regionId?: string;
    locationId?: string;
    /** Up to MAX_NPC_IDS_PER_EVENT NPC IDs affected by this event. */
    npcIds?: string[];
    /** Player-facing short description (≤ MAX_EVENT_MESSAGE_LEN chars). */
    message: string;
    /** GM-facing extra context injected into the prompt (≤ MAX_EVENT_GM_HINT_LEN chars). */
    gmHint?: string;
    /** When true, worldMapGenerator highlights the associated region. */
    mapHighlight?: boolean;
    /**
     * If set, the event is considered expired when
     *   currentTurn >= worldTurn + expiresAfterTurns.
     */
    expiresAfterTurns?: number;
}

// ---------------------------------------------------------------------------
// Safety constants
// ---------------------------------------------------------------------------

export const MAX_RECENT_CHANGES = 20;
export const MAX_EVENT_MESSAGE_LEN = 200;
export const MAX_EVENT_GM_HINT_LEN = 400;
export const MAX_NPC_IDS_PER_EVENT = 10;
export const MAX_ID_LEN = 64;
export const MAX_PARSE_RECENT_CHANGES = 100; // output cap after filtering
export const MAX_RAW_RECENT_CHANGES_ARRAY = 500; // DoS bound on raw array length

// ---------------------------------------------------------------------------
// Enum sets for fast validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set<WorldChangeCategory>([
    'faction', 'region', 'resource', 'npc', 'global', 'guild',
]);
const VALID_SEVERITIES = new Set<WorldChangeSeverity>([
    'info', 'warning', 'critical',
]);
const VALID_SOURCES = new Set<WorldChangeSource>([
    'simulation', 'player', 'gm',
]);

// Allows letters, digits, hyphens, underscores — no spaces or special chars.
const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

/** Returns true when id is a safe, non-empty identifier string. */
export function isValidEventId(id: unknown): id is string {
    return (
        typeof id === 'string' &&
        id.length > 0 &&
        id.length <= MAX_ID_LEN &&
        VALID_ID_RE.test(id)
    );
}

/**
 * Builds a unique event ID from worldTurn, category and a caller-supplied
 * suffix (which will be slugified).
 * Example: makeEventId(12, 'region', 'Dark Moor') → "wce_12_region_dark_moor"
 */
export function makeEventId(
    worldTurn: number,
    category: WorldChangeCategory,
    suffix: string
): string {
    const slug = suffix
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32);
    return `wce_${Math.max(0, Math.floor(worldTurn))}_${category}_${slug || 'evt'}`;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function asStr(v: unknown, maxLen: number, fallback?: string): string | undefined {
    if (typeof v !== 'string') { return fallback; }
    return v.slice(0, maxLen);
}

function asNumber(v: unknown, fallback: number): number {
    return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

function asBoolean(v: unknown): boolean | undefined {
    if (typeof v === 'boolean') { return v; }
    return undefined;
}

/**
 * Parses a raw unknown value into a WorldChangeEvent.
 * Returns undefined when required fields are missing or invalid.
 * Applies length caps and enum validation; does NOT throw.
 */
export function parseWorldChangeEvent(raw: unknown): WorldChangeEvent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;

    // Required: id
    if (!isValidEventId(r.id)) { return undefined; }

    // Required: message (non-empty after truncation)
    const message = asStr(r.message, MAX_EVENT_MESSAGE_LEN, '');
    if (!message) { return undefined; }

    // Required: category
    const category = r.category as WorldChangeCategory;
    if (!VALID_CATEGORIES.has(category)) { return undefined; }

    // Required: severity
    const severity = r.severity as WorldChangeSeverity;
    if (!VALID_SEVERITIES.has(severity)) { return undefined; }

    // Required: source
    const source = (VALID_SOURCES.has(r.source as WorldChangeSource)
        ? r.source
        : 'simulation') as WorldChangeSource;

    const worldTurn = asNumber(r.worldTurn, 0);

    const event: WorldChangeEvent = {
        id: r.id as string,
        worldTurn,
        source,
        category,
        severity,
        message,
    };

    // Optional ref IDs — validate format
    const factionId = asStr(r.factionId, MAX_ID_LEN);
    if (factionId && isValidEventId(factionId)) { event.factionId = factionId; }

    const targetFactionId = asStr(r.targetFactionId, MAX_ID_LEN);
    if (targetFactionId && isValidEventId(targetFactionId)) { event.targetFactionId = targetFactionId; }

    const regionId = asStr(r.regionId, MAX_ID_LEN);
    if (regionId && isValidEventId(regionId)) { event.regionId = regionId; }

    const locationId = asStr(r.locationId, MAX_ID_LEN);
    if (locationId && isValidEventId(locationId)) { event.locationId = locationId; }

    if (Array.isArray(r.npcIds)) {
        event.npcIds = (r.npcIds as unknown[])
            .filter(isValidEventId)
            .slice(0, MAX_NPC_IDS_PER_EVENT);
    }

    const gmHint = asStr(r.gmHint, MAX_EVENT_GM_HINT_LEN);
    if (gmHint) { event.gmHint = gmHint; }

    const mapHighlight = asBoolean(r.mapHighlight);
    if (mapHighlight !== undefined) { event.mapHighlight = mapHighlight; }

    if (typeof r.expiresAfterTurns === 'number' && r.expiresAfterTurns > 0) {
        event.expiresAfterTurns = Math.floor(r.expiresAfterTurns);
    }

    return event;
}

/**
 * Keeps the newest maxCount events by worldTurn (FIFO tail policy, matches mergeRecentChanges).
 * Preserves chronological order among survivors.
 */
export function capRecentChangesByWorldTurn(
    events: WorldChangeEvent[],
    maxCount: number = MAX_PARSE_RECENT_CHANGES
): WorldChangeEvent[] {
    if (events.length <= maxCount) {
        return events;
    }
    const sorted = [...events].sort((a, b) => {
        if (a.worldTurn !== b.worldTurn) { return a.worldTurn - b.worldTurn; }
        return a.id.localeCompare(b.id);
    });
    return sorted.slice(sorted.length - maxCount);
}

/**
 * Parses an array of raw objects into WorldChangeEvent[].
 * Caps at MAX_PARSE_RECENT_CHANGES (newest by worldTurn) to prevent unbounded memory.
 */
export function parseRecentChanges(raw: unknown): WorldChangeEvent[] {
    if (!Array.isArray(raw)) { return []; }
    const bounded = raw.length > MAX_RAW_RECENT_CHANGES_ARRAY
        ? raw.slice(-MAX_RAW_RECENT_CHANGES_ARRAY)
        : raw;
    const parsed = bounded
        .map(parseWorldChangeEvent)
        .filter((e): e is WorldChangeEvent => e !== undefined);
    return capRecentChangesByWorldTurn(parsed, MAX_PARSE_RECENT_CHANGES);
}

// ---------------------------------------------------------------------------
// Event lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Removes events whose expiresAfterTurns has elapsed relative to currentTurn.
 * Events without expiresAfterTurns are kept indefinitely.
 */
export function pruneExpiredEvents(
    events: WorldChangeEvent[],
    currentTurn: number
): WorldChangeEvent[] {
    return events.filter((ev) => {
        if (ev.expiresAfterTurns === undefined) { return true; }
        return currentTurn < ev.worldTurn + ev.expiresAfterTurns;
    });
}

/**
 * Merges incoming events into existing, deduplicating by id, then caps the
 * combined list to maxCount (FIFO — oldest entries are dropped first).
 * Returns a new array; inputs are not mutated.
 */
export function mergeRecentChanges(
    existing: WorldChangeEvent[],
    incoming: WorldChangeEvent[],
    maxCount: number = MAX_RECENT_CHANGES
): WorldChangeEvent[] {
    const seen = new Set<string>();
    const merged: WorldChangeEvent[] = [];

    // existing first (older), then incoming (newer)
    for (const ev of [...existing, ...incoming]) {
        if (!seen.has(ev.id)) {
            seen.add(ev.id);
            merged.push(ev);
        }
    }

    // FIFO: drop oldest from the front if over capacity
    const cap = Math.max(1, maxCount);
    return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

// ---------------------------------------------------------------------------
// Event factory helpers (used by emergentSimulator)
// ---------------------------------------------------------------------------

export interface MakeEventOptions {
    worldTurn: number;
    category: WorldChangeCategory;
    severity: WorldChangeSeverity;
    source?: WorldChangeSource;
    message: string;
    gmHint?: string;
    factionId?: string;
    targetFactionId?: string;
    regionId?: string;
    locationId?: string;
    npcIds?: string[];
    mapHighlight?: boolean;
    expiresAfterTurns?: number;
    idSuffix?: string;
}

/**
 * Constructs a validated WorldChangeEvent.
 * The id is auto-generated from worldTurn + category + idSuffix.
 * message is clamped to MAX_EVENT_MESSAGE_LEN.
 */
export function makeWorldChangeEvent(opts: MakeEventOptions): WorldChangeEvent {
    const suffix = opts.idSuffix ?? (opts.factionId ?? opts.regionId ?? opts.locationId ?? 'evt');
    const ev: WorldChangeEvent = {
        id: makeEventId(opts.worldTurn, opts.category, suffix),
        worldTurn: opts.worldTurn,
        source: opts.source ?? 'simulation',
        category: opts.category,
        severity: opts.severity,
        message: opts.message.slice(0, MAX_EVENT_MESSAGE_LEN),
    };
    if (opts.gmHint) { ev.gmHint = opts.gmHint.slice(0, MAX_EVENT_GM_HINT_LEN); }
    if (opts.factionId && isValidEventId(opts.factionId)) { ev.factionId = opts.factionId; }
    if (opts.targetFactionId && isValidEventId(opts.targetFactionId)) { ev.targetFactionId = opts.targetFactionId; }
    if (opts.regionId && isValidEventId(opts.regionId)) { ev.regionId = opts.regionId; }
    if (opts.locationId && isValidEventId(opts.locationId)) { ev.locationId = opts.locationId; }
    if (opts.npcIds) { ev.npcIds = opts.npcIds.filter(isValidEventId).slice(0, MAX_NPC_IDS_PER_EVENT); }
    if (opts.mapHighlight !== undefined) { ev.mapHighlight = opts.mapHighlight; }
    if (opts.expiresAfterTurns !== undefined && opts.expiresAfterTurns > 0) {
        ev.expiresAfterTurns = Math.floor(opts.expiresAfterTurns);
    }
    return ev;
}
