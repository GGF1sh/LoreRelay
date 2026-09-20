# PROMPT-001C Second Review Result

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Repository | `GGF1sh/LoreRelay` |
| Lifecycle reviewed | `SECOND_REVIEW` |
| Current main | `8ca65d6a751bdb66192e771252c55352c8e1a9f4` |
| Reviewed branch | `task/PROMPT-001C-receipt-accepted-consumption` |
| Reviewed branch tip | `6711d7e214129b11f59d412ab86d0e97275144af` |
| Implementation tip | `5449d89c6c401bfc62b13d117d57e8b444408aa2` |
| Re-verification docs commit | `6711d7e214129b11f59d412ab86d0e97275144af` |
| Verdict | `SECOND_REVIEW_FAIL` |

## Repository / Ref Confirmation

Repository identity was confirmed exactly as `GGF1sh/LoreRelay`.

At final ref refresh during this review:

```text
origin/main = 8ca65d6a751bdb66192e771252c55352c8e1a9f4
origin/task/PROMPT-001C-receipt-accepted-consumption = 6711d7e214129b11f59d412ab86d0e97275144af
```

`6711d7e` is exactly the branch tip. Its parent-side implementation is `5449d89`; the one branch-tip-only addition after the repair is the executable re-verification result document.

## Evidence Basis

Reviewed:

- canonical amended Gate at amendment commit `93abbc824be83b323abecaf2f77ecf63da1ec662`;
- `PROMPT-001C-VERIFYING-RESULT.md`;
- `PROMPT-001C-REPAIR-INTAKE.md`;
- `PROMPT-001C-REVERIFYING-RESULT.md`;
- `PROMPT-001C-BULK-AUDIT-RESULT.md`;
- `PROMPT-001C-BULK-AUDIT-CORRECTION.md`;
- final implementation source and focused tests at reviewed branch tip.

The re-verification document records clean compile, all targeted tests passing, full suite `223/223`, and required mutation sanity at the exact reviewed implementation. This second review independently inspected the final source/test contracts and current-main merge diff. No source was modified and no merge was performed.

## Final Review Matrix

| Focus | Verdict | Review result |
|:---|:---|:---|
| 1. Final implementation matches amended Gate | **FAIL** | Two unresolved contract defects remain: duplicate idempotent no-ops are recorded as compensation failures, and provider-bound callback receipts lose runtime immutability after diagnostic wrapping. |
| 2. No latest/current pending receipt authority | **PASS** | No current/latest-pending authority path was found; correlation is closure-bound and exact. |
| 3. Delayed A cannot consume B | **PASS** | Current callback replacement plus exact receipt/provider/assembly correlation prevents delayed A from consuming B; focused executable proof and mutation sanity exist. |
| 4. ACK only after Accepted + exact correlation | **PASS** | `markTurnResultHandled` invokes the detached callback only after the Accepted processing path; `acknowledgePromptReceiptAfterAccepted` exits before token work unless exact trusted metadata matches. |
| 5. Receipt and ACK work item authority immutable | **FAIL** | Constructed receipts and ACK work items are frozen, but actual Grok/VS Code LM/Agentic callback receipts are re-materialized with unfrozen object spreads when diagnostics are added. |
| 6. False/throw ACK failures remain truthful compensation failures | **FAIL** | Genuine injected `false`/throw failures are retained correctly, but native exact duplicate no-ops also return `false` and are therefore falsely queued as failures. |
| 7. Accepted never revoked by ACK failure | **PASS** | Per-token failures remain post-Accepted compensation outcomes; correlation remains true and no rollback path revokes Accepted. |
| 8. Chronicle old generation cannot clear newer generation | **PASS** | Generation capture and exact generation clear guard remain bounded; old token may mark its exact source but cannot clear a newer pending generation. |
| 9. WCS same-turn digest semantics bounded | **PASS** | Same-turn different digest remains eligible; token application cannot overwrite a different same-turn digest or newer turn. |
| 10. Agentic host-owned correlation correct | **PASS** | One lifecycle receipt represents the selected assembly; LoreRelay attaches metadata to the final merged TurnResult, not model echo. |
| 11. External provider paths safely skip ACK without trusted metadata | **PASS** | Local/custom paths have no receipt ACK callback; Grok missing metadata cannot correlate and therefore skips ACK. |
| 12. Restart behavior process-local only | **PASS** | No durable receipt recovery or heuristic post-restart consume was introduced; skipped ACK may repeat later. |
| 13. PROMPT-001A terminal-DONE criteria satisfied | **FAIL** | PROMPT-001C is not terminally Gate-conformant while the two findings below remain unresolved. |
| 14. Branch mergeable with current main | **PASS (technical)** | Branch is `3` commits ahead / `11` behind current main. Main-only changes since the merge base are documentation-only and do not overlap the implementation/source paths; no conflict-inducing path overlap was found. Merge is technically clean but not authorized by this review. |
| 15. No unresolved finding or scope leak remains | **FAIL** | Two in-scope blockers remain. No unrelated scope leak was found. |

## Correlation Verdict

**PASS.**

- Receipt identity is generated before provider dispatch.
- Production assembly is pure and receipt creation happens after budget selection.
- Exact correlation requires `receiptId`, `provider`, and `assemblyDigest`.
- Missing/mismatched correlation consumes nothing.
- Delayed A/current B is blocked by callback ownership plus exact identity matching.
- No mutable latest/current pending lookup was found.

## ACK Verdict

**FAIL.**

The repaired ACK loop correctly:

- creates a copied frozen ACK work item after correlation;
- isolates Chronicle/WCS attempts;
- records explicit injected `false` and thrown exceptions as failures;
- preserves Accepted.

However, the native token appliers use `false` for both real failure and valid idempotent no-op. The top-level ACK loop treats every `false` as a compensation failure. Therefore the compensation state is not truthful for repeated exact tokens.

## Chronicle / WCS Verdict

**PASS for bounded marker/generation authority; FAIL for duplicate ACK outcome classification.**

Chronicle generation and WCS same-turn digest protections are correct. The remaining defect is not an authority widening: it is that already-satisfied exact tokens are falsely reported and queued as failed compensation work.

## Provider-Path Verdict

**PASS for trusted-correlation routing and safe external skip; FAIL for callback-receipt immutability.**

VS Code LM and Agentic attach receipt metadata through host-owned paths. External paths without trusted metadata skip ACK. But provider-specific diagnostic wrapping creates mutable receipt-shaped objects that are captured as ACK/correlation authority.

## Restart Verdict

**PASS.**

Process-local V1 semantics remain intact:

- no durable receipt store;
- no cross-restart exactly-once guarantee;
- no heuristic consume;
- repeat-only behavior after lost ACK state remains the documented non-guarantee.

## PROMPT-001A Terminal-DONE Verdict

**NOT SATISFIED.**

The major PROMPT-001A terminal conditions are present and executable re-verification passed, but terminal DONE cannot be granted while PROMPT-001C still violates the immutable receipt contract and truthful/idempotent compensation semantics.

## Blockers

### SR-001 — Exact duplicate token no-op is misclassified as compensation failure

`src/worldState.ts` deliberately returns `false` when:

- the WCS marker already equals the token's exact `(summaryTurn, sourceDigest)`;
- the Chronicle marker already equals the token's exact `(sourceTurn, sourceDigest)`.

For a repeated Chronicle token, `clearChronicleSessionPendingForGeneration` also returns `false` after the pending generation has already been cleared. Consequently `applyChronicleAckToken` returns `false` for the already-satisfied duplicate.

`acknowledgePromptReceiptAfterAccepted` classifies every `false` as failure and inserts the token into the process-local compensation queue.

Result:

```text
first exact ACK  -> state applied successfully
second exact ACK -> state unchanged (correct no-op)
                 -> failedTokenIds populated (incorrect)
                 -> compensation queue populated (incorrect)
```

The existing repeated-token test checks only `correlated` and byte-identical world state. It does not assert empty `failedTokenIds` or empty compensation state, so the full `223/223` result does not cover this observable contract error.

This violates:

- required repeated-token idempotent no-op semantics;
- truthful compensation-failure reporting;
- the rule that compensation state represents actually failed token work.

Required narrow repair direction:

- distinguish `APPLIED`, `ALREADY_SATISFIED` / bounded stale no-op, and genuine `FAILED`; or
- otherwise make an exact already-applied token return successful no-op without weakening the requirement that genuine persistence `false` remains a compensation failure.

Required regression proof:

- repeat the exact Chronicle/WCS ACK and assert state unchanged, `failedTokenIds` empty, and no compensation queue entry is created.

### SR-002 — Provider-bound callback receipts lose runtime immutability after diagnostic wrapping

`createPromptDeliveryReceipt` correctly returns a frozen receipt and `createPromptReceiptAckWorkItem` correctly returns a copied frozen work item.

The actual provider paths then weaken the receipt invariant:

- `src/gmBridgeRunner.ts::withPromptReceiptDiagnostics` returns an unfrozen `{ ...receipt, diagnostics: ... }` object and that object is captured by Grok and VS Code LM Accepted callbacks;
- `src/agenticGmRunner.ts` similarly passes an unfrozen spread of `promptAssembly.receipt` with diagnostics into the Accepted callback.

The selected token arrays remain frozen, but the callback-captured top-level correlation authority fields (`receiptId`, `provider`, `assemblyDigest`) are writable at runtime on these replacement objects. The repair mutation test exercises the original frozen assembly receipt, not the provider-bound wrapped receipt actually captured by consuming callbacks.

This violates the amended Gate requirement that lifecycle-bound receipt authority remain immutable through callback capture.

Required narrow repair direction:

- preserve the original frozen receipt as callback authority and keep diagnostics outside authority; or
- construct a fully frozen diagnostic copy, including frozen nested diagnostic records/arrays.

Required regression proof:

- exercise the actual provider-bound receipt wrapper, attempt post-capture mutation of top-level identity and token authority, and prove mutation cannot alter correlation or ACK authority.

## New Findings

- `SR-001` — Exact duplicate token no-op is misclassified as compensation failure.
- `SR-002` — Provider-bound callback receipts lose runtime immutability after diagnostic wrapping.

No out-of-scope product change or unrelated scope leak was found.

## Mergeability

`MERGEABLE_WITH_CURRENT_MAIN` at the content-conflict level, but `NOT_MERGE_AUTHORIZED`.

The current-main delta since the implementation merge base is documentation-only and does not overlap the branch's implementation/source paths. The two blockers are semantic Gate blockers, not Git conflict blockers.

## Lifecycle Consequence

`SECOND_REVIEW` does not advance to `DONE`.

Return to a narrow repair cycle. Do not merge until both findings are repaired and independently re-verified.

## Final Verdict

`SECOND_REVIEW_FAIL`
