# Phase 11: Adaptive TTS / NPC Voice Profiles Design

Date: 2026-07-01 JST  
Status: Design ready for Claude (schema/UI) → Grok (implementation)  
Review focus: ChatGPT after Phase 11A prototype

## 1. Goal

Give each NPC in `npc_registry.json` an optional, persistent **voice profile** so LoreRelay can route narration to:

1. **System TTS** (Web Speech API in Webview — already exists)
2. **Local TTS** (optional extension-host bridge, e.g. Piper / edge-tts — Phase 11B)
3. **External TTS** (optional, user-configured API — never required)

Phase 11A must prove the **data model + Webview routing + tests** without breaking the current global TTS toggle (speed/volume/locale voice).

## 2. Non-Goals for Phase 11A

- Do not require paid external APIs.
- Do not add a large voice-cloning or ST voice-preset importer yet.
- Do not parse GM HTML for inline dialogue attribution (too fragile).
- Do not block game turns on TTS completion.
- Do not store raw audio in `game_state.json`.
- Do not change `processTurnResult()` or GM Bridge contracts.

## 3. Existing Baseline (v1.10.0)

### Webview TTS (working)

- Module: `webview/modules/60-tts-quickreply-imagegen.js`
- `speakText(text)` uses `window.speechSynthesis` + `getBestVoiceForLocale(currentLocale)`
- Global settings: `ttsEnabled`, `ttsSpeed`, `ttsVolume` (persisted in webview state)
- Per-message 📢 button calls `speakText(entry.content)` with **no NPC awareness**
- Party `forceSpeak` affects **GM prompt injection** (`partyDirectorCore.ts`), not TTS voice selection

### NPC registry (working)

- Pure types/parser: `src/npcRegistryCore.ts`, I/O: `src/npcRegistry.ts`
- `NpcEntry` has disposition, needs, memories, `dialogueHints`, `portraitImagePath`
- No voice fields yet

### Message model limitation

`GameEntry.role` is only `"gm" | "user"`. NPC speech is usually embedded inside GM narration, not separate entries. Therefore Phase 11A attribution is **best-effort**, not perfect diarization.

## 4. Proposed Architecture

### New pure modules

| Module | Responsibility |
|--------|----------------|
| `src/npcVoiceCore.ts` | `NpcVoiceProfile` type, parse/clamp/merge, mood → rate/pitch modifiers |
| `src/ttsProviderCore.ts` | Provider enum, `resolveTtsRequest()`, caps, privacy flags |

### Thin wrappers (optional in 11A)

| Module | Responsibility |
|--------|----------------|
| `src/ttsBridgeRunner.ts` | Extension-host local TTS spawn (11B only) |
| `webview/modules/61-tts-npc.js` | NPC-aware `speakWithProfile()`, World tab preview |

Follow the project rule: **Core = pure TS, Wrapper = vscode/DOM**.

## 5. Data Model

### `NpcVoiceProfile` (optional on `NpcEntry`)

```ts
export type TtsProviderKind = 'system' | 'local' | 'external';

export interface NpcVoiceProfile {
    /** Preferred provider; default 'system' (Web Speech API). */
    provider?: TtsProviderKind;
    /**
     * Web Speech API voice URI or name hint.
     * Matched against `speechSynthesis.getVoices()` at speak time.
     */
    voiceId?: string;
    /** BCP-47 override, e.g. "ja-JP". Falls back to UI locale. */
    lang?: string;
    /** 0.5–2.0, multiplied with global ttsSpeed. Default 1.0 */
    rate?: number;
    /** 0–1, multiplied with global ttsVolume. Default 1.0 */
    volume?: number;
    /** -1–1 Web Speech pitch. Default 0 */
    pitch?: number;
    /**
     * When true, apply disposition.mood modifiers on top of rate/pitch.
     * e.g. angry → slightly faster + higher pitch; sad → slower
     */
    moodAdaptive?: boolean;
    /** Optional label for UI only (not sent to APIs). Max 40 chars. */
    label?: string;
}
```

### Extended `NpcEntry`

```ts
export interface NpcEntry {
    // ...existing fields...
    voice?: NpcVoiceProfile;
}
```

### Parser rules (`npcRegistryCore.ts` / `npcRegistry.ts`)

- Unknown keys on `voice` are stripped (forward-compatible).
- `provider` must be one of `system | local | external`; invalid → `system`.
- `rate` clamp 0.5–2.0, `volume` 0–1, `pitch` -1–1.
- `voiceId` max 120 chars, `lang` max 16 chars, `label` max 40 chars.
- `external` provider allowed in file but **ignored** until user explicitly enables external TTS in settings (11B).

### Optional future: `GameEntry.speakerNpcId`

Defer to Phase 11B unless trivial. If added later:

```ts
speakerNpcId?: string; // must match npc_registry key pattern
```

Would let GM/turn_result tag quoted NPC lines explicitly.

## 6. Provider Abstraction

### `TtsSpeakRequest` (pure)

```ts
export interface TtsSpeakRequest {
    text: string;           // plain text, max 4000 chars (existing cap)
    locale: string;         // UI locale
    globalSpeed: number;
    globalVolume: number;
    voiceProfile?: NpcVoiceProfile;
    dispositionMood?: NpcMood;
}
```

### `ResolvedTtsPlan` (pure)

```ts
export interface ResolvedTtsPlan {
    provider: TtsProviderKind;
    text: string;
    lang: string;
    rate: number;
    volume: number;
    pitch: number;
    voiceId?: string;
    blockedReason?: string; // e.g. external disabled, text empty
}
```

### Resolution order

