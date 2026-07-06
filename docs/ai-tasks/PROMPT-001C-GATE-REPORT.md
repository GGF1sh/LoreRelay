# PROMPT-001C Gate Report

Task: `PROMPT-001C - Prompt Assembly Receipt + immutable ACK / Accepted consumption`

Status: Architecture Gate only. No runtime or prompt source implementation is included in this report.

## 1. Current source reality

- Gate start fetch observed `origin/main` at `3e15c128f09f21d3da9e02655e2a25dcc15ce64a`.
- Before commit, `origin/main` advanced by documentation-only UX verification work; this Gate branch was fast-forwarded to current `origin/main` at `9753f67806424370bd2364dda797957bde40f3a4`.
- `PROMPT-001A` is staged and intentionally still blocked: Inspector/Preview use a pure path, but production still uses legacy consuming authority.
- `PROMPT-001B` is done: Inspector/Preview read-only, single assembly pass, post-merge re-smoke `222/222`.
- `RUNTIME-002A` is done: same-process Accepted callback is post-canonical `game_state` commit and exception-isolated.
- `docs/ai-tasks/PROMPT-001B-GATE-AMENDMENT.md` was requested but is not present on current `origin/main`; available final PROMPT-001B artifacts were read instead.
- `docs/AI_FINDINGS_INBOX.md` already contains PROMPT-001C-relevant findings `CLAUDE-20260705-002`, `CLAUDE-20260705-003`, and `GEMINI-20260705-002`.

Current production still calls:

```text
buildGmPromptContext
-> buildLegacyProductionSpecs
-> buildLegacyProductionSpecsWithMeta
-> buildGmPromptChunkSpecsWithMeta
-> LEGACY_PRODUCTION_CONSUMABLE_BUILDERS
-> consumeChronicleRecapContext / consumeWorldChangeSummaryContext
-> evictPromptChunksByBudget
```

Therefore Chronicle and WCS can still be consumed before budget survival, provider delivery, provider success, TurnResult parse/validation, canonical commit, or Accepted callback.

## 2. Exact production call graph

### Grok bridge

```text
invokeGrokBridge
-> buildGrokPrompt
-> buildGmPromptContext
-> legacy consumable builders
-> evictPromptChunksByBudget
-> writePromptFile
-> beginGmRun(callback sets grokSessionActive)
-> spawn provider
-> finishGmRun(success/failure)
-> checkPendingTurnResultFile / watcher
-> processTurnResultFileAt
-> processTurnResult
-> markTurnResultHandled
-> callback
```

### Local/custom bridge

```text
invokeLocalLlmBridge / custom command paths
-> prompt/action file path
-> beginGmRun(callback may set localGmSessionActive)
-> provider process
-> finishGmRun
-> same RUNTIME-002A Accepted path
```

### VS Code LM bridge

```text
invokeVscodeLmBridge
-> buildGmPromptContext
-> final userPrompt
-> beginGmRun(callback sets localGmSessionActive)
-> model.sendRequest / response stream
-> vscodeLmWriteTurnResult
-> finishGmRun(true)
-> same RUNTIME-002A Accepted path
```

### Agentic bridge

```text
maybeInvokeAgenticBridge
-> buildAgenticBasePrompt
-> buildGmPromptContext
-> beginGmRun(no accepted callback currently)
-> referee provider stage
-> narrator provider stage
-> write final turn_result.json
-> finishGmRun(true)
-> same RUNTIME-002A Accepted path
```

## 3. Current failure modes

- Budget eviction happens after legacy Chronicle/WCS consumption, so evicted consumables can be lost.
- Provider invocation failure happens after legacy consumption, so no-response attempts can consume.
- Provider unusable output, missing `turn_result.json`, parse failure, validation failure, and canonical commit failure happen after legacy consumption.
- RUNTIME-002A callback is truthful for Accepted timing but carries no receipt or provider-run identity.
- A delayed previous TurnResult can be observed while a later provider lifecycle is pending; current runtime cannot distinguish that from the later lifecycle.
- Restart loses pending callback and same-process dedupe state. Durable Accepted replay/dedupe remains `CHATGPT-20260706-001`, out of PROMPT-001C scope.

## 4. Authority state machine

The target production lifecycle is:

```text
Candidate
-> Budget Selection
-> Delivered
-> Provider Response
-> Canonical Turn Accepted
-> Consumed
```

