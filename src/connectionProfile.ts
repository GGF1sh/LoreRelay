import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    CONNECTION_PROFILES_FILENAME,
    ConnectionProfile,
    ConnectionProfilesFile,
    DEFAULT_CONNECTION_PROFILES,
    getActiveConnectionProfile,
    parseConnectionProfiles,
    setActiveConnectionProfileId,
} from './connectionProfileCore';

let cached: ConnectionProfilesFile | undefined;
let cachePath = '';
let cacheMtime = 0;

export function clearConnectionProfileCache(): void {
    cached = undefined;
    cachePath = '';
    cacheMtime = 0;
}

function resolveConnectionProfilesPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, CONNECTION_PROFILES_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function loadConnectionProfiles(): ConnectionProfilesFile {
    const filePath = resolveConnectionProfilesPath();
    if (!filePath) {
        return { ...DEFAULT_CONNECTION_PROFILES, profiles: [...DEFAULT_CONNECTION_PROFILES.profiles] };
    }
    if (!fs.existsSync(filePath)) {
        return { ...DEFAULT_CONNECTION_PROFILES, profiles: [...DEFAULT_CONNECTION_PROFILES.profiles] };
    }
    try {
        const mtime = fs.statSync(filePath).mtimeMs;
        if (cached && cachePath === filePath && cacheMtime === mtime) {
            return cached;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const loaded = parseConnectionProfiles(raw);
        cached = loaded;
        cachePath = filePath;
        cacheMtime = mtime;
        return loaded;
    } catch (err) {
        console.error('[LoreRelay] Failed to load connection_profiles.json', err);
        return { ...DEFAULT_CONNECTION_PROFILES, profiles: [...DEFAULT_CONNECTION_PROFILES.profiles] };
    }
}

export function saveConnectionProfiles(file: ConnectionProfilesFile): void {
    const filePath = resolveConnectionProfilesPath();
    if (!filePath) {
        throw new Error('Workspace required for connection_profiles.json');
    }
    const sanitized = parseConnectionProfiles(file);
    writeJsonAtomic(filePath, sanitized);
    cached = sanitized;
    cachePath = filePath;
    try {
        cacheMtime = fs.statSync(filePath).mtimeMs;
    } catch {
        cacheMtime = 0;
    }
}

export function getActiveParlorConnectionProfile(): ConnectionProfile {
    return getActiveConnectionProfile(loadConnectionProfiles());
}

export function setActiveParlorConnectionProfileId(id: string): ConnectionProfilesFile {
    const next = setActiveConnectionProfileId(loadConnectionProfiles(), id);
    saveConnectionProfiles(next);
    return next;
}