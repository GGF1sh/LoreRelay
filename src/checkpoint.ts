import * as fs from 'fs';
import * as path from 'path';
import type { GameEntry } from './types/GameState';

export interface CheckpointMeta {
    id: string;
    label: string;
    createdAt: string;
    turnId: string;
    turnLabel: string;
}

export interface CheckpointFile {
    format: 'text-adventure-checkpoint/1.0';
    meta: CheckpointMeta;
    history: GameEntry[];
}

export interface GmSnapshot {
    entries: GameEntry[];
    status?: Record<string, unknown>;
    options?: string[];
    theme?: string;
    bgm?: string;
    mood?: string;
    sfx?: string | string[];
    latestImage?: string;
    background?: string;
    sprite?: unknown;
    summary?: string;
    gameOver?: unknown;
}

export function getCheckpointsDir(ws: string): string {
    return path.join(ws, '.text-adventure', 'checkpoints');
}

const CHECKPOINT_ID_RE = /^cp-\d+$/;

export function isValidCheckpointId(checkpointId: string): boolean {
    return CHECKPOINT_ID_RE.test(checkpointId);
}

export function buildStateFromGmEntry(entry: GameEntry & Record<string, unknown>): GmSnapshot {
    const state: GmSnapshot = {
        entries: [{
            id: entry.id,
            role: entry.role,
            sender: entry.sender,
            content: entry.content,
            ...(entry.image ? { image: entry.image as string } : {})
        }],
        status: (entry.status as Record<string, unknown>) || {},
        options: Array.isArray(entry.options) ? [...(entry.options as string[])] : [],
        theme: (entry.theme as string) || 'fantasy'
    };
    if (entry.bgm) { state.bgm = entry.bgm as string; }
    if (entry.mood) { state.mood = entry.mood as string; }
    if (entry.sfx) {
        state.sfx = Array.isArray(entry.sfx) ? [...(entry.sfx as string[])] : (entry.sfx as string);
    }
    if (entry.latestImage) { state.latestImage = entry.latestImage as string; }
    if (entry.background) { state.background = entry.background as string; }
    if (entry.sprite) { state.sprite = entry.sprite; }
    if (entry.summary) { state.summary = entry.summary as string; }
    if (entry.gameOver) { state.gameOver = entry.gameOver; }
    return state;
}

export function findLastGmEntry(history: GameEntry[]): (GameEntry & Record<string, unknown>) | undefined {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'gm') {
            return history[i] as GameEntry & Record<string, unknown>;
        }
    }
    return undefined;
}

export function truncateHistoryToGmEntry(
    history: GameEntry[],
    entryId: string
): { history: GameEntry[]; seenIds: Set<string> } | undefined {
    let targetIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].id === entryId && history[i].role === 'gm') {
            targetIndex = i;
            break;
        }
    }
    if (targetIndex < 0) {
        return undefined;
    }
    const truncated = history.slice(0, targetIndex + 1);
    const seenIds = new Set(truncated.map((e) => e.id).filter(Boolean) as string[]);
    return { history: truncated, seenIds };
}

export function truncateHistoryOneTurn(history: GameEntry[]): GameEntry[] {
    const copy = [...history];
    const last = copy[copy.length - 1];
    if (last?.role === 'user') {
        copy.pop();
    }
    const last2 = copy[copy.length - 1];
    if (last2?.role === 'gm') {
        copy.pop();
    }
    return copy;
}

export function listCheckpointMetas(ws: string): CheckpointMeta[] {
    const dir = getCheckpointsDir(ws);
    if (!fs.existsSync(dir)) {
        return [];
    }
    const metas: CheckpointMeta[] = [];
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) {
            continue;
        }
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as CheckpointFile;
            if (data.meta?.id) {
                metas.push(data.meta);
            }
        } catch {
            // skip corrupt checkpoint
        }
    }
    return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveCheckpointFile(
    ws: string,
    history: GameEntry[],
    label?: string
): CheckpointMeta | undefined {
    const gm = findLastGmEntry(history);
    if (!gm?.id) {
        return undefined;
    }
    const id = `cp-${Date.now()}`;
    const turnNum = history.filter((e) => e.role === 'gm').length;
    const meta: CheckpointMeta = {
        id,
        label: (label || '').trim() || `Turn ${turnNum}`,
        createdAt: new Date().toISOString(),
        turnId: gm.id,
        turnLabel: gm.content.slice(0, 60).replace(/\s+/g, ' ').trim()
    };
    const payload: CheckpointFile = {
        format: 'text-adventure-checkpoint/1.0',
        meta,
        history: JSON.parse(JSON.stringify(history))
    };
    const dir = getCheckpointsDir(ws);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf-8');
    return meta;
}

export function loadCheckpointFile(ws: string, checkpointId: string): CheckpointFile | undefined {
    if (!isValidCheckpointId(checkpointId)) {
        return undefined;
    }
    const filePath = path.join(getCheckpointsDir(ws), `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CheckpointFile;
    } catch {
        return undefined;
    }
}

export function deleteCheckpointFile(ws: string, checkpointId: string): boolean {
    if (!isValidCheckpointId(checkpointId)) {
        return false;
    }
    const filePath = path.join(getCheckpointsDir(ws), `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
        return false;
    }
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
}

export function listRewindTargets(history: GameEntry[], maxItems = 20): Array<{ id: string; label: string; index: number }> {
    const targets: Array<{ id: string; label: string; index: number }> = [];
    for (let i = history.length - 1; i >= 0 && targets.length < maxItems; i--) {
        const e = history[i];
        if (e.role !== 'gm' || !e.id) {
            continue;
        }
        const turnNum = history.slice(0, i + 1).filter((x) => x.role === 'gm').length;
        const preview = e.content.slice(0, 48).replace(/\s+/g, ' ').trim();
        targets.push({
            id: e.id,
            label: `#${turnNum} ${preview}${e.content.length > 48 ? '…' : ''}`,
            index: i
        });
    }
    return targets;
}