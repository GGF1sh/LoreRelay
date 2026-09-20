/** Pure lorebook matching logic — no vscode dependency; importable in Node tests. */

/** Max regex pattern length before falling back to substring (ReDoS guard). */
const MAX_REGEX_PATTERN_LEN = 200;
/** Cap context scanned by regex (limits catastrophic backtracking cost). */
const MAX_REGEX_TEST_TEXT_LEN = 8000;
/** Cap lorebook entries scanned per turn (prevents O(n) blow-up on huge books). */
export const MAX_LOREBOOK_ENTRIES_SCAN = 2000;

function isQuantifierStart(pattern: string, index: number): number {
    const ch = pattern[index];
    if (ch === '*' || ch === '+' || ch === '?') {
        return 1;
    }
    if (ch === '{') {
        const close = pattern.indexOf('}', index);
        if (close > index) {
            return close - index + 1;
        }
    }
    return 0;
}

function scanCharClass(pattern: string, index: number): number {
    let i = index + 1;
    if (i < pattern.length && pattern[i] === '^') {
        i++;
    }
    while (i < pattern.length) {
        if (pattern[i] === '\\') {
            i += 2;
            continue;
        }
        if (pattern[i] === ']') {
            return i + 1;
        }
        i++;
    }
    return pattern.length;
}

function findGroupEnd(pattern: string, openIndex: number): number {
    let depth = 1;
    let i = openIndex + 1;
    while (i < pattern.length && depth > 0) {
        if (pattern[i] === '\\') {
            i += 2;
            continue;
        }
        if (pattern[i] === '[') {
            i = scanCharClass(pattern, i);
            continue;
        }
        if (pattern[i] === '(') {
            depth++;
            i++;
            continue;
        }
        if (pattern[i] === ')') {
            depth--;
            i++;
            continue;
        }
        i++;
    }
    return i;
}

function groupBodyFlags(pattern: string, start: number, end: number): { hasQuantifier: boolean; hasAlternation: boolean } {
    let hasQuantifier = false;
    let hasAlternation = false;
    let i = start;
    while (i < end) {
        if (pattern[i] === '\\') {
            i += 2;
            const escapedQ = isQuantifierStart(pattern, i);
            if (escapedQ > 0) {
                hasQuantifier = true;
                i += escapedQ;
            }
            continue;
        }
        if (pattern[i] === '|') {
            hasAlternation = true;
            i++;
            continue;
        }
        if (pattern[i] === '[') {
            i = scanCharClass(pattern, i);
            const q = isQuantifierStart(pattern, i);
            if (q > 0) {
                hasQuantifier = true;
                i += q;
            }
            continue;
        }
        if (pattern[i] === '(') {
            const close = findGroupEnd(pattern, i);
            const inner = groupBodyFlags(pattern, i + 1, close - 1);
            hasQuantifier = hasQuantifier || inner.hasQuantifier;
            hasAlternation = hasAlternation || inner.hasAlternation;
            i = close;
            const q = isQuantifierStart(pattern, i);
            if (q > 0) {
                hasQuantifier = true;
                i += q;
            }
            continue;
        }
        i++;
        const q = isQuantifierStart(pattern, i);
        if (q > 0) {
            hasQuantifier = true;
            i += q;
        }
    }
    return { hasQuantifier, hasAlternation };
}

function groupBodyStart(pattern: string, openIndex: number): number {
    let start = openIndex + 1;
    if (pattern[start] === '?' && start + 1 < pattern.length) {
        const spec = pattern[start + 1];
        if (spec === ':') {
            return start + 2;
        }
        if (spec === '=' || spec === '!') {
            return start + 2;
        }
        if (spec === '<' && start + 2 < pattern.length) {
            const next = pattern[start + 2];
            if (next === '=' || next === '!') {
                return start + 3;
            }
        }
    }
    return start;
}

/**
 * Escape-aware ReDoS guard for ST-imported lorebook regex keys.
 * Flags nested/grouped quantifiers and alternation groups with outer quantifiers.
 */
