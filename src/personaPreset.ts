import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { parsePlayerPersona, type PlayerPersona } from './personaCore';
import {
    chooseAvailablePersonaPresetId,
    isValidPersonaPresetId,
    parsePlayerPersonaPreset,
    PERSONA_PRESETS_DIRNAME,
    type PlayerPersonaPreset,
} from './personaPresetCore';

function resolvePresetDirectory(workspacePath = getWorkspacePath()): string | undefined {
    if (!workspacePath) return undefined;
    const base = path.resolve(workspacePath);
    const resolved = path.resolve(base, PERSONA_PRESETS_DIRNAME);
    return resolved.startsWith(base + path.sep) ? resolved : undefined;
}

function resolvePresetPath(id: string, workspacePath?: string): string | undefined {
    if (!isValidPersonaPresetId(id)) return undefined;
    const dir = resolvePresetDirectory(workspacePath);
    if (!dir) return undefined;
    const resolved = path.resolve(dir, `${id}.json`);
    return resolved.startsWith(dir + path.sep) ? resolved : undefined;
}

export function listPlayerPersonaPresets(workspacePath?: string): PlayerPersonaPreset[] {
    const dir = resolvePresetDirectory(workspacePath);
    if (!dir || !fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir)
            .filter((file) => /^[a-z0-9][a-z0-9_-]{0,63}\.json$/i.test(file))
            .flatMap((file) => {
                try {
                    return [parsePlayerPersonaPreset(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')))].filter(Boolean) as PlayerPersonaPreset[];
                } catch {
                    return [];
                }
            })
            .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id));
    } catch {
        return [];
    }
}

export function getPlayerPersonaPreset(id: string, workspacePath?: string): PlayerPersonaPreset | undefined {
    const filePath = resolvePresetPath(id, workspacePath);
    if (!filePath || !fs.existsSync(filePath)) return undefined;
    try {
        return parsePlayerPersonaPreset(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch {
        return undefined;
    }
}

function buildPreset(id: string, persona: PlayerPersona, meta?: PlayerPersonaPreset['meta']): PlayerPersonaPreset {
    const next: PlayerPersonaPreset = { ...parsePlayerPersona(persona), version: 1, id };
    if (meta) next.meta = meta;
    return next;
}

export function createPlayerPersonaPreset(
    persona: PlayerPersona,
    meta?: PlayerPersonaPreset['meta'],
    workspacePath?: string
): PlayerPersonaPreset {
    const dir = resolvePresetDirectory(workspacePath);
    if (!dir) throw new Error('Workspace required for Persona presets');
    const id = chooseAvailablePersonaPresetId(persona.name, listPlayerPersonaPresets(workspacePath).map((preset) => preset.id));
    const filePath = resolvePresetPath(id, workspacePath);
    if (!filePath || fs.existsSync(filePath)) throw new Error('Persona preset ID collision');
    const preset = buildPreset(id, persona, meta);
    writeJsonAtomic(filePath, preset);
    return preset;
}

export function updatePlayerPersonaPreset(
    id: string,
    persona: PlayerPersona,
    workspacePath?: string
): PlayerPersonaPreset {
    const previous = getPlayerPersonaPreset(id, workspacePath);
    const filePath = resolvePresetPath(id, workspacePath);
    if (!previous || !filePath) throw new Error('Persona preset not found');
    const preset = buildPreset(id, persona, previous.meta);
    writeJsonAtomic(filePath, preset);
    return preset;
}

export function removeNewPlayerPersonaPreset(id: string, workspacePath?: string): void {
    const filePath = resolvePresetPath(id, workspacePath);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
