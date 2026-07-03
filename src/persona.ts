import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    DEFAULT_PLAYER_PERSONA,
    PERSONA_FILENAME,
    PlayerPersona,
    parsePlayerPersona,
} from './personaCore';

function resolvePersonaPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, PERSONA_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function loadPlayerPersona(): PlayerPersona {
    const filePath = resolvePersonaPath();
    if (!filePath || !fs.existsSync(filePath)) {
        return { ...DEFAULT_PLAYER_PERSONA };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return parsePlayerPersona(raw);
    } catch (err) {
        console.error('[LoreRelay] Failed to load persona.json', err);
        return { ...DEFAULT_PLAYER_PERSONA };
    }
}

export function savePlayerPersona(persona: PlayerPersona): void {
    const filePath = resolvePersonaPath();
    if (!filePath) {
        throw new Error('Workspace required for persona.json');
    }
    writeJsonAtomic(filePath, parsePlayerPersona(persona));
}