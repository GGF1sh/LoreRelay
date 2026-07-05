# Chief Integrator Disposition: PROMPT-001A Adversarial Review

| Field | Value |
|:---|:---|
| **Chief Integrator** | ChatGPT Browser |
| **Adversarial artifact** | [`PROMPT-001A-ADVERSARIAL-REVIEW.md`](PROMPT-001A-ADVERSARIAL-REVIEW.md) |
| **Gate artifact** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md) |
| **Reviewed main** | `6af4bc590725c4383da89ce44f4ec0c4124ebbed` |
| **Decision** | **RETURN_TO_ARCHITECTURE / TASK SPLIT ACCEPTED WITH CORRECTIONS** |

---

## 1. Accepted Adversarial Findings

The following Gemini conclusions are accepted:

1. **Candidate purity survives review.** Candidate/preview construction must not advance durable markers or clear session-pending state.
2. **The existing `onAcceptedTurn` boundary is not authoritative.** `markTurnResultHandled()` fires before `processTurnResult()` performs validation and canonical commit.
3. **A receipt containing only `chunkId` is insufficient.** Consumption must use the immutable source token that was actually delivered.
4. **The original PROMPT-001A scope is too broad for one implementation task.** Acceptance/dedupe correctness must be separated from prompt candidate purity and from delivered-receipt consumption.

---

## 2. Chief Integrator Corrections to the Gemini Report

### Correction A — the current failure path is not exactly “throw → outer retry → self-dedupe”

`processTurnResult()` catches its own errors and returns `false` for validation/commit failures. `processTurnResultFileAt()` currently:

1. stores `lastProcessedTurnHash`,
2. calls `markTurnResultHandled()`,
3. calls `processTurnResult(turnResult)`,
4. does not reject the turn when the result is `false`, and
5. still reaches `return true`.

Therefore the confirmed bug is stronger but slightly different from Gemini's scenario: **a failed canonical apply can already be marked handled/deduped and reported as processed without the outer retry path ever running.**

### Correction B — severity is P1, not P0, on current evidence

The behavior is a serious correctness and retry-suppression failure, but the review did not establish current security break, proven canonical data loss, or universal fundamental feature failure. Under the project severity policy, the promoted task is **P1** with **Critical priority**.

### Correction C — `TEMP-004` is rejected as the formal task ID

The bug is not primarily temporal checkpoint/restore behavior. It belongs to the GM run / TurnResult acceptance lifecycle. The formal task is:

`RUNTIME-002A — TurnResult handled/dedupe ordering and post-commit acceptance boundary`

### Correction D — immutable ACK token is required, but “current turn must equal source turn” is not the contract

Current marker APIs already accept an explicit source token and advance monotonically to exactly that token:

- `markWorldChangeSummaryInjected(worldTurn)`
- `markChronicleInjected(journalTurnCount)`

If turn 10 was delivered and current state has advanced to turn 12, acknowledging **exactly token 10** is valid and leaves later information pending. A strict `currentTurn === sourceTurn` equality check would incorrectly suppress valid ACKs.

The minimum contract is therefore:

- receipt carries the immutable delivery-time source token;
- consumption advances only to that delivered token;
- consumption must never recompute the ACK token from current state.

Campaign/timeline/run identity remains an architecture question for the revised Gate because a stale response after workspace switch or rewind could still attach an otherwise valid numeric token to the wrong runtime context.

---

## 3. Formal Task Split

### `RUNTIME-002A` — new dependency

**Objective:** establish a truthful Accepted boundary for TurnResult processing.

Must resolve at minimum:

- `lastProcessedTurnHash` must not suppress retry before canonical apply succeeds;
- `markTurnResultHandled()` must not fire acceptance callbacks before canonical apply succeeds;
- `processTurnResult(false)` must be observed as failure, not processed success;
- the task must define whether current post-game_state secondary-ledger partial failure still counts as Accepted under the existing compensation policy.

This is a P1 Architecture Gate before implementation.

### `PROMPT-001A` — return to architecture, narrow to candidate purity / staging

The revised Gate must isolate:

- candidate and preview construction are side-effect free;
- Inspector cannot consume;
- evicted chunks cannot be consumed;
- a merge-safe staging strategy exists before delayed consumption is wired.

Important staging problem: simply removing all current consumption and merging PROMPT-001A alone could cause Chronicle / World Change Summary to repeat forever until PROMPT-001C lands. The revised Gate must explicitly choose either:

- a temporary compatibility ACK after selection, clearly non-final and removed by PROMPT-001C; or
- an atomic merge/deployment constraint with PROMPT-001C.

Do not hide this integration dependency.

### `PROMPT-001C` — receipt + immutable ACK + accepted consumption

The task owns:

- preserving selected/delivered consumable identity;
- immutable source ACK tokens;
- actual provider-delivery receipt semantics;
- delayed consumption only after the accepted boundary established by `RUNTIME-002A`;
- removal of any temporary compatibility ACK introduced for staging.

Dependency order:

`RUNTIME-002A` → accepted boundary available

`PROMPT-001A` → pure candidate/preview path available

`PROMPT-001B` → broader Inspector read-only contract

then

`PROMPT-001C` → delivered receipt + accepted consumption authority switch

`PROMPT-001D2` remains downstream of A/B/C.

---

## 4. Candidate Triage

| Candidate | Decision | Reason |
|:---|:---|:---|
| `CLAUDE-20260705-001` | **ABSORB INTO PROMPT-001A** | Direct candidate/preview purity violation. |
| `CLAUDE-20260705-002` | **ABSORB INTO PROMPT-001C** | Pending clear belongs to final accepted-consumption semantics once candidate build is pure. |
| `CLAUDE-20260705-003` | **ABSORB INTO PROMPT-001C** | Single payload/receipt lineage should prevent independent second-build provenance drift; implementation must verify rather than assume. |
| `GEMINI-20260705-001` | **PROMOTE AS RUNTIME-002A; severity P1 / priority Critical** | Confirmed acceptance/dedupe ordering failure. |
| `GEMINI-20260705-002` | **ABSORB INTO PROMPT-001C** | Immutable delivery-time ACK token is part of receipt/consumption contract. |

---

## 5. Lifecycle Decision

- `PROMPT-001A`: `ADVERSARIAL_REVIEW` → `GATE_DRAFTED` (architecture revision required)
- `RUNTIME-002A`: new formal task at `CONFIRMED`
- No PROMPT implementation may start yet.
- The next architecture assignment is the focused PROMPT-001A amendment and task-packet rewrite; it must incorporate `RUNTIME-002A` as a dependency boundary rather than redesigning the runtime task itself.

