// Pure helpers for bundled scenario packs (no vscode dependency).

import * as fs from 'fs';
import * as path from 'path';

/** Bundled sample packs shipped inside the extension (sample-scenarios/). */
export const BUNDLED_SAMPLE_IDS = [
    'harbor-mist',
    'lost-catacombs',
    'neon-rain',
    'debug-sandbox',
    'trade-routes',
    'scrapbound-settlement',
] as const;
export type BundledSampleId = (typeof BUNDLED_SAMPLE_IDS)[number];

export const OPTIONAL_PACK_FILES = [
    'world_forge.json',
    'world_state.json',
    'npc_registry.json',
    'world_map.layout.png',
    'game_rules.json',
    'campaign_kit.json',
    'discoveries.json',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => cloneJsonValue(entry)) as T;
    }
    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            out[key] = cloneJsonValue(entry);
        }
        return out as T;
    }
    return value;
}

function mergeScenarioRecords(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const prev = out[key];
        out[key] = isPlainObject(prev) && isPlainObject(value)
            ? mergeScenarioRecords(prev, value)
            : cloneJsonValue(value);
    }
    return out;
}

/**
 * Apply an optional locale overlay embedded inside scenario.json.
 * The returned document is safe to write back as the workspace-local canonical copy.
 */
export function applyScenarioLocaleOverlay(
    scenario: Record<string, unknown>,
    locale: string
): Record<string, unknown> {
    const localized = cloneJsonValue(scenario);
    const localeTable = isPlainObject(localized.locales)
        ? localized.locales as Record<string, unknown>
        : undefined;
    delete localized.locales;
    if (!localeTable) {
        return localized;
    }

    const key = String(locale || '').trim();
    const overlay = isPlainObject(localeTable[key]) ? localeTable[key] as Record<string, unknown> : undefined;
    if (!overlay) {
        return localized;
    }
    return mergeScenarioRecords(localized, overlay);
}

/** Resolve a bundled sample directory (dev checkout or packaged extension root). */
export function resolveBundledSampleDir(sampleId: string, extRoot?: string): string | undefined {
    if (!BUNDLED_SAMPLE_IDS.includes(sampleId as BundledSampleId)) {
        return undefined;
    }
    const candidates = [
        extRoot ? path.join(extRoot, 'sample-scenarios', sampleId) : undefined,
        path.join(__dirname, '..', 'sample-scenarios', sampleId),
        path.join('C:', 'AI', 'text-adventure-vsce', 'sample-scenarios', sampleId),
    ].filter((p): p is string => Boolean(p));
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'scenario.json'))) {
            return dir;
        }
    }
    return undefined;
}
