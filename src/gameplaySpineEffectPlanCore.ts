// NOAI-GAMEPLAY-SPINE-004: pure typed EffectPlan vocabulary (no execution or persistence).

import type { ActionKey } from './gameplaySpineCore';
import type { LedgerWriteOwner } from './stateOrchestratorDescriptorCore';

export const GAMEPLAY_EFFECT_PLAN_VERSION = 1 as const;

export interface GameplayPlannedEffect<
    TEffectType extends string,
    TLedgerId extends LedgerWriteOwner,
    TTarget
> {
    /** Zero-based canonical position within the plan. */
    order: number;
    effectType: TEffectType;
    ledgerId: TLedgerId;
    target: TTarget;
}

export interface GameplayEffectPlan<
    TEffect extends GameplayPlannedEffect<string, LedgerWriteOwner, unknown>,
    TPublicSummary,
    TPreviewWitness,
    TConcreteLedger extends LedgerWriteOwner = LedgerWriteOwner,
    TPotentialLedger extends LedgerWriteOwner = LedgerWriteOwner
> {
    planVersion: typeof GAMEPLAY_EFFECT_PLAN_VERSION;
    actionKey: ActionKey;
    actionVersion: number;
    requestId: string;
    correlationId: string;
    sourcePreview: {
        previewVersion: number;
        confirmationToken: string;
    };
    admission: {
        sourceStatus: 'ready';
    };
    confirmation: {
        policy: 'explicit';
        status: 'validated';
    };
    /** Ledgers directly named by the typed effects in this plan. */
    touchedLedgers: TConcreteLedger[];
    /** Possible later resolver expansion, never a claim that these ledgers are touched. */
    potentialExpansionLedgers: TPotentialLedger[];
    effects: TEffect[];
    publicSummary: TPublicSummary;
    /** Host-side stale-state evidence. Public projectors must remove this field. */
    internal: {
        visibility: 'internal';
        previewWitness: TPreviewWitness;
        sourcePreviewVersion: number;
    };
}
