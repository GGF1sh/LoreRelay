import * as crypto from 'crypto';

export const ACCEPTED_TURN_SCOPE_SCHEMA_VERSION = 1;
export const ACCEPTED_TURN_LEDGER_SCHEMA_VERSION = 1;
export const ACCEPTED_TURN_IDENTITY_DOMAIN = 'LoreRelayAcceptedTurn/v1';
export const RUNTIME_ACCEPTED_TURN_WITNESS_KEY = 'runtimeAcceptedTurn';

export type TurnResultFileOutcomeKind =
    | 'newlyAccepted'
    | 'alreadyAccepted'
    | 'missing'
    | 'retryableFailure'
    | 'rejected'
    | 'quarantined'
    | 'repairRequired'
    | 'writerConflict';

export interface TurnResultFileOutcome {
    kind: TurnResultFileOutcomeKind;
    accepted?: boolean;
    reason?: string;
    identityHash?: string;
    turnId?: string;
}

export interface AcceptedTurnScope {
    schemaVersion: 1;
    campaignInstanceId: string;
    timelineEpochId: string;
    createdAt: string;
    updatedAt: string;
}

export interface AcceptedTurnIdentity {
    campaignInstanceId: string;
    timelineEpochId: string;
    turnId: string;
    payloadHash: string;
    identityHash: string;
}

export interface AcceptedTurnWitness extends AcceptedTurnIdentity {
    parentIdentityHash?: string;
    acceptedAt: string;
}

export interface AcceptedTurnLedgerRecord extends AcceptedTurnWitness {
    ordinal: number;
    sourceRawHash?: string;
    observationSource?: string;
}

export interface AcceptedTurnLedger {
    schemaVersion: 1;
    campaignInstanceId: string;
    records: AcceptedTurnLedgerRecord[];
}

export interface AcceptedTurnCommitContext {
    identity: AcceptedTurnIdentity;
    parentIdentityHash?: string;
    sourceRawHash?: string;
    observationSource?: string;
    acceptedAt: string;
}

const HOST_ADDED_TURN_RESULT_FIELDS = new Set(['beforeHash', 'afterHash', 'appliedAt']);
const HEX_64 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableClone(value: unknown, omitHostFieldsAtRoot = false): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => stableClone(item));
    }
    if (!isRecord(value)) {
        return value;
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
        if (omitHostFieldsAtRoot && HOST_ADDED_TURN_RESULT_FIELDS.has(key)) {
            continue;
        }
        const child = value[key];
        if (child === undefined || typeof child === 'function' || typeof child === 'symbol') {
            continue;
        }
        out[key] = stableClone(child);
    }
    return out;
}

export function canonicalizeAcceptedTurnPayload(turnResult: unknown): string {
    return JSON.stringify(stableClone(turnResult, true));
}

export function sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function computeAcceptedTurnPayloadHash(turnResult: unknown): string {
    return sha256Hex(canonicalizeAcceptedTurnPayload(turnResult));
}

function requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} must be a non-empty string`);
    }
    return value.trim();
}

export function buildAcceptedTurnIdentity(turnResult: unknown, scope: AcceptedTurnScope): AcceptedTurnIdentity {
    if (!isRecord(turnResult)) {
        throw new Error('turnResult must be an object');
    }
    const turnId = requireNonEmptyString(turnResult.turnId, 'turnId');
    const campaignInstanceId = requireNonEmptyString(scope.campaignInstanceId, 'campaignInstanceId');
    const timelineEpochId = requireNonEmptyString(scope.timelineEpochId, 'timelineEpochId');
    const payloadHash = computeAcceptedTurnPayloadHash(turnResult);
    const identityHash = computeAcceptedTurnIdentityHash({
        campaignInstanceId,
        timelineEpochId,
        turnId,
        payloadHash,
    });
    return {
        campaignInstanceId,
        timelineEpochId,
        turnId,
        payloadHash,
        identityHash,
    };
}

export function computeAcceptedTurnIdentityHash(input: {
    campaignInstanceId: string;
    timelineEpochId: string;
    turnId: string;
    payloadHash: string;
}): string {
    return sha256Hex([
        ACCEPTED_TURN_IDENTITY_DOMAIN,
        input.campaignInstanceId,
        input.timelineEpochId,
        input.turnId,
        input.payloadHash,
    ].join('\0'));
}

export function buildAcceptedTurnWitness(context: AcceptedTurnCommitContext): AcceptedTurnWitness {
    return {
        ...context.identity,
        ...(context.parentIdentityHash ? { parentIdentityHash: context.parentIdentityHash } : {}),
        acceptedAt: context.acceptedAt,
    };
}

export function attachAcceptedTurnWitnessToState(
    state: Record<string, unknown>,
    context: AcceptedTurnCommitContext
): Record<string, unknown> {
    return {
        ...state,
        [RUNTIME_ACCEPTED_TURN_WITNESS_KEY]: buildAcceptedTurnWitness(context),
    };
}

export function readAcceptedTurnWitnessFromState(state: unknown): AcceptedTurnWitness | undefined {
    if (!isRecord(state)) {
        return undefined;
    }
    return parseAcceptedTurnWitness(state[RUNTIME_ACCEPTED_TURN_WITNESS_KEY]);
}

export function hasAcceptedTurnWitnessField(state: unknown): boolean {
    return isRecord(state) && Object.prototype.hasOwnProperty.call(state, RUNTIME_ACCEPTED_TURN_WITNESS_KEY);
}

export function isValidUuidLike(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-fA-F-]{16,80}$/.test(value)
        && value.trim().length > 0;
}

export function parseAcceptedTurnScope(value: unknown): AcceptedTurnScope | undefined {
    if (!isRecord(value) || value.schemaVersion !== ACCEPTED_TURN_SCOPE_SCHEMA_VERSION) {
        return undefined;
    }
    if (!isValidUuidLike(value.campaignInstanceId) || !isValidUuidLike(value.timelineEpochId)) {
        return undefined;
    }
    if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
        return undefined;
    }
    return value as unknown as AcceptedTurnScope;
}

export function parseAcceptedTurnWitness(value: unknown): AcceptedTurnWitness | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const fields = ['campaignInstanceId', 'timelineEpochId', 'turnId', 'payloadHash', 'identityHash', 'acceptedAt'];
    for (const field of fields) {
        if (typeof value[field] !== 'string' || !String(value[field]).trim()) {
            return undefined;
        }
    }
    if (!HEX_64.test(String(value.payloadHash)) || !HEX_64.test(String(value.identityHash))) {
        return undefined;
    }
    if (value.parentIdentityHash !== undefined && (typeof value.parentIdentityHash !== 'string' || !HEX_64.test(value.parentIdentityHash))) {
        return undefined;
    }
    const expectedIdentityHash = computeAcceptedTurnIdentityHash({
        campaignInstanceId: String(value.campaignInstanceId),
        timelineEpochId: String(value.timelineEpochId),
        turnId: String(value.turnId),
        payloadHash: String(value.payloadHash),
    });
    if (value.identityHash !== expectedIdentityHash) {
        return undefined;
    }
    return value as unknown as AcceptedTurnWitness;
}

export function parseAcceptedTurnLedger(
    value: unknown,
    expectedCampaignInstanceId?: string
): AcceptedTurnLedger | undefined {
    if (!isRecord(value) || value.schemaVersion !== ACCEPTED_TURN_LEDGER_SCHEMA_VERSION || !Array.isArray(value.records)) {
        return undefined;
    }
    if (typeof value.campaignInstanceId !== 'string' || !value.campaignInstanceId.trim()) {
        return undefined;
    }
    if (expectedCampaignInstanceId && value.campaignInstanceId !== expectedCampaignInstanceId) {
        return undefined;
    }
    const records: AcceptedTurnLedgerRecord[] = [];
    for (let i = 0; i < value.records.length; i++) {
        const raw = value.records[i];
        const witness = parseAcceptedTurnWitness(raw);
        if (!witness || !isRecord(raw) || raw.ordinal !== i + 1) {
            return undefined;
        }
        if (witness.campaignInstanceId !== value.campaignInstanceId) {
            return undefined;
        }
        if (raw.sourceRawHash !== undefined && (typeof raw.sourceRawHash !== 'string' || !HEX_64.test(raw.sourceRawHash))) {
            return undefined;
        }
        if (raw.observationSource !== undefined && typeof raw.observationSource !== 'string') {
            return undefined;
        }
        records.push(raw as unknown as AcceptedTurnLedgerRecord);
    }
    if (!validateAcceptedTurnLedgerChain(records)) {
        return undefined;
    }
    if (!validateAcceptedTurnLedgerUniqueness(records)) {
        return undefined;
    }
    return {
        schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
        campaignInstanceId: value.campaignInstanceId,
        records,
    };
}

export function validateAcceptedTurnLedgerUniqueness(records: AcceptedTurnLedgerRecord[]): boolean {
    const identities = new Set<string>();
    const sameEpochTurns = new Map<string, string>();
    for (const record of records) {
        if (identities.has(record.identityHash)) {
            return false;
        }
        identities.add(record.identityHash);
        const turnKey = [
            record.campaignInstanceId,
            record.timelineEpochId,
            record.turnId,
        ].join('\0');
        const priorPayload = sameEpochTurns.get(turnKey);
        if (priorPayload !== undefined && priorPayload !== record.payloadHash) {
            return false;
        }
        sameEpochTurns.set(turnKey, record.payloadHash);
    }
    return true;
}

export function validateAcceptedTurnLedgerChain(records: AcceptedTurnLedgerRecord[]): boolean {
    const epochHeads = new Map<string, string | undefined>();
    for (const record of records) {
        const epochKey = [
            record.campaignInstanceId,
            record.timelineEpochId,
        ].join('\0');
        const parent = epochHeads.get(epochKey);
        if (record.parentIdentityHash !== parent) {
            return false;
        }
        epochHeads.set(epochKey, record.identityHash);
    }
    return true;
}

export function ledgerHead(records: AcceptedTurnLedgerRecord[]): AcceptedTurnLedgerRecord | undefined {
    return records.length > 0 ? records[records.length - 1] : undefined;
}

export function activeEpochLedgerHead(
    records: AcceptedTurnLedgerRecord[],
    scope: Pick<AcceptedTurnScope, 'campaignInstanceId' | 'timelineEpochId'>
): AcceptedTurnLedgerRecord | undefined {
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (
            record.campaignInstanceId === scope.campaignInstanceId
            && record.timelineEpochId === scope.timelineEpochId
        ) {
            return record;
        }
    }
    return undefined;
}

export function sameAcceptedTurnIdentity(a: AcceptedTurnIdentity, b: AcceptedTurnIdentity): boolean {
    return a.campaignInstanceId === b.campaignInstanceId
        && a.timelineEpochId === b.timelineEpochId
        && a.turnId === b.turnId
        && a.payloadHash === b.payloadHash
        && a.identityHash === b.identityHash;
}

export function sameEpochTurnDifferentPayload(
    record: AcceptedTurnIdentity,
    identity: AcceptedTurnIdentity
): boolean {
    return record.campaignInstanceId === identity.campaignInstanceId
        && record.timelineEpochId === identity.timelineEpochId
        && record.turnId === identity.turnId
        && record.payloadHash !== identity.payloadHash;
}

export function createAcceptedTurnLedgerRecord(
    context: AcceptedTurnCommitContext,
    ordinal: number
): AcceptedTurnLedgerRecord {
    return {
        ...buildAcceptedTurnWitness(context),
        ordinal,
        ...(context.sourceRawHash ? { sourceRawHash: context.sourceRawHash } : {}),
        ...(context.observationSource ? { observationSource: context.observationSource } : {}),
    };
}
