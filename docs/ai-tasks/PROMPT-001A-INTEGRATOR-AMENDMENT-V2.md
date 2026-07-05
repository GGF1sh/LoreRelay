# Chief Integrator Amendment: PROMPT-001A Gate V2

| Field | Value |
|:---|:---|
| **Chief Integrator** | ChatGPT Browser |
| **Gate V2** | [`PROMPT-001A-GATE-REPORT-V2.md`](PROMPT-001A-GATE-REPORT-V2.md) |
| **Differential Review** | [`PROMPT-001A-ADVERSARIAL-REVIEW-V2.md`](PROMPT-001A-ADVERSARIAL-REVIEW-V2.md) |
| **Reviewed code baseline** | `6af4bc5` (source unchanged through review) |
| **Decision** | **ACCEPT_V2_WITH_REQUIRED_AMENDMENTS** |
| **Lifecycle result** | **READY_TO_IMPLEMENT after this amendment** |

---

## 1. Accepted Review Conclusions

The following V2 differential-review conclusions are accepted:

1. **Option C survives as the staging strategy.** Keeping production on legacy authority while creating a pure Inspector/candidate path is merge-safe and avoids repeat-injection regression.
2. **PROMPT-001A must not reach DONE after the staging implementation alone.** The production eviction/provider-failure loss remains until PROMPT-001C switches authority.
3. **Boolean mode selection is rejected.** A call such as `build...(false)` is not a strong enough architecture boundary for a consumption-sensitive path.
4. **Option A rejection rationale needs correction.** The provider-delay stale-ACK race is not the decisive reason to reject post-selection compatibility ACK. Option A remains rejected because Selected is still not Delivered or Accepted, so it intentionally ships a known early-consumption authority and creates transitional logic that PROMPT-001C must later remove.

No new Finding Candidate is created by this review.

---

## 2. Required Implementation Shape

### 2.1 No boolean/default consumption mode

The implementation must not expose a caller-selectable boolean such as:

```ts
buildGmPromptChunkSpecsWithMeta(..., true)
buildGmPromptChunkSpecsWithMeta(..., false)
```

It must also not rely on an omitted/default argument that silently means either legacy consumption or purity.

### 2.2 Named authority boundaries

The implementation must expose two explicit internal paths with self-describing names:

- a **pure candidate path** used by Inspector/Preview;
- a **legacy production path** used by current production prompt assembly.

Exact function names are implementation details, but the contract is equivalent to:

```text
buildCandidateSpecsPure(...)

buildLegacyProductionSpecs(...)
```

The pure path must be structurally unable to call:

- `markWorldChangeSummaryInjected`
- `markChronicleInjected`
- `clearChronicleSessionPending`
- the current `consume*` paths for these two consumables

The legacy production path is the only staging path allowed to preserve those current side effects.

### 2.3 Pure core + legacy adapter, not dual-authority ambiguity

The preferred shape is:

```text
PURE CANDIDATE CORE
  └─ peek Chronicle
  └─ peek World Change Summary
  └─ return candidate specs/meta

LEGACY PRODUCTION ADAPTER
  └─ preserve current production output and legacy marker/pending behavior
  └─ call the explicit production entry point only
```

The adapter may reuse the pure core only if tests prove legacy production parity. The Gate does not require a specific internal call sequence if a naive “pure build, then consume” order would alter existing behavior.

What is mandatory is the authority boundary:

- Inspector cannot accidentally select legacy authority;
- production cannot accidentally select pure authority through a missing/default flag;
- only the explicitly named legacy production path can reach consumption side effects during staging.

### 2.4 Current call-site ownership

Current relevant code has two staging consumers of the shared candidate builder:

- `buildGmPromptBreakdown` / Inspector path;
- `buildGmPromptChunkSpecs` → `buildGmPromptContext` / production path.

After implementation:

- Inspector must call the pure entry point;
- production must call the legacy production entry point.

Any additional caller discovered during implementation is a stop condition: report it before expanding scope.

---

## 3. Corrected Done Semantics

PROMPT-001A keeps its original parent objective. The staging implementation is necessary but not sufficient for terminal completion.

### Stage completion after implementation

The normal quality lifecycle still applies:

`READY_TO_IMPLEMENT → IMPLEMENTING → VERIFYING → BULK_AUDIT → SECOND_REVIEW`

After SECOND_REVIEW passes:

- if PROMPT-001C is not yet complete, transition to:

`BLOCKED (Waiting for PROMPT-001C)`

- do **not** transition to DONE.

This avoids two failures:

1. false-DONE while the production headline bug remains;
2. hiding unverified implementation inside BLOCKED before normal quality gates finish.

### Terminal DONE condition

PROMPT-001A can become DONE only after downstream integration proves that:

- production uses the pure candidate path;
- evicted consumables are not consumed;
- provider/turn failure does not consume undelivered/unaccepted context;
- PROMPT-001C uses immutable delivery-time ACK tokens;
- consumption occurs only across the truthful Accepted boundary supplied by RUNTIME-002A.

PROMPT-001C may perform the authority switch, but PROMPT-001A remains open until those parent invariants are integration-verified.

---

## 4. Stage Acceptance Criteria for PROMPT-001A Implementation

The implementation may pass its own VERIFYING / BULK_AUDIT / SECOND_REVIEW when all are true:

1. Inspector/Preview uses the explicit pure candidate path.
2. Pure candidate construction does not advance World Change Summary or Chronicle durable markers.
3. Pure candidate construction does not clear `chronicleSessionPending`.
4. Repeated Inspector/Preview builds leave those marker/pending values unchanged.
5. Production uses an explicit named legacy production path, not a boolean/default mode.
6. Production prompt output remains equivalent to the current baseline for the same state/action/configuration.
7. Production legacy marker values and pending-clear behavior remain equivalent to the current baseline during staging.
8. No source file outside `src/gmPromptBuilder.ts` is changed without stopping for scope review.
9. No provider runner, TurnResult acceptance path, budgeter core, or RUNTIME-002A code is modified.

The following are **not** stage acceptance criteria and remain terminal/integration criteria:

- production eviction loss fixed;
- provider failure retryability fixed;
- delivered receipt implemented;
- immutable ACK token wired;
- accepted-time consumption enabled.

Those belong to the final authority switch through PROMPT-001C and RUNTIME-002A.

---

## 5. Option A Correction

V2's original statement that Option A necessarily reproduces the provider-delay stale-ACK race is withdrawn.

A post-selection compatibility ACK could capture a source token before provider execution and therefore avoid that exact timing counterexample.

Option A is still rejected because:

- Selected is not Delivered;
- Selected is not Accepted;
- provider creation/transport/parse/validation/commit failures would still occur after consumption;
- it creates a second transitional consumption authority that PROMPT-001C must later remove;
- it weakens the atomic ownership split established after the V1 review.

Therefore the conclusion remains Option C, with corrected reasoning.

---

## 6. Residual Risks and Ownership

After PROMPT-001A staging implementation:

- production eviction loss remains — owned by final PROMPT-001C authority switch;
- provider failure early-consumption remains — owned by PROMPT-001C + RUNTIME-002A;
- Inspector display ordering artifact remains — PROMPT-001B / PROMPT-001C;
- false current Accepted boundary remains — RUNTIME-002A.

These residual risks must remain visible while PROMPT-001A is BLOCKED after its own quality gates.

---

## 7. Chief Verdict

**Gate V2 is accepted with the amendments above.**

PROMPT-001A may advance to `READY_TO_IMPLEMENT`.

Implementation must follow the explicit pure-path / legacy-production-path boundary and the amended lifecycle semantics. No implementation may declare the parent task DONE before PROMPT-001C completes the production authority switch and the parent invariants are integration-verified.
