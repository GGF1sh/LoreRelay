import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { clearCampaignResourcesCache } from './campaignResources';
import { clearDiscoveryLedgerCache } from './discoveryLedger';
import { clearNpcRegistryCache } from './npcRegistry';
import { clearSettlementStateCache } from './settlementState';
import { clearVehicleStateCache } from './vehicleState';
import { clearWorldStateCache } from './worldState';
import { writeJsonAtomic } from './workspacePaths';
import { migrateGameState } from './migrateGameState';
import { sanitizeGameStateForPersist } from './gameStateSanitize';

export const CHECKPOINT_STATE_SNAPSHOT_FORMAT = 'lorerelay-checkpoint-state/1' as const;

export const CHECKPOINT_MUTABLE_LEDGER_FILES = [
    'world_state.json',
    'npc_registry.json',
    'vehicle_state.json',
    'settlement_state.json',
    'settlement_layout.json',
    'discoveries.json',
    'campaign_resources.json',
] as const;

export type CheckpointMutableLedgerFile = typeof CHECKPOINT_MUTABLE_LEDGER_FILES[number];

export type CheckpointFileSnapshot =
    | { present: false }
    | { present: true; value: Record<string, unknown> };

export interface CheckpointStateSnapshot {
    format: typeof CHECKPOINT_STATE_SNAPSHOT_FORMAT;
    gameState: Record<string, unknown>;
    ledgers: Record<CheckpointMutableLedgerFile, CheckpointFileSnapshot>;
}

const MAX_SNAPSHOT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SNAPSHOT_TOTAL_BYTES = 48 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

interface SnapshotFileRead {
    value: Record<string, unknown>;
    identity: string;
    byteLength: number;
}

function readBoundedJsonRecord(filePath: string): SnapshotFileRead | undefined {
    const linkStat = fs.lstatSync(filePath);
    if (linkStat.isSymbolicLink() || !linkStat.isFile() || linkStat.size > MAX_SNAPSHOT_FILE_BYTES) {
        return undefined;
    }
    const bytes = fs.readFileSync(filePath);
    const value = JSON.parse(bytes.toString('utf8')) as unknown;
    return isRecord(value) ? {
        value,
        identity: `${bytes.byteLength}:${createHash('sha256').update(bytes).digest('hex')}`,
        byteLength: bytes.byteLength,
    } : undefined;
}

/** Capture only the enumerated mutable gameplay ledgers. Configuration and runtime authority are excluded. */
export function captureCheckpointStateSnapshot(
    workspaceRoot: string,
    gameState: Record<string, unknown>,
): CheckpointStateSnapshot | undefined {
    if (!isRecord(gameState)) return undefined;
    const ledgers = {} as Record<CheckpointMutableLedgerFile, CheckpointFileSnapshot>;
    const identities = new Map<CheckpointMutableLedgerFile, string | 'missing'>();
    try {
        let totalBytes = Buffer.byteLength(JSON.stringify(gameState), 'utf8');
        if (totalBytes > MAX_SNAPSHOT_FILE_BYTES) return undefined;
        for (const fileName of CHECKPOINT_MUTABLE_LEDGER_FILES) {
            const filePath = path.join(workspaceRoot, fileName);
            if (!fs.existsSync(filePath)) {
                ledgers[fileName] = { present: false };
                identities.set(fileName, 'missing');
                continue;
            }
            const read = readBoundedJsonRecord(filePath);
            if (!read) return undefined;
            totalBytes += read.byteLength;
            if (totalBytes > MAX_SNAPSHOT_TOTAL_BYTES) return undefined;
            ledgers[fileName] = { present: true, value: cloneJson(read.value) };
            identities.set(fileName, read.identity);
        }
        for (const fileName of CHECKPOINT_MUTABLE_LEDGER_FILES) {
            const filePath = path.join(workspaceRoot, fileName);
            const expected = identities.get(fileName);
            if (expected === 'missing') {
                if (fs.existsSync(filePath)) return undefined;
                continue;
            }
            if (!fs.existsSync(filePath)) return undefined;
            const finalRead = readBoundedJsonRecord(filePath);
            if (!finalRead || finalRead.identity !== expected) return undefined;
        }
    } catch {
        return undefined;
    }

    return {
        format: CHECKPOINT_STATE_SNAPSHOT_FORMAT,
        gameState: cloneJson(gameState),
        ledgers,
    };
}

export function parseCheckpointStateSnapshot(value: unknown): CheckpointStateSnapshot | undefined {
    if (!isRecord(value)
        || value.format !== CHECKPOINT_STATE_SNAPSHOT_FORMAT
        || !isRecord(value.gameState)
        || !isRecord(value.ledgers)) {
        return undefined;
    }
    try {
        const ledgers = {} as Record<CheckpointMutableLedgerFile, CheckpointFileSnapshot>;
        let totalBytes = Buffer.byteLength(JSON.stringify(value.gameState), 'utf8');
        if (totalBytes > MAX_SNAPSHOT_FILE_BYTES) return undefined;
        for (const fileName of CHECKPOINT_MUTABLE_LEDGER_FILES) {
            const item = value.ledgers[fileName];
            if (!isRecord(item) || typeof item.present !== 'boolean') return undefined;
            if (item.present === false) {
                if (Object.keys(item).some(key => key !== 'present')) return undefined;
                ledgers[fileName] = { present: false };
                continue;
            }
            if (!isRecord(item.value)) return undefined;
            const bytes = Buffer.byteLength(JSON.stringify(item.value), 'utf8');
            if (bytes > MAX_SNAPSHOT_FILE_BYTES) return undefined;
            totalBytes += bytes;
            if (totalBytes > MAX_SNAPSHOT_TOTAL_BYTES) return undefined;
            ledgers[fileName] = { present: true, value: cloneJson(item.value) };
        }
        if (Object.keys(value.ledgers).some(key => !CHECKPOINT_MUTABLE_LEDGER_FILES.includes(key as CheckpointMutableLedgerFile))) {
            return undefined;
        }
        return {
            format: CHECKPOINT_STATE_SNAPSHOT_FORMAT,
            gameState: cloneJson(value.gameState),
            ledgers,
        };
    } catch {
        return undefined;
    }
}

/** Re-read every enumerated side ledger immediately before checkpoint publication. */
export function isCheckpointStateSnapshotCurrent(
    workspaceRoot: string,
    snapshot: CheckpointStateSnapshot,
    includeGameState = true,
): boolean {
    const parsed = parseCheckpointStateSnapshot(snapshot);
    if (!parsed) return false;
    try {
        if (includeGameState) {
            const gameStatePath = path.join(workspaceRoot, 'game_state.json');
            if (!fs.existsSync(gameStatePath)) return false;
            const currentGameState = readBoundedJsonRecord(gameStatePath);
            const normalizedCurrent = currentGameState
                ? sanitizeGameStateForPersist(migrateGameState(currentGameState.value).state as Record<string, unknown>)
                : undefined;
            if (!currentGameState
                || JSON.stringify(normalizedCurrent) !== JSON.stringify(parsed.gameState)) return false;
        }
        for (const fileName of CHECKPOINT_MUTABLE_LEDGER_FILES) {
            const filePath = path.join(workspaceRoot, fileName);
            const expected = parsed.ledgers[fileName];
            if (!expected.present) {
                if (fs.existsSync(filePath)) return false;
                continue;
            }
            if (!fs.existsSync(filePath)) return false;
            const current = readBoundedJsonRecord(filePath);
            if (!current || JSON.stringify(current.value) !== JSON.stringify(expected.value)) return false;
        }
        return true;
    } catch {
        return false;
    }
}

interface BeforeImage {
    path: string;
    existed: boolean;
    value?: unknown;
}

function captureBeforeImage(filePath: string): BeforeImage {
    if (!fs.existsSync(filePath)) return { path: filePath, existed: false };
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SNAPSHOT_FILE_BYTES) {
        throw new Error('checkpoint restore target is not a bounded regular file');
    }
    return {
        path: filePath,
        existed: true,
        value: JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown,
    };
}

function restoreBeforeImage(image: BeforeImage): void {
    if (image.existed) {
        writeJsonAtomic(image.path, image.value);
    } else if (fs.existsSync(image.path)) {
        fs.unlinkSync(image.path);
    }
}

function clearCheckpointLedgerCaches(): void {
    clearWorldStateCache();
    clearNpcRegistryCache();
    clearVehicleStateCache();
    clearSettlementStateCache();
    clearDiscoveryLedgerCache();
    clearCampaignResourcesCache();
}

/**
 * Restore history and all enumerated side ledgers before publishing game_state last.
 * Any ordinary write failure rolls earlier files back; a process crash remains detectable by
 * the surrounding timeline transaction's repair latch and never restores runtime authority.
 */
export function restoreCheckpointStateSnapshot(
    workspaceRoot: string,
    snapshot: CheckpointStateSnapshot,
    history: unknown[],
    options: {
        authorizationCurrent: () => boolean;
        writeGameState: (state: Record<string, unknown>) => boolean;
    },
): boolean {
    const parsed = parseCheckpointStateSnapshot(snapshot);
    if (!parsed || !Array.isArray(history) || !options.authorizationCurrent()) return false;
    const targetPaths = [
        path.join(workspaceRoot, 'game_history.json'),
        ...CHECKPOINT_MUTABLE_LEDGER_FILES.map(fileName => path.join(workspaceRoot, fileName)),
        path.join(workspaceRoot, 'game_state.json'),
    ];
    let before: BeforeImage[];
    try {
        before = targetPaths.map(captureBeforeImage);
    } catch {
        return false;
    }
    const changed: BeforeImage[] = [];
    try {
        const historyPath = targetPaths[0];
        if (!options.authorizationCurrent()) throw new Error('authorization changed');
        writeJsonAtomic(historyPath, cloneJson(history));
        changed.push(before[0]);

        for (let index = 0; index < CHECKPOINT_MUTABLE_LEDGER_FILES.length; index += 1) {
            if (!options.authorizationCurrent()) throw new Error('authorization changed');
            const fileName = CHECKPOINT_MUTABLE_LEDGER_FILES[index];
            const filePath = path.join(workspaceRoot, fileName);
            const fileSnapshot = parsed.ledgers[fileName];
            if (fileSnapshot.present) {
                writeJsonAtomic(filePath, fileSnapshot.value);
            } else if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            changed.push(before[index + 1]);
        }

        if (!options.authorizationCurrent()) throw new Error('authorization changed');
        changed.push(before[before.length - 1]);
        if (!options.writeGameState(parsed.gameState)) {
            throw new Error('game_state publication failed');
        }
        clearCheckpointLedgerCaches();
        return true;
    } catch (error) {
        let rollbackFailed = false;
        for (const image of [...changed].reverse()) {
            try {
                restoreBeforeImage(image);
            } catch {
                rollbackFailed = true;
            }
        }
        clearCheckpointLedgerCaches();
        if (rollbackFailed) {
            console.error('[checkpoint] restore rollback failed', error);
        }
        return false;
    }
}
