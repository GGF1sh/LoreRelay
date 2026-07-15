import { parsePlayerPersona, type PlayerPersona } from './personaCore';

export const PERSONA_PRESETS_DIRNAME = 'personas';
export const MAX_PERSONA_PRESET_ID_CHARS = 64;

export interface PlayerPersonaPreset {
    version: 1;
    id: string;
    name?: string;
    description?: string;
    speakingStyle?: string;
    meta?: {
        source?: 'manual' | 'persona-json' | 'character-copy';
        sourceLabel?: string;
        sourceCharacterId?: string;
    };
}

export function parsePersonaPresetMeta(raw: unknown): PlayerPersonaPreset['meta'] | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const metaValue = raw as Record<string, unknown>;
    const source = metaValue.source;
    const meta: NonNullable<PlayerPersonaPreset['meta']> = {};
    if (source === 'manual' || source === 'persona-json' || source === 'character-copy') meta.source = source;
    const sourceLabel = clampMetaText(metaValue.sourceLabel, 120);
    if (sourceLabel) meta.sourceLabel = sourceLabel;
    if (typeof metaValue.sourceCharacterId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(metaValue.sourceCharacterId)) {
        meta.sourceCharacterId = metaValue.sourceCharacterId;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
}

export function isValidPersonaPresetId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
}

export function normalizePersonaPresetId(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const normalized = raw
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/[-_]{2,}/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, MAX_PERSONA_PRESET_ID_CHARS)
        .replace(/[-_]+$/g, '');
    return normalized || 'persona';
}

export function chooseAvailablePersonaPresetId(
    preferredName: unknown,
    existingIds: readonly string[]
): string {
    const taken = new Set(existingIds.filter(isValidPersonaPresetId));
    const base = normalizePersonaPresetId(preferredName);
    if (!taken.has(base)) return base;
    for (let suffix = 2; suffix < 10_000; suffix++) {
        const tail = `-${suffix}`;
        const candidate = `${base.slice(0, MAX_PERSONA_PRESET_ID_CHARS - tail.length)}${tail}`;
        if (!taken.has(candidate)) return candidate;
    }
    throw new Error('Unable to allocate a Persona preset ID');
}

function clampMetaText(value: unknown, max: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.trim().slice(0, max);
    return text || undefined;
}

export function parsePlayerPersonaPreset(raw: unknown): PlayerPersonaPreset | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    if (value.version !== 1 || !isValidPersonaPresetId(value.id)) return undefined;
    const persona = parsePlayerPersona(value);
    const preset: PlayerPersonaPreset = { ...persona, version: 1, id: value.id };
    const meta = parsePersonaPresetMeta(value.meta);
    if (meta) preset.meta = meta;
    return preset;
}

export function personaFromPreset(preset: PlayerPersonaPreset): PlayerPersona {
    return parsePlayerPersona(preset);
}

export function mapCharacterToPlayerPersona(character: { name?: unknown; description?: unknown; personality?: unknown }): PlayerPersona {
    return parsePlayerPersona({
        name: character.name,
        description: character.description,
        speakingStyle: character.personality,
    });
}

export function parsePersonaJsonImport(raw: unknown): { persona?: PlayerPersona; ignoredFields: string[] } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ignoredFields: [] };
    }
    const value = raw as Record<string, unknown>;
    const allowed = new Set(['name', 'description', 'speakingStyle']);
    const ignoredFields = Object.keys(value).filter((key) => !allowed.has(key)).slice(0, 20);
    const persona = parsePlayerPersona(value);
    if (!persona.name && !persona.description && !persona.speakingStyle) {
        return { ignoredFields };
    }
    return { persona, ignoredFields };
}