export function isPotentiallyEvilRegex(pattern: string): boolean {
    if (/[+*?]\s*[+*?{]/.test(pattern)) {
        return true;
    }
    if (/(?:\.\s*[+*?]|\.\s*\{[^}]+\}){3,}/.test(pattern)) {
        return true;
    }

    let i = 0;
    while (i < pattern.length) {
        if (pattern[i] === '\\') {
            i += 2;
            continue;
        }
        if (pattern[i] === '[') {
            i = scanCharClass(pattern, i);
            const q = isQuantifierStart(pattern, i);
            if (q > 0) {
                i += q;
            }
            continue;
        }
        if (pattern[i] === '(') {
            const bodyStart = groupBodyStart(pattern, i);
            const close = findGroupEnd(pattern, i);
            const body = groupBodyFlags(pattern, bodyStart, close - 1);
            if (body.hasQuantifier || body.hasAlternation) {
                let j = close;
                while (j < pattern.length && /\s/.test(pattern[j])) {
                    j++;
                }
                if (isQuantifierStart(pattern, j) > 0) {
                    return true;
                }
            }
            i = close;
            const q = isQuantifierStart(pattern, i);
            if (q > 0) {
                i += q;
            }
            continue;
        }
        if (pattern[i] === '.') {
            i++;
            const q = isQuantifierStart(pattern, i);
            if (q > 0) {
                i += q;
            }
            continue;
        }
        i++;
        const q = isQuantifierStart(pattern, i);
        if (q > 0) {
            i += q;
        }
    }
    return false;
}

export interface LorebookEntry {
    id?: string;
    keys?: string[];
    secondary_keys?: string[];
    content?: string;
    comment?: string;
    priority?: number;
    /** ST World Info insertion order. Higher value = higher priority (earlier in prompt). */
    insertion_order?: number;
    enabled?: boolean;
    /** When true, keys are interpreted as JavaScript regular expressions. */
    use_regex?: boolean;
    /** When true, entry is always injected into GM context (v0.5e). */
    pinned?: boolean;
}

/**
 * Test a single key string against context text.
 * - useRegex=false: case-insensitive substring match
 * - useRegex=true : compile as /pattern/flags or bare pattern with 'i' flag,
 *                   fall back to substring on malformed or suspicious regex
 */
function matchKey(key: string, text: string, textLower: string, useRegex: boolean): boolean {
    const k = key.trim();
    if (!k) {
        return false;
    }
    if (useRegex) {
        if (k.length > MAX_REGEX_PATTERN_LEN) {
            return textLower.includes(k.toLowerCase());
        }
        const m = k.match(/^\/(.+)\/([gimsuy]*)$/s);
        const patternBody = m ? m[1] : k;
        if (isPotentiallyEvilRegex(patternBody)) {
            return textLower.includes(k.toLowerCase());
        }
        const scanText = text.length > MAX_REGEX_TEST_TEXT_LEN ? text.slice(0, MAX_REGEX_TEST_TEXT_LEN) : text;
        try {
            const re = m ? new RegExp(m[1], m[2] || 'i') : new RegExp(k, 'i');
            return re.test(scanText);
        } catch {
            return textLower.includes(k.toLowerCase());
        }
    }
    return textLower.includes(k.toLowerCase());
}

/**
 * Match lorebook entries against a context string.
 *
 * Matching rules (ST-compatible MVP):
 *  1. At least one primary key must match (substring or regex).
 *  2. If secondary_keys is non-empty, at least one secondary key must also match (AND logic).
 *  3. Results are sorted by insertion_order ?? priority ?? 0 descending (highest first).
 *  4. At most maxEntries results are returned.
 */
export function matchEntriesAgainstText(
    entries: LorebookEntry[],
    text: string,
    maxEntries = 5
): LorebookEntry[] {
    const textLower = text.toLowerCase();
    const hits: Array<{ sortKey: number; entry: LorebookEntry }> = [];

    for (const entry of entries.slice(0, MAX_LOREBOOK_ENTRIES_SCAN)) {
        const useRegex = entry.use_regex === true;
        const primaryKeys = entry.keys || [];

        const primaryHit = primaryKeys.some((k) =>
            matchKey(String(k), text, textLower, useRegex)
        );
        if (!primaryHit) {
            continue;
        }

        const secondaryKeys = entry.secondary_keys || [];
        if (secondaryKeys.length > 0) {
            const secondaryHit = secondaryKeys.some((k) =>
                matchKey(String(k), text, textLower, useRegex)
            );
            if (!secondaryHit) {
                continue;
            }
        }

        const sortKey = entry.insertion_order ?? entry.priority ?? 0;
        hits.push({ sortKey, entry });
    }

    hits.sort((a, b) => b.sortKey - a.sortKey);
    return hits.slice(0, maxEntries).map((h) => h.entry);
}