// Campaign Kit Phase D-lite: parse/apply turn_result.discoveryOps (pure).

import type { DiscoveryKind } from './campaignKitCore';
import type {
    DiscoveryCondition,
    DiscoveryEntry,
    DiscoveryLedgerDocument,
    DiscoveryStatus,
} from './discoveryLedgerCore';
import {
    finalizeDiscoveryEntry,
    resolveDiscoveryConditionAfterPatch,
    resolveDiscoveryStatusAfterPatch,
} from './discoveryAppraisalCore';

export const MAX_DISCOVERY_OPS = 8;

export type DiscoveryTurnOpKind = 'add' | 'update' | 'remove';

export interface DiscoveryTurnOp {
    op: DiscoveryTurnOpKind;
    id: string;
    label?: string;
    discoveryKind?: DiscoveryKind;
    status?: DiscoveryStatus;
    siteId?: string;
    notes?: string;
    valueHint?: string;
    identifiedLabel?: string;
    condition?: DiscoveryCondition;
    estValue?: number;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function asId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return ID_RE.test(id) ? id : '';
}

function asKind(raw: unknown): DiscoveryKind | undefined {
    return raw === 'material'
        || raw === 'lore'
        || raw === 'social'
        || raw === 'route'
        || raw === 'threat'
        || raw === 'quest'
        ? raw
        : undefined;
}

function asStatus(raw: unknown): DiscoveryStatus | undefined {
    return raw === 'unidentified'
        || raw === 'identified'
        || raw === 'appraised'
        || raw === 'sold'
        || raw === 'consumed'
        ? raw
        : undefined;
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

function clampText(raw: unknown, max: number): string | undefined {
    if (typeof raw !== 'string') { return undefined; }
    const t = raw.trim().replace(/\s+/g, ' ');
    return t ? t.slice(0, max) : undefined;
}

function parseOp(raw: unknown): DiscoveryTurnOp | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const op = r.op === 'add' || r.op === 'update' || r.op === 'remove' ? r.op : undefined;
    const id = asId(r.id);
    if (!op || !id) { return undefined; }
    const parsed: DiscoveryTurnOp = { op, id };
    const label = clampText(r.label, 120);
    if (label) { parsed.label = label; }
    const discoveryKind = asKind(r.discoveryKind ?? r.kind);
    if (discoveryKind) { parsed.discoveryKind = discoveryKind; }
    const status = asStatus(r.status);
    if (status) { parsed.status = status; }
    const siteId = asId(r.siteId);
    if (siteId) { parsed.siteId = siteId; }
    const notes = clampText(r.notes, 240);
    if (notes) { parsed.notes = notes; }
    const valueHint = clampText(r.valueHint, 120);
    if (valueHint) { parsed.valueHint = valueHint; }
    const identifiedLabel = clampText(r.identifiedLabel, 120);
    if (identifiedLabel) { parsed.identifiedLabel = identifiedLabel; }
    const condition = asCondition(r.condition);
    if (condition) { parsed.condition = condition; }
    const estValue = asEstValue(r.estValue);
    if (estValue !== undefined) { parsed.estValue = estValue; }
    if (op === 'add' && !parsed.label) {
        return undefined;
    }
    return parsed;
}

export function parseDiscoveryOps(raw: unknown): DiscoveryTurnOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: DiscoveryTurnOp[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_DISCOVERY_OPS * 2)) {
        const op = parseOp(item);
        if (!op) { continue; }
        const key = `${op.op}:${op.id}`;
        if (seen.has(key)) { continue; }
        out.push(op);
        seen.add(key);
        if (out.length >= MAX_DISCOVERY_OPS) { break; }
    }
    return out;
}

function mergeEntry(base: DiscoveryEntry | undefined, op: DiscoveryTurnOp, acquiredWorldTurn?: number): DiscoveryEntry | undefined {
    if (op.op === 'remove') {
        return undefined;
    }
    if (op.op === 'add') {
        const entry: DiscoveryEntry = {
            id: op.id,
            kind: op.discoveryKind ?? 'material',
            label: op.label!,
            status: op.status ?? 'unidentified',
        };
        if (op.siteId) { entry.siteId = op.siteId; }
        if (op.notes) { entry.notes = op.notes; }
        if (op.valueHint) { entry.valueHint = op.valueHint; }
        if (op.identifiedLabel) { entry.identifiedLabel = op.identifiedLabel; }
        if (op.estValue !== undefined) { entry.estValue = op.estValue; }
        const addedCondition = resolveDiscoveryConditionAfterPatch(entry, entry.status, op.condition);
        if (addedCondition) { entry.condition = addedCondition; }
        if (acquiredWorldTurn !== undefined) { entry.acquiredWorldTurn = acquiredWorldTurn; }
        return finalizeDiscoveryEntry(entry, 'unidentified');
    }
    if (!base) {
        return undefined;
    }
    const next: DiscoveryEntry = { ...base };
    if (op.label) { next.label = op.label; }
    if (op.discoveryKind) { next.kind = op.discoveryKind; }
    if (op.siteId) { next.siteId = op.siteId; }
    if (op.notes) { next.notes = op.notes; }
    if (op.valueHint) { next.valueHint = op.valueHint; }
    if (op.identifiedLabel) { next.identifiedLabel = op.identifiedLabel; }
    if (op.estValue !== undefined) { next.estValue = op.estValue; }
    next.status = resolveDiscoveryStatusAfterPatch(base, {
        status: op.status,
        label: op.label,
        identifiedLabel: op.identifiedLabel,
    });
    const nextCondition = resolveDiscoveryConditionAfterPatch(base, next.status, op.condition);
    if (nextCondition) { next.condition = nextCondition; }
    return finalizeDiscoveryEntry(next, base.status);
}

export function applyDiscoveryOpsToLedger(
    ledger: DiscoveryLedgerDocument | undefined,
    ops: DiscoveryTurnOp[],
    acquiredWorldTurn?: number
): DiscoveryLedgerDocument {
    const base = ledger ?? { version: 1 as const, entries: [] };
    const byId = new Map(base.entries.map((e) => [e.id, e]));
    for (const op of ops) {
        if (op.op === 'remove') {
            byId.delete(op.id);
            continue;
        }
        const merged = mergeEntry(byId.get(op.id), op, acquiredWorldTurn);
        if (merged) {
            byId.set(op.id, merged);
        }
    }
    const entries = [...byId.values()].slice(0, 48);
    return { version: 1, entries };
}

export function discoveryOpsSummary(ops: DiscoveryTurnOp[]): string {
    if (!ops.length) { return ''; }
    return ops.map((o) => `${o.op}:${o.id}`).join(', ');
}