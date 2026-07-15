// NOAI-GAMEPLAY-SPINE-005B-PRE1: pure VehicleState document and durable receipt contracts.
// This module owns no host integration, persistence, migration, or receipt creation path.

import {
    digestCanonicalValue,
    stableCanonicalStringify,
    type CanonicalJsonValue,
} from './gameplaySpinePreviewCore';
import { REPAIR_VEHICLE_ACTION_KEY } from './gameplaySpineCore';
import {
    MAX_HP_VALUE,
    VEHICLE_STATE_VERSION,
    parseVehicleState,
    type VehicleEntry,
    type VehicleState,
} from './vehicleCore';

export const VEHICLE_STATE_DOCUMENT_V1_VERSION = VEHICLE_STATE_VERSION;
export const VEHICLE_STATE_DOCUMENT_V2_VERSION = 2 as const;
export const VEHICLE_REPAIR_COMMIT_RECEIPT_VERSION = 1 as const;
export const MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS = 32;
export const MAX_VEHICLE_RECEIPT_ID_LENGTH = 160;
export const VEHICLE_RECEIPT_DIGEST_LENGTH = 64;

export const VEHICLE_REPAIR_ACTION_VERSION = 1 as const;
export const VEHICLE_STATE_LEDGER_ID = 'vehicle_state' as const;

const RECEIPT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VEHICLE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const V1_DOCUMENT_KEYS = new Set([
    'version', 'vehicles', 'activeVehicleId', 'updatedTurn', 'warnings',
]);
const V2_DOCUMENT_KEYS = new Set([
    ...V1_DOCUMENT_KEYS,
    'gameplayCommitReceipts',
]);
const RECEIPT_KEYS = new Set([
    'schemaVersion',
    'commitId',
    'requestId',
    'resolutionId',
    'planId',
    'actionKey',
    'actionVersion',
    'status',
    'ledgerId',
    'effectIds',
    'appliedEffectIds',
    'skippedEffectIds',
    'confirmationTokenDigest',
    'effectPlanDigest',
    'beforeLedgerDigest',
    'afterLedgerDigest',
    'target',
    'requestedRepair',
    'hpBefore',
    'hpAfter',
    'effectiveRepair',
    'updatedTurnBefore',
    'updatedTurnAfter',
    'clockSnapshot',
]);
const REQUIRED_RECEIPT_KEYS = [...RECEIPT_KEYS].filter(
    (key) => key !== 'updatedTurnBefore' && key !== 'updatedTurnAfter'
);
const TARGET_KEYS = new Set(['kind', 'id']);
const CLOCK_KEYS = new Set(['clock', 'value']);

export interface VehicleStateDocumentV1 {
    version: typeof VEHICLE_STATE_DOCUMENT_V1_VERSION;
    vehicles: VehicleEntry[];
    activeVehicleId?: string;
    updatedTurn?: number;
    warnings?: string[];
}

/** Untrusted JSON-facing v1 shape before mechanical canonicalization. */
export interface VehicleStateDocumentRawV1 {
    version: typeof VEHICLE_STATE_DOCUMENT_V1_VERSION;
    vehicles: unknown;
    activeVehicleId?: unknown;
    updatedTurn?: unknown;
    warnings?: unknown;
}

export interface VehicleRepairActionCommitReceipt {
    schemaVersion: typeof VEHICLE_REPAIR_COMMIT_RECEIPT_VERSION;

    commitId: string;
    requestId: string;
    resolutionId: string;
    planId: string;

    actionKey: typeof REPAIR_VEHICLE_ACTION_KEY;
    actionVersion: typeof VEHICLE_REPAIR_ACTION_VERSION;

    status: 'committed' | 'valid_noop';
    ledgerId: typeof VEHICLE_STATE_LEDGER_ID;

    effectIds: [string];
    appliedEffectIds: [] | [string];
    skippedEffectIds: [] | [string];

    confirmationTokenDigest: string;
    effectPlanDigest: string;
    beforeLedgerDigest: string;
    afterLedgerDigest: string;

    target: {
        kind: 'vehicle';
        id: string;
    };

    requestedRepair: number;
    hpBefore: number;
    hpAfter: number;
    effectiveRepair: number;

    updatedTurnBefore?: number;
    updatedTurnAfter?: number;

    clockSnapshot: [] | [{ clock: 'world'; value: number }];
}

export interface VehicleStateDocumentV2 {
    version: typeof VEHICLE_STATE_DOCUMENT_V2_VERSION;
    vehicles: VehicleEntry[];
    activeVehicleId?: string;
    updatedTurn?: number;
    warnings?: string[];
    gameplayCommitReceipts?: VehicleRepairActionCommitReceipt[];
}

