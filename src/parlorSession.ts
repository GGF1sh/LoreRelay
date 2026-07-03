import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { PARLOR_SESSION_FILENAME } from './experienceCore';
import {
    ParlorMessage,
    ParlorSession,
    appendParlorMessage,
    createEmptyParlorSession,
    parseParlorSession,
} from './parlorSessionCore';

function resolveParlorSessionPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, PARLOR_SESSION_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function loadParlorSession(fallbackCharacterId: string): ParlorSession | undefined {
    const filePath = resolveParlorSessionPath();
    if (!filePath || !fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return parseParlorSession(raw, fallbackCharacterId);
    } catch (err) {
        console.error('[LoreRelay] Failed to load parlor_session.json', err);
        return undefined;
    }
}

export function saveParlorSession(session: ParlorSession): void {
    const filePath = resolveParlorSessionPath();
    if (!filePath) {
        throw new Error('Workspace required for parlor_session.json');
    }
    writeJsonAtomic(filePath, session);
}

export function getOrCreateParlorSession(activeCharacterId: string): ParlorSession {
    const existing = loadParlorSession(activeCharacterId);
    if (existing) {
        return existing;
    }
    const session = createEmptyParlorSession(activeCharacterId);
    saveParlorSession(session);
    return session;
}

export function appendAndSaveParlorMessage(
    session: ParlorSession,
    message: Omit<ParlorMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): ParlorSession {
    const next = appendParlorMessage(session, message);
    saveParlorSession(next);
    return next;
}