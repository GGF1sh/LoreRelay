/** GM プロンプト注入の可視化用型（Inspector v0.5a） */

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

export interface PromptContextBreakdown {
    sections: PromptContextSection[];
    memoryBackend: string;
    matchedLore: PromptLoreMatch[];
    memoryMatches: PromptMemoryMatch[];
    hintPreview: string;
    budget?: PromptBudgetInfo;
    totalChars: number;
    totalTokensEstimate: number;
}

/** 粗い token 概算（chars / 4） */
export function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
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
    budgetLimits?: PromptBudgetLimitSpec[]
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
        totalTokensEstimate: estimateTokens(kept.map((s) => s.text).join('\n'))
    };
}
