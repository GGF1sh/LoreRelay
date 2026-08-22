/**
 * Host side of story-declared combat (`turn_result.encounterOps`).
 *
 * Dispatches at the Accepted correlation boundary, after the game_state commit,
 * per the ordering rule established by the V1-D findings: a battle started
 * before the commit could have its effects reverted by the AI's returned
 * `status`, which the 'turn' merge profile owns.
 */

import type { TurnResult } from './types/TurnResult';
import {
    buildCampaignCombatRequestFromEncounterOp,
    encounterRequestId,
    parseEncounterTurnOps,
    type EncounterCampaignIdentity,
} from './combatEncounterTurnOpsCore';

export interface EncounterTurnOpsDeps {
    /** `enableStoryCombat`; when false the ops are ignored without inspecting them. */
    storyCombatEnabled: () => boolean;
    /** Real identity of the Accepted turn that declared the encounter. */
    identity: () => EncounterCampaignIdentity | undefined;
    /** Real party character ids; empty falls back to the fixture's own roster. */
    partyEntityIds?: () => readonly string[];
    /** Canonical active character id (`active_character.txt`), not party order. */
    protagonistEntityId?: () => string | undefined;
    /** Coordinator entry. Already validates and compiles the request. */
    startFromRequest: (request: unknown) => { ok: boolean; error?: string; detail?: string; combatSessionId?: string };
    warn?: (message: string, detail?: unknown) => void;
}

export interface EncounterTurnOpsOutcome {
    /** True when a combat session was actually started. */
    started: boolean;
    /** Set when ops were present but not acted on, so callers can log a reason. */
    skipped?:
        | 'disabled'
        | 'no_ops'
        | 'no_identity'
        | 'invalid_ops'
        | 'start_rejected';
    combatSessionId?: string;
    error?: string;
    detail?: string;
}

/**
 * Never throws: a malformed or rejected encounter must not fail an otherwise
 * committed turn. The turn is already durable by the time this runs.
 */
export function applyEncounterTurnOps(
    turnResult: Pick<TurnResult, 'encounterOps'>,
    deps: EncounterTurnOpsDeps,
): EncounterTurnOpsOutcome {
    const ops = turnResult.encounterOps;
    if (!Array.isArray(ops) || ops.length === 0) {
        return { started: false, skipped: 'no_ops' };
    }
    if (!deps.storyCombatEnabled()) {
        // Rule off: a GM that emits encounterOps cannot start a battle.
        return { started: false, skipped: 'disabled' };
    }

    const parsed = parseEncounterTurnOps(ops);
    if (!parsed.ok) {
        deps.warn?.('[encounterOps] rejected story-declared encounter', { error: parsed.error, detail: parsed.detail });
        return { started: false, skipped: 'invalid_ops', error: parsed.error, detail: parsed.detail };
    }
    if (parsed.ops.length === 0) {
        return { started: false, skipped: 'no_ops' };
    }

    const identity = deps.identity();
    if (!identity) {
        // Without a real Accepted turn identity the receipt could not be
        // correlated back to this campaign; refuse rather than invent one.
        deps.warn?.('[encounterOps] no accepted-turn identity; encounter not started');
        return { started: false, skipped: 'no_identity' };
    }

    const op = parsed.ops[0];
    let party: readonly string[] | undefined;
    try {
        party = deps.partyEntityIds?.();
    } catch {
        // A missing or malformed party file must not block the encounter; the
        // builder falls back to the fixture's own roster.
        party = undefined;
    }
    const built = buildCampaignCombatRequestFromEncounterOp(
        op,
        identity,
        encounterRequestId(identity.acceptedTurnId, op.encounterId),
        party,
        deps.protagonistEntityId?.(),
    );
    if (!built.ok) {
        deps.warn?.('[encounterOps] could not build combat request', { error: built.error, detail: built.detail });
        return { started: false, skipped: 'invalid_ops', error: built.error, detail: built.detail };
    }

    const result = deps.startFromRequest(built.request);
    if (!result.ok) {
        deps.warn?.('[encounterOps] coordinator refused the encounter', { error: result.error, detail: result.detail });
        return { started: false, skipped: 'start_rejected', error: result.error, detail: result.detail };
    }
    return { started: true, combatSessionId: result.combatSessionId };
}

/**
 * Registration seam. `extension.ts` owns the coordinator; `statePatch` owns the
 * commit boundary. Registering the starter here keeps the dependency one-way
 * instead of importing the extension entry point from the state layer.
 */
type StoryCombatStarter = (request: unknown) => {
    ok: boolean; error?: string; detail?: string; combatSessionId?: string;
};

let registeredStarter: StoryCombatStarter | undefined;

export function registerStoryCombatStarter(starter: StoryCombatStarter | undefined): void {
    registeredStarter = starter;
}

/**
 * Post-commit entry used by `statePatch`. Returns an outcome instead of
 * throwing: the turn is already durable, so a failed encounter must never
 * surface as a failed turn.
 */
export function tryApplyEncounterTurnOps(
    turnResult: Pick<TurnResult, 'encounterOps'>,
    storyCombatEnabled: boolean,
    identity: EncounterCampaignIdentity | undefined,
    /** Supplied by the caller so this module stays free of vscode-bound imports. */
    partyEntityIds?: readonly string[],
    protagonistEntityId?: string,
): EncounterTurnOpsOutcome {
    try {
        if (!registeredStarter) {
            return { started: false, skipped: 'start_rejected', error: 'NO_COMBAT_COORDINATOR' };
        }
        return applyEncounterTurnOps(turnResult, {
            storyCombatEnabled: () => storyCombatEnabled,
            identity: () => identity,
            partyEntityIds: () => partyEntityIds ?? [],
            protagonistEntityId: () => protagonistEntityId,
            startFromRequest: registeredStarter,
            warn: (message, detail) => console.warn(message, detail),
        });
    } catch (e) {
        console.error('[encounterOps] story combat dispatch threw after commit; turn retained.', e);
        return { started: false, skipped: 'start_rejected', error: 'DISPATCH_THREW' };
    }
}
