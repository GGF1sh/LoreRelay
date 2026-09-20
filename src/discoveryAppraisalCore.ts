// Campaign Kit Phase D: discovery appraisal status machine (pure).

import type { CampaignKitConfig } from './campaignKitCore';
import type { DiscoveryCondition, DiscoveryEntry, DiscoveryStatus } from './discoveryLedgerCore';

export const DISCOVERY_TERMINAL_STATUSES: readonly DiscoveryStatus[] = ['sold', 'consumed'];

const ALLOWED_TRANSITIONS: Record<DiscoveryStatus, readonly DiscoveryStatus[]> = {
    unidentified: ['identified', 'appraised', 'sold', 'consumed'],
    identified: ['appraised', 'sold', 'consumed'],
    appraised: ['sold', 'consumed'],
    sold: [],
    consumed: [],
};

export function isAllowedDiscoveryTransition(from: DiscoveryStatus, to: DiscoveryStatus): boolean {
    if (from === to) { return true; }
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface DiscoveryStatusPatch {
    status?: DiscoveryStatus;
    label?: string;
    identifiedLabel?: string;
}

/** Infer/coerce status from patch fields; never widens past allowed transitions. */
export function resolveDiscoveryStatusAfterPatch(
    entry: DiscoveryEntry,
    patch: DiscoveryStatusPatch
): DiscoveryStatus {
    let next = patch.status ?? entry.status;

    if (!patch.status && patch.identifiedLabel && entry.status === 'unidentified') {
        next = 'identified';
    }

    if (patch.status === 'appraised' && entry.status === 'unidentified' && (patch.identifiedLabel || entry.identifiedLabel)) {
        next = 'appraised';
    }

    if (!isAllowedDiscoveryTransition(entry.status, next)) {
        return entry.status;
    }

    return next;
}

/** A find must be identified (and not yet relinquished) before hub services can repair/upgrade it. */
export function isServiceableStatus(status: DiscoveryStatus): boolean {
    return status === 'identified' || status === 'appraised';
}

/** Resolve the condition to persist for a patch; drops the change if the entry isn't in a serviceable state. */
export function resolveDiscoveryConditionAfterPatch(
    entry: Pick<DiscoveryEntry, 'status' | 'condition'>,
    resultingStatus: DiscoveryStatus,
    patchCondition: DiscoveryCondition | undefined
): DiscoveryCondition | undefined {
    if (patchCondition === undefined) { return entry.condition; }
    if (!isServiceableStatus(resultingStatus)) { return entry.condition; }
    return patchCondition;
}

export function validateAppraisedEntry(entry: DiscoveryEntry): boolean {
    if (entry.status !== 'appraised' && entry.status !== 'identified') {
        return true;
    }
    if (entry.status === 'identified') {
        return Boolean(entry.identifiedLabel || entry.label);
    }
    return Boolean(entry.identifiedLabel || entry.label);
}

/** Apply status machine rules to a merged entry; drops illegal transitions. */
export function finalizeDiscoveryEntry(entry: DiscoveryEntry, previousStatus: DiscoveryStatus): DiscoveryEntry {
    const next: DiscoveryEntry = { ...entry };
    if (!isAllowedDiscoveryTransition(previousStatus, next.status)) {
        next.status = previousStatus;
    }
    if (next.status === 'appraised' && !next.identifiedLabel && next.label) {
        next.identifiedLabel = next.label;
    }
    if (next.status === 'identified' && next.identifiedLabel && next.label === next.identifiedLabel) {
        // keep vague label separate when both exist
    }
    return next;
}

export function buildDiscoveryAppraisalPromptLines(kit?: CampaignKitConfig): string[] {
    const appraisal = kit?.loop.appraisalLabel ?? 'Appraisal';
    return [
        `Discovery status flow: unidentified → identified → appraised → sold/consumed (terminal).`,
        `${appraisal} or expert NPCs should move material/lore finds along this chain via discoveryOps update.`,
        'Setting identifiedLabel promotes unidentified → identified. status "appraised" requires a clear identifiedLabel.',
        'Illegal backward transitions are ignored by core. Use sold/consumed when the player relinquishes the find.',
        `${appraisal} or repair/upgrade services may set discoveryOps condition ("repaired"|"upgraded"|"damaged") and estValue (base price estimate) once a find is identified or appraised — condition changes on unidentified finds are ignored by core.`,
        'To sell an appraised discovery, output tradeOps [{ op: "sell_discovery", discoveryId: "id", value: <negotiated_price> }] AND discoveryOps [{ op: "update", id: "id", status: "sold" }]. Anchor the negotiated value near the ledger\'s suggested value (estValue x condition multiplier) when one is shown.',
    ];
}

export function buildDiscoveryAppraisalPromptBlock(kit?: CampaignKitConfig): string {
    const lines = buildDiscoveryAppraisalPromptLines(kit);
    return lines.length ? `[Campaign Appraisal]\n${lines.join('\n')}` : '';
}