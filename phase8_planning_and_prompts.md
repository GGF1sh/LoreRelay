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
| 1 | **Claude** | Schema review, mood modifier table, World UI spec, parser caps |
| 2 | **Grok** | Phase 11A implementation + tests |
| 3 | **ChatGPT** | Privacy/security review after 11A |

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

### Prompt for ChatGPT (post-11A review)

```markdown
LoreRelay Phase 11A code review (ChatGPT).

Read:
- PHASE11_ADAPTIVE_TTS_DESIGN.md
- git diff for Phase 11A (npcVoiceCore, ttsProviderCore, webview TTS, world NPC preview)
- CHANGELOG [Unreleased]

Review focus:
1. Privacy: external TTS gated, no accidental exfiltration
2. Attribution: sender name match false positives
3. Parser caps consistent with npc_registry patterns
4. Webview plain-text speak path (no innerHTML regression)
5. Missing tests or manual checklist gaps

Return: severity-tagged findings only; suggest Phase 11B scope separately.
```

## Coordination Rules

- Log completed work in `AI_SHARED_LOG.md`.
- Completed user-visible changes go into `CHANGELOG.md` [Unreleased].
- Keep `AI_ROADMAP.md` checkboxes truthful.
- Run `npm run compile` and `npm test` before handing off.
