# PROMPT-001C Canonical Gate Amendment

Task: `PROMPT-001C - Prompt Assembly Receipt + immutable ACK / Accepted consumption`

Applies over: `PROMPT-001C-GATE-REPORT.md` at `4829dc52209d1da2819161898ccf167f91d04543`

Current main at amendment: `3462c3ece8630dec71b7b8997c222bbd8c840c2a`

Final verdict: `READY_TO_IMPLEMENT`

## 1. Current source reality

Production prompt assembly still uses the PROMPT-001A staging legacy production path:

```text
buildGmPromptContext
-> buildLegacyProductionSpecs
-> buildLegacyProductionSpecsWithMeta
-> buildGmPromptChunkSpecsWithMeta
-> LEGACY_PRODUCTION_CONSUMABLE_BUILDERS
-> consumeChronicleRecapContext / consumeWorldChangeSummaryContext
-> evictPromptChunksByBudget
```

Provider realities:

- Grok writes/uses a prompt temp file, then an external process may write root `turn_result.json`.
- Local LLM scripts receive `--cwd`, `--action-file`, and provider options; scripts may write root `turn_result.json`.
- Custom command receives user-configured args and may write root `turn_result.json`.
- VS Code LM is host-owned: LoreRelay receives model text and writes `turn_result.json` through `vscodeLmWriteTurnResult`.
- Agentic is host-owned multi-stage: LoreRelay builds referee and narrator prompts, reads stage candidates, merges, and writes final `turn_result.json`.

Accepted callback reality:

- `beginGmRun(onAcceptedTurn)` stores one process-local callback.
- `markTurnResultHandled()` detaches callback state before invocation and isolates exceptions.
- RUNTIME-002A callback proves only a newly Accepted same-process TurnResult after canonical commit, not provider/run/receipt identity.

Chronicle/WCS reality:

- WCS durable marker is `lastInjectedWorldChangeSummaryTurn`.
- Chronicle durable marker is `lastInjectedChronicleTurn`.
- Chronicle also has module-local `chronicleSessionPending: boolean`.
- Current scalar markers cannot distinguish same-turn content revisions.

## 2. Adversarial dispositions

| Review attack | Disposition | Amendment |
|:--|:--|:--|
| LLM Receipt ID Echo Fallacy | ACCEPT | Model echo is diagnostic/requested only. Trusted bridge/runtime binding is required for ACK. |
| Bridge-side ID attachment | ACCEPT WITH MODIFICATION | Host-owned bridges attach directly. External bridges need per-run output or sidecar binding; latest-pending attachment is forbidden. |
| Multi-stage Agentic payload hash problem | ACCEPT | Use stable assembly identity, not one raw payload hash. Treat stage hashes as diagnostic. |
| Offline restart receipt loss | KEEP AS NON-GUARANTEE | Process-local V1 remains. No heuristic consume after restart. |
| Consume-time source hash recomputation race | ACCEPT WITH MODIFICATION | Tokens authorize bounded marker/digest transitions; no current-source recomputation gate. |
| Detach-before-invoke partial ACK failure | ACCEPT WITH MODIFICATION | ACK per token is independent; failures are isolated and retained in a small process-local compensation queue. |
| Chronicle pending generation problem | ACCEPT WITH MODIFICATION | Replace ambiguous boolean authority with pending generation/epoch semantics. |

## 3. Corrected authority state machine

```text
Candidate
-> Selected
-> Receipt Prepared
-> Lifecycle Bound
-> Delivered
-> Provider Result
-> Canonical Turn Accepted
-> Correlated
-> Consumed
```

Definitions:

- `Candidate`: side-effect-free chunk candidates and token candidates.
- `Selected`: budget survivors only.
- `Receipt Prepared`: immutable receipt object exists but is not delivered.
- `Lifecycle Bound`: receipt is bound to a provider lifecycle by trusted bridge/runtime state.
- `Delivered`: provider-specific boundary crossed.
- `Accepted`: RUNTIME-002A canonical commit boundary crossed.
- `Correlated`: trusted accepted result receipt ID equals callback-captured receipt ID.
- `Consumed`: receipt-bound ACK tokens applied after Accepted and Correlated.

Forbidden equivalences:

- Candidate is not Selected.
- Selected is not Delivered.
- Delivered is not Accepted.
- Accepted is not Correlated.
- Correlated is not automatically Consumed if individual ACK fails.

## 4. Non-circular receipt construction algorithm

