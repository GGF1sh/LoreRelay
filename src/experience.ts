import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    DEFAULT_EXPERIENCE,
    EXPERIENCE_FILENAME,
    ExperienceConfig,
    mergeExperiencePatch,
    parseExperienceConfig,
} from './experienceCore';

let cached: ExperienceConfig | undefined;
let cachePath = '';
let cacheMtime = 0;
const profileListeners = new Set<() => void>();

/** Host listeners observe committed profile transitions, including idle round trips. */
export function onExperienceProfileChanged(listener: () => void) {
    profileListeners.add(listener);
    return { dispose: () => { profileListeners.delete(listener); } };
}

export function clearExperienceCache(): void {
    cached = undefined;
    cachePath = '';
    cacheMtime = 0;
}

function resolveExperiencePath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, EXPERIENCE_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function loadExperienceConfig(): ExperienceConfig {
    const filePath = resolveExperiencePath();
    if (!filePath || !fs.existsSync(filePath)) {
        return { ...DEFAULT_EXPERIENCE };
    }
    try {
        const mtime = fs.statSync(filePath).mtimeMs;
        if (cached && cachePath === filePath && cacheMtime === mtime) {
            return cached;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const loaded = parseExperienceConfig(raw);
        cached = loaded;
        cachePath = filePath;
        cacheMtime = mtime;
        return loaded;
    } catch (err) {
        console.error('[LoreRelay] Failed to load experience.json', err);
        return { ...DEFAULT_EXPERIENCE };
    }
}

export function saveExperienceConfig(patch: Partial<ExperienceConfig>): ExperienceConfig {
    const filePath = resolveExperiencePath();
    if (!filePath) {
        throw new Error('Workspace required for experience.json');
    }
    const current = loadExperienceConfig();
    const next = mergeExperiencePatch(current, patch);
    writeJsonAtomic(filePath, next);
    cached = next;
    cachePath = filePath;
    try {
        cacheMtime = fs.statSync(filePath).mtimeMs;
    } catch {
        cacheMtime = 0;
    }
    if (current.profile !== next.profile) for (const listener of profileListeners) {
        try { listener(); } catch { /* a listener cannot roll back a committed profile */ }
    }
    return next;
}

export function getExperienceProfile(): 'parlor' | 'campaign' | 'inworld' {
    return loadExperienceConfig().profile;
}

export function isParlorMode(): boolean {
    return getExperienceProfile() === 'parlor';
}

export function isInWorldMode(): boolean {
    return getExperienceProfile() === 'inworld';
}
