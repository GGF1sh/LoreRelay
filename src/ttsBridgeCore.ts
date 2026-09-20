// Pure TTS bridge helpers — no vscode/fs/spawn imports.
// Phase 11B: local subprocess JSON protocol + OpenAI speech API voice mapping.
// See PHASE11_ADAPTIVE_TTS_DESIGN.md §8–9.

import * as path from 'path';
import { clampTtsText } from './ttsProviderCore';

export type ExternalTtsProvider = 'openai' | '';

/** Payload extension host sends to local CLI / external API after resolveTtsPlan(). */
export interface TtsBridgeSpeakPayload {
    requestId: string;
    text: string;
    lang: string;
    rate: number;
    volume: number;
    pitch: number;
    voiceId?: string;
    provider: 'local' | 'external';
}

/** Expected stdout JSON from scripts/tts_local.py (or compatible local.command). */
export interface TtsLocalScriptResult {
    ok: boolean;
    audioPath?: string;
    mimeType?: string;
    error?: string;
}

export const TTS_OPENAI_VOICES = new Set([
    'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer',
]);

export const MAX_TTS_API_TEXT = 4096;
export const MAX_TTS_AUDIO_BYTES = 8 * 1024 * 1024;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function isValidTtsRequestId(id: unknown): id is string {
    return typeof id === 'string' && REQUEST_ID_PATTERN.test(id);
}

export function normalizeExternalProvider(raw: unknown): ExternalTtsProvider {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return s === 'openai' ? 'openai' : '';
}

/** Map profile voiceId hint to an OpenAI TTS voice name; unknown hints use fallbackVoice. */
export function resolveOpenAiVoice(voiceId: string | undefined, fallbackVoice: string): string {
    const hint = (voiceId || '').trim().toLowerCase();
    if (TTS_OPENAI_VOICES.has(hint)) {
        return hint;
    }
    const fb = (fallbackVoice || 'alloy').trim().toLowerCase();
    return TTS_OPENAI_VOICES.has(fb) ? fb : 'alloy';
}

/** Convert Web Speech rate (0.5–2.0) to edge-tts rate string, e.g. "+10%". */
export function rateToEdgeTtsPercent(rate: number): string {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
        return '+0%';
    }
    const pct = Math.round((rate - 1) * 100);
    const clamped = Math.max(-50, Math.min(100, pct));
    return clamped >= 0 ? `+${clamped}%` : `${clamped}%`;
}

/** Pick a default edge-tts voice from BCP-47 lang. */
export function defaultEdgeVoiceForLang(lang: string): string {
    const l = (lang || 'en-US').toLowerCase();
    if (l.startsWith('ja')) { return 'ja-JP-NanamiNeural'; }
    if (l.startsWith('zh-cn')) { return 'zh-CN-XiaoxiaoNeural'; }
    if (l.startsWith('zh-tw') || l.startsWith('zh-hk')) { return 'zh-TW-HsiaoChenNeural'; }
    return 'en-US-AriaNeural';
}

export function parseTtsLocalStdout(raw: string): TtsLocalScriptResult {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
        return { ok: false, error: 'empty stdout' };
    }
    const line = trimmed.split(/\r?\n/).filter(Boolean).pop() || trimmed;
    try {
        const doc = JSON.parse(line) as Record<string, unknown>;
        if (doc.ok === true && typeof doc.audioPath === 'string') {
            return {
                ok: true,
                audioPath: doc.audioPath,
                mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'audio/mpeg',
            };
        }
        const err = typeof doc.error === 'string' ? doc.error.slice(0, 300) : 'local TTS failed';
        return { ok: false, error: err };
    } catch {
        return { ok: false, error: 'invalid JSON from local TTS' };
    }
}

/**
 * Audio output must live under workspace .text-adventure/tts/ (no traversal).
 */
export function isSafeTtsOutputPath(filePath: string, workspaceRoot: string): boolean {
    if (!filePath || !workspaceRoot) { return false; }
    const root = path.resolve(workspaceRoot);
    const resolved = path.resolve(filePath);
    const rel = path.relative(root, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        return false;
    }
    const norm = rel.replace(/\\/g, '/');
    return norm.startsWith('.text-adventure/tts/') && !norm.includes('..');
}

export function sanitizeTtsBridgePayload(raw: unknown): TtsBridgeSpeakPayload | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (!isValidTtsRequestId(r.requestId)) { return undefined; }
    const provider = r.provider === 'local' || r.provider === 'external' ? r.provider : undefined;
    if (!provider) { return undefined; }

    const text = clampTtsText(typeof r.text === 'string' ? r.text : '');
    if (!text) { return undefined; }

    const lang = typeof r.lang === 'string' ? r.lang.trim().slice(0, 16) : 'en-US';
    const rate = typeof r.rate === 'number' && Number.isFinite(r.rate)
        ? Math.max(0.5, Math.min(2, r.rate))
        : 1;
    const volume = typeof r.volume === 'number' && Number.isFinite(r.volume)
        ? Math.max(0, Math.min(1, r.volume))
        : 1;
    const pitch = typeof r.pitch === 'number' && Number.isFinite(r.pitch)
        ? Math.max(-1, Math.min(1, r.pitch))
        : 0;
    const voiceId = typeof r.voiceId === 'string' ? r.voiceId.trim().slice(0, 120) : undefined;

    return {
        requestId: r.requestId,
        text: text.slice(0, MAX_TTS_API_TEXT),
        lang: lang || 'en-US',
        rate,
        volume,
        pitch,
        voiceId: voiceId || undefined,
        provider,
    };
}

/** Redact speak text in Output Channel logs (privacy). */
export function redactTtsLogText(text: string): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 72) { return t; }
    return `${t.slice(0, 72)}…`;
}