1. Build pure candidates with text plus optional consumable token candidates.
2. Apply budget selection.
3. Drop all token candidates whose chunks were evicted.
4. Compute `assemblyDigest` over the ordered selected assembly, not over pre-budget candidates.
5. Generate `receiptId`.
6. Construct immutable `PromptDeliveryReceipt` with `receiptId`, `assemblyDigest`, selected chunk records, and selected token records.
7. Construct provider-specific payload or run metadata using the already-created `receiptId`.
8. Bind receipt to the provider lifecycle using trusted bridge/runtime state before dispatch.
9. Cross the provider-specific Delivered boundary.
10. If dispatch fails before Delivered, discard receipt and consume nothing.
11. On provider result, trusted bridge/runtime must attach or surface the lifecycle receipt ID without consulting latest pending receipt.
12. On RUNTIME-002A Accepted callback, compare accepted lifecycle receipt ID with the callback-captured immutable receipt.
13. ACK only matching receipt-bound tokens.

This is non-circular because `assemblyDigest` does not need `receiptId`, and `receiptId` does not need final raw transport bytes.

## 5. Correlation identity

Correlation identity answers:

```text
Which provider lifecycle did this Accepted result come from?
```

Canonical field:

```text
receiptId
```

Authority requirements:

- Generated by LoreRelay before provider dispatch.
- Captured by the `beginGmRun` callback closure.
- Bound to the provider lifecycle by trusted bridge/runtime transport.
- Exposed to the Accepted path as trusted metadata.
- Never inferred from timing.
- Never attached by looking up current/latest pending receipt when `turn_result.json` is parsed or observed.

If trusted correlation is missing, mismatched, stale, or unavailable, consume nothing.

## 6. Assembly identity

Assembly identity answers:

```text
Which selected context assembly was authorized for this lifecycle?
```

Canonical field:

```text
assemblyDigest
```

Digest input:

- ordered selected chunk IDs;
- content digest for each selected chunk;
- token identity for each selected consumable token;
- token marker target and source digest;
- prompt budget mode/target only if it changes selected assembly authority.

Digest exclusions:

- pre-budget candidates;
- raw prompt file path;
- raw transport formatting;
- provider-specific wrapper text that does not affect selected context authority;
- timestamps.

## 7. Transport hash disposition

Raw final payload hash is:

`DIAGNOSTIC_ONLY`

Reason:

- Grok/local/custom use files/processes and may transform representation.
- VS Code LM constructs a chat message rather than a file-only payload.
- Agentic has multiple stage prompts.
- Raw formatting is brittle and not the authority question PROMPT-001C needs to answer.

Implementation may store `transportPayloadHash` or per-stage transport hashes for logs/tests, but ACK authority must use `receiptId` correlation plus `assemblyDigest`/token identities.

## 8. Provider-specific lifecycle binding

### Grok bridge

Required trusted binding:

- Create receipt before writing prompt file.
- Write receipt sidecar or per-run metadata under a run-specific temp path.
- Prefer a per-run output path if Grok can be directed to write there.
- If Grok still writes root `turn_result.json`, the result must include trusted sidecar/run metadata created before dispatch; model echo alone is insufficient.
- If trusted lifecycle metadata cannot be obtained, Accepted may still apply the turn but ACK must not consume.

Forbidden:

- Parse root `turn_result.json` and attach current pending receipt.

### Local LLM bridge

Required trusted binding:

- Pass receipt identity through host-controlled args/env/sidecar.
- Prefer scripts writing a per-run output path whose path is known only to that lifecycle.
- Host may normalize/copy the per-run result to root `turn_result.json` with receipt metadata attached.
- Root-only script output without trusted receipt metadata consumes nothing.

### Custom command bridge

Required trusted binding:

- Add supported placeholders/env such as receipt sidecar path or per-run output path.
- If user command does not participate in trusted output binding, Accepted remains valid but receipt ACK is skipped.
- No current/latest pending fallback.

### VS Code LM bridge

Required trusted binding:

- LoreRelay owns response parsing and `vscodeLmWriteTurnResult`.
- The lifecycle receipt ID is passed by closure/function argument into `vscodeLmWriteTurnResult`.
- LoreRelay attaches trusted receipt metadata to the produced `TurnResult`.
- Do not trust model echo for authority.

### Agentic bridge

Required trusted binding:

- LoreRelay owns stage orchestration and final `turn_result.json` write.
- The lifecycle receipt ID is attached by LoreRelay to the final merged TurnResult.
- Referee/narrator model echo is not authority.

## 9. Provider-specific Delivered boundaries

Each provider has `Prepared`, `DispatchAttempted`, `Delivered`, and `Failed`.

### Grok

