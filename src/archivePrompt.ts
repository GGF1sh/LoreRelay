import * as vscode from 'vscode';

export type GmProvider = 'grok' | 'clipboard' | 'command' | 'ollama' | 'koboldcpp' | 'openrouter';
export type ContextTier = 'small' | 'large';

/** OpenRouter 等で長コンテキスト扱いするモデル名パターン */
const LARGE_CONTEXT_MODEL_PATTERNS = [
    /gemini/i,
    /claude-3/i,
    /claude-sonnet/i,
    /claude-opus/i,
    /gpt-4/i,
    /gpt-5/i,
    /o1/i,
    /o3/i,
    /deepseek/i,
    /qwen.*72b/i,
    /llama.*70b/i,
    /mixtral.*8x22/i,
    /command-r-plus/i
];

/** プロバイダーとモデル名からコンテキスト枠の大きさを推定 */
export function getContextTier(provider: GmProvider, openRouterModel?: string): ContextTier {
    if (provider === 'grok' || provider === 'command') {
        return 'large';
    }
    if (provider === 'ollama' || provider === 'koboldcpp') {
        return 'small';
    }
    if (provider === 'openrouter') {
        const model = (openRouterModel || '').trim();
        if (model && LARGE_CONTEXT_MODEL_PATTERNS.some((p) => p.test(model))) {
            return 'large';
        }
        return 'small';
    }
    return 'small';
}

/** アーカイブ促しを出す履歴ターン数の閾値 */
export function getArchiveThreshold(provider: GmProvider, openRouterModel?: string): number {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const tier = getContextTier(provider, openRouterModel);
    if (tier === 'large') {
        return config.get<number>('archive.thresholdLargeContext', 80);
    }
    return config.get<number>('archive.thresholdSmallContext', 30);
}

/** 閾値超え後、何ターンごとに再促しするか */
export function getArchiveRemindStep(): number {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return Math.max(5, config.get<number>('archive.remindEvery', 15));
}

export function isArchiveAutoPromptEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return config.get<boolean>('archive.autoPrompt', true);
}

/** アーカイブ促し対象のプロバイダーか（clipboard は除外） */
export function supportsArchivePrompt(provider: GmProvider): boolean {
    return provider !== 'clipboard';
}

/**
 * 今回の履歴件数で促しマイルストーンに達したか。
 * 例: 閾値30 → 30, 45, 60… / 閾値80 → 80, 95, 110…
 */
export function computeArchiveMilestone(
    historyCount: number,
    threshold: number,
    remindStep: number
): number | undefined {
    if (historyCount < threshold) {
        return undefined;
    }
    const over = historyCount - threshold;
    const steps = Math.floor(over / remindStep);
    return threshold + steps * remindStep;
}