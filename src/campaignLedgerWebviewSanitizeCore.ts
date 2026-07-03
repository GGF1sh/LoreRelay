// PR-E — FoW-safe Campaign Kit ledger fields for World tab webview (pure, no vscode/fs).

import type { CampaignKitTerm } from './campaignKitCore';
import {
    computeSuggestedSellValue,
    type DiscoveryCondition,
    type DiscoveryEntry,
    type DiscoveryLedgerDocument,
    type DiscoveryStatus,
} from './discoveryLedgerCore';

/** Discovery statuses shown in World tab (sold/consumed are hidden). */
export const WEBVIEW_DISCOVERY_STATUSES: readonly DiscoveryStatus[] = [
    'unidentified',
    'identified',
    'appraised',
];

/** Allowed keys on each discovery row sent to webview. */
export const WEBVIEW_DISCOVERY_ENTRY_KEYS = [
    'id',
    'kind',
    'label',
    'status',
    'siteId',
    'siteName',
    'condition',
    'suggestedValue',
] as const;

/** Allowed keys on each campaign resource row sent to webview. */
export const WEBVIEW_CAMPAIGN_RESOURCE_KEYS = ['id', 'name', 'qty'] as const;

export type WebviewDiscoveryEntry = {
    id: string;
    kind: DiscoveryEntry['kind'];
    label: string;
    status: DiscoveryStatus;
    siteId?: string;
    siteName?: string;
    condition?: DiscoveryCondition;
    suggestedValue?: number;
};

export type WebviewCampaignResourceEntry = {
    id: string;
    name: string;
    qty: number;
};

function displayLabel(entry: DiscoveryEntry): string {
    if (entry.status === 'unidentified') {
        return entry.label;
    }
    return entry.identifiedLabel || entry.label;
}

/** FoW-safe discovery list — no valueHint/notes/estValue; condition/value hidden until identified. */
export function pickDiscoveriesForWebviewCore(
    ledger: DiscoveryLedgerDocument | undefined,
    options: {
        maxEntries?: number;
        resolveSiteName?: (siteId: string) => string | undefined;
    } = {}
): WebviewDiscoveryEntry[] | undefined {
    const maxEntries = options.maxEntries ?? 24;
    const resolveSiteName = options.resolveSiteName;
    if (!ledger?.entries.length) { return undefined; }

    const active = ledger.entries
        .filter((e) => WEBVIEW_DISCOVERY_STATUSES.includes(e.status))
        .slice(0, maxEntries)
        .map((e) => {
            const revealed = e.status !== 'unidentified';
            const row: WebviewDiscoveryEntry = {
                id: e.id,
                kind: e.kind,
                label: displayLabel(e),
                status: e.status,
            };
            if (e.siteId) {
                row.siteId = e.siteId;
                const siteName = resolveSiteName?.(e.siteId);
                if (siteName) {
                    row.siteName = siteName;
                }
            }
            if (revealed && e.condition && e.condition !== 'standard') {
                row.condition = e.condition;
            }
            if (revealed) {
                const suggested = computeSuggestedSellValue(e);
                if (suggested !== undefined) {
                    row.suggestedValue = suggested;
                }
            }
            return row;
        });

    return active.length ? active : undefined;
}

/** Campaign resource quantities for World tab — id/name/qty only (no internal kit metadata). */
export function pickResourcesForWebviewCore(
    resources: CampaignKitTerm[],
    quantities: Record<string, number> | undefined,
    maxResources = 8
): WebviewCampaignResourceEntry[] | undefined {
    if (!resources.length) { return undefined; }
    return resources.slice(0, maxResources).map((r) => ({
        id: r.id,
        name: r.name,
        qty: quantities?.[r.id] ?? 0,
    }));
}

/** Assert a webview discovery row contains only whitelisted keys (test / debug helper). */
export function isWebviewDiscoveryEntrySanitized(row: WebviewDiscoveryEntry): boolean {
    const allowed = new Set(WEBVIEW_DISCOVERY_ENTRY_KEYS);
    return Object.keys(row).every((key) => allowed.has(key as typeof WEBVIEW_DISCOVERY_ENTRY_KEYS[number]));
}

/** Assert a webview resource row contains only whitelisted keys (test / debug helper). */
export function isWebviewCampaignResourceEntrySanitized(row: WebviewCampaignResourceEntry): boolean {
    const allowed = new Set(WEBVIEW_CAMPAIGN_RESOURCE_KEYS);
    return Object.keys(row).every((key) => allowed.has(key as typeof WEBVIEW_CAMPAIGN_RESOURCE_KEYS[number]));
}