export type VehicleStateDocument = VehicleStateDocumentV1 | VehicleStateDocumentV2;

/** Untrusted JSON-facing v2 shape; receipt metadata remains unknown until strict parsing. */
export interface VehicleStateDocumentRawV2 {
    version: typeof VEHICLE_STATE_DOCUMENT_V2_VERSION;
    vehicles: unknown;
    activeVehicleId?: unknown;
    updatedTurn?: unknown;
    warnings?: unknown;
    gameplayCommitReceipts?: unknown;
}

export type VehicleStateDocumentRaw = VehicleStateDocumentRawV1 | VehicleStateDocumentRawV2;

export type VehicleStateDocumentValidationErrorCode =
    | 'invalid_root'
    | 'invalid_version'
    | 'missing_vehicles'
    | 'unexpected_document_field'
    | 'unsafe_object_key'
    | 'unreadable_document';

export interface VehicleStateDocumentValidationError {
    code: VehicleStateDocumentValidationErrorCode;
    path: string;
}

export type VehicleReceiptValidationErrorCode =
    | 'invalid_receipts_type'
    | 'too_many_receipts'
    | 'invalid_receipt_type'
    | 'unknown_receipt_version'
    | 'missing_receipt_field'
    | 'unexpected_receipt_field'
    | 'unsafe_object_key'
    | 'invalid_id'
    | 'invalid_digest'
    | 'invalid_action_key'
    | 'invalid_action_version'
    | 'invalid_status'
    | 'invalid_ledger_id'
    | 'invalid_target'
    | 'unsafe_integer'
    | 'inconsistent_hp'
    | 'invalid_effect_cardinality'
    | 'invalid_effect_accounting'
    | 'invalid_clock_snapshot'
    | 'duplicate_receipt'
    | 'duplicate_request_id'
    | 'duplicate_commit_id';

export interface VehicleReceiptValidationError {
    code: VehicleReceiptValidationErrorCode;
    path: string;
    receiptIndex?: number;
}

export type VehicleStateDocumentParseResult =
    | { kind: 'valid_v1'; document: VehicleStateDocumentV1 }
    | { kind: 'valid_v2'; document: VehicleStateDocumentV2 }
    | { kind: 'invalid_document'; error: VehicleStateDocumentValidationError }
    | { kind: 'invalid_receipt_metadata'; error: VehicleReceiptValidationError }
    | { kind: 'unsupported_document_version'; version: number };

type ReceiptFailure = { ok: false; error: VehicleReceiptValidationError };
type ReceiptParseResult =
    | { ok: true; receipt: VehicleRepairActionCommitReceipt }
    | ReceiptFailure;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function firstUnsafeOwnKey(record: Record<string, unknown>): string | undefined {
    return Object.getOwnPropertyNames(record).find(
        (key) => FORBIDDEN_OBJECT_KEYS.has(key) || key.startsWith('__')
    );
}

function firstUnexpectedOwnKey(
    record: Record<string, unknown>,
    allowed: ReadonlySet<string>
): string | undefined {
    if (Object.getOwnPropertySymbols(record).length > 0) { return '<symbol>'; }
    return Object.getOwnPropertyNames(record).find((key) => !allowed.has(key));
}

function isSafeReceiptId(value: unknown): value is string {
    if (typeof value !== 'string'
        || value.length < 1
        || value.length > MAX_VEHICLE_RECEIPT_ID_LENGTH
        || !RECEIPT_ID_RE.test(value)) {
        return false;
    }
    // Dots are allowed for existing opaque correlation tokens, but path segments are not.
    return value !== '.' && value !== '..' && !value.endsWith('.') && !value.includes('..');
}

function isDigest(value: unknown): value is string {
    return typeof value === 'string'
        && value.length === VEHICLE_RECEIPT_DIGEST_LENGTH
        && DIGEST_RE.test(value);
}

function isSafeIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && !Object.is(value, -0)
        && value >= min
        && value <= max;
}

function receiptFailure(
    code: VehicleReceiptValidationErrorCode,
    path: string,
    receiptIndex?: number
): ReceiptFailure {
    return {
        ok: false,
        error: {
            code,
            path,
            ...(receiptIndex === undefined ? {} : { receiptIndex }),
        },
    };
}

function validateEffectIdArray(
    value: unknown,
    path: string,
    receiptIndex: number,
    requiredLength: 0 | 1
): ReceiptFailure | { ok: true; values: [] | [string] } {
    if (!Array.isArray(value) || value.length !== requiredLength) {
        return receiptFailure('invalid_effect_cardinality', path, receiptIndex);
    }
    if (requiredLength === 0) {
        return { ok: true, values: [] };
    }
    if (!isSafeReceiptId(value[0])) {
        return receiptFailure('invalid_id', `${path}[0]`, receiptIndex);
    }
    return { ok: true, values: [value[0]] };
}

