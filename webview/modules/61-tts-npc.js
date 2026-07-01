// ===== Phase 11: NPC-aware TTS (Web Speech API — system provider only in 11A) =====
//
// Runtime mirror of src/ttsProviderCore.ts + src/npcVoiceCore.ts (no shared bundle).
// Extension pushes npcTtsCatalog via worldView; this module resolves voices at speak time.
//
// Attribution (best-effort, not diarization):
//   - Chat 📢 / auto-read uses entry.sender (+ optional speakerNpcId in 11B).
//   - Duplicate NPC names: use currentLocationId; if still ambiguous → global speakText().
//   - GM prose / inline quotes are NOT parsed for speaker names.
//
// Module load order: bundled after 60-tts-quickreply-imagegen.js (speakText → speakWithProfile).

const TTS_MAX_TEXT_LEN = 4000;

// Mood deltas — keep in sync with npcVoiceCore.ts MOOD_MODIFIERS.
const TTS_MOOD_MODIFIERS = {
  excited: { rateDelta: 0.18, pitchDelta: 0.15 },
  angry: { rateDelta: 0.12, pitchDelta: 0.05 },
  fearful: { rateDelta: 0.15, pitchDelta: 0.12 },
  happy: { rateDelta: 0.08, pitchDelta: 0.10 },
  neutral: { rateDelta: 0, pitchDelta: 0 },
  worried: { rateDelta: -0.05, pitchDelta: -0.05 },
  sad: { rateDelta: -0.15, pitchDelta: -0.10 },
};

/** Catalog from extension (all voiced NPCs); refreshed on each worldView message. */
let npcTtsCatalog = [];
let ttsExternalEnabled = false;
let npcTtsCurrentLocationId = null;
let npcVoiceCount = 0;
/** Log local/external fallback once per session to avoid console spam. */
let ttsFallbackLogged = { external: false, local: false };

function clampVoiceRateJs(v, fallback = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(0.5, Math.min(2, v));
}

function clampVoiceVolumeJs(v, fallback = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(0, Math.min(1, v));
}

function clampVoicePitchJs(v, fallback = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(-1, Math.min(1, v));
}

function localeToBcp47Js(locale) {
  const map = { ja: 'ja-JP', en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW' };
  return map[locale] || map.en;
}

function applyMoodModifiersJs(rate, pitch, mood) {
  const mod = TTS_MOOD_MODIFIERS[mood] || TTS_MOOD_MODIFIERS.neutral;
  return {
    rate: clampVoiceRateJs(rate + mod.rateDelta),
    pitch: clampVoicePitchJs(pitch + mod.pitchDelta),
  };
}

/** Mirrors resolveTtsPlan(); uses global ttsSpeed/ttsVolume/currentLocale from module 60. */
function resolveTtsPlanJs(text, voiceCtx) {
  const plain = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, TTS_MAX_TEXT_LEN)
    : '';
  if (!plain) {
    return null;
  }

  const profile = voiceCtx && voiceCtx.voice ? voiceCtx.voice : null;
  let provider = (profile && profile.provider) || 'system';

  if (provider === 'external' && !ttsExternalEnabled) {
    if (!ttsFallbackLogged.external) {
      console.warn('[LoreRelay TTS] external provider disabled; using system TTS');
      ttsFallbackLogged.external = true;
    }
    provider = 'system';
  }
  if (provider === 'local') {
    if (!ttsFallbackLogged.local) {
      console.warn('[LoreRelay TTS] local provider not available in 11A; using system TTS');
      ttsFallbackLogged.local = true;
    }
    provider = 'system';
  }

  const globalSpeed = clampVoiceRateJs(typeof ttsSpeed === 'number' ? ttsSpeed : 1);
  const globalVolume = clampVoiceVolumeJs(typeof ttsVolume === 'number' ? ttsVolume : 0.8);

  let rate = globalSpeed * (profile && profile.rate !== undefined ? clampVoiceRateJs(profile.rate) : 1);
  let volume = globalVolume * (profile && profile.volume !== undefined ? clampVoiceVolumeJs(profile.volume) : 1);
  let pitch = profile && profile.pitch !== undefined ? clampVoicePitchJs(profile.pitch) : 0;

  const mood = (voiceCtx && voiceCtx.mood) || 'neutral';
  if (profile && profile.moodAdaptive) {
    const adjusted = applyMoodModifiersJs(rate, pitch, mood);
    rate = adjusted.rate;
    pitch = adjusted.pitch;
  }

  const lang = (profile && profile.lang) || localeToBcp47Js(currentLocale);

  return {
    provider,
    text: plain,
    lang,
    rate: clampVoiceRateJs(rate),
    volume: clampVoiceVolumeJs(volume),
    pitch: clampVoicePitchJs(pitch),
    voiceId: profile && profile.voiceId,
  };
}

