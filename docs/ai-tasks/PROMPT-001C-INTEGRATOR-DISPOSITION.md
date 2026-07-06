# PROMPT-001C Chief Integrator Disposition

Task: `PROMPT-001C - Prompt Assembly Receipt + immutable ACK / Accepted consumption`

Lifecycle input: `ADVERSARIAL_REVIEW`

Current main at disposition: `3462c3ece8630dec71b7b8997c222bbd8c840c2a`

Reviewed:

- `docs/AI_REVIEW_BACKLOG.md`
- `docs/ai-tasks/PROMPT-001C-GATE-INTAKE.md`
- `docs/ai-tasks/PROMPT-001C-ADVERSARIAL-REVIEW.md`
- Original Gate `docs/ai-tasks/PROMPT-001C-GATE-REPORT.md` from `4829dc52209d1da2819161898ccf167f91d04543`
- Current source in `src/gmPromptBuilder.ts`, `src/gmBridgeRunner.ts`, `src/agenticGmRunner.ts`, `src/agenticGmCore.ts`, `src/turnResultFallback.ts`, `src/gameStateSync.ts`, `src/worldState.ts`, and `src/types/TurnResult.ts`

## Summary decision

The adversarial review is accepted in substance. The V1 Gate was directionally correct about process-local receipt-bound consumption after RUNTIME-002A Accepted, but it over-relied on model echo, raw payload identity, and consume-time source recomputation.

The canonical architecture is amended in `PROMPT-001C-GATE-AMENDMENT.md`.

Lifecycle result:

`READY_TO_IMPLEMENT`

## Major attack dispositions

| Attack | Disposition | Chief decision |
|:--|:--|:--|
| 1. LLM Receipt ID Echo Fallacy | ACCEPT | Model echo is not trusted authority. Receipt correlation must be attached or verified by trusted bridge/runtime code. Missing or model-only correlation consumes nothing. |
| 2. Bridge-side ID attachment | ACCEPT WITH MODIFICATION | Host-owned result paths may attach receipt IDs directly. External-process paths require lifecycle-bound trusted metadata, per-run output paths, or sidecars. Looking up "latest pending receipt" at parse/observe time is forbidden. |
| 3. Multi-stage Agentic payload hash problem | ACCEPT | One raw payload hash is not authority. Agentic has one selected assembly receipt but multiple stage transports; stage payload hashes are diagnostic only. |
| 4. Offline restart receipt loss | KEEP AS NON-GUARANTEE | Process-local receipt scope remains. No heuristic forced consume after restart is allowed. PROMPT-001A may reach DONE with this non-guarantee because it is safer repeatability, not wrong-content consumption. |
| 5. Consume-time source hash recomputation race | ACCEPT WITH MODIFICATION | Do not require consume-time recomputation. Tokens authorize bounded marker/version transitions. Candidate eligibility later compares current source digest to stored consumed digest. |
| 6. Detach-before-invoke partial ACK failure | ACCEPT WITH MODIFICATION | RUNTIME-002A detach-before-callback remains. ACK operations are independent, exception-isolated, and failed tokens are retained only in a small process-local ACK compensation queue. Accepted is never rolled back. |
| 7. Chronicle `chronicleSessionPending` generation problem | ACCEPT WITH MODIFICATION | The current single boolean is too ambiguous for receipt-bound delayed ACK. Add a process-local pending generation/epoch and receipt-bound source digest semantics. Old tokens may not clear newer pending generations. |

## Accepted adversarial amendments

- Replace model-echo-only receipt correlation with trusted lifecycle binding.
- Replace raw final payload hash authority with stable post-budget assembly identity.
- Treat raw transport payload hashes as diagnostic only.
- Remove consume-time source recomputation as a mandatory ACK gate.
- Define provider-specific Delivered boundaries instead of using a vague "dispatch started" phrase.
- Treat Agentic as a multi-stage flow.
- Define partial ACK isolation and compensation explicitly.

## Rejected or narrowed adversarial claims

- Full durable receipt persistence is rejected for PROMPT-001C. It belongs with durable Accepted replay/dedupe work such as `CHATGPT-20260706-001`.
- Provider-specific session identity is rejected for PROMPT-001C. The task needs generic receipt lifecycle correlation, not durable provider identity architecture.
- Raw transport payload hash is rejected as authority but retained as optional diagnostics.
- Source hash/digest is not removed entirely. It remains part of token and assembly identity; only consume-time recomputation against mutable current files is rejected.

## Final correlation model

The amended correlation model is:

```text
provider lifecycle creates receiptId
-> receiptId is bound to that lifecycle by trusted bridge/runtime transport
-> accepted result exposes trusted lifecycle receiptId
-> callback closure captures the same immutable receipt
-> ACK only if acceptedReceiptId === capturedReceipt.receiptId
```

Forbidden:

```text
TurnResult arrives
-> look up current/latest pending receipt
-> attach that receiptId
```

This is the central anti-corruption rule for delayed A/current B.

## Chronicle generation model

Chronicle must no longer rely on one global boolean as the sole pending session authority. The amended model requires:

- a process-local `chronicleSessionPendingGeneration` or equivalent epoch;
- Chronicle tokens capture `sourceTurn`, `sourceDigest`, and `pendingGeneration`;
- ACK may set consumed marker only for the token's `sourceTurn`/`sourceDigest`;
- ACK may clear session pending only if the current pending generation still equals the token generation;
- newer source turns, newer source digests, or newer pending generations remain eligible.

## Agentic model

Agentic has one selected prompt assembly receipt for the complete GM lifecycle because the same `basePrompt` containing Chronicle/WCS context is used in both referee and narrator stages. It has multiple stage transports:

- Referee stage receives the receipt-bound base context and owns the authoritative mechanics candidate.
- Narrator stage receives the same base context plus referee output.
- Final host-owned `turn_result.json` must be written with the lifecycle receipt ID by LoreRelay, not by model echo.
- Referee failure consumes nothing.
- Referee success plus narrator failure may still produce fallback narration and a final TurnResult; if that TurnResult is Accepted and receipt correlation matches, ACK may proceed because the receipt-bound context was delivered to the successful referee lifecycle.

## New finding candidates

No new independent finding candidate is created.

The amendment absorbs the known PROMPT-001C findings:

- `CLAUDE-20260705-002`
- `CLAUDE-20260705-003`
- `GEMINI-20260705-002`

Existing separate findings remain separate:

- `CHATGPT-20260706-001`
- `CHATGPT-20260706-002`

## Final verdict

`READY_TO_IMPLEMENT`
