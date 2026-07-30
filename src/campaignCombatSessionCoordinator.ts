/**
 * Campaign combat session coordinator (Architecture B).
 * Owns campaign identity, lifecycle, durable PENDING — Host is sim/presentation only.
 * V1-A: no game_state mutation.
 */
import { randomUUID } from 'crypto';
import { CombatCommandPlaytestHost } from './combatCommandPlaytestHost';
import {
    buildDebugCampaignCombatRequest,
    CampaignCombatRequest,
    validateCampaignCombatRequest,
} from './campaignCombatRequestCore';
import {
    compileCampaignCombatRequest,
    CompiledCampaignCombat,
    loadDefaultCombatLabCatalog,
} from './campaignCombatCompileCore';
import {
    buildCombatOutcomeReceipt,
    buildCombatSessionClosure,
    CombatOutcomeReceipt,
    CombatSessionClosureRecord,
} from './campaignCombatReceiptCore';
import {
    hasPendingCombatOutcomeReceipt,
    pendingReceiptPath,
    writeCampaignCombatSessionArtifacts,
    writeCombatSessionClosure,
    writePendingCombatOutcomeReceipt,
} from './campaignCombatPendingStore';


export type CampaignCombatLifecycleState =
    | 'idle'
    | 'requested'
    | 'validated'
    | 'running'
    | 'terminal'
    | 'receipt_pending'
    | 'aborted'
    | 'failed';

export interface CampaignCombatCoordinatorState {
    lifecycle: CampaignCombatLifecycleState;
    combatSessionId?: string;
    request?: CampaignCombatRequest;
    pendingPath?: string;
    closurePath?: string;
    lastError?: string;
    compiledSnapshotHash?: string;
}

export class CampaignCombatSessionCoordinator {
    private lifecycle: CampaignCombatLifecycleState = 'idle';
    private combatSessionId: string | undefined;
    private request: CampaignCombatRequest | undefined;
    private compiled: CompiledCampaignCombat | undefined;
    private pendingPath: string | undefined;
    private closurePath: string | undefined;
    private lastError: string | undefined;
    /** True only after durable PENDING or non-apply closure is on disk. */
    private durableFinalized = false;

    constructor(
        private readonly host: CombatCommandPlaytestHost,
        private readonly getWorkspacePath: () => string | undefined,
        private readonly extensionRoot?: string,
        private readonly openBattleView?: () => void,
        /** Test seam: override PENDING writer (defaults to durable store). */
        private readonly writePending?: (workspacePath: string, receipt: CombatOutcomeReceipt) => string,
        /** Test seam: override session artifact writer after PENDING. */
        private readonly writeSessionArtifacts?: typeof writeCampaignCombatSessionArtifacts,
    ) {}

    getState(): CampaignCombatCoordinatorState {
        return {
            lifecycle: this.lifecycle,
            combatSessionId: this.combatSessionId,
            request: this.request,
            pendingPath: this.pendingPath,
            closurePath: this.closurePath,
            lastError: this.lastError,
            compiledSnapshotHash: this.compiled?.compiledSnapshotHash,
        };
    }

    /**
     * Non-finalized terminal (PENDING write pending/failed) and live running sessions
     * block a new start so unwritten outcomes are not discarded.
     */
    private isStartBlocked(): { blocked: true; error: string } | { blocked: false } {
        if (this.lifecycle === 'running') {
            return { blocked: true, error: 'COMBAT_ALREADY_ACTIVE' };
        }
        if (this.lifecycle === 'terminal' && !this.durableFinalized) {
            return { blocked: true, error: 'TERMINAL_AWAITING_PENDING' };
        }
        if (this.lifecycle === 'receipt_pending' && !this.durableFinalized) {
            // Should not happen (receipt_pending implies durable), but refuse to clobber.
            return { blocked: true, error: 'COMBAT_ALREADY_ACTIVE' };
        }
        return { blocked: false };
    }

    private expectedHostStartId(): string | undefined {
        return this.combatSessionId ? `campaign:${this.combatSessionId}` : undefined;
    }

    startDebug(options?: { mode?: 'command' | 'spectator'; autoRun?: boolean }): {
        ok: boolean;
        error?: string;
        detail?: string;
        combatSessionId?: string;
        lifecycle?: CampaignCombatLifecycleState;
    } {
        const block = this.isStartBlocked();
        if (block.blocked) {
            return {
                ok: false,
                error: block.error,
                combatSessionId: this.combatSessionId,
                lifecycle: this.lifecycle,
            };
        }

        const raw = buildDebugCampaignCombatRequest({ mode: options?.mode });
        return this.startFromRequest(raw, { autoRun: options?.autoRun !== false });
    }

