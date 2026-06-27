import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    type VisualMemory,
    type VisualMemoryEntry,
    parseVisualMemory,
    upsertVisualMemoryEntry,
    makeImageHashKey,
    isValidImageHash,
} from './visualMemoryCore';

export type { VisualMemory, VisualMemoryEntry };

const VISUAL_MEMORY_FILENAME = 'visual_memory.json';
const MAX_IMAGE_HASH_READ_BYTES = 4 * 1024 * 1024; // 4 MB cap for hashing

// ---------------------------------------------------------------------------
// mtime-based cache
// ---------------------------------------------------------------------------

let cachePath = '';
let cacheMtime = 0;
let cachedMemory: VisualMemory | undefined;

function getVisualMemoryPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, VISUAL_MEMORY_FILENAME) : undefined;
}

export function clearVisualMemoryCache(): void {
    cachedMemory = undefined;
    cachePath = '';
    cacheMtime = 0;
}

export function loadVisualMemory(): VisualMemory {
    const memPath = getVisualMemoryPath();
    if (!memPath || !fs.existsSync(memPath)) {
        return { format: 'lorerelay-visual-memory/1.0', entries: {} };
    }
    try {
        const mtime = fs.statSync(memPath).mtimeMs;
        if (memPath === cachePath && mtime === cacheMtime && cachedMemory) {
            return cachedMemory;
        }
        const raw = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
        const parsed = parseVisualMemory(raw);
        cachePath = memPath;
        cacheMtime = mtime;
        cachedMemory = parsed;
        return parsed;
    } catch {
        return { format: 'lorerelay-visual-memory/1.0', entries: {} };
    }
}

function saveVisualMemory(mem: VisualMemory): void {
    const memPath = getVisualMemoryPath();
    if (!memPath) { return; }
    writeJsonAtomic(memPath, mem);
    cachedMemory = mem;
    cachePath = memPath;
    try { cacheMtime = fs.statSync(memPath).mtimeMs; } catch { cacheMtime = 0; }
}

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

/**
 * Computes the stable 16-char hex hash key for an image file.
 * Reads at most MAX_IMAGE_HASH_READ_BYTES to avoid hashing huge files.
 * Returns null when the file does not exist or cannot be read.
 */
export function hashImageFile(imagePath: string): string | null {
    try {
        if (!fs.existsSync(imagePath)) { return null; }
        const stat = fs.statSync(imagePath);
        if (stat.size <= 0) { return null; }

        const fd = fs.openSync(imagePath, 'r');
        const buf = Buffer.alloc(Math.min(stat.size, MAX_IMAGE_HASH_READ_BYTES));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);

        const hex = crypto.createHash('sha256').update(buf).digest('hex');
        return makeImageHashKey(hex);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the cached VLM description for an image path, or undefined if not yet analyzed.
 */
export function getCachedDescription(imagePath: string): string | undefined {
    const hash = hashImageFile(imagePath);
    if (!hash) { return undefined; }
    return loadVisualMemory().entries[hash]?.description;
}

/**
 * Looks up a VisualMemoryEntry by image path.
 */
export function getVisualMemoryEntry(imagePath: string): VisualMemoryEntry | undefined {
    const hash = hashImageFile(imagePath);
    if (!hash) { return undefined; }
    return loadVisualMemory().entries[hash];
}

/**
 * Stores a VLM analysis result in visual_memory.json.
 */
export function storeVisualMemoryEntry(entry: VisualMemoryEntry): void {
    if (!isValidImageHash(entry.imageHash)) { return; }
    const mem = loadVisualMemory();
    const updated = upsertVisualMemoryEntry(mem, entry);
    saveVisualMemory(updated);
}

/**
 * Returns all entries that match a given locationId.
 */
export function getEntriesByLocation(locationId: string): VisualMemoryEntry[] {
    const mem = loadVisualMemory();
    return Object.values(mem.entries).filter((e) => e.locationId === locationId);
}

/**
 * Checks whether a given imagePath already has a cached analysis.
 */
export function isImageAnalyzed(imagePath: string): boolean {
    return getCachedDescription(imagePath) !== undefined;
}