function parseReceipt(value: unknown, receiptIndex: number): ReceiptParseResult {
    const basePath = `gameplayCommitReceipts[${receiptIndex}]`;
    if (!isPlainRecord(value)) {
        return receiptFailure('invalid_receipt_type', basePath, receiptIndex);
    }
    const unsafeKey = firstUnsafeOwnKey(value);
    if (unsafeKey) {
        return receiptFailure('unsafe_object_key', `${basePath}.${unsafeKey}`, receiptIndex);
    }
    const unexpectedKey = firstUnexpectedOwnKey(value, RECEIPT_KEYS);
    if (unexpectedKey) {
        return receiptFailure('unexpected_receipt_field', `${basePath}.${unexpectedKey}`, receiptIndex);
    }
    const missingKey = REQUIRED_RECEIPT_KEYS.find((key) => !hasOwn(value, key));
    if (missingKey) {
        return receiptFailure('missing_receipt_field', `${basePath}.${missingKey}`, receiptIndex);
    }

    if (value.schemaVersion !== VEHICLE_REPAIR_COMMIT_RECEIPT_VERSION) {
        return receiptFailure('unknown_receipt_version', `${basePath}.schemaVersion`, receiptIndex);
    }
    const commitId = value.commitId;
    const requestId = value.requestId;
    const resolutionId = value.resolutionId;
    const planId = value.planId;
    if (!isSafeReceiptId(commitId)) {
        return receiptFailure('invalid_id', `${basePath}.commitId`, receiptIndex);
    }
    if (!isSafeReceiptId(requestId)) {
        return receiptFailure('invalid_id', `${basePath}.requestId`, receiptIndex);
    }
    if (!isSafeReceiptId(resolutionId)) {
        return receiptFailure('invalid_id', `${basePath}.resolutionId`, receiptIndex);
    }
    if (!isSafeReceiptId(planId)) {
        return receiptFailure('invalid_id', `${basePath}.planId`, receiptIndex);
    }
    if (value.actionKey !== REPAIR_VEHICLE_ACTION_KEY) {
        return receiptFailure('invalid_action_key', `${basePath}.actionKey`, receiptIndex);
    }
    if (value.actionVersion !== VEHICLE_REPAIR_ACTION_VERSION) {
        return receiptFailure('invalid_action_version', `${basePath}.actionVersion`, receiptIndex);
    }
    const status = value.status;
    if (status !== 'committed' && status !== 'valid_noop') {
        return receiptFailure('invalid_status', `${basePath}.status`, receiptIndex);
    }
    if (value.ledgerId !== VEHICLE_STATE_LEDGER_ID) {
        return receiptFailure('invalid_ledger_id', `${basePath}.ledgerId`, receiptIndex);
    }

    const effectIds = validateEffectIdArray(value.effectIds, `${basePath}.effectIds`, receiptIndex, 1);
    if (!effectIds.ok) { return effectIds; }
    const expectedAppliedLength: 0 | 1 = status === 'committed' ? 1 : 0;
    const expectedSkippedLength: 0 | 1 = status === 'valid_noop' ? 1 : 0;
    const appliedEffectIds = validateEffectIdArray(
        value.appliedEffectIds,
        `${basePath}.appliedEffectIds`,
        receiptIndex,
        expectedAppliedLength
    );
    if (!appliedEffectIds.ok) { return appliedEffectIds; }
    const skippedEffectIds = validateEffectIdArray(
        value.skippedEffectIds,
        `${basePath}.skippedEffectIds`,
        receiptIndex,
        expectedSkippedLength
    );
    if (!skippedEffectIds.ok) { return skippedEffectIds; }
    const effectId = effectIds.values[0];
    if (effectId === undefined) {
        return receiptFailure('invalid_effect_cardinality', `${basePath}.effectIds`, receiptIndex);
    }
    if ((appliedEffectIds.values[0] !== undefined && appliedEffectIds.values[0] !== effectId)
        || (skippedEffectIds.values[0] !== undefined && skippedEffectIds.values[0] !== effectId)) {
        return receiptFailure('invalid_effect_accounting', `${basePath}.effectIds`, receiptIndex);
    }

    const confirmationTokenDigest = value.confirmationTokenDigest;
    const effectPlanDigest = value.effectPlanDigest;
    const beforeLedgerDigest = value.beforeLedgerDigest;
    const afterLedgerDigest = value.afterLedgerDigest;
    if (!isDigest(confirmationTokenDigest)) {
        return receiptFailure('invalid_digest', `${basePath}.confirmationTokenDigest`, receiptIndex);
    }
    if (!isDigest(effectPlanDigest)) {
        return receiptFailure('invalid_digest', `${basePath}.effectPlanDigest`, receiptIndex);
    }
    if (!isDigest(beforeLedgerDigest)) {
        return receiptFailure('invalid_digest', `${basePath}.beforeLedgerDigest`, receiptIndex);
    }
    if (!isDigest(afterLedgerDigest)) {
        return receiptFailure('invalid_digest', `${basePath}.afterLedgerDigest`, receiptIndex);
    }

    if (!isPlainRecord(value.target)) {
        return receiptFailure('invalid_target', `${basePath}.target`, receiptIndex);
    }
    const targetUnsafeKey = firstUnsafeOwnKey(value.target);
    if (targetUnsafeKey) {
        return receiptFailure('unsafe_object_key', `${basePath}.target.${targetUnsafeKey}`, receiptIndex);
    }
    const targetUnexpectedKey = firstUnexpectedOwnKey(value.target, TARGET_KEYS);
    const targetId = value.target.id;
    if (targetUnexpectedKey
        || Object.getOwnPropertyNames(value.target).length !== TARGET_KEYS.size
        || value.target.kind !== 'vehicle'
        || typeof targetId !== 'string'
        || !VEHICLE_ID_RE.test(targetId)) {
        return receiptFailure('invalid_target', `${basePath}.target`, receiptIndex);
    }

    const requestedRepair = value.requestedRepair;
    const hpBefore = value.hpBefore;
    const hpAfter = value.hpAfter;
    const effectiveRepair = value.effectiveRepair;
    if (!isSafeIntegerInRange(requestedRepair, 1, MAX_HP_VALUE)
        || !isSafeIntegerInRange(hpBefore, 0, MAX_HP_VALUE)
        || !isSafeIntegerInRange(hpAfter, 0, MAX_HP_VALUE)
        || !isSafeIntegerInRange(effectiveRepair, 0, MAX_HP_VALUE)) {
        return receiptFailure('unsafe_integer', `${basePath}.repairFacts`, receiptIndex);
    }
    if (hpAfter < hpBefore
        || hpAfter - hpBefore !== effectiveRepair
        || effectiveRepair > requestedRepair) {
        return receiptFailure('inconsistent_hp', `${basePath}.repairFacts`, receiptIndex);
    }
    if (status === 'committed'
        && (effectiveRepair < 1 || beforeLedgerDigest === afterLedgerDigest)) {
        return receiptFailure('inconsistent_hp', `${basePath}.status`, receiptIndex);
    }
    if (status === 'valid_noop'
        && (effectiveRepair !== 0
            || hpAfter !== hpBefore
            || beforeLedgerDigest !== afterLedgerDigest)) {
        return receiptFailure('inconsistent_hp', `${basePath}.status`, receiptIndex);
    }

    let updatedTurnBefore: number | undefined;
    if (hasOwn(value, 'updatedTurnBefore')) {
        if (!isSafeIntegerInRange(value.updatedTurnBefore, 0, Number.MAX_SAFE_INTEGER)) {
            return receiptFailure('unsafe_integer', `${basePath}.updatedTurnBefore`, receiptIndex);
        }
        updatedTurnBefore = value.updatedTurnBefore;
    }
    let updatedTurnAfter: number | undefined;
    if (hasOwn(value, 'updatedTurnAfter')) {
        if (!isSafeIntegerInRange(value.updatedTurnAfter, 0, Number.MAX_SAFE_INTEGER)) {
            return receiptFailure('unsafe_integer', `${basePath}.updatedTurnAfter`, receiptIndex);
        }
        updatedTurnAfter = value.updatedTurnAfter;
    }

    if (!Array.isArray(value.clockSnapshot) || value.clockSnapshot.length > 1) {
        return receiptFailure('invalid_clock_snapshot', `${basePath}.clockSnapshot`, receiptIndex);
    }
    let clockSnapshot: VehicleRepairActionCommitReceipt['clockSnapshot'] = [];
    if (value.clockSnapshot.length === 1) {
        const clock = value.clockSnapshot[0];
        if (!isPlainRecord(clock)) {
            return receiptFailure('invalid_clock_snapshot', `${basePath}.clockSnapshot[0]`, receiptIndex);
        }
        const clockUnsafeKey = firstUnsafeOwnKey(clock);
        if (clockUnsafeKey) {
            return receiptFailure(
                'unsafe_object_key',
                `${basePath}.clockSnapshot[0].${clockUnsafeKey}`,
                receiptIndex
            );
        }
        if (firstUnexpectedOwnKey(clock, CLOCK_KEYS)
            || Object.getOwnPropertyNames(clock).length !== CLOCK_KEYS.size
            || clock.clock !== 'world'
            || !isSafeIntegerInRange(clock.value, 0, Number.MAX_SAFE_INTEGER)) {
            return receiptFailure('invalid_clock_snapshot', `${basePath}.clockSnapshot[0]`, receiptIndex);
        }
        clockSnapshot = [{ clock: 'world', value: clock.value }];
    }

    const receipt: VehicleRepairActionCommitReceipt = {
        schemaVersion: VEHICLE_REPAIR_COMMIT_RECEIPT_VERSION,
        commitId,
        requestId,
        resolutionId,
        planId,
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        actionVersion: VEHICLE_REPAIR_ACTION_VERSION,
        status,
        ledgerId: VEHICLE_STATE_LEDGER_ID,
        effectIds: [effectId],
        appliedEffectIds: appliedEffectIds.values,
        skippedEffectIds: skippedEffectIds.values,
        confirmationTokenDigest,
        effectPlanDigest,
        beforeLedgerDigest,
        afterLedgerDigest,
        target: { kind: 'vehicle', id: targetId },
        requestedRepair,
        hpBefore,
        hpAfter,
        effectiveRepair,
        ...(updatedTurnBefore === undefined ? {} : { updatedTurnBefore }),
        ...(updatedTurnAfter === undefined ? {} : { updatedTurnAfter }),
        clockSnapshot,
    };
    return { ok: true, receipt };
}