- Prepared: receipt, prompt file, sidecar/output metadata, args built.
- DispatchAttempted: `spawn(grokCmd, args, ...)` called.
- Delivered: child process is successfully created and no synchronous spawn error has occurred; prompt file and sidecar are available to that process.
- Failed: spawn error or close before valid result/Accepted.

### Local LLM scripts

- Prepared: receipt, action/prompt files, sidecar/output metadata, args/env built.
- DispatchAttempted: `spawn(python, args, ...)` called.
- Delivered: child process is successfully created with lifecycle args/env available.
- Failed: spawn error or nonzero/invalid result before Accepted.

### Custom command

- Prepared: receipt, optional action file, sidecar/output metadata, substituted args built.
- DispatchAttempted: `spawn(executable, args, ...)` called.
- Delivered: child process is successfully created with configured receipt transport available.
- Failed: spawn error or nonzero/invalid result before Accepted.

### VS Code LM

- Prepared: receipt and final chat message built.
- DispatchAttempted: `model.sendRequest(...)` called.
- Delivered: `sendRequest` resolves to a response object and streaming begins or is available to consume.
- Failed: selection failure, sendRequest throw, stream throw, unusable output, or write failure before Accepted.

### Agentic

- Prepared: receipt and referee prompt built.
- DispatchAttempted: first stage `runAgenticStage` called.
- Delivered: referee stage provider process/request starts successfully with receipt-bound base context.
- Failed: referee stage timeout/exit/invalid candidate before final TurnResult.

## 10. Agentic multi-stage semantics

Agentic receives Chronicle/WCS context in `basePrompt`, which is included in both referee and narrator prompts.

Authority model:

- One selected assembly receipt represents the complete agentic GM lifecycle.
- Referee stage is the primary mechanics-authority stage.
- Narrator stage is a dependent narration stage.
- Separate stage transport hashes may be recorded diagnostically.
- Separate receipt IDs per stage are not required for PROMPT-001C because the same selected assembly is authorized for the lifecycle.

Failure semantics:

- Referee failure or invalid referee candidate: consume nothing.
- Referee success but narrator failure: fallback narration may still produce final TurnResult. If final TurnResult is Accepted and trusted receipt correlation matches, ACK may proceed.
- Merge failure before final TurnResult: consume nothing.
- Final TurnResult write failure: consume nothing.

## 11. Chronicle bounded ACK token

Token authority:

```ts
interface ChronicleAckToken {
  tokenId: string;
  chunkId: 'chronicle';
  sourceTurn: number;
  sourceDigest: string;
  pendingGeneration: number;
}
```

The token authorizes only:

- recording that Chronicle source `(sourceTurn, sourceDigest)` was delivered and accepted;
- advancing `lastInjectedChronicleTurn` to `sourceTurn` only paired with `lastInjectedChronicleDigest = sourceDigest`;
- clearing session pending only for `pendingGeneration`.

The token never authorizes:

- marking a newer `sourceTurn`;
- marking a different same-turn `sourceDigest`;
- clearing a newer pending generation;
- consuming any current file content not represented by the token.

If newer content appears:

- newer `sourceTurn` remains eligible because marker turn is lower;
- same `sourceTurn` with different digest remains eligible because marker digest differs.

If token is applied twice:

- second application is no-op when marker already records the same `(sourceTurn, sourceDigest)` and pending generation is already cleared or no longer current.

## 12. Chronicle pending-generation semantics

Replace ambiguous boolean-only authority with generation semantics:

```text
chronicleSessionPending: boolean
chronicleSessionPendingGeneration: number
```

Rules:

- `resetChronicleSessionPending()` sets pending true and increments generation.
- Candidate token captures current generation.
- ACK may clear pending only if pending is still true and current generation equals token generation.
- If another reset/generation occurs before old token ACK, old token may mark its bounded source digest but must not clear the newer generation.

Reachability:

- The broad delayed-generation race is possible whenever a receipt captures pending state and a later reset/session generation occurs before the old receipt ACK.
- Current source has only one boolean, so it cannot distinguish old and new pending reasons.
- The generation fix is the smallest correction; no broad Chronicle redesign is authorized.

## 13. WCS bounded ACK token

Token authority:

```ts
interface WorldChangeSummaryAckToken {
  tokenId: string;
  chunkId: 'worldChangeSummary';
  summaryTurn: number;
  sourceDigest: string;
}
```

The token authorizes only:

- recording that WCS source `(summaryTurn, sourceDigest)` was delivered and accepted;
- advancing `lastInjectedWorldChangeSummaryTurn` to `summaryTurn` only paired with `lastInjectedWorldChangeSummaryDigest = sourceDigest`.

The token never authorizes:

- marking a newer `worldTurn`;
- marking a different same-turn `recentChanges` digest;
- consuming current source content not represented by the token.

