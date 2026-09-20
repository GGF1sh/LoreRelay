// Campaign Kit Phase G: consumable genre resources (water/ammo/medicine/etc), pure (no vscode/fs).
// Extends the "拠点生活" loop: hub services and travel spend supplies the GM tracks and narrates.

import type { CampaignKitConfig } from './campaignKitCore';

export interface CampaignResourcesDocument {
    version: 1;
    /** resourceId (must match the active kit's `resources` ids) -> quantity, clamped [0, MAX_RESOURCE_QTY]. */
    quantities: Record<string, number>;
}

export const MAX_RESOURCE_QTY = 999999;
export const MAX_RESOURCE_OPS = 8;
export const MAX_RESOURCE_DELTA_PER_OP = 500;
export const DEFAULT_STARTING_QTY = 10;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function clampQty(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) { return undefined; }
    return Math.min(MAX_RESOURCE_QTY, Math.round(raw));
}

function asResourceId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return ID_RE.test(id) ? id : '';
}

export function parseCampaignResourcesDocument(raw: unknown): CampaignResourcesDocument | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (r.version !== 1) { return undefined; }
    const quantities: Record<string, number> = {};
    if (r.quantities && typeof r.quantities === 'object' && !Array.isArray(r.quantities)) {
        for (const [rawId, val] of Object.entries(r.quantities as Record<string, unknown>)) {
            const id = asResourceId(rawId);
            const qty = clampQty(val);
            if (id && qty !== undefined) { quantities[id] = qty; }
        }
    }
    return { version: 1, quantities };
}

/** Starting supplies when a kit activates and no campaign_resources.json exists yet. */
export function defaultCampaignResourceQuantities(kit: CampaignKitConfig): Record<string, number> {
    const out: Record<string, number> = {};
    for (const resource of kit.resources) {
        out[resource.id] = DEFAULT_STARTING_QTY;
    }
    return out;
}

export type CampaignResourceOpKind = 'delta' | 'set';

export interface CampaignResourceOp {
    op: CampaignResourceOpKind;
    resourceId: string;
    amount: number;
    reason?: string;
}

function clampText(raw: unknown, max: number): string | undefined {
    if (typeof raw !== 'string') { return undefined; }
    const t = raw.trim().replace(/\s+/g, ' ');
    return t ? t.slice(0, max) : undefined;
}

function parseOp(raw: unknown): CampaignResourceOp | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const op = r.op === 'delta' || r.op === 'set' ? r.op : undefined;
    const resourceId = asResourceId(r.resourceId);
    if (!op || !resourceId) { return undefined; }
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) { return undefined; }
    const amount = op === 'set'
        ? Math.max(0, Math.min(MAX_RESOURCE_QTY, Math.round(r.amount)))
        : Math.max(-MAX_RESOURCE_DELTA_PER_OP, Math.min(MAX_RESOURCE_DELTA_PER_OP, Math.round(r.amount)));
    const parsed: CampaignResourceOp = { op, resourceId, amount };
    const reason = clampText(r.reason, 120);
    if (reason) { parsed.reason = reason; }
    return parsed;
}

export function parseCampaignResourceOps(raw: unknown): CampaignResourceOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: CampaignResourceOp[] = [];
    for (const item of raw.slice(0, MAX_RESOURCE_OPS * 2)) {
        const op = parseOp(item);
        if (!op) { continue; }
        out.push(op);
        if (out.length >= MAX_RESOURCE_OPS) { break; }
    }
    return out;
}

/**
 * Apply ops to the resource ledger. Ops for resource ids outside the active
 * kit's vocabulary are ignored by core (GM cannot invent untracked supplies).
 * When no kit is supplied, all ops apply (used for tests / kit-agnostic tools).
 */
export function applyCampaignResourceOps(
    current: CampaignResourcesDocument | undefined,
    ops: CampaignResourceOp[],
    kit?: CampaignKitConfig
): CampaignResourcesDocument {
    const validIds = kit ? new Set(kit.resources.map((r) => r.id)) : undefined;
    const quantities = { ...(current?.quantities ?? {}) };
    for (const op of ops) {
        if (validIds && !validIds.has(op.resourceId)) { continue; }
        const before = quantities[op.resourceId] ?? 0;
        const next = op.op === 'set' ? op.amount : before + op.amount;
        quantities[op.resourceId] = Math.max(0, Math.min(MAX_RESOURCE_QTY, Math.round(next)));
    }
    return { version: 1, quantities };
}

function formatResourceLine(name: string, qty: number | undefined): string {
    if (qty === undefined) { return `- ${name}: untracked`; }
    const warn = qty === 0 ? ' (OUT)' : qty <= 2 ? ' (low)' : '';
    return `- ${name}: ${qty}${warn}`;
}

/** GM prompt block for tracked genre supplies; canonical updates via turn_result.campaignResourceOps. */
export function buildCampaignResourcesPromptBlock(
    doc: CampaignResourcesDocument | undefined,
    kit: CampaignKitConfig | undefined
): string {
    if (!kit || !kit.resources.length) { return ''; }
    const lines = [
        '[Campaign Resources]',
        ...kit.resources.slice(0, 8).map((r) => formatResourceLine(r.name, doc?.quantities[r.id])),
        'Spend or replenish supplies through the fiction (meals, patched wounds, spent ammo, burned fuel, hub resupply) — only the resource ids listed above are tracked; core ignores unrelated ids.',
        'Persist changes via turn_result.campaignResourceOps (max 8): { op: "delta"|"set", resourceId, amount, reason? }. "delta" adds/subtracts (negative to consume); "set" pins an absolute value. Quantities never go below 0.',
        'A resource at 0 should have real narrative weight (hunger, no ammo, no medicine) — do not silently ignore it.',
    ];
    return lines.join('\n');
}