Authority distinctions:

- `Candidate != Selected`: candidate specs are eligible only; no consume or ACK authority.
- `Selected != Delivered`: budget survivors are not consumed until a provider delivery identity exists.
- `Delivered != Accepted`: dispatch/response does not prove canonical state mutation.
- `Accepted != Consumed`: RUNTIME-002A acceptance is only the temporal gate; PROMPT-001C must also prove receipt correlation and token identity.

## 5. Receipt schema

The minimal immutable receipt is process-local and attached to one provider lifecycle:

```ts
interface PromptDeliveryReceipt {
  receiptId: string;
  workspacePath: string;
  payloadHash: string;
  selectedChunkIds: string[];
  consumableTokens: PromptConsumableAckToken[];
}

type PromptConsumableAckToken =
  | ChronicleAckToken
  | WorldChangeSummaryAckToken;
```

Required authority fields:

- `receiptId`: generic LoreRelay-generated correlation key. It must be embedded in the delivered provider payload and echoed into `turn_result.json`; otherwise the Accepted callback must not consume.
- `workspacePath`: prevents consuming against a different active workspace after multi-root changes or workspace switching. This is a local guard, not campaign identity architecture.
- `payloadHash`: binds the receipt to the exact final provider payload bytes/string, including the receipt instruction and selected chunks.
- `selectedChunkIds`: proves the delivered payload was after budget selection and records that evicted chunks are absent.
- `consumableTokens`: immutable per-consumable ACK tokens; only these may be consumed after Accepted.

Rejected fields for this task:

- Durable campaign/session identity: out of scope.
- Provider-specific session identity: out of scope.
- Created/delivered timestamps: useful diagnostics, not authority.
- Full prompt text in receipt: not required for authority if `payloadHash` is stored and tests prove hash construction over the exact payload.

## 6. Receipt creation boundary

Canonical boundary:

```text
after budget selection and final payload construction,
using a precomputed receipt embedded in that payload,
promoted to pending-delivered only after provider dispatch is successfully initiated
```

Rationale:

- Candidate build time is too early.
- After budget selection alone is too early because provider payload may still change.
- Immediately before provider call is when `receiptId` can be embedded and `payloadHash` can be computed.
- After provider request dispatch is when the receipt becomes valid as Delivered.
- After provider response is too late because the provider could not have received the receipt identity.

If provider dispatch throws before launch / `sendRequest` entry / process start, discard the receipt and consume nothing.

## 7. Immutable ACK token design

Each consumable candidate builder must return both display text and an immutable source token:

```ts
interface BaseAckToken {
  tokenId: string;
  chunkId: 'chronicle' | 'worldChangeSummary';
  sourceHash: string;
}
```

Token requirements:

- Built from peek/read-only source state only.
- Bound to exact delivered source content, not to mutable "current pending" state.
- Included in the receipt only if the chunk survived budget eviction and was included in the exact provider payload.
- Consumed only by token-specific consume functions after Accepted and receipt correlation.
- Idempotent: repeated callback/duplicate observation must not double-consume.

Rejected identities:

- turn-number only: fails when content changes under the same turn.
- mutable current marker identity: can consume newer content.
- chunk ID only: cannot distinguish source versions or newer content.

## 8. Chronicle token semantics

Source state:

- `state_journal.ndjson` turns used by `buildChronicle`.
- `world_state.json` fields used for recent changes / quest hooks in recap construction.
- `worldState.lastInjectedChronicleTurn`.
- module-local `chronicleSessionPending`.

Token shape:

```ts
interface ChronicleAckToken extends BaseAckToken {
  chunkId: 'chronicle';
  sourceTurn: number;
  sessionPendingAtReceipt: boolean;
}
```

`sourceHash` must hash the exact recap source used to create the delivered text, including source turn and relevant recap input content.

Consume/ack operation:

```text
consumeChronicleAck(token, receiptWorkspace)
-> verify workspace
-> recompute source hash for token.sourceTurn if possible
-> if hash matches and lastInjectedChronicleTurn < token.sourceTurn, markChronicleInjected(token.sourceTurn)
-> clear chronicleSessionPending only for the receipt-bound accepted token
```

Semantics:

- Stale token with newer journal turns: may mark only `sourceTurn`; newer turns remain eligible because current sourceTurn is greater.
- Same sourceTurn but changed source hash: do not consume.
- Already-consumed token: no-op.
- Newer content after receipt creation: must not be consumed by the old receipt.
- Callback exception after Accepted: cannot roll back Accepted; consumption failure is logged/compensation only.

## 9. WCS token semantics

Source state:

- `world_state.json.recentChanges`.
- `world_state.json.worldTurn`.
- `world_state.json.lastInjectedWorldChangeSummaryTurn`.

Token shape:

```ts
interface WorldChangeSummaryAckToken extends BaseAckToken {
  chunkId: 'worldChangeSummary';
  summaryTurn: number;
}
```

`summaryTurn` is the exact turn resolved by the current WCS builder for the delivered summary. `sourceHash` hashes the exact recent-change subset/text basis that generated the delivered WCS.

Consume/ack operation:

```text
consumeWorldChangeSummaryAck(token, receiptWorkspace)
-> verify workspace
-> recompute source hash for token.summaryTurn if possible
-> if hash matches and lastInjectedWorldChangeSummaryTurn < token.summaryTurn,
   markWorldChangeSummaryInjected(token.summaryTurn)
```

Semantics:

- Stale token with newer `worldTurn`: may mark only old `summaryTurn`; newer WCS remains eligible.
- Same turn but changed recentChanges/source hash: do not consume.
- Already-consumed token: no-op.
- Newer content after receipt creation: must not be consumed by the old receipt.

## 10. Accepted correlation contract

RUNTIME-002A callback proves only:

```text
current process pending lifecycle observed a newly Accepted non-duplicate TurnResult after canonical commit
```

PROMPT-001C must add independent correlation:

```text
Accepted TurnResult.promptReceiptId === pendingReceipt.receiptId
```

If the Accepted TurnResult lacks a receipt ID, has a mismatched receipt ID, or the pending receipt was detached/discarded, then:

- the TurnResult remains Accepted;
- no Chronicle/WCS consumption occurs;
- log/report the mismatch as compensation;
- do not infer correlation from timing alone.

This is the smallest non-provider-specific identity needed to avoid consuming receipt B because delayed result A happened to be Accepted during B's pending lifecycle.

## 11. Pending receipt ownership model

Use exactly one process-local pending provider lifecycle, matching current source reality.

Ownership:

- Provider runner builds final payload and receipt.
- Provider runner registers `beginGmRun(() => consumeReceiptOnAccepted(receipt))`.
- The closure captures the immutable receipt object.
- `markTurnResultHandled()` keeps detach-before-invoke ordering.
- Callback throws are caught/logged; Accepted is not revoked.

Forbidden:

- Mutable global "latest receipt" looked up inside the callback.
- Receipt consumption based only on chunk IDs.
- Consumption by Inspector/Preview.

Allowed:

- A small module-level pending receipt holder only if it is set/cleared by receipt ID and the callback still captures the intended immutable receipt. It must not be a "latest wins" authority.

## 12. Retry / multiple-attempt model

Current product supports one in-flight GM bridge lifecycle at a time. PROMPT-001C should not design true concurrent provider runs.

Sequential retry behavior:

- Provider failure discards the receipt and consumes nothing.
- A later retry creates a new receipt.
- If a delayed old TurnResult appears during the new receipt lifecycle, current runtime cannot distinguish it by timing.
- Therefore PROMPT-001C must solve this with the generic `promptReceiptId` correlation described above.
- If this correlation is not implemented, the task must fail implementation verification; it must not be deferred to provider-specific identity.

No durable cross-restart correlation is required in this task.

## 13. Complete failure matrix

