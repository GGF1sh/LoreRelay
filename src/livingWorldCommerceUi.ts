// LW1 v1+ — World tab direct trade + player role (host layer).

import * as fs from 'fs';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, saveWorldState } from './worldState';
import { resolveCommerceForge, ensureLivingWorldMarkets } from './livingWorldBridge';
import { getOrInitPlayerCommerce } from './livingWorldTurnOpsCore';
import { commitGameState } from './stateManager';
import { readStateRevision } from './workspaceStateQueueCore';
import { getGameStatePath } from './workspacePaths';
import { runSerializedWorkspaceMutation } from './workspaceStateQueue';
import type { GameState } from './types/GameState';
import type { PlayerRole } from './livingWorldTypes';
import {
    executeDirectTrade,
    isValidPlayerRole,
    resolveDefaultPlayerRole,
    type DirectTradeInput,
    type DirectTradeResult,
} from './livingWorldCommerceUiCore';

export type LivingWorldCommerceUiFailureReason =
    | 'COMMERCE_OFF'
    | 'UI_OFF'
    | 'NO_FORGE'
    | 'NO_WORLD'
    | 'NO_LOCATION'
    | 'INVALID_ROLE'
    | 'INVALID_OP'
    | 'INVALID_QTY'
    | 'WRONG_LOCATION'
    | 'TRADE_FAILED';

export type LivingWorldCommerceUiResult =
    | { ok: true; trade?: DirectTradeResult & { ok: true } }
    | { ok: false; reason: LivingWorldCommerceUiFailureReason; code?: string; message?: string };

function readGameState(): GameState | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as GameState;
    } catch {
        return undefined;
    }
}

function currentPlayerLocationId(state: GameState | undefined): string | undefined {
    const id = state?.world?.currentLocationId;
    return typeof id === 'string' && id ? id : undefined;
}

function persistCommerce(
    state: GameState,
    commerce: GameState['commerce'],
    baseRevision: number
): boolean {
    const next = { ...state, commerce } as GameState;
    commitGameState(next as unknown as Record<string, unknown>, {
        mode: 'salvage',
        baseRevision,
        mergeProfile: 'commerce-ui',
    });
    return true;
}

export function executeLivingWorldDirectTrade(
    input: DirectTradeInput
): LivingWorldCommerceUiResult {
    const rules = loadGameRules();
    if (!rules.enableCommerce) {
        return { ok: false, reason: 'COMMERCE_OFF' };
    }
    if (rules.enableCommerceUi !== true) {
        return { ok: false, reason: 'UI_OFF' };
    }
    if (!isWorldForgeEnabled()) {
        return { ok: false, reason: 'NO_FORGE' };
    }

    const forge = loadWorldForge();
    const rawDoc = loadWorldForgeDocument();
    const commerceForge = forge && rawDoc ? resolveCommerceForge(forge, rawDoc) : undefined;
    if (!commerceForge) {
        return { ok: false, reason: 'NO_FORGE' };
    }

    const gameState = readGameState();
    const baseRevision = readStateRevision(gameState as unknown as Record<string, unknown>);
    const locationId = currentPlayerLocationId(gameState);
    if (!locationId) {
        return { ok: false, reason: 'NO_LOCATION' };
    }

    const ws = loadWorldState();
    if (!ws) {
        return { ok: false, reason: 'NO_WORLD' };
    }

    const markets = ensureLivingWorldMarkets(commerceForge, ws as any);
    const playerCommerce = getOrInitPlayerCommerce(
        gameState ?? ({ entries: [] } as GameState)
    );
    playerCommerce.playerRole = resolveDefaultPlayerRole(
        rules.playerRole,
        playerCommerce.playerRole
    );

    const result = executeDirectTrade(
        commerceForge,
        markets,
        playerCommerce,
        { ...input, currentLocationId: locationId }
    );

    if (!result.ok) {
        return {
            ok: false,
            reason: result.reason,
            code: result.code,
            message: result.message,
        };
    }

    const nextCommerce = result.commerce;
    const nextMarkets = result.markets;

    runSerializedWorkspaceMutation(() => {
        if (gameState) {
            persistCommerce(gameState, nextCommerce, baseRevision);
        }
        const freshWs = loadWorldState();
        if (freshWs) {
            saveWorldState({ ...freshWs, markets: nextMarkets });
        }
    });

    return { ok: true, trade: result };
}

export function setLivingWorldPlayerRole(role: PlayerRole): LivingWorldCommerceUiResult {
    const rules = loadGameRules();
    if (!rules.enableCommerce) {
        return { ok: false, reason: 'COMMERCE_OFF' };
    }
    if (!isValidPlayerRole(role)) {
        return { ok: false, reason: 'INVALID_ROLE' };
    }

    const gameState = readGameState();
    if (!gameState) {
        return { ok: false, reason: 'NO_WORLD' };
    }

    const baseRevision = readStateRevision(gameState as unknown as Record<string, unknown>);
    const commerce = getOrInitPlayerCommerce(gameState);
    persistCommerce(gameState, { ...commerce, playerRole: role }, baseRevision);
    return { ok: true };
}