/** Mirrors findNpcVoiceForSender(); returns null instead of undefined for JS ergonomics. */
function findNpcVoiceForSenderJs(sender, speakerNpcId) {
  if (speakerNpcId) {
    const byId = npcTtsCatalog.find((e) => e.id === speakerNpcId);
    if (byId) { return byId; }
  }
  const name = (sender || '').trim();
  if (!name) { return null; }
  const lower = name.toLowerCase();
  const matches = npcTtsCatalog.filter((e) => e.name.toLowerCase() === lower);
  if (matches.length === 0) { return null; }
  if (matches.length === 1) { return matches[0]; }
  // Ambiguous duplicate names — narrow by player location when possible.
  if (npcTtsCurrentLocationId) {
    const atLoc = matches.filter((e) => e.locationId === npcTtsCurrentLocationId);
    if (atLoc.length === 1) { return atLoc[0]; }
  }
  return null;
}

/** Match voiceId hint against speechSynthesis voices; fall back to locale best voice. */
function pickVoiceByHint(voiceId, lang) {
  if (!window.speechSynthesis) { return null; }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) { return null; }
  if (voiceId) {
    const hint = String(voiceId).toLowerCase();
    const match = voices.find((v) =>
      v.name.toLowerCase() === hint ||
      v.voiceURI.toLowerCase().includes(hint) ||
      v.name.toLowerCase().includes(hint)
    );
    if (match) { return match; }
  }
  const langMap = { ja: 'ja-JP', en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW' };
  const target = lang || langMap[currentLocale] || 'en-US';
  const matched = voices.filter((v) => v.lang === target || v.lang.replace('_', '-').startsWith(target));
  if (matched.length) {
    return matched.find((v) => v.localService) || matched[0];
  }
  return getBestVoiceForLocale(currentLocale);
}

/** Primary TTS entry: optional voiceCtx { voice, mood } from NPC catalog or World preview. */
function speakWithProfile(text, voiceCtx) {
  if (!ttsEnabled || !window.speechSynthesis || !window.SpeechSynthesisUtterance) { return; }

  const plan = resolveTtsPlanJs(text, voiceCtx);
  if (!plan) { return; }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(plan.text);
  utterance.rate = plan.rate;
  utterance.volume = plan.volume;
  utterance.pitch = plan.pitch;
  utterance.lang = plan.lang;

  const voice = pickVoiceByHint(plan.voiceId, plan.lang);
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

/** Per-message 📢 and auto-read: NPC voice when sender matches catalog, else global speakText. */
function speakEntryText(entry) {
  if (!entry) { return; }
  const voiceCtx = findNpcVoiceForSenderJs(entry.sender, entry.speakerNpcId);
  if (voiceCtx) {
    speakWithProfile(entry.content, { voice: voiceCtx.voice, mood: voiceCtx.mood });
  } else {
    speakText(entry.content);
  }
}

/** World tab 🔊 Preview — localized sample line from webview.world.npcVoiceSample. */
function previewNpcVoice(npc) {
  if (!npc || !npc.voice) { return; }
  const sample = T('webview.world.npcVoiceSample', { name: npc.name }) ||
    `Hello, I am ${npc.name}.`;
  speakWithProfile(sample, { voice: npc.voice, mood: npc.mood || 'neutral' });
}

/** Called from 85-world.js on each worldView postMessage. */
function updateNpcTtsFromWorldView(msg) {
  npcTtsCatalog = Array.isArray(msg.npcTtsCatalog) ? msg.npcTtsCatalog : [];
  ttsExternalEnabled = !!msg.ttsExternalEnabled;
  npcTtsCurrentLocationId = msg.currentLocationId || null;
  npcVoiceCount = typeof msg.npcVoiceCount === 'number' ? msg.npcVoiceCount : 0;
  updateNpcVoiceCountLabel();
}

function updateNpcVoiceCountLabel() {
  const el = document.getElementById('tts-npc-voice-count');
  if (!el) { return; }
  if (npcVoiceCount > 0) {
    el.textContent = T('webview.tts.npcVoiceCount', { count: String(npcVoiceCount) }) ||
      `NPC voices: ${npcVoiceCount}`;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}