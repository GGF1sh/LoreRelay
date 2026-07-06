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
    activeEpochLedgerHead,
    hasAcceptedTurnWitnessField,
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
const WRITER_LEASE_LOCK_DIR = 'writer_lease.lock';
const WRITER_LEASE_TIMEOUT_MS = 30_000;
const WRITER_LEASE_HEARTBEAT_MS = 10_000;

const hostInstanceId = crypto.randomUUID();
const processStartedAt = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();
let singleFlight: Promise<unknown> = Promise.resolve();
let heartbeatTimer: NodeJS.Timeout | undefined;

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

export function getAcceptedTurnWriterLeaseLockDir(workspacePath: string): string {
    return path.join(getAcceptedTurnRuntimeDir(workspacePath), WRITER_LEASE_LOCK_DIR);
}

export function resetAcceptedTurnReplayGuardForTests(): void {
    singleFlight = Promise.resolve();
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }
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

export function loadExistingAcceptedTurnScope(workspacePath: string): AcceptedTurnScope | undefined {
    const scopePath = getAcceptedTurnScopePath(workspacePath);
    if (!fs.existsSync(scopePath)) {
        return undefined;
    }
    const parsed = parseAcceptedTurnScope(readJsonFile(scopePath));
    if (!parsed) {
        throw new Error('accepted turn scope is corrupt');
    }
    return parsed;
}

export function rotateAcceptedTurnTimelineEpoch(workspacePath: string): AcceptedTurnScope {
    const prior = ensureAcceptedTurnScope(workspacePath);
    const next: AcceptedTurnScope = {
        ...prior,
        timelineEpochId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(getAcceptedTurnScopePath(workspacePath), next, true);
    return next;
}

export function rebindAcceptedTurnCampaignInstance(workspacePath: string): AcceptedTurnScope {
    const prior = ensureAcceptedTurnScope(workspacePath);
    quarantineRetainedTurnResult(workspacePath, 'campaign-rebind');
    const next: AcceptedTurnScope = {
        ...prior,
        campaignInstanceId: crypto.randomUUID(),
        timelineEpochId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(getAcceptedTurnScopePath(workspacePath), next, true);
    return next;
}

function emptyLedger(campaignInstanceId: string): AcceptedTurnLedger {
    return { schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION, campaignInstanceId, records: [] };
}

export function loadAcceptedTurnLedger(workspacePath: string, campaignInstanceId?: string): AcceptedTurnLedger {
    ensureRuntimeDir(workspacePath);
    const ledgerPath = getAcceptedTurnLedgerPath(workspacePath);
    const backupPath = `${ledgerPath}.bak`;
    if (!fs.existsSync(ledgerPath)) {
        if (!campaignInstanceId) {
            throw new Error('accepted turn ledger missing campaign authority');
        }
        return emptyLedger(campaignInstanceId);
    }
    try {
        const parsed = parseAcceptedTurnLedger(readJsonFile(ledgerPath), campaignInstanceId);
        if (parsed) {
            return parsed;
        }
    } catch {
        // Try backup before declaring repairRequired.
    }
    if (fs.existsSync(backupPath)) {
        try {
            const backup = parseAcceptedTurnLedger(readJsonFile(backupPath), campaignInstanceId);
            if (backup) {
                writeJsonAtomic(ledgerPath, backup, false);
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

function readGameStateRecord(workspacePath: string): Record<string, unknown> | undefined {
    const statePath = path.join(workspacePath, 'game_state.json');
    if (!fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const value = readJsonFile(statePath);
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined;
    } catch {
        return undefined;
    }
}

function recordMatchesIdentity(record: AcceptedTurnLedgerRecord, identity: AcceptedTurnIdentity): boolean {
    return sameAcceptedTurnIdentity(record, identity);
}

function isWitnessOneStepAhead(
    witness: AcceptedTurnLedgerRecord,
    head: AcceptedTurnLedgerRecord | undefined
): boolean {
    return witness.parentIdentityHash === head?.identityHash;
}

function reconcileWitnessBeforeCurrentInput(
    workspacePath: string,
    scope: AcceptedTurnScope,
    ledger: AcceptedTurnLedger
): { ok: true; ledger: AcceptedTurnLedger } | TurnResultFileOutcome {
    const state = readGameStateRecord(workspacePath);
    const hasWitnessField = hasAcceptedTurnWitnessField(state);
    const witness = readAcceptedTurnWitnessFromState(state);
    const activeHead = activeEpochLedgerHead(ledger.records, scope);

    if (hasWitnessField && !witness) {
        return { kind: 'repairRequired', accepted: false, reason: 'canonical accepted-turn witness is malformed' };
    }
    if (!witness) {
        if (activeHead) {
            return { kind: 'repairRequired', accepted: false, reason: 'active accepted ledger head exists but canonical witness is missing' };
        }
        return { ok: true, ledger };
    }
    if (witness.campaignInstanceId !== scope.campaignInstanceId) {
        return { kind: 'repairRequired', accepted: false, reason: 'canonical witness belongs to a different campaign' };
    }
    if (witness.timelineEpochId !== scope.timelineEpochId) {
        return { kind: 'repairRequired', accepted: false, reason: 'canonical witness belongs to a different timeline epoch' };
    }
    if (activeHead && sameAcceptedTurnIdentity(witness, activeHead)) {
        return { ok: true, ledger };
    }
    const witnessRecord: AcceptedTurnLedgerRecord = { ...witness, ordinal: ledger.records.length + 1 };
    if (isWitnessOneStepAhead(witnessRecord, activeHead)) {
        const repaired: AcceptedTurnLedger = {
            schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
            campaignInstanceId: ledger.campaignInstanceId,
            records: [...ledger.records, witnessRecord],
        };
        writeAcceptedTurnLedger(workspacePath, repaired);
        return { ok: true, ledger: repaired };
    }
    return { kind: 'repairRequired', accepted: false, reason: 'canonical witness is not reconciled with accepted-turn ledger' };
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
        scope = loadExistingAcceptedTurnScope(workspacePath) ?? (() => {
            if (fs.existsSync(path.join(workspacePath, 'turn_result.json'))) {
                throw new Error('legacy ambiguous retained turn_result.json without accepted-turn scope');
            }
            return ensureAcceptedTurnScope(workspacePath);
        })();
        identity = buildAcceptedTurnIdentity(turnResult, scope);
        ledger = loadAcceptedTurnLedger(workspacePath, scope.campaignInstanceId);
    } catch (e) {
        return {
            kind: 'repairRequired',
            accepted: false,
            reason: e instanceof Error ? e.message : String(e),
        };
    }

    const reconciled = reconcileWitnessBeforeCurrentInput(workspacePath, scope, ledger);
    if ('kind' in reconciled) {
        return {
            ...reconciled,
            identityHash: identity.identityHash,
            turnId: identity.turnId,
        };
    }
    ledger = reconciled.ledger;

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
    const ledger = loadAcceptedTurnLedger(workspacePath, context.identity.campaignInstanceId);
    if (ledger.records.some((record) => record.identityHash === context.identity.identityHash)) {
        return;
    }
    const record = createAcceptedTurnLedgerRecord(context, ledger.records.length + 1);
    writeAcceptedTurnLedger(workspacePath, {
        schemaVersion: ACCEPTED_TURN_LEDGER_SCHEMA_VERSION,
        campaignInstanceId: context.identity.campaignInstanceId,
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

function isLeaseRecentlyRenewed(lease: WriterLease, nowMs: number): boolean {
    const renewed = Date.parse(lease.renewedAt);
    return Number.isFinite(renewed) && nowMs - renewed < (lease.leaseTimeoutMs || WRITER_LEASE_TIMEOUT_MS);
}

function isPidRunning(pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function isForeignLeaseRecoverable(lease: WriterLease, nowMs: number): boolean {
    if (lease.hostInstanceId === hostInstanceId) {
        return true;
    }
    if (isLeaseRecentlyRenewed(lease, nowMs)) {
        return false;
    }
    if (lease.hostname !== os.hostname()) {
        return false;
    }
    // A live PID remains protected even after timeout; timeout alone is not authority.
    return !isPidRunning(lease.pid);
}

function buildWriterLease(purpose: string, prior?: WriterLease): WriterLease {
    const now = new Date().toISOString();
    return {
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
}

function startWriterLeaseHeartbeat(workspacePath: string): void {
    if (heartbeatTimer) {
        return;
    }
    heartbeatTimer = setInterval(() => {
        try {
            renewAcceptedTurnWriterLeaseForTests(workspacePath, 'heartbeat');
        } catch {
            // Losing the heartbeat should not throw from the timer; the next
            // mutating entry point will fail closed on lease validation.
        }
    }, WRITER_LEASE_HEARTBEAT_MS);
    heartbeatTimer.unref?.();
}

export function renewAcceptedTurnWriterLeaseForTests(workspacePath: string, purpose: string): boolean {
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    if (!fs.existsSync(leasePath)) {
        return false;
    }
    const prior = parseLease(readJsonFile(leasePath));
    if (!prior || prior.hostInstanceId !== hostInstanceId) {
        return false;
    }
    writeJsonAtomic(leasePath, buildWriterLease(purpose, prior), true);
    return true;
}

export function ensureAcceptedTurnWriterLease(
    workspacePath: string,
    purpose: string
): TurnResultFileOutcome | undefined {
    ensureRuntimeDir(workspacePath);
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    const nowMs = Date.now();
    let prior: WriterLease | undefined;
    if (fs.existsSync(leasePath)) {
        try {
            prior = parseLease(readJsonFile(leasePath));
        } catch {
            prior = undefined;
        }
    }
    if (fs.existsSync(leasePath) && !prior) {
        return {
            kind: 'writerConflict',
            accepted: false,
            reason: 'writer lease is malformed; authority is uncertain',
        };
    }
    if (prior?.hostInstanceId === hostInstanceId) {
        writeJsonAtomic(leasePath, buildWriterLease(purpose, prior), true);
        startWriterLeaseHeartbeat(workspacePath);
        return undefined;
    }
    if (prior && !isForeignLeaseRecoverable(prior, nowMs)) {
        return {
            kind: 'writerConflict',
            accepted: false,
            reason: `writer lease held by ${prior.hostname}:${prior.pid}`,
        };
    }

    try {
        fs.mkdirSync(lockDir);
    } catch {
        if (prior && isForeignLeaseRecoverable(prior, nowMs)) {
            try {
                fs.rmSync(lockDir, { recursive: true, force: true });
                fs.mkdirSync(lockDir);
            } catch {
                return { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
            }
        } else {
            return { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
        }
    }

    writeJsonAtomic(leasePath, buildWriterLease(purpose, prior), false);
    startWriterLeaseHeartbeat(workspacePath);
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
    if (fs.existsSync(turnResultPath)) {
        throw new Error('retained turn_result.json quarantine did not remove root file');
    }
}

export async function prepareAcceptedTurnTimelineRestore(
    workspacePath: string,
    reason: string
): Promise<{ ok: true; scope: AcceptedTurnScope } | TurnResultFileOutcome> {
    return runAcceptedTurnSingleFlight(async () => {
        const leaseConflict = ensureAcceptedTurnWriterLease(workspacePath, reason);
        if (leaseConflict) {
            return leaseConflict;
        }
        try {
            quarantineRetainedTurnResult(workspacePath, reason);
        } catch (e) {
            return {
                kind: 'repairRequired',
                accepted: false,
                reason: `failed to quarantine retained turn_result.json before epoch rotation: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        try {
            return { ok: true, scope: rotateAcceptedTurnTimelineEpoch(workspacePath) };
        } catch (e) {
            return {
                kind: 'repairRequired',
                accepted: false,
                reason: `failed to rotate replay epoch: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
    });
}

export function clearCanonicalAcceptedTurnWitness(workspacePath: string): void {
    const statePath = path.join(workspacePath, 'game_state.json');
    if (!fs.existsSync(statePath)) {
        return;
    }
    const state = readGameStateRecord(workspacePath);
    if (!state || !hasAcceptedTurnWitnessField(state)) {
        return;
    }
    const next = { ...state };
    delete next.runtimeAcceptedTurn;
    writeJsonAtomic(statePath, next, true);
}

export function runAcceptedTurnSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
    const run = singleFlight.then(fn, fn);
    singleFlight = run.catch(() => undefined);
    return run;
}
