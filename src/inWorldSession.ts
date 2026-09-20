import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { INWORLD_SESSION_FILENAME } from './experienceCore';
import {
    ParlorMessage,
    ParlorSession,
    appendParlorMessage,
    createEmptyParlorSession,
    parseParlorSession,
} from './parlorSessionCore';
import { compactParlorSessionWithArchive } from './parlorArchive';

function resolveInWorldSessionPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, INWORLD_SESSION_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function loadInWorldSession(fallbackCharacterId: string): ParlorSession | undefined {
    const filePath = resolveInWorldSessionPath();
    if (!filePath || !fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return parseParlorSession(raw, fallbackCharacterId);
    } catch (err) {
        console.error('[LoreRelay] Failed to load inworld_session.json', err);
        return undefined;
    }
}

export function saveInWorldSession(session: ParlorSession, characterName = 'Character', locale = 'en'): void {
    const filePath = resolveInWorldSessionPath();
    if (!filePath) {
        throw new Error('Workspace required for inworld_session.json');
    }
    const compacted = compactParlorSessionWithArchive(session, characterName, locale);
    writeJsonAtomic(filePath, compacted);
}

export function getOrCreateInWorldSession(activeCharacterId: string): ParlorSession {
    const existing = loadInWorldSession(activeCharacterId);
    if (existing) {
        return existing;
    }
    const session = createEmptyParlorSession(activeCharacterId);
    saveInWorldSession(session);
    return session;
}

export function appendAndSaveInWorldMessage(
    session: ParlorSession,
    message: Omit<ParlorMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
    characterName = 'Character',
    locale = 'en'
): ParlorSession {
    const next = appendParlorMessage(session, message);
    saveInWorldSession(next, characterName, locale);
    return next;
}