If newer WCS content appears:

- newer turn remains eligible;
- same turn with different digest remains eligible.

If token is applied twice:

- second application is no-op when marker already records the same `(summaryTurn, sourceDigest)`.

## 14. Partial ACK failure policy

Ordering:

```text
Accepted
-> verify trusted receipt correlation
-> create ACK work item from captured immutable receipt
-> attempt Chronicle ACK in isolated try/catch
-> attempt WCS ACK in isolated try/catch
-> record per-token success/failure
```

Rules:

- Each token is independently idempotent.
- Chronicle failure must not block WCS attempt.
- WCS failure must not revoke Accepted.
- Callback exception must not revoke Accepted.
- A failed token remains in a small process-local ACK compensation queue keyed by `receiptId` and `tokenId`.
- The queue is best-effort and lost on restart.
- No universal transaction system, durable queue, or rollback is introduced.

Receipt ownership:

- RUNTIME-002A callback state still detaches before invocation.
- The immutable receipt captured by closure is copied into the ACK work item before per-token attempts.
- Lifecycle detachment does not erase the local ACK work item while token attempts are in progress.

## 15. Missing/mismatched receipt policy

If Accepted succeeds but trusted correlation is:

- missing;
- mismatched;
- stale;
- unavailable after restart;
- model-echo-only without trusted bridge binding;

then:

- do not consume Chronicle;
- do not consume WCS;
- do not look up current/latest pending receipt;
- log/report the skipped ACK;
- preserve Accepted;
- retain diagnostics only while process-local state exists;
- lose the receipt after restart unless a future durable task changes scope.

## 16. Delayed A/current B proof

Attack:

```text
receipt A delivered
A delayed
A lifecycle ends
receipt B delivered
A result arrives
current pending = B
```

Why amended design is safe:

- A result may ACK only if trusted result metadata says `receiptId = A`.
- The B callback closure captures receipt B and requires accepted receipt ID B.
- If delayed A is observed while B is current, accepted receipt ID A does not match B, so B tokens are not consumed.
- If the implementation instead attaches B by reading latest pending at parse time, the required delayed-A/current-B test fails.

## 17. Restart guarantees/non-guarantees

Guaranteed in-process:

- no ACK before Accepted;
- no ACK without trusted receipt correlation;
- no ACK from latest-pending lookup;
- no double ACK for repeated token application.

Not guaranteed:

- durable receipt recovery;
- cross-restart exactly-once ACK;
- durable Accepted replay/dedupe;
- campaign identity;
- provider-specific session identity.

Rejected heuristic:

```text
worldTurn advanced
-> probably consume old receipt
```

PROMPT-001A can reach DONE with process-local-only guarantees because the remaining failure mode is repeated context after restart, not wrong-context consumption before Accepted.

## 18. Final production call graph

Target:

```text
provider bridge
-> build pure prompt candidates with token candidates
-> budget selection
-> selected assembly digest
-> receiptId + immutable receipt
-> provider-specific trusted lifecycle binding
-> Delivered boundary
-> provider result
-> trusted receipt metadata attached/surfaced
-> RUNTIME-002A Accepted
-> callback closure compares accepted receiptId to captured receiptId
-> independent bounded ACK token attempts
```

Production must no longer call legacy consuming builders.

Inspector remains:

```text
buildGmPromptBreakdown
-> buildInspectorPromptAssembly
-> read-only/peek paths
```

## 19. Exact touch set

MUST CHANGE:

- `src/gmPromptBuilder.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`
- `src/types/TurnResult.ts`

MAY CHANGE:

- `src/vscodeLmTurnResultCore.ts`
- `src/agenticGmCore.ts`
- `src/turnResultFallback.ts` only for narrow receipt metadata plumbing while preserving RUNTIME-002A ordering
- `src/gameStateSync.ts` only if Accepted result metadata must be passed to callback without changing Accepted boundary
- `src/worldState.ts` for bounded digest marker fields
- focused tests under `scripts/`
- `scripts/run_all_tests.js`
- provider script arguments only as needed for per-run output/sidecar support

MUST NOT CHANGE:

- Category budgeter redesign
- Durable TurnResult replay/dedupe
- Campaign identity architecture
- Provider-specific session identity architecture
- TEMP checkpoint/restore
- Debug Hub UX
- Remote play
- Deterministic replay architecture
- RUNTIME-002A Accepted ordering semantics

## 20. MUST CHANGE