| Case | Consume? | Pending receipt | Retry allowed? | Guarantee / non-guarantee |
|:--|:--:|:--|:--:|:--|
| Budget eviction | No | Evicted chunk absent from receipt | Yes | Evicted consumable cannot be delivered or consumed |
| Provider invocation throws before dispatch | No | Discard | Yes | Receipt never becomes Delivered |
| Provider dispatch starts but returns unusable output | No | Clear on failure path | Yes | Delivered is not Accepted |
| TurnResult file never appears | No | Cleared by lifecycle/fallback failure | Yes | No Accepted signal |
| TurnResult parse failure | No | Retain until lifecycle clears; no consume | Yes | RUNTIME-002A false path |
| Pre-Accepted validation failure | No | Clear/discard | Yes | No Accepted callback |
| Canonical commit failure | No | Clear/discard | Yes | No Accepted callback |
| Accepted succeeds and receipt ID matches | Yes, exactly receipt-bound tokens | Consumed then detached | No whole-turn retry in same process | Consumed after Accepted only |
| Accepted succeeds but receipt ID missing/mismatch | No | Detach/discard after logging | No same-process Accepted retry | Accepted does not prove receipt correlation |
| Post-Accepted secondary failure | Yes if token consumption already attempted; failures logged | Detached | No whole-turn retry | Accepted cannot be revoked |
| Callback throws | Attempted only once; failure logged | Detached before call | No whole-turn retry | Accepted/dedupe remain true |
| Duplicate TurnResult observation | No additional consume | Already detached | No | Same-process duplicate suppressed |
| Extension restart before Accepted | No original callback | Process-local receipt lost | File may retry | No cross-restart receipt guarantee |
| Extension restart after Accepted before consumption | Maybe not consumed | Process-local receipt lost | No exactly-once guarantee | Content may repeat later; durable replay is out of scope |

## 14. Restart guarantees and non-guarantees

PROMPT-001C guarantees only process-local consumption ordering.

Guaranteed:

- No consumption before Accepted in the same extension-host lifetime.
- No consumption without receipt ID match in the same lifetime.
- Duplicate same-process callback/observation cannot double-consume.

Not guaranteed:

- Durable receipt recovery after extension-host restart.
- Cross-restart exactly-once consumption.
- Durable Accepted replay/dedupe.
- Campaign identity.
- Provider-specific session identity.

If restart happens after Accepted but before receipt consumption, the receipt is lost and Chronicle/WCS may remain eligible for future prompt inclusion. This is safer than consuming the wrong content.

## 15. Final production authority path

Target path:

```text
buildGmPromptContext
-> pure candidate assembly
-> evictPromptChunksByBudget
-> selected chunks + selected consumable tokens
-> build exact provider payload with receiptId instruction
-> compute payloadHash
-> promote receipt to pending-delivered after dispatch starts
-> provider result
-> turn_result.json includes promptReceiptId
-> RUNTIME-002A Accepted callback
-> verify Accepted TurnResult promptReceiptId matches captured receipt
-> consume only receipt-bound ACK tokens
```

Legacy wrappers removed from production authority:

- `buildLegacyProductionSpecs`
- `buildLegacyProductionSpecsWithMeta`
- `LEGACY_PRODUCTION_CONSUMABLE_BUILDERS`
- direct production calls to `consumeChronicleRecapContext`
- direct production calls to `consumeWorldChangeSummaryContext`

Pure builders become canonical production candidate builders. Budget selection output must be captured immediately after `evictPromptChunksByBudget`. Receipt construction belongs in provider dispatch assembly, not in Inspector. Receipt consumption belongs in the Accepted callback closure and token-specific ack helpers.

## 16. Exact touch set

MUST CHANGE:

- `src/gmPromptBuilder.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`
- `src/types/TurnResult.ts`

MAY CHANGE:

- `src/vscodeLmTurnResultCore.ts`
- `src/agenticGmCore.ts`
- `src/turnResultFallback.ts` only if a typed callback payload is needed while preserving RUNTIME-002A ordering
- focused tests under `scripts/`
- `scripts/run_all_tests.js`
- locale/prompt strings only if provider instructions require localized receipt wording

MUST NOT CHANGE:

- Category budgeter redesign
- Durable TurnResult replay/dedupe
- Campaign identity architecture
- Provider-specific session identity
- TEMP checkpoint/restore
- Debug Hub UX
- Remote play
- Deterministic replay architecture
- RUNTIME-002A Accepted boundary ordering, except for narrow typed callback integration if required

## 17. MUST CHANGE / MAY CHANGE / MUST NOT CHANGE

MUST CHANGE:

- Production prompt assembly must stop using legacy consuming candidate builders.
- Chronicle/WCS candidate builders must produce immutable ACK token data.
- Budget survivors must carry token data into receipt construction.
- Provider payloads must include `receiptId` and instructions to echo it in `turn_result.json`.
- Accepted consumption must verify receipt ID match before ACK.

MAY CHANGE:

