// Image generation circuit breaker — pure state machine (no vscode/fs).

export const IMAGE_GEN_CIRCUIT_FAILURE_THRESHOLD = 3;
export const IMAGE_GEN_CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

export interface ImageGenCircuitState {
    consecutiveFailures: number;
    openUntilMs: number;
}

export function createImageGenCircuitState(): ImageGenCircuitState {
    return { consecutiveFailures: 0, openUntilMs: 0 };
}

export function isImageGenCircuitOpen(state: ImageGenCircuitState, nowMs: number): boolean {
    return nowMs < state.openUntilMs;
}

export function recordImageGenSuccess(state: ImageGenCircuitState): ImageGenCircuitState {
    return { consecutiveFailures: 0, openUntilMs: 0 };
}

export function recordImageGenFailure(
    state: ImageGenCircuitState,
    nowMs: number,
    threshold = IMAGE_GEN_CIRCUIT_FAILURE_THRESHOLD,
    cooldownMs = IMAGE_GEN_CIRCUIT_COOLDOWN_MS
): { state: ImageGenCircuitState; circuitOpened: boolean } {
    const consecutiveFailures = state.consecutiveFailures + 1;
    if (consecutiveFailures >= threshold) {
        return {
            state: { consecutiveFailures, openUntilMs: nowMs + cooldownMs },
            circuitOpened: true,
        };
    }
    return {
        state: { ...state, consecutiveFailures },
        circuitOpened: false,
    };
}