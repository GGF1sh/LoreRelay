# Task Packet: RUNTIME-002A

| Field | Description |
|:---|:---|
| **Task ID** | `RUNTIME-002A` |
| **Status** | **READY_TO_IMPLEMENT** |
| **As-of Commit** | Gate refined through `649ffa3`; adversarial review + Chief amendment through `ea65482` |
| **Origin** | `GEMINI-20260705-001`, promoted by Chief Integrator |
| **Severity** | P1 |
| **Priority** | Critical |
| **Depends On** | None |
| **Architecture Gate** | [`RUNTIME-002A-GATE-REPORT.md`](RUNTIME-002A-GATE-REPORT.md) |
| **Adversarial Review** | [`RUNTIME-002A-ADVERSARIAL-REVIEW.md`](RUNTIME-002A-ADVERSARIAL-REVIEW.md) |
| **Chief Disposition** | [`RUNTIME-002A-INTEGRATOR-DISPOSITION.md`](RUNTIME-002A-INTEGRATOR-DISPOSITION.md) |
| **Canonical Amendment** | [`RUNTIME-002A-GATE-AMENDMENT.md`](RUNTIME-002A-GATE-AMENDMENT.md) |

## Objective

Establish a truthful TurnResult acceptance boundary so a turn is not marked handled, deduped, or accepted before canonical application succeeds.

## Broken Invariant

Current `processTurnResultFileAt()` can:

1. store `lastProcessedTurnHash`,
2. call `markTurnResultHandled()` and fire the pending accepted callback,
3. only then call `processTurnResult(turnResult)`.

`processTurnResult()` can return `false` after validation or canonical commit failure. The caller can ignore that `false` after handled/dedupe state has already advanced.

Therefore:

**Handled / Deduped / Accepted can become true before canonical apply succeeds.**

## Canonical Accepted Boundary

A TurnResult becomes Accepted when:

```text
validateGameState(commitState) passes
→ commitGameState(...).ok === true
```

Under current source, successful `commitGameState()` means exactly:

```ts
{ ok: true, action: 'write' }
```

Secondary ledger, journal, callback, media, UI, and bootstrap success are not required for Accepted.

## Approved Ordering

```text
Observe/read
→ hash
→ same-process committed duplicate check
→ parse
→ processTurnResult
→ pre-commit validation/preparation
→ canonical game_state commit
→ Accepted
→ isolated post-commit secondary/journal work
→ truthy Accepted result returns
→ lastProcessedTurnHash commits
→ pending lifecycle marked Handled
→ callback attempt (exception isolated)
→ isolated success-only UI/media/bootstrap effects
```

## Return Contract

### `processTurnResult()`

```text
truthy TurnResult = Accepted boundary crossed
false = Accepted boundary not crossed
```

Mandatory rule:

- no exception/failure after successful canonical commit may escape into an outer `false` return.

### `processTurnResultFileAt()`

```text
true = this invocation newly Accepted a non-duplicate TurnResult
false = missing / same-process duplicate / read-parse exhaustion / pre-Accepted failure
```

## Dedupe Contract

`lastProcessedTurnHash` is a same-process committed accepted-result marker.

Approved:

```text
Accepted result returns
→ lastProcessedTurnHash = hash
→ Handled
→ callback
```

Forbidden:

```text
hash committed
→ canonical apply attempted later
```

No in-flight reservation is required for the current synchronous success path.

Failed hashes remain retryable.

## Callback Contract

Callback truthfully means only:

> while the current pending-run lifecycle was active, a newly Accepted non-duplicate TurnResult crossed the post-canonical-commit boundary.

It does **not** prove:

- provider-run identity;
- TurnResult-to-run correlation;
- delivery-receipt identity;
- immutable source token;
- cross-restart exactly-once identity.

PROMPT-001C may use it only as a post-commit temporal signal after independently binding immutable delivery identity.

Current detach-before-call ordering must be preserved:

```text
pending = false
→ capture callback
→ stored callback = undefined
→ invoke callback inside exception isolation
```

## Compensation Contract

Once canonical `game_state` commit succeeds:

- TurnResult remains Accepted;
- secondary-ledger failure does not rollback or replay the whole TurnResult;
- journal failure does not rollback or replay the whole TurnResult;
- post-acceptance failures are logged/compensated;
- callback/downstream failures cannot revoke Accepted.

## Cross-Restart Non-Guarantee

RUNTIME-002A does not introduce durable accepted-result dedupe.

A previously Accepted `turn_result.json` may be re-observed after extension-host restart.

Implementation must not classify stale/conflict/revision rejection as duplicate success without durable proof of prior acceptance.

Open finding:

`CHATGPT-20260706-001`

This is a separate durable accepted-identity/replay problem.

## Implementation Touch Set

### MUST CHANGE

- `src/gameStateSync.ts`
- `src/statePatch.ts`
- `src/turnResultFallback.ts`

### MAY CHANGE

- one focused runtime acceptance test file
- `scripts/run_all_tests.js` / `scripts/validate.js` only for test registration

### MUST NOT CHANGE

- provider-run identity contracts
- PROMPT-001C immutable ACK/token design
- durable cross-restart dedupe architecture
- State Orchestrator
- TEMP-001B/C multi-ledger architecture
- unrelated prompt/context code

## Required Acceptance Criteria

At minimum:

- validation failure does not fire callback;
- canonical commit failure does not fire callback;
- failed canonical apply does not commit dedupe;
- same failed hash may retry;
- successful canonical apply commits dedupe exactly once;
- callback fires only after Accepted and same-process dedupe commit;
- callback exception is isolated;
- secondary-ledger thrown/structured failure after commit remains Accepted;
- journal failure after commit remains Accepted;
- rejected TurnResult does not drive success-only media/UI/bootstrap;
- duplicate successful file does not reapply or refire callback;
- post-commit failure cannot make `processTurnResult()` return `false`.

## Required Tests

1. parse failure
2. shape/schema rejection before commit
3. semantic validation failure before commit
4. canonical commit failure
5. successful apply
6. duplicate successful result
7. failed same-hash retry then success
8. corrected new hash after failure
9. restart with failed file and transient condition cleared
10. game_state success + secondary-ledger structured failure
11. game_state success + secondary-ledger thrown exception
12. journal failure after game_state success
13. accepted callback throws
14. callback exactly once under watcher/fallback duplicate observations
15. rejected result emits no success-only media/UI/bootstrap effects

## Related Findings

- `GEMINI-20260705-001` — source finding that created this task
- `CHATGPT-20260706-001` — accepted file can replay after restart; separate durable dedupe task
- `CHATGPT-20260706-002` — possible double world simulation on optimistic reapply; separate triage
- `GEMINI-20260706-002A-1` — absorbed into `CHATGPT-20260706-001`

## Do Not Touch

- Prompt ACK markers
- Context Engine budgeter
- Temporal checkpoint/restore architecture
- Remote authority/security
- provider identity/run-token design

## Current Lifecycle Note

Architecture Gate completed, adversarial review completed, and Chief narrow amendments applied.

`RUNTIME-002A` is now **READY_TO_IMPLEMENT**.

Implementation must follow the Gate Report plus the Canonical Gate Amendment. No additional Architecture Gate round is required before coding.