function canonicalMechanicalFromRecord(record: Record<string, unknown>): VehicleState {
    const mechanicalInput: Record<string, unknown> = {
        version: VEHICLE_STATE_VERSION,
        vehicles: record.vehicles,
    };
    for (const field of ['activeVehicleId', 'updatedTurn', 'warnings'] as const) {
        if (hasOwn(record, field)) { mechanicalInput[field] = record[field]; }
    }
    return parseVehicleState(mechanicalInput);
}

function v1FromMechanical(mechanical: VehicleState): VehicleStateDocumentV1 {
    return {
        version: VEHICLE_STATE_DOCUMENT_V1_VERSION,
        vehicles: mechanical.vehicles,
        ...(mechanical.activeVehicleId === undefined ? {} : { activeVehicleId: mechanical.activeVehicleId }),
        ...(mechanical.updatedTurn === undefined ? {} : { updatedTurn: mechanical.updatedTurn }),
        ...(mechanical.warnings === undefined ? {} : { warnings: mechanical.warnings }),
    };
}

function v2FromMechanical(
    mechanical: VehicleState,
    receipts: VehicleRepairActionCommitReceipt[] | undefined
): VehicleStateDocumentV2 {
    return {
        version: VEHICLE_STATE_DOCUMENT_V2_VERSION,
        vehicles: mechanical.vehicles,
        ...(mechanical.activeVehicleId === undefined ? {} : { activeVehicleId: mechanical.activeVehicleId }),
        ...(mechanical.updatedTurn === undefined ? {} : { updatedTurn: mechanical.updatedTurn }),
        ...(mechanical.warnings === undefined ? {} : { warnings: mechanical.warnings }),
        ...(receipts === undefined ? {} : { gameplayCommitReceipts: receipts }),
    };
}

function cloneOptionalEffectIds(ids: [] | [string]): [] | [string] {
    if (ids.length === 0) { return []; }
    return [ids[0]];
}

function cloneClockSnapshot(
    snapshot: VehicleRepairActionCommitReceipt['clockSnapshot']
): VehicleRepairActionCommitReceipt['clockSnapshot'] {
    if (snapshot.length === 0) { return []; }
    return [{ clock: 'world', value: snapshot[0].value }];
}

function cloneReceipt(receipt: VehicleRepairActionCommitReceipt): VehicleRepairActionCommitReceipt {
    return {
        schemaVersion: VEHICLE_REPAIR_COMMIT_RECEIPT_VERSION,
        commitId: receipt.commitId,
        requestId: receipt.requestId,
        resolutionId: receipt.resolutionId,
        planId: receipt.planId,
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        actionVersion: VEHICLE_REPAIR_ACTION_VERSION,
        status: receipt.status,
        ledgerId: VEHICLE_STATE_LEDGER_ID,
        effectIds: [receipt.effectIds[0]],
        appliedEffectIds: cloneOptionalEffectIds(receipt.appliedEffectIds),
        skippedEffectIds: cloneOptionalEffectIds(receipt.skippedEffectIds),
        confirmationTokenDigest: receipt.confirmationTokenDigest,
        effectPlanDigest: receipt.effectPlanDigest,
        beforeLedgerDigest: receipt.beforeLedgerDigest,
        afterLedgerDigest: receipt.afterLedgerDigest,
        target: { kind: 'vehicle', id: receipt.target.id },
        requestedRepair: receipt.requestedRepair,
        hpBefore: receipt.hpBefore,
        hpAfter: receipt.hpAfter,
        effectiveRepair: receipt.effectiveRepair,
        ...(receipt.updatedTurnBefore === undefined ? {} : { updatedTurnBefore: receipt.updatedTurnBefore }),
        ...(receipt.updatedTurnAfter === undefined ? {} : { updatedTurnAfter: receipt.updatedTurnAfter }),
        clockSnapshot: cloneClockSnapshot(receipt.clockSnapshot),
    };
}

function parseVehicleStateDocumentUnchecked(input: unknown): VehicleStateDocumentParseResult {
    if (!isPlainRecord(input)) {
        return { kind: 'invalid_document', error: { code: 'invalid_root', path: '$' } };
    }
    if (typeof input.version === 'number'
        && Number.isSafeInteger(input.version)
        && input.version !== VEHICLE_STATE_DOCUMENT_V1_VERSION
        && input.version !== VEHICLE_STATE_DOCUMENT_V2_VERSION) {
        return { kind: 'unsupported_document_version', version: input.version };
    }
    if (input.version !== VEHICLE_STATE_DOCUMENT_V1_VERSION
        && input.version !== VEHICLE_STATE_DOCUMENT_V2_VERSION) {
        return { kind: 'invalid_document', error: { code: 'invalid_version', path: 'version' } };
    }

    const unsafeRootKey = firstUnsafeOwnKey(input);
    if (unsafeRootKey) {
        return {
            kind: 'invalid_document',
            error: { code: 'unsafe_object_key', path: unsafeRootKey },
        };
    }
    const allowedKeys = input.version === VEHICLE_STATE_DOCUMENT_V1_VERSION
        ? V1_DOCUMENT_KEYS
        : V2_DOCUMENT_KEYS;
    const unexpectedRootKey = firstUnexpectedOwnKey(input, allowedKeys);
    if (unexpectedRootKey) {
        return {
            kind: 'invalid_document',
            error: { code: 'unexpected_document_field', path: unexpectedRootKey },
        };
    }
    if (!Array.isArray(input.vehicles)) {
        return { kind: 'invalid_document', error: { code: 'missing_vehicles', path: 'vehicles' } };
    }

    const mechanical = canonicalMechanicalFromRecord(input);
    if (input.version === VEHICLE_STATE_DOCUMENT_V1_VERSION) {
        return { kind: 'valid_v1', document: v1FromMechanical(mechanical) };
    }

    let receipts: VehicleRepairActionCommitReceipt[] | undefined;
    if (hasOwn(input, 'gameplayCommitReceipts')) {
        if (!Array.isArray(input.gameplayCommitReceipts)) {
            return {
                kind: 'invalid_receipt_metadata',
                error: { code: 'invalid_receipts_type', path: 'gameplayCommitReceipts' },
            };
        }
        if (input.gameplayCommitReceipts.length > MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS) {
            return {
                kind: 'invalid_receipt_metadata',
                error: { code: 'too_many_receipts', path: 'gameplayCommitReceipts' },
            };
        }
        receipts = [];
        const seenReceipts = new Set<string>();
        const seenRequestIds = new Set<string>();
        const seenCommitIds = new Set<string>();
        for (let index = 0; index < input.gameplayCommitReceipts.length; index++) {
            const parsed = parseReceipt(input.gameplayCommitReceipts[index], index);
            if (!parsed.ok) {
                return { kind: 'invalid_receipt_metadata', error: parsed.error };
            }
            const canonicalReceipt = stableCanonicalStringify(
                parsed.receipt as unknown as CanonicalJsonValue
            );
            if (seenReceipts.has(canonicalReceipt)) {
                return {
                    kind: 'invalid_receipt_metadata',
                    error: {
                        code: 'duplicate_receipt',
                        path: `gameplayCommitReceipts[${index}]`,
                        receiptIndex: index,
                    },
                };
            }
            if (seenRequestIds.has(parsed.receipt.requestId)) {
                return {
                    kind: 'invalid_receipt_metadata',
                    error: {
                        code: 'duplicate_request_id',
                        path: `gameplayCommitReceipts[${index}].requestId`,
                        receiptIndex: index,
                    },
                };
            }
            if (seenCommitIds.has(parsed.receipt.commitId)) {
                return {
                    kind: 'invalid_receipt_metadata',
                    error: {
                        code: 'duplicate_commit_id',
                        path: `gameplayCommitReceipts[${index}].commitId`,
                        receiptIndex: index,
                    },
                };
            }
            seenReceipts.add(canonicalReceipt);
            seenRequestIds.add(parsed.receipt.requestId);
            seenCommitIds.add(parsed.receipt.commitId);
            receipts.push(parsed.receipt);
        }
    }
    return { kind: 'valid_v2', document: v2FromMechanical(mechanical, receipts) };
}

