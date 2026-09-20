/**
 * SETTLEMENT-MULTI-LOCATION-001-SLICE1
 * Fixed-settlement load for World View: location-scoped resolve, no singleton cache.
 * Read-only; does not write, migrate, or rewire Mobile Base storage.
 */

import type { SettlementLayoutV1, SettlementStateV1 } from './settlementCore';
import {
    parseMobileBaseLink,
    resolveActiveMobileBaseVehicle,
} from './mobileBaseCore';
import type { VehicleState } from './vehicleCore';
import {
    resolveFixedSettlementDocuments,
    type SettlementDocumentResolveErrorCode,
    type SettlementDocumentSource,
} from './settlementLocationResolveHost';

/** Honest absence — omit fixed settlement payload; do not show another town. */
const HONEST_ABSENCE_CODES: ReadonlySet<SettlementDocumentResolveErrorCode> = new Set([
    'not_found',
    'legacy_unscoped',
    'legacy_other_location',
    'legacy_owned_by_mobile_base',
    'legacy_unknown_location',
]);

/** Scoped/invalid failures — fail closed; never fall back to root singleton. */
const FAIL_CLOSED_CODES: ReadonlySet<SettlementDocumentResolveErrorCode> = new Set([
    'incomplete_document_set',
    'invalid_state',
    'invalid_layout',
    'state_location_mismatch',
    'settlement_id_missing',
    'settlement_id_mismatch',
    'state_read_failed',
    'layout_read_failed',
    'invalid_location_id',
    'unknown_location',
    'invalid_workspace_root',
    'path_escape',
    'not_string',
    'empty',
    'too_long',
    'invalid_characters',
    'path_segment',
    'absolute_or_drive',
    'url_encoded',
    'reserved_namespace',
    'reserved_device_name',
    'prototype_key',
]);

export type FixedSettlementWorldViewLoad = {
    state?: SettlementStateV1;
    layout?: SettlementLayoutV1;
    source?: SettlementDocumentSource;
    /** Present when resolve failed or was skipped; useful for diagnostics/tests. */
    code?: SettlementDocumentResolveErrorCode | 'settlement_mode_off' | 'missing_location' | 'missing_workspace';
};

/**
 * Active Mobile Base settlement identity from the vehicle mobileBase link only.
 * Does not infer from location, display name, or root file presence.
 */
export function extractActiveMobileBaseSettlementId(
    vehicleState: VehicleState | undefined
): string | undefined {
    const vehicle = resolveActiveMobileBaseVehicle(vehicleState);
    if (!vehicle?.mobileBase) {
        return undefined;
    }
    const link = parseMobileBaseLink(vehicle.mobileBase);
    const id = link?.settlementId;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Resolve fixed settlement documents for the player's current World location.
 * Caller must only invoke when World Forge is active and a location catalog is available.
 * Returns empty state/layout on honest absence or fail-closed errors (no root singleton hide).
 */
export function loadFixedSettlementForWorldView(input: {
    enableSettlementMode: boolean;
    workspaceRoot: string | undefined;
    /** Exact current location ID (no repair/trim). */
    currentLocationId: string | undefined;
    forgeLocationIds: ReadonlySet<string>;
    activeMobileBaseSettlementId?: string;
}): FixedSettlementWorldViewLoad {
    if (input.enableSettlementMode !== true) {
        return { code: 'settlement_mode_off' };
    }

    const locationId = input.currentLocationId;
    if (typeof locationId !== 'string' || locationId.length === 0) {
        return { code: 'missing_location' };
    }

    const workspaceRoot = input.workspaceRoot;
    if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
        return { code: 'missing_workspace' };
    }

    const resolved = resolveFixedSettlementDocuments({
        workspaceRoot,
        requestedLocationId: locationId,
        forgeLocationIds: input.forgeLocationIds,
        activeMobileBaseSettlementId: input.activeMobileBaseSettlementId,
    });

    if (resolved.ok) {
        return {
            state: resolved.state,
            layout: resolved.layout,
            source: resolved.source,
        };
    }

    if (FAIL_CLOSED_CODES.has(resolved.code) || HONEST_ABSENCE_CODES.has(resolved.code)) {
        if (FAIL_CLOSED_CODES.has(resolved.code) && !HONEST_ABSENCE_CODES.has(resolved.code)) {
            // Bounded diagnostic only — no popup, no raw file contents.
            console.warn(`[worldView] fixed settlement omit (${resolved.code}) location=${locationId}`);
        }
        return { code: resolved.code };
    }

    // Unknown code: fail closed.
    console.warn(`[worldView] fixed settlement omit (unclassified ${resolved.code}) location=${locationId}`);
    return { code: resolved.code };
}
