/** Pure lorebook matching logic — no vscode dependency; importable in Node tests. */

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
 *                   fall back to substring on malformed regex
 */
function matchKey(key: string, text: string, textLower: string, useRegex: boolean): boolean {
    const k = key.trim();
    if (!k) {
        return false;
    }
    if (useRegex) {
        try {
            const m = k.match(/^\/(.+)\/([gimsuy]*)$/s);
            const re = m ? new RegExp(m[1], m[2] || 'i') : new RegExp(k, 'i');
            return re.test(text);
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

    for (const entry of entries) {
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
