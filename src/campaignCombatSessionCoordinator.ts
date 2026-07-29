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

    startDebug(options?: { mode?: 'command' | 'spectator'; autoRun?: boolean }): {
        ok: boolean;
        error?: string;
        detail?: string;
        combatSessionId?: string;
        lifecycle?: CampaignCombatLifecycleState;
    } {
        if (this.lifecycle === 'running') {
            return { ok: false, error: 'COMBAT_ALREADY_ACTIVE' };
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
        const closure = buildCombatSessionClosure({
            combatSessionId: this.combatSessionId,
            request: this.request,
            reasonCode: 'ABORT',
            detail,
        });
        const ws = this.getWorkspacePath();
        if (ws) {
            this.closurePath = writeCombatSessionClosure(ws, closure);
        }
        this.host.clear();
        this.lifecycle = 'aborted';
        this.durableFinalized = true;
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
                const closure = buildCombatSessionClosure({
                    combatSessionId: this.combatSessionId,
                    request: this.request,
                    reasonCode: 'ERROR',
                    detail: receipt.error,
                });
                const ws = this.getWorkspacePath();
                if (ws) this.closurePath = writeCombatSessionClosure(ws, closure);
                this.lifecycle = 'failed';
                this.durableFinalized = true;
            } catch (e) {
                this.lastError = e instanceof Error ? e.message : String(e);
                // stay terminal for retry of closure? non-apply path — leave failed attempt visible
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

        try {
            const writePending = this.writePending || writePendingCombatOutcomeReceipt;
            this.pendingPath = writePending(ws, applyReceipt);
            writeCampaignCombatSessionArtifacts(
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
            this.lifecycle = 'receipt_pending';
            this.durableFinalized = true;
            this.lastError = undefined;
        } catch (e) {
            // Do NOT mark durableFinalized — remain terminal and retry on next observe.
            this.lastError = e instanceof Error ? e.message : String(e);
            this.lifecycle = 'terminal';
        }
    }
}

export type { CombatSessionClosureRecord };
