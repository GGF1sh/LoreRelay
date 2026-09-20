/** Price snapshot retrieved 2026-09-08 from https://api-docs.deepseek.com/quick_start/pricing/. */
export function parseDeepSeekCandidate(value: unknown, requestedModel: string): {
    text: string; reportedModel: string; usage?: { input: number; output: number; cacheHit?: number;
        estimatedUsdMin: number; estimatedUsdMax: number; priceDate: string };
} {
    const result = value as Record<string, any>;
    const versions: Record<string, string> = {
        'deepseek-v4-flash': 'DeepSeek-V4-Flash-0731', 'deepseek-v4-pro': 'DeepSeek-V4-Pro-0813',
    };
    if (!result || typeof result.model !== 'string' || !Object.prototype.hasOwnProperty.call(versions, requestedModel)
        || (result.model !== requestedModel && result.model !== versions[requestedModel])) {
        throw new Error('deepseek_model_mismatch');
    }
    if (!Array.isArray(result.choices) || result.choices.length !== 1) throw new Error('deepseek_invalid_candidate');
    const choice = result.choices[0], message = choice?.message;
    if (choice?.finish_reason !== 'stop' || message?.role !== 'assistant' || typeof message.content !== 'string'
        || !message.content.trim() || message.tool_calls?.length || message.function_call || message.refusal) {
        throw new Error('deepseek_invalid_candidate');
    }
    return { text: message.content, reportedModel: result.model, usage: readDeepSeekUsage(result, requestedModel) };
}

/** Usage is reported even for a paid response rejected as incomplete. Contains no narrative text. */
export function readDeepSeekUsage(value: unknown, requestedModel: string): ReturnType<typeof parseDeepSeekCandidate>['usage'] {
    if (!['deepseek-v4-flash', 'deepseek-v4-pro'].includes(requestedModel)) return undefined;
    const usage = (value as { usage?: Record<string, unknown> })?.usage;
    const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 1_000_000_000;
    if (count(usage?.prompt_tokens) && count(usage?.completion_tokens)) {
        const input = usage.prompt_tokens, output = usage.completion_tokens;
        const hit = count(usage.prompt_cache_hit_tokens) && usage.prompt_cache_hit_tokens <= input
            ? usage.prompt_cache_hit_tokens : undefined;
        const [hitPrice, missPrice, outputPrice] = requestedModel === 'deepseek-v4-pro' ? [0.022, 0.66, 1.98] : [0.007, 0.22, 0.66];
        // Return a peak/off-peak range. Missing cache counters widen the range, never pretend zero usage.
        const lowInput = hit === undefined ? input * hitPrice : hit * hitPrice + (input - hit) * missPrice;
        const highInput = hit === undefined ? input * missPrice : lowInput;
        return { input, output, cacheHit: hit, estimatedUsdMin: (lowInput + output * outputPrice) / 1e6,
            estimatedUsdMax: 2 * (highInput + output * outputPrice) / 1e6, priceDate: '2026-09-08' };
    }
    return undefined;
}
