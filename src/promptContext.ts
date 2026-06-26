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

export interface PromptContextBreakdown {
    sections: PromptContextSection[];
    memoryBackend: string;
    matchedLore: PromptLoreMatch[];
    memoryMatches: PromptMemoryMatch[];
    hintPreview: string;
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

export function finalizeBreakdown(
    sections: Array<PromptContextSection | undefined>,
    memoryBackend: string,
    matchedLore: PromptLoreMatch[],
    memoryMatches: PromptMemoryMatch[],
    hintPreview: string
): PromptContextBreakdown {
    const kept = sections.filter((s): s is PromptContextSection => Boolean(s));
    const totalChars = kept.reduce((sum, s) => sum + s.charCount, 0);
    return {
        sections: kept,
        memoryBackend,
        matchedLore,
        memoryMatches,
        hintPreview,
        totalChars,
        totalTokensEstimate: estimateTokens(kept.map((s) => s.text).join('\n'))
    };
}