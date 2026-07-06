import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
    ACCEPTED_TURN_SCOPE_SCHEMA_VERSION,
    type AcceptedTurnCommitContext,
    type AcceptedTurnIdentity,
    type AcceptedTurnLedger,
    type AcceptedTurnLedgerRecord,
    type AcceptedTurnScope,
    buildAcceptedTurnIdentity,
    createAcceptedTurnLedgerRecord,
    ledgerHead,
    parseAcceptedTurnLedger,
    parseAcceptedTurnScope,
    readAcceptedTurnWitnessFromState,
    sameAcceptedTurnIdentity,
    sameEpochTurnDifferentPayload,
    type TurnResultFileOutcome,
} from './acceptedTurnReplayGuardCore';
import { writeJsonAtomic } from './workspacePaths';

export type AcceptedTurnPreflightResult =
    | { kind: 'unseen'; context: AcceptedTurnCommitContext }
    | TurnResultFileOutcome;

const RUNTIME_DIR = path.join('.text-adventure', 'runtime');
const ACCEPTED_SCOPE_FILE = 'accepted_turn_scope.json';
const ACCEPTED_LEDGER_FILE = 'accepted_turn_ledger.json';
const WRITER_LEASE_FILE = 'writer_lease.json';
const WRITER_LEASE_TIMEOUT_MS = 30_000;

const hostInstanceId = crypto.randomUUID();
const processStartedAt = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();
let singleFlight: Promise<unknown> = Promise.resolve();

interface WriterLease {
    schemaVersion: 1;
    hostInstanceId: string;
    pid: number;
    hostname: string;
    processStartedAt: string;
    acquiredAt: string;
    renewedAt: string;
    purpose: string;
    leaseTimeoutMs: number;
}

export function getAcceptedTurnRuntimeDir(workspacePath: string): string {
    return path.join(workspacePath, RUNTIME_DIR);
}

export function getAcceptedTurnScopePath(workspacePath: string): string {
    return path.join(getAcceptedTurnRuntimeDir(workspacePath), ACCEPTED_SCOPE_FILE);
}

export function getAcceptedTurnLedgerPath(workspacePath: string): string {
    return path.join(getAcceptedTurnRuntimeDir(workspacePath), ACCEPTED_LEDGER_FILE);
}

export function getAcceptedTurnWriterLeasePath(workspacePath: string): string {
    return path.join(getAcceptedTurnRuntimeDir(workspacePath), WRITER_LEASE_FILE);
}

export function resetAcceptedTurnReplayGuardForTests(): void {
    singleFlight = Promise.resolve();
}

function readJsonFile(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function ensureRuntimeDir(workspacePath: string): void {
    fs.mkdirSync(getAcceptedTurnRuntimeDir(workspacePath), { recursive: true });
}

export function ensureAcceptedTurnScope(workspacePath: string): AcceptedTurnScope {
    ensureRuntimeDir(workspacePath);
    const scopePath = getAcceptedTurnScopePath(workspacePath);
    if (fs.existsSync(scopePath)) {
        const parsed = parseAcceptedTurnScope(readJsonFile(scopePath));
        if (!parsed) {
            throw new Error('accepted turn scope is corrupt');
        }
        return parsed;
    }
    const now = new Date().toISOString();
    const scope: AcceptedTurnScope = {
        schemaVersion: ACCEPTED_TURN_SCOPE_SCHEMA_VERSION,
        campaignInstanceId: crypto.randomUUID(),
        timelineEpochId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };
    writeJsonAtomic(scopePath, scope, true);
    return scope;
}

export function rotateAcceptedTurnTimelineEpoch(workspacePath: string): AcceptedTurnScope {
    const prior = ensureAcceptedTurnScope(workspacePath);
    const next: AcceptedTurnScope = {
        ...prior,
        timelineEpochId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(getAcceptedTurnScopePath(workspacePath), next, true);
    quarantineRetainedTurnResult(workspacePath, 'epoch-rotate');
    return next;
}

export function rebindAcceptedTurnCampaignInstance(workspacePath: string): AcceptedTurnScope {
    const prior = ensureAcceptedTurnScope(workspacePath);
    const next: AcceptedTurnScope = {
        ...prior,
        campaignInstanceId: crypto.randomUUID(),
        timelineEpochId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(getAcceptedTurnScopePath(workspacePath), next, true);
    quarantineRetainedTurnResult(workspacePath, 'campaign-rebind');
    return next;
}

function emptyLedger(): AcceptedTurnLedger {
    return { schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION, records: [] };
}

export function loadAcceptedTurnLedger(workspacePath: string): AcceptedTurnLedger {
    ensureRuntimeDir(workspacePath);
    const ledgerPath = getAcceptedTurnLedgerPath(workspacePath);
    const backupPath = `${ledgerPath}.bak`;
    if (!fs.existsSync(ledgerPath)) {
        return emptyLedger();
    }
    try {
        const parsed = parseAcceptedTurnLedger(readJsonFile(ledgerPath));
        if (parsed) {
            return parsed;
        }
    } catch {
        // Try backup before declaring repairRequired.
    }
    if (fs.existsSync(backupPath)) {
        try {
            const backup = parseAcceptedTurnLedger(readJsonFile(backupPath));
            if (backup) {
                writeJsonAtomic(ledgerPath, backup, true);
                return backup;
            }
        } catch {
            // fall through
        }
    }
    throw new Error('accepted turn ledger is corrupt');
}

function writeAcceptedTurnLedger(workspacePath: string, ledger: AcceptedTurnLedger): void {
    writeJsonAtomic(getAcceptedTurnLedgerPath(workspacePath), ledger, true);
}

function readWitnessFromGameState(workspacePath: string) {
    const statePath = path.join(workspacePath, 'game_state.json');
    if (!fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        return readAcceptedTurnWitnessFromState(readJsonFile(statePath));
    } catch {
        return undefined;
    }
}

function recordMatchesIdentity(record: AcceptedTurnLedgerRecord, identity: AcceptedTurnIdentity): boolean {
    return sameAcceptedTurnIdentity(record, identity);
}

function isWitnessOneStepAhead(
    witness: AcceptedTurnLedgerRecord,
    identity: AcceptedTurnIdentity,
    head: AcceptedTurnLedgerRecord | undefined
): boolean {
    return sameAcceptedTurnIdentity(witness, identity)
        && witness.parentIdentityHash === head?.identityHash;
}

export function preflightAcceptedTurn(
    workspacePath: string,
    turnResult: unknown,
    sourceRawHash?: string,
    observationSource = 'turn_result_file'
): AcceptedTurnPreflightResult {
    let scope: AcceptedTurnScope;
    let ledger: AcceptedTurnLedger;
    let identity: AcceptedTurnIdentity;
    try {
        scope = ensureAcceptedTurnScope(workspacePath);
        identity = buildAcceptedTurnIdentity(turnResult, scope);
        ledger = loadAcceptedTurnLedger(workspacePath);
    } catch (e) {
        return {
            kind: 'repairRequired',
            accepted: false,
            reason: e instanceof Error ? e.message : String(e),
        };
    }

    if (ledger.records.some((record) => recordMatchesIdentity(record, identity))) {
        return { kind: 'alreadyAccepted', accepted: false, identityHash: identity.identityHash, turnId: identity.turnId };
    }
    if (ledger.records.some((record) => sameEpochTurnDifferentPayload(record, identity))) {
        return {
            kind: 'quarantined',
            accepted: false,
            identityHash: identity.identityHash,
            turnId: identity.turnId,
            reason: 'same turnId already accepted in this epoch with different payload',
        };
    }

    const head = ledgerHead(ledger.records);
    const witness = readWitnessFromGameState(workspacePath);
    if (witness && witness.campaignInstanceId === scope.campaignInstanceId && witness.timelineEpochId === scope.timelineEpochId) {
        const witnessRecord: AcceptedTurnLedgerRecord = { ...witness, ordinal: ledger.records.length + 1 };
        if (ledger.records.some((record) => record.identityHash === witness.identityHash)) {
            // Existing historical witness is fine; a new identity may proceed.
        } else if (isWitnessOneStepAhead(witnessRecord, identity, head)) {
            writeAcceptedTurnLedger(workspacePath, {
                schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
                records: [...ledger.records, witnessRecord],
            });
            return { kind: 'alreadyAccepted', accepted: false, identityHash: identity.identityHash, turnId: identity.turnId };
        } else if (witness.identityHash !== head?.identityHash) {
            return {
                kind: 'repairRequired',
                accepted: false,
                identityHash: identity.identityHash,
                turnId: identity.turnId,
                reason: 'canonical witness is not reconciled with accepted-turn ledger',
            };
        }
    }

    return {
        kind: 'unseen',
        context: {
            identity,
            parentIdentityHash: head?.identityHash,
            sourceRawHash,
            observationSource,
            acceptedAt: new Date().toISOString(),
        },
    };
}

export function recordAcceptedTurnAfterCommit(workspacePath: string, context: AcceptedTurnCommitContext): void {
    const ledger = loadAcceptedTurnLedger(workspacePath);
    if (ledger.records.some((record) => record.identityHash === context.identity.identityHash)) {
        return;
    }
    const record = createAcceptedTurnLedgerRecord(context, ledger.records.length + 1);
    writeAcceptedTurnLedger(workspacePath, {
        schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
        records: [...ledger.records, record],
    });
}

function parseLease(value: unknown): WriterLease | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || typeof raw.hostInstanceId !== 'string' || typeof raw.renewedAt !== 'string') {
        return undefined;
    }
    if (typeof raw.pid !== 'number' || typeof raw.hostname !== 'string') {
        return undefined;
    }
    return raw as unknown as WriterLease;
}

function isLeaseLive(lease: WriterLease, nowMs: number): boolean {
    const renewed = Date.parse(lease.renewedAt);
    return Number.isFinite(renewed) && nowMs - renewed < (lease.leaseTimeoutMs || WRITER_LEASE_TIMEOUT_MS);
}

export function ensureAcceptedTurnWriterLease(
    workspacePath: string,
    purpose: string
): TurnResultFileOutcome | undefined {
    ensureRuntimeDir(workspacePath);
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    let prior: WriterLease | undefined;
    if (fs.existsSync(leasePath)) {
        try {
            prior = parseLease(readJsonFile(leasePath));
        } catch {
            prior = undefined;
        }
    }
    if (prior && prior.hostInstanceId !== hostInstanceId && isLeaseLive(prior, nowMs)) {
        return {
            kind: 'writerConflict',
            accepted: false,
            reason: `live writer lease held by ${prior.hostname}:${prior.pid}`,
        };
    }
    const lease: WriterLease = {
        schemaVersion: 1,
        hostInstanceId,
        pid: process.pid,
        hostname: os.hostname(),
        processStartedAt,
        acquiredAt: prior?.hostInstanceId === hostInstanceId ? prior.acquiredAt : now,
        renewedAt: now,
        purpose,
        leaseTimeoutMs: WRITER_LEASE_TIMEOUT_MS,
    };
    writeJsonAtomic(leasePath, lease, true);
    return undefined;
}

export function quarantineRetainedTurnResult(workspacePath: string, reason: string): void {
    const turnResultPath = path.join(workspacePath, 'turn_result.json');
    if (!fs.existsSync(turnResultPath)) {
        return;
    }
    const quarantinePath = path.join(
        getAcceptedTurnRuntimeDir(workspacePath),
        `turn_result.${reason}.${Date.now()}.quarantined.json`
    );
    ensureRuntimeDir(workspacePath);
    fs.renameSync(turnResultPath, quarantinePath);
}

export function runAcceptedTurnSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
    const run = singleFlight.then(fn, fn);
    singleFlight = run.catch(() => undefined);
    return run;
}
