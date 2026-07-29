/**
 * Durable PENDING / closure storage under workspace .text-adventure/combat/
 * Never writes game_state.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { writeJsonAtomicNoVscode as writeJsonAtomic } from './campaignCombatAtomicWriteCore';
import {
    CombatOutcomeReceipt,
    CombatSessionClosureRecord,
} from './campaignCombatReceiptCore';
import { CampaignCombatRequest } from './campaignCombatRequestCore';

export function combatRootDir(workspacePath: string): string {
    return path.join(workspacePath, '.text-adventure', 'combat');
}

export function combatSessionDir(workspacePath: string, combatSessionId: string): string {
    return path.join(combatRootDir(workspacePath), 'sessions', combatSessionId);
}

export function pendingReceiptPath(workspacePath: string, combatSessionId: string): string {
    return path.join(combatRootDir(workspacePath), 'pending', `${combatSessionId}.json`);
}

export function closureRecordPath(workspacePath: string, combatSessionId: string): string {
    return path.join(combatRootDir(workspacePath), 'closures', `${combatSessionId}.json`);
}

export function appliedReceiptPath(workspacePath: string, combatSessionId: string): string {
    return path.join(combatRootDir(workspacePath), 'applied', `${combatSessionId}.json`);
}

/** V1-C: durable prompt inject ACK keyed by receiptHash (not session id). */
export function injectedConsequencePath(workspacePath: string, receiptHash: string): string {
    const safe = String(receiptHash || '').replace(/[^a-fA-F0-9]/g, '').slice(0, 128) || 'invalid';
    return path.join(combatRootDir(workspacePath), 'injected', `${safe}.json`);
}

export function writeCombatConsequenceInjectedMarker(
    workspacePath: string,
    marker: {
        schemaVersion: 'combat-consequence-injected-v1';
        combatSessionId: string;
        receiptHash: string;
        sourceDigest: string;
    },
): string {
    const filePath = injectedConsequencePath(workspacePath, marker.receiptHash);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonAtomic(filePath, marker);
    return filePath;
}