- Introduce internal exported authority types such as `PromptDeliveryReceipt` and token helpers.
- Add concise comments explaining receipt authority, token immutability, Accepted-only ordering, and restart non-guarantees.
- Add focused test harness seams for provider dispatch and Accepted callbacks.

MUST NOT CHANGE:

- Inspector read-only behavior.
- RUNTIME-002A meaning of Accepted.
- Legacy Chronicle/WCS marker functions except by wrapping them in token-specific ack functions.
- Budgeter algorithm or priorities.

## 18. Required tests

Behavioral proof is required for:

1. evicted Chronicle is not consumed;
2. evicted WCS is not consumed;
3. delivered but provider-failed Chronicle is not consumed;
4. delivered but provider-failed WCS is not consumed;
5. TurnResult parse failure does not consume;
6. validation failure does not consume;
7. canonical commit failure does not consume;
8. Accepted consumes exactly receipt-bound Chronicle token;
9. Accepted consumes exactly receipt-bound WCS token;
10. newer content arriving after receipt creation is not consumed by old receipt;
11. repeated/duplicate callback cannot double-consume;
12. callback exception cannot revoke Accepted;
13. production no longer reaches legacy consuming candidate builders;
14. Inspector remains read-only;
15. PROMPT-001A terminal-DONE criteria are satisfied.

Additional required correlation tests:

- Accepted missing `promptReceiptId` does not consume.
- Accepted mismatched `promptReceiptId` does not consume.
- Delayed receipt A result during pending receipt B does not consume B.
- VS Code LM wrapper writes/propagates receipt ID.
- Agentic final TurnResult writes/propagates receipt ID.

## 19. Mutation sanity requirements

At least one mutation sanity test is mandatory:

- Temporarily move Chronicle/WCS consumption before RUNTIME-002A Accepted or bypass the receipt-ID check.
- Expected result: the focused Accepted-only consumption test fails.
- Restore immediately; do not commit mutation.

At least one eviction mutation is also recommended:

- Temporarily add an evicted consumable token to the receipt despite budget eviction.
- Expected result: evicted Chronicle/WCS test fails.

## 20. PROMPT-001A terminal-DONE criteria

PROMPT-001A may move from `BLOCKED (Waiting for PROMPT-001C)` to `DONE` only after implementation verification proves:

- production uses the pure candidate path;
- evicted consumables are not consumed;
- provider/turn failure does not consume;
- immutable delivery-time tokens exist for Chronicle and WCS;
- consumption occurs only after truthful RUNTIME-002A Accepted;
- Accepted consumption also requires receipt-ID correlation;
- Inspector/Preview remain read-only;
- no legacy production consuming candidate builder remains reachable from production.

## 21. Documentation Impact

Implementation must add concise source comments for:

- receipt creation authority: why receipt validity starts only after final payload + provider dispatch start;
- immutable ACK token semantics: why tokens bind to delivered source state;
- Accepted-only ordering: why RUNTIME-002A callback is necessary but not sufficient without receipt correlation;
- known non-guarantees: no durable receipt recovery, no provider-specific identity, no cross-restart exactly-once.

This task introduces cross-subsystem concepts that should later be added to:

- Concept Glossary: `Prompt Delivery Receipt`, `Prompt Consumable ACK Token`, `Receipt-bound Consumption`.
- Code Symbol Registry: new receipt/token types and token-specific ack helpers.
- Terminology Contract: distinction between `Delivered`, `Accepted`, and `Consumed`.

Do not edit those documents in this Gate.

## 22. New finding candidates

No new independent finding candidate is promoted by this Gate.

PROMPT-001C absorbs the already-known identity/ACK findings:

- `CLAUDE-20260705-002`: `chronicleSessionPending` in-memory/durable asymmetry.
- `CLAUDE-20260705-003`: duplicate build / rebuild risk.
- `GEMINI-20260705-002`: delivery-time immutable source token required.

Existing separate findings remain separate:

- `CHATGPT-20260706-001`: durable Accepted replay/dedupe after restart.
- `CHATGPT-20260706-002`: optimistic reapply world simulation double-advance risk.

## 23. Final verdict

`READY_FOR_ADVERSARIAL_REVIEW`

PROMPT-001C can proceed to adversarial architecture review if and only if the reviewer agrees that generic `receiptId` correlation is in scope for PROMPT-001C and is sufficient to close the A/B delayed-result identity gap without absorbing provider-specific session identity or durable cross-restart replay architecture.
