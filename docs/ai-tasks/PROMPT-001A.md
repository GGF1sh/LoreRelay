# Task Packet: PROMPT-001A

| Field | Description |
|:---|:---|
| **Task ID** | `PROMPT-001A` |
| **Status** | READY_TO_IMPLEMENT |
| **As-of Commit** | `6af4bc5` code baseline; Gate V2 at `6c403e3`; Chief amendment after V2 differential review |
| **Depends On** | None for staging implementation; terminal DONE depends on `PROMPT-001C` integration and the truthful Accepted boundary from `RUNTIME-002A` |
| **Gate Report V1** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md) (Claude Opus 4.8 — superseded / returned) |
| **Adversarial Review V1** | [`PROMPT-001A-ADVERSARIAL-REVIEW.md`](PROMPT-001A-ADVERSARIAL-REVIEW.md) (Gemini 3.1 Pro) |
| **Chief Disposition V1** | [`PROMPT-001A-INTEGRATOR-DISPOSITION.md`](PROMPT-001A-INTEGRATOR-DISPOSITION.md) |
| **Gate Report V2** | [`PROMPT-001A-GATE-REPORT-V2.md`](PROMPT-001A-GATE-REPORT-V2.md) (Claude Opus 4.8 — Option C staging) |
| **Adversarial Review V2** | [`PROMPT-001A-ADVERSARIAL-REVIEW-V2.md`](PROMPT-001A-ADVERSARIAL-REVIEW-V2.md) (Gemini 3.1 Pro differential review) |
| **Canonical Implementation Amendment** | [`PROMPT-001A-INTEGRATOR-AMENDMENT-V2.md`](PROMPT-001A-INTEGRATOR-AMENDMENT-V2.md) |

## Objective

Establish the merge-safe first stage of the Candidate → Budget → Delivered → Accepted → Consumed repair:

- create an explicit side-effect-free candidate path;
- move Inspector/Preview for Chronicle Recap and World Change Summary onto that pure path;
- preserve current production behavior behind an explicit legacy production path until PROMPT-001C performs the final authority switch.

The parent task remains open after staging implementation because the production eviction/provider-failure loss is not fixed until PROMPT-001C.

## Broken Invariant

Current shared candidate construction can advance Chronicle / World Change Summary consumption markers before budget selection, provider delivery, or canonical turn acceptance. Inspector/Preview can trigger the same consumption side effects.

The staging implementation fixes the Inspector/pure-path part without changing production authority.

## Required Implementation Shape

### No boolean/default mode

Do not add a boolean or default consumption switch such as:

```ts
buildGmPromptChunkSpecsWithMeta(..., true)
buildGmPromptChunkSpecsWithMeta(..., false)
```

Do not rely on omitted arguments to choose legacy or pure behavior.

### Explicit named paths

The implementation must provide two explicit internal authority paths:

1. a pure candidate path used by Inspector/Preview;
2. a legacy production path used by current production prompt assembly.

Exact names are implementation details, but the contract is equivalent to:

```text
buildCandidateSpecsPure(...)
buildLegacyProductionSpecs(...)
```

The pure path must be structurally unable to reach:

- `markWorldChangeSummaryInjected`
- `markChronicleInjected`
- `clearChronicleSessionPending`
- current consume paths for Chronicle Recap / World Change Summary

Only the explicit legacy production path may preserve these staging side effects.

### Current call-site ownership

- `buildGmPromptBreakdown` / Inspector → pure path
- `buildGmPromptChunkSpecs` → `buildGmPromptContext` / production → legacy production path

Any additional caller discovered during implementation is a stop condition. Report it before expanding scope.

## In Scope

- `src/gmPromptBuilder.ts` only.
- Pure candidate path for `chronicle` and `worldChangeSummary`.
- Explicit legacy production path preserving current production behavior.
- Inspector/Preview isolation for those two consumables.
- Tests required to prove purity and legacy parity.

## Out of Scope

- `RUNTIME-002A` and Accepted-boundary repair.
- Provider delivery receipt wiring.
- Immutable ACK token wiring.
- Final production authority switch.
- Category Budgeter algorithm redesign.
- Context Engine P2.
- Memory retrieval redesign.
- Inspector UI redesign.
- State Orchestrator redesign.
- Any source file outside `src/gmPromptBuilder.ts` unless the task is stopped for scope review.

## Touch Set

Primary and expected sole source file:

- `src/gmPromptBuilder.ts`

Tests may be added/updated only for PROMPT-001A behavior.

## Stage Acceptance Criteria

The staging implementation may pass its own quality gates only when all are true:

1. Inspector/Preview uses the explicit pure candidate path.
2. Pure candidate construction does not advance World Change Summary or Chronicle durable markers.
3. Pure candidate construction does not clear `chronicleSessionPending`.
4. Repeated Inspector/Preview builds leave those marker/pending values unchanged.
5. Production uses an explicit named legacy production path, not a boolean/default mode.
6. Production prompt output remains equivalent to the current baseline for the same state/action/configuration.
7. Production legacy marker values and pending-clear behavior remain equivalent to the current baseline during staging.
8. No source file outside `src/gmPromptBuilder.ts` is changed without scope review.
9. No provider runner, TurnResult acceptance path, budgeter core, or RUNTIME-002A code is modified.

## Required Tests

- pure candidate path leaves both durable markers unchanged;
- repeated pure builds leave markers and `chronicleSessionPending` unchanged;
- `buildGmPromptBreakdown` / `postPromptContextToWebview` isolation;
- production prompt output parity with baseline;
- production legacy marker/pending parity with baseline;
- explicit-path structural test/review: no boolean/default authority switch;
- flag/caller inventory: only Inspector uses pure entry and production uses legacy entry;
- diff-scope check: no unrelated source changes.

## Lifecycle / Done Semantics

Normal quality flow remains mandatory:

`READY_TO_IMPLEMENT → IMPLEMENTING → VERIFYING → BULK_AUDIT → SECOND_REVIEW`

After SECOND_REVIEW passes:

- if PROMPT-001C is incomplete, transition to `BLOCKED (Waiting for PROMPT-001C)`;
- do not transition to DONE.

PROMPT-001A reaches terminal DONE only after downstream integration proves:

- production uses the pure candidate path;
- evicted consumables are not consumed;
- provider/turn failure does not consume undelivered/unaccepted context;
- immutable delivery-time ACK tokens are used;
- consumption occurs only across the truthful Accepted boundary from RUNTIME-002A.

## Known Related Findings

- `CLAUDE-20260705-001` — absorbed into this staging implementation
- `CLAUDE-20260705-002` — absorbed into PROMPT-001C
- `CLAUDE-20260705-003` — absorbed into PROMPT-001C
- `GEMINI-20260705-002` — absorbed into PROMPT-001C
- `RUNTIME-002A`
- `PROMPT-001B`
- `PROMPT-001C`
- `PROMPT-001D2`

## ⚠️ Do Not Touch

- Category Budgeter internal algorithm
- provider runner delivery semantics
- TurnResult acceptance/dedupe ordering
- State Orchestrator transaction saving logic
- final consumption authority switch

## Current Lifecycle Note

Gate V2 survived differential adversarial review with required amendments. The canonical implementation contract is this Task Packet plus `PROMPT-001A-INTEGRATOR-AMENDMENT-V2.md`.
