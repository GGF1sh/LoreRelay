export interface GameplayInputRouteRequest {
    playerAction: string;
    presentationOptions: readonly string[];
    relayEnabled: boolean;
}

export interface GameplayInputRouteDeps<TRelay = void, TGm = void> {
    tryDebugFastPath(playerAction: string, presentationOptions: readonly string[]): Promise<boolean>;
    dispatchRelay(playerAction: string): Promise<TRelay>;
    dispatchGm(playerAction: string): Promise<TGm>;
}

export type GameplayInputRouteResult<TRelay, TGm> =
    | { kind: 'debug_fast_path' }
    | { kind: 'relay'; value: TRelay }
    | { kind: 'gm'; value: TGm };

/**
 * Production gameplay routing boundary. Recognized deterministic commands are
 * resolved before either narrative dispatcher is considered.
 */
export async function routeGameplayInput<TRelay = void, TGm = void>(
    request: GameplayInputRouteRequest,
    deps: GameplayInputRouteDeps<TRelay, TGm>
): Promise<GameplayInputRouteResult<TRelay, TGm>> {
    if (await deps.tryDebugFastPath(request.playerAction, request.presentationOptions)) {
        return { kind: 'debug_fast_path' };
    }
    if (request.relayEnabled) {
        return { kind: 'relay', value: await deps.dispatchRelay(request.playerAction) };
    }
    return { kind: 'gm', value: await deps.dispatchGm(request.playerAction) };
}
