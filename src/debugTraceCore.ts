// Debug Trace P1: pure structured trace vocabulary + bounded ring buffer (no I/O).

export const DEBUG_TRACE_ENTRY_VERSION = 1 as const;
export const DEBUG_TRACE_BUFFER_VERSION = 1 as const;

export const MAX_DEBUG_TRACE_ID_CHARS = 96;
export const MAX_DEBUG_TRACE_MESSAGE_CHARS = 500;
export const MAX_DEBUG_TRACE_SCALAR_STRING_CHARS = 120;
export const MAX_DEBUG_TRACE_CONDITIONS = 24;
export const MAX_DEBUG_TRACE_REFS = 32;
export const MIN_DEBUG_TRACE_BUFFER_ENTRIES = 1;
export const MAX_DEBUG_TRACE_BUFFER_ENTRIES = 1000;
/** Default ring size for debug sessions (bulk sim can emit ~40 entries/step). */
export const DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES = 512;
export const MAX_DEBUG_TRACE_APPEND_WARNINGS = 16;
/** Retention tombstones for evicted parents — bounded, not unbounded history. */
export const MAX_DEBUG_TRACE_EVICTED_KEYS = 128;

/** player_safe: Webview may expose rows to players — sanitize message/refs before emitting. */
export const DEBUG_TRACE_AUDIENCES = ['internal', 'gm_safe', 'player_safe'] as const;
export type DebugTraceAudience = (typeof DEBUG_TRACE_AUDIENCES)[number];

export const DEBUG_TRACE_PHASES = [
    'input',
    'query',
    'decision',
    'effect',
    'event',
    'persist',
    'prompt',
    'warning',
] as const;
export type DebugTracePhase = (typeof DEBUG_TRACE_PHASES)[number];

export const DEBUG_TRACE_REF_KINDS = [
    'event',
    'npc',
    'faction',
    'location',
    'ledger',
    'rule',
    'vehicle',
    'settlement',
    'world',
    'other',
] as const;
export type DebugTraceRefKind = (typeof DEBUG_TRACE_REF_KINDS)[number];

export interface DebugTraceRef {
    kind: DebugTraceRefKind;
    id: string;
}

export interface DebugTraceCondition {
    label: string;
    result: boolean;
    actual?: string | number | boolean;
    expected?: string | number | boolean;
}

export interface DebugTraceEntry {
    version: typeof DEBUG_TRACE_ENTRY_VERSION;
    runId: string;
    traceId: string;
    parentTraceId?: string;
    worldTurn?: number;
    gmTurn?: number;
    subsystem: string;
    phase: DebugTracePhase;
    ruleId?: string;
    decision?: string;
    message: string;
    inputRefs?: DebugTraceRef[];
    outputRefs?: DebugTraceRef[];
    conditions?: DebugTraceCondition[];
    audience: DebugTraceAudience;
}

export interface DebugTraceBuffer {
    version: typeof DEBUG_TRACE_BUFFER_VERSION;
    maxEntries: number;
    entries: DebugTraceEntry[];
    /** `${runId}:${traceId}` keys dropped by ring-buffer retention (not structural corruption). */
    evictedTraceKeys?: string[];
}

export interface DebugTraceWarning {
    code: string;
    message: string;
    traceId?: string;
    runId?: string;
}

/** Composite primary key for trace entries — traceId alone is not unique across runs. */
export function traceEntryKey(runId: string, traceId: string): string {
    return `${runId}:${traceId}`;
}

export interface DebugTraceAppendResult {
    buffer: DebugTraceBuffer;
    accepted: number;
    rejected: number;
    warnings: DebugTraceWarning[];
}

const ENTRY_ALLOWED_KEYS = new Set([
    'version',
    'runId',
    'traceId',
    'parentTraceId',
    'worldTurn',
    'gmTurn',
    'subsystem',
    'phase',
    'ruleId',
    'decision',
    'message',
    'inputRefs',
    'outputRefs',
    'conditions',
    'audience',
]);

function pushWarning(
    warnings: DebugTraceWarning[],
    warning: DebugTraceWarning
): void {
    if (warnings.length >= MAX_DEBUG_TRACE_APPEND_WARNINGS) {
        return;
    }
    warnings.push(warning);
}

function clampBufferMax(maxEntries: unknown): number {
    const n = typeof maxEntries === 'number' && Number.isFinite(maxEntries)
        ? Math.floor(maxEntries)
        : DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES;
    return Math.min(MAX_DEBUG_TRACE_BUFFER_ENTRIES, Math.max(MIN_DEBUG_TRACE_BUFFER_ENTRIES, n));
}