/** Parse a raw versioned document without writing, migrating, repairing, or mutating it. */
export function parseVehicleStateDocument(input: unknown): VehicleStateDocumentParseResult {
    try {
        return parseVehicleStateDocumentUnchecked(input);
    } catch {
        return {
            kind: 'invalid_document',
            error: { code: 'unreadable_document', path: '$' },
        };
    }
}

/** Current mechanics projection. Receipts are deliberately absent and the version is v1. */
export function projectVehicleStateDocumentMechanical(
    document: VehicleStateDocument
): VehicleState {
    return canonicalMechanicalFromRecord(document as unknown as Record<string, unknown>);
}

/** Canonical whole-document projection. Every array retains its source order. */
export function projectCanonicalVehicleStateDocument(
    document: VehicleStateDocument
): VehicleStateDocument {
    const mechanical = projectVehicleStateDocumentMechanical(document);
    if (document.version === VEHICLE_STATE_DOCUMENT_V1_VERSION) {
        return v1FromMechanical(mechanical);
    }
    const receipts = document.gameplayCommitReceipts?.map(cloneReceipt);
    return v2FromMechanical(mechanical, receipts);
}

/** Stable JSON text for an already-validated document; object keys are sorted, arrays are not. */
export function canonicalizeVehicleStateDocument(document: VehicleStateDocument): string {
    return stableCanonicalStringify(
        projectCanonicalVehicleStateDocument(document) as unknown as CanonicalJsonValue
    );
}

function domainSeparatedDigest(domain: string, value: CanonicalJsonValue): string {
    return digestCanonicalValue({ domain, value });
}

/** Digest of mechanical VehicleState only. Receipt metadata cannot recurse into this value. */
export function digestMechanicalVehicleStateDocument(document: VehicleStateDocument): string {
    return domainSeparatedDigest(
        'lore_relay.vehicle_state.mechanical.v1',
        projectVehicleStateDocumentMechanical(document) as unknown as CanonicalJsonValue
    );
}

/** Digest of the complete canonical versioned document, including ordered receipts. */
export function digestWholeVehicleStateDocument(document: VehicleStateDocument): string {
    return domainSeparatedDigest(
        'lore_relay.vehicle_state.whole_document.v1',
        projectCanonicalVehicleStateDocument(document) as unknown as CanonicalJsonValue
    );
}

function requireReceiptId(value: string, field: string): void {
    if (!isSafeReceiptId(value)) {
        throw new RangeError(`${field} must be a bounded non-path receipt identity`);
    }
}

function requireDigest(value: string, field: string): void {
    if (!isDigest(value)) {
        throw new RangeError(`${field} must be a lowercase SHA-256 digest`);
    }
}

function requireRepairFacts(
    requestedRepair: number,
    hpBefore: number,
    hpAfter: number,
    effectiveRepair: number
): void {
    if (!isSafeIntegerInRange(requestedRepair, 1, MAX_HP_VALUE)
        || !isSafeIntegerInRange(hpBefore, 0, MAX_HP_VALUE)
        || !isSafeIntegerInRange(hpAfter, 0, MAX_HP_VALUE)
        || !isSafeIntegerInRange(effectiveRepair, 0, MAX_HP_VALUE)
        || hpAfter < hpBefore
        || hpAfter - hpBefore !== effectiveRepair
        || effectiveRepair > requestedRepair) {
        throw new RangeError('repair facts must be bounded and internally consistent');
    }
}

/** Deterministic equality digest only; it is not a signature or authentication proof. */
export function digestVehicleRepairConfirmationToken(token: string): string {
    requireReceiptId(token, 'confirmationToken');
    return domainSeparatedDigest(
        'lore_relay.vehicle.repair.confirmation_token.v1',
        { token }
    );
}

export interface VehicleRepairEffectPlanDigestFacts {
    requestId: string;
    resolutionId: string;
    target: { kind: 'vehicle'; id: string };
    requestedRepair: number;
    hpBefore: number;
    hpAfter: number;
    effectiveRepair: number;
    confirmationTokenDigest: string;
    beforeLedgerDigest: string;
    afterLedgerDigest: string;
}

