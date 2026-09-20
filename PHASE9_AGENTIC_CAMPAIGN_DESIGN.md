# Phase 9: Agentic Campaign Engine / Split-Role GM Design

Date: 2026-07-01 JST  
Status: Design ready for Grok implementation  
Primary implementer: Grok  
Review focus: ChatGPT/Codex after Phase 9A prototype

## 1. Goal

Phase 9 adds an optional two-stage GM flow:

1. **State Referee**: produces safe structured game changes.
2. **Narrator**: writes rich prose and presentation hints from the accepted referee result.

The goal is not to make every provider agentic immediately. The goal is to prove the architecture without breaking the current single-stage GM Bridge.

## 2. Non-Goals for Phase 9A

- Do not rewrite all GM providers.
- Do not change the default GM behavior.
- Do not let the Narrator edit `statePatch`, `diceLedger`, or `resolvedQuests`.
- Do not move validation out of `processTurnResult()`.
- Do not make clipboard/manual mode more complex in the first prototype.
- Do not add a large Webview UI for agent orchestration yet.

## 3. Existing Contracts That Must Stay True

### Final accepted result

`turn_result.json` remains the final contract.

The existing `src/statePatch.ts` `processTurnResult()` function remains the only accept point for applying:

- `statePatch`
- `resolvedQuests`
- narration merge into `game_state.entries`
- schema validation
- state journal write

Phase 9 must not apply referee patches directly to `game_state.json`.

### Current `TurnResult`

Current interface:

```ts
export interface TurnResult {
    turnId: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    statePatch?: StatePatchOp[];
    resolvedQuests?: string[];
    narration: string;
    media?: TurnMediaRequest;
    gmEntry?: TurnGmEntryMeta;
    beforeHash?: string;
    afterHash?: string;
    appliedAt?: string;
    triggeredLore?: string[];
}
```

Phase 9A should avoid changing this type unless there is a very small optional metadata addition. If metadata is added, prefer:

```ts
agentic?: {
    mode: "referee-narrator";
    refereeOk: boolean;
    narratorOk: boolean;
    refereeProvider?: string;
    narratorProvider?: string;
}
```

This metadata must never be required for old `turn_result.json` files.

## 4. Proposed Architecture

### New pure module: `src/agenticGmCore.ts`

This file should contain no VS Code imports, no spawn calls, and no filesystem writes.

Suggested types:

```ts
import type {
    DiceLedgerEntry,
    StatePatchOp,
    TurnGmEntryMeta,
    TurnMediaRequest,
    TurnResult
} from "./types/TurnResult";

export type AgenticStage = "referee" | "narrator";

export interface AgenticConfigSnapshot {
    enabled: boolean;
    fallbackToSingleStage: boolean;
    refereeProvider: "grok";
    narratorProvider: "grok";
}

export interface RefereeResultCandidate {
    turnId: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    statePatch?: StatePatchOp[];
    resolvedQuests?: string[];
    media?: TurnMediaRequest;
    refereeNotes?: string;
}

export interface NarratorResultCandidate {
    narration: string;
    gmEntry?: TurnGmEntryMeta;
    media?: TurnMediaRequest;
    triggeredLore?: string[];
}

export interface AgenticMergeResult {
    ok: boolean;
    result?: TurnResult;
    reason?: string;
}
```

Suggested pure functions:

```ts
export function buildRefereePrompt(input: {
    basePrompt: string;
    playerAction: string;
    diceLedger?: DiceLedgerEntry[];
}): string;

export function buildNarratorPrompt(input: {
    basePrompt: string;
    playerAction: string;
    referee: RefereeResultCandidate;
}): string;

export function parseRefereeResultJson(text: string): RefereeResultCandidate | null;

export function parseNarratorResultJson(text: string): NarratorResultCandidate | null;

export function mergeAgenticTurnResult(input: {
    playerAction: string;
    referee: RefereeResultCandidate;
    narrator?: NarratorResultCandidate | null;
    fallbackNarration: string;
}): AgenticMergeResult;
```

Rules for `mergeAgenticTurnResult()`:

- Require a valid `referee.turnId`.
- Require at least one narration string, either from `narrator.narration` or fallback.
- Copy `statePatch`, `diceLedger`, and `resolvedQuests` only from referee.
- Copy `gmEntry`, `triggeredLore`, and rich narration only from narrator.
- Merge `media` conservatively:
  - referee media is allowed for mechanical requests,
  - narrator media may add presentation hints,
  - narrator must not remove referee media.
- Clamp string lengths before returning the final object.

### New runner module: `src/agenticGmRunner.ts`

This file can use VS Code APIs, filesystem, process spawning, and existing GM bridge helpers.

Responsibilities:

- Read Phase 9 settings.
- Build the referee prompt.
- Invoke the referee stage.
- Parse `referee_result.json` or captured stage output.
- Build the narrator prompt from the referee candidate.
- Invoke the narrator stage.
- Merge both stages into final `turn_result.json`.
- Write the final `turn_result.json` only after merge.
- Return success/failure to `gmBridgeRunner.ts`.

Suggested function:

```ts
export async function invokeAgenticGmBridge(input: {
    playerAction: string;
    diceLedger?: DiceLedgerEntry[];
    isContinuation: boolean;
}): Promise<{ handled: boolean; success: boolean; fallbackReason?: string }>;
```

`handled: false` means caller should continue with current single-stage provider.

`handled: true, success: false` means agentic mode was selected but failed without fallback.

### Integration point: `src/gmBridgeRunner.ts`

Add a small gate near the top of `invokeGmBridge()` after workspace/trust checks and before the provider switch:

```ts
const agentic = await maybeInvokeAgenticBridge(...);
if (agentic.handled) {
    if (agentic.success) { return true; }
    if (!agentic.fallbackToSingleStage) { return false; }
}
```

Then continue into the existing provider switch unchanged.

Phase 9A should support only:

- `gmBridge.provider = "grok"`
- `textAdventure.gmBridge.agentic.enabled = true`

All other providers should return `{ handled: false }`.

This keeps `vscode-lm`, `clipboard`, `ollama`, `koboldcpp`, `openrouter`, and custom command stable until Phase 9B.

## 5. Settings

Add settings in `package.json`:

```json
"textAdventure.gmBridge.agentic.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable experimental two-stage GM flow: State Referee then Narrator."
},
"textAdventure.gmBridge.agentic.fallbackToSingleStage": {
  "type": "boolean",
  "default": true,
  "description": "Fall back to the existing single-stage GM bridge if the agentic flow cannot start or fails before writing a final turn_result.json."
},
"textAdventure.gmBridge.agentic.stageTimeoutMs": {
  "type": "number",
  "default": 180000,
  "description": "Timeout for each agentic GM stage in milliseconds."
}
```

Optional later settings:

- `textAdventure.gmBridge.agentic.refereeProvider`
- `textAdventure.gmBridge.agentic.narratorProvider`
- `textAdventure.gmBridge.agentic.continueMode`

Do not add these in Phase 9A unless needed. Hard-code Grok as the first supported provider to reduce surface area.

## 6. Intermediate Files

Use a dedicated workspace-local folder:

```text
.text-adventure/agentic/
  referee_prompt.md
  referee_result.json
  narrator_prompt.md
  narrator_result.json
  final_turn_result.json
```

Important rules:

- Never write stage candidates to `turn_result.json`.
- Only write `turn_result.json` after `mergeAgenticTurnResult()` succeeds.
- Use atomic writes for JSON.
- Cap file reads:
  - prompt/result text: 1 MB max
  - parsed JSON arrays: reuse existing caps where possible

If Grok writes nothing useful, the runner can parse stdout as a fallback, but the preferred handoff is explicit stage files.

## 7. Prompt Design

### State Referee prompt

The referee prompt should say:

```markdown
You are LoreRelay's State Referee.

Your job is to produce mechanical state changes only.
Do not write narrative prose.
Do not edit game_state.json directly.
Do not write turn_result.json.

Write JSON only to:
.text-adventure/agentic/referee_result.json

Required JSON shape:
{
  "turnId": "stable-turn-id",
  "playerAction": "...",
  "diceLedger": [],
  "statePatch": [],
  "resolvedQuests": [],
  "media": {},
  "refereeNotes": "short summary for narrator"
}

Rules:
- Use only safe JSON Patch paths that LoreRelay already allows.
- Keep patches minimal.
- If no mechanical change is needed, statePatch may be [].
- resolvedQuests must contain only completed Quest Hook ids.
- refereeNotes must be short and must not include hidden chain-of-thought.
```

### Narrator prompt

The narrator prompt should say:

```markdown
You are LoreRelay's Narrator.

You receive an already accepted State Referee candidate.
You may write prose, mood, image prompt, and presentation hints.
You must not change mechanics.
Do not include statePatch, diceLedger, or resolvedQuests.
Do not edit game_state.json directly.
Do not write turn_result.json.

Write JSON only to:
.text-adventure/agentic/narrator_result.json

Required JSON shape:
{
  "narration": "rich GM narration",
  "gmEntry": {
    "imagePrompt": "optional concise image prompt"
  },
  "media": {
    "mood": "optional",
    "sfx": []
  },
  "triggeredLore": []
}
```

The narrator must see:

- player action
- current game context
- referee state patch summary
- referee notes
- active quest context

The narrator must not see instructions that encourage direct state writes.

## 8. Failure Behavior

### Referee fails

If the referee fails before producing a valid candidate:

1. Do not call narrator.
2. Do not write `turn_result.json`.
3. If `fallbackToSingleStage` is true, continue with the current single-stage provider.
4. If fallback is false, show an error and return false.

### Narrator fails

If the narrator fails after a valid referee candidate:

1. Create a short fallback narration locally:
   - "The world shifts in response to your action."
   - Include a one-sentence summary from `refereeNotes` if available.
2. Merge referee candidate + fallback narration.
3. Write final `turn_result.json`.
4. Let `processTurnResult()` apply and validate normally.

This is the important safety property: narrator failure must not corrupt state.

## 9. Clipboard / Manual Workflow

Phase 9A should not try to make clipboard fully two-stage.

Recommended behavior:

- If `gmBridge.provider = "clipboard"`, agentic runner returns `{ handled: false }`.
- Existing clipboard flow remains unchanged.
- Add documentation only:
  - advanced users can manually copy the referee prompt,
  - paste `referee_result.json`,
  - then copy narrator prompt.

Phase 9B can add explicit manual buttons if there is demand.

## 10. Test Plan

Add `scripts/test_agentic_gm_core.js`.

Minimum tests:

1. Referee + narrator success produces final `TurnResult`.
2. Narrator cannot override `statePatch`.
3. Narrator failure preserves referee patch and uses fallback narration.
4. Referee missing `turnId` is rejected.
5. Oversized narrator text is clamped.
6. `media` merge preserves referee media.
7. `resolvedQuests` only comes from referee.

If `agenticGmRunner.ts` has pure helper functions for command construction, test those without spawning Grok.

Do not write a test that requires real Grok, VS Code LM, Ollama, or ComfyUI.

## 11. Implementation Order for Grok

1. Add `src/agenticGmCore.ts`.
2. Add `scripts/test_agentic_gm_core.js` and include it in `npm test`.
3. Add settings in `package.json`.
4. Add `src/agenticGmRunner.ts` with Grok-only Phase 9A support.
5. Add the minimal gate in `src/gmBridgeRunner.ts`.
6. Add status output:
   - `Agentic GM: State Referee...`
   - `Agentic GM: Narrator...`
7. Update `AI_SHARED_LOG.md` and `CHANGELOG.md`.
8. Run:

```powershell
npm run compile
npm test
node scripts/validate_utf8_docs.js
```

## 12. Review Risks

Review Phase 9A for:

- Accidental direct writes to `game_state.json`.
- Any stage candidate being written to `turn_result.json` before merge.
- Narrator output being allowed to override mechanics.
- Grok session continuation mixing referee and narrator roles.
- Lack of timeout or process cleanup.
- Fallback causing duplicate GM calls after a valid final `turn_result.json`.
- Broken behavior when workspace is untrusted.

## 13. Copy-Ready Grok Prompt

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
