// Pure types and utilities for visual_memory.json (Phase 5a).
// No vscode or fs imports — safe for Node.js test environment.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisualMemoryTag = 'generated' | 'imported' | 'location' | 'npc' | 'scene' | 'other';

export interface VisualMemoryEntry {
    /** Truncated SHA-256 hex of the image file content (first 16 chars = 8 bytes). */
    imageHash: string;
    /** Absolute or workspace-relative path to the source image file. */
    imagePath: string;
    /** VLM-generated description (≤ MAX_DESCRIPTION_CHARS). */
    description: string;
    /** ISO-8601 timestamp when the analysis was performed. */
    analyzedAt: string;
    /** worldTurn at time of creation (if world simulation is enabled). */
    worldTurn?: number;
    /** WorldLocation id the image is associated with. */
    locationId?: string;
    /** ComfyUI / generation prompt used to create this image. */
    generationPrompt?: string;
    /** Free-form classification tags. */
    tags?: VisualMemoryTag[];
}

export interface VisualMemory {
    format: string;
    /** Key: imageHash (16 hex chars). */
    entries: Record<string, VisualMemoryEntry>;
}

// ---------------------------------------------------------------------------
// Safety constants
// ---------------------------------------------------------------------------

export const VISUAL_MEMORY_FORMAT = 'lorerelay-visual-memory/1.0';
export const MAX_DESCRIPTION_CHARS = 1200;
export const MAX_PROMPT_CHARS = 600;
export const MAX_TAGS_PER_ENTRY = 6;
export const MAX_ENTRIES = 500;
export const IMAGE_HASH_LENGTH = 16; // hex chars = 8 bytes of SHA-256

// ---------------------------------------------------------------------------
// Hash key helpers
// ---------------------------------------------------------------------------

const VALID_HASH_RE = /^[0-9a-f]{16}$/;

export function isValidImageHash(h: unknown): h is string {
    return typeof h === 'string' && VALID_HASH_RE.test(h);
}

/**
 * Builds a stable 16-char hex key from a SHA-256 hex string.
 * Pass the full hex digest; this extracts the first IMAGE_HASH_LENGTH chars.
 */
export function makeImageHashKey(sha256Hex: string): string {
    return sha256Hex.slice(0, IMAGE_HASH_LENGTH).toLowerCase();
}

// ---------------------------------------------------------------------------
// Enum sets
// ---------------------------------------------------------------------------

const VALID_TAGS = new Set<VisualMemoryTag>([
    'generated', 'imported', 'location', 'npc', 'scene', 'other',
]);

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function asStr(v: unknown, maxLen: number, fallback?: string): string | undefined {
    if (typeof v !== 'string') { return fallback; }
    return v.slice(0, maxLen) || fallback;
}

function asNumber(v: unknown): number | undefined {
    return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

function parseTags(raw: unknown): VisualMemoryTag[] | undefined {
    if (!Array.isArray(raw)) { return undefined; }
    const tags = raw
        .filter((t): t is VisualMemoryTag => VALID_TAGS.has(t as VisualMemoryTag))
        .slice(0, MAX_TAGS_PER_ENTRY);
    return tags.length > 0 ? tags : undefined;
}

// ---------------------------------------------------------------------------
// Entry parser
// ---------------------------------------------------------------------------

/**
 * Parses a raw object into a VisualMemoryEntry.
 * Returns undefined when required fields are missing or invalid.
 */
export function parseVisualMemoryEntry(raw: unknown): VisualMemoryEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;

    const imageHash = asStr(r.imageHash, IMAGE_HASH_LENGTH + 4); // allow a bit of slack
    if (!imageHash || !isValidImageHash(imageHash)) { return undefined; }

    const imagePath = asStr(r.imagePath, 1000);
    if (!imagePath) { return undefined; }

    const description = asStr(r.description, MAX_DESCRIPTION_CHARS);
    if (!description) { return undefined; }

    const analyzedAt = typeof r.analyzedAt === 'string' ? r.analyzedAt : '';
    if (!analyzedAt) { return undefined; }

    const entry: VisualMemoryEntry = { imageHash, imagePath, description, analyzedAt };

    const worldTurn = asNumber(r.worldTurn);
    if (worldTurn !== undefined) { entry.worldTurn = Math.floor(worldTurn); }

    const locationId = asStr(r.locationId, 64);
    if (locationId) { entry.locationId = locationId; }

    const generationPrompt = asStr(r.generationPrompt, MAX_PROMPT_CHARS);
    if (generationPrompt) { entry.generationPrompt = generationPrompt; }

    const tags = parseTags(r.tags);
    if (tags) { entry.tags = tags; }

    return entry;
}

