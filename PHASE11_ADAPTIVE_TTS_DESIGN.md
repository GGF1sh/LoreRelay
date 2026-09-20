# Phase 11: Adaptive TTS / NPC Voice Profiles Design

Date: 2026-07-01 JST  
Status: Claude schema/mood/UI review complete (see §5–7) → Grok (implementation)  
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

**Claude review note:** use `Number.isFinite`, not just `!Number.isNaN`, when clamping — `rate`/`volume`/`pitch` must reject `Infinity`/`-Infinity` too (this is a known gap in `validateGameState.ts` for HP/MP; don't repeat it here). Mirror the existing `clampDispositionValue()` shape in `npcRegistryCore.ts`:

```ts
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
```

`voiceId` is a **hint string**, never a path or command — reject (not just truncate) values containing path separators or control characters, matching the "no executable paths" rule in §9:

```ts
function sanitizeVoiceId(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const trimmed = v.trim().slice(0, 120);
    if (!trimmed || /[\\/\x00-\x1f]/.test(trimmed)) { return undefined; }
    return trimmed;
}
```

`label` (max 40) and `lang` (max 16) can use the existing plain `.trim().slice(0, N)` pattern already used for `dialogueHints`/`portraitImagePath` — no further sanitization needed since they're UI-display-only or fed straight to Web Speech's `lang` (which the browser itself validates).

### Optional future: `GameEntry.speakerNpcId`

**Recommendation: defer to Phase 11B.** Reasons:
1. It requires a `TurnResult`/`turn_result.json` schema addition plus validation in `processTurnResult()` — Phase 11A's non-goals explicitly exclude touching the GM Bridge contract.
2. Every GM Bridge provider (including clipboard/manual) would need to reliably emit it; clipboard/manual workflows can't be trusted to add a new structured field consistently.
3. Sender-name matching (§7) already covers the common case cheaply; `speakerNpcId` only helps when names collide or narration doesn't quote the NPC by name, which is a smaller marginal win for the schema risk it adds.

If added later:

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

### `applyMoodModifiers()` table (Claude review)

Deltas are **additive** on top of the already-resolved rate/pitch (profile × global), then re-clamped with `clampVoiceRate`/`clampVoicePitch`. Values are deliberately small so `moodAdaptive` never overrides an author's explicit `rate`/`pitch` choice, only nudges it. Mapped against the existing `NpcMood` union (`npcRegistryCore.ts`):

| Mood | rate delta | pitch delta | Rationale |
|------|-----------:|------------:|-----------|
| `excited` | +0.18 | +0.15 | fastest, brightest |
| `angry` | +0.12 | +0.05 | clipped, sharper |
| `fearful` | +0.15 | +0.12 | rushed, higher-strung |
| `happy` | +0.08 | +0.10 | slightly faster, warmer |
| `neutral` | 0 | 0 | baseline |
| `worried` | -0.05 | -0.05 | hesitant |
| `sad` | -0.15 | -0.10 | slowest, flattest |

```ts
const MOOD_MODIFIERS: Record<NpcMood, { rateDelta: number; pitchDelta: number }> = {
    excited: { rateDelta:  0.18, pitchDelta:  0.15 },
    angry:   { rateDelta:  0.12, pitchDelta:  0.05 },
    fearful: { rateDelta:  0.15, pitchDelta:  0.12 },
    happy:   { rateDelta:  0.08, pitchDelta:  0.10 },
    neutral: { rateDelta:  0,    pitchDelta:  0    },
    worried: { rateDelta: -0.05, pitchDelta: -0.05 },
    sad:     { rateDelta: -0.15, pitchDelta: -0.10 },
};

export function applyMoodModifiers(rate: number, pitch: number, mood: NpcMood): { rate: number; pitch: number } {
    const mod = MOOD_MODIFIERS[mood] ?? MOOD_MODIFIERS.neutral;
    return {
        rate: clampVoiceRate(rate + mod.rateDelta),
        pitch: clampVoicePitch(pitch + mod.pitchDelta),
    };
}
```

Only applied when `voiceProfile.moodAdaptive === true` (per §4/§6 resolution order step 4); `dispositionMood` absent or unrecognized falls back to `neutral` (no-op), never throws.

## 7. NPC Attribution (Phase 11A)

Best-effort mapping when user clicks 📢 on a chat entry:

| Priority | Rule |
|----------|------|
| 1 | `entry.speakerNpcId` if present (future) |
| 2 | `entry.sender` exact match to `npc_registry[npcId].name` (case-insensitive) |
| 3 | Party character name match (characters/*.json) — optional stretch |
| 4 | GM narrator defaults (`getBestVoiceForLocale`) |

Do **not** auto-speak different voices within a single GM paragraph in 11A.

### Attribution edge cases (Claude review)

- **Duplicate NPC names.** Two `npc_registry` entries can share a display `name` (different `locationId`/`factionId`). Exact-name matching alone is ambiguous. Resolution: prefer an NPC whose `locationId` matches the player's current location (already available in the world payload sent to the Webview); if still ambiguous after that filter, **do not guess** — skip the voice-profile override and speak with the narrator default. A wrong voice is worse than no voice.
- **GM self-narration / quoted dialogue inside prose.** Lines like `GM: "Go," she said` have no separate `sender` per quoted NPC — `entry.sender` is fixed per whole chat entry, not per-clause. Attribution only ever operates at entry granularity. Do **not** attempt substring name-matching inside GM narration text to guess who's "speaking" mid-paragraph; this is explicitly out of scope (§2 non-goals) and stays out of scope for the same reason in 11B unless a real diarization model is added.
- **NPC renamed mid-campaign.** Old chat entries keep the `sender` string as it was written at the time; if the NPC is later renamed in the registry, old entries simply stop matching (best-effort miss, not a bug — no retroactive rewrite of chat history).

### World tab preview (11A UI)

- Each NPC card with `voice` profile gets a **🔊 Preview** button, appended to the existing `world-npc-info` column in `webview/modules/85-world.js` right after the `world-npc-portrait-btn` (same pattern: plain `<button>`, `vscode.postMessage`-free — this one runs entirely client-side via `speakWithProfile()`, no extension-host round trip needed).
- Speaks a short sample line via i18n template + `T(key, vars)` substitution (already supported by `webview/modules/00-core.js`): `T('webview.world.npcVoiceSample', { name: npc.name })`.
- Uses the same `resolveTtsPlan()` path as chat 📢, with `dispositionMood` taken from `npc.mood` so the preview reflects `moodAdaptive` too.
- New i18n keys (add to all 4 locale files, `webview.world.*` namespace to match existing convention):
  - `webview.world.npcVoicePreviewBtn` — `"🔊 Preview"`
  - `webview.world.npcVoicePreviewTitle` — tooltip, e.g. `"Speak a short sample using this NPC's voice"`
  - `webview.world.npcVoiceSample` — `"Hello, I am {name}."`
- Button only renders when `npc.hasVoice` (or equivalent boolean already present on the world payload NPC summary, mirroring the existing `npc.hasPortrait` flag) — no profile means no button, not a disabled one.

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