    startFromRequest(
        raw: unknown,
        options?: { autoRun?: boolean },
    ): {
        ok: boolean;
        error?: string;
        detail?: string;
        combatSessionId?: string;
        lifecycle?: CampaignCombatLifecycleState;
    } {
        const block = this.isStartBlocked();
        if (block.blocked) {
            return {
                ok: false,
                error: block.error,
                combatSessionId: this.combatSessionId,
                lifecycle: this.lifecycle,
            };
        }

        this.lifecycle = 'requested';
        this.durableFinalized = false;
        this.pendingPath = undefined;
        this.closurePath = undefined;
        this.lastError = undefined;
        this.compiled = undefined;
        this.combatSessionId = undefined;

        const validated = validateCampaignCombatRequest(raw);
        if (!validated.ok) {
            this.lifecycle = 'failed';
            this.lastError = validated.error;
            return { ok: false, error: validated.error, detail: validated.detail, lifecycle: this.lifecycle };
        }
        this.request = validated.request;
        this.lifecycle = 'validated';

        const catalog = loadDefaultCombatLabCatalog(this.extensionRoot);
        const compiled = compileCampaignCombatRequest(this.request, catalog);
        if (!compiled.ok) {
            this.lifecycle = 'failed';
            this.lastError = compiled.error;
            return { ok: false, error: compiled.error, detail: compiled.detail, lifecycle: this.lifecycle };
        }
        this.compiled = compiled.compiled;

        this.combatSessionId = randomUUID();
        const startId = `campaign:${this.combatSessionId}`;
        const started = this.host.startFromBattleSpec(
            this.compiled.battleSpec,
            this.request.requestedMode,
            startId,
            {
                autoRun: options?.autoRun !== false,
                sessionLabel: this.compiled.sessionLabel,
            },
        );
        if (!started.ok) {
            this.lifecycle = 'failed';
            this.lastError = started.error;
            return {
                ok: false,
                error: started.error,
                detail: started.detail,
                lifecycle: this.lifecycle,
            };
        }

        this.lifecycle = 'running';
        const ws = this.getWorkspacePath();
        if (ws) {
            writeCampaignCombatSessionArtifacts(
                ws,
                this.combatSessionId,
                this.request,
                {
                    lifecycle: this.lifecycle,
                    startId,
                    fixtureId: this.compiled.fixtureId,
                    mode: this.request.requestedMode,
                    compiledSnapshotHash: this.compiled.compiledSnapshotHash,
                },
                {
                    battleSpec: this.compiled.battleSpec,
                    rosterSnapshot: this.compiled.rosterSnapshot,
                    entityToUnitId: this.compiled.entityToUnitId,
                    compiledSnapshotHash: this.compiled.compiledSnapshotHash,
                    fixtureId: this.compiled.fixtureId,
                },
            );
        }

        if (this.request.presentation?.openBattleView !== false) {
            try {
                this.openBattleView?.();
            } catch {
                // non-fatal
            }
        }

        this.observeHostSession();

        return {
            ok: true,
            combatSessionId: this.combatSessionId,
            lifecycle: this.lifecycle,
        };
    }

    abort(detail?: string): { ok: boolean; error?: string } {
        if (!this.request || !this.combatSessionId) {
            this.host.clear();
            this.lifecycle = 'idle';
            return { ok: true };
        }
        if (this.lifecycle === 'receipt_pending' || this.durableFinalized) {
            return { ok: false, error: 'ALREADY_FINALIZED' };
        }
        // If a discriminator-valid PENDING already exists on disk, never write a
        // closure that would coexist with it. Deep apply validation is intentionally
        // separate: malformed nested receipt data remains authoritative for exclusion.
        const ws = this.getWorkspacePath();
        if (ws) {
            if (hasPendingCombatOutcomeReceipt(ws, this.combatSessionId)) {
                this.pendingPath = pendingReceiptPath(ws, this.combatSessionId);
                this.lifecycle = 'receipt_pending';
                this.durableFinalized = true;
                return { ok: false, error: 'PENDING_ALREADY_EXISTS' };
            }
        }
        if (!ws) {
            // Do not clear host or mark finalized without a durable closure record.
            this.lastError = 'NO_WORKSPACE';
            return { ok: false, error: 'NO_WORKSPACE' };
        }
        const closure = buildCombatSessionClosure({
            combatSessionId: this.combatSessionId,
            request: this.request,
            reasonCode: 'ABORT',
            detail,
        });
        try {
            this.closurePath = writeCombatSessionClosure(ws, closure);
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
            return { ok: false, error: 'CLOSURE_WRITE_FAILED' };
        }
        this.host.clear();
        this.lifecycle = 'aborted';
        this.durableFinalized = true;
        this.lastError = undefined;
        return { ok: true };
    }

    /**
     * Call after host step/pulse/issue so terminal → PENDING is durable.
     * Retryable while PENDING write has not succeeded (lifecycle may be terminal).
     */
    observeHostSession(): void {
        if (this.durableFinalized) return;
        if (!this.request || !this.compiled || !this.combatSessionId) return;
        // Accept both running and terminal so a failed write can retry.
        if (this.lifecycle !== 'running' && this.lifecycle !== 'terminal') return;

        const session = this.host.currentSession;
        if (!session) return;

        // Lab or another start can replace the shared host session. Never mint a campaign
        // PENDING receipt from a foreign startId (corrupted authority).
        const expectedStartId = this.expectedHostStartId();
        if (!expectedStartId || session.startId !== expectedStartId) {
            this.lastError = 'HOST_SESSION_MISMATCH';
            // Stay terminal/running as appropriate without writing a receipt from wrong battle.
            if (this.lifecycle === 'running') {
                this.lifecycle = 'terminal';
            }
            return;
        }

        const outcome = session.state.outcome;
        if (!outcome) return;

        this.lifecycle = 'terminal';

        const receipt = buildCombatOutcomeReceipt({
            combatSessionId: this.combatSessionId,
            request: this.request,
            effectiveMode: session.mode,
            outcomeLabel: outcome,
            state: session.state,
            battleSpec: session.spec,
            commandLog: session.commandLog,
            entityToUnitId: this.compiled.entityToUnitId,
            compiledSnapshotHash: this.compiled.compiledSnapshotHash,
        });

        if ('ok' in receipt && receipt.ok === false) {
            try {
                const ws = this.getWorkspacePath();
                if (!ws) {
                    this.lastError = 'NO_WORKSPACE';
                    this.lifecycle = 'terminal';
                    return;
                }
                const closure = buildCombatSessionClosure({
                    combatSessionId: this.combatSessionId,
                    request: this.request,
                    reasonCode: 'ERROR',
                    detail: receipt.error,
                });
                this.closurePath = writeCombatSessionClosure(ws, closure);
                this.lifecycle = 'failed';
                this.durableFinalized = true;
            } catch (e) {
                this.lastError = e instanceof Error ? e.message : String(e);
                // stay terminal for retry of closure — do not mark finalized without disk truth
                this.lifecycle = 'terminal';
            }
            return;
        }

        const applyReceipt = receipt as CombatOutcomeReceipt;
        const ws = this.getWorkspacePath();
        if (!ws) {
            this.lastError = 'NO_WORKSPACE';
            // stay terminal so a later observe can retry if workspace appears
            return;
        }

        // PENDING is the durable apply-eligible authority. Mark finalized as soon as
        // that file is on disk; meta/session artifact updates are best-effort after.
        try {
            const writePending = this.writePending || writePendingCombatOutcomeReceipt;
            this.pendingPath = writePending(ws, applyReceipt);
        } catch (e) {
            // Do NOT mark durableFinalized — remain terminal and retry on next observe.
            this.lastError = e instanceof Error ? e.message : String(e);
            this.lifecycle = 'terminal';
            return;
        }

        this.lifecycle = 'receipt_pending';
        this.durableFinalized = true;
        this.lastError = undefined;

        try {
            const writeArtifacts = this.writeSessionArtifacts || writeCampaignCombatSessionArtifacts;
            writeArtifacts(
                ws,
                this.combatSessionId,
                this.request,
                {
                    lifecycle: 'receipt_pending',
                    pendingPath: this.pendingPath,
                    terminalOutcomeCode: applyReceipt.terminalOutcomeCode,
                    simulationResultHash: applyReceipt.simulationResultHash,
                    receiptHash: applyReceipt.receiptHash,
                    compiledSnapshotHash: this.compiled.compiledSnapshotHash,
                },
                {
                    battleSpec: this.compiled.battleSpec,
                    rosterSnapshot: this.compiled.rosterSnapshot,
                    entityToUnitId: this.compiled.entityToUnitId,
                    compiledSnapshotHash: this.compiled.compiledSnapshotHash,
                    fixtureId: this.compiled.fixtureId,
                },
            );
        } catch (e) {
            // PENDING already durable — do not reopen abort/closure path.
            this.lastError = e instanceof Error ? e.message : String(e);
        }
    }
}

export type { CombatSessionClosureRecord };
