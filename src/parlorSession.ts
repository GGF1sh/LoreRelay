import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { PARLOR_SESSION_FILENAME } from './experienceCore';
import {
    ParlorMessage,
    ParlorSession,
    appendParlorMessage,
    createEmptyParlorSession,
    getCharacterParlorSessionFilename,
    legacyParlorSessionBelongsToCharacter,
    parseParlorSession,
} from './parlorSessionCore';
import { compactParlorSessionWithArchive } from './parlorArchive';

function resolveParlorSessionPath(filename: string): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, filename);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

function readParlorSession(filePath: string, fallbackCharacterId: string): ParlorSession | undefined {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return parseParlorSession(raw, fallbackCharacterId);
    } catch (err) {
        console.error('[LoreRelay] Failed to load Parlor session', err);
        return undefined;
    }
}

export function loadParlorSession(fallbackCharacterId: string): ParlorSession | undefined {
    const filename = getCharacterParlorSessionFilename(fallbackCharacterId);
    if (!filename) {
        return undefined;
    }

    const characterPath = resolveParlorSessionPath(filename);
    if (characterPath && fs.existsSync(characterPath)) {
        const session = readParlorSession(characterPath, fallbackCharacterId);
        if (session?.activeCharacterId === fallbackCharacterId) {
            return session;
        }
    }

    // One-time compatibility read for the former shared filename. Never infer
    // its owner from the requested id; that is the cross-character leak.
    const legacyPath = resolveParlorSessionPath(PARLOR_SESSION_FILENAME);
    if (!legacyPath || !fs.existsSync(legacyPath)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
        if (!legacyParlorSessionBelongsToCharacter(raw, fallbackCharacterId)) {
            return undefined;
        }
        const session = parseParlorSession(raw, fallbackCharacterId);
        return session?.activeCharacterId === fallbackCharacterId ? session : undefined;
    } catch (err) {
        console.error('[LoreRelay] Failed to load legacy parlor_session.json', err);
        return undefined;
    }
}

export function saveParlorSession(session: ParlorSession, characterName = 'Character', locale = 'en'): void {
    const filename = getCharacterParlorSessionFilename(session.activeCharacterId);
    const filePath = filename ? resolveParlorSessionPath(filename) : undefined;
    if (!filePath) {
        throw new Error('Workspace and valid character required for Parlor session');
    }
    const compacted = compactParlorSessionWithArchive(session, characterName, locale);
    writeJsonAtomic(filePath, compacted);
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
    message: Omit<ParlorMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
    characterName = 'Character',
    locale = 'en'
): ParlorSession {
    const next = appendParlorMessage(session, message);
    saveParlorSession(next, characterName, locale);
    return next;
}
