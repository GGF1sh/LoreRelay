// Pure tavern card parsing utilities — no vscode or fs imports; Node-testable.

export type { CharacterBookEntry } from './types/Character';
import type { CharacterBook, CharacterBookEntry } from './types/Character';

// ---------------------------------------------------------------------------
// PNG tEXt/iTEXt extraction
// ---------------------------------------------------------------------------

const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';
const CHARA_KEYWORDS = new Set(['chara', 'ccv3']);

/**
 * Extracts Base64-embedded JSON from a Tavern PNG card.
 * Supports tEXt (V1/V2) and iTEXt (some newer tools) chunks.
 * Keywords: 'chara' (V1/V2) or 'ccv3' (V3).
 */
export function extractJsonFromPng(buffer: Buffer): string | null {
    if (buffer.length < 8) {
        return null;
    }
    if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE_HEX) {
        return null;
    }

    let offset = 8;
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) { break; }
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const chunkEnd = offset + 8 + length;
        const nextOffset = chunkEnd + 4;
        if (chunkEnd > buffer.length || nextOffset > buffer.length) { break; }

        if (type === 'tEXt') {
            const data = buffer.subarray(offset + 8, chunkEnd);
            const nullIdx = data.indexOf(0);
            if (nullIdx !== -1) {
                const keyword = data.toString('latin1', 0, nullIdx);
                if (CHARA_KEYWORDS.has(keyword)) {
                    try {
                        const text = data.toString('latin1', nullIdx + 1);
                        return Buffer.from(text, 'base64').toString('utf8');
                    } catch {
                        // try next chunk
                    }
                }
            }
        } else if (type === 'iTEXt') {
            const data = buffer.subarray(offset + 8, chunkEnd);
            const nullIdx = data.indexOf(0);
            if (nullIdx !== -1) {
                const keyword = data.toString('utf8', 0, nullIdx);
                if (CHARA_KEYWORDS.has(keyword)) {
                    try {
                        let textStart = nullIdx + 3; // skip \0 + compressionFlag + compressionMethod
                        const lang0 = data.indexOf(0, textStart);
                        if (lang0 === -1) { break; }
                        textStart = lang0 + 1;
                        const tk0 = data.indexOf(0, textStart);
                        if (tk0 === -1) { break; }
                        textStart = tk0 + 1;
                        const text = data.toString('utf8', textStart);
                        const decoded = Buffer.from(text, 'base64').toString('utf8');
                        if (decoded.trimStart().startsWith('{')) {
                            return decoded;
                        }
                    } catch {
                        // try next chunk
                    }
                }
            }
        }

        offset = nextOffset;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Character book normalization
// ---------------------------------------------------------------------------

export const MAX_LOREBOOK_ENTRIES = 200;
export const MAX_LOREBOOK_CONTENT_LEN = 4000;
export const MAX_LOREBOOK_KEY_LEN = 200;
export const MAX_KEYS_PER_ENTRY = 20;

/**
 * Normalize character_book entries from ST V2 format to a flat LorebookEntry array.
 * ST stores entries as either an array or an object keyed by numeric string.
 * Caps at MAX_LOREBOOK_ENTRIES; truncates oversized content/keys.
 */
export function normalizeCharacterBook(book: CharacterBook): CharacterBookEntry[] {
    const raw = Array.isArray(book.entries)
        ? book.entries
        : Object.values(book.entries);

    return (raw as unknown[])
        .slice(0, MAX_LOREBOOK_ENTRIES)
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e, idx): CharacterBookEntry => ({
            id: typeof e.id === 'number' || typeof e.id === 'string' ? e.id : idx,
            keys: Array.isArray(e.keys)
                ? (e.keys as unknown[])
                    .filter((k): k is string => typeof k === 'string')
                    .slice(0, MAX_KEYS_PER_ENTRY)
                    .map((k) => k.slice(0, MAX_LOREBOOK_KEY_LEN))
                : [],
            secondary_keys: Array.isArray(e.secondary_keys)
                ? (e.secondary_keys as unknown[])
                    .filter((k): k is string => typeof k === 'string')
                    .slice(0, MAX_KEYS_PER_ENTRY)
                    .map((k) => k.slice(0, MAX_LOREBOOK_KEY_LEN))
                : [],
            content: typeof e.content === 'string' ? e.content.slice(0, MAX_LOREBOOK_CONTENT_LEN) : '',
            enabled: e.enabled !== false,
            insertion_order: typeof e.insertion_order === 'number' ? e.insertion_order : 100,
            ...(typeof e.priority === 'number' ? { priority: e.priority } : {}),
            ...(typeof e.comment === 'string' && e.comment ? { comment: e.comment.slice(0, 200) } : {}),
            ...(e.use_regex === true ? { use_regex: true } : {}),
            ...(e.extensions && typeof e.extensions === 'object'
                ? { extensions: e.extensions as Record<string, unknown> }
                : {}),
        }));
}
