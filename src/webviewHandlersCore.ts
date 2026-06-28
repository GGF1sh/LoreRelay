/** Pure validation helpers for webview postMessage routing (no vscode imports). */

export const MAX_WORLD_FORGE_SEED_LEN = 64;
export const MAX_WORLD_FORGE_THEME_LEN = 32;
export const MAX_CHECKPOINT_LABEL_LEN = 200;
export const MAX_EDIT_ENTRY_LEN = 20_000;
export const MAX_EQUIPMENT_FIELD_LEN = 100;
export const MAX_IMAGE_PROMPT_LEN = 2000;

export const ALLOWED_WORLD_FORGE_THEMES = new Set([
    'dungeon-crawler',
    'dark-fantasy',
    'cyberpunk',
    'default'
]);

export const ALLOWED_MERMAID_TARGETS = new Set(['questFlow', 'relations']);

export const ALLOWED_MEMORY_BACKENDS = new Set(['tfidf', 'chromadb', 'auto']);

export function clampString(value: unknown, maxLen: number): string {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, maxLen);
}

export function normalizeWorldForgeSeed(value: unknown): string {
    return clampString(value, MAX_WORLD_FORGE_SEED_LEN);
}

export function normalizeWorldForgeTheme(value: unknown): string {
    const theme = clampString(value, MAX_WORLD_FORGE_THEME_LEN) || 'default';
    return ALLOWED_WORLD_FORGE_THEMES.has(theme) ? theme : 'default';
}

export function normalizeMermaidTarget(value: unknown): string {
    const target = clampString(value, 64);
    return ALLOWED_MERMAID_TARGETS.has(target) ? target : 'questFlow';
}

export function normalizeMemoryBackend(value: unknown): string | undefined {
    const backend = clampString(value, 32).toLowerCase();
    return ALLOWED_MEMORY_BACKENDS.has(backend) ? backend : undefined;
}

export function sanitizeEquipmentNotifyFields(message: Record<string, unknown>): {
    name: string;
    weapon: string;
    armor: string;
    accessory: string;
} {
    return {
        name: clampString(message.name, MAX_EQUIPMENT_FIELD_LEN) || 'Character',
        weapon: clampString(message.weapon, MAX_EQUIPMENT_FIELD_LEN),
        armor: clampString(message.armor, MAX_EQUIPMENT_FIELD_LEN),
        accessory: clampString(message.accessory, MAX_EQUIPMENT_FIELD_LEN)
    };
}