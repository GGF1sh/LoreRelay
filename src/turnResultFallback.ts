import * as fs from 'fs';
import * as path from 'path';
import type { TurnResult } from './types/TurnResult';
import type { GameEntry } from './types/GameState';
import { isValidEntryId } from './entryId';
import { getTriggeredLoreLabels } from './gmPromptBuilder';
import { buildStatePatchFromDiff } from './statePatch';
import { getGameStatePath, getWorkspacePath, writeJsonAtomic } from './workspacePaths';

function findLatestGmEntry(state: Record<string, unknown>): GameEntry | undefined {
    const entries = state.entries;
    if (!Array.isArray(entries)) {
        return undefined;
    }
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (typeof entry === 'object' && entry !== null && (entry as GameEntry).role === 'gm') {
            return entry as GameEntry;
        }
    }
    return undefined;
}

function loadDiceLedger(wsPath: string): TurnResult['diceLedger'] {
    const ledgerPath = path.join(wsPath, 'dice_ledger.json');
    if (!fs.existsSync(ledgerPath)) {
        return undefined;
    }
    try {
        const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
        return Array.isArray(data) ? data : undefined;
    } catch {
        return undefined;
    }
}

/** Grok / custom GM が game_state.json を直接書いた場合に turn_result.json を合成する。 */
export function synthesizeTurnResultIfNeeded(
    prevState: Record<string, unknown>,
    playerAction?: string
): boolean {
    const statePath = getGameStatePath();
    const wsPath = getWorkspacePath();
    if (!statePath || !wsPath || !fs.existsSync(statePath)) {
        return false;
    }

    let current: Record<string, unknown>;
    try {
        current = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch {
        return false;
    }

    const prevGm = findLatestGmEntry(prevState);
    const currGm = findLatestGmEntry(current);
    if (!currGm || !isValidEntryId(currGm.id)) {
        return false;
    }

    const statePatch = buildStatePatchFromDiff(prevState, current);
    const gmChanged = !prevGm || prevGm.id !== currGm.id || prevGm.content !== currGm.content;
    if (!gmChanged && statePatch.length === 0) {
        return false;
    }

    const hint = `${playerAction ?? ''}\n${currGm.content ?? ''}`;
    const triggeredLore = getTriggeredLoreLabels(hint);

    const gmEntry: TurnResult['gmEntry'] = {};
    if (currGm.imagePrompt) {
        gmEntry.imagePrompt = currGm.imagePrompt;
    }
    if (currGm.image) {
        gmEntry.image = currGm.image;
    }

    const turnResult: TurnResult = {
        turnId: currGm.id,
        playerAction,
        narration: currGm.content,
        statePatch: statePatch.length > 0 ? statePatch : undefined,
        diceLedger: loadDiceLedger(wsPath),
        ...(Object.keys(gmEntry).length > 0 ? { gmEntry } : {}),
        ...(triggeredLore.length > 0 ? { triggeredLore } : {})
    };

    writeJsonAtomic(path.join(wsPath, 'turn_result.json'), turnResult);
    return true;
}

let pendingTurnResultFromGm = false;

export function beginGmRun(): Record<string, unknown> | undefined {
    pendingTurnResultFromGm = true;
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

export function markTurnResultHandled(): void {
    pendingTurnResultFromGm = false;
}

/** Python bridge が turn_result を書く猶予後、未処理なら合成する。 */
export function finishGmRun(
    prevState: Record<string, unknown> | undefined,
    playerAction: string,
    success: boolean
): void {
    if (!success || !pendingTurnResultFromGm) {
        pendingTurnResultFromGm = false;
        return;
    }
    setTimeout(() => {
        if (!pendingTurnResultFromGm || !prevState) {
            pendingTurnResultFromGm = false;
            return;
        }
        synthesizeTurnResultIfNeeded(prevState, playerAction);
        pendingTurnResultFromGm = false;
    }, 250);
}