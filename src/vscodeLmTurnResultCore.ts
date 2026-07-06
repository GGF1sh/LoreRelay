// Pure helpers for vscode-lm GM JSON → turn_result.json (mirrors gm_bridge_common.process_llm_response).

import { buildStatePatchFromDiff } from './statePatch';
import { attachTurnResultPromptReceipt } from './promptReceiptCore';
import type { DiceLedgerEntry, TurnResult, TurnResultPromptReceiptMeta } from './types/TurnResult';

export interface VscodeLmGmJson {
    entries?: Array<{ id?: string; role?: string; sender?: string; content?: string; imagePrompt?: string; image?: string }>;
    status?: Record<string, unknown>;
    options?: string[];
    theme?: string;
    bgm?: string;
    mood?: string;
    sfx?: string;
    latestImage?: string;
    background?: string;
    sprite?: string;
    profileUpdates?: Array<{ characterId: string; dynamicProfile: string }>;
    gameOver?: { active: boolean; message?: string; victory?: boolean };
}

const DEFAULT_OPTIONS: Record<string, string[]> = {
    ja: ['周囲を調べる', '慎重に進む', '別の行動を試す'],
    en: ['Search the area', 'Proceed carefully', 'Try something else'],
};

export function nextVscodeLmTurnIdFromEntries(entries: unknown): string {
    if (!Array.isArray(entries)) {
        return 'turn-1';
    }
    let maxTurn = 0;
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') { continue; }
        const id = (entry as { id?: unknown }).id;
        if (typeof id !== 'string') { continue; }
        const m = /^turn-(\d+)$/.exec(id);
        if (m) {
            maxTurn = Math.max(maxTurn, parseInt(m[1], 10));
        }
    }
    return `turn-${maxTurn + 1}`;
}

export interface DiceMarkerSubstitutionResult {
    text: string;
    diceLedger: DiceLedgerEntry[];
}

export function substituteDiceMarkersWithLedger(text: string): DiceMarkerSubstitutionResult {
    const diceLedger: DiceLedgerEntry[] = [];
    const substituted = text.replace(/\{\{DICE:(\d+)d(\d+)\}\}/gi, (_m, countStr, sidesStr) => {
        const count = Math.max(1, Math.min(100, parseInt(countStr, 10)));
        const sides = Math.max(2, Math.min(10000, parseInt(sidesStr, 10)));
        let total = 0;
        const rolls: number[] = [];
        for (let i = 0; i < count; i++) {
            const r = Math.floor(Math.random() * sides) + 1;
            rolls.push(r);
            total += r;
        }
        diceLedger.push({
            formula: `${count}d${sides}`,
            rolls,
            modifier: 0,
            total,
            reason: 'gm_dice_marker',
        });
        return count === 1 ? String(total) : `${total}[${rolls.join('+')}]`;
    });
    return { text: substituted, diceLedger };
}

export function substituteDiceMarkersSimple(text: string): string {
    return substituteDiceMarkersWithLedger(text).text;
}

export function extractVscodeLmJsonBlock(text: string): VscodeLmGmJson | null {
    const m = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i.exec(text);
    if (!m) {
        return null;
    }
    try {
        return JSON.parse(m[1]) as VscodeLmGmJson;
    } catch {
        return null;
    }
}

export function stripVscodeLmJsonBlock(text: string): string {
    return text.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '').trim();
}

/** Merge LLM JSON into a projected game_state shape (entries included for diff only). */
export function mergeVscodeLmGameState(
    prev: Record<string, unknown>,
    llmJson: VscodeLmGmJson | null,
    narrative: string,
    turnId: string,
    locale: string
): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    if (llmJson) {
        const { entries: _e, profileUpdates: _p, ...rest } = llmJson;
        Object.assign(merged, rest);
    }

    if (!('status' in merged) && prev.status) {
        merged.status = prev.status;
    } else if (merged.status && typeof merged.status === 'object' && prev.status && typeof prev.status === 'object') {
        merged.status = { ...(prev.status as object), ...(merged.status as object) };
    }

    for (const key of ['theme', 'bgm', 'mood', 'sfx', 'latestImage', 'background', 'sprite'] as const) {
        if (!(key in merged) && key in prev) {
            merged[key] = prev[key];
        }
    }

    let content = narrative;
    const entry0 = llmJson?.entries?.[0];
    if (entry0?.content) {
        content = entry0.content;
    }

    const entry: Record<string, unknown> = {
        id: turnId,
        role: 'gm',
        sender: entry0?.sender?.trim() || 'Game Master',
        content,
    };
    if (entry0?.imagePrompt) {
        entry.imagePrompt = entry0.imagePrompt;
    }
    if (entry0?.image) {
        entry.image = entry0.image;
    }
    merged.entries = [entry];

    if (!merged.options || !Array.isArray(merged.options) || merged.options.length === 0) {
        merged.options = prev.options ?? DEFAULT_OPTIONS[locale] ?? DEFAULT_OPTIONS['en'];
    }

    return merged;
}

export function buildVscodeLmTurnResult(params: {
    prev: Record<string, unknown>;
    llmJson: VscodeLmGmJson | null;
    narrative: string;
    turnId: string;
    locale: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    triggeredLore?: string[];
    promptReceipt?: TurnResultPromptReceiptMeta;
}): TurnResult {
    const merged = mergeVscodeLmGameState(params.prev, params.llmJson, params.narrative, params.turnId, params.locale);
    const statePatch = buildStatePatchFromDiff(params.prev, merged);

    const entry0 = params.llmJson?.entries?.[0];
    let narration = params.narrative;
    if (entry0?.content) {
        narration = entry0.content;
    }

    const gmEntry: TurnResult['gmEntry'] = {};
    if (entry0?.imagePrompt) {
        gmEntry.imagePrompt = String(entry0.imagePrompt).slice(0, 2000);
    }
    if (entry0?.image) {
        gmEntry.image = String(entry0.image).slice(0, 500);
    }
    if (entry0?.sender?.trim()) {
        gmEntry.sender = entry0.sender.trim().slice(0, 120);
    }

    const media: NonNullable<TurnResult['media']> = {};
    for (const key of ['bgm', 'mood', 'sfx'] as const) {
        const val = merged[key];
        if (typeof val === 'string' && val.trim()) {
            media[key] = val;
        }
    }
    if (gmEntry.imagePrompt) {
        media.imagePrompt = gmEntry.imagePrompt;
    }

    const turnResult: TurnResult = {
        turnId: params.turnId,
        narration,
        statePatch,
        ...(params.playerAction ? { playerAction: params.playerAction } : {}),
        ...(params.diceLedger && params.diceLedger.length > 0 ? { diceLedger: params.diceLedger } : {}),
        ...(Object.keys(gmEntry).length > 0 ? { gmEntry } : {}),
        ...(Object.keys(media).length > 0 ? { media } : {}),
        ...(params.triggeredLore && params.triggeredLore.length > 0 ? { triggeredLore: params.triggeredLore } : {}),
    };

    return attachTurnResultPromptReceipt(turnResult, params.promptReceipt);
}
