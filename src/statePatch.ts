import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StatePatchOp, TurnResult } from './types/TurnResult';
import type { GameEntry } from './types/GameState';
import { isValidEntryId } from './entryId';
import { isValidEventId } from './worldEventLogCore';
import { getGameStatePath, getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { validateGameState } from './validateGameState';
import { t } from './i18n';
import { commitGameState } from './stateManager';
import { loadWorldState, saveWorldState } from './worldState';
import { applyNpcMemoryUpdates } from './npcRegistry';
import type { NpcMemoryUpdate } from './npcRegistryCore';
import { CURRENT_SCHEMA_VERSION } from './migrateGameState';

/** game_state_schema.json と整合するパッチ許可ルート（entries は別処理）。 */
const ALLOWED_ROOTS = new Set([
    'status', 'options', 'theme', 'bgm', 'mood', 'sfx',
    'latestImage', 'background', 'sprite', 'hiddenDice',
    'gameOver', 'summary', 'diceRequest', 'hiddenState', 'director', 'partyDirector', 'world'
]);

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_PATCH_OPS = 50;
const MAX_PATCH_VALUE_BYTES = 100_000; // 100 KB per op value

const PATCHABLE_ROOT_KEYS = [
    'status', 'options', 'theme', 'bgm', 'mood', 'sfx',
    'latestImage', 'background', 'sprite', 'hiddenDice',
    'gameOver', 'summary', 'diceRequest', 'hiddenState', 'director', 'partyDirector', 'world'
] as const;

function pushPatchIfChanged(
    patches: StatePatchOp[],
    prev: Record<string, unknown>,
    next: Record<string, unknown>,
    path: string
): void {
    const keys = path.split('/').filter(Boolean);
    const getAt = (obj: Record<string, unknown>): unknown => {
        let cur: unknown = obj;
        for (const key of keys) {
            if (!cur || typeof cur !== 'object' || Array.isArray(cur) || !(key in cur)) {
                return undefined;
            }
            cur = (cur as Record<string, unknown>)[key];
        }
        return cur;
    };
    const newVal = getAt(next);
    if (newVal === undefined) { return; }
    const oldVal = getAt(prev);
    if (JSON.stringify(newVal) === JSON.stringify(oldVal)) { return; }
    patches.push({
        op: oldVal === undefined ? 'add' : 'replace',
        path,
        value: newVal
    });
}

function buildWorldPatchesFromDiff(
    prev: Record<string, unknown>,
    next: Record<string, unknown>
): StatePatchOp[] {
    const patches: StatePatchOp[] = [];
    pushPatchIfChanged(patches, prev, next, '/world/currentLocationId');

    const nextWorld = next.world;
    if (!nextWorld || typeof nextWorld !== 'object' || Array.isArray(nextWorld)) {
        return patches;
    }
    const regions = (nextWorld as Record<string, unknown>).regions;
    if (!regions || typeof regions !== 'object' || Array.isArray(regions)) {
        return patches;
    }
    for (const regionId of Object.keys(regions as Record<string, unknown>).slice(0, 50)) {
        if (!isValidEventId(regionId)) { continue; }
        pushPatchIfChanged(patches, prev, next, `/world/regions/${regionId}/controllingFaction`);
        pushPatchIfChanged(patches, prev, next, `/world/regions/${regionId}/dangerLevel`);
    }
    return patches.filter((patch) => isSafePatchPath(patch.path) && isSafeWorldPatchValue(
        patch.path.split('/').filter(Boolean),
        patch.value
    ));
}

/** game_state 差分から JSON Patch を生成（Grok 直書きフォールバック用）。 */
export function buildStatePatchFromDiff(
    prev: Record<string, unknown>,
    next: Record<string, unknown>
): StatePatchOp[] {
    const patches: StatePatchOp[] = [];
    for (const key of PATCHABLE_ROOT_KEYS) {
        if (!(key in next)) {
            continue;
        }
        if (key === 'world') {
            patches.push(...buildWorldPatchesFromDiff(prev, next));
            continue;
        }
        const newVal = next[key];
        const oldVal = prev[key];
        if (JSON.stringify(newVal) === JSON.stringify(oldVal)) {
            continue;
        }
        patches.push({
            op: key in prev ? 'replace' : 'add',
            path: `/${key}`,
            value: newVal
        });
    }
    return patches;
}

export function hashGameState(state: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

// Allowlist for specific sub-paths inside /world that the GM may write.
// Pattern: [root, sub, ...] — '*' matches any single key segment.
const WORLD_SUBPATH_ALLOWLIST: string[][] = [
    ['world', 'currentLocationId'],
    ['world', 'regions', '*', 'controllingFaction'],
    ['world', 'regions', '*', 'dangerLevel'],
];

function matchesWorldAllowlist(keys: string[]): boolean {
    for (const pattern of WORLD_SUBPATH_ALLOWLIST) {
        if (pattern.length !== keys.length) { continue; }
        if (pattern.every((seg, i) => seg === '*' || seg === keys[i])) { return true; }
    }
    return false;
}

function isSafeWorldPatchValue(keys: string[], value: unknown): boolean {
    if (keys.length === 2 && keys[1] === 'currentLocationId') {
        return typeof value === 'string' && (value === '' || isValidEventId(value));
    }
    if (keys.length === 4 && keys[1] === 'regions') {
        if (!isValidEventId(keys[2])) { return false; }
        if (keys[3] === 'controllingFaction') {
            return value === null || (typeof value === 'string' && isValidEventId(value));
        }
        if (keys[3] === 'dangerLevel') {
            return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 10;
        }
    }
    return false;
}

function isSafePatchPath(patchPath: string): boolean {
    const keys = patchPath.split('/').filter((k) => k.length > 0);
    if (keys.length === 0) {
        return false;
    }
    if (keys.some((k) => BLOCKED_KEYS.has(k))) {
        return false;
    }
    if (!ALLOWED_ROOTS.has(keys[0])) {
        return false;
    }
    // /world paths are gated by a fine-grained allowlist to prevent arbitrary
    // overwrites of simulation state that the GM should not touch directly.
    if (keys[0] === 'world') {
        if (keys.length === 1) { return false; }
        return matchesWorldAllowlist(keys);
    }
    return true;
}

/**
 * Apply JSON Patch operations to a state object.
 */
export function applyStatePatch(state: Record<string, unknown>, patches: StatePatchOp[]): Record<string, unknown> {
    const newState = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;

    if (patches.length > MAX_PATCH_OPS) {
        console.warn(`[statePatch] Too many patch ops (${patches.length}), truncating to ${MAX_PATCH_OPS}`);
        patches = patches.slice(0, MAX_PATCH_OPS);
    }

    for (const patch of patches) {
        try {
            if (!patch || typeof patch.path !== 'string' || !isSafePatchPath(patch.path)) {
                if (patch?.path) {
                    console.warn(`[statePatch] Blocked patch path: ${patch.path}`);
                }
                continue;
            }

            const keys = patch.path.split('/').filter((k) => k.length > 0);

            const lastKey = keys[keys.length - 1];
            switch (patch.op) {
                case 'replace':
                case 'add': {
                    if (keys[0] === 'world' && !isSafeWorldPatchValue(keys, patch.value)) {
                        console.warn(`[statePatch] Blocked world patch value: ${patch.path}`);
                        break;
                    }

                    let target: Record<string, unknown> = newState;
                    for (let i = 0; i < keys.length - 1; i++) {
                        const key = keys[i];
                        if (target[key] === undefined || typeof target[key] !== 'object' || target[key] === null) {
                            target[key] = {};
                        }
                        target = target[key] as Record<string, unknown>;
                    }
                    const serialized = JSON.stringify(patch.value);
                    if (serialized.length > MAX_PATCH_VALUE_BYTES) {
                        console.warn(`[statePatch] Value too large for ${patch.path} (${serialized.length} bytes), skipping`);
                        break;
                    }
                    target[lastKey] = patch.value;
                    break;
                }
                case 'remove': {
                    if (keys[0] === 'world') {
                        console.warn(`[statePatch] Blocked world remove patch: ${patch.path}`);
                        break;
                    }
                    let target: Record<string, unknown> = newState;
                    for (let i = 0; i < keys.length - 1; i++) {
                        const key = keys[i];
                        if (target[key] === undefined || typeof target[key] !== 'object' || target[key] === null) {
                            break;
                        }
                        target = target[key] as Record<string, unknown>;
                    }
                    delete target[lastKey];
                    break;
                }
            }
        } catch (e) {
            console.error(`Failed to apply patch: ${JSON.stringify(patch)}`, e);
        }
    }

    return newState;
}

/** turn_result の narration / gmEntry を game_state.entries にマージする。 */
export function mergeGmEntryFromTurn(state: Record<string, unknown>, turnResult: TurnResult): Record<string, unknown> {
    const narration = typeof turnResult.narration === 'string' ? turnResult.narration.trim() : '';
    if (!narration || !isValidEntryId(turnResult.turnId)) {
        return state;
    }

    const gmMeta = turnResult.gmEntry;
    const sender = (gmMeta?.sender && typeof gmMeta.sender === 'string' && gmMeta.sender.trim())
        ? gmMeta.sender.trim().slice(0, 120)
        : 'Game Master';

    const entry: GameEntry = {
        id: turnResult.turnId,
        role: 'gm',
        sender,
        content: narration
    };

    if (gmMeta?.speakerNpcId && isValidEntryId(gmMeta.speakerNpcId)) {
        entry.speakerNpcId = gmMeta.speakerNpcId;
    }
    if (gmMeta?.imagePrompt && typeof gmMeta.imagePrompt === 'string') {
        entry.imagePrompt = gmMeta.imagePrompt.slice(0, 2000);
    }
    if (gmMeta?.image && typeof gmMeta.image === 'string') {
        entry.image = gmMeta.image.slice(0, 500);
    }

    const entries = Array.isArray(state.entries) ? [...state.entries] : [];
    const idx = entries.findIndex((e) => typeof e === 'object' && e !== null && (e as GameEntry).id === turnResult.turnId);
    if (idx >= 0) {
        entries[idx] = { ...(entries[idx] as GameEntry), ...entry };
    } else {
        entries.push(entry);
    }

    return { ...state, entries };
}

/** Reward magnitude for completing an NPC-sourced quest hook (0-100 disposition scale). */
const QUEST_COMPLETION_TRUST_REWARD = 10;

function completeResolvedQuestHooks(resolvedQuests: unknown, currentTurn: number): void {
    if (!Array.isArray(resolvedQuests)) { return; }
    const resolvedIds = new Set(resolvedQuests.filter(isValidEventId));
    if (resolvedIds.size === 0) { return; }

    const worldState = loadWorldState();
    if (!worldState?.questHooks?.length) { return; }

    let changed = false;
    const npcUpdates: NpcMemoryUpdate[] = [];
    for (const hook of worldState.questHooks) {
        if (resolvedIds.has(hook.id) && hook.status === 'active') {
            hook.status = 'completed';
            changed = true;

            if (hook.source === 'npc' && hook.npcId && hook.needId) {
                npcUpdates.push({
                    npcId: hook.npcId,
                    dispositionDelta: { playerTrust: QUEST_COMPLETION_TRUST_REWARD },
                    needUpdates: [{ id: hook.needId, resolved: true }],
                    newMemory: {
                        turn: currentTurn,
                        content: `Player helped resolve: ${hook.title}`,
                        emotionalWeight: 'positive',
                        tags: ['quest-completed']
                    }
                });
            }
        }
    }
    if (changed) {
        saveWorldState(worldState);
    }
    if (npcUpdates.length > 0) {
        applyNpcMemoryUpdates(npcUpdates, currentTurn);
    }
}

/**
 * Process turn_result.json: apply patches, merge GM entry, validate, persist.
 */
export function processTurnResult(turnResult: TurnResult): TurnResult | false {
    const statePath = getGameStatePath();
    if (!statePath) {
        return false;
    }

    try {
        let state = fs.existsSync(statePath)
            ? JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>
            : { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] as unknown[] };
        const beforeHash = hashGameState(state);

        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            state = applyStatePatch(state, turnResult.statePatch);
        }

        const priorGmTurns = Array.isArray(state.entries)
            ? (state.entries as unknown[]).filter((e) => typeof e === 'object' && e !== null && (e as GameEntry).role === 'gm').length
            : 0;
        completeResolvedQuestHooks(turnResult.resolvedQuests, priorGmTurns + 1);

        state = mergeGmEntryFromTurn(state, turnResult);

        const schemaErrors = validateGameState(state);
        if (schemaErrors.length > 0) {
            console.error(`[statePatch] Validation failed after turn: ${schemaErrors.join('; ')}`);
            vscode.window.showErrorMessage(t('extension.error.gameStateLoad') + ' (Schema Violation)');
            return false;
        }

        const afterHash = hashGameState(state);
        commitGameState(state);

        const appliedAt = new Date().toISOString();
        const enriched: TurnResult = {
            ...turnResult,
            beforeHash,
            afterHash,
            appliedAt
        };

        const wsPath = getWorkspacePath();
        if (wsPath) {
            const journalPath = path.join(wsPath, 'state_journal.ndjson');
            try {
                if (fs.existsSync(journalPath)) {
                    const stats = fs.statSync(journalPath);
                    if (stats.size > 10 * 1024 * 1024) {
                        const backupPath = `${journalPath}.bak`;
                        if (fs.existsSync(backupPath)) {
                            fs.unlinkSync(backupPath);
                        }
                        fs.renameSync(journalPath, backupPath);
                    }
                }
            } catch (e) {
                console.error('Failed to rotate state_journal.ndjson', e);
            }

            fs.appendFileSync(journalPath, JSON.stringify(enriched) + '\n', 'utf-8');
        }

        return enriched;
    } catch (e) {
        console.error('Error processing turn result', e);
        vscode.window.showErrorMessage(t('extension.error.gameStateLoad'));
        return false;
    }
}
