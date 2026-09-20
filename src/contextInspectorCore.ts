// Context Engine P0: pure GM prompt chunk accounting (no I/O, no vscode/DOM).

import {
    applyPromptChunkBudgetRecords,
    isPromptChunkNeverEvict,
    resolvePromptChunkPriority,
    type PromptContextChunkSpec,
} from './gmPromptBuilderCore';
import {
    estimateTokens,
    previewText,
    type ContextInspectorCategory,
    type ContextInspectorItem,
    type ContextInspectorReport,
} from './promptContext';

export type {
    ContextInspectorCategory,
    ContextInspectorDecision,
    ContextInspectorItem,
    ContextInspectorReport,
} from './promptContext';

export const CONTEXT_INSPECTOR_VERSION = 1 as const;
export const MAX_CONTEXT_INSPECTOR_ITEMS = 64;
export const MAX_CONTEXT_INSPECTOR_PREVIEW_CHARS = 160;

export const CONTEXT_INSPECTOR_CATEGORY_BY_CHUNK_ID: Readonly<Record<string, ContextInspectorCategory>> = {
    gameRules: 'system',
    narrativeTime: 'system',
    director: 'director',
    partyDirector: 'director',
    travelEncounters: 'director',
    livingWorldTravel: 'director',
    summary: 'memory',
    chronicle: 'memory',
    saga: 'memory',
    memory: 'memory',
    lorebook: 'lore',
    worldForge: 'world',
    worldState: 'world',
    worldChangeSummary: 'world',
    npcRegistry: 'npc',
    livingWorldNpcBonds: 'npc',
    livingWorldPlayerBonds: 'npc',
    livingWorldFactionRelations: 'npc',
    campaignKit: 'resources',
    discoveryLedger: 'resources',
    campaignJobBoard: 'resources',
    campaignResources: 'resources',
    settlement: 'settlement',
    vehicles: 'vehicle',
    mobileBase: 'vehicle',
    vision: 'visual',
    party: 'party',
    domain: 'world',
    guild: 'world',
};

export const DEFAULT_CONTEXT_INSPECTOR_LABELS: Readonly<Record<string, string>> = {
    gameRules: 'Game Rules',
    narrativeTime: 'Narrative Time',
    campaignKit: 'Campaign Kit',
    discoveryLedger: 'Discoveries',
    campaignJobBoard: 'Campaign Job Board',
    campaignResources: 'Campaign Resources',
    settlement: 'Settlement',
    vehicles: 'Vehicles',
    mobileBase: 'Mobile Base',
    domain: 'Domain',
    guild: 'Guild',
    director: 'Scenario Director',
    chronicle: 'Chronicle Recap',
    summary: 'Story Synopsis',
    saga: 'Saga Archive',
    party: 'Party',
    partyDirector: 'Party Director',
    memory: 'Memory Bank',
    travelEncounters: 'Travel Encounters',
    livingWorldTravel: 'Living World Travel',
    worldForge: 'World',
    worldState: 'World State',
    livingWorldNpcBonds: 'LW NPC Bonds',
    livingWorldPlayerBonds: 'LW Your Bonds',
    livingWorldFactionRelations: 'LW Faction Relations',
    worldChangeSummary: 'World Changes',
    lorebook: 'Lorebook',
    npcRegistry: 'NPC Awareness',
    vision: 'Vision',
};

function resolveCategory(
    id: string,
    categories?: Record<string, ContextInspectorCategory>
): ContextInspectorCategory {
    return categories?.[id] ?? CONTEXT_INSPECTOR_CATEGORY_BY_CHUNK_ID[id] ?? 'other';
}

function resolveLabel(id: string, labels?: Record<string, string>): string {
    return labels?.[id] ?? DEFAULT_CONTEXT_INSPECTOR_LABELS[id] ?? id;
}

function buildPreview(text: string): string {
    return previewText(text, MAX_CONTEXT_INSPECTOR_PREVIEW_CHARS);
}

function inactiveSet(ids: readonly string[] | undefined): Set<string> {
    return new Set((ids ?? []).filter((id) => typeof id === 'string' && id.length > 0));
}

function emptySet(ids: readonly string[] | undefined): Set<string> {
    return new Set((ids ?? []).filter((id) => typeof id === 'string' && id.length > 0));
}

function chunkMap(chunks: readonly PromptContextChunkSpec[]): Map<string, PromptContextChunkSpec> {
    const map = new Map<string, PromptContextChunkSpec>();
    for (const chunk of chunks) {
        if (!chunk?.id || map.has(chunk.id)) {
            continue;
        }
        map.set(chunk.id, chunk);
    }
    return map;
}

function resolveOrderedIds(
    chunks: readonly PromptContextChunkSpec[],
    orderedIds: readonly string[] | undefined
): string[] {
    if (orderedIds?.length) {
        return [...orderedIds];
    }
    return chunks.map((c) => c.id).filter((id) => typeof id === 'string' && id.length > 0);
}

export function buildContextInspectorReport(
    chunks: PromptContextChunkSpec[],
    targetChars: number,
    options?: {
        labels?: Record<string, string>;
        categories?: Record<string, ContextInspectorCategory>;
        inactiveIds?: string[];
        emptyIds?: string[];
        orderedIds?: string[];
    }
): ContextInspectorReport {
    const limit = Math.max(0, Math.floor(targetChars));
    const inactive = inactiveSet(options?.inactiveIds);
    const empty = emptySet(options?.emptyIds);
    const byId = chunkMap(chunks);
    const budgetRecords = applyPromptChunkBudgetRecords(chunks, limit);
    const budgetById = new Map(budgetRecords.map((r) => [r.id, r]));

    const ordered = resolveOrderedIds(chunks, options?.orderedIds).slice(0, MAX_CONTEXT_INSPECTOR_ITEMS);
    const items: ContextInspectorItem[] = [];

    for (const id of ordered) {
        const label = resolveLabel(id, options?.labels);
        const category = resolveCategory(id, options?.categories);
        const priority = resolvePromptChunkPriority(id);
        const pinned = isPromptChunkNeverEvict(id);

        if (inactive.has(id)) {
            items.push({
                id,
                label,
                category,
                priority,
                decision: 'skipped_inactive',
                reasonCode: 'module_inactive',
                originalChars: 0,
                finalChars: 0,
                tokenEstimate: 0,
                preview: '',
                pinned,
            });
            continue;
        }

        if (empty.has(id)) {
            items.push({
                id,
                label,
                category,
                priority,
                decision: 'skipped_empty',
                reasonCode: 'builder_empty',
                originalChars: 0,
                finalChars: 0,
                tokenEstimate: 0,
                preview: '',
                pinned,
            });
            continue;
        }

        const source = byId.get(id);
        const record = budgetById.get(id);
        if (!source || !record) {
            continue;
        }

        const originalChars = record.originalText.length;
        const finalChars = record.finalText.length;

        if (finalChars === 0) {
            items.push({
                id,
                label,
                category,
                priority: record.priority,
                decision: 'evicted_by_budget',
                reasonCode: 'global_budget_pressure',
                originalChars,
                finalChars: 0,
                tokenEstimate: 0,
                preview: buildPreview(record.originalText),
                pinned: record.pinned,
            });
            continue;
        }

        if (record.pinned) {
            items.push({
                id,
                label,
                category,
                priority: record.priority,
                decision: 'included_pinned',
                reasonCode: 'never_evict',
                originalChars,
                finalChars,
                tokenEstimate: estimateTokens(record.finalText),
                preview: buildPreview(record.finalText),
                pinned: true,
            });
            continue;
        }

        if (finalChars < originalChars) {
            items.push({
                id,
                label,
                category,
                priority: record.priority,
                decision: 'truncated_by_budget',
                reasonCode: 'global_budget_truncation',
                originalChars,
                finalChars,
                tokenEstimate: estimateTokens(record.finalText),
                preview: buildPreview(record.finalText),
                pinned: false,
            });
            continue;
        }

        items.push({
            id,
            label,
            category,
            priority: record.priority,
            decision: 'included',
            reasonCode: 'within_budget',
            originalChars,
            finalChars,
            tokenEstimate: estimateTokens(record.finalText),
            preview: buildPreview(record.finalText),
            pinned: false,
        });
    }

    let includedCount = 0;
    let omittedCount = 0;
    let truncatedCount = 0;
    let totalOriginalChars = 0;
    let totalFinalChars = 0;

    for (const item of items) {
        totalOriginalChars += item.originalChars;
        totalFinalChars += item.finalChars;
        if (item.decision === 'included' || item.decision === 'included_pinned') {
            includedCount++;
        } else if (item.decision === 'truncated_by_budget') {
            includedCount++;
            truncatedCount++;
        } else {
            omittedCount++;
        }
    }

    return {
        version: CONTEXT_INSPECTOR_VERSION,
        targetChars: limit,
        targetTokensEstimate: estimateTokens('x'.repeat(limit)),
        totalOriginalChars,
        totalFinalChars,
        includedCount,
        omittedCount,
        truncatedCount,
        items,
    };
}