// ---------------------------------------------------------------------------
// Registry parser
// ---------------------------------------------------------------------------

/**
 * Parses a raw object into a VisualMemory registry.
 * Unknown or malformed entries are silently dropped.
 * Caps at MAX_ENTRIES to prevent unbounded memory.
 */
export function parseVisualMemory(raw: unknown): VisualMemory {
    const empty: VisualMemory = { format: VISUAL_MEMORY_FORMAT, entries: {} };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return empty; }
    const doc = raw as Record<string, unknown>;

    const entries: Record<string, VisualMemoryEntry> = {};
    const rawEntries = doc.entries;
    if (rawEntries && typeof rawEntries === 'object' && !Array.isArray(rawEntries)) {
        let count = 0;
        for (const [key, val] of Object.entries(rawEntries as Record<string, unknown>)) {
            if (count >= MAX_ENTRIES) { break; }
            if (!isValidImageHash(key)) { continue; }
            const entry = parseVisualMemoryEntry(val);
            if (entry) {
                entries[key] = entry;
                count++;
            }
        }
    }

    return { format: VISUAL_MEMORY_FORMAT, entries };
}

// ---------------------------------------------------------------------------
// Mutation helpers (return new objects, no in-place mutation)
// ---------------------------------------------------------------------------

/**
 * Returns a new VisualMemory with the entry added or replaced.
 * If MAX_ENTRIES is already reached, the oldest entry by analyzedAt is evicted.
 */
export function upsertVisualMemoryEntry(
    mem: VisualMemory,
    entry: VisualMemoryEntry
): VisualMemory {
    const entries = { ...mem.entries };
    entries[entry.imageHash] = entry;

    // Evict oldest when over capacity
    const keys = Object.keys(entries);
    if (keys.length > MAX_ENTRIES) {
        const sorted = keys.sort(
            (a, b) => entries[a].analyzedAt.localeCompare(entries[b].analyzedAt)
        );
        delete entries[sorted[0]];
    }

    return { ...mem, entries };
}

/**
 * Builds a VisualMemoryEntry from the parts returned by the VLM pipeline.
 */
export function makeVisualMemoryEntry(opts: {
    imageHash: string;
    imagePath: string;
    description: string;
    worldTurn?: number;
    locationId?: string;
    generationPrompt?: string;
    tags?: VisualMemoryTag[];
}): VisualMemoryEntry {
    const entry: VisualMemoryEntry = {
        imageHash: opts.imageHash,
        imagePath: opts.imagePath,
        description: opts.description.slice(0, MAX_DESCRIPTION_CHARS),
        analyzedAt: new Date().toISOString(),
    };
    if (opts.worldTurn !== undefined) { entry.worldTurn = Math.floor(opts.worldTurn); }
    if (opts.locationId) { entry.locationId = opts.locationId.slice(0, 64); }
    if (opts.generationPrompt) { entry.generationPrompt = opts.generationPrompt.slice(0, MAX_PROMPT_CHARS); }
    if (opts.tags?.length) {
        entry.tags = opts.tags.filter((t) => VALID_TAGS.has(t)).slice(0, MAX_TAGS_PER_ENTRY);
    }
    return entry;
}

/**
 * Builds a compact GM-prompt snippet from an entry.
 * Format: "[Scene: <description>]" (≤ 300 chars trimmed)
 */
export function buildVisualContextSnippet(entry: VisualMemoryEntry): string {
    const desc = entry.description.replace(/\s+/g, ' ').trim().slice(0, 280);
    const locSuffix = entry.locationId ? ` @${entry.locationId}` : '';
    return `[Scene${locSuffix}]: ${desc}`;
}
