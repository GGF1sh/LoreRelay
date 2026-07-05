// Determinism Spine D1: pure canonical state hashing and drift comparison (no fs/vscode).

export const DETERMINISM_SNAPSHOT_VERSION = 1 as const;
export const DETERMINISM_HASH_ALGORITHM = 'sha256' as const;

export const DETERMINISM_CANONICAL_FILES = [
    'game_state.json',
    'world_state.json',
    'game_rules.json',
    'game_history.json',
    'vehicle_state.json',
    'mobile_base_state.json',
    'settlement_state.json',
    'settlement_layout.json',
    'discoveries.json',
    'campaign_kit.json',
    'campaign_resources.json',
    'npc_registry.json',
    'world_forge.json',
] as const;

export type DeterminismCanonicalFile = (typeof DETERMINISM_CANONICAL_FILES)[number];

export const DETERMINISM_PARSE_ERROR_SENTINEL = 'json_parse_error' as const;

/** Named volatile exclusions — no broad regexes. */
export const DETERMINISM_VOLATILE_ROOT_KEYS = ['debug', 'report'] as const;

export interface DeterminismHash {
    algorithm: typeof DETERMINISM_HASH_ALGORITHM;
    value: string;
}

export interface DeterminismFileHash {
    path: string;
    exists: boolean;
    hash?: DeterminismHash;
    bytes?: number;
    parseError?: string;
}

export interface DeterminismSnapshot {
    version: typeof DETERMINISM_SNAPSHOT_VERSION;
    label: string;
    stepId?: string;
    stepIndex?: number;
    worldTurn?: number;
    aggregateHash: DeterminismHash;
    files: DeterminismFileHash[];
    warnings: string[];
}

export interface DeterminismDrift {
    ok: false;
    firstDifferentSnapshot: {
        index: number;
        label: string;
        leftHash: string;
        rightHash: string;
    };
    fileDiffs: Array<{
        path: string;
        leftHash?: string;
        rightHash?: string;
        leftExists: boolean;
        rightExists: boolean;
    }>;
}

export type DeterminismComparison =
    | { ok: true; snapshots: number }
    | DeterminismDrift;

export interface DeterminismFileInput {
    path: string;
    exists: boolean;
    bytes?: number;
    parseError?: string;
    parsed?: unknown;
}

export type HashTextFn = (text: string) => string;

/** Deterministic structural serializer with sorted object keys. */
export function stableSerialize(value: unknown): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    const kind = typeof value;
    if (kind === 'string') {
        return JSON.stringify(value);
    }
    if (kind === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('stableSerialize: non-finite number');
        }
        return String(value);
    }
    if (kind === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }
    if (kind === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        const pairs: string[] = [];
        for (const key of keys) {
            const child = record[key];
            if (child === undefined) {
                continue;
            }
            pairs.push(`${JSON.stringify(key)}:${stableSerialize(child)}`);
        }
        return `{${pairs.join(',')}}`;
    }
    throw new Error(`stableSerialize: unsupported type ${kind}`);
}

/** Apply the D1 allowlisted volatile-field redaction pass. */
export function redactVolatileFields(value: unknown, isRoot = true): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactVolatileFields(item, false));
    }
    if (typeof value !== 'object') {
        return value;
    }

    const record = { ...(value as Record<string, unknown>) };
    if (isRoot) {
        for (const key of DETERMINISM_VOLATILE_ROOT_KEYS) {
            delete record[key];
        }
        if ('lastSavedAt' in record) {
            delete record.lastSavedAt;
        }
        if ('lastUpdated' in record) {
            delete record.lastUpdated;
        }
        if (record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)) {
            const meta = { ...(record.meta as Record<string, unknown>) };
            delete meta.generatedAt;
            record.meta = meta;
        }
    }

    for (const key of Object.keys(record)) {
        const child = record[key];
        if (child && typeof child === 'object') {
            record[key] = redactVolatileFields(child, false);
        }
    }
    return record;
}

export function createDeterminismHash(value: string, hashText: HashTextFn): DeterminismHash {
    return {
        algorithm: DETERMINISM_HASH_ALGORITHM,
        value: hashText(value),
    };
}

function aggregateRecordForFile(file: DeterminismFileHash): Record<string, unknown> {
    if (!file.exists) {
        return { path: file.path, exists: false };
    }
    if (file.parseError) {
        return { path: file.path, exists: true, parseError: file.parseError };
    }
    return { path: file.path, exists: true, hash: file.hash?.value };
}

export function buildAggregateHash(files: DeterminismFileHash[], hashText: HashTextFn): DeterminismHash {
    const payload = files.map((file) => aggregateRecordForFile(file));
    return createDeterminismHash(stableSerialize(payload), hashText);
}

