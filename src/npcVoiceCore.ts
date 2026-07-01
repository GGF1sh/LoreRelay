import type { NpcMood } from './npcRegistryCore';

export type TtsProviderKind = 'system' | 'local' | 'external';

export interface NpcVoiceProfile {
    provider?: TtsProviderKind;
    voiceId?: string;
    lang?: string;
    rate?: number;
    volume?: number;
    pitch?: number;
    moodAdaptive?: boolean;
    label?: string;
}

const VALID_PROVIDERS = new Set<TtsProviderKind>(['system', 'local', 'external']);

export function isValidTtsProviderKind(v: unknown): v is TtsProviderKind {
    return typeof v === 'string' && VALID_PROVIDERS.has(v as TtsProviderKind);
}

export function clampVoiceRate(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 1.0; }
    return Math.max(0.5, Math.min(2.0, v));
}

export function clampVoiceVolume(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 1.0; }
    return Math.max(0, Math.min(1, v));
}

export function clampVoicePitch(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 0; }
    return Math.max(-1, Math.min(1, v));
}

export function sanitizeVoiceId(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const trimmed = v.trim().slice(0, 120);
    if (!trimmed || /[\\/]|\x00|\x1f/.test(trimmed)) { return undefined; }
    return trimmed;
}

export function sanitizeVoiceLang(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const trimmed = v.trim().slice(0, 16);
    return trimmed || undefined;
}

export function sanitizeVoiceLabel(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const trimmed = v.trim().slice(0, 40);
    return trimmed || undefined;
}

export function parseNpcVoiceProfile(raw: unknown): NpcVoiceProfile | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const profile: NpcVoiceProfile = {};

    const provider = typeof r.provider === 'string' ? r.provider.trim() : '';
    profile.provider = isValidTtsProviderKind(provider) ? provider : 'system';

    const voiceId = sanitizeVoiceId(r.voiceId);
    if (voiceId) { profile.voiceId = voiceId; }

    const lang = sanitizeVoiceLang(r.lang);
    if (lang) { profile.lang = lang; }

    if (r.rate !== undefined) { profile.rate = clampVoiceRate(r.rate); }
    if (r.volume !== undefined) { profile.volume = clampVoiceVolume(r.volume); }
    if (r.pitch !== undefined) { profile.pitch = clampVoicePitch(r.pitch); }
    if (r.moodAdaptive === true) { profile.moodAdaptive = true; }

    const label = sanitizeVoiceLabel(r.label);
    if (label) { profile.label = label; }

    if (
        profile.provider === 'system' &&
        !profile.voiceId &&
        !profile.lang &&
        profile.rate === undefined &&
        profile.volume === undefined &&
        profile.pitch === undefined &&
        !profile.moodAdaptive &&
        !profile.label
    ) {
        return undefined;
    }

    return profile;
}

const MOOD_MODIFIERS: Record<NpcMood, { rateDelta: number; pitchDelta: number }> = {
    excited: { rateDelta: 0.18, pitchDelta: 0.15 },
    angry: { rateDelta: 0.12, pitchDelta: 0.05 },
    fearful: { rateDelta: 0.15, pitchDelta: 0.12 },
    happy: { rateDelta: 0.08, pitchDelta: 0.10 },
    neutral: { rateDelta: 0, pitchDelta: 0 },
    worried: { rateDelta: -0.05, pitchDelta: -0.05 },
    sad: { rateDelta: -0.15, pitchDelta: -0.10 },
};

export function applyMoodModifiers(rate: number, pitch: number, mood: NpcMood): { rate: number; pitch: number } {
    const mod = MOOD_MODIFIERS[mood] ?? MOOD_MODIFIERS.neutral;
    return {
        rate: clampVoiceRate(rate + mod.rateDelta),
        pitch: clampVoicePitch(pitch + mod.pitchDelta),
    };
}

export function normalizeDispositionMood(mood: unknown): NpcMood {
    if (typeof mood === 'string' && mood in MOOD_MODIFIERS) {
        return mood as NpcMood;
    }
    return 'neutral';
}