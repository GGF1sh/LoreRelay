# Context Engine P0 Inspector Design

Status: Design / implementation gate  
Date: 2026-07-04  
Owner: Codex / ChatGPT  
Recommended implementation model: Grok or Codex, reasoning High

## 1. Summary

Context Engine P0 is not a new retrieval engine yet. It is a read-only inspector for the current GM prompt assembly path.

The first useful step is to expose why each prompt chunk was included, skipped, truncated, or evicted. LoreRelay already has most of the plumbing:

- `src/gmPromptBuilder.ts` builds chunk specs and posts `PromptContextBreakdown` to the Webview.
- `src/gmPromptBuilderCore.ts` owns chunk priority, activation, never-evict rules, and global char-budget eviction.
- `src/promptContext.ts` defines the current inspector payload.
- `webview/modules/80-inspector.js` already renders `Prompt context (last GM call)`.

P0 should evolve that existing inspector into an internal context accounting surface. It must not change the GM prompt string, ledger writes, provider behavior, remote payloads, replay exports, or player-facing knowledge.

## 2. Goals

1. Show the last GM call's prompt composition in the Inspector.
2. Show included and omitted chunks with deterministic reasons.
3. Make budget pressure visible before changing priority numbers.
4. Preserve the current prompt output exactly.
5. Establish a safe accounting boundary for future Context Engine work.

## 3. Non-Goals

- No semantic retrieval, embeddings, vector DB, NotebookLM-style RAG, or Google Drive integration.
- No Claim / KnowledgeLedger / MemoryLedger persistence.
- No rumor propagation or belief revision.
- No new GM prompt content.
- No category-budget allocator yet.
- No automatic priority tuning.
- No `statePatch`, `TurnResult`, `stateOrchestrator`, ledger, replay, Remote Play, or Webview execution changes.
- No user-safe public accounting surface. This is internal Inspector only.

## 4. Existing Path To Preserve

Current GM path:

```text
playerAction
  -> buildGmPromptChunkSpecs()
  -> evictPromptChunksByBudget(specs, targetChars)
  -> chunks.join("\n\n")
  -> provider / bridge
  -> postPromptContextToWebview(playerAction)
```

P0 must keep `buildGmPromptContext(playerAction)` byte-for-byte equivalent for the same workspace and config. The inspector report is a sidecar built from the same chunk specs and budget rules.

## 5. Proposed Pure Core

Add a pure diagnostic helper. It can live in `promptContext.ts`, `gmPromptBuilderCore.ts`, or a new `contextInspectorCore.ts`. A new file is preferred to keep the future Context Engine vocabulary out of the low-level eviction code.

```ts
export type ContextInspectorDecision =
  | 'included'
  | 'included_pinned'
  | 'truncated_by_budget'
  | 'evicted_by_budget'
  | 'skipped_inactive'
  | 'skipped_empty';

export type ContextInspectorCategory =
  | 'system'
  | 'director'
  | 'scene'
  | 'party'
  | 'memory'
  | 'lore'
  | 'world'
  | 'npc'
  | 'resources'
  | 'settlement'
  | 'vehicle'
  | 'visual'
  | 'other';

export interface ContextInspectorItem {
  id: string;
  label: string;
  category: ContextInspectorCategory;
  priority: number;
  decision: ContextInspectorDecision;
  reasonCode: string;
  originalChars: number;
  finalChars: number;
  tokenEstimate: number;
  preview: string;
  pinned: boolean;
}

export interface ContextInspectorReport {
  version: 1;
  targetChars: number;
  targetTokensEstimate: number;
  totalOriginalChars: number;
  totalFinalChars: number;
  includedCount: number;
  omittedCount: number;
  truncatedCount: number;
  items: ContextInspectorItem[];
}
```

Required function:

```ts
export function buildContextInspectorReport(
  chunks: PromptContextChunkSpec[],
  targetChars: number,
  options?: {
    labels?: Record<string, string>;
    categories?: Record<string, ContextInspectorCategory>;
    inactiveIds?: string[];
  }
): ContextInspectorReport;
```

The helper must implement the same eviction behavior as `evictPromptChunksByBudget`, or share a common internal primitive with it. Duplication is acceptable only if parity tests lock it down.

## 6. Decision Semantics

### included

Chunk survived global eviction and is not pinned.

### included_pinned

Chunk survived because `isPromptChunkNeverEvict(id)` is true. Current pinned ids are `gameRules` and `narrativeTime`.

### truncated_by_budget

Chunk survived but `finalChars < originalChars`. Reason must not claim semantic compression; this is raw budget truncation only.

### evicted_by_budget

Chunk was non-empty and active, but removed by global budget pressure.

### skipped_inactive

Chunk was not built because `shouldIncludePromptChunk(id, activation)` returned false. P0 may include this only if `gmPromptBuilder.ts` records inactive ids before skipping. If that requires too much churn, defer this decision and report only built chunks.

### skipped_empty

Chunk builder ran but returned empty text. This is safe to report because no hidden inaccessible fact is implied.

## 7. Category Mapping

Initial deterministic mapping:

| Chunk ids | Category |
|---|---|
| `gameRules`, `narrativeTime` | `system` |
| `director`, `partyDirector`, `travelEncounters`, `livingWorldTravel` | `director` |
| `summary`, `chronicle`, `saga` | `memory` |
| `memory` | `memory` |
| `lorebook` | `lore` |
| `worldForge`, `worldState`, `worldChangeSummary` | `world` |
| `npcRegistry`, `livingWorldNpcBonds`, `livingWorldPlayerBonds`, `livingWorldFactionRelations` | `npc` |
| `campaignKit`, `discoveryLedger`, `campaignJobBoard`, `campaignResources` | `resources` |
| `settlement` | `settlement` |
| `vehicles`, `mobileBase` | `vehicle` |
| `vision` | `visual` |
| `party` | `party` |
| unknown | `other` |

This mapping is display/accounting metadata only. It does not change priority, prompt text, or budget allocation.

## 8. Data Boundary

P0 Inspector is internal developer/GM tooling.

Rules:

1. Send the report only through the existing local Webview Inspector payload.
2. Do not include it in Remote Play payloads.
3. Do not include it in replay exports.
4. Do not expose item ids, category names, omitted reasons, or previews to a future `accountingUserSafe` surface.
5. Previews are allowed in local Inspector because the current Inspector already shows included prompt text. For omitted chunks, use the chunk text only if it was already built by the host for this GM prompt path.
6. Do not enumerate inaccessible candidates. P0 traces chunks the current builder already considered, not hidden facts the actor cannot know.

This avoids the classic leak: "omitted because inaccessible secret exists."

## 9. Webview UX

Extend the existing Inspector prompt context block.

Add:

- Summary line:
  - target budget
  - original chars
  - final chars
  - included / omitted / truncated counts
- Filter chips or headings:
  - Included
  - Omitted
  - Truncated
- Per item:
  - label
  - category
  - priority
  - decision icon + text
  - chars `final/original`
  - token estimate
  - collapsed preview

No execute buttons. No "apply suggested priority" button. No mutation postMessage.

If the report is absent, the existing prompt section renderer must continue to work unchanged.

## 10. Host Integration

Recommended minimal integration:

1. `gmPromptBuilder.ts` creates the same `PromptContextChunkSpec[]` as today.
2. `buildGmPromptContext()` still calls `evictPromptChunksByBudget()` and returns the same string.
3. `buildGmPromptBreakdown()` calls `buildContextInspectorReport(specs, targetChars, ...)` and attaches it to `PromptContextBreakdown`.
4. `postPromptContextToWebview()` sends the expanded breakdown with no new message type.

Optional implementation simplification:

- Refactor `evictPromptChunksByBudget()` so it calls a shared pure primitive that returns final chunk records, then map to strings for backward compatibility.

Forbidden:

- Calling chunk builders twice if they perform file I/O and could diverge.
- Running new expensive searches only for the inspector.
- Reading additional ledgers only for the inspector.

## 11. Type Extension

Extend `PromptContextBreakdown`:

```ts
export interface PromptContextBreakdown {
  sections: PromptContextSection[];
  memoryBackend: string;
  matchedLore: PromptLoreMatch[];
  memoryMatches: PromptMemoryMatch[];
  hintPreview: string;
  budget?: PromptBudgetInfo;
  totalChars: number;
  totalTokensEstimate: number;
  contextInspector?: ContextInspectorReport;
}
```

The field is optional for backward compatibility.

## 12. Required Tests

Pure tests:

1. Empty chunk -> `skipped_empty`.
2. Pinned chunk remains included even when target budget is tiny.
3. Lower priority chunk is evicted before higher priority chunk.
4. Partially kept chunk is `truncated_by_budget`.
5. Report final texts match `evictPromptChunksByBudget()` output exactly.
6. Deterministic order: report items remain original chunk order.
7. Unknown chunk id maps to `other` and priority fallback remains stable.
8. Report is bounded: long previews are truncated.

Integration tests:

9. `buildGmPromptContext()` output is unchanged after inspector addition.
10. `PromptContextBreakdown.contextInspector` is present for a normal workspace.
11. Webview renderer handles missing `contextInspector`.
12. Webview renderer does not send any new host mutation message.
13. i18n keys exist for all new labels in `en`, `ja`, `zh-CN`, `zh-TW`.

Security tests:

14. Omitted inaccessible candidates are not fabricated or enumerated.
15. Report is not included in Remote/Replay sanitizers if those payloads are touched later.

## 13. Deferred To P1+

- Claim / KnowledgeLedger / MemoryLedger schema.
- `canAcquire()` / `canRecall()`.
- Category reserved budgets.
- LOD compression.
- Semantic retrieval.
- Actor-aware in-world chat memory search.
- User-safe aggregate-only accounting.
- Shadow comparison between old prompt builder and new Context Engine.

## 14. Grok / Coder Implementation Prompt

```markdown
LoreRelay Context Engine P0 Inspector implementation.

推奨モデル: Grok / Codex
推奨推論: High

Read first:
1. AI_SHARED_LOG.md Current Snapshot
2. CHANGELOG.md [Unreleased] and latest release
3. docs/CONTEXT_ENGINE_P0_INSPECTOR_DESIGN.md
4. docs/CONTEXT_ENGINE_DESIGN_BRIEF.md
5. docs/CONTEXT_ENGINE_NORTH_STAR.md
6. src/promptContext.ts
7. src/gmPromptBuilder.ts
8. src/gmPromptBuilderCore.ts
9. webview/modules/80-inspector.js
10. webview/index.html prompt context section

Task:
Implement P0 as a read-only extension of the existing Prompt Inspector.

Scope:
- Add a pure context inspector report builder.
- Attach optional `contextInspector` to `PromptContextBreakdown`.
- Render included/omitted/truncated chunk accounting in the existing Inspector.
- Preserve `buildGmPromptContext()` output exactly.
- Add focused tests from §12.

Forbidden:
- No GM prompt behavior change.
- No new ledger files.
- No statePatch / TurnResult / State Orchestrator changes.
- No semantic retrieval.
- No Remote/Replay/user-safe accounting exposure.
- No Webview mutation buttons or apply-priority actions.

Verification:
- npm run compile
- npm test
- node scripts/check_i18n_keys.js
- node scripts/validate_utf8_docs.js
```

## 15. Acceptance Criteria

P0 is complete when a developer can open the Inspector after a GM call and answer:

- Which chunks entered the GM prompt?
- Which chunks were omitted or truncated?
- Was the omission due to inactive module, empty text, or budget pressure?
- Which low-priority chunks are losing against world/vehicle/settlement/domain pressure?

And all of that must be visible without changing the actual GM prompt output.
