// Pure NPC voice profile parsing and mood modifiers — no vscode/fs/DOM imports.
// Phase 11A: persisted on NpcEntry.voice in npc_registry.json.
// See PHASE11_ADAPTIVE_TTS_DESIGN.md §5–6 for schema review and numeric mood table.

import type { NpcMood } from './npcRegistryCore';

/** TTS backend selection. Phase 11A only executes `system`; local/external are deferred to 11B. */
export type TtsProviderKind = 'system' | 'local' | 'external';

/**
 * Optional per-NPC speech settings. Omitted or all-default profiles are dropped at parse time
 * so the registry stays lean (no empty `{}` blocks).
 */
export interface NpcVoiceProfile {
    /** Preferred provider; invalid values coerce to `system`. Default `system`. */
    provider?: TtsProviderKind;
    /**
     * Web Speech API voice URI or name hint.
     * Matched against `speechSynthesis.getVoices()` at speak time (Webview).
     */
    voiceId?: string;
    /** BCP-47 override, e.g. "ja-JP". Falls back to UI locale when unset. */
    lang?: string;
    /** Speech rate multiplier 0.5–2.0 (applied on top of global ttsSpeed in Webview). */
    rate?: number;
    /** Volume multiplier 0–1 (applied on top of global ttsVolume in Webview). */
    volume?: number;
    /** Pitch offset −1–1 (Web Speech API utterance.pitch). */
    pitch?: number;
    /** When true, nudge rate/pitch using disposition.mood via applyMoodModifiers(). */
    moodAdaptive?: boolean;
    /** Short UI label shown on World tab NPC cards (max 40 chars). */
    label?: string;
}

const VALID_PROVIDERS = new Set<TtsProviderKind>(['system', 'local', 'external']);

export function isValidTtsProviderKind(v: unknown): v is TtsProviderKind {
    return typeof v === 'string' && VALID_PROVIDERS.has(v as TtsProviderKind);
}

/** Default 1.0; rejects NaN/Infinity; clamps to [0.5, 2.0]. */
export function clampVoiceRate(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 1.0; }
    return Math.max(0.5, Math.min(2.0, v));
}

/** Default 1.0; rejects NaN/Infinity; clamps to [0, 1]. */
export function clampVoiceVolume(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 1.0; }
    return Math.max(0, Math.min(1, v));
}

/** Default 0; rejects NaN/Infinity; clamps to [−1, 1]. */
export function clampVoicePitch(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { return 0; }
    return Math.max(-1, Math.min(1, v));
}

/**
 * Reject path-like or control-character voice hints (security: voiceId is not a file path).
 * Returns undefined instead of truncating dangerous strings.
 */
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

/**
 * Parse and normalize a raw `voice` object from npc_registry.json.
 * Returns undefined when the block is missing or equivalent to empty system defaults
 * (e.g. `{ "provider": "bogus" }` alone — invalid provider coerces to system with no overrides).
 */
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

    // Drop profiles that would have no effect after normalization.
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

// ---------------------------------------------------------------------------
// Mood → rate/pitch deltas (additive, re-clamped). Synced with 61-tts-npc.js.
// ---------------------------------------------------------------------------

const MOOD_MODIFIERS: Record<NpcMood, { rateDelta: number; pitchDelta: number }> = {
    excited: { rateDelta: 0.18, pitchDelta: 0.15 },
    angry: { rateDelta: 0.12, pitchDelta: 0.05 },
    fearful: { rateDelta: 0.15, pitchDelta: 0.12 },
    happy: { rateDelta: 0.08, pitchDelta: 0.10 },
    neutral: { rateDelta: 0, pitchDelta: 0 },
    worried: { rateDelta: -0.05, pitchDelta: -0.05 },
    sad: { rateDelta: -0.15, pitchDelta: -0.10 },
};

/** Apply moodAdaptive nudges; does not run unless caller checks profile.moodAdaptive first. */
export function applyMoodModifiers(rate: number, pitch: number, mood: NpcMood): { rate: number; pitch: number } {
    const mod = MOOD_MODIFIERS[mood] ?? MOOD_MODIFIERS.neutral;
    return {
        rate: clampVoiceRate(rate + mod.rateDelta),
        pitch: clampVoicePitch(pitch + mod.pitchDelta),
    };
}

/** Coerce unknown disposition mood to a valid NpcMood for TTS (avoids importing isValidMood from registry). */
export function normalizeDispositionMood(mood: unknown): NpcMood {
    if (typeof mood === 'string' && mood in MOOD_MODIFIERS) {
        return mood as NpcMood;
    }
    return 'neutral';
}