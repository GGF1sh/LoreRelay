import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
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
    parseAcceptedTurnLedger,
    parseAcceptedTurnScope,
    readAcceptedTurnWitnessFromState,
    sameAcceptedTurnIdentity,
    sameEpochTurnDifferentPayload,
    type TurnResultFileOutcome,
} from './acceptedTurnReplayGuardCore';
import { writeJsonAtomic } from './workspacePaths';
import { commitGameStateAtPathForRuntimeAuthority } from './stateManager';

export type AcceptedTurnPreflightResult =
    | { kind: 'unseen'; context: AcceptedTurnCommitContext }
    | TurnResultFileOutcome;

const RUNTIME_DIR = path.join('.text-adventure', 'runtime');
const ACCEPTED_SCOPE_FILE = 'accepted_turn_scope.json';
const ACCEPTED_LEDGER_FILE = 'accepted_turn_ledger.json';
const WRITER_LEASE_FILE = 'writer_lease.json';
const WRITER_LEASE_LOCK_DIR = 'writer_lease.lock';
const WRITER_LEASE_LOCK_OWNER_FILE = 'owner.json';
const WRITER_LEASE_TIMEOUT_MS = 30_000;
const WRITER_LEASE_HEARTBEAT_MS = Math.max(
    10,
    Number(process.env.LORERELAY_WRITER_LEASE_HEARTBEAT_MS) || 10_000
);
const WRITER_LEASE_RECOVERY_GRACE_MS = 1_000;

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
    lockToken: string;
}

