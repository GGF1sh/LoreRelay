/**
 * SETTLEMENT-MULTI-LOCATION-001-PRE2
 * Pure read-only settlement document resolution policy (no fs / vscode).
 */

import type { SettlementLayoutV1, SettlementStateV1 } from './settlementCore';
import type { SettlementLocationIdErrorCode } from './settlementLocationPathCore';

export type SettlementDocumentSource =
    | 'fixed_scoped'
    | 'legacy_fixed'
    | 'mobile_base_scoped'
    | 'legacy_mobile_base';

export type SettlementDocumentResolveErrorCode =
    | SettlementLocationIdErrorCode
    | 'invalid_location_id'
    | 'missing_active_mobile_base'
    | 'not_found'
    | 'incomplete_document_set'
    | 'state_read_failed'
    | 'layout_read_failed'
    | 'invalid_state'
    | 'invalid_layout'
    | 'state_location_mismatch'
    | 'settlement_id_missing'
    | 'settlement_id_mismatch'
    | 'legacy_unscoped'
    | 'legacy_other_location'
    | 'legacy_owned_by_mobile_base'
    | 'legacy_unknown_location';

export type SettlementDocumentLoadStatus =
    | { status: 'missing' }
    | { status: 'read_failed' }
    | { status: 'invalid_parse' }
    | { status: 'ok'; value: SettlementStateV1 | SettlementLayoutV1 };

export type SettlementStateLoad =
    | { status: 'missing' }
    | { status: 'read_failed' }
    | { status: 'invalid_parse' }
    | { status: 'ok'; value: SettlementStateV1 };

export type SettlementLayoutLoad =
    | { status: 'missing' }
    | { status: 'read_failed' }
    | { status: 'invalid_parse' }
    | { status: 'ok'; value: SettlementLayoutV1 };

export type ResolvedSettlementDocuments =
    | {
        ok: true;
        source: SettlementDocumentSource;
        statePath: string;
        layoutPath?: string;
        state: SettlementStateV1;
        layout?: SettlementLayoutV1;
        requestedLocationId?: string;
        legacy: boolean;
    }
    | {
        ok: false;
        code: SettlementDocumentResolveErrorCode;
        detail?: string;
    };

export interface FixedSettlementResolveFacts {
    requestedLocationId: string;
    forgeLocationIds: ReadonlySet<string>;
    activeMobileBaseSettlementId?: string;
    scopedStatePath: string;
    scopedLayoutPath: string;
    scopedState: SettlementStateLoad;
    scopedLayout: SettlementLayoutLoad;
    /** True when any file exists under the scoped directory (state and/or layout). */
    scopedAnyFileExists: boolean;
    legacyStatePath: string;
    legacyLayoutPath: string;
    legacyState: SettlementStateLoad;
    legacyLayout: SettlementLayoutLoad;
    legacyAnyFileExists: boolean;
}

export interface MobileBaseSettlementResolveFacts {
    activeMobileBaseSettlementId: string;
    scopedStatePath: string;
    scopedLayoutPath: string;
    scopedState: SettlementStateLoad;
    scopedLayout: SettlementLayoutLoad;
    scopedAnyFileExists: boolean;
    legacyStatePath: string;
    legacyLayoutPath: string;
    legacyState: SettlementStateLoad;
    legacyLayout: SettlementLayoutLoad;
    legacyAnyFileExists: boolean;
}

/** Map PRE1 path/id codes for API surface (syntax → invalid_location_id; preserve catalog/workspace). */
export function mapPathValidationCode(
    code: SettlementLocationIdErrorCode
): SettlementDocumentResolveErrorCode {
    if (code === 'unknown_location' || code === 'invalid_workspace_root' || code === 'path_escape') {
        return code;
    }
    return 'invalid_location_id';
}

function fail(
    code: SettlementDocumentResolveErrorCode,
    detail?: string
): ResolvedSettlementDocuments {
    return detail === undefined ? { ok: false, code } : { ok: false, code, detail };
}

function nonEmptySettlementId(id: string | undefined): id is string {
    return typeof id === 'string' && id.length > 0;
}

/**
 * Attach optional layout after state ownership is confirmed.
 * Missing layout is success; present but invalid/mismatch is failure.
 */
function withOptionalLayout(
    base: {
        source: SettlementDocumentSource;
        statePath: string;
        layoutPath: string;
        state: SettlementStateV1;
        requestedLocationId?: string;
        legacy: boolean;
    },
    layoutLoad: SettlementLayoutLoad
): ResolvedSettlementDocuments {
    if (layoutLoad.status === 'missing') {
        return {
            ok: true,
            source: base.source,
            statePath: base.statePath,
            state: base.state,
            requestedLocationId: base.requestedLocationId,
            legacy: base.legacy,
        };
    }
    if (layoutLoad.status === 'read_failed') {
        return fail('layout_read_failed', base.layoutPath);
    }
    if (layoutLoad.status === 'invalid_parse') {
        return fail('invalid_layout', base.layoutPath);
    }
    if (layoutLoad.value.settlementId !== base.state.settlementId) {
        return fail('settlement_id_mismatch', 'layout.settlementId !== state.settlementId');
    }
    return {
        ok: true,
        source: base.source,
        statePath: base.statePath,
        layoutPath: base.layoutPath,
        state: base.state,
        layout: layoutLoad.value,
        requestedLocationId: base.requestedLocationId,
        legacy: base.legacy,
    };
}

function evaluateScopedState(
    stateLoad: SettlementStateLoad,
    layoutLoad: SettlementLayoutLoad,
    anyFileExists: boolean,
    opts: {
        requireLocationId?: string;
        requireSettlementId?: string;
        source: SettlementDocumentSource;
        statePath: string;
        layoutPath: string;
        requestedLocationId?: string;
        legacy: boolean;
    }
): ResolvedSettlementDocuments | null {
    if (stateLoad.status === 'ok') {
        const state = stateLoad.value;
        if (!nonEmptySettlementId(state.settlementId)) {
            return fail('settlement_id_missing');
        }
        if (opts.requireSettlementId !== undefined
            && state.settlementId !== opts.requireSettlementId) {
            return fail('settlement_id_mismatch', 'state.settlementId does not match required id');
        }
        if (opts.requireLocationId !== undefined) {
            if (!state.locationId) {
                return fail('state_location_mismatch', 'state.locationId missing');
            }
            if (state.locationId !== opts.requireLocationId) {
                return fail('state_location_mismatch', 'state.locationId !== requested location');
            }
        }
        return withOptionalLayout(
            {
                source: opts.source,
                statePath: opts.statePath,
                layoutPath: opts.layoutPath,
                state,
                requestedLocationId: opts.requestedLocationId,
                legacy: opts.legacy,
            },
            layoutLoad
        );
    }

    if (!anyFileExists) {
        return null; // try next candidate
    }

    // Files exist under this candidate but state is unusable → fail closed (no fallback).
    if (stateLoad.status === 'missing') {
        return fail('incomplete_document_set', 'layout present without state');
    }
    if (stateLoad.status === 'read_failed') {
        return fail('state_read_failed', opts.statePath);
    }
    return fail('invalid_state', opts.statePath);
}

/**
 * Pure fixed-settlement resolution from pre-loaded candidate facts.
 * Assumes requestedLocationId was already catalog-validated by the host.
 */
export function resolveFixedSettlementFromFacts(
    facts: FixedSettlementResolveFacts
): ResolvedSettlementDocuments {
    const scoped = evaluateScopedState(
        facts.scopedState,
        facts.scopedLayout,
        facts.scopedAnyFileExists,
        {
            requireLocationId: facts.requestedLocationId,
            source: 'fixed_scoped',
            statePath: facts.scopedStatePath,
            layoutPath: facts.scopedLayoutPath,
            requestedLocationId: facts.requestedLocationId,
            legacy: false,
        }
    );
    if (scoped) {
        return scoped;
    }

    // No scoped files → consider legacy root.
    if (!facts.legacyAnyFileExists) {
        return fail('not_found');
    }

    if (facts.legacyState.status === 'missing') {
        return fail('incomplete_document_set', 'legacy layout without state');
    }
    if (facts.legacyState.status === 'read_failed') {
        return fail('state_read_failed', facts.legacyStatePath);
    }
    if (facts.legacyState.status === 'invalid_parse') {
        return fail('invalid_state', facts.legacyStatePath);
    }

    const state = facts.legacyState.value;
    if (!nonEmptySettlementId(state.settlementId)) {
        return fail('settlement_id_missing');
    }

    // Mobile-base ownership of root singleton blocks fixed use.
    if (facts.activeMobileBaseSettlementId
        && state.settlementId === facts.activeMobileBaseSettlementId) {
        return fail('legacy_owned_by_mobile_base');
    }

    if (!state.locationId) {
        return fail('legacy_unscoped');
    }
    if (!facts.forgeLocationIds.has(state.locationId)) {
        return fail('legacy_unknown_location');
    }
    if (state.locationId !== facts.requestedLocationId) {
        return fail('legacy_other_location');
    }

    return withOptionalLayout(
        {
            source: 'legacy_fixed',
            statePath: facts.legacyStatePath,
            layoutPath: facts.legacyLayoutPath,
            state,
            requestedLocationId: facts.requestedLocationId,
            legacy: true,
        },
        facts.legacyLayout
    );
}

/**
 * Pure mobile-base settlement resolution from pre-loaded candidate facts.
 * Assumes activeMobileBaseSettlementId is a non-empty settlement id string.
 */
export function resolveMobileBaseSettlementFromFacts(
    facts: MobileBaseSettlementResolveFacts
): ResolvedSettlementDocuments {
    const scoped = evaluateScopedState(
        facts.scopedState,
        facts.scopedLayout,
        facts.scopedAnyFileExists,
        {
            requireSettlementId: facts.activeMobileBaseSettlementId,
            source: 'mobile_base_scoped',
            statePath: facts.scopedStatePath,
            layoutPath: facts.scopedLayoutPath,
            legacy: false,
        }
    );
    if (scoped) {
        return scoped;
    }

    if (!facts.legacyAnyFileExists) {
        return fail('not_found');
    }

    if (facts.legacyState.status === 'missing') {
        return fail('incomplete_document_set', 'legacy layout without state');
    }
    if (facts.legacyState.status === 'read_failed') {
        return fail('state_read_failed', facts.legacyStatePath);
    }
    if (facts.legacyState.status === 'invalid_parse') {
        return fail('invalid_state', facts.legacyStatePath);
    }

    const state = facts.legacyState.value;
    if (!nonEmptySettlementId(state.settlementId)) {
        return fail('settlement_id_missing');
    }
    if (state.settlementId !== facts.activeMobileBaseSettlementId) {
        return fail('settlement_id_mismatch', 'legacy root is not the active mobile base');
    }

    // locationId on MB is dock metadata only — not used as ownership key.
    return withOptionalLayout(
        {
            source: 'legacy_mobile_base',
            statePath: facts.legacyStatePath,
            layoutPath: facts.legacyLayoutPath,
            state,
            legacy: true,
        },
        facts.legacyLayout
    );
}
