/** Pure player persona for Parlor mode prompts. */

export const PERSONA_FILENAME = 'persona.json';
export const MAX_PERSONA_NAME_CHARS = 80;
export const MAX_PERSONA_FIELD_CHARS = 2_000;

export interface PlayerPersona {
    version: 1;
    name?: string;
    description?: string;
    speakingStyle?: string;
}

export const DEFAULT_PLAYER_PERSONA: PlayerPersona = { version: 1 };

function clampPersonaField(text: unknown, max: number): string | undefined {
    if (typeof text !== 'string') {
        return undefined;
    }
    const t = text.trim();
    if (!t) {
        return undefined;
    }
    return t.length <= max ? t : t.slice(0, max);
}

export function parsePlayerPersona(raw: unknown): PlayerPersona {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_PLAYER_PERSONA };
    }
    const o = raw as Record<string, unknown>;
    const out: PlayerPersona = { version: 1 };
    const name = clampPersonaField(o.name, MAX_PERSONA_NAME_CHARS);
    const description = clampPersonaField(o.description, MAX_PERSONA_FIELD_CHARS);
    const speakingStyle = clampPersonaField(o.speakingStyle, MAX_PERSONA_FIELD_CHARS);
    if (name) { out.name = name; }
    if (description) { out.description = description; }
    if (speakingStyle) { out.speakingStyle = speakingStyle; }
    return out;
}

export function buildParlorPersonaContext(persona: PlayerPersona, locale: string): string {
    if (!persona.name && !persona.description && !persona.speakingStyle) {
        return '';
    }
    const lines = [
        '--- BEGIN PLAYER PERSONA (roleplay context only) ---',
    ];
    if (persona.name) {
        lines.push(`${locale === 'ja' ? '名前' : 'Name'}: ${persona.name}`);
    }
    if (persona.description) {
        lines.push(`${locale === 'ja' ? '描写' : 'Description'}: ${persona.description}`);
    }
    if (persona.speakingStyle) {
        lines.push(`${locale === 'ja' ? '話し方' : 'Speaking style'}: ${persona.speakingStyle}`);
    }
    lines.push('--- END PLAYER PERSONA ---');
    return lines.join('\n');
}