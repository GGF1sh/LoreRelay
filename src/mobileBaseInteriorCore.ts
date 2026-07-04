// Mobile Base System MB5: reuse Settlement Mode snapshots for interior view (pure, no vscode/fs/DOM).

import type { SettlementLayoutV1, SettlementLayerId, SettlementStateV1 } from './settlementCore';
import {
    mobileBaseSystemEnabled,
    parseMobileBaseLink,
    validateMobileBaseLink,
    type MobileBaseRuleFlags,
} from './mobileBaseCore';
import type { VehicleEntry } from './vehicleCore';
import {
    buildSettlementExpansionPreviews,
    buildSettlementViewSnapshot,
    sanitizeSettlementExpansionPreviewsForWebview,
    sanitizeSettlementViewForWebview,
    type SettlementExpansionPreview,
    type SettlementViewSnapshot,
} from './settlementViewCore';
import {
    buildWorkspaceSettlementDiorama,
    type SettlementDioramaRuleFlags,
} from './settlementDioramaBridge';
import type { SettlementDioramaSnapshot, SettlementDioramaTheme } from './settlementDioramaCore';

export const MOBILE_BASE_INTERIOR_VERSION = 1 as const;

const BLOCKED_INTERIOR_ACCESS = new Set(['locked', 'damaged', 'unsafe']);

export const MOBILE_BASE_INTERIOR_PAYLOAD_KEYS = [
    'version', 'vehicleId', 'vehicleName', 'settlementId', 'mode', 'layoutProfile',
    'interiorAccess', 'interiorBlocked', 'interiorBlockReason', 'hasCanvas', 'hasDiorama',
    'settlementView', 'settlementDiorama', 'settlementExpansionPreviews',
] as const;

export interface MobileBaseInteriorPayload {
    version: typeof MOBILE_BASE_INTERIOR_VERSION;
    vehicleId: string;
    vehicleName: string;
    settlementId: string;
    mode: string;
    layoutProfile: string;
    interiorAccess?: string;
    interiorBlocked: boolean;
    interiorBlockReason?: string;
    hasCanvas: boolean;
    hasDiorama: boolean;
    settlementView?: SettlementViewSnapshot;
    settlementDiorama?: SettlementDioramaSnapshot;
    settlementExpansionPreviews?: SettlementExpansionPreview[];
}

export type MobileBaseInteriorRuleFlags = MobileBaseRuleFlags & SettlementDioramaRuleFlags;

export interface MobileBaseInteriorBuildOptions {
    selectedLayerId?: SettlementLayerId;
    dioramaTheme?: SettlementDioramaTheme;
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function interiorBlockReason(access: string | undefined): string | undefined {
    if (!access || !BLOCKED_INTERIOR_ACCESS.has(access)) { return undefined; }
    return `interior_${access}`;
}

function viewHasCanvas(view: SettlementViewSnapshot | undefined): boolean {
    if (!view) { return false; }
    return Boolean(
        (Array.isArray(view.tiles) && view.tiles.length > 0)
        || (Array.isArray(view.markers) && view.markers.length > 0)
    );
}

function dioramaHasContent(snapshot: SettlementDioramaSnapshot | undefined): boolean {
    if (!snapshot) { return false; }
    return Boolean(
        (Array.isArray(snapshot.blocks) && snapshot.blocks.length > 0)
        || (Array.isArray(snapshot.markers) && snapshot.markers.length > 0)
    );
}

/** Build capped mobile-base interior payload from validated vehicle+settlement link. */
export function buildMobileBaseInteriorPayload(
    vehicle: VehicleEntry | undefined,
    settlement: SettlementStateV1 | undefined,
    layout: SettlementLayoutV1 | undefined,
    rules: MobileBaseInteriorRuleFlags | undefined,
    options?: MobileBaseInteriorBuildOptions
): MobileBaseInteriorPayload | undefined {
    if (!mobileBaseSystemEnabled(rules) || !vehicle || !settlement) {
        return undefined;
    }

    const validation = validateMobileBaseLink(vehicle, settlement);
    if (!validation.isMobileBase || !validation.ok) {
        return undefined;
    }

    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) {
        return undefined;
    }

    const interiorAccess = link.interiorAccess && link.interiorAccess !== 'open'
        ? link.interiorAccess
        : undefined;
    const blocked = Boolean(interiorAccess && BLOCKED_INTERIOR_ACCESS.has(interiorAccess));

    const base: MobileBaseInteriorPayload = {
        version: MOBILE_BASE_INTERIOR_VERSION,
        vehicleId: vehicle.id,
        vehicleName: clampText(vehicle.name, 80),
        settlementId: link.settlementId,
        mode: link.mode,
        layoutProfile: link.layoutProfile,
        interiorBlocked: blocked,
        hasCanvas: false,
        hasDiorama: false,
    };

    if (interiorAccess) {
        base.interiorAccess = interiorAccess;
    }
    if (blocked) {
        base.interiorBlockReason = interiorBlockReason(interiorAccess);
        return base;
    }

    const settlementView = buildSettlementViewSnapshot({
        state: settlement,
        layout,
        selectedLayerId: options?.selectedLayerId ?? 'z0',
    });
    if (!settlementView) {
        return undefined;
    }

    const expansionPreviews = buildSettlementExpansionPreviews(settlement, layout);
    const settlementDiorama = buildWorkspaceSettlementDiorama(
        settlementView,
        rules,
        { theme: options?.dioramaTheme, includeLabels: true }
    );

    const safeView = sanitizeSettlementViewForWebview(settlementView);
    if (!safeView) {
        return undefined;
    }
    base.hasCanvas = viewHasCanvas(safeView);
    base.hasDiorama = dioramaHasContent(settlementDiorama);
    base.settlementView = safeView;
    if (settlementDiorama) {
        base.settlementDiorama = settlementDiorama;
    }
    const safePreviews = sanitizeSettlementExpansionPreviewsForWebview(expansionPreviews);
    if (safePreviews.length) {
        base.settlementExpansionPreviews = safePreviews;
    }

    return base;
}

export function pickMobileBaseInteriorPayloadKeys(
    payload: MobileBaseInteriorPayload
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of MOBILE_BASE_INTERIOR_PAYLOAD_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) { continue; }
        out[key] = (payload as unknown as Record<string, unknown>)[key];
    }
    return out;
}