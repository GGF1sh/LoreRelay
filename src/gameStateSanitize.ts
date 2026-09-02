/** Clamp/normalize game_state before disk write (direct GM bridges, checkpoint edits). */

import { isValidEntryId } from './entryId';
import { CURRENT_SCHEMA_VERSION, migrateGameState } from './migrateGameState';

export const MAX_STATUS_ARRAY_ITEMS = 100;
export const MAX_STATUS_ITEM_LEN = 200;
export const MAX_STATUS_FIELD_STR = 500;
export const MAX_HIDDEN_DICE_ITEMS = 20;
export const MAX_OPTIONS_ITEMS = 12;
export const MAX_OPTION_LEN = 500;
export const MAX_ENTRY_CONTENT_LEN = 50_000;

function finiteNonNegative(n: unknown, fallback: number): number {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
        return fallback;
    }
    return Math.floor(n);
}

function clampString(value: unknown, maxLen: number): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    return value.slice(0, maxLen);
}

function clampStringArray(arr: unknown, maxItems: number, maxItemLen: number): string[] | undefined {
    if (!Array.isArray(arr)) {
        return undefined;
    }
    return arr
        .filter((item) => typeof item === 'string')
        .slice(0, maxItems)
        .map((item) => (item as string).slice(0, maxItemLen));
}

function sanitizeStatusBar(bar: unknown): { current: number; max: number } | undefined {
    if (typeof bar !== 'object' || bar === null) {
        return undefined;
    }
    const b = bar as Record<string, unknown>;
    let max = finiteNonNegative(b.max, 1);
    if (max < 1) {
        max = 1;
    }
    let current = finiteNonNegative(b.current, max);
    if (current > max) {
        current = max;
    }
    return { current, max };
}

function sanitizeHiddenDice(raw: unknown): Array<Record<string, unknown>> | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const out: Array<Record<string, unknown>> = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) {
            continue;
        }
        const hd = item as Record<string, unknown>;
        if (typeof hd.notation !== 'string') {
            continue;
        }
        const entry: Record<string, unknown> = {
            notation: hd.notation.slice(0, 120),
        };
        if (typeof hd.id === 'string' && hd.id.trim()) {
            entry.id = hd.id.trim().slice(0, 64);
        }
        if (typeof hd.purpose === 'string') {
            entry.purpose = hd.purpose.slice(0, 200);
        }
        out.push(entry);
        if (out.length >= MAX_HIDDEN_DICE_ITEMS) {
            break;
        }
    }
    return out.length > 0 ? out : undefined;
}

/** Best-effort normalization so corrupt LLM output cannot break Webview sync. */
export function sanitizeGameStateForPersist(state: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...state };

    if (Array.isArray(out.entries)) {
        out.entries = (out.entries as unknown[]).map((entry) => {
            if (typeof entry !== 'object' || entry === null) {
                return entry;
            }
            const e = { ...(entry as Record<string, unknown>) };
            if (typeof e.content === 'string') {
                e.content = e.content.slice(0, MAX_ENTRY_CONTENT_LEN);
            }
            return e;
        });
    }

    if (out.status && typeof out.status === 'object' && out.status !== null) {
        const status = { ...(out.status as Record<string, unknown>) };
        for (const bar of ['hp', 'mp'] as const) {
            const sanitized = sanitizeStatusBar(status[bar]);
            if (sanitized) {
                status[bar] = sanitized;
            } else if (status[bar] !== undefined) {
                delete status[bar];
            }
        }
        for (const field of ['location', 'time', 'funds'] as const) {
            const s = clampString(status[field], MAX_STATUS_FIELD_STR);
            if (s !== undefined) {
                status[field] = s;
            } else if (status[field] !== undefined) {
                delete status[field];
            }
        }
        for (const field of ['condition', 'inventory', 'skills'] as const) {
            const arr = clampStringArray(status[field], MAX_STATUS_ARRAY_ITEMS, MAX_STATUS_ITEM_LEN);
            if (arr !== undefined) {
                status[field] = arr;
            } else if (status[field] !== undefined) {
                delete status[field];
            }
        }
        out.status = status;
    }

    const hiddenDice = sanitizeHiddenDice(out.hiddenDice);
    if (hiddenDice) {
        out.hiddenDice = hiddenDice;
    } else if (out.hiddenDice !== undefined) {
        delete out.hiddenDice;
    }

    if (Array.isArray(out.options)) {
        out.options = clampStringArray(out.options, MAX_OPTIONS_ITEMS, MAX_OPTION_LEN) ?? [];
    }

    for (const field of ['summary', 'theme', 'bgm', 'mood'] as const) {
        const s = clampString(out[field], MAX_ENTRY_CONTENT_LEN);
        if (s !== undefined) {
            out[field] = s;
        }
    }

    return out;
}

const ALLOWED_ENTRY_ROLES = new Set(['gm', 'user']);

function salvageEntry(raw: unknown): Record<string, unknown> | undefined {
    if (typeof raw !== 'object' || raw === null) {
        return undefined;
    }
    const e = raw as Record<string, unknown>;
    if (!isValidEntryId(e.id)) {
        return undefined;
    }
    const role = typeof e.role === 'string' && ALLOWED_ENTRY_ROLES.has(e.role) ? e.role : 'gm';
    const out: Record<string, unknown> = {
        id: e.id,
        role,
        sender: typeof e.sender === 'string' ? e.sender.slice(0, 120) : (role === 'user' ? 'Player' : 'GM'),
        content: typeof e.content === 'string' ? e.content.slice(0, MAX_ENTRY_CONTENT_LEN) : '',
    };
    for (const field of ['image', 'imagePrompt', 'editedAt'] as const) {
        const s = clampString(e[field], MAX_ENTRY_CONTENT_LEN);
        if (s !== undefined) {
            out[field] = s;
        }
    }
    if (typeof e.imageBlocked === 'boolean') {
        out.imageBlocked = e.imageBlocked;
    }
    if (typeof e.excludedFromPrompt === 'boolean') {
        out.excludedFromPrompt = e.excludedFromPrompt;
    }
    if (isValidEntryId(e.speakerNpcId)) {
        out.speakerNpcId = e.speakerNpcId;
    }
    return out;
}

/**
 * Best-effort recovery for corrupt or legacy game_state.json on load.
 * Drops invalid entries/fields, migrates schema, then clamps for persist.
 */
export function salvageGameStateFromUnknown(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null;
    }
    const { state: migrated } = migrateGameState(raw as Record<string, unknown>);
    const base: Record<string, unknown> = { ...migrated };

    const salvagedEntries: Record<string, unknown>[] = [];
    if (Array.isArray(base.entries)) {
        for (const entry of base.entries as unknown[]) {
            const salvaged = salvageEntry(entry);
            if (salvaged) {
                salvagedEntries.push(salvaged);
            }
        }
    }
    base.entries = salvagedEntries;

    if (!Number.isInteger(base.schemaVersion)) {
        base.schemaVersion = CURRENT_SCHEMA_VERSION;
    }

    if (base.options !== undefined && !Array.isArray(base.options)) {
        delete base.options;
    }

    if (base.status !== undefined && (typeof base.status !== 'object' || base.status === null)) {
        delete base.status;
    }

    for (const field of ['theme', 'bgm', 'mood', 'latestImage', 'background', 'summary'] as const) {
        if (base[field] !== undefined && typeof base[field] !== 'string') {
            delete base[field];
        }
    }

    return sanitizeGameStateForPersist(base);
}