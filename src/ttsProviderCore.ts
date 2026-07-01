import type { NpcMood, NpcRegistry } from './npcRegistryCore';
import {
    clampVoicePitch,
    clampVoiceRate,
    clampVoiceVolume,
    normalizeDispositionMood,
    type NpcVoiceProfile,
    type TtsProviderKind,
    applyMoodModifiers,
} from './npcVoiceCore';

export const MAX_TTS_TEXT_LEN = 4000;

const LOCALE_TO_BCP47: Record<string, string> = {
    ja: 'ja-JP',
    en: 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
};

export interface TtsSpeakRequest {
    text: string;
    locale: string;
    globalSpeed: number;
    globalVolume: number;
    voiceProfile?: NpcVoiceProfile;
    dispositionMood?: NpcMood;
}

export interface ResolvedTtsPlan {
    provider: TtsProviderKind;
    text: string;
    lang: string;
    rate: number;
    volume: number;
    pitch: number;
    voiceId?: string;
    blockedReason?: string;
    fallbackFrom?: TtsProviderKind;
}

export interface NpcTtsCatalogEntry {
    id: string;
    name: string;
    locationId?: string;
    mood: NpcMood;
    voice: NpcVoiceProfile;
}

export function localeToBcp47(locale: string): string {
    const key = (locale || 'en').trim();
    return LOCALE_TO_BCP47[key] ?? LOCALE_TO_BCP47.en;
}

export function clampTtsText(text: string): string {
    if (typeof text !== 'string') { return ''; }
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_TEXT_LEN);
}

export function resolveTtsPlan(
    request: TtsSpeakRequest,
    options: { externalEnabled?: boolean } = {}
): ResolvedTtsPlan {
    const text = clampTtsText(request.text);
    if (!text) {
        return {
            provider: 'system',
            text: '',
            lang: localeToBcp47(request.locale),
            rate: 1,
            volume: 1,
            pitch: 0,
            blockedReason: 'empty text',
        };
    }

    const profile = request.voiceProfile;
    let provider: TtsProviderKind = profile?.provider ?? 'system';
    let fallbackFrom: TtsProviderKind | undefined;

    if (provider === 'external' && !options.externalEnabled) {
        fallbackFrom = 'external';
        provider = 'system';
    }
    if (provider === 'local') {
        fallbackFrom = 'local';
        provider = 'system';
    }

    const globalSpeed = clampVoiceRate(request.globalSpeed);
    const globalVolume = clampVoiceVolume(request.globalVolume);

    let rate = globalSpeed * (profile?.rate !== undefined ? clampVoiceRate(profile.rate) : 1);
    let volume = globalVolume * (profile?.volume !== undefined ? clampVoiceVolume(profile.volume) : 1);
    let pitch = profile?.pitch !== undefined ? clampVoicePitch(profile.pitch) : 0;

    const mood = normalizeDispositionMood(request.dispositionMood);
    if (profile?.moodAdaptive) {
        const adjusted = applyMoodModifiers(rate, pitch, mood);
        rate = adjusted.rate;
        pitch = adjusted.pitch;
    }

    const lang = profile?.lang?.trim() || localeToBcp47(request.locale);

    return {
        provider,
        text,
        lang,
        rate: clampVoiceRate(rate),
        volume: clampVoiceVolume(volume),
        pitch: clampVoicePitch(pitch),
        voiceId: profile?.voiceId,
        fallbackFrom,
    };
}

export function buildNpcTtsCatalog(registry: NpcRegistry): NpcTtsCatalogEntry[] {
    const entries: NpcTtsCatalogEntry[] = [];
    for (const [id, npc] of Object.entries(registry.npcs)) {
        if (!npc.voice) { continue; }
        entries.push({
            id,
            name: npc.name,
            locationId: npc.locationId,
            mood: npc.disposition.mood,
            voice: npc.voice,
        });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Best-effort NPC voice lookup for chat entry attribution.
 * Returns undefined when ambiguous (duplicate names) or no match.
 */
export function findNpcVoiceForSender(
    catalog: readonly NpcTtsCatalogEntry[],
    sender: string | undefined,
    currentLocationId: string | null | undefined,
    speakerNpcId?: string
): NpcTtsCatalogEntry | undefined {
    if (speakerNpcId) {
        const byId = catalog.find((e) => e.id === speakerNpcId);
        if (byId) { return byId; }
    }

    const name = (sender || '').trim();
    if (!name) { return undefined; }

    const lower = name.toLowerCase();
    const matches = catalog.filter((e) => e.name.toLowerCase() === lower);
    if (matches.length === 0) { return undefined; }
    if (matches.length === 1) { return matches[0]; }

    if (currentLocationId) {
        const atLoc = matches.filter((e) => e.locationId === currentLocationId);
        if (atLoc.length === 1) { return atLoc[0]; }
    }

    return undefined;
}

export function countNpcVoices(registry: NpcRegistry): number {
    return Object.values(registry.npcs).filter((n) => n.voice).length;
}