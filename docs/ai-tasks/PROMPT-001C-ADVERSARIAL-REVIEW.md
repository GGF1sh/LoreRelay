# PROMPT-001C Adversarial Architecture Review

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Reviewer | Gemini 3.1 Pro |
| Verdict | `GATE_AMENDMENT_REQUIRED` |

## Strongest Attacks

### 1. LLM Echo Fallacy

The Gate relies on `promptReceiptId` being echoed by the model into `turn_result.json`.

Failure mode:

- model omits or corrupts the opaque ID;
- TurnResult is otherwise valid and becomes Accepted;
- receipt correlation fails;
- Chronicle/WCS are not consumed;
- stale context may repeat in later prompts.

Recommended amendment: receipt correlation metadata should be attached by trusted bridge/runtime code rather than trusted to model echo fidelity.

### 2. Multi-stage Agentic Bridge vs Single Raw Payload Hash

A single exact raw payload hash is ambiguous for multi-stage flows such as referee → narrator and may be brittle under representation changes or retries.

Recommended amendment: define the authority hash over a stable post-budget structured assembly/selection representation rather than an arbitrary transport string.

### 3. Restart / Offline Watcher Non-guarantee

A process-local receipt can be lost before an offline TurnResult is Accepted after restart. The review accepts this as a V1 non-guarantee but flags the UX consequence: receipt-bound consumables may repeat later.

No heuristic forced-consume behavior is authorized by this review intake.

### 4. Consume-time Source Hash Recalculation Race

The Gate requires source hash recomputation at consume time. If source files change after delivery but before Accepted, a valid delivered receipt may fail ACK and leave context eligible for repetition.

The reviewer recommends removing consume-time recomputation.

### 5. Detach-before-invoke and Partial ACK Failure

If one token ACK succeeds and a later token ACK throws, receipt detachment can prevent straightforward retry of the remaining token.

Recommended amendment: isolate per-token ACK failures and define partial-consumption semantics explicitly.

## Required Amendments Proposed by Reviewer

1. Move receipt ID attachment/correlation authority from LLM echo to trusted bridge/runtime code.
2. Replace raw final payload hash authority with stable post-budget structured assembly/selection identity.
3. Remove mandatory consume-time file/source hash recomputation.

## Chief Review Needed

The reviewer’s third amendment requires further disposition because receipt/run correlation alone does not automatically prove that newer source content should be eligible for an older ACK. Token semantics must still prevent an old receipt from consuming newer content.

## Lifecycle Consequence

Remain in `ADVERSARIAL_REVIEW` pending Chief disposition and Gate Amendment.
