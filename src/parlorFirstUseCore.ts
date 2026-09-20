// Parlor first-use path helpers (pure): import activation, greeting once, LM preflight.
// No vscode, fs, time, randomness, network, or LLM calls.

/**
 * After a successful ST card import, the returned character id becomes active.
 * Always select the newly imported id (including when a second character is imported).
 */
export function resolveActiveIdAfterImport(importedCharacterId: string): string | undefined {
    if (typeof importedCharacterId !== 'string') { return undefined; }
    const id = importedCharacterId.trim();
    return id.length > 0 ? id : undefined;
}

/**
 * Resolve which character Parlor should use before session create/render.
 * Preferred explicit id wins; then persisted active; then sole character.
 * Does not invent ids when multiple characters exist and none is selected.
 */
export function resolveParlorActiveCharacterId(input: {
    preferredId?: string;
    persistedActiveId?: string;
    characterIds: readonly string[];
}): string | undefined {
    const ids = Array.isArray(input.characterIds)
        ? input.characterIds.filter((id) => typeof id === 'string' && id.length > 0)
        : [];
    const preferred = typeof input.preferredId === 'string' ? input.preferredId.trim() : '';
    if (preferred && ids.includes(preferred)) {
        return preferred;
    }
    const persisted = typeof input.persistedActiveId === 'string' ? input.persistedActiveId.trim() : '';
    if (persisted && ids.includes(persisted)) {
        return persisted;
    }
    if (ids.length === 1) {
        return ids[0];
    }
    return undefined;
}

/** Insert first_mes only when the session has no messages yet. */
export function shouldInsertParlorFirstGreeting(
    existingMessageCount: number,
    firstMes: string | undefined | null
): boolean {
    if (typeof existingMessageCount !== 'number' || !Number.isFinite(existingMessageCount)) {
        return false;
    }
    if (existingMessageCount > 0) {
        return false;
    }
    return typeof firstMes === 'string' && firstMes.trim().length > 0;
}

export type ParlorLmPreflightResult =
    | { ok: true }
    | { ok: false; reason: 'no_model' };

/**
 * Preflight before appending a user message when the active provider is vscode-lm.
 * Other providers are not gated here (clipboard/API paths handle their own errors).
 */
export function evaluateParlorVscodeLmPreflight(input: {
    provider: string;
    availableModelCount: number;
}): ParlorLmPreflightResult {
    const provider = typeof input.provider === 'string' ? input.provider.trim() : '';
    if (provider !== 'vscode-lm') {
        return { ok: true };
    }
    const count = typeof input.availableModelCount === 'number' && Number.isFinite(input.availableModelCount)
        ? Math.floor(input.availableModelCount)
        : 0;
    if (count < 1) {
        return { ok: false, reason: 'no_model' };
    }
    return { ok: true };
}
