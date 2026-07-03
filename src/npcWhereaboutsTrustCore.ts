// LW2 v1+ — NPC whereabouts precision from playerTrust (pure, no vscode/fs).

import type { NpcPresence } from './npcAgencyCore';

export const TRUST_WHEREABOUTS_EXACT_MIN = 70;
export const TRUST_WHEREABOUTS_UNKNOWN_MAX = 30;
export const DEFAULT_NPC_PLAYER_TRUST = 50;

export type WhereaboutsPrecision = 'exact' | 'approximate' | 'unknown';

export function resolveWhereaboutsPrecision(playerTrust: number): WhereaboutsPrecision {
    const trust = Math.max(0, Math.min(100, Math.floor(playerTrust)));
    if (trust >= TRUST_WHEREABOUTS_EXACT_MIN) { return 'exact'; }
    if (trust <= TRUST_WHEREABOUTS_UNKNOWN_MAX) { return 'unknown'; }
    return 'approximate';
}

export function readNpcPlayerTrust(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(0, Math.min(100, Math.floor(raw)));
    }
    return DEFAULT_NPC_PLAYER_TRUST;
}

export interface WhereaboutsFormatContext {
    locationNames?: Record<string, string>;
    regionNames?: Record<string, string>;
    locationToRegion?: Record<string, string>;
}

export interface FormattedWhereabouts {
    precision: WhereaboutsPrecision;
    locationLabel: string;
    regionLabel?: string;
    showReason: boolean;
    showAgenda: boolean;
}

function locName(id: string, names?: Record<string, string>): string {
    return names?.[id] ?? id;
}

function regionForLocation(
    locationId: string,
    ctx: WhereaboutsFormatContext
): string | undefined {
    const regionId = ctx.locationToRegion?.[locationId];
    if (!regionId) { return undefined; }
    return ctx.regionNames?.[regionId] ?? regionId;
}

export function formatWhereaboutsForDisplay(
    precision: WhereaboutsPrecision,
    locationId: string,
    inTransit: boolean,
    ctx: WhereaboutsFormatContext
): FormattedWhereabouts {
    const locLabel = locName(locationId, ctx.locationNames);
    const regionLabel = regionForLocation(locationId, ctx);

    if (precision === 'unknown') {
        return {
            precision,
            locationLabel: 'unknown',
            showReason: false,
            showAgenda: false,
        };
    }

    if (precision === 'approximate') {
        if (inTransit) {
            return {
                precision,
                locationLabel: regionLabel ? `heading toward ${regionLabel}` : 'somewhere nearby',
                regionLabel,
                showReason: false,
                showAgenda: false,
            };
        }
        return {
            precision,
            locationLabel: regionLabel ?? locLabel,
            regionLabel,
            showReason: false,
            showAgenda: false,
        };
    }

    return {
        precision,
        locationLabel: locLabel,
        regionLabel,
        showReason: true,
        showAgenda: true,
    };
}

export interface NpcTrustLookup {
    readTrust(npcId: string): number;
}

export interface SanitizedNpcAgencyOp {
    npcId: string;
    precision: WhereaboutsPrecision;
    locationId?: string;
    arrivesTurn?: number;
    agenda?: string;
    reason?: string;
}

export function sanitizeNpcAgencyOpForWebview(
    op: {
        npcId: string;
        locationId: string;
        arrivesTurn: number;
        agenda?: string;
        reason?: string;
    },
    playerTrust: number
): SanitizedNpcAgencyOp {
    const precision = resolveWhereaboutsPrecision(playerTrust);
    if (precision === 'unknown') {
        return { npcId: op.npcId, precision };
    }
    if (precision === 'approximate') {
        return {
            npcId: op.npcId,
            precision,
            arrivesTurn: op.arrivesTurn,
        };
    }
    return {
        npcId: op.npcId,
        precision,
        locationId: op.locationId,
        arrivesTurn: op.arrivesTurn,
        agenda: op.agenda,
        reason: op.reason,
    };
}

export function sanitizeNpcAgencyOpsForWebview(
    ops: Array<{
        npcId: string;
        locationId: string;
        arrivesTurn: number;
        agenda?: string;
        reason?: string;
    }>,
    trustLookup: NpcTrustLookup
): SanitizedNpcAgencyOp[] {
    return ops.map((op) => sanitizeNpcAgencyOpForWebview(op, trustLookup.readTrust(op.npcId)));
}

export function formatWhereaboutsGmLine(
    presence: Pick<NpcPresence, 'name' | 'locationId' | 'inTransit' | 'arrivesTurn' | 'agenda' | 'reason'>,
    playerTrust: number,
    ctx: WhereaboutsFormatContext,
    formatReason: (reason: string | undefined) => string
): string {
    const precision = resolveWhereaboutsPrecision(playerTrust);
    const formatted = formatWhereaboutsForDisplay(
        precision,
        presence.locationId,
        presence.inTransit,
        ctx
    );

    if (precision === 'unknown') {
        return `${presence.name}: whereabouts unknown (low trust)`;
    }

    const reasonText = formatted.showReason ? formatReason(presence.reason) : '';
    const reasonSuffix = reasonText ? ` — ${reasonText}` : '';

    if (presence.inTransit) {
        const prefix = precision === 'approximate' ? '' : 'en route to ';
        return `${presence.name}: ${prefix}${formatted.locationLabel} (arrives turn ${presence.arrivesTurn})${reasonSuffix}`;
    }

    const agendaPart = formatted.showAgenda && presence.agenda ? ` (${presence.agenda})` : '';
    return `${presence.name}: at ${formatted.locationLabel}${agendaPart}${reasonSuffix}`;
}