export function buildCanonicalFileHash(input: DeterminismFileInput, hashText: HashTextFn): DeterminismFileHash {
    if (!input.exists) {
        return { path: input.path, exists: false };
    }
    if (input.parseError) {
        return {
            path: input.path,
            exists: true,
            bytes: input.bytes,
            parseError: input.parseError,
        };
    }

    const normalized = redactVolatileFields(input.parsed);
    return {
        path: input.path,
        exists: true,
        bytes: input.bytes,
        hash: createDeterminismHash(stableSerialize(normalized), hashText),
    };
}

/** Build ordered canonical file hashes for the fixed D1 file set. */
export function buildCanonicalFileHashes(
    inputsByPath: Readonly<Record<string, DeterminismFileInput | undefined>>,
    hashText: HashTextFn
): DeterminismFileHash[] {
    const files: DeterminismFileHash[] = [];
    for (const canonicalPath of DETERMINISM_CANONICAL_FILES) {
        const input = inputsByPath[canonicalPath] ?? { path: canonicalPath, exists: false };
        files.push(buildCanonicalFileHash({ ...input, path: canonicalPath }, hashText));
    }
    return files;
}

export function buildDeterminismSnapshot(options: {
    label: string;
    stepId?: string;
    stepIndex?: number;
    worldTurn?: number;
    inputsByPath: Readonly<Record<string, DeterminismFileInput | undefined>>;
    hashText: HashTextFn;
    warnings?: string[];
}): DeterminismSnapshot {
    const files = buildCanonicalFileHashes(options.inputsByPath, options.hashText);
    return {
        version: DETERMINISM_SNAPSHOT_VERSION,
        label: options.label,
        stepId: options.stepId,
        stepIndex: options.stepIndex,
        worldTurn: options.worldTurn,
        aggregateHash: buildAggregateHash(files, options.hashText),
        files,
        warnings: options.warnings ?? [],
    };
}

function fileHashesEqual(left: DeterminismFileHash, right: DeterminismFileHash): boolean {
    if (left.exists !== right.exists) {
        return false;
    }
    if (!left.exists) {
        return true;
    }
    if (left.parseError || right.parseError) {
        return left.parseError === right.parseError;
    }
    return left.hash?.value === right.hash?.value;
}

function collectFileDiffs(
    left: DeterminismSnapshot,
    right: DeterminismSnapshot
): DeterminismDrift['fileDiffs'] {
    const diffs: DeterminismDrift['fileDiffs'] = [];
    const rightByPath = new Map(right.files.map((file) => [file.path, file]));
    for (const leftFile of left.files) {
        const rightFile = rightByPath.get(leftFile.path);
        if (!rightFile || !fileHashesEqual(leftFile, rightFile)) {
            diffs.push({
                path: leftFile.path,
                leftHash: leftFile.hash?.value,
                rightHash: rightFile?.hash?.value,
                leftExists: leftFile.exists,
                rightExists: rightFile?.exists ?? false,
            });
        }
    }
    return diffs;
}

/** Compare two deterministic snapshot streams from runs of the same scenario. */
export function compareDeterminismSnapshotStreams(
    left: DeterminismSnapshot[],
    right: DeterminismSnapshot[]
): DeterminismComparison {
    if (left.length !== right.length) {
        const index = Math.min(left.length, right.length);
        const leftSnap = left[index];
        const rightSnap = right[index];
        return {
            ok: false,
            firstDifferentSnapshot: {
                index,
                label: leftSnap?.label ?? rightSnap?.label ?? `index:${index}`,
                leftHash: leftSnap?.aggregateHash.value ?? '',
                rightHash: rightSnap?.aggregateHash.value ?? '',
            },
            fileDiffs: [],
        };
    }

    for (let index = 0; index < left.length; index++) {
        const leftSnap = left[index];
        const rightSnap = right[index];
        if (leftSnap.aggregateHash.value !== rightSnap.aggregateHash.value) {
            return {
                ok: false,
                firstDifferentSnapshot: {
                    index,
                    label: leftSnap.label,
                    leftHash: leftSnap.aggregateHash.value,
                    rightHash: rightSnap.aggregateHash.value,
                },
                fileDiffs: collectFileDiffs(leftSnap, rightSnap),
            };
        }
    }

    return { ok: true, snapshots: left.length };
}

export function trimDeterminismSnapshots(
    snapshots: DeterminismSnapshot[],
    maxSnapshots: number
): DeterminismSnapshot[] {
    if (snapshots.length <= maxSnapshots) {
        return snapshots;
    }
    return snapshots.slice(0, maxSnapshots);
}
