# Task Packet: PROMPT-001A

| Field | Description |
|:---|:---|
| **Task ID** | `PROMPT-001A` |
| **Status** | GATE_DRAFTED |
| **As-of Commit** | `6af4bc5` code baseline |
| **Depends On** | None for Gate revision; final accepted-consumption authority belongs downstream of `RUNTIME-002A` |
| **Gate Report** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md) (Claude Opus 4.8) |
| **Adversarial Review** | [`PROMPT-001A-ADVERSARIAL-REVIEW.md`](PROMPT-001A-ADVERSARIAL-REVIEW.md) (Gemini 3.1 Pro) |
| **Chief Disposition** | [`PROMPT-001A-INTEGRATOR-DISPOSITION.md`](PROMPT-001A-INTEGRATOR-DISPOSITION.md) |

## Objective

Revise the original broad Gate into an atomic, merge-safe contract for **candidate/preview purity and pre-selection consumption removal**.

The revised Gate must not pretend that `onAcceptedTurn` is already a safe Accepted boundary. Final delivery receipts and accepted-time consumption belong to `PROMPT-001C`, downstream of `RUNTIME-002A`.

## Broken Invariant

Current candidate construction can advance Chronicle / World Change Summary consumption markers before budget selection, provider delivery, or canonical turn acceptance. Inspector/Preview can trigger the same side effects.

The original Gate correctly found the bug but over-expanded the implementation boundary and relied on a false Accepted callback.

## In Scope — Architecture Revision

- Define a side-effect-free candidate/preview build contract for relevant consumables.
- Define exactly which current `consume*` side effects must leave candidate construction.
- Ensure budget-evicted chunks are not consumed.
- Ensure Inspector/Preview cannot consume these chunks.
- Define a **merge-safe staging strategy** before `PROMPT-001C` lands.
- Decide whether a temporary compatibility ACK after selection is required, or whether PROMPT-001A and PROMPT-001C must be deployed atomically.
- Produce a narrowed implementation Touch Set and future tests.

## Out of Scope

- Fixing `lastProcessedTurnHash` / `markTurnResultHandled()` ordering (`RUNTIME-002A`).
- Defining the final authoritative Accepted boundary (`RUNTIME-002A`).
- Provider delivery receipt wiring (`PROMPT-001C`).
- Immutable ACK token consumption wiring (`PROMPT-001C`).
- Category Budgeter algorithm redesign.
- Context Engine P2.
- Memory retrieval redesign.
- Inspector UI redesign.
- State Orchestrator redesign.

## Expected Implementation Touch Set After Gate Approval

Primary:

- `src/gmPromptBuilder.ts`

The revised Gate must justify any additional file. Do not expand into provider runners or TurnResult acceptance paths under PROMPT-001A.

## Required Gate Questions

1. What makes Candidate/Preview construction side-effect free?
2. Which exact calls must become peek/read-only calls?
3. How is selected identity preserved enough to avoid consuming evicted chunks without stealing PROMPT-001C's receipt responsibility?
4. Can PROMPT-001A merge independently without causing Chronicle / World Change Summary to repeat forever?
5. If a temporary compatibility ACK remains, where does it occur, what failures does it still permit, and how is it removed by PROMPT-001C?
6. If no compatibility ACK is allowed, what atomic deployment/merge constraint prevents behavior regression?

## Future Acceptance Criteria

The revised Gate must make these verifiable:

- Candidate build does not write canonical state.
- Candidate build does not advance durable ACK markers.
- Candidate build does not clear `chronicleSessionPending`.
- Inspector/Preview can run repeatedly without changing marker or pending state.
- Budget-evicted chunks are not consumed.
- The staging plan does not silently create permanent repeated-injection behavior before PROMPT-001C.
- No provider runner or TurnResult acceptance code is modified by PROMPT-001A.

## Required Future Tests

- candidate purity: markers unchanged after build
- build N times: markers and pending unchanged
- Inspector/Preview isolation
- eviction: evicted consumable remains unconsumed
- staging behavior: non-evicted consumables follow the explicitly approved temporary or atomic-deployment contract
- structural check: PROMPT-001A does not wire provider/acceptance authority

## Known Related Findings

- `CLAUDE-20260705-001` — absorbed into this task
- `PROMPT-001B`
- `PROMPT-001C`
- `RUNTIME-002A`
- `PROMPT-001D2`

## ⚠️ Do Not Touch

- Category Budgeter internal algorithm
- provider runner delivery semantics
- TurnResult acceptance/dedupe ordering
- State Orchestrator transaction saving logic

## Current Lifecycle Note

Adversarial review returned the original broad Gate to architecture. No implementation may start until the revised Gate resolves the merge-safe staging problem and the Chief Integrator advances the task again.