interface WriterLeaseLockOwner {
    schemaVersion: 1;
    hostInstanceId: string;
    pid: number;
    hostname: string;
    processStartedAt: string;
    createdAt: string;
    lockToken: string;
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

export function getAcceptedTurnWriterLeaseLockOwnerPath(workspacePath: string): string {
    return path.join(getAcceptedTurnWriterLeaseLockDir(workspacePath), WRITER_LEASE_LOCK_OWNER_FILE);
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

function hasRetainedTurnResult(workspacePath: string): boolean {
    return fs.existsSync(path.join(workspacePath, 'turn_result.json'));
}

function createAcceptedTurnScope(workspacePath: string): AcceptedTurnScope {
    const now = new Date().toISOString();
    const scope: AcceptedTurnScope = {
        schemaVersion: ACCEPTED_TURN_SCOPE_SCHEMA_VERSION,
        campaignInstanceId: crypto.randomUUID(),
        timelineEpochId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };
    writeJsonAtomic(getAcceptedTurnScopePath(workspacePath), scope, true);
    return scope;
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
    if (hasRetainedTurnResult(workspacePath)) {
        throw new Error('legacy ambiguous retained turn_result.json without accepted-turn scope');
    }
    return createAcceptedTurnScope(workspacePath);
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
    ensureRuntimeDir(workspacePath);
    loadExistingAcceptedTurnScope(workspacePath);
    quarantineRetainedTurnResult(workspacePath, 'campaign-rebind');
    clearCanonicalAcceptedTurnWitness(workspacePath);
    archiveAcceptedTurnLedgerForRebind(workspacePath);
    return createAcceptedTurnScope(workspacePath);
}

function archiveAcceptedTurnLedgerForRebind(workspacePath: string): void {
    const ledgerPath = getAcceptedTurnLedgerPath(workspacePath);
    const backupPath = `${ledgerPath}.bak`;
    const stamp = `${Date.now()}.${process.pid}.${crypto.randomUUID()}`;
    for (const filePath of [ledgerPath, backupPath]) {
        if (!fs.existsSync(filePath)) {
            continue;
        }
        const archivePath = `${filePath}.campaign-rebind.${stamp}.quarantined`;
        fs.renameSync(filePath, archivePath);
    }
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

    const head = activeEpochLedgerHead(ledger.records, scope);

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
    if (
        raw.schemaVersion !== 1
        || typeof raw.hostInstanceId !== 'string'
        || typeof raw.renewedAt !== 'string'
        || typeof raw.acquiredAt !== 'string'
        || typeof raw.processStartedAt !== 'string'
        || typeof raw.purpose !== 'string'
        || typeof raw.lockToken !== 'string'
        || !raw.lockToken
    ) {
        return undefined;
    }
    if (
        typeof raw.pid !== 'number'
        || typeof raw.hostname !== 'string'
        || typeof raw.leaseTimeoutMs !== 'number'
    ) {
        return undefined;
    }
    return raw as unknown as WriterLease;
}

function parseLockOwner(value: unknown): WriterLeaseLockOwner | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const raw = value as Record<string, unknown>;
    if (
        raw.schemaVersion !== 1
        || typeof raw.hostInstanceId !== 'string'
        || typeof raw.pid !== 'number'
        || typeof raw.hostname !== 'string'
        || typeof raw.processStartedAt !== 'string'
        || typeof raw.createdAt !== 'string'
        || typeof raw.lockToken !== 'string'
        || !raw.lockToken
    ) {
        return undefined;
    }
    return raw as unknown as WriterLeaseLockOwner;
}

function readLeaseState(leasePath: string): { exists: boolean; lease?: WriterLease; malformed: boolean } {
    if (!fs.existsSync(leasePath)) {
        return { exists: false, malformed: false };
    }
    try {
        const lease = parseLease(readJsonFile(leasePath));
        return { exists: true, lease, malformed: !lease };
    } catch {
        return { exists: true, malformed: true };
    }
}

function readLockOwner(lockDir: string): WriterLeaseLockOwner | undefined {
    const ownerPath = path.join(lockDir, WRITER_LEASE_LOCK_OWNER_FILE);
    if (!fs.existsSync(ownerPath)) {
        return undefined;
    }
    try {
        return parseLockOwner(readJsonFile(ownerPath));
    } catch {
        return undefined;
    }
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

function readProcessStartedAtEvidence(pid: number): string | undefined {
    if (!Number.isFinite(pid) || pid <= 0) {
        return undefined;
    }
    if (pid === process.pid) {
        return processStartedAt;
    }
    try {
        if (process.platform === 'win32') {
            const script = [
                '$ErrorActionPreference = "Stop"',
                `$p = Get-Process -Id ${Math.floor(pid)}`,
                '$p.StartTime.ToUniversalTime().ToString("o")',
            ].join('; ');
            return execFileSync(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-Command', script],
                { encoding: 'utf8', timeout: 1_000, windowsHide: true }
            ).trim();
        }
        const out = execFileSync(
            'ps',
            ['-p', String(Math.floor(pid)), '-o', 'lstart='],
            { encoding: 'utf8', timeout: 1_000 }
        ).trim();
        const parsed = Date.parse(out);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
    } catch {
        return undefined;
    }
}

function processStartMatchesLease(lease: WriterLease): boolean | undefined {
    const actual = readProcessStartedAtEvidence(lease.pid);
    const expectedMs = Date.parse(lease.processStartedAt);
    const actualMs = actual ? Date.parse(actual) : NaN;
    if (!Number.isFinite(expectedMs) || !Number.isFinite(actualMs)) {
        return undefined;
    }
    return Math.abs(expectedMs - actualMs) <= 2_000;
}

function isLeaseOwnerLive(lease: WriterLease, nowMs: number): boolean {
    if (lease.hostInstanceId === hostInstanceId) {
        return true;
    }
    if (lease.hostname !== os.hostname()) {
        return isLeaseRecentlyRenewed(lease, nowMs);
    }
    if (!isPidRunning(lease.pid)) {
        return false;
    }
    const startMatches = processStartMatchesLease(lease);
    if (startMatches === false) {
        return false;
    }
    return true;
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
    return !isLeaseOwnerLive(lease, nowMs);
}

function buildLockOwner(lockToken: string): WriterLeaseLockOwner {
    return {
        schemaVersion: 1,
        hostInstanceId,
        pid: process.pid,
        hostname: os.hostname(),
        processStartedAt,
        createdAt: new Date().toISOString(),
        lockToken,
    };
}

function buildWriterLease(purpose: string, lockToken: string, prior?: WriterLease): WriterLease {
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
        lockToken,
    };
}

function lockOwnerMatches(lockDir: string, lockToken: string): boolean {
    const owner = readLockOwner(lockDir);
    return Boolean(owner && owner.lockToken === lockToken && owner.hostInstanceId === hostInstanceId);
}

function tryAcquireFreshLease(workspacePath: string, purpose: string, prior?: WriterLease): boolean {
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const lockToken = crypto.randomUUID();
    try {
        fs.mkdirSync(lockDir);
        writeJsonAtomic(path.join(lockDir, WRITER_LEASE_LOCK_OWNER_FILE), buildLockOwner(lockToken), false);
        writeJsonAtomic(leasePath, buildWriterLease(purpose, lockToken, prior), false);
        startWriterLeaseHeartbeat(workspacePath);
        return true;
    } catch {
        try {
            const owner = readLockOwner(lockDir);
            if (owner?.lockToken === lockToken) {
                fs.rmSync(lockDir, { recursive: true, force: true });
            }
        } catch {
            // Preserve fail-closed behavior if cleanup is uncertain.
        }
        return false;
    }
}

function lockEvidenceAgeMs(lockDir: string, nowMs: number): number | undefined {
    try {
        const owner = readLockOwner(lockDir);
        const ownerMs = owner ? Date.parse(owner.createdAt) : NaN;
        if (Number.isFinite(ownerMs)) {
            return nowMs - ownerMs;
        }
        return nowMs - fs.statSync(lockDir).mtimeMs;
    } catch {
        return undefined;
    }
}

function fileEvidenceAgeMs(filePath: string, nowMs: number): number | undefined {
    try {
        return nowMs - fs.statSync(filePath).mtimeMs;
    } catch {
        return undefined;
    }
}

function recoveryDirFor(lockDir: string, reason: string, token: string): string {
    const safeToken = token.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) || 'unknown';
    return `${lockDir}.${reason}.${safeToken}.${process.pid}.${Date.now()}.recovered`;
}

function quarantineLeaseFile(leasePath: string, reason: string): void {
    if (!fs.existsSync(leasePath)) {
        return;
    }
    const quarantinePath = `${leasePath}.${reason}.${process.pid}.${Date.now()}.quarantined`;
    fs.renameSync(leasePath, quarantinePath);
}

function recoverLockByRename(
    workspacePath: string,
    reason: string,
    expectedToken: string | undefined,
    verifyBefore: () => boolean,
    verifyAfter: () => boolean = verifyBefore
): boolean {
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    if (!verifyBefore()) {
        return false;
    }
    const recoveryDir = recoveryDirFor(lockDir, reason, expectedToken ?? 'orphan');
    try {
        fs.renameSync(lockDir, recoveryDir);
    } catch {
        return false;
    }
    if (!verifyAfter()) {
        return false;
    }
    return true;
}

function recoverStaleLease(workspacePath: string, purpose: string, prior: WriterLease): boolean {
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    const verifyLease = () => {
        const state = readLeaseState(leasePath);
        if (!state.lease || state.lease.lockToken !== prior.lockToken) {
            return false;
        }
        if (!isForeignLeaseRecoverable(state.lease, Date.now())) {
            return false;
        }
        const owner = readLockOwner(lockDir);
        return Boolean(owner && owner.lockToken === prior.lockToken);
    };
    const verifyAfter = () => {
        const state = readLeaseState(leasePath);
        return Boolean(
            state.lease
            && state.lease.lockToken === prior.lockToken
            && isForeignLeaseRecoverable(state.lease, Date.now())
            && !fs.existsSync(lockDir)
        );
    };
    if (!recoverLockByRename(workspacePath, 'stale', prior.lockToken, verifyLease, verifyAfter)) {
        return false;
    }
    return tryAcquireFreshLease(workspacePath, purpose, prior);
}

function recoverOrphanOrMalformedLock(
    workspacePath: string,
    purpose: string,
    reason: 'orphan' | 'malformed',
    nowMs: number
): boolean {
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const ageMs = lockEvidenceAgeMs(lockDir, nowMs);
    if (ageMs === undefined || ageMs < WRITER_LEASE_RECOVERY_GRACE_MS) {
        return false;
    }
    const originalOwner = readLockOwner(lockDir);
    const originalToken = originalOwner?.lockToken;
    const verifyBefore = () => {
        if (!fs.existsSync(lockDir)) {
            return false;
        }
        const currentAgeMs = lockEvidenceAgeMs(lockDir, Date.now());
        if (currentAgeMs === undefined || currentAgeMs < WRITER_LEASE_RECOVERY_GRACE_MS) {
            return false;
        }
        const owner = readLockOwner(lockDir);
        return owner?.lockToken === originalToken;
    };
    if (!recoverLockByRename(workspacePath, reason, originalToken, verifyBefore, () => !fs.existsSync(lockDir))) {
        return false;
    }
    if (reason === 'malformed') {
        quarantineLeaseFile(leasePath, 'malformed-writer-lease');
    }
    return tryAcquireFreshLease(workspacePath, purpose);
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
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    if (!fs.existsSync(leasePath)) {
        return false;
    }
    const prior = parseLease(readJsonFile(leasePath));
    if (!prior || prior.hostInstanceId !== hostInstanceId || !lockOwnerMatches(lockDir, prior.lockToken)) {
        return false;
    }
    writeJsonAtomic(leasePath, buildWriterLease(purpose, prior.lockToken, prior), true);
    return true;
}

export function releaseAcceptedTurnWriterLeaseForTests(workspacePath: string): boolean {
    const leasePath = getAcceptedTurnWriterLeasePath(workspacePath);
    const lockDir = getAcceptedTurnWriterLeaseLockDir(workspacePath);
    const state = readLeaseState(leasePath);
    if (!state.lease || state.lease.hostInstanceId !== hostInstanceId || !lockOwnerMatches(lockDir, state.lease.lockToken)) {
        return false;
    }
    fs.rmSync(lockDir, { recursive: true, force: true });
    try {
        fs.unlinkSync(leasePath);
    } catch {
        // Lease may already have been removed by a test cleanup.
    }
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }
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
    const state = readLeaseState(leasePath);

    if (state.lease?.hostInstanceId === hostInstanceId) {
        if (!lockOwnerMatches(lockDir, state.lease.lockToken)) {
            if (!tryAcquireFreshLease(workspacePath, purpose, state.lease)) {
                return { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
            }
            return undefined;
        }
        writeJsonAtomic(leasePath, buildWriterLease(purpose, state.lease.lockToken, state.lease), true);
        startWriterLeaseHeartbeat(workspacePath);
        return undefined;
    }

    if (state.malformed) {
        if (fs.existsSync(lockDir) && recoverOrphanOrMalformedLock(workspacePath, purpose, 'malformed', nowMs)) {
            return undefined;
        }
        const malformedAgeMs = fileEvidenceAgeMs(leasePath, nowMs);
        if (
            !fs.existsSync(lockDir)
            && malformedAgeMs !== undefined
            && malformedAgeMs >= WRITER_LEASE_RECOVERY_GRACE_MS
        ) {
            try {
                quarantineLeaseFile(leasePath, 'malformed-writer-lease');
                if (tryAcquireFreshLease(workspacePath, purpose)) {
                    return undefined;
                }
            } catch {
                return { kind: 'writerConflict', accepted: false, reason: 'writer lease malformed recovery failed' };
            }
        }
        return {
            kind: 'writerConflict',
            accepted: false,
            reason: 'writer lease is malformed; authority is uncertain',
        };
    }

    if (state.lease) {
        if (!isForeignLeaseRecoverable(state.lease, nowMs)) {
            return {
                kind: 'writerConflict',
                accepted: false,
                reason: `writer lease held by ${state.lease.hostname}:${state.lease.pid}`,
            };
        }
        if (fs.existsSync(lockDir)) {
            return recoverStaleLease(workspacePath, purpose, state.lease)
                ? undefined
                : { kind: 'writerConflict', accepted: false, reason: 'writer lease stale takeover lost compare-and-swap' };
        }
        return tryAcquireFreshLease(workspacePath, purpose, state.lease)
            ? undefined
            : { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
    }

    if (fs.existsSync(lockDir)) {
        return recoverOrphanOrMalformedLock(workspacePath, purpose, 'orphan', nowMs)
            ? undefined
            : { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
    }

    return tryAcquireFreshLease(workspacePath, purpose)
        ? undefined
        : { kind: 'writerConflict', accepted: false, reason: 'writer lease lock is held' };
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
    const result = await runAcceptedTurnTimelineRestoreTransaction(workspacePath, reason, async () => undefined);
    if ('kind' in result) {
        return result;
    }
    return { ok: true, scope: result.scope };
}

export async function runAcceptedTurnTimelineRestoreTransaction<T>(
    workspacePath: string,
    reason: string,
    restoreMutation: (scope: AcceptedTurnScope) => Promise<T> | T
): Promise<{ ok: true; scope: AcceptedTurnScope; value: T } | TurnResultFileOutcome> {
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
        let scope: AcceptedTurnScope;
        try {
            scope = rotateAcceptedTurnTimelineEpoch(workspacePath);
        } catch (e) {
            return {
                kind: 'repairRequired',
                accepted: false,
                reason: `failed to rotate replay epoch: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        try {
            const value = await restoreMutation(scope);
            return { ok: true, scope, value };
        } catch (e) {
            return {
                kind: 'repairRequired',
                accepted: false,
                reason: `timeline restore failed after epoch rotation; manual repair required before accepting new TurnResult: ${e instanceof Error ? e.message : String(e)}`,
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
    const result = commitGameStateAtPathForRuntimeAuthority(statePath, state, {
        createBackup: true,
        mergeProfile: 'replace',
        runtimeAcceptedTurnWitnessMode: 'clear',
    });
    if (!result.ok) {
        throw new Error(`failed to clear canonical accepted-turn witness: ${result.reason.join('; ')}`);
    }
}

export function runAcceptedTurnSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
    const run = singleFlight.then(fn, fn);
    singleFlight = run.catch(() => undefined);
    return run;
}