1. Clamp text and numeric fields.
2. Start from global speed/volume.
3. Apply `voiceProfile` overrides (multiply rates).
4. If `moodAdaptive` and `dispositionMood`, apply small deltas from `npcVoiceCore.applyMoodModifiers()`.
5. If `provider === 'external'` and `textAdventure.tts.external.enabled !== true` → fall back to `system` with warning log.
6. If `provider === 'local'` and bridge unavailable → fall back to `system`.

### Phase 11A implementation scope

**Only `system` provider is executed.** `local` / `external` return a plan but Webview uses Web Speech API path only. Log fallback once per session.

## 7. NPC Attribution (Phase 11A)

Best-effort mapping when user clicks 📢 on a chat entry:

| Priority | Rule |
|----------|------|
| 1 | `entry.speakerNpcId` if present (future) |
| 2 | `entry.sender` exact match to `npc_registry[npcId].name` (case-insensitive) |
| 3 | Party character name match (characters/*.json) — optional stretch |
| 4 | GM narrator defaults (`getBestVoiceForLocale`) |

Do **not** auto-speak different voices within a single GM paragraph in 11A.

### World tab preview (11A UI)

- Each NPC card with `voice` profile gets a **🔊 Preview** button.
- Speaks a short sample line: `"Hello, I am {name}."` localized via i18n template.
- Uses the same `resolveTtsPlan()` path as chat 📢.

## 8. Settings (VS Code `package.json`)

Add under `textAdventure.tts`:

| Key | Default | Purpose |
|-----|---------|---------|
| `enabled` | (webview state today) | Consider mirroring or leave webview-only for 11A |
| `external.enabled` | `false` | Opt-in for paid/cloud TTS |
| `external.provider` | `""` | e.g. `openai`, `elevenlabs` — 11B |
| `local.command` | `""` | Path to local TTS CLI — 11B |
| `local.defaultVoice` | `""` | 11B |

Phase 11A: add only `textAdventure.tts.external.enabled` (default false) + description strings in 4 locales if exposed in settings UI.

## 9. Privacy & Security

- **System TTS**: runs in Webview (Chromium); text never leaves the machine unless the OS voice backend phones home (document in README note).
- **Local TTS**: subprocess with `shell: false`; only workspace-safe temp files; redact player action in logs.
- **External TTS**: off by default; require explicit setting; never send `npc_registry` memories or full `game_state` — only the speak request text chunk (max 4000 chars); API keys via `SecretStorage` pattern (same as OpenRouter GM).
- No automatic background speak of full history.
- NPC voice profiles must not contain executable paths in `voiceId` (string hint only).

## 10. UI Plan (minimal)

### Phase 11A

1. **World tab** — NPC card: show voice label + Preview button.
2. **Chat 📢** — use attribution table above when profile exists.
3. **TTS menu** (existing) — add read-only line: "NPC voices: N configured" (optional).

### Phase 11B (later)

- Character / NPC editor voice picker (dropdown from `getVoices()`).
- External provider config panel.
- Local TTS test button in Output Channel.

## 11. Tests

| Test file | Cases |
|-----------|-------|
| `scripts/test_npc_voice_core.js` | parse profile, clamps, mood modifiers, invalid provider |
| `scripts/test_tts_provider_core.js` | resolve plan, external blocked, text cap, rate multiply |
| Extend `scripts/test_npc_registry.js` or parser tests | voice field round-trip |

No Webview DOM tests required if Core is pure.

## 12. Implementation Phases

### Phase 11A (ship in one PR stack)

1. `npcVoiceCore.ts` + parser hooks in `npcRegistry.ts`
2. `ttsProviderCore.ts`
3. Webview: `speakWithProfile()` refactor in `60-tts-quickreply-imagegen.js`
4. World tab preview in `85-world.js` (or `61-tts-npc.js`)
5. i18n keys × 4 locales
6. `testing_checklist.md` manual steps
7. CHANGELOG [Unreleased]

### Phase 11B (optional follow-up)

- `ttsBridgeRunner.ts` + `tts_local.py` in TextAdventureGMSkill
- `speakerNpcId` on `GameEntry` + turn_result optional field
- External provider adapter (single provider)

## 13. Files to Touch (11A)

| File | Change |
|------|--------|
| `src/npcRegistryCore.ts` | `NpcVoiceProfile`, extend `NpcEntry` |
| `src/npcRegistry.ts` | parse/sanitize `voice` |
| `src/npcVoiceCore.ts` | **new** |
| `src/ttsProviderCore.ts` | **new** |
| `src/worldView.ts` | include voice summary in world payload if needed |
| `webview/modules/60-tts-quickreply-imagegen.js` | `speakWithProfile`, attribution |
| `webview/modules/85-world.js` | preview button |
| `locales/*.json` | i18n |
| `package.json` | `textAdventure.tts.external.enabled` |
| `scripts/test_npc_voice_core.js` | **new** |
| `scripts/test_tts_provider_core.js` | **new** |

## 14. Acceptance Criteria (11A)

- [ ] `npc_registry.json` accepts optional `voice` per NPC; invalid values clamped or dropped.
- [ ] World tab Preview speaks with NPC profile when configured.
- [ ] Chat 📢 uses NPC profile when `sender` matches NPC name.
- [ ] External provider in JSON does not call network unless setting enabled.
- [ ] `npm run compile && npm test` green.
- [ ] No change to GM Bridge / `turn_result.json` required for basic demo.

## 15. Handoff

- **Claude**: finalize schema caps, World UI wireframe, mood modifier table, review parser against `npcRegistry.ts` patterns.
- **Grok**: implement 11A per this doc; local/external stubs only.
- **ChatGPT**: review privacy section + attribution limits after 11A PR.