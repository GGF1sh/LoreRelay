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
| Phase 11 | Adaptive TTS / NPC voices | Grok | Planning |

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
```

### Prompt for Grok

```markdown
Implement a small Phase 9 prototype for LoreRelay only after reading ChatGPT's architecture.

Focus:
- gmBridgeRunner.ts routing for two-stage GM execution
- no breaking change to existing single-stage providers
- fallback to current behavior if second stage fails
- tests for command construction and failure handling

Do not implement broad refactors.
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

Give NPCs persistent voice profiles that can route to system TTS, local TTS, or external providers later.

### Prompt for Grok

```markdown
LoreRelay Phase 11 planning request.
Design Adaptive TTS / NPC voice profiles.

Read:
- src/npcRegistryCore.ts
- webview modules for TTS controls
- AI_ROADMAP.md Phase 11

Requirements:
- Add voice profile metadata to npc_registry.json safely.
- Keep provider-specific code optional.
- Support local/system TTS first.
- Do not hard-code paid external APIs as required.

Deliver:
- data model
- minimal UI plan
- provider abstraction
- privacy/security notes
- tests
```

## Coordination Rules

- Log completed work in `AI_SHARED_LOG.md`.
- Completed user-visible changes go into `CHANGELOG.md` [Unreleased].
- Keep `AI_ROADMAP.md` checkboxes truthful.
- Run `npm run compile` and `npm test` before handing off.
