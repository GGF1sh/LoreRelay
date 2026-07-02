// GM prompt blocks for Living World injection (no vscode/fs).

import type { CommerceForge, MarketStateMap, NpcRegistryLike, NpcPositionsMap } from './livingWorldTypes';
import { buildMarketPriceTable } from './commerceCore';
import { listNpcPresence } from './npcAgencyCore';
import type { SinceLastVisitDelta } from './worldSimCommerceCore';

export const MAX_COMMERCE_PROMPT_LINES = 12;
export const MAX_NPC_PROMPT_LINES = 10;
export const MAX_CARAVAN_PROMPT_LINES = 6;

/** Human-readable labels for deterministic NPC agency reasons (LW2-PR2). */
const NPC_REASON_LABELS: Record<string, string> = {
    food_crisis_buy_wheat: 'seeking cheap wheat after a food crisis',
    smith_restock_steel: 'restocking steel where demand is high',
    in_transit: 'traveling',
};

export function formatNpcAgencyReason(reason: string | undefined): string {
    if (!reason) { return ''; }
    const trimmed = reason.trim();
    if (!trimmed) { return ''; }
    return NPC_REASON_LABELS[trimmed] ?? trimmed.replace(/_/g, ' ');
}

export interface CaravanPromptSnapshot {
    credits: number;
    food: number;
    transportId: string;
    cargo: Array<{ commodityId: string; qty: number }>;
}

export interface LivingWorldPromptInput {
    forge: CommerceForge;
    markets: MarketStateMap;
    registry: NpcRegistryLike;
    npcPositions: NpcPositionsMap;
    worldTurn: number;
    commerceEnabled: boolean;
    agencyEnabled: boolean;
    playerLocationId?: string;
    sinceLastVisit?: SinceLastVisitDelta;
    locationNames?: Record<string, string>;
    npcNames?: Record<string, string>;
    playerCommerce?: CaravanPromptSnapshot;
}

function locLabel(id: string, names?: Record<string, string>): string {
    return names?.[id] ?? id;
}

export function buildCommercePromptLines(
    forge: CommerceForge,
    markets: MarketStateMap,
    focusLocationId?: string,
    locationNames?: Record<string, string>
): string[] {
    const table = buildMarketPriceTable(
        forge,
        markets,
        focusLocationId ? [focusLocationId] : undefined
    );
    const lines: string[] = [];
    for (const row of table) {
        const label = locLabel(row.locationId, locationNames);
        for (const q of row.quotes) {
            const commodity = forge.commodities.find((c) => c.id === q.commodityId);
            const name = commodity?.name ?? q.commodityId;
            lines.push(`${label}: ${name} ${q.unitPrice}cr (stock ${q.stock})`);
            if (lines.length >= MAX_COMMERCE_PROMPT_LINES) { return lines; }
        }
    }
    return lines;
}

export function buildSinceLastVisitLines(delta: SinceLastVisitDelta | undefined): string[] {
    if (!delta || delta.turnsAway <= 0) { return []; }
    const lines = [`Since last visit (${delta.turnsAway} world turns ago at ${delta.locationId}):`];
    for (const ch of delta.changes) {
        if (ch.stockDelta === 0 && Math.abs(ch.priceIndexDelta) < 0.01) { continue; }
        const parts: string[] = [];
        if (ch.stockDelta !== 0) { parts.push(`stock ${ch.stockDelta > 0 ? '+' : ''}${ch.stockDelta}`); }
        if (Math.abs(ch.priceIndexDelta) >= 0.01) {
            parts.push(`price index ${ch.priceIndexDelta > 0 ? '+' : ''}${ch.priceIndexDelta.toFixed(2)}`);
        }
        lines.push(`- ${ch.commodityId}: ${parts.join(', ')}`);
    }
    return lines.slice(0, MAX_COMMERCE_PROMPT_LINES);
}

export function buildNpcAgencyPromptLines(
    registry: NpcRegistryLike,
    positions: NpcPositionsMap,
    worldTurn: number,
    agencyEnabled: boolean,
    locationNames?: Record<string, string>
): string[] {
    const presence = listNpcPresence(registry, positions, worldTurn, agencyEnabled);
    const lines: string[] = [];
    for (const p of presence) {
        const where = locLabel(p.locationId, locationNames);
        const reasonText = formatNpcAgencyReason(p.reason);
        const reasonSuffix = reasonText ? ` — ${reasonText}` : '';
        if (p.inTransit) {
            lines.push(`${p.name}: en route to ${where} (arrives turn ${p.arrivesTurn})${reasonSuffix}`);
        } else {
            const agenda = p.agenda ? ` (${p.agenda})` : '';
            lines.push(`${p.name}: at ${where}${agenda}${reasonSuffix}`);
        }
        if (lines.length >= MAX_NPC_PROMPT_LINES) { break; }
    }
    return lines;
}

export function buildCaravanPromptLines(
    forge: CommerceForge,
    snapshot: CaravanPromptSnapshot | undefined
): string[] {
    if (!snapshot) { return []; }
    const lines: string[] = [
        `Credits: ${snapshot.credits} | Food: ${snapshot.food} | Transport: ${snapshot.transportId}`,
    ];
    const cargo = snapshot.cargo ?? [];
    if (cargo.length === 0) {
        lines.push('Cargo: (empty)');
    } else {
        for (const entry of cargo.slice(0, MAX_CARAVAN_PROMPT_LINES - 1)) {
            const name = forge.commodities.find((c) => c.id === entry.commodityId)?.name ?? entry.commodityId;
            lines.push(`Cargo: ${name} ×${entry.qty}`);
        }
    }
    return lines.slice(0, MAX_CARAVAN_PROMPT_LINES);
}

export interface LivingWorldPromptBlocks {
    commerce: string[];
    sinceLastVisit: string[];
    caravan: string[];
    npcAgency: string[];
    combined: string[];
}

export function buildLivingWorldPromptBlocks(input: LivingWorldPromptInput): LivingWorldPromptBlocks {
    const commerce = input.commerceEnabled
        ? buildCommercePromptLines(input.forge, input.markets, input.playerLocationId, input.locationNames)
        : [];
    const sinceLastVisit = input.commerceEnabled
        ? buildSinceLastVisitLines(input.sinceLastVisit)
        : [];
    const caravan = input.commerceEnabled
        ? buildCaravanPromptLines(input.forge, input.playerCommerce)
        : [];
    const npcAgency = input.agencyEnabled
        ? buildNpcAgencyPromptLines(
            input.registry,
            input.npcPositions,
            input.worldTurn,
            true,
            input.locationNames
        )
        : [];

    const combined: string[] = [];
    if (sinceLastVisit.length) {
        combined.push('[Living World — Since last visit]');
        combined.push(...sinceLastVisit);
    }
    if (caravan.length) {
        combined.push('[Living World — Caravan]');
        combined.push(...caravan);
    }
    if (commerce.length) {
        combined.push('[Living World — Markets]');
        combined.push(...commerce);
    }
    if (npcAgency.length) {
        combined.push('[Living World — NPC whereabouts]');
        combined.push(...npcAgency);
    }

    return { commerce, sinceLastVisit, caravan, npcAgency, combined };
}

export function formatLivingWorldGmInjection(blocks: LivingWorldPromptBlocks): string {
    return blocks.combined.join('\n').trim();
}