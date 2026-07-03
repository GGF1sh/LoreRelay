// Campaign Kit Phase D: discovery appraisal status machine (pure).

import type { CampaignKitConfig } from './campaignKitCore';
import type { DiscoveryEntry, DiscoveryStatus } from './discoveryLedgerCore';

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
    ];
}

export function buildDiscoveryAppraisalPromptBlock(kit?: CampaignKitConfig): string {
    const lines = buildDiscoveryAppraisalPromptLines(kit);
    return lines.length ? `[Campaign Appraisal]\n${lines.join('\n')}` : '';
}