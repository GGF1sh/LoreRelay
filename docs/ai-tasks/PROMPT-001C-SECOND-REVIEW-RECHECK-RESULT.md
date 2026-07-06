# PROMPT-001C Second Review Repair Recheck Result

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Repository | `GGF1sh/LoreRelay` |
| Review | `SECOND_REVIEW_REPAIR_RECHECK` |
| Current main | `d552c07938b3c2a8d82c0899e525ed0694eaa773` |
| Reviewed branch | `task/PROMPT-001C-receipt-accepted-consumption` |
| Reviewed branch tip | `9eb5b14636bc460841c22556d12f08a6efe0021b` |
| Repair commit | `9eb5b14636bc460841c22556d12f08a6efe0021b` |
| Verdict | `SECOND_REVIEW_FAIL` |

## Repository / Repair Identity

Repository identity was confirmed exactly as `GGF1sh/LoreRelay`.

At final ref refresh before writing this result:

```text
origin/main = d552c07938b3c2a8d82c0899e525ed0694eaa773
origin/task/PROMPT-001C-receipt-accepted-consumption = 9eb5b14636bc460841c22556d12f08a6efe0021b
```

The branch tip is exactly the supplied repair commit.

The repair diff from the previous Second Review result commit `897588afb0ec8a79b2f1f0edea369e94c4c1c634` changes exactly the six declared files:

- `src/promptReceiptCore.ts`
- `src/worldState.ts`
- `src/gmPromptBuilder.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`
- `scripts/test_prompt_receipt_accepted_consumption.js`

No source was modified during this recheck and no merge was performed.

## Documents Reviewed

- `docs/ai-tasks/PROMPT-001C-SECOND-REVIEW-RESULT.md`
- `docs/ai-tasks/PROMPT-001C-SECOND-REVIEW-INTAKE.md`
- `docs/ai-tasks/PROMPT-001C-SECOND-REVIEW-REPAIR-INTAKE.md`
- canonical `docs/ai-tasks/PROMPT-001C-GATE-AMENDMENT.md` at amendment commit `93abbc824be83b323abecaf2f77ecf63da1ec662`

## SR-001 Verdict — FAIL

The explicit three-way outcome type exists exactly as required:

```text
applied
alreadySatisfied
failed
```

The top-level ACK loop correctly keeps separate `succeededTokenIds`, `alreadySatisfiedTokenIds`, and `failedTokenIds`; only `failed` enters compensation, while `applied` and `alreadySatisfied` clear prior compensation for the same receipt/token.

The following repaired cases are correct:

- exact duplicate Chronicle marker + already-cleared matching generation -> `alreadySatisfied`, not failed, no compensation entry;
- exact duplicate WCS marker -> `alreadySatisfied`, not failed, no compensation entry;
- WCS stale turn -> `failed`;
- WCS same-turn different digest -> `failed`;
- WCS missing state / persistence rejection -> `failed`;
- Chronicle marker stale turn / same-turn different digest / persistence rejection -> marker sub-outcome `failed`;
- Accepted remains Accepted regardless of token outcome.

However, the Chronicle token is a compound ACK: marker transition plus pending-generation transition. The repair combines these with:

```text
if either sub-outcome is applied -> applied
else if either sub-outcome is failed -> failed
else -> alreadySatisfied
```

This ordering masks genuine failures whenever the other Chronicle sub-operation applies.

### SR-001-R1 — `applied` masks genuine Chronicle sub-failure

Current truth table includes:

| Marker outcome | Pending-generation outcome | Current combined outcome | Required |
|:---|:---|:---|:---|
| `applied` | `failed` | `applied` | `failed` |
| `failed` | `applied` | `applied` | `failed` |

Two concrete attacks therefore fail the requested outcome contract:

1. **Old generation, marker not yet recorded**
   - old token marker write succeeds -> `applied`;
   - newer pending generation blocks clear -> `failed`;
   - current combine returns `applied`;
   - no compensation entry is retained for the genuine generation failure.

2. **Stale/different-digest Chronicle marker while matching pending generation is clearable**
   - bounded marker application correctly returns `failed`;
   - pending generation clear returns `applied`;
   - current combine returns `applied`;
   - stale/different-digest failure is masked and no compensation entry is retained.

This directly contradicts the requested recheck contract that genuine stale/different-digest/persistence/generation failure remains `failed` with compensation retained.

### SR-001-R2 — old generation can become `alreadySatisfied` after a newer generation has already been cleared

`clearChronicleSessionPendingForGeneration` checks `!chronicleSessionPending` before checking generation equality.

Therefore:

```text
token generation = A
current generation = B (B > A)
current pending = false because B was already cleared
```

returns `alreadySatisfied` solely because pending is false, even though the token generation is stale.

If the Chronicle marker is also already the token's exact marker, the full token outcome becomes `alreadySatisfied`. This violates the explicit attack requirement that an old Chronicle generation must not become `alreadySatisfied` merely because a newer generation exists.

Generation mismatch must remain distinguishable from an exact same-generation already-satisfied no-op.

## SR-002 Verdict — PASS

`withPromptReceiptDiagnostics(...)` now returns:

- frozen top-level receipt;
- frozen diagnostics object;
- frozen `stageTransportPayloadHashes` array when present;
- frozen individual stage hash records;
- original `selectedChunks`, whose array and records are already frozen by receipt construction;
- original `selectedTokens`, whose array and records are already frozen by receipt construction.

Provider-path inspection confirms the shared helper is used by:

- Grok callback receipt;
- VS Code LM callback receipt and matching TurnResult metadata;
- Agentic referee callback receipt;
- Agentic final merged TurnResult metadata.

The prior local unfrozen helper in `gmBridgeRunner.ts` was removed. The prior raw diagnostic receipt spreads in `agenticGmRunner.ts` were replaced. No remaining unfrozen diagnostic rewrapping of `PromptDeliveryReceipt` was found in the relevant provider-bound paths.

SR-002 is resolved.

## Edge-Case Verdict — FAIL

| Edge case | Verdict | Reason |
|:---|:---|:---|
| one token `alreadySatisfied`, other `failed` | PASS | per-token loop remains independent; failed token is queued, no-op token is not |
| one token `applied`, other `alreadySatisfied` | PASS | both are non-failures and remain independently reported |
| repeated exact ACK after compensation history | PASS (static) | any later non-failed outcome clears the prior receipt/token compensation entry |
| old Chronicle generation must not become `alreadySatisfied` merely because newer generation exists | **FAIL** | pending-false check precedes generation mismatch check |
| old generation clear failure while marker applies | **FAIL** | `applied` masks `failed` in the compound Chronicle combiner |
| stale/different-digest marker failure while pending clear applies | **FAIL** | `applied` masks `failed` in the compound Chronicle combiner |
| same-turn WCS different digest | PASS | exact digest is required for `alreadySatisfied`; different digest remains `failed` |
| Accepted preservation | PASS | ACK outcomes remain post-Accepted compensation and never rollback Accepted |

## Regression Verdict — PASS for previously accepted authority contracts

The narrow repair did not regress:

- no latest/current pending receipt authority;
- delayed A cannot consume B;
- ACK only after Accepted and exact receipt/provider/assembly correlation;
- Chronicle old generation cannot clear a newer pending generation;
- WCS same-turn digest authority remains bounded;
- external provider paths without trusted metadata safely skip ACK;
- restart behavior remains process-local only.

The unresolved SR-001 problem is outcome/compensation truth for compound Chronicle ACK, not an authority widening or Accepted rollback.

## Test-Quality Verdict — FAIL

The added tests are behavior-based and load-bearing for the two narrow happy-path repairs they cover:

- exact duplicate Chronicle/WCS ACK no-op classification;
- no compensation entry for exact duplicates;
- diagnostics-wrapped receipt top-level/chunk/token/diagnostics freezing;
- post-binding mutation cannot alter ACK authority.

However, the suite does not cover the required adversarial edge matrix and therefore does not detect the surviving SR-001 defects:

- no `applied + failed` compound Chronicle outcome test;
- no `failed + applied` compound Chronicle outcome test;
- no assertion that an old generation remains failed after a newer generation has already been cleared;
- existing old-generation test verifies only that newer pending remains eligible, not that the old token reports `failed` and retains compensation;
- no mixed-token `alreadySatisfied`/`failed` or `applied`/`alreadySatisfied` behavioral test;
- no repeated exact ACK-after-compensation-history behavioral test.

The SR-002 test also uses only `transportPayloadHash`; it does not behaviorally assert freezing of the stage hash array and each stage record, although the production helper is statically correct there.

The repair-intake mutation sanity claims are not independently reproducible in this review environment. The committed tests are load-bearing for covered paths but incomplete for the requested edge attacks.

## Executable Verification

Independent executable verification was attempted but unavailable:

```text
git clone --branch task/PROMPT-001C-receipt-accepted-consumption ...
fatal: Could not resolve host: github.com
```

No GitHub Actions workflow runs exist for repair commit `9eb5b14636bc460841c22556d12f08a6efe0021b`.

Therefore:

- `npm ci --include=dev` — NOT RERUN;
- `npm run compile` — NOT RERUN;
- focused PROMPT-001C tests — NOT RERUN;
- `npm test` — NOT RERUN.

The repair intake reports compile clean and `223/223` passing, but that execution evidence was not independently reproduced here. Static review found a real contract defect that the current tests do not cover, so the reported `223/223` does not change the verdict.

## Blockers

### SR-001 remains unresolved

Required narrow correction:

- a genuine Chronicle marker failure or generation failure must not be masked by another sub-operation returning `applied`;
- generation mismatch must be checked before treating pending-false as `alreadySatisfied`, so an old generation cannot become satisfied merely because a newer generation was later cleared;
- add behavior tests for both mixed compound outcome orders and the newer-generation-already-cleared case;
- assert compensation retention for each genuine failure case.

SR-002 has no remaining blocker.

## New Findings

None independent. The defect is an incomplete repair of existing blocker `SR-001`, not a separate scope finding.

## PROMPT-001A Terminal-DONE Verdict

`NOT_SATISFIED`.

PROMPT-001A cannot reach terminal DONE while PROMPT-001C still misclassifies genuine Chronicle generation/marker failures and fails to retain truthful compensation state.

## Final Verdict

`SECOND_REVIEW_FAIL`