- Production prompt assembly must use pure candidate construction.
- Legacy consuming production builders must become unreachable from production.
- Budget selection must happen before receipt tokenization as Delivered.
- Receipt construction must produce `receiptId`, `assemblyDigest`, selected chunk records, and selected token records.
- Trusted correlation must be provider-specific and lifecycle-bound.
- ACK tokens must advance only bounded marker/digest pairs.
- Chronicle pending must use generation semantics.
- Partial ACK failures must be isolated per token.

## 21. MAY CHANGE

- Introduce `PromptDeliveryReceipt`, `PromptAssemblyDigest`, `PromptConsumableAckToken`, and helper modules.
- Add optional diagnostic transport hashes.
- Add process-local ACK compensation queue.
- Add run-specific temp output paths/sidecars for external providers.
- Add localized or non-localized provider instructions if useful, but instructions are not authority.

## 22. MUST NOT CHANGE

- Do not trust LLM echo as sole correlation.
- Do not attach latest/current pending receipt at parse/observe time.
- Do not consume after restart by heuristic.
- Do not make raw payload hash authority.
- Do not add durable receipt store.
- Do not redesign budget categories.
- Do not alter Inspector read-only behavior.

## 23. Required tests

At minimum, behavioral proof is required for:

1. evicted Chronicle not tokenized as Delivered;
2. evicted WCS not tokenized as Delivered;
3. provider launch failure consumes nothing;
4. delayed A result cannot consume B receipt;
5. current/latest pending lookup mutation fails a test;
6. missing receipt correlation consumes nothing;
7. mismatched receipt correlation consumes nothing;
8. Accepted exact-match Chronicle ACK advances only receipt-bound generation;
9. Accepted exact-match WCS ACK advances only receipt-bound marker;
10. old Chronicle token cannot clear newer pending generation;
11. newer Chronicle content remains eligible;
12. newer WCS content remains eligible;
13. repeated token application is idempotent;
14. Chronicle ACK throw does not prevent WCS ACK attempt;
15. WCS ACK throw does not revoke Accepted;
16. callback exception does not revoke Accepted;
17. Agentic intermediate-stage failure consumes nothing;
18. production no longer reaches legacy consuming candidate builders;
19. Inspector remains read-only;
20. PROMPT-001A terminal-DONE conditions pass.

Provider-specific test coverage must include:

- VS Code LM host-owned TurnResult receives trusted receipt metadata without model echo.
- Agentic final TurnResult receives trusted receipt metadata without model echo.
- External bridge path with missing trusted metadata accepts the TurnResult but skips ACK.

## 24. Mutation sanity

Required mutation sanity:

- Replacing lifecycle-bound receipt lookup with mutable latest-pending lookup must cause delayed-A/current-B test to fail.
- Moving ACK before Accepted must cause Accepted-only test to fail.

Recommended mutation sanity:

- Marking WCS by turn only, without digest, must cause same-turn newer-content eligibility test to fail.
- Clearing Chronicle pending without generation check must cause old-token/new-generation test to fail.

## 25. PROMPT-001A terminal-DONE criteria

PROMPT-001A can become DONE only after PROMPT-001C verification proves:

- production uses pure candidate path;
- evicted consumables are not tokenized or consumed;
- provider launch/failure/parse/validation/commit failure does not consume;
- trusted receipt correlation exists for consuming paths;
- missing/mismatched/unavailable correlation consumes nothing;
- immutable bounded ACK tokens are used;
- Chronicle generation semantics prevent old tokens clearing new pending;
- WCS digest marker semantics prevent old tokens hiding same-turn newer content;
- consumption happens only after RUNTIME-002A Accepted;
- Inspector remains read-only;
- mutation sanity passes.

Process-local restart non-guarantee does not block PROMPT-001A DONE if documented and verified as repeat-only/no-wrong-consume.

## 26. Documentation Impact

Implementation must add concise source comments explaining:

- receipt creation authority;
- lifecycle-bound correlation and why latest-pending lookup is forbidden;
- assembly digest authority versus transport hash diagnostics;
- bounded ACK token marker/digest semantics;
- Chronicle pending generation semantics;
- Accepted-only ordering and partial ACK failure policy;
- process-local restart non-guarantees.

Later documentation updates should add these concepts to:

- Concept Glossary;
- Code Symbol Registry;
- Terminology Contract.

Do not edit those registry/glossary documents in PROMPT-001C unless separately authorized.

## 27. New finding candidates

No new independent finding candidate is created by this amendment.

Absorbed into PROMPT-001C:

- `CLAUDE-20260705-002`
- `CLAUDE-20260705-003`
- `GEMINI-20260705-002`

Remain separate:

- `CHATGPT-20260706-001`
- `CHATGPT-20260706-002`

## 28. Final verdict

`READY_TO_IMPLEMENT`
