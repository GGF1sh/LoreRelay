/**
 * SETTLEMENT-MULTI-LOCATION-001-SLICE2
 * Pure settlement preview-focus policy (no fs / vscode / disk).
 */

import {
    validateFixedSettlementLocationId,
    type SettlementLocationIdErrorCode,
} from './settlementLocationPathCore';

export type SettlementDisplayMode = 'current' | 'preview';
export type SettlementDisplayAvailability = 'available' | 'missing' | 'invalid';

export type SettlementDisplayContext = {
    mode: SettlementDisplayMode;
    currentLocationId?: string;
    currentLocationName?: string;
    displayLocationId?: string;
    displayLocationName?: string;
    availability: SettlementDisplayAvailability;
};

export type SettlementFocusValidationResult =
    | { ok: true; locationId: string }
    | { ok: false; code: SettlementLocationIdErrorCode | 'unknown_location' };

/**
 * Validate untrusted focus request against PRE1 + active catalog.
 * Never accepts _mobile_base or path-like values.
 */
export function validateSettlementFocusLocationId(
    raw: unknown,
    forgeLocationIds: ReadonlySet<string>
): SettlementFocusValidationResult {
    const syntax = validateFixedSettlementLocationId(raw);
    if (!syntax.ok) {
        return { ok: false, code: syntax.code };
    }
    if (!forgeLocationIds.has(syntax.locationId)) {
        return { ok: false, code: 'unknown_location' };
    }
    return { ok: true, locationId: syntax.locationId };
}

/**
 * Resolve which location's fixed settlement documents to display.
 * Preview focus is used only when it differs from the player's current location.
 */
export function resolveSettlementDisplayLocationId(input: {
    currentLocationId: string | undefined;
    focusedLocationId: string | undefined;
}): {
    displayLocationId: string | undefined;
    mode: SettlementDisplayMode;
    /** Focus should be cleared when it equals current (normalized). */
    normalizeFocusAway: boolean;
} {
    const current = typeof input.currentLocationId === 'string' && input.currentLocationId.length > 0
        ? input.currentLocationId
        : undefined;
    const focused = typeof input.focusedLocationId === 'string' && input.focusedLocationId.length > 0
        ? input.focusedLocationId
        : undefined;

    if (!focused || !current) {
        return {
            displayLocationId: focused || current,
            mode: 'current',
            normalizeFocusAway: Boolean(focused && current && focused === current),
        };
    }

    if (focused === current) {
        return {
            displayLocationId: current,
            mode: 'current',
            normalizeFocusAway: true,
        };
    }

    return {
        displayLocationId: focused,
        mode: 'preview',
        normalizeFocusAway: false,
    };
}

export function mapFixedLoadCodeToAvailability(
    code: string | undefined,
    hasState: boolean
): SettlementDisplayAvailability {
    if (hasState) {
        return 'available';
    }
    if (!code) {
        return 'missing';
    }
    const invalid = new Set([
        'incomplete_document_set',
        'invalid_state',
        'invalid_layout',
        'state_location_mismatch',
        'settlement_id_missing',
        'settlement_id_mismatch',
        'state_read_failed',
        'layout_read_failed',
    ]);
    if (invalid.has(code)) {
        return 'invalid';
    }
    return 'missing';
}

export function buildSettlementDisplayContext(input: {
    mode: SettlementDisplayMode;
    currentLocationId?: string;
    displayLocationId?: string;
    locationNameById: ReadonlyMap<string, string>;
    availability: SettlementDisplayAvailability;
}): SettlementDisplayContext {
    const ctx: SettlementDisplayContext = {
        mode: input.mode,
        availability: input.availability,
    };
    if (input.currentLocationId) {
        ctx.currentLocationId = input.currentLocationId;
        const name = input.locationNameById.get(input.currentLocationId);
        if (name) {
            ctx.currentLocationName = name;
        }
    }
    if (input.displayLocationId) {
        ctx.displayLocationId = input.displayLocationId;
        const name = input.locationNameById.get(input.displayLocationId);
        if (name) {
            ctx.displayLocationName = name;
        }
    }
    return ctx;
}

/**
 * Retain focus only when workspace matches and location remains in catalog.
 * When current location equals focus, drop focus (travel-into-preview case).
 */
export function retainSettlementFocus(input: {
    focusWorkspaceRoot: string | undefined;
    focusLocationId: string | undefined;
    activeWorkspaceRoot: string | undefined;
    forgeLocationIds: ReadonlySet<string>;
    currentLocationId: string | undefined;
}): string | undefined {
    const focus = input.focusLocationId;
    if (!focus) {
        return undefined;
    }
    if (!input.activeWorkspaceRoot || input.focusWorkspaceRoot !== input.activeWorkspaceRoot) {
        return undefined;
    }
    if (!input.forgeLocationIds.has(focus)) {
        return undefined;
    }
    if (input.currentLocationId && focus === input.currentLocationId) {
        return undefined;
    }
    return focus;
}
