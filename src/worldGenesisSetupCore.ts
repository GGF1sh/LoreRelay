import {
    canonicalContentOf,
    getPreset,
    listPublishedGenreWorldPresets,
    reproductionAvailabilityOf,
    resolveGeneratorThemeForPreset,
    resolvePresetId,
} from './genreWorldPresetCore';
import type { GenreWorldPreset, WorldReproductionUnavailableReason } from './genreWorldPresetCore';
import { isValidEventId } from './worldEventLogCore';
import type { RegionType, WorldForge } from './worldForgeCore';
import {
    generateWorldForge,
    type WorldForgeGeneratorInput,
} from './worldForgeGeneratorCore';
import {
    clampWorldGenCount,
    normalizeWorldForgeSeed,
} from './webviewHandlersCore';

export interface WorldGenesisDefaults {
    regionCount: number;
    factionCount: number;
    npcCount: number;
}

export interface WorldGenesisDraft {
    presetId?: unknown;
    presetVersion?: unknown;
    seed?: unknown;
    regionCount?: unknown;
    factionCount?: unknown;
    npcCount?: unknown;
}

export interface NormalizedWorldGenesisInput extends WorldForgeGeneratorInput {
    presetId: string;
    presetVersion: number;
}

export type NormalizeWorldGenesisResult =
    | { ok: true; input: NormalizedWorldGenesisInput }
    | {
        ok: false;
        reason: 'invalid-seed' | 'invalid-preset' | 'preset-version-unavailable' | 'preset-not-published' | 'theme-unavailable';
      };

export interface WorldGenesisPreviewSummary {
    worldName: string;
    presetId: string;
    presetVersion: number;
    seed: string;
    regionCount: number;
    regionComposition: Array<{ type: RegionType; count: number }>;
    locationCount: number;
    factionCount: number;
    npcCount: number;
    sampleRegionNames: string[];
    warnings: string[];
}

export interface WorldGenesisPreviewSession {
    input: NormalizedWorldGenesisInput;
    inputKey: string;
    canonicalContent: WorldForge;
    summary: WorldGenesisPreviewSummary;
}

export interface WorldGenesisPrefill {
    presetId?: string;
    presetVersion?: number;
    seed: string;
    regionCount: number;
    factionCount: number;
    npcCount: number;
    warning?: WorldReproductionUnavailableReason | 'legacy-defaults';
}

export interface ApplyWorldGenesisDeps {
    hasExistingCampaign(): boolean;
    confirmOverwrite(): Promise<boolean>;
    save(
        input: NormalizedWorldGenesisInput,
        expectedCanonicalContent: WorldForge
    ): Promise<{ success: boolean; warnings: string[]; error?: string }>;
    loadSavedForge(): WorldForge | undefined;
    onApplied(forge: WorldForge, isOverwrite: boolean): void | Promise<void>;
}

export type ApplyWorldGenesisResult =
    | { status: 'applied'; forge: WorldForge; warnings: string[] }
    | { status: 'canceled' }
    | { status: 'failed'; error: string };

function normalizedDefaults(defaults: WorldGenesisDefaults): WorldGenesisDefaults {
    return {
        regionCount: clampWorldGenCount(defaults.regionCount, 3, 12, 5),
        factionCount: clampWorldGenCount(defaults.factionCount, 2, 6, 3),
        npcCount: clampWorldGenCount(defaults.npcCount, 2, 20, 6),
    };
}

export function getPublishedWorldGenesisPresets(): readonly GenreWorldPreset[] {
    return listPublishedGenreWorldPresets();
}

export function createWorldGenesisSeed(
    now = Date.now(),
    entropy = Math.floor(Math.random() * 0xffffffff).toString(36)
): string {
    const safeEntropy = entropy.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'seed';
    return `genesis-${Math.max(0, Math.floor(now)).toString(36)}-${safeEntropy}`.slice(0, 64);
}

export function normalizeWorldGenesisInput(
    draft: WorldGenesisDraft,
    defaults: WorldGenesisDefaults
): NormalizeWorldGenesisResult {
    const seed = normalizeWorldForgeSeed(draft.seed);
    if (!seed || !isValidEventId(seed)) {
        return { ok: false, reason: 'invalid-seed' };
    }

    const presetId = typeof draft.presetId === 'string' ? draft.presetId.trim() : '';
    const presetVersion = typeof draft.presetVersion === 'number' && Number.isInteger(draft.presetVersion)
        ? draft.presetVersion
        : undefined;
    if (!presetId || presetVersion === undefined || presetVersion < 1) {
        return { ok: false, reason: 'invalid-preset' };
    }

    const preset = getPreset(presetId, presetVersion);
    if (!preset) {
        return { ok: false, reason: 'preset-version-unavailable' };
    }
    if (preset.status !== 'published') {
        return { ok: false, reason: 'preset-not-published' };
    }

    const theme = resolveGeneratorThemeForPreset(presetId, presetVersion);
    if (!theme) {
        return { ok: false, reason: 'theme-unavailable' };
    }

    const safeDefaults = normalizedDefaults(defaults);
    return {
        ok: true,
        input: {
            worldSeed: seed,
            theme,
            presetId,
            presetVersion,
            regionCount: clampWorldGenCount(draft.regionCount, 3, 12, safeDefaults.regionCount),
            factionCount: clampWorldGenCount(draft.factionCount, 2, 6, safeDefaults.factionCount),
            npcCount: clampWorldGenCount(draft.npcCount, 2, 20, safeDefaults.npcCount),
        },
    };
}

export function worldGenesisInputKey(input: NormalizedWorldGenesisInput): string {
    return JSON.stringify({
        presetId: input.presetId,
        presetVersion: input.presetVersion,
        worldSeed: input.worldSeed,
        theme: input.theme,
        regionCount: input.regionCount,
        factionCount: input.factionCount,
        npcCount: input.npcCount,
    });
}

function canonicalContentMatches(left: WorldForge, right: WorldForge): boolean {
    return stableJsonStringify(left) === stableJsonStringify(right);
}

/** JSON-semantic comparison: object key order and undefined-only fields are not content. */
function stableJsonStringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue: unknown) => {
        if (!nestedValue || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) {
            return nestedValue;
        }
        return Object.fromEntries(
            Object.entries(nestedValue as Record<string, unknown>)
                .filter(([, entryValue]) => entryValue !== undefined)
                .sort(([leftKey], [rightKey]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0)
        );
    });
}

export function previewWorldGenesis(input: NormalizedWorldGenesisInput): WorldGenesisPreviewSession {
    const generated = generateWorldForge(input);
    const composition = new Map<RegionType, number>();
    for (const region of generated.forge.geography.regions) {
        composition.set(region.type, (composition.get(region.type) ?? 0) + 1);
    }
    const canonicalContent = canonicalContentOf(generated.forge);
    return {
        input: { ...input },
        inputKey: worldGenesisInputKey(input),
        canonicalContent,
        summary: {
            worldName: generated.forge.meta.worldName,
            presetId: input.presetId,
            presetVersion: input.presetVersion,
            seed: input.worldSeed,
            regionCount: generated.forge.geography.regions.length,
            regionComposition: [...composition.entries()]
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => a.type.localeCompare(b.type)),
            locationCount: generated.forge.geography.locations.length,
            factionCount: generated.forge.factions.length,
            npcCount: generated.forge.initialNpcs.length,
            sampleRegionNames: generated.forge.geography.regions.slice(0, 4).map(region => region.name),
            warnings: [...generated.warnings],
        },
    };
}

export function buildWorldGenesisPrefill(
    forge: WorldForge | undefined,
    defaults: WorldGenesisDefaults,
    fallbackSeed: string
): WorldGenesisPrefill {
    const safeDefaults = normalizedDefaults(defaults);
    const safeFallbackSeed = isValidEventId(normalizeWorldForgeSeed(fallbackSeed))
        ? normalizeWorldForgeSeed(fallbackSeed)
        : createWorldGenesisSeed();
    const defaultResolution = resolvePresetId({ theme: 'default' });
    const defaultPreset = defaultResolution
        ? getPreset(defaultResolution.presetId, defaultResolution.presetVersion)
        : undefined;
    const fallback = (warning?: WorldGenesisPrefill['warning']): WorldGenesisPrefill => ({
        presetId: warning === 'preset-version-unavailable' || warning === 'preset-not-published'
            ? undefined
            : defaultPreset?.presetId,
        presetVersion: warning === 'preset-version-unavailable' || warning === 'preset-not-published'
            ? undefined
            : defaultPreset?.presetVersion,
        seed: forge?.meta.worldSeed && isValidEventId(forge.meta.worldSeed)
            ? forge.meta.worldSeed
            : safeFallbackSeed,
        ...safeDefaults,
        ...(warning ? { warning } : {}),
    });

    if (!forge) { return fallback(); }
    const availability = reproductionAvailabilityOf(forge);
    if (!availability.available) {
        if (availability.reason === 'missing-provenance') {
            return fallback('legacy-defaults');
        }
        return fallback(availability.reason);
    }
    return {
        presetId: availability.preset.presetId,
        presetVersion: availability.preset.presetVersion,
        seed: forge.meta.worldSeed!,
        regionCount: availability.provenance.regionCount,
        factionCount: availability.provenance.factionCount,
        npcCount: availability.provenance.npcCount,
    };
}

/**
 * High-risk commit gate. It verifies the current pure result before confirmation,
 * performs no writes on cancel, and compares the saved canonical world afterward.
 */
export async function applyWorldGenesisPreview(
    input: NormalizedWorldGenesisInput,
    preview: WorldGenesisPreviewSession | undefined,
    deps: ApplyWorldGenesisDeps
): Promise<ApplyWorldGenesisResult> {
    if (!preview || preview.inputKey !== worldGenesisInputKey(input)) {
        return { status: 'failed', error: 'preview-required' };
    }
    const verification = previewWorldGenesis(input);
    if (!canonicalContentMatches(verification.canonicalContent, preview.canonicalContent)) {
        return { status: 'failed', error: 'preview-parity-failed' };
    }

    const isOverwrite = deps.hasExistingCampaign();
    if (isOverwrite && !await deps.confirmOverwrite()) {
        return { status: 'canceled' };
    }

    const saved = await deps.save(input, preview.canonicalContent);
    if (!saved.success) {
        return { status: 'failed', error: saved.error ?? 'save-failed' };
    }
    const forge = deps.loadSavedForge();
    if (!forge) {
        return { status: 'failed', error: 'saved-world-unavailable' };
    }
    if (!canonicalContentMatches(canonicalContentOf(forge), preview.canonicalContent)) {
        return { status: 'failed', error: 'saved-preview-parity-failed' };
    }
    await deps.onApplied(forge, isOverwrite);
    return { status: 'applied', forge, warnings: saved.warnings };
}
