# Phase 8-11 Planning and AI Prompts

This file is a handoff pack for the next feature wave after LoreRelay v1.7.3.
Read `AI_SHARED_LOG.md`, `CHANGELOG.md`, `AI_HANDOVER.md`, and `AI_ROADMAP.md`
before starting implementation.

## Scope Summary

| Phase | Feature | Primary AI | Status |
| --- | --- | --- | --- |
| Phase 8 | Event-to-Quest / Quest Board | Gemini, review by ChatGPT | Phase 8A done; i18n + checklist added |
| Phase 9 | Agentic Campaign Engine / split-role GM | ChatGPT + Grok | Planning |
| Phase 10 | VS Code/Git Native Timeline | Claude | Planning |
| Phase 11 | Adaptive TTS / NPC voices | Claude → Grok | Design ready (`PHASE11_ADAPTIVE_TTS_DESIGN.md`) |

## Phase 8: Event-to-Quest / Quest Board

### Goal

Turn world simulation events and urgent NPC needs into optional player-facing quest hooks without forcing the GM to railroad the player.

### Current Implementation Baseline

- `src/questGeneratorCore.ts` generates deterministic quest hooks from:
  - `world_state.json.recentChanges`
  - urgent `npc_registry.json` needs with urgency >= 70
- `src/worldStateCore.ts` parses and caps `questHooks`.
- `src/emergentSimulator.ts` calls `generateQuestHooks()` before saving `world_state.json`.
- `src/worldView.ts` sends `questHooks` to the Webview.
- `webview/modules/85-world.js` renders Quest Board items and sends `acceptQuest`.
- `src/extension.ts` marks available quests as active.
- `src/gmPromptBuilder.ts` injects the active quest objective into the GM prompt.
- `turn_result.json.resolvedQuests` can mark active quests completed in `world_state.json`.

### Remaining Phase 8 Work

- [x] Add i18n keys for Quest Board labels instead of hard-coded English text.
- [x] Add Extension Host manual test steps to `testing_checklist.md`.
- [ ] Add a user-facing "complete/fail quest" UI only if manual control is useful.
- [ ] Add reward/disposition handling after quest completion.
- [ ] Decide whether LLM enrichment is worthwhile. Default should remain deterministic and cheap.

### Prompt for Gemini

```markdown
LoreRelay v1.7.3 / Phase 8A is already partially implemented.
Read:
- AI_SHARED_LOG.md
- CHANGELOG.md [Unreleased]
- AI_ROADMAP.md Phase 8
- src/questGeneratorCore.ts
- src/worldStateCore.ts
- src/emergentSimulator.ts
- src/worldView.ts
- webview/modules/85-world.js

Task:
Polish Phase 8 Event-to-Quest without changing the Persist-Before-Narrate pipeline.

Focus:
1. Add i18n keys for Quest Board labels and actions.
2. Improve user-facing quest copy if needed.
3. Add manual test notes to testing_checklist.md.
4. Keep deterministic generation as the default. Do not add LLM calls unless isolated behind an option.

Verification:
- npm run compile
- npm test
```

### Prompt for ChatGPT

```markdown
LoreRelay v1.7.3 Phase 8A code review request.
Review the Event-to-Quest implementation:
- src/questGeneratorCore.ts
- src/worldStateCore.ts QuestHook parser
- src/emergentSimulator.ts generateQuestHooks call
- src/worldView.ts questHooks Webview payload
- src/webviewHandlers.ts acceptQuest handler
- src/extension.ts handleAcceptQuest
- src/statePatch.ts resolvedQuests handling
- webview/modules/85-world.js Quest Board rendering

Please look for:
1. Duplicate quest generation bugs.
2. Unsafe IDs or unbounded strings from world_state.json / npc_registry.json.
3. Incorrect state ownership between game_state.json and world_state.json.
4. Webview injection or inline handler risks.
5. Prompt bloat from active quest injection.

Output findings first, ordered by severity, with file/line references.
```

## Phase 9: Agentic Campaign Engine / Split-Role GM

### Goal

Separate fast state handling from richer narrative generation. The first pass should produce safe structured state patches; the second pass can focus on prose.

Design source of truth: `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`

### Prompt for ChatGPT

```markdown
Design Phase 9 for LoreRelay: an agentic campaign engine with split-role GM.

Context:
- Persist-Before-Narrate uses turn_result.json.
- statePatch must remain allowlisted and safe.
- GM Bridge supports grok, vscode-lm, clipboard, command, ollama, koboldcpp, openrouter.

Task:
Propose a minimal architecture where:
1. A fast "State Referee" generates or validates statePatch/dice/resolvedQuests.
2. A "Narrator" writes rich prose using the accepted state result.
3. Failure of the narrator does not corrupt state.
4. The system still works with clipboard/manual GM workflows.

Deliver:
- proposed files/modules
- turn_result changes if any
- risks and tests

ChatGPT/Codex design result:
- `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`
- Phase 9A should be Grok-only and optional.
- `turn_result.json` remains the final contract.
- `processTurnResult()` remains the final validation/application point.
```

### Prompt for Grok

```markdown
LoreRelay Phase 9A implementation request.

Read these files first:
- PHASE9_AGENTIC_CAMPAIGN_DESIGN.md
- phase8_planning_and_prompts.md
- src/gmBridgeRunner.ts
- src/statePatch.ts
- src/types/TurnResult.ts
- src/gmPromptBuilder.ts
- src/playerAction.ts
- package.json

Implement only Phase 9A: an optional Grok-only split-role GM prototype.

Requirements:
1. Add `src/agenticGmCore.ts` with pure types/helpers for State Referee + Narrator prompt building, JSON parsing, and final `TurnResult` merge.
2. Add `scripts/test_agentic_gm_core.js` and wire it into `npm test`.
3. Add settings:
   - `textAdventure.gmBridge.agentic.enabled` default false
   - `textAdventure.gmBridge.agentic.fallbackToSingleStage` default true
   - `textAdventure.gmBridge.agentic.stageTimeoutMs` default 180000
4. Add `src/agenticGmRunner.ts` that supports `gmBridge.provider = "grok"` only.
5. In `gmBridgeRunner.ts`, call the agentic runner before the existing provider switch. If the runner returns `handled:false`, keep the old single-stage behavior.
6. Use `.text-adventure/agentic/` for intermediate prompts/results.
7. Never write stage candidates to `turn_result.json`. Only write final merged `TurnResult` after referee/narrator merge succeeds.
8. Keep `processTurnResult()` as the only final application/validation point.
9. If referee fails: no narrator; fallback to single-stage when configured.
10. If narrator fails: merge referee candidate with local fallback narration and still write final `turn_result.json`.
11. Do not refactor all providers. Do not implement vscode-lm/ollama/koboldcpp/openrouter agentic support in Phase 9A.
12. Do not let narrator output override `statePatch`, `diceLedger`, or `resolvedQuests`.

After implementation:
- update CHANGELOG.md [Unreleased]
- add a concise AI_SHARED_LOG.md entry
- run `npm run compile`, `npm test`, and `node scripts/validate_utf8_docs.js`
- do not commit/push unless the user explicitly asks
```

## Phase 10: VS Code/Git Native Timeline

### Goal

Use Git branches as scenario timelines so users can checkpoint, branch, compare, and return to alternate story routes.

### Prompt for Claude

```markdown
LoreRelay Phase 10 planning/implementation request.
Design a VS Code/Git Native Timeline feature.

Requirements:
- Scenario saves should be branchable without touching the extension source repo by mistake.
- Work inside the active game workspace only.
- Webview should show timeline branches and allow safe checkout/branch creation.
- Never run destructive git commands automatically.
- Existing checkpoint and archive behavior must continue to work.

Start with:
1. A pure helper for safe workspace git command planning.
2. A minimal Webview panel/list for current branch and recent branch names.
3. Tests for command safety and path ownership.
```

## Phase 11: Adaptive TTS / NPC Voice Profiles

### Goal

Give NPCs persistent voice profiles that route to system TTS first (Web Speech API), with optional local/external providers later.

### Design doc (source of truth)

`PHASE11_ADAPTIVE_TTS_DESIGN.md` — read before any implementation.

### Suggested AI split

| Step | AI | Deliverable |
|------|-----|-------------|
| 1 | **Claude** | Schema review, mood modifier table, World UI spec, parser caps — **done** |
| 2 | **Grok** | Phase 11A implementation + tests — **done** (`dccc9e0`) |
| 3 | **Grok** | Phase 11B local/external bridge + speakerNpcId — **done** (`84ce98d`) |
| 4 | **ChatGPT** | Privacy/security/code review after 11A+11B — **next** |

### Prompt for Claude (design / schema review)

```markdown
LoreRelay Phase 11A design review (Claude).

Read first:
- PHASE11_ADAPTIVE_TTS_DESIGN.md
- src/npcRegistryCore.ts, src/npcRegistry.ts
- webview/modules/60-tts-quickreply-imagegen.js (speakText, getBestVoiceForLocale)
- webview/modules/85-world.js (NPC cards)
- AI_ROADMAP.md Phase 11

Tasks:
1. Confirm or revise NpcVoiceProfile fields, clamps, and parser rules.
2. Propose applyMoodModifiers() numeric table (mood → rate/pitch delta).
3. Specify World tab NPC voice preview UI (minimal DOM + i18n keys list).
4. Document sender→NPC attribution edge cases (duplicate names, GM narration).
5. List any GameEntry.speakerNpcId concerns — recommend 11A vs 11B.

Output:
- Short review appended to PHASE11 or AI_SHARED_LOG
- If schema changes needed, patch PHASE11_ADAPTIVE_TTS_DESIGN.md sections 5–7 only
- Do NOT implement yet unless user asks
```

### Prompt for Grok (Phase 11A implementation)

```markdown
LoreRelay Phase 11A implementation (Grok).

Read first:
- PHASE11_ADAPTIVE_TTS_DESIGN.md (follow exactly)
- src/npcRegistryCore.ts, src/npcRegistry.ts
- webview/modules/60-tts-quickreply-imagegen.js
- webview/modules/85-world.js, src/worldView.ts
- package.json (add textAdventure.tts.external.enabled default false)

Implement Phase 11A only:
1. src/npcVoiceCore.ts — profile parse/clamp, mood modifiers
2. src/ttsProviderCore.ts — resolveTtsPlan(), provider fallback
3. Extend npc_registry parser for optional voice field
4. Webview: speakWithProfile(), chat 📢 attribution by sender name
5. World tab: NPC 🔊 Preview button
6. scripts/test_npc_voice_core.js, scripts/test_tts_provider_core.js in npm test
7. i18n × 4 locales, testing_checklist.md manual steps
8. CHANGELOG [Unreleased], AI_SHARED_LOG, AI_ROADMAP checkboxes

Constraints:
- Execute system TTS only; local/external = plan + fallback log, no network
- Do not change processTurnResult() or GM Bridge
- Core/wrapper split: no vscode import in *Core.ts
- Match existing code style; minimal diff

Verify: npm run compile && npm test
Commit message: feat(phase-11a): NPC voice profiles and system TTS routing
```

### Prompt for ChatGPT (post-11A+11B review)

Scope: **11A and 11B are both merged on `main` (v1.10.0 codebase).** Do not re-scope 11B as future work — review what shipped.

**Commits (reference):**

- `dccc9e0` — feat(phase-11a): NPC voice profiles and system TTS routing
- `9c2c7b7` — docs: Code Comments rule + Phase 11 doc pass
- `84ce98d` — feat(phase-11b): local and external TTS bridge

**Primary files:**

| Area | Paths |
|------|--------|
| Design | `PHASE11_ADAPTIVE_TTS_DESIGN.md` |
| Core | `src/npcVoiceCore.ts`, `src/ttsProviderCore.ts`, `src/ttsBridgeCore.ts` |
| Extension | `src/ttsBridgeRunner.ts`, `src/worldView.ts`, `src/statePatch.ts`, `src/extension.ts` |
| Schema | `src/types/GameState.ts`, `src/types/TurnResult.ts`, `game_state_schema.json` |
| Webview | `webview/modules/61-tts-npc.js`, `webview/modules/60-tts-quickreply-imagegen.js`, `webview/modules/85-world.js` |
| Skill | `C:\AI\TextAdventureGMSkill\scripts\tts_local.py` (edge-tts local bridge) |
| Tests | `scripts/test_npc_voice_core.js`, `scripts/test_tts_provider_core.js`, `scripts/test_tts_bridge_core.js` |
| Manual | `testing_checklist.md` §7–8 |
| Docs | `CHANGELOG.md` [Unreleased], `AI_COLLABORATION.md` § Code Comments |

**Review focus:**

1. **Privacy** — `textAdventure.tts.external.enabled` default off; SecretStorage for API key; only speak text (≤4000 chars) sent to OpenAI; logs redact text (`redactTtsLogText`).
2. **Local bridge security** — `shell: false`, output only under `.text-adventure/tts/`, `isSafeTtsOutputPath`, stdin JSON to `tts_local.py`.
3. **Attribution** — sender name match, duplicate names + `currentLocationId`, `speakerNpcId` on `GameEntry` / `gmEntry`; no substring parsing inside GM prose.
4. **Fallback** — local/external unavailable → system TTS; bridge failure → `ttsAudioFailed` → Web Speech.
5. **Parser / caps** — `npcVoiceCore` clamps, `sanitizeVoiceId` rejects paths; registry round-trip.
6. **Webview** — `speakWithProfile` uses plain text / base64 audio only (no `innerHTML` on user content).
7. **Tests & checklist** — gaps for 11B, edge-tts missing, API key missing, oversized audio.

**Output format:** severity-tagged findings only (`Critical` / `High` / `Medium` / `Low`). No implementation — suggest fixes as bullet recommendations. If clean, say so explicitly.

---

### Copy-paste prompt for ChatGPT (Phase 11A+11B review)

以下をそのまま ChatGPT に貼る。

```markdown
# LoreRelay Phase 11A+11B code review (ChatGPT)

You are reviewing **Adaptive TTS / NPC voice profiles** already implemented on `main` (package.json version 1.10.0). Claude designed; Grok implemented. **Do not implement** — findings and recommendations only.

## Read first (in order)

1. `PHASE11_ADAPTIVE_TTS_DESIGN.md` — especially §5–9 (schema, privacy, 11A vs 11B scope)
2. `AI_COLLABORATION.md` — § Code Comments (mirror sync: Core ↔ `61-tts-npc.js`)
3. `CHANGELOG.md` — [Unreleased] Phase 11A / 11B entries
4. `testing_checklist.md` — §7 (11A), §8 (11B)

## Git reference (if you have repo access)

- `dccc9e0` — Phase 11A: npcVoiceCore, ttsProviderCore, Webview NPC TTS, World Preview
- `84ce98d` — Phase 11B: ttsBridgeCore, ttsBridgeRunner, speakerNpcId, OpenAI + edge-tts bridge

## Files to review

**Core (pure TS, no vscode):**
- `src/npcVoiceCore.ts`
- `src/ttsProviderCore.ts`
- `src/ttsBridgeCore.ts`

**Extension host:**
- `src/ttsBridgeRunner.ts` — spawn `tts_local.py`, OpenAI `/v1/audio/speech`, base64 to Webview
- `src/npcRegistry.ts` / `src/npcRegistryCore.ts` — optional `voice` on NpcEntry
- `src/worldView.ts` — pushes `npcTtsCatalog`, `ttsExternalEnabled`, `ttsLocalAvailable`
- `src/statePatch.ts` — `mergeGmEntryFromTurn` applies `gmEntry.sender` / `gmEntry.speakerNpcId`
- `src/extension.ts` — TTS API key SecretStorage, `requestNpcTts` handler
- `src/types/GameState.ts`, `src/types/TurnResult.ts`, `game_state_schema.json`

**Webview:**
- `webview/modules/61-tts-npc.js` — speakWithProfile, bridge TTS, attribution
- `webview/modules/60-tts-quickreply-imagegen.js`, `webview/modules/85-world.js`

**External script (workspace sibling, not always in same repo folder):**
- `TextAdventureGMSkill/scripts/tts_local.py` — edge-tts, stdin JSON → MP3

**Tests:**
- `scripts/test_npc_voice_core.js`
- `scripts/test_tts_provider_core.js`
- `scripts/test_tts_bridge_core.js`
- `scripts/test_npc_registry.js` (voice round-trip)
- `scripts/test_state_patch.js` (gmEntry speakerNpcId)

## Review questions

1. **Privacy / exfiltration:** Can NPC TTS accidentally send `game_state`, lore, or memories off-machine? Is OpenAI gated correctly? Are logs safe?
2. **Local TTS security:** Subprocess hardening (`shell: false`), path traversal on `outputPath`, temp file lifecycle, untrusted `tts.local.command`.
3. **Attribution correctness:** False positives when `sender` matches NPC name; duplicate names without `currentLocationId`; value of `speakerNpcId`; GM entries still default sender "Game Master".
4. **Fallback behavior:** external disabled, local/edge-tts missing, bridge timeout/failure — does UX degrade safely to system TTS?
5. **Data model:** `NpcVoiceProfile` caps, empty profile dropped, invalid provider coercion, `voiceId` not a filesystem path.
6. **Webview safety:** Any XSS or HTML injection path in TTS text handling? Base64 audio playback risks?
7. **Test gaps:** What should be added before a v1.11.0 release tag?
8. **Manual checklist:** Anything missing in `testing_checklist.md` §7–8?

## Output format

Return **only**:

### Summary (2–4 sentences)

### Findings table

| Severity | Area | File(s) | Issue | Recommendation |
|----------|------|---------|-------|----------------|
| Critical/High/Medium/Low | ... | ... | ... | ... |

If no issues: state "No Critical/High findings" and list optional Low polish items.

**Do not** write code patches unless a one-line pseudocode fix clarifies a Critical/High item.
**Do not** suggest re-doing 11B — it is shipped; only fixes and release blockers.
```

## Coordination Rules

- Log completed work in `AI_SHARED_LOG.md`.
- Completed user-visible changes go into `CHANGELOG.md` [Unreleased].
- Keep `AI_ROADMAP.md` checkboxes truthful.
- Run `npm run compile` and `npm test` before handing off.
