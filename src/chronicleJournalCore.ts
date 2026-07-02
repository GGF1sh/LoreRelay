// F1 Chronicle: safe NDJSON journal parsing (no vscode/fs).

import type {
    CartographyReveal,
    CartographyRevealStrength,
    DiceLedgerEntry,
    StatePatchOp
} from './types/TurnResult';

export const MAX_JOURNAL_PARSE_LINES = 500;
export const MAX_JOURNAL_LINE_BYTES = 256 * 1024;

export interface JournalTurnLike {
    turnId?: string;
    playerAction?: string;
    statePatch?: StatePatchOp[];
    resolvedQuests?: string[];
    cartographyReveal?: CartographyReveal;
    elapsedWorldTurns?: number;
    diceLedger?: DiceLedgerEntry[];
    appliedAt?: string;
}

function asString(v: unknown, maxLen: number): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const trimmed = v.trim();
    if (!trimmed) { return undefined; }
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function asNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function parseStatePatchOps(raw: unknown): StatePatchOp[] | undefined {
    if (!Array.isArray(raw)) { return undefined; }
    const ops: StatePatchOp[] = [];
    for (const item of raw.slice(0, 200)) {
        if (!item || typeof item !== 'object') { continue; }
        const doc = item as Record<string, unknown>;
        const op = doc.op;
        const patchPath = doc.path;
        if (
            (op === 'replace' || op === 'add' || op === 'remove')
            && typeof patchPath === 'string'
            && patchPath.length > 0
            && patchPath.length <= 200
        ) {
            ops.push({
                op,
                path: patchPath,
                value: doc.value
            });
        }
    }
    return ops.length > 0 ? ops : undefined;
}

function parseDiceLedger(raw: unknown): DiceLedgerEntry[] | undefined {
    if (!Array.isArray(raw)) { return undefined; }
    const entries: DiceLedgerEntry[] = [];
    for (const item of raw.slice(0, 50)) {
        if (!item || typeof item !== 'object') { continue; }
        const doc = item as Record<string, unknown>;
        const formula = asString(doc.formula, 64);
        const rolls = Array.isArray(doc.rolls)
            ? doc.rolls.filter((r): r is number => typeof r === 'number' && Number.isFinite(r)).slice(0, 20)
            : [];
        const total = asNumber(doc.total);
        if (!formula || total === undefined) { continue; }
        entries.push({
            formula,
            rolls,
            modifier: asNumber(doc.modifier) ?? 0,
            total,
            reason: asString(doc.reason, 120),
            dc: asNumber(doc.dc),
            success: typeof doc.success === 'boolean' ? doc.success : undefined
        });
    }
    return entries.length > 0 ? entries : undefined;
}

function parseCartographyReveal(raw: unknown): CartographyReveal | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const regions = Array.isArray(doc.regions)
        ? doc.regions
            .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
            .map((r) => {
                const strength: CartographyRevealStrength | undefined =
                    r.strength === 'discovered' || r.strength === 'rumored' ? r.strength : undefined;
                return {
                    regionId: asString(r.regionId, 64) ?? '',
                    strength,
                    source: asString(r.source, 120)
                };
            })
            .filter((r) => r.regionId.length > 0)
            .slice(0, 20)
        : undefined;
    if (!regions?.length) { return undefined; }
    return { regions };
}

/** Parse one NDJSON journal line. Returns undefined for empty or invalid lines. */
export function parseJournalLine(line: string): JournalTurnLike | undefined {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > MAX_JOURNAL_LINE_BYTES) { return undefined; }
    let doc: unknown;
    try {
        doc = JSON.parse(trimmed);
    } catch {
        return undefined;
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { return undefined; }
    const raw = doc as Record<string, unknown>;
    const turn: JournalTurnLike = {};
    const turnId = asString(raw.turnId, 128);
    if (turnId) { turn.turnId = turnId; }
    const playerAction = asString(raw.playerAction, 4000);
    if (playerAction) { turn.playerAction = playerAction; }
    const statePatch = parseStatePatchOps(raw.statePatch);
    if (statePatch) { turn.statePatch = statePatch; }
    if (Array.isArray(raw.resolvedQuests)) {
        const resolved = raw.resolvedQuests
            .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64)
            .slice(0, 20);
        if (resolved.length > 0) { turn.resolvedQuests = resolved; }
    }
    const cartographyReveal = parseCartographyReveal(raw.cartographyReveal);
    if (cartographyReveal) { turn.cartographyReveal = cartographyReveal; }
    const elapsed = asNumber(raw.elapsedWorldTurns);
    if (elapsed !== undefined && elapsed > 0) { turn.elapsedWorldTurns = Math.floor(elapsed); }
    const diceLedger = parseDiceLedger(raw.diceLedger);
    if (diceLedger) { turn.diceLedger = diceLedger; }
    const appliedAt = asString(raw.appliedAt, 64);
    if (appliedAt) { turn.appliedAt = appliedAt; }
    if (
        !turn.turnId
        && !turn.playerAction
        && !turn.statePatch
        && !turn.resolvedQuests
        && !turn.cartographyReveal
        && !turn.elapsedWorldTurns
        && !turn.diceLedger
    ) {
        return undefined;
    }
    return turn;
}

/**
 * Parse journal NDJSON content line-by-line.
 * Skips blank/invalid lines; keeps the most recent maxLines entries.
 */
export function parseJournalNdjsonContent(
    raw: string,
    maxLines: number = MAX_JOURNAL_PARSE_LINES
): JournalTurnLike[] {
    const cap = Math.max(0, Math.min(MAX_JOURNAL_PARSE_LINES, Math.floor(maxLines)));
    if (!raw || cap === 0) { return []; }
    const turns: JournalTurnLike[] = [];
    const lines = raw.split('\n');
    for (const line of lines) {
        const parsed = parseJournalLine(line);
        if (parsed) {
            turns.push(parsed);
            if (turns.length > cap) {
                turns.shift();
            }
        }
    }
    return turns;
}