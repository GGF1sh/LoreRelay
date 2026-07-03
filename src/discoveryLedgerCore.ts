// Campaign Kit Phase B: discovery ledger schema (pure, no vscode/fs).

import type { CampaignKitConfig, DiscoveryKind } from './campaignKitCore';
import { buildDiscoveryAppraisalPromptLines } from './discoveryAppraisalCore';

export type DiscoveryStatus = 'unidentified' | 'identified' | 'appraised' | 'sold' | 'consumed';

/** Service state applied via hub repair/upgrade services (Phase F). Only meaningful once identified. */
export type DiscoveryCondition = 'standard' | 'repaired' | 'upgraded' | 'damaged';

export interface DiscoveryEntry {
    id: string;
    kind: DiscoveryKind;
    /** Player-facing label (vague before appraisal). */
    label: string;
    status: DiscoveryStatus;
    siteId?: string;
    /** Optional hint for GM (not player spoiler). */
    valueHint?: string;
    /** Set when status is identified or appraised. */
    identifiedLabel?: string;
    notes?: string;
    acquiredWorldTurn?: number;
    /** Service state from repair/upgrade; only settable once identified (not on 'unidentified'). */
    condition?: DiscoveryCondition;
    /** GM base value estimate; combined with condition for a suggested sell price. */
    estValue?: number;
}

/** Repair/upgrade raises the suggested sell value; damage lowers it. Applied on top of estValue. */
export const CONDITION_VALUE_MULTIPLIER: Record<DiscoveryCondition, number> = {
    standard: 1,
    repaired: 1.3,
    upgraded: 1.6,
    damaged: 0.6,
};

/** Canonical suggested sell price for an appraised/identified find; GM should anchor sell_discovery near this. */
export function computeSuggestedSellValue(entry: Pick<DiscoveryEntry, 'estValue' | 'condition'>): number | undefined {
    if (typeof entry.estValue !== 'number' || !Number.isFinite(entry.estValue) || entry.estValue < 0) {
        return undefined;
    }
    const multiplier = CONDITION_VALUE_MULTIPLIER[entry.condition ?? 'standard'];
    return Math.round(entry.estValue * multiplier);
}

export interface DiscoveryLedgerDocument {
    version: 1;
    entries: DiscoveryEntry[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_ENTRIES = 48;
const MAX_LABEL = 120;
const MAX_NOTES = 240;
const MAX_HINT = 120;

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function asId(raw: unknown): string {
    const id = clampText(raw, 64);
    return ID_RE.test(id) ? id : '';
}

function asKind(raw: unknown): DiscoveryKind {
    return raw === 'material'
        || raw === 'lore'
        || raw === 'social'
        || raw === 'route'
        || raw === 'threat'
        || raw === 'quest'
        ? raw
        : 'material';
}

function asStatus(raw: unknown): DiscoveryStatus {
    return raw === 'unidentified'
        || raw === 'identified'
        || raw === 'appraised'
        || raw === 'sold'
        || raw === 'consumed'
        ? raw
        : 'unidentified';
}

function asCondition(raw: unknown): DiscoveryCondition | undefined {
    return raw === 'standard'
        || raw === 'repaired'
        || raw === 'upgraded'
        || raw === 'damaged'
        ? raw
        : undefined;
}

function asEstValue(raw: unknown): number | undefined {
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? Math.min(999999, Math.round(raw))
        : undefined;
}

function parseEntry(raw: unknown): DiscoveryEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const label = clampText(r.label, MAX_LABEL);
    if (!id || !label) { return undefined; }
    const entry: DiscoveryEntry = {
        id,
        kind: asKind(r.kind),
        label,
        status: asStatus(r.status),
    };
    const siteId = asId(r.siteId);
    if (siteId) { entry.siteId = siteId; }
    const valueHint = clampText(r.valueHint, MAX_HINT);
    if (valueHint) { entry.valueHint = valueHint; }
    const identifiedLabel = clampText(r.identifiedLabel, MAX_LABEL);
    if (identifiedLabel) { entry.identifiedLabel = identifiedLabel; }
    const notes = clampText(r.notes, MAX_NOTES);
    if (notes) { entry.notes = notes; }
    if (typeof r.acquiredWorldTurn === 'number' && Number.isFinite(r.acquiredWorldTurn)) {
        entry.acquiredWorldTurn = Math.max(0, Math.floor(r.acquiredWorldTurn));
    }
    const condition = asCondition(r.condition);
    if (condition && condition !== 'standard' && entry.status !== 'unidentified') {
        entry.condition = condition;
    }
    const estValue = asEstValue(r.estValue);
    if (estValue !== undefined) { entry.estValue = estValue; }
    return entry;
}

export function parseDiscoveryLedger(raw: unknown): DiscoveryLedgerDocument | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    if (r.version !== 1) {
        return undefined;
    }
    if (!Array.isArray(r.entries)) {
        return { version: 1, entries: [] };
    }
    const entries: DiscoveryEntry[] = [];
    const seen = new Set<string>();
    for (const item of r.entries.slice(0, MAX_ENTRIES * 2)) {
        const entry = parseEntry(item);
        if (!entry || seen.has(entry.id)) { continue; }
        entries.push(entry);
        seen.add(entry.id);
        if (entries.length >= MAX_ENTRIES) { break; }
    }
    return { version: 1, entries };
}

function formatEntryLine(entry: DiscoveryEntry): string {
    const display = entry.status === 'unidentified'
        ? entry.label
        : (entry.identifiedLabel || entry.label);
    const site = entry.siteId ? ` @ ${entry.siteId}` : '';
    const hint = entry.valueHint ? ` (${entry.valueHint})` : '';
    // Keep unidentified finds vague: no condition/value leak before appraisal.
    const revealed = entry.status !== 'unidentified';
    const condition = revealed && entry.condition && entry.condition !== 'standard' ? ` [${entry.condition}]` : '';
    const suggested = revealed ? computeSuggestedSellValue(entry) : undefined;
    const value = suggested !== undefined ? ` ~${suggested}` : '';
    return `- ${entry.status}/${entry.kind}: ${display}${site}${hint}${condition}${value}`;
}

/** GM prompt block for active expedition findings (guidance; canonical updates via turn_result). */
export function buildDiscoveryLedgerPromptBlock(
    ledger: DiscoveryLedgerDocument | undefined,
    maxEntries = 12,
    kit?: CampaignKitConfig
): string {
    if (!ledger?.entries.length) { return ''; }
    const active = ledger.entries
        .filter((e) => e.status !== 'sold' && e.status !== 'consumed')
        .slice(0, maxEntries);
    if (!active.length) { return ''; }
    const lines = [
        '[Campaign Discoveries]',
        ...active.map(formatEntryLine),
        'Unidentified entries should stay vague until appraisal/repair/decode. Update ledger facts through turn_result.discoveryOps — do not invent new discovery IDs silently.',
        'Entries show [condition] and ~suggested value when set (estValue x condition multiplier: standard 1x, repaired 1.3x, upgraded 1.6x, damaged 0.6x). Anchor negotiated sell_discovery price near the suggested value.',
        ...buildDiscoveryAppraisalPromptLines(kit),
    ];
    return lines.join('\n');
}