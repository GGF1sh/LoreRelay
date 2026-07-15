// NOAI-GAMEPLAY-SPINE-005B-PRE2: host owner for normal vehicle_state.json mutations.
// Coordinates document read / mechanical mutation / version-preserving write.
// Does not create receipts, migrate v1→v2, or perform Gameplay Spine repair.
// Exceptional writers (ledger migration writeback/restore, SO executor, etc.) stay outside.

import * as fs from 'fs';
import {
    parseVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
    rebuildVehicleStateDocumentWithMechanical,
    type VehicleStateDocument,
    type VehicleStateDocumentParseResult,
} from './vehicleStateDocumentCore';
import type { VehicleState } from './vehicleCore';

export type VehicleStateDocumentFailureReason =
    | 'no_workspace'
    | 'missing'
    | 'empty_fleet'
    | 'invalid_document'
    | 'invalid_receipt_metadata'
    | 'unsupported_document_version'
    | 'unreadable'
    | 'write_failed'
    | 'no_change';

export type VehicleStateDocumentFreshRead =
    | {
        ok: true;
        statePath: string;
        document: VehicleStateDocument;
        mechanical: VehicleState;
    }
    | {
        ok: false;
        reason: VehicleStateDocumentFailureReason;
        statePath?: string;
        version?: number;
    };

export interface VehicleStateDocumentMutationResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    reason?: VehicleStateDocumentFailureReason;
}

export interface VehicleStateDocumentOwnerDeps {
    getVehicleStatePath: () => string | undefined;
    fileExists: (filePath: string) => boolean;
    readFileUtf8: (filePath: string) => string;
    writeJsonAtomic: (filePath: string, data: unknown) => void;
    clearVehicleStateCache: () => void;
    runSerializedMutation: (fn: () => void) => void;
}

/** Lazy host defaults — keeps focused tests free of vscode when using WithDeps. */
export function createDefaultVehicleStateDocumentOwnerDeps(): VehicleStateDocumentOwnerDeps {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vehicleState = require('./vehicleState') as typeof import('./vehicleState');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workspacePaths = require('./workspacePaths') as typeof import('./workspacePaths');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queue = require('./workspaceStateQueue') as typeof import('./workspaceStateQueue');
    return {
        getVehicleStatePath: () => vehicleState.getVehicleStatePath(),
        fileExists: (filePath) => fs.existsSync(filePath),
        readFileUtf8: (filePath) => fs.readFileSync(filePath, 'utf-8'),
        writeJsonAtomic: (filePath, data) => workspacePaths.writeJsonAtomic(filePath, data),
        clearVehicleStateCache: () => vehicleState.clearVehicleStateCache(),
        runSerializedMutation: (fn) => queue.runSerializedVehicleStateMutation(fn),
    };
}

function mapParseFailure(
    parsed: Exclude<
        VehicleStateDocumentParseResult,
        { kind: 'valid_v1' } | { kind: 'valid_v2' }
    >
): VehicleStateDocumentFailureReason {
    if (parsed.kind === 'invalid_receipt_metadata') {
        return 'invalid_receipt_metadata';
    }
    if (parsed.kind === 'unsupported_document_version') {
        return 'unsupported_document_version';
    }
    return 'invalid_document';
}

function mechanicalHasFleet(mechanical: VehicleState): boolean {
    return Array.isArray(mechanical.vehicles) && mechanical.vehicles.length > 0;
}

function mechanicalUnchanged(before: VehicleState, after: VehicleState): boolean {
    return JSON.stringify(before) === JSON.stringify(after);
}

/** Fresh document read (no cache). Fail-closed for corrupt / unsupported documents. */
export function readVehicleStateDocumentFreshWithDeps(
    deps: VehicleStateDocumentOwnerDeps,
    statePath?: string
): VehicleStateDocumentFreshRead {
    const resolved = statePath ?? deps.getVehicleStatePath();
    if (!resolved) {
        return { ok: false, reason: 'no_workspace' };
    }
    if (!deps.fileExists(resolved)) {
        return { ok: false, reason: 'missing', statePath: resolved };
    }
    let rawText: string;
    try {
        rawText = deps.readFileUtf8(resolved);
    } catch {
        return { ok: false, reason: 'unreadable', statePath: resolved };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(rawText);
    } catch {
        return { ok: false, reason: 'invalid_document', statePath: resolved };
    }
    const parsed = parseVehicleStateDocument(raw);
    if (parsed.kind === 'valid_v1' || parsed.kind === 'valid_v2') {
        const mechanical = projectVehicleStateDocumentMechanical(parsed.document);
        if (!mechanicalHasFleet(mechanical)) {
            return { ok: false, reason: 'empty_fleet', statePath: resolved };
        }
        return {
            ok: true,
            statePath: resolved,
            document: parsed.document,
            mechanical,
        };
    }
    if (parsed.kind === 'unsupported_document_version') {
        return {
            ok: false,
            reason: 'unsupported_document_version',
            statePath: resolved,
            version: parsed.version,
        };
    }
    return {
        ok: false,
        reason: mapParseFailure(parsed),
        statePath: resolved,
    };
}

export function readVehicleStateDocumentFresh(
    statePath?: string
): VehicleStateDocumentFreshRead {
    return readVehicleStateDocumentFreshWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        statePath
    );
}

/** Fresh mechanical projection only (receipt metadata never included). */
export function readMechanicalVehicleStateFreshWithDeps(
    deps: VehicleStateDocumentOwnerDeps,
    statePath?: string
): VehicleState | undefined {
    const read = readVehicleStateDocumentFreshWithDeps(deps, statePath);
    return read.ok ? read.mechanical : undefined;
}

export function readMechanicalVehicleStateFresh(
    statePath?: string
): VehicleState | undefined {
    return readMechanicalVehicleStateFreshWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        statePath
    );
}

/**
 * Serialized normal mutation path for vehicleOps / mobileBaseOps.
 * v1→v1, v2→v2 with receipts preserved; invalid documents never write or clear cache.
 */
export function runSerializedVehicleStateDocumentMutationWithDeps(
    deps: VehicleStateDocumentOwnerDeps,
    mutationName: string,
    mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
): VehicleStateDocumentMutationResult {
    const result: VehicleStateDocumentMutationResult = {
        ok: true,
        applied: false,
        attempted: true,
    };
    try {
        deps.runSerializedMutation(() => {
            const read = readVehicleStateDocumentFreshWithDeps(deps);
            if (!read.ok) {
                // Missing / empty fleet: soft no-op (matches prior turn-ops behavior).
                if (read.reason === 'missing'
                    || read.reason === 'empty_fleet'
                    || read.reason === 'no_workspace') {
                    result.reason = read.reason;
                    return;
                }
                // Corrupt / unsupported: fail closed, leave file and cache untouched.
                result.ok = false;
                result.reason = read.reason;
                return;
            }

            let nextMechanical: VehicleState | undefined;
            try {
                nextMechanical = mutateMechanicalState(read.mechanical);
            } catch (e) {
                result.ok = false;
                result.reason = 'write_failed';
                console.warn(`[vehicleStateDocumentOwner] ${mutationName} mutate failed`, e);
                return;
            }

            if (!nextMechanical || mechanicalUnchanged(read.mechanical, nextMechanical)) {
                result.reason = 'no_change';
                return;
            }

            const outDocument = rebuildVehicleStateDocumentWithMechanical(
                read.document,
                nextMechanical
            );

            try {
                deps.writeJsonAtomic(read.statePath, outDocument);
                deps.clearVehicleStateCache();
                result.applied = true;
                result.reason = undefined;
            } catch (e) {
                result.ok = false;
                result.applied = false;
                result.reason = 'write_failed';
                console.warn(
                    `[vehicleStateDocumentOwner] ${mutationName} failed to save vehicle_state.json`,
                    e
                );
            }
        });
    } catch (e) {
        console.warn(`[vehicleStateDocumentOwner] ${mutationName} serialization failed`, e);
        return { ok: false, applied: false, attempted: true, reason: 'write_failed' };
    }
    return result;
}

export function runSerializedVehicleStateDocumentMutation(
    mutationName: string,
    mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
): VehicleStateDocumentMutationResult {
    return runSerializedVehicleStateDocumentMutationWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        mutationName,
        mutateMechanicalState
    );
}
