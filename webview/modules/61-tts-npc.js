// ===== Phase 11: NPC-aware TTS (system + local/external bridge in 11B) =====
//
// Runtime mirror of src/ttsProviderCore.ts + src/npcVoiceCore.ts (no shared bundle).
// local/external plans post requestNpcTts → extension ttsBridgeRunner.ts → ttsAudioReady.
//
// Attribution: entry.sender + optional entry.speakerNpcId; duplicate names use currentLocationId.

const TTS_MAX_TEXT_LEN = 4000;

const TTS_MOOD_MODIFIERS = {
  excited: { rateDelta: 0.18, pitchDelta: 0.15 },
  angry: { rateDelta: 0.12, pitchDelta: 0.05 },
  fearful: { rateDelta: 0.15, pitchDelta: 0.12 },
  happy: { rateDelta: 0.08, pitchDelta: 0.10 },
  neutral: { rateDelta: 0, pitchDelta: 0 },
  worried: { rateDelta: -0.05, pitchDelta: -0.05 },
  sad: { rateDelta: -0.15, pitchDelta: -0.10 },
};

let npcTtsCatalog = [];
let ttsExternalEnabled = false;
let ttsLocalAvailable = false;
let ttsExternalProvider = '';
let npcTtsCurrentLocationId = null;
let npcVoiceCount = 0;
let ttsFallbackLogged = { external: false, local: false };
const pendingBridgeTts = new Map();
let activeBridgeAudio = null;

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
  if (provider === 'local' && !ttsLocalAvailable) {
    if (!ttsFallbackLogged.local) {
      console.warn('[LoreRelay TTS] local provider unavailable; using system TTS');
      ttsFallbackLogged.local = true;
    }
    provider = 'system';
  }
  if (provider === 'external' && ttsExternalEnabled && ttsExternalProvider !== 'openai') {
    if (!ttsFallbackLogged.external) {
      console.warn('[LoreRelay TTS] external provider not configured; using system TTS');
      ttsFallbackLogged.external = true;
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
  if (npcTtsCurrentLocationId) {
    const atLoc = matches.filter((e) => e.locationId === npcTtsCurrentLocationId);
    if (atLoc.length === 1) { return atLoc[0]; }
  }
  return null;
}

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

function speakPlanWithSystem(plan) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { return; }
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

function requestBridgeTts(plan) {
  const requestId = `tts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  pendingBridgeTts.set(requestId, plan);
  vscode.postMessage({
    type: 'requestNpcTts',
    requestId,
    provider: plan.provider,
    text: plan.text,
    lang: plan.lang,
    rate: plan.rate,
    volume: plan.volume,
    pitch: plan.pitch,
    voiceId: plan.voiceId,
  });
}

function playBridgeAudio(msg) {
  window.speechSynthesis?.cancel();
  if (activeBridgeAudio) {
    activeBridgeAudio.pause();
    activeBridgeAudio = null;
  }
  const mime = msg.mimeType || 'audio/mpeg';
  const audio = new Audio(`data:${mime};base64,${msg.audioBase64}`);
  audio.volume = typeof msg.volume === 'number' ? Math.max(0, Math.min(1, msg.volume)) : 1;
  activeBridgeAudio = audio;
  const fallbackPlan = pendingBridgeTts.get(msg.requestId);
  audio.onerror = () => {
    if (fallbackPlan) { speakPlanWithSystem(fallbackPlan); }
  };
  audio.play().catch(() => {
    if (fallbackPlan) { speakPlanWithSystem(fallbackPlan); }
  });
}

function speakWithProfile(text, voiceCtx) {
  if (!ttsEnabled) { return; }

  const plan = resolveTtsPlanJs(text, voiceCtx);
  if (!plan) { return; }

  if (plan.provider === 'local' || plan.provider === 'external') {
    requestBridgeTts(plan);
    return;
  }

  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { return; }
  speakPlanWithSystem(plan);
}

function speakEntryText(entry) {
  if (!entry) { return; }
  const voiceCtx = findNpcVoiceForSenderJs(entry.sender, entry.speakerNpcId);
  if (voiceCtx) {
    speakWithProfile(entry.content, { voice: voiceCtx.voice, mood: voiceCtx.mood });
  } else {
    speakText(entry.content);
  }
}

function previewNpcVoice(npc) {
  if (!npc || !npc.voice) { return; }
  const sample = T('webview.world.npcVoiceSample', { name: npc.name }) ||
    `Hello, I am ${npc.name}.`;
  speakWithProfile(sample, { voice: npc.voice, mood: npc.mood || 'neutral' });
}

function updateTtsCapabilities(msg) {
  ttsExternalEnabled = !!msg.externalEnabled;
  ttsLocalAvailable = !!msg.localAvailable;
  ttsExternalProvider = typeof msg.externalProvider === 'string' ? msg.externalProvider : '';
}

function updateNpcTtsFromWorldView(msg) {
  npcTtsCatalog = Array.isArray(msg.npcTtsCatalog) ? msg.npcTtsCatalog : [];
  if (msg.ttsExternalEnabled !== undefined) {
    ttsExternalEnabled = !!msg.ttsExternalEnabled;
  }
  if (msg.ttsLocalAvailable !== undefined) {
    ttsLocalAvailable = !!msg.ttsLocalAvailable;
  }
  if (msg.ttsExternalProvider !== undefined) {
    ttsExternalProvider = typeof msg.ttsExternalProvider === 'string' ? msg.ttsExternalProvider : '';
  }
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

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') { return; }
  if (msg.type === 'ttsCapabilities') {
    updateTtsCapabilities(msg);
  } else if (msg.type === 'ttsAudioReady' && msg.requestId) {
    pendingBridgeTts.delete(msg.requestId);
    playBridgeAudio(msg);
  } else if (msg.type === 'ttsAudioFailed' && msg.requestId) {
    const plan = pendingBridgeTts.get(msg.requestId);
    pendingBridgeTts.delete(msg.requestId);
    if (plan) {
      speakPlanWithSystem(plan);
    }
  }
});