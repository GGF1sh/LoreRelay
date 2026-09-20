/** Optional ComfyUI map LoRAs — recommendations only; never auto-applied. Set TA_LORA manually to try. */

export interface CartographyLoraPreset {
    id: string;
    name: string;
    /** Suggested safetensors filename under ComfyUI models/loras */
    loraFileHint: string;
    weight: number;
    civitaiUrl: string;
    /** Theme substrings that pair well (empty = any). */
    themeHints: string[];
    triggerWords: string;
    notes: string;
}

/** Verified Civitai candidates for Illustrious XL / SDXL + Canny. Use IL variant with Illustrious checkpoints. */
export const CARTOGRAPHY_LORA_PRESETS: readonly CartographyLoraPreset[] = [
    {
        id: 'mapcraft-illustrious',
        name: 'Mapcraft: TTRPG Mapmaker (Illustrious v1)',
        loraFileHint: 'mapcraft_il_v1.safetensors',
        weight: 0.45,
        civitaiUrl: 'https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker',
        themeHints: ['fantasy', 'beginner', 'postapoc', 'zombie', 'scifi', 'cyber', 'modern'],
        triggerWords: 'mapcraft, battle map, top-down view, from above, no humans',
        notes: 'Default for LoreRelay SDXL Canny cartography. Pair with Illustrious XL checkpoint. Weight ≤0.5, ControlNet 0.88–0.92.',
    },
    {
        id: 'mapcraft-anima',
        name: 'Mapcraft: TTRPG Mapmaker (Anima v1)',
        loraFileHint: 'mapcraft_anima_v1.safetensors',
        weight: 0.45,
        civitaiUrl: 'https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker',
        themeHints: [],
        triggerWords: 'mapcraft, battle map, top-down view, from above, no humans',
        notes: 'Anima checkpoint only (e.g. matureritualANIMA_test011). Not for Illustrious XL. SDXL Canny workflow may need manual tuning.',
    },
    {
        id: 'topdown-scifi',
        name: 'Topdown Map Assets — Sci-Fi',
        loraFileHint: 'Topdown_Map_Assets_SciFi.safetensors',
        weight: 0.5,
        civitaiUrl: 'https://civitai.com/models/815019/topdown-map-assets-sci-fi',
        themeHints: ['cyber', 'scifi', 'sci-fi'],
        triggerWords: 'top down from above, sci-fi tactical map',
        notes: 'Cyberpunk / colony sector maps. May need lower weight on Illustrious.',
    },
    {
        id: 'fantasy-map-heavy',
        name: 'Fantasy Map — Heavy',
        loraFileHint: 'Fantasy_Map_Heavy.safetensors',
        weight: 0.55,
        civitaiUrl: 'https://civitai.com/models/382959/fantasy-map',
        themeHints: ['fantasy', 'postapoc', 'wasteland', 'zombie'],
        triggerWords: 'fantasy map, top-down, overworld',
        notes: 'Hand-painted fantasy; good for post-apoc/zombie via prompt, not dedicated horror.',
    },
    {
        id: 'dnd-battlemaps',
        name: 'DnD Battlemaps Generator',
        loraFileHint: 'DnD_Battlemaps_Generator.safetensors',
        weight: 0.65,
        civitaiUrl: 'https://civitai.com/models/2164519/dnd-battlemaps-generator',
        themeHints: [],
        triggerWords: 'top-down view, battle map, tactical map',
        notes: 'Tactical zone maps; strong top-down. Alternative to Mapcraft for dungeon-scale feel.',
    },
    {
        id: 'large-fantasy-city',
        name: 'LargeFantasyCityMap',
        loraFileHint: 'LargeFantasyCityMap.safetensors',
        weight: 0.7,
        civitaiUrl: 'https://civitai.com/models/694762/largefantasycitymap',
        themeHints: ['urban', 'city'],
        triggerWords: 'fantasy city map, top-down, large scale urban',
        notes: 'Large urban overworld maps; higher weight may fight ControlNet — start at 0.6.',
    },
    {
        id: 'stylized-isometric-modern',
        name: 'Stylized Setting (Isometric)',
        loraFileHint: 'Stylized_Setting_Isometric.safetensors',
        weight: 0.6,
        civitaiUrl: 'https://civitai.com/models/118775/stylized-setting-isometric-sdxl-and-sd15',
        themeHints: ['modern'],
        triggerWords: 'top-down urban grid, city block map, roads and highways',
        notes: 'Modern urban blocks; isometric bias — reinforce top-down in prompt.',
    },
] as const;

export function suggestCartographyLoraPreset(theme?: string): CartographyLoraPreset {
    const key = (theme ?? 'fantasy').toLowerCase().replace(/[\s_]+/g, '-');
    for (const preset of CARTOGRAPHY_LORA_PRESETS) {
        if (preset.themeHints.some((hint) => key.includes(hint))) {
            return preset;
        }
    }
    return CARTOGRAPHY_LORA_PRESETS[0];
}

export function formatCartographyLoraPresetHint(preset: CartographyLoraPreset): string {
    return (
        `Suggested LoRA preset: ${preset.name} — ` +
        `TA_LORA=${preset.loraFileHint} TA_LORA_WEIGHT=${preset.weight} ` +
        `(${preset.civitaiUrl})`
    );
}