export type UiPresentation = 'story' | 'management' | 'cinematic';
export function isUiPresentation(value: unknown): value is UiPresentation {
    return value === 'story' || value === 'management' || value === 'cinematic';
}
/** Presentation only: never resolves or enables game rules. */
export function recommendUiPresentation(raw: unknown): UiPresentation {
    const answers = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    if (answers.playstyle === 'character_chat') return answers.imageGenerationWanted === true ? 'cinematic' : 'story';
    return ['trade', 'settlement', 'domain', 'guild', 'vehicle', 'mobile_base'].includes(String(answers.playstyle))
        || answers.bookkeeping === 'detailed' ? 'management' : 'story';
}
export function createUiPresentationStore(bindings: {
    read(key: string): unknown; write(key: string, value: UiPresentation): PromiseLike<void>;
    scope(): { key: string; profile: string }; post(value: unknown): void;
}) {
    let queue = Promise.resolve();
    const state = () => {
        const scope = bindings.scope();
        const value = bindings.read(scope.key);
        return { type: 'uiPresentation', scope: scope.key, profile: scope.profile,
            preset: isUiPresentation(value) ? value : 'story', saved: isUiPresentation(value) };
    };
    const enqueue = (work: () => Promise<void>) => {
        const next = queue.then(work);
        queue = next.catch(() => {});
        return next;
    };
    return {
        send() { bindings.post(state()); },
        async set(raw: unknown) {
            if (!raw || typeof raw !== 'object') return;
            const value = raw as Record<string, unknown>;
            if (Object.keys(value).some(key => !['type', 'scope', 'preset'].includes(key)) || !isUiPresentation(value.preset)) return;
            const preset = value.preset;
            await enqueue(async () => {
                if (value.scope !== bindings.scope().key) return;
                await bindings.write(bindings.scope().key, preset);
                bindings.post(state());
            });
        },
        initialize(key: string, answers: unknown, override?: unknown) {
            return enqueue(async () => {
                if (key !== bindings.scope().key) return;
                if (isUiPresentation(override) || !isUiPresentation(bindings.read(key))) {
                    await bindings.write(key, isUiPresentation(override) ? override : recommendUiPresentation(answers));
                }
                bindings.post(state());
            });
        },
        key() { return bindings.scope().key; },
    };
}
