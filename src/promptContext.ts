/** GM プロンプト注入の可視化用型（Inspector v0.5a + Context Engine P0） */

export type ContextInspectorDecision =
    | 'included'
    | 'included_pinned'
    | 'truncated_by_budget'
    | 'evicted_by_budget'
    | 'skipped_inactive'
    | 'skipped_empty';

export type ContextInspectorCategory =
    | 'system'
    | 'director'
    | 'scene'
    | 'party'
    | 'memory'
    | 'lore'
    | 'world'
    | 'npc'
    | 'resources'
    | 'settlement'
    | 'vehicle'
    | 'visual'
    | 'other';

export interface ContextInspectorItem {
    id: string;
    label: string;
    category: ContextInspectorCategory;
    priority: number;
    decision: ContextInspectorDecision;
    reasonCode: string;
    originalChars: number;
    finalChars: number;
    tokenEstimate: number;
    preview: string;
    pinned: boolean;
}

export interface ContextInspectorReport {
    version: 1;
    targetChars: number;
    targetTokensEstimate: number;
    totalOriginalChars: number;
    totalFinalChars: number;
    includedCount: number;
    omittedCount: number;
    truncatedCount: number;
    items: ContextInspectorItem[];
}

export interface PromptContextSection {
    id: string;
    label: string;
    text: string;
    charCount: number;
    tokenEstimate: number;
}

export interface PromptLoreMatch {
    id: string;
    label: string;
    preview: string;
    keys: string[];
}

export interface PromptMemoryMatch {
    id: string;
    label: string;
    source: string;
    preview: string;
}

export interface PromptBudgetInfo {
    mode: string;
    requestedMode: string;
    targetTokens: number;
    details?: PromptBudgetDetail[];
}

export interface PromptBudgetDetail {
    id: string;
    label: string;
    usedChars: number;
    limitChars: number;
    percent: number;
}

export interface PromptBudgetLimitSpec {
    id: string;
    label: string;
    limitChars: number;
}

interface CategoryBudgetShadowReportBase {
    version: 1;
    targetTokens: number;
    totalCandidateCount: number;
    productionSelectedCount: number;
    productionTokenEstimate: number;
}

export interface CategoryBudgetShadowReportSuccess extends CategoryBudgetShadowReportBase {
    status: 'ok';
    shadowSelectedCount: number;
    shadowTokenEstimate: number;
    overlapIds: ReadonlyArray<string>;
    productionOnlyIds: ReadonlyArray<string>;
    shadowOnlyIds: ReadonlyArray<string>;
    perCategoryCandidateCounts: Readonly<Record<string, number>>;
    perCategoryProductionSelectedCounts: Readonly<Record<string, number>>;
    perCategoryShadowSelectedCounts: Readonly<Record<string, number>>;
    perCategoryShadowEvictedCounts: Readonly<Record<string, number>>;
}

export interface CategoryBudgetShadowReportFailure extends CategoryBudgetShadowReportBase {
    status: 'failed';
    failureMessage: string;
}

export type CategoryBudgetShadowReport =
    | CategoryBudgetShadowReportSuccess
    | CategoryBudgetShadowReportFailure;

export interface PromptContextBreakdown {
    sections: PromptContextSection[];
    memoryBackend: string;
    matchedLore: PromptLoreMatch[];
    memoryMatches: PromptMemoryMatch[];
    hintPreview: string;
    budget?: PromptBudgetInfo;
    totalChars: number;
    totalTokensEstimate: number;
    contextInspector?: ContextInspectorReport;
    shadowReport?: CategoryBudgetShadowReport;
    /** Bounded human-readable lines from recent world_state parse cap overflow (diagnostic). */
    worldStateParseWarnings?: string[];
}

/** 粗い token 概算（chars / 4） */
export function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
}

/** Provider tokenization often exceeds char/4 — reserve headroom before assembly (Gemini P0). */
export const PROMPT_CHAR_SAFETY_MARGIN_RATIO = 0.08;
export const PROMPT_CHAR_SAFETY_MARGIN_MIN_CHARS = 400;

export interface EffectivePromptCharBudgetOptions {
    /** Fixed char reserve (e.g. Parlor 1200). Combined with ratio via max(). */
    fixedMarginChars?: number;
    /** Floor for the usable budget after margin. */
    minResultChars?: number;
}

/**
 * Subtract a safety margin from a char budget so tail system rules survive API-side tokenization drift.
 */
export function effectivePromptCharBudget(
    maxChars: number,
    options: EffectivePromptCharBudgetOptions = {}
): number {
    const minResult = options.minResultChars ?? 4_000;
    const ratioMargin = Math.ceil(maxChars * PROMPT_CHAR_SAFETY_MARGIN_RATIO);
    const fixedMargin = Math.max(0, options.fixedMarginChars ?? 0);
    const margin = Math.max(PROMPT_CHAR_SAFETY_MARGIN_MIN_CHARS, ratioMargin, fixedMargin);
    return Math.max(minResult, maxChars - margin);
}

export function previewText(text: string, maxLen = 160): string {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (t.length <= maxLen) {
        return t;
    }
    return `${t.slice(0, maxLen)}…`;
}

export function buildSection(id: string, label: string, text: string): PromptContextSection | undefined {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        return undefined;
    }
    return {
        id,
        label,
        text: trimmed,
        charCount: trimmed.length,
        tokenEstimate: estimateTokens(trimmed)
    };
}

export function buildPromptBudgetDetails(
    sections: PromptContextSection[],
    limits: PromptBudgetLimitSpec[]
): PromptBudgetDetail[] {
    const usedById = new Map<string, number>();
    for (const section of sections) {
        usedById.set(section.id, section.charCount);
    }

    const details: PromptBudgetDetail[] = [];
    const seen = new Set<string>();
    for (const spec of limits) {
        if (!spec || seen.has(spec.id)) {
            continue;
        }
        seen.add(spec.id);
        const usedChars = Math.max(0, Math.floor(usedById.get(spec.id) ?? 0));
        const limitChars = Math.max(0, Math.floor(Number(spec.limitChars) || 0));
        if (usedChars === 0 && limitChars === 0) {
            continue;
        }
        details.push({
            id: spec.id,
            label: spec.label || spec.id,
            usedChars,
            limitChars,
            percent: limitChars > 0
                ? Math.min(999, Math.round((usedChars / limitChars) * 100))
                : 0
        });
    }
    return details;
}

export function finalizeBreakdown(
    sections: Array<PromptContextSection | undefined>,
    memoryBackend: string,
    matchedLore: PromptLoreMatch[],
    memoryMatches: PromptMemoryMatch[],
    hintPreview: string,
    budget?: PromptBudgetInfo,
    budgetLimits?: PromptBudgetLimitSpec[],
    contextInspector?: ContextInspectorReport,
    worldStateParseWarnings?: string[],
    shadowReport?: CategoryBudgetShadowReport
): PromptContextBreakdown {
    const kept = sections.filter((s): s is PromptContextSection => Boolean(s));
    const totalChars = kept.reduce((sum, s) => sum + s.charCount, 0);
    const resolvedBudget = budget && budgetLimits
        ? { ...budget, details: buildPromptBudgetDetails(kept, budgetLimits) }
        : budget;
    return {
        sections: kept,
        memoryBackend,
        matchedLore,
        memoryMatches,
        hintPreview,
        budget: resolvedBudget,
        totalChars,
        totalTokensEstimate: estimateTokens(kept.map((s) => s.text).join('\n')),
        contextInspector,
        shadowReport,
        worldStateParseWarnings: worldStateParseWarnings?.length ? worldStateParseWarnings : undefined,
    };
}