export function readCombatConsequenceInjectedMarker(
    workspacePath: string,
    receiptHash: string,
): {
    schemaVersion: 'combat-consequence-injected-v1';
    combatSessionId: string;
    receiptHash: string;
    sourceDigest: string;
} | undefined {
    const filePath = injectedConsequencePath(workspacePath, receiptHash);
    if (!fs.existsSync(filePath)) return undefined;
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (
            raw?.schemaVersion === 'combat-consequence-injected-v1'
            && typeof raw.receiptHash === 'string'
            && typeof raw.sourceDigest === 'string'
            && typeof raw.combatSessionId === 'string'
        ) {
            return raw;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * ACK contract for combatConsequence tokens after Accepted correlation.
 * alreadySatisfied only when exact receiptHash+sourceDigest marker exists.
 */
export function ackCombatConsequenceInjectedMarker(
    workspacePath: string,
    token: {
        combatSessionId: string;
        receiptHash: string;
        sourceDigest: string;
    },
): 'applied' | 'alreadySatisfied' | 'failed' {
    if (!token.receiptHash || !token.sourceDigest || !token.combatSessionId) {
        return 'failed';
    }
    const existing = readCombatConsequenceInjectedMarker(workspacePath, token.receiptHash);
    if (
        existing
        && existing.receiptHash === token.receiptHash
        && existing.sourceDigest === token.sourceDigest
        && existing.combatSessionId === token.combatSessionId
    ) {
        return 'alreadySatisfied';
    }
    if (existing && existing.receiptHash === token.receiptHash) {
        // Different digest or session for same receiptHash — authority conflict
        return 'failed';
    }
    try {
        writeCombatConsequenceInjectedMarker(workspacePath, {
            schemaVersion: 'combat-consequence-injected-v1',
            combatSessionId: token.combatSessionId,
            receiptHash: token.receiptHash,
            sourceDigest: token.sourceDigest,
        });
        return 'applied';
    } catch {
        return 'failed';
    }
}

export function writeAppliedCombatOutcomeMarker(
    workspacePath: string,
    marker: {
        schemaVersion: 'combat-outcome-applied-v1';
        combatSessionId: string;
        receiptHash: string;
        simulationResultHash: string;
        campaignInstanceId: string;
        timelineEpochId: string;
        compiledSnapshotHash?: string;
        historyAppended: boolean;
        playerHpUpdated: boolean;
    },
): string {
    const filePath = appliedReceiptPath(workspacePath, marker.combatSessionId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonAtomic(filePath, marker);
    return filePath;
}

export function readAppliedCombatOutcomeMarker(
    workspacePath: string,
    combatSessionId: string,
): {
    schemaVersion: 'combat-outcome-applied-v1';
    combatSessionId: string;
    receiptHash: string;
    simulationResultHash: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    compiledSnapshotHash?: string;
    historyAppended: boolean;
    playerHpUpdated: boolean;
} | undefined {
    const filePath = appliedReceiptPath(workspacePath, combatSessionId);
    if (!fs.existsSync(filePath)) return undefined;
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw?.schemaVersion === 'combat-outcome-applied-v1' && typeof raw.receiptHash === 'string') {
            return raw;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export function writeCampaignCombatSessionArtifacts(
    workspacePath: string,
    combatSessionId: string,
    request: CampaignCombatRequest,
    meta: Record<string, unknown>,
    compiled?: {
        battleSpec: unknown;
        rosterSnapshot: unknown;
        entityToUnitId: Record<string, string>;
        compiledSnapshotHash: string;
        fixtureId: string;
    },
): void {
    const dir = combatSessionDir(workspacePath, combatSessionId);
    fs.mkdirSync(dir, { recursive: true });
    writeJsonAtomic(path.join(dir, 'request.json'), request);
    writeJsonAtomic(path.join(dir, 'meta.json'), meta);
    if (compiled) {
        writeJsonAtomic(path.join(dir, 'battle-spec.json'), compiled.battleSpec);
        writeJsonAtomic(path.join(dir, 'compiled-roster.json'), {
            fixtureId: compiled.fixtureId,
            compiledSnapshotHash: compiled.compiledSnapshotHash,
            entityToUnitId: compiled.entityToUnitId,
            rosterSnapshot: compiled.rosterSnapshot,
        });
    }
}

export function readCompiledSessionSnapshot(
    workspacePath: string,
    combatSessionId: string,
): {
    battleSpec: unknown;
    rosterSnapshot: unknown;
    entityToUnitId: Record<string, string>;
    compiledSnapshotHash: string;
    fixtureId: string;
} | undefined {
    const dir = combatSessionDir(workspacePath, combatSessionId);
    const rosterPath = path.join(dir, 'compiled-roster.json');
    const specPath = path.join(dir, 'battle-spec.json');
    if (!fs.existsSync(rosterPath) || !fs.existsSync(specPath)) return undefined;
    try {
        const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8')) as {
            fixtureId: string;
            compiledSnapshotHash: string;
            entityToUnitId: Record<string, string>;
            rosterSnapshot: unknown;
        };
        const battleSpec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        if (!roster.compiledSnapshotHash) return undefined;
        return {
            battleSpec,
            rosterSnapshot: roster.rosterSnapshot,
            entityToUnitId: roster.entityToUnitId || {},
            compiledSnapshotHash: roster.compiledSnapshotHash,
            fixtureId: roster.fixtureId,
        };
    } catch {
        return undefined;
    }
}

export function writePendingCombatOutcomeReceipt(
    workspacePath: string,
    receipt: CombatOutcomeReceipt,
): string {
    const filePath = pendingReceiptPath(workspacePath, receipt.combatSessionId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonAtomic(filePath, receipt);
    return filePath;
}

export function writeCombatSessionClosure(
    workspacePath: string,
    closure: CombatSessionClosureRecord,
): string {
    const filePath = closureRecordPath(workspacePath, closure.combatSessionId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonAtomic(filePath, closure);
    return filePath;
}

export function readPendingCombatOutcomeReceipt(
    workspacePath: string,
    combatSessionId: string,
): CombatOutcomeReceipt | undefined {
    const filePath = pendingReceiptPath(workspacePath, combatSessionId);
    if (!fs.existsSync(filePath)) return undefined;
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CombatOutcomeReceipt;
        if (raw?.applyEligible === true && raw.schemaVersion === 'combat-outcome-receipt-v1') {
            return raw;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export type PendingDirectoryScanResult =
    | { ok: true; receipts: CombatOutcomeReceipt[] }
    | {
        ok: false;
        reason: 'INVALID_PENDING_RECEIPT';
        detail: string;
        fileName: string;
    };

/**
 * Scan pending/*.json fail-closed.
 * Any unreadable JSON or non apply-eligible receipt schema blocks the whole directory
 * so a newer absolute-HP receipt cannot leapfrog a corrupt older file.
 * Non-.json names are ignored. Does not delete or quarantine.
 */
export function scanPendingDirectoryForApply(workspacePath: string): PendingDirectoryScanResult {
    const dir = path.join(combatRootDir(workspacePath), 'pending');
    if (!fs.existsSync(dir)) {
        return { ok: true, receipts: [] };
    }
    const receipts: CombatOutcomeReceipt[] = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const filePath = path.join(dir, name);
        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            return {
                ok: false,
                reason: 'INVALID_PENDING_RECEIPT',
                fileName: name,
                detail: `malformed JSON in pending/${name}: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        if (
            !raw
            || typeof raw !== 'object'
            || Array.isArray(raw)
            || (raw as CombatOutcomeReceipt).schemaVersion !== 'combat-outcome-receipt-v1'
            || (raw as CombatOutcomeReceipt).applyEligible !== true
        ) {
            return {
                ok: false,
                reason: 'INVALID_PENDING_RECEIPT',
                fileName: name,
                detail: `pending/${name} is not an apply-eligible combat-outcome-receipt-v1`,
            };
        }
        receipts.push(raw as CombatOutcomeReceipt);
    }
    return { ok: true, receipts };
}

/**
 * Apply candidates only — closures never listed.
 * Prefer `scanPendingDirectoryForApply` for apply batches (fail-closed on corrupt files).
 * This helper returns only structurally valid receipts; it does not report invalid files.
 */
export function listPendingApplyEligibleReceipts(workspacePath: string): CombatOutcomeReceipt[] {
    const scan = scanPendingDirectoryForApply(workspacePath);
    return scan.ok ? scan.receipts : [];
}