/** Digest supplied, bounded effect-plan facts without assigning any runtime authority. */
export function digestVehicleRepairEffectPlanFacts(
    facts: VehicleRepairEffectPlanDigestFacts
): string {
    requireReceiptId(facts.requestId, 'requestId');
    requireReceiptId(facts.resolutionId, 'resolutionId');
    if (facts.target.kind !== 'vehicle' || !VEHICLE_ID_RE.test(facts.target.id)) {
        throw new RangeError('target must be one bounded vehicle reference');
    }
    requireRepairFacts(
        facts.requestedRepair,
        facts.hpBefore,
        facts.hpAfter,
        facts.effectiveRepair
    );
    requireDigest(facts.confirmationTokenDigest, 'confirmationTokenDigest');
    requireDigest(facts.beforeLedgerDigest, 'beforeLedgerDigest');
    requireDigest(facts.afterLedgerDigest, 'afterLedgerDigest');
    return domainSeparatedDigest('lore_relay.vehicle.repair.effect_plan.v1', {
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        actionVersion: VEHICLE_REPAIR_ACTION_VERSION,
        ledgerId: VEHICLE_STATE_LEDGER_ID,
        effectType: 'repair_vehicle',
        effectOrder: 0,
        requestId: facts.requestId,
        resolutionId: facts.resolutionId,
        target: { kind: 'vehicle', id: facts.target.id },
        requestedRepair: facts.requestedRepair,
        hpBefore: facts.hpBefore,
        hpAfter: facts.hpAfter,
        effectiveRepair: facts.effectiveRepair,
        confirmationTokenDigest: facts.confirmationTokenDigest,
        beforeLedgerDigest: facts.beforeLedgerDigest,
        afterLedgerDigest: facts.afterLedgerDigest,
    });
}

export interface VehicleRepairReceiptIdentityFacts {
    requestId: string;
    resolutionId: string;
    effectPlanDigest: string;
    confirmationTokenDigest: string;
    beforeLedgerDigest: string;
    afterLedgerDigest: string;
    status: 'committed' | 'valid_noop';
    target: { kind: 'vehicle'; id: string };
    requestedRepair: number;
    hpBefore: number;
    hpAfter: number;
    effectiveRepair: number;
}

export interface VehicleRepairDerivedReceiptIdentity {
    planId: string;
    effectId: string;
    commitId: string;
}

/**
 * Derive storage-safe identities from supplied canonical facts. This creates no receipt and
 * uses no secret, so the identifiers provide correlation/deduplication, not authentication.
 */
export function deriveVehicleRepairReceiptIdentity(
    facts: VehicleRepairReceiptIdentityFacts
): VehicleRepairDerivedReceiptIdentity {
    requireReceiptId(facts.requestId, 'requestId');
    requireReceiptId(facts.resolutionId, 'resolutionId');
    requireDigest(facts.effectPlanDigest, 'effectPlanDigest');
    requireDigest(facts.confirmationTokenDigest, 'confirmationTokenDigest');
    requireDigest(facts.beforeLedgerDigest, 'beforeLedgerDigest');
    requireDigest(facts.afterLedgerDigest, 'afterLedgerDigest');
    if (facts.target.kind !== 'vehicle' || !VEHICLE_ID_RE.test(facts.target.id)) {
        throw new RangeError('target must be one bounded vehicle reference');
    }
    if (facts.status !== 'committed' && facts.status !== 'valid_noop') {
        throw new RangeError('status must be committed or valid_noop');
    }
    requireRepairFacts(
        facts.requestedRepair,
        facts.hpBefore,
        facts.hpAfter,
        facts.effectiveRepair
    );
    if (facts.status === 'committed'
        && (facts.effectiveRepair < 1 || facts.beforeLedgerDigest === facts.afterLedgerDigest)) {
        throw new RangeError('committed identity facts require a mechanical change');
    }
    if (facts.status === 'valid_noop'
        && (facts.effectiveRepair !== 0 || facts.beforeLedgerDigest !== facts.afterLedgerDigest)) {
        throw new RangeError('valid_noop identity facts must describe no mechanical change');
    }

    const planId = `vrp_${domainSeparatedDigest('lore_relay.vehicle.repair.plan_id.v1', {
        requestId: facts.requestId,
        resolutionId: facts.resolutionId,
        effectPlanDigest: facts.effectPlanDigest,
    })}`;
    const effectId = `vre_${domainSeparatedDigest('lore_relay.vehicle.repair.effect_id.v1', {
        planId,
        order: 0,
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        ledgerId: VEHICLE_STATE_LEDGER_ID,
        target: { kind: 'vehicle', id: facts.target.id },
    })}`;
    const commitId = `vrc_${domainSeparatedDigest('lore_relay.vehicle.repair.commit_id.v1', {
        requestId: facts.requestId,
        resolutionId: facts.resolutionId,
        planId,
        effectId,
        status: facts.status,
        confirmationTokenDigest: facts.confirmationTokenDigest,
        beforeLedgerDigest: facts.beforeLedgerDigest,
        afterLedgerDigest: facts.afterLedgerDigest,
    })}`;
    return { planId, effectId, commitId };
}
