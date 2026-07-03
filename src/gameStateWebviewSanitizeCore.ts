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
    'commerce',
    'world',
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

const WEBVIEW_COMMERCE_PUBLIC_KEYS = [
    'credits',
    'food',
    'transportId',
    'playerRole',
    'cargo',
] as const;

const WEBVIEW_WORLD_PUBLIC_KEYS = [
    'currentLocationId',
    'visitedLocationIds',
    'discoveredRegionIds',
    'knownFactionIds',
    'regions',
    'worldTurnAtLastSync',
    'lastGeneratedImage',
    'lastGeneratedLocationId',
    'lastAutoImageGmTurn',
    'rumorKnownRegionIds',
    'mapItems',
    'mapItemsConsumed',
] as const;

const WEBVIEW_PATCH_PUBLIC_ROOTS = [
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

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

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

function isPlainRecord(raw: unknown): raw is Record<string, unknown> {
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function finiteNumber(raw: unknown): number | undefined {
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function stringArray(raw: unknown, limit = 200): string[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw
        .filter((x): x is string => typeof x === 'string' && x.length <= 120)
        .slice(0, limit);
}

function pickCommercePublic(raw: unknown): Record<string, unknown> | undefined {
    if (!isPlainRecord(raw)) {
        return undefined;
    }
    const out: Record<string, unknown> = {};
    const credits = finiteNumber(raw.credits);
    const food = finiteNumber(raw.food);
    if (credits !== undefined) { out.credits = credits; }
    if (food !== undefined) { out.food = food; }
    if (typeof raw.transportId === 'string' && raw.transportId.length <= 120) {
        out.transportId = raw.transportId;
    }
    if (typeof raw.playerRole === 'string' && raw.playerRole.length <= 80) {
        out.playerRole = raw.playerRole;
    }
    if (Array.isArray(raw.cargo)) {
        out.cargo = raw.cargo
            .filter(isPlainRecord)
            .map((item) => {
                const row: Record<string, unknown> = {};
                if (typeof item.commodityId === 'string' && item.commodityId.length <= 120) {
                    row.commodityId = item.commodityId;
                }
                const qty = finiteNumber(item.qty);
                if (qty !== undefined) {
                    row.qty = qty;
                }
                return row;
            })
            .filter((item) => typeof item.commodityId === 'string' && typeof item.qty === 'number')
            .slice(0, 50);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function pickWorldPublic(raw: unknown): Record<string, unknown> | undefined {
    if (!isPlainRecord(raw)) {
        return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const key of WEBVIEW_WORLD_PUBLIC_KEYS) {
        const value = raw[key];
        if (typeof value === 'string' && value.length <= 500) {
            out[key] = value;
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            out[key] = value;
        } else if (
            key === 'visitedLocationIds'
            || key === 'discoveredRegionIds'
            || key === 'knownFactionIds'
            || key === 'rumorKnownRegionIds'
            || key === 'mapItemsConsumed'
        ) {
            const arr = stringArray(value);
            if (arr) {
                out[key] = arr;
            }
        }
    }
    if (Array.isArray(raw.mapItems)) {
        out.mapItems = raw.mapItems
            .filter(isPlainRecord)
            .map((item) => ({
                id: typeof item.id === 'string' ? item.id.slice(0, 120) : '',
                name: typeof item.name === 'string' ? item.name.slice(0, 160) : '',
                kind: item.kind === 'map' || item.kind === 'rumor' || item.kind === 'informant' ? item.kind : 'map',
                ...(typeof item.consumable === 'boolean' ? { consumable: item.consumable } : {}),
            }))
            .filter((item) => item.id && item.name)
            .slice(0, 50);
    }
    if (isPlainRecord(raw.regions)) {
        const regions: Record<string, unknown> = {};
        for (const [regionId, value] of Object.entries(raw.regions).slice(0, 200)) {
            if (!SAFE_ID_RE.test(regionId) || !isPlainRecord(value)) { continue; }
            const row: Record<string, unknown> = {};
            if (typeof value.controllingFaction === 'string' && value.controllingFaction.length <= 120) {
                row.controllingFaction = value.controllingFaction;
            } else if (value.controllingFaction === null) {
                row.controllingFaction = null;
            }
            const dangerLevel = finiteNumber(value.dangerLevel);
            if (dangerLevel !== undefined) {
                row.dangerLevel = Math.max(0, Math.min(10, dangerLevel));
            }
            if (Object.keys(row).length > 0) {
                regions[regionId] = row;
            }
        }
        if (Object.keys(regions).length > 0) {
            out.regions = regions;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function splitPatchPath(path: string): string[] {
    return path.split('/').filter(Boolean);
}

function isPublicDirectorPatch(parts: string[]): boolean {
    return parts[0] === 'director'
        && (parts.length === 1 || (WEBVIEW_DIRECTOR_PUBLIC_KEYS as readonly string[]).includes(parts[1]));
}

function isPublicCommercePatch(parts: string[]): boolean {
    return parts[0] === 'commerce'
        && (parts.length === 1 || (WEBVIEW_COMMERCE_PUBLIC_KEYS as readonly string[]).includes(parts[1]));
}

function isPublicWorldPatch(parts: string[]): boolean {
    if (parts[0] !== 'world') {
        return false;
    }
    if (parts.length === 1) {
        return true;
    }
    if (!(WEBVIEW_WORLD_PUBLIC_KEYS as readonly string[]).includes(parts[1])) {
        return false;
    }
    if (parts[1] === 'regions') {
        return parts.length <= 4 && (parts.length < 4 || parts[3] === 'controllingFaction' || parts[3] === 'dangerLevel');
    }
    return true;
}

function isPublicPatchPath(path: string): boolean {
    if (!path.startsWith('/')) {
        return false;
    }
    const parts = splitPatchPath(path);
    if (parts.length === 0) {
        return false;
    }
    if ((WEBVIEW_PATCH_PUBLIC_ROOTS as readonly string[]).includes(parts[0])) {
        return true;
    }
    return isPublicDirectorPatch(parts) || isPublicCommercePatch(parts) || isPublicWorldPatch(parts);
}

function sanitizePatchValueForWebview(patch: StatePatchOp): StatePatchOp | undefined {
    if (patch.path === '/director' && patch.value !== undefined) {
        const publicDirector = pickDirectorPublic(patch.value);
        return publicDirector && Object.keys(publicDirector).length > 0
            ? { ...patch, value: publicDirector }
            : undefined;
    }
    if (patch.path === '/commerce' && patch.value !== undefined) {
        const publicCommerce = pickCommercePublic(patch.value);
        return publicCommerce ? { ...patch, value: publicCommerce } : undefined;
    }
    if (patch.path === '/world' && patch.value !== undefined) {
        const publicWorld = pickWorldPublic(patch.value);
        return publicWorld ? { ...patch, value: publicWorld } : undefined;
    }
    return patch;
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
        if (!isPublicPatchPath(patch.path)) {
            continue;
        }
        const sanitized = sanitizePatchValueForWebview(patch);
        if (sanitized) {
            out.push(sanitized);
        }
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
    const commerce = pickCommercePublic(state.commerce);
    const world = pickWorldPublic(state.world);
    if (commerce) {
        out.commerce = commerce;
    } else {
        delete out.commerce;
    }
    if (world) {
        out.world = world;
    } else {
        delete out.world;
    }
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
