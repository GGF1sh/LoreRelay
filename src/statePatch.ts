import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StatePatchOp, TurnResult } from './types/TurnResult';
import type { GameEntry } from './types/GameState';
import { isValidEntryId } from './entryId';
import { getGameStatePath, getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { validateGameState } from './validateGameState';
import { t } from './i18n';

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
    if (keys[0] === 'world' && keys.length > 1) {
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
            let target: Record<string, unknown> = newState;
            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                if (target[key] === undefined || typeof target[key] !== 'object' || target[key] === null) {
                    target[key] = {};
                }
                target = target[key] as Record<string, unknown>;
            }

            const lastKey = keys[keys.length - 1];
            switch (patch.op) {
                case 'replace':
                case 'add': {
                    const serialized = JSON.stringify(patch.value);
                    if (serialized.length > MAX_PATCH_VALUE_BYTES) {
                        console.warn(`[statePatch] Value too large for ${patch.path} (${serialized.length} bytes), skipping`);
                        break;
                    }
                    target[lastKey] = patch.value;
                    break;
                }
                case 'remove':
                    delete target[lastKey];
                    break;
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

    const entry: GameEntry = {
        id: turnResult.turnId,
        role: 'gm',
        sender: 'Game Master',
        content: narration
    };

    const gmMeta = turnResult.gmEntry;
    if (gmMeta?.imagePrompt && typeof gmMeta.imagePrompt === 'string') {
        entry.imagePrompt = gmMeta.imagePrompt.slice(0, 2000);
    }
    if (gmMeta?.image && typeof gmMeta.image === 'string') {
        entry.image = gmMeta.image;
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

/**
 * Process turn_result.json: apply patches, merge GM entry, validate, persist.
 */
export function processTurnResult(turnResult: TurnResult): TurnResult | false {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return false;
    }

    try {
        const stateStr = fs.readFileSync(statePath, 'utf-8');
        let state = JSON.parse(stateStr) as Record<string, unknown>;
        const beforeHash = hashGameState(state);

        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            state = applyStatePatch(state, turnResult.statePatch);
        }

        state = mergeGmEntryFromTurn(state, turnResult);

        const schemaErrors = validateGameState(state);
        if (schemaErrors.length > 0) {
            console.error(`[statePatch] Validation failed after turn: ${schemaErrors.join('; ')}`);
            vscode.window.showErrorMessage(t('extension.error.gameStateLoad') + ' (Schema Violation)');
            return false;
        }

        const afterHash = hashGameState(state);
        writeJsonAtomic(statePath, state);

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