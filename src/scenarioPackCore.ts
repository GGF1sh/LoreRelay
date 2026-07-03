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
