# Task Packet: PROMPT-001A

| Field | Description |
|:---|:---|
| **Task ID** | `PROMPT-001A` |
| **Status** | **BLOCKED (Waiting for PROMPT-001C)** |
| **As-of Commit** | staging merged at `99a3b8e`; post-merge smoke passed on `7070912` |
| **Depends On** | terminal DONE depends on `PROMPT-001C` integration and the truthful Accepted boundary from `RUNTIME-002A` |
| **Gate Report V1** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md) (Claude Opus 4.8 — superseded / returned) |
| **Adversarial Review V1** | [`PROMPT-001A-ADVERSARIAL-REVIEW.md`](PROMPT-001A-ADVERSARIAL-REVIEW.md) (Gemini 3.1 Pro) |
| **Chief Disposition V1** | [`PROMPT-001A-INTEGRATOR-DISPOSITION.md`](PROMPT-001A-INTEGRATOR-DISPOSITION.md) |
| **Gate Report V2** | [`PROMPT-001A-GATE-REPORT-V2.md`](PROMPT-001A-GATE-REPORT-V2.md) (Claude Opus 4.8 — Option C staging) |
| **Adversarial Review V2** | [`PROMPT-001A-ADVERSARIAL-REVIEW-V2.md`](PROMPT-001A-ADVERSARIAL-REVIEW-V2.md) (Gemini 3.1 Pro differential review) |
| **Canonical Implementation Amendment** | [`PROMPT-001A-INTEGRATOR-AMENDMENT-V2.md`](PROMPT-001A-INTEGRATOR-AMENDMENT-V2.md) |
| **Verification Review** | [`PROMPT-001A-VERIFYING-REVIEW.md`](PROMPT-001A-VERIFYING-REVIEW.md) |
| **Verification Result** | [`PROMPT-001A-VERIFYING-RESULT.md`](PROMPT-001A-VERIFYING-RESULT.md) |
| **Bulk Audit Report** | [`PROMPT-001A-BULK-AUDIT-REPORT.md`](PROMPT-001A-BULK-AUDIT-REPORT.md) |
| **Second Review Report** | [`PROMPT-001A-SECOND-REVIEW-REPORT.md`](PROMPT-001A-SECOND-REVIEW-REPORT.md) |
| **Smoke Attempt 1** | [`PROMPT-001A-POST-MERGE-SMOKE-ATTEMPT-1.md`](PROMPT-001A-POST-MERGE-SMOKE-ATTEMPT-1.md) |
| **Post-Merge Smoke Result** | [`PROMPT-001A-POST-MERGE-SMOKE-RESULT.md`](PROMPT-001A-POST-MERGE-SMOKE-RESULT.md) |
| **Merge** | PR #2 merged at `99a3b8ed2e02898eb5f0f2db45b5bd15b1074ac5` |

## Objective

Establish the merge-safe first stage of the Candidate → Budget → Delivered → Accepted → Consumed repair:

- create an explicit side-effect-free candidate path;
- move Inspector/Preview for Chronicle Recap and World Change Summary onto that pure path;
- preserve current production behavior behind an explicit legacy production path until PROMPT-001C performs the final authority switch.

This staging objective is complete and merged.

The parent task remains open because production eviction/provider-failure loss is intentionally not fixed until PROMPT-001C.

## Broken Invariant

The original shared candidate construction could advance Chronicle / World Change Summary consumption markers before budget selection, provider delivery, or canonical turn acceptance. Inspector/Preview could trigger the same consumption side effects.

The merged staging implementation fixes the Inspector/pure-path part without changing production authority.

## Implemented Authority Shape

### Explicit pure path

Inspector/Preview:

```text
buildGmPromptBreakdown
→ buildPureCandidateSpecsWithMeta
→ buildGmPromptChunkSpecsWithMeta
→ PURE_CANDIDATE_CONSUMABLE_BUILDERS
→ peek only
```

Pure strategy:

- `peekChronicleRecapContext`
- `peekWorldChangeSummaryContext`

### Explicit legacy production path

Production:

```text
buildGmPromptContext
→ buildLegacyProductionSpecs
→ buildLegacyProductionSpecsWithMeta
→ buildGmPromptChunkSpecsWithMeta
→ LEGACY_PRODUCTION_CONSUMABLE_BUILDERS
→ consume
→ evictPromptChunksByBudget
```

Legacy strategy:

- `consumeChronicleRecapContext`
- `consumeWorldChangeSummaryContext`

### Authority constraints

- no boolean authority switch;
- no default authority argument;
- no omitted-argument authority selection;
- shared helper is reached through explicit named wrappers;
- Inspector uses the pure wrapper;
- production uses the legacy wrapper.

## Touch Set

Merged implementation/test files:

- `src/gmPromptBuilder.ts`
- `scripts/test_prompt_candidate_purity.js`
- `scripts/run_all_tests.js`

No provider runner, TurnResult acceptance path, budgeter core, RUNTIME-002A, PROMPT-001C, or State Orchestrator source was modified.

## Stage Acceptance Criteria — Final Result

1. Inspector/Preview uses the explicit pure candidate path — **PASS**.
2. Pure candidate construction does not advance World Change Summary or Chronicle durable markers — **PASS**.
3. Pure candidate construction does not clear `chronicleSessionPending` — **PASS**.
4. Repeated Inspector/Preview builds leave marker/pending state unchanged — **PASS**.
5. Production uses an explicit named legacy path, not a boolean/default mode — **PASS**.
6. Production output remains behaviorally equivalent to staging baseline — **PASS**.
7. Production legacy marker/pending behavior remains equivalent during staging — **PASS**.
8. Forbidden source paths unchanged — **PASS**.
9. No provider/TurnResult/budgeter/RUNTIME-002A scope expansion — **PASS**.

## Quality Evidence

### Implementation

Branch:

`task/PROMPT-001A-option-c-staging`

Branch tip:

`e1b47150f0932c68eb427a656048e289503cfc72`

Merged by PR #2 to:

`99a3b8ed2e02898eb5f0f2db45b5bd15b1074ac5`

### Verification

- source authority split: PASS;
- pending-isolation proof gap found and repaired;
- local compile: PASS;
- targeted/related tests: PASS;
- full local suite: `220/220` PASS;
- GitHub CI/status checks: none.

### Bulk Audit

Gemini 3.5 Flash verdict:

`BULK_AUDIT_PASS`

No hidden caller, authority leak, forbidden-file change, test bypass, chunk-order change, priority change, or new PROMPT finding was reported.

### Second Review

Gemini 3.1 Pro verdict:

`SECOND_REVIEW_PASS`

No merge-blocking issue was reported for:

- strategy mutability;
- production parity;
- authority boundary strength;
- test structural fragility;
- source drift / merge safety.

### Post-Merge Smoke

Smoke target:

`7070912f223364e0b19049336ba3ea0a39e4e046`

Results:

- clean detached worktree start: PASS;
- `99a3b8e` ancestry: PASS;
- source smoke: PASS;
- `npm ci`: PASS;
- compile: PASS;
- PROMPT-001A targeted test: 19 assertions PASS;
- Inspector integration: PASS;
- related tests: PASS;
- full suite: `220/220` PASS.

Final generated-file status noise was investigated and classified:

`EOL_ONLY_DIRTY`

Evidence:

- plain `git diff --exit-code`: exit 0, no patch;
- `--ignore-cr-at-eol`: exit 0;
- `git diff --binary`: no patch;
- `core.autocrlf=true`;
- generated tracked webview outputs showed EOL-state noise only.

This does not block PROMPT-001A.

Related hygiene candidate:

`CODEX-20260706-001`

in `docs/AI_FINDINGS_INBOX.md`.

## Lifecycle / Done Semantics

Completed staging lifecycle:

```text
READY_TO_IMPLEMENT
→ IMPLEMENTING
→ VERIFYING
→ BULK_AUDIT
→ SECOND_REVIEW
→ merge
→ POST_MERGE_SMOKE_PASS
→ BLOCKED (Waiting for PROMPT-001C)
```

Current state:

`BLOCKED (Waiting for PROMPT-001C)`

This is not a failure state for the staging implementation. It means PROMPT-001A has completed all work it can complete independently, but terminal DONE remains dependent on the downstream authority switch.

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
- `CODEX-20260706-001` — separate EOL/generated-file hygiene candidate
- `RUNTIME-002A`
- `PROMPT-001B`
- `PROMPT-001C`
- `PROMPT-001D2`

## ⚠️ Do Not Touch

While blocked, PROMPT-001A must not independently modify:

- Category Budgeter internal algorithm;
- provider runner delivery semantics;
- TurnResult acceptance/dedupe ordering;
- State Orchestrator transaction saving logic;
- final production consumption authority switch.

Those belong to downstream tasks.

## Current Lifecycle Note

PROMPT-001A Option C staging is merged and smoke-verified. No further independent work is authorized. Wait for PROMPT-001C and RUNTIME-002A integration before terminal DONE review.