function boundedId(value: unknown, field: string, warnings: DebugTraceWarning[]): string | undefined {
    if (typeof value !== 'string') {
        pushWarning(warnings, {
            code: 'invalid_field',
            message: `${field} must be a string.`,
        });
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        pushWarning(warnings, {
            code: 'invalid_field',
            message: `${field} must be non-empty.`,
        });
        return undefined;
    }
    if (trimmed.length > MAX_DEBUG_TRACE_ID_CHARS) {
        pushWarning(warnings, {
            code: 'field_too_long',
            message: `${field} exceeds ${MAX_DEBUG_TRACE_ID_CHARS} chars.`,
        });
        return undefined;
    }
    return trimmed;
}

function optionalBoundedId(
    value: unknown,
    field: string,
    warnings: DebugTraceWarning[],
    traceId?: string
): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const parsed = boundedId(value, field, warnings);
    if (parsed === undefined) {
        if (traceId) {
            warnings[warnings.length - 1] = {
                ...warnings[warnings.length - 1],
                traceId,
            };
        }
    }
    return parsed;
}

function optionalNonNegativeInt(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }
    const n = Math.floor(value);
    return n >= 0 ? n : undefined;
}

function clampScalarString(value: string): string {
    if (value.length <= MAX_DEBUG_TRACE_SCALAR_STRING_CHARS) {
        return value;
    }
    return value.slice(0, MAX_DEBUG_TRACE_SCALAR_STRING_CHARS);
}

function parseScalar(value: unknown): string | number | boolean | undefined {
    if (typeof value === 'string') {
        return clampScalarString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return undefined;
}

function parseDebugTraceRef(raw: unknown): DebugTraceRef | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    const kind = typeof doc.kind === 'string' ? doc.kind : '';
    if (!(DEBUG_TRACE_REF_KINDS as readonly string[]).includes(kind)) {
        return undefined;
    }
    const id = typeof doc.id === 'string' ? doc.id.trim() : '';
    if (!id || id.length > MAX_DEBUG_TRACE_ID_CHARS) {
        return undefined;
    }
    return { kind: kind as DebugTraceRefKind, id };
}

function parseDebugTraceRefs(raw: unknown, field: string): DebugTraceRef[] | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const refs: DebugTraceRef[] = [];
    for (const item of raw) {
        if (refs.length >= MAX_DEBUG_TRACE_REFS) {
            break;
        }
        const parsed = parseDebugTraceRef(item);
        if (parsed) {
            refs.push(parsed);
        }
    }
    return refs.length > 0 ? refs : undefined;
}

function parseDebugTraceCondition(raw: unknown): DebugTraceCondition | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    const label = typeof doc.label === 'string' ? doc.label.trim() : '';
    if (!label || label.length > MAX_DEBUG_TRACE_ID_CHARS) {
        return undefined;
    }
    if (typeof doc.result !== 'boolean') {
        return undefined;
    }
    const condition: DebugTraceCondition = { label, result: doc.result };
    const actual = parseScalar(doc.actual);
    if (actual !== undefined) {
        condition.actual = actual;
    }
    const expected = parseScalar(doc.expected);
    if (expected !== undefined) {
        condition.expected = expected;
    }
    return condition;
}

function parseDebugTraceConditions(raw: unknown): DebugTraceCondition[] | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const conditions: DebugTraceCondition[] = [];
    for (const item of raw) {
        if (conditions.length >= MAX_DEBUG_TRACE_CONDITIONS) {
            break;
        }
        const parsed = parseDebugTraceCondition(item);
        if (parsed) {
            conditions.push(parsed);
        }
    }
    return conditions.length > 0 ? conditions : undefined;
}

/** Parse and validate a loose trace entry. Returns undefined when rejected. */
export function parseDebugTraceEntry(
    raw: unknown,
    warnings: DebugTraceWarning[] = []
): DebugTraceEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        pushWarning(warnings, {
            code: 'invalid_shape',
            message: 'Trace entry must be an object.',
        });
        return undefined;
    }

    const doc = raw as Record<string, unknown>;
    for (const key of Object.keys(doc)) {
        if (!ENTRY_ALLOWED_KEYS.has(key)) {
            pushWarning(warnings, {
                code: 'unknown_field',
                message: `Unknown field "${key}" is not allowed in P1 trace entries.`,
            });
            return undefined;
        }
    }

    if (doc.version !== undefined && doc.version !== DEBUG_TRACE_ENTRY_VERSION) {
        pushWarning(warnings, {
            code: 'invalid_version',
            message: `Trace entry version must be ${DEBUG_TRACE_ENTRY_VERSION}.`,
        });
        return undefined;
    }

    const runId = boundedId(doc.runId, 'runId', warnings);
    const traceId = boundedId(doc.traceId, 'traceId', warnings);
    const subsystem = boundedId(doc.subsystem, 'subsystem', warnings);
    const phaseRaw = typeof doc.phase === 'string' ? doc.phase : '';
    const audienceRaw = typeof doc.audience === 'string' ? doc.audience : '';
    const messageRaw = typeof doc.message === 'string' ? doc.message.trim() : '';

    if (!(DEBUG_TRACE_PHASES as readonly string[]).includes(phaseRaw)) {
        pushWarning(warnings, {
            code: 'invalid_phase',
            message: `Unknown trace phase "${phaseRaw}".`,
            traceId,
        });
        return undefined;
    }
    if (!(DEBUG_TRACE_AUDIENCES as readonly string[]).includes(audienceRaw)) {
        pushWarning(warnings, {
            code: 'invalid_audience',
            message: `Unknown trace audience "${audienceRaw}".`,
            traceId,
        });
        return undefined;
    }
    if (!messageRaw) {
        pushWarning(warnings, {
            code: 'invalid_field',
            message: 'message must be non-empty.',
            traceId,
        });
        return undefined;
    }
    if (messageRaw.length > MAX_DEBUG_TRACE_MESSAGE_CHARS) {
        pushWarning(warnings, {
            code: 'field_too_long',
            message: `message exceeds ${MAX_DEBUG_TRACE_MESSAGE_CHARS} chars.`,
            traceId,
        });
        return undefined;
    }

    if (!runId || !traceId || !subsystem) {
        return undefined;
    }

    const entry: DebugTraceEntry = {
        version: DEBUG_TRACE_ENTRY_VERSION,
        runId,
        traceId,
        subsystem,
        phase: phaseRaw as DebugTracePhase,
        message: messageRaw,
        audience: audienceRaw as DebugTraceAudience,
    };

    const parentTraceId = optionalBoundedId(doc.parentTraceId, 'parentTraceId', warnings, traceId);
    if (parentTraceId) {
        entry.parentTraceId = parentTraceId;
    }
    const ruleId = optionalBoundedId(doc.ruleId, 'ruleId', warnings, traceId);
    if (ruleId) {
        entry.ruleId = ruleId;
    }
    const decision = optionalBoundedId(doc.decision, 'decision', warnings, traceId);
    if (decision) {
        entry.decision = decision;
    }

    const worldTurn = optionalNonNegativeInt(doc.worldTurn, 'worldTurn');
    if (worldTurn !== undefined) {
        entry.worldTurn = worldTurn;
    }
    const gmTurn = optionalNonNegativeInt(doc.gmTurn, 'gmTurn');
    if (gmTurn !== undefined) {
        entry.gmTurn = gmTurn;
    }

    const inputRefs = parseDebugTraceRefs(doc.inputRefs, 'inputRefs');
    if (inputRefs) {
        entry.inputRefs = inputRefs;
    }
    const outputRefs = parseDebugTraceRefs(doc.outputRefs, 'outputRefs');
    if (outputRefs) {
        entry.outputRefs = outputRefs;
    }
    const conditions = parseDebugTraceConditions(doc.conditions);
    if (conditions) {
        entry.conditions = conditions;
    }

    return entry;
}

export function createDebugTraceBuffer(maxEntries?: number): DebugTraceBuffer {
    return {
        version: DEBUG_TRACE_BUFFER_VERSION,
        maxEntries: clampBufferMax(maxEntries),
        entries: [],
        evictedTraceKeys: [],
    };
}

/** Keys of entries removed by a ring-buffer trim pass. */
export function collectEvictedEntryKeys(
    before: readonly DebugTraceEntry[],
    after: readonly DebugTraceEntry[]
): string[] {
    const afterKeys = new Set(after.map((e) => traceEntryKey(e.runId, e.traceId)));
    const evicted: string[] = [];
    for (const entry of before) {
        const key = traceEntryKey(entry.runId, entry.traceId);
        if (!afterKeys.has(key)) {
            evicted.push(key);
        }
    }
    return evicted;
}

function mergeEvictedTraceKeys(existing: string[] | undefined, added: string[]): string[] {
    if (added.length === 0) {
        return existing ?? [];
    }
    const merged = [...(existing ?? []), ...added];
    if (merged.length <= MAX_DEBUG_TRACE_EVICTED_KEYS) {
        return merged;
    }
    return merged.slice(merged.length - MAX_DEBUG_TRACE_EVICTED_KEYS);
}

function isStepAnchorEntry(entry: DebugTraceEntry): boolean {
    return entry.subsystem === 'worldSim'
        && entry.traceId.startsWith('trace_step_')
        && !entry.parentTraceId;
}

/** Partition buffer entries into simulation-step bundles (anchor → children until next anchor). */
export function partitionDebugTraceStepBundles(entries: readonly DebugTraceEntry[]): DebugTraceEntry[][] {
    const bundles: DebugTraceEntry[][] = [];
    let current: DebugTraceEntry[] = [];

    for (const entry of entries) {
        if (isStepAnchorEntry(entry) && current.length > 0) {
            bundles.push(current);
            current = [entry];
            continue;
        }
        current.push(entry);
    }
    if (current.length > 0) {
        bundles.push(current);
    }
    return bundles;
}

function collectReferencedParentIds(entries: readonly DebugTraceEntry[]): Set<string> {
    const refs = new Set<string>();
    for (const entry of entries) {
        if (entry.parentTraceId) {
            refs.add(entry.parentTraceId);
        }
    }
    return refs;
}

/** Drop oldest leaf entries inside one bundle until it fits the remaining budget. */
function trimBundleLeavesFromFront(bundle: DebugTraceEntry[], maxKeep: number): DebugTraceEntry[] {
    if (bundle.length <= maxKeep) {
        return [...bundle];
    }
    let working = [...bundle];
    while (working.length > maxKeep) {
        const parentRefs = collectReferencedParentIds(working);
        let removed = false;
        for (let i = 0; i < working.length && working.length > maxKeep; i++) {
            const candidate = working[i];
            if (!parentRefs.has(candidate.traceId)) {
                working.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (!removed) {
            return working.slice(working.length - maxKeep);
        }
    }
    return working;
}

/**
 * Trim ring buffer by evicting oldest whole simulation-step bundles first,
 * then leaf rows inside the oldest retained bundle. Reduces missing_parent warnings.
 */
export function trimDebugTraceRingBuffer(
    entries: DebugTraceEntry[],
    maxEntries: number
): DebugTraceEntry[] {
    const limit = Math.max(MIN_DEBUG_TRACE_BUFFER_ENTRIES, Math.floor(maxEntries));
    if (entries.length <= limit) {
        return entries;
    }

    const bundles = partitionDebugTraceStepBundles(entries);
    if (bundles.length === 0) {
        return entries.slice(entries.length - limit);
    }

    while (bundles.length > 1) {
        const total = bundles.reduce((sum, bundle) => sum + bundle.length, 0);
        if (total <= limit) {
            break;
        }
        bundles.shift();
    }

    let flat = bundles.flat();
    if (flat.length > limit && bundles.length === 1) {
        flat = trimBundleLeavesFromFront(bundles[0], limit);
    } else if (flat.length > limit) {
        let overflow = flat.length - limit;
        const trimmedBundles = [...bundles];
        while (overflow > 0 && trimmedBundles.length > 0) {
            const head = trimmedBundles[0];
            if (head.length <= overflow) {
                overflow -= head.length;
                trimmedBundles.shift();
                continue;
            }
            trimmedBundles[0] = trimBundleLeavesFromFront(head, head.length - overflow);
            overflow = 0;
        }
        flat = trimmedBundles.flat();
    }

    return flat.length > limit ? flat.slice(flat.length - limit) : flat;
}

function trimRingBuffer(entries: DebugTraceEntry[], maxEntries: number): DebugTraceEntry[] {
    return trimDebugTraceRingBuffer(entries, maxEntries);
}

export function appendDebugTraceEntry(
    buffer: DebugTraceBuffer,
    entry: unknown
): DebugTraceAppendResult {
    const warnings: DebugTraceWarning[] = [];
    const parsed = parseDebugTraceEntry(entry, warnings);
    if (!parsed) {
        return {
            buffer,
            accepted: 0,
            rejected: 1,
            warnings,
        };
    }

    const combined = [...buffer.entries, parsed];
    const nextEntries = trimRingBuffer(combined, buffer.maxEntries);
    const evictedKeys = mergeEvictedTraceKeys(
        buffer.evictedTraceKeys,
        collectEvictedEntryKeys(combined, nextEntries)
    );
    return {
        buffer: {
            version: buffer.version,
            maxEntries: buffer.maxEntries,
            entries: nextEntries,
            evictedTraceKeys: evictedKeys,
        },
        accepted: 1,
        rejected: 0,
        warnings,
    };
}

export function appendDebugTraceEntries(
    buffer: DebugTraceBuffer,
    entries: unknown[]
): DebugTraceAppendResult {
    let current = buffer;
    let accepted = 0;
    let rejected = 0;
    const warnings: DebugTraceWarning[] = [];

    for (const raw of entries) {
        const result = appendDebugTraceEntry(current, raw);
        current = result.buffer;
        accepted += result.accepted;
        rejected += result.rejected;
        for (const warning of result.warnings) {
            pushWarning(warnings, warning);
        }
    }

    return { buffer: current, accepted, rejected, warnings };
}

export function validateDebugTraceLinks(buffer: DebugTraceBuffer): DebugTraceWarning[] {
    const warnings: DebugTraceWarning[] = [];
    const byKey = new Map<string, DebugTraceEntry>();
    const seenKeys = new Set<string>();

    for (const entry of buffer.entries) {
        const key = traceEntryKey(entry.runId, entry.traceId);
        if (seenKeys.has(key)) {
            pushWarning(warnings, {
                code: 'duplicate_trace_id',
                message: `Duplicate traceId "${entry.traceId}" in run "${entry.runId}".`,
                traceId: entry.traceId,
                runId: entry.runId,
            });
        } else {
            seenKeys.add(key);
        }
        byKey.set(key, entry);
    }

    for (const entry of buffer.entries) {
        const parentId = entry.parentTraceId;
        if (!parentId) {
            continue;
        }
        if (parentId === entry.traceId) {
            pushWarning(warnings, {
                code: 'self_parent',
                message: `traceId "${entry.traceId}" cannot parent itself.`,
                traceId: entry.traceId,
                runId: entry.runId,
            });
            continue;
        }
        const parentKey = traceEntryKey(entry.runId, parentId);
        if (!byKey.has(parentKey)) {
            const evicted = new Set(buffer.evictedTraceKeys ?? []);
            pushWarning(warnings, {
                code: evicted.has(parentKey) ? 'parent_evicted' : 'missing_parent',
                message: evicted.has(parentKey)
                    ? `parentTraceId "${parentId}" was evicted by ring-buffer retention in run "${entry.runId}".`
                    : `parentTraceId "${parentId}" is not present in run "${entry.runId}".`,
                traceId: entry.traceId,
                runId: entry.runId,
            });
            continue;
        }

        const visited = new Set<string>([entry.traceId]);
        let cursor: string | undefined = parentId;
        while (cursor) {
            if (visited.has(cursor)) {
                pushWarning(warnings, {
                    code: 'parent_cycle',
                    message: `Parent chain cycle detected at traceId "${entry.traceId}".`,
                    traceId: entry.traceId,
                    runId: entry.runId,
                });
                break;
            }
            visited.add(cursor);
            cursor = byKey.get(traceEntryKey(entry.runId, cursor))?.parentTraceId;
        }
    }

    return warnings;
}

function audienceRank(audience: DebugTraceAudience): number {
    switch (audience) {
        case 'internal':
            return 2;
        case 'gm_safe':
            return 1;
        case 'player_safe':
            return 0;
        default:
            return -1;
    }
}

/** Filter entries by declared audience (no semantic redaction in P1). */
export function projectDebugTraceBuffer(
    buffer: DebugTraceBuffer,
    audience: DebugTraceAudience
): DebugTraceBuffer {
    const maxRank = audienceRank(audience);
    const entries = buffer.entries.filter((entry) => audienceRank(entry.audience) <= maxRank);
    return {
        version: buffer.version,
        maxEntries: buffer.maxEntries,
        entries: [...entries],
        evictedTraceKeys: buffer.evictedTraceKeys ? [...buffer.evictedTraceKeys] : undefined,
    };
}

/** Hide link warnings that reference entries not visible under the audience projection. */
export function projectDebugTraceLinkWarnings(
    buffer: DebugTraceBuffer,
    warnings: DebugTraceWarning[],
    audience: DebugTraceAudience
): DebugTraceWarning[] {
    if (audience === 'internal') {
        return [...warnings];
    }
    const visibleKeys = new Set(
        projectDebugTraceBuffer(buffer, audience).entries.map((e) => traceEntryKey(e.runId, e.traceId))
    );
    return warnings.filter((warning) => {
        if (!warning.traceId) {
            return true;
        }
        if (!warning.runId) {
            return buffer.entries.some(
                (e) => e.traceId === warning.traceId && visibleKeys.has(traceEntryKey(e.runId, e.traceId))
            );
        }
        return visibleKeys.has(traceEntryKey(warning.runId, warning.traceId));
    });
}