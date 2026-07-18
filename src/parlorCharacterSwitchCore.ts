export type ParlorCharacterSwitchDecision =
    | { ok: true; characterId: string }
    | { ok: false; reason: 'busy' | 'invalid-character' };

/**
 * Keep selection validation and busy rejection deterministic before the host
 * mutates the active-character file or sends a new session to the Webview.
 */
export function evaluateParlorCharacterSwitch(input: {
    requestedCharacterId: unknown;
    characterIds: readonly string[];
    isBusy: boolean;
}): ParlorCharacterSwitchDecision {
    if (input.isBusy) {
        return { ok: false, reason: 'busy' };
    }
    const requestedCharacterId = typeof input.requestedCharacterId === 'string'
        ? input.requestedCharacterId.trim()
        : '';
    if (!requestedCharacterId || !input.characterIds.includes(requestedCharacterId)) {
        return { ok: false, reason: 'invalid-character' };
    }
    return { ok: true, characterId: requestedCharacterId };
}
