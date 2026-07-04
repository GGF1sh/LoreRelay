// Debug Trace P1: pure structured trace vocabulary + bounded ring buffer (no I/O).

export const DEBUG_TRACE_ENTRY_VERSION = 1 as const;
export const DEBUG_TRACE_BUFFER_VERSION = 1 as const;

export const MAX_DEBUG_TRACE_ID_CHARS = 96;
export const MAX_DEBUG_TRACE_MESSAGE_CHARS = 500;
export const MAX_DEBUG_TRACE_CONDITIONS = 24;
export const MAX_DEBUG_TRACE_REFS = 32;
export const MIN_DEBUG_TRACE_BUFFER_ENTRIES = 1;
export const MAX_DEBUG_TRACE_BUFFER_ENTRIES = 1000;
export const DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES = 256;
export const MAX_DEBUG_TRACE_APPEND_WARNINGS = 16;

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
}

export interface DebugTraceWarning {
    code: string;
    message: string;
    traceId?: string;
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

function parseScalar(value: unknown): string | number | boolean | undefined {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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
    };
}

function trimRingBuffer(entries: DebugTraceEntry[], maxEntries: number): DebugTraceEntry[] {
    if (entries.length <= maxEntries) {
        return entries;
    }
    return entries.slice(entries.length - maxEntries);
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

    const nextEntries = trimRingBuffer([...buffer.entries, parsed], buffer.maxEntries);
    return {
        buffer: {
            version: buffer.version,
            maxEntries: buffer.maxEntries,
            entries: nextEntries,
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
    const byId = new Map<string, DebugTraceEntry>();
    const seenIds = new Set<string>();

    for (const entry of buffer.entries) {
        if (seenIds.has(entry.traceId)) {
            pushWarning(warnings, {
                code: 'duplicate_trace_id',
                message: `Duplicate traceId "${entry.traceId}".`,
                traceId: entry.traceId,
            });
        } else {
            seenIds.add(entry.traceId);
        }
        byId.set(entry.traceId, entry);
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
            });
            continue;
        }
        if (!byId.has(parentId)) {
            pushWarning(warnings, {
                code: 'missing_parent',
                message: `parentTraceId "${parentId}" is not present in buffer.`,
                traceId: entry.traceId,
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
                });
                break;
            }
            visited.add(cursor);
            cursor = byId.get(cursor)?.parentTraceId;
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
    };
}