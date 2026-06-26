import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { previewText } from './promptContext';
import type { LorebookEntry } from './lorebookMatcher';

const LOREBOOK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export interface LorebookUiEntry {
    id: string;
    label: string;
    content: string;
    keys: string[];
    secondary_keys: string[];
    contentPreview: string;
    enabled: boolean;
    use_regex: boolean;
    priority: number;
    insertion_order: number;
    pinned: boolean;
}

export interface LorebookSaveResult {
    ok: boolean;
    errors?: string[];
    path?: string;
}

function readLorebookFile(filePath: string): LorebookEntry[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(raw.entries) ? raw.entries as LorebookEntry[] : [];
    } catch {
        return [];
    }
}

function mapEntryToUi(e: LorebookEntry, idx: number): LorebookUiEntry {
    const content = String(e.content || '');
    return {
        id: String(e.id || `entry-${idx}`),
        label: String(e.comment || e.id || `entry-${idx}`),
        content,
        keys: Array.isArray(e.keys) ? e.keys.map(String) : [],
        secondary_keys: Array.isArray(e.secondary_keys) ? e.secondary_keys.map(String) : [],
        contentPreview: previewText(content, 200),
        enabled: e.enabled !== false,
        use_regex: e.use_regex === true,
        priority: typeof e.priority === 'number' ? e.priority : 0,
        insertion_order: typeof e.insertion_order === 'number' ? e.insertion_order : 0,
        pinned: e.pinned === true
    };
}

export function getLorebookSourcePath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const primary = path.join(ws, 'lorebook.json');
    if (fs.existsSync(primary)) {
        return primary;
    }
    const fallback = path.join(ws, 'world_info.json');
    return fs.existsSync(fallback) ? fallback : undefined;
}

export function getLorebookWritePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, 'lorebook.json') : undefined;
}

export function loadLorebookForUi(): { sourceFile?: string; writeFile: string; entries: LorebookUiEntry[] } {
    const ws = getWorkspacePath();
    const writeFile = 'lorebook.json';
    if (!ws) {
        return { writeFile, entries: [] };
    }
    const candidates = [path.join(ws, 'lorebook.json'), path.join(ws, 'world_info.json')];
    for (const filePath of candidates) {
        const raw = readLorebookFile(filePath);
        if (raw.length === 0 && !fs.existsSync(filePath)) {
            continue;
        }
        return {
            sourceFile: path.basename(filePath),
            writeFile,
            entries: raw.map(mapEntryToUi)
        };
    }
    return { writeFile, entries: [] };
}

function parseKeysInput(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.map(String).map((k) => k.trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        return raw.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean);
    }
    return [];
}

function normalizeUiEntry(raw: unknown, index: number): LorebookUiEntry | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const e = raw as Record<string, unknown>;
    const id = String(e.id || `entry-${index}`).trim();
    const content = String(e.content ?? '');
    const label = String(e.label ?? e.comment ?? id).trim();
    return {
        id,
        label,
        content,
        keys: parseKeysInput(e.keys),
        secondary_keys: parseKeysInput(e.secondary_keys),
        contentPreview: previewText(content, 200),
        enabled: e.enabled !== false,
        use_regex: e.use_regex === true,
        priority: typeof e.priority === 'number' ? e.priority : Number(e.priority) || 0,
        insertion_order: typeof e.insertion_order === 'number'
            ? e.insertion_order
            : Number(e.insertion_order) || 0,
        pinned: e.pinned === true
    };
}

function toLorebookEntry(ui: LorebookUiEntry): LorebookEntry {
    const entry: LorebookEntry = {
        id: ui.id,
        comment: ui.label || ui.id,
        keys: ui.keys,
        content: ui.content,
        enabled: ui.enabled,
        priority: ui.priority,
        insertion_order: ui.insertion_order
    };
    if (ui.secondary_keys.length > 0) {
        entry.secondary_keys = ui.secondary_keys;
    }
    if (ui.use_regex) {
        entry.use_regex = true;
    }
    if (ui.pinned) {
        entry.pinned = true;
    }
    return entry;
}

export function validateLorebookUiEntries(entries: LorebookUiEntry[]): string[] {
    const errors: string[] = [];
    const seenIds = new Set<string>();
    for (const entry of entries) {
        if (!LOREBOOK_ID_PATTERN.test(entry.id)) {
            errors.push(`Invalid id "${entry.id}" (use 1–64 chars: letters, digits, _ -)`);
        }
        if (seenIds.has(entry.id)) {
            errors.push(`Duplicate id "${entry.id}"`);
        }
        seenIds.add(entry.id);
        if (entry.enabled && !entry.content.trim()) {
            errors.push(`"${entry.label || entry.id}": content required when enabled`);
        }
        if (entry.enabled && entry.keys.length === 0) {
            errors.push(`"${entry.label || entry.id}": at least one keyword required when enabled`);
        }
    }
    return errors;
}

export function saveLorebookFromUi(rawEntries: unknown[]): LorebookSaveResult {
    const writePath = getLorebookWritePath();
    if (!writePath) {
        return { ok: false, errors: ['Workspace not found'] };
    }

    const entries = rawEntries
        .map((raw, idx) => normalizeUiEntry(raw, idx))
        .filter((e): e is LorebookUiEntry => Boolean(e));

    const errors = validateLorebookUiEntries(entries);
    if (errors.length > 0) {
        return { ok: false, errors };
    }

    let format = 'text-adventure-lorebook/1.0';
    let source = 'lorerelay-editor';
    const existingPath = getLorebookSourcePath();
    if (existingPath && fs.existsSync(existingPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(existingPath, 'utf-8')) as Record<string, unknown>;
            if (typeof meta.format === 'string') {
                format = meta.format;
            }
            if (typeof meta.source === 'string') {
                source = meta.source;
            }
        } catch {
            // use defaults
        }
    }

    writeJsonAtomic(writePath, {
        format,
        source,
        entries: entries.map(toLorebookEntry)
    });

    return { ok: true, path: writePath };
}