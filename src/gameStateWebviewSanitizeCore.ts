// Campaign P0 PR2 — whitelist-only webview payloads (pure, no vscode/fs).

import type { StatePatchOp, TurnResult } from './types/TurnResult';

/** Top-level game_state keys the webview reads (applyGameState + media URIs). */
export const WEBVIEW_GAME_STATE_ROOT_KEYS = [
    'entries',
    'status',
    'options',
    'theme',
    'bgm',
    'mood',
    'sfx',
    'latestImage',
    'latestImageRawPath',
    'latestImageDescription',
    'background',
    'sprite',
    'hiddenDice',
    'diceRequest',
    'summary',
    'gameOver',
] as const;

/** Per-entry fields sent to the webview (including GM snapshot fields on history entries). */
export const WEBVIEW_GAME_ENTRY_KEYS = [
    'id',
    'role',
    'sender',
    'content',
    'speakerNpcId',
    'image',
    'rawImagePath',
    'imagePrompt',
    'imageBlocked',
    'excludedFromPrompt',
    'editedAt',
    'status',
    'options',
    'theme',
    'bgm',
    'mood',
    'sfx',
    'latestImage',
    'background',
    'sprite',
    'summary',
    'gameOver',
] as const;

/** turn_result fields rendered in Inspector / branch UI. */
export const WEBVIEW_TURN_RESULT_KEYS = [
    'turnId',
    'beforeHash',
    'afterHash',
    'appliedAt',
    'diceLedger',
    'statePatch',
    'triggeredLore',
    'tradeOps',
    'npcAgencyOps',
] as const;

const WEBVIEW_DICE_LEDGER_KEYS = [
    'formula',
    'rolls',
    'modifier',
    'total',
    'reason',
    'dc',
    'success',
] as const;

const WEBVIEW_TRADE_OP_KEYS = [
    'op',
    'marketLocationId',
    'commodityId',
    'qty',
] as const;

const WEBVIEW_DIRECTOR_PUBLIC_KEYS = [
    'act',
    'chapter',
    'scene',
    'objective',
    'guidanceMode',
    'achievedEndings',
] as const;

const BLOCKED_PATCH_PATH_PREFIXES = [
    '/hiddenState',
    '/profileUpdates',
    '/npcMemoryUpdates',
];

function pickShallow(
    raw: Record<string, unknown>,
    keys: readonly string[]
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            out[key] = raw[key];
        }
    }
    return out;
}

function pickDirectorPublic(raw: unknown): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    return pickShallow(raw as Record<string, unknown>, WEBVIEW_DIRECTOR_PUBLIC_KEYS);
}

export function sanitizeStatePatchForWebview(patches: unknown): StatePatchOp[] {
    if (!Array.isArray(patches)) {
        return [];
    }
    const out: StatePatchOp[] = [];
    for (const item of patches) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const patch = item as StatePatchOp;
        if (typeof patch.path !== 'string' || typeof patch.op !== 'string') {
            continue;
        }
        if (BLOCKED_PATCH_PATH_PREFIXES.some((prefix) => patch.path.startsWith(prefix))) {
            continue;
        }
        if (patch.path === '/director/notes' || patch.path.startsWith('/director/notes/')) {
            continue;
        }
        if (patch.path === '/director' && patch.value !== undefined) {
            const publicDirector = pickDirectorPublic(patch.value);
            if (publicDirector && Object.keys(publicDirector).length > 0) {
                out.push({ ...patch, value: publicDirector });
            }
            continue;
        }
        out.push(patch);
    }
    return out;
}

function pickDiceLedger(raw: unknown): TurnResult['diceLedger'] {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw
        .filter((row) => row && typeof row === 'object')
        .map((row) => pickShallow(row as Record<string, unknown>, WEBVIEW_DICE_LEDGER_KEYS))
        .filter((row) => typeof row.formula === 'string') as unknown as TurnResult['diceLedger'];
}

function pickTradeOps(raw: unknown): TurnResult['tradeOps'] {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw
        .filter((row) => row && typeof row === 'object')
        .map((row) => pickShallow(row as Record<string, unknown>, WEBVIEW_TRADE_OP_KEYS))
        .filter((row) => typeof row.op === 'string') as TurnResult['tradeOps'];
}

export function pickGameStateForWebview(state: Record<string, unknown>): Record<string, unknown> {
    const out = pickShallow(state, WEBVIEW_GAME_STATE_ROOT_KEYS);
    if (Array.isArray(state.entries)) {
        out.entries = state.entries.map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return entry;
            }
            return pickShallow(entry as Record<string, unknown>, WEBVIEW_GAME_ENTRY_KEYS);
        });
    }
    return out;
}

export function pickTurnResultForWebview(turnResult: TurnResult): TurnResult {
    const base = pickShallow(
        turnResult as unknown as Record<string, unknown>,
        WEBVIEW_TURN_RESULT_KEYS
    ) as unknown as TurnResult;

    if (turnResult.diceLedger) {
        base.diceLedger = pickDiceLedger(turnResult.diceLedger);
    }
    if (turnResult.statePatch) {
        base.statePatch = sanitizeStatePatchForWebview(turnResult.statePatch);
    }
    if (turnResult.tradeOps) {
        base.tradeOps = pickTradeOps(turnResult.tradeOps);
    }
    if (Array.isArray(turnResult.triggeredLore)) {
        base.triggeredLore = turnResult.triggeredLore.filter((s) => typeof s === 'string');
    }

    return base;
}