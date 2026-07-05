# Verification Review: PROMPT-001A Option C Staging

| Field | Value |
|:---|:---|
| **Reviewer** | ChatGPT Browser / Chief Integrator |
| **Implementation Branch** | `task/PROMPT-001A-option-c-staging` |
| **Implementation Commit** | `b47f6264866a964832412b1ceaddfe30f3ccf0d0` |
| **Base Main** | `0289b347f6bef4b5c524d4fe959b7d9434d9ee58` |
| **Decision** | **VERIFYING — implementation shape accepted, one targeted test amendment required** |

---

## 1. Implementation Reality Check

The pushed branch and implementation commit exist and match the submitted report.

Changed files are limited to:

- `src/gmPromptBuilder.ts`
- `scripts/test_prompt_candidate_purity.js`
- `scripts/run_all_tests.js`

No forbidden source path appears in the implementation commit.

The source implements the required authority split:

- Inspector/Preview: `buildPureCandidateSpecsWithMeta`
- Production: `buildLegacyProductionSpecsWithMeta` / `buildLegacyProductionSpecs`
- Shared compatibility helper name retained: `buildGmPromptChunkSpecsWithMeta`
- Shared helper requires an explicit `GmPromptConsumableBuilders` strategy object
- No boolean/default authority mode is used

The pure strategy references only:

- `peekChronicleRecapContext`
- `peekWorldChangeSummaryContext`

The legacy strategy references only:

- `consumeChronicleRecapContext`
- `consumeWorldChangeSummaryContext`

`buildGmPromptBreakdown` calls the explicit pure entry point. `buildGmPromptContext` calls the explicit legacy entry point and continues to call `evictPromptChunksByBudget` directly.

Preliminary implementation verdict: **PASS**.

---

## 2. Verification Gap Found

The new targeted test claims to prove that repeated pure builds leave `chronicleSessionPending` unchanged by checking that Chronicle content appears on the second pure build.

That check is currently insufficient.

Current Chronicle injection rule is:

```text
if sessionPending: inject
else inject when lastInjectedTurn < chronicleSourceTurn
```

The current test fixture starts with `lastInjectedChronicleTurn` unset. Therefore, even if the first pure build accidentally cleared `chronicleSessionPending`, the second build could still inject because:

```text
(undefined ?? -1) < sourceTurn
```

The second appearance of Chronicle content does not independently prove that `chronicleSessionPending` remained true.

This is a **test-proof gap**, not evidence that the implementation itself is wrong. The implementation currently routes the pure path through `peekChronicleRecapContext`, which passes `consume=false`, so source review supports the intended behavior.

---

## 3. Required Test Amendment

Amend only `scripts/test_prompt_candidate_purity.js` unless the existing test structure absolutely requires otherwise.

The fixture must make Chronicle visibility depend specifically on `chronicleSessionPending`.

Recommended minimal pattern:

1. Create one journal turn, so `sourceTurn = 1`.
2. Initialize `world_state.json` with:

```json
{
  "lastInjectedChronicleTurn": 1
}
```

3. Module/session startup leaves `chronicleSessionPending = true`.
4. First pure Inspector build must show Chronicle because session pending is true.
5. Second pure Inspector build must also show Chronicle.

Why this proves the requirement:

- if the first pure build clears pending, then on the second build:
  - `sessionPending = false`
  - `lastInjectedChronicleTurn = sourceTurn = 1`
  - Chronicle must not inject
- therefore a second Chronicle appearance proves the pure path did not clear pending

Adjust durable-marker assertions accordingly:

- `lastInjectedChronicleTurn` should remain exactly `1`, not `undefined`
- `lastInjectedWorldChangeSummaryTurn` should remain unchanged from its fixture value

The production legacy parity section should still prove that the first production build clears session pending and the second production build does not re-inject Chronicle.

---

## 4. Required Re-verification

After the targeted test amendment:

1. run compile;
2. run `test_prompt_candidate_purity.js`;
3. run `test_context_inspector_integration.js`;
4. run the previously listed related prompt/chronicle tests;
5. run the full suite.

Report exact counts and failures.

No source-code redesign is requested. Do not modify `src/gmPromptBuilder.ts` unless the amended test exposes an actual implementation failure.

---

## 5. CI Truth

No GitHub status checks or workflow runs are currently associated with implementation commit `b47f626...`.

Therefore the reported `220/220` result is treated as **local test evidence**, not CI evidence.

---

## 6. Lifecycle Decision

`PROMPT-001A` advances from `READY_TO_IMPLEMENT` to `VERIFYING`.

It must not advance to BULK_AUDIT until the pending-isolation proof gap is repaired and the local verification suite passes again.
