# Task Packet: RUNTIME-002A

| Field | Description |
|:---|:---|
| **Task ID** | `RUNTIME-002A` |
| **Status** | **VERIFYING** |
| **As-of Commit** | implementation branch commit `5dd883349a99f322f7174d9c51763a2e62236cea`; intake recorded on main |
| **Origin** | `GEMINI-20260705-001`, promoted by Chief Integrator |
| **Severity** | P1 |
| **Priority** | Critical |
| **Depends On** | None |
| **Architecture Gate** | [`RUNTIME-002A-GATE-REPORT.md`](RUNTIME-002A-GATE-REPORT.md) |
| **Adversarial Review** | [`RUNTIME-002A-ADVERSARIAL-REVIEW.md`](RUNTIME-002A-ADVERSARIAL-REVIEW.md) |
| **Chief Disposition** | [`RUNTIME-002A-INTEGRATOR-DISPOSITION.md`](RUNTIME-002A-INTEGRATOR-DISPOSITION.md) |
| **Canonical Amendment** | [`RUNTIME-002A-GATE-AMENDMENT.md`](RUNTIME-002A-GATE-AMENDMENT.md) |
| **Implementation Intake** | [`RUNTIME-002A-IMPLEMENTATION-INTAKE.md`](RUNTIME-002A-IMPLEMENTATION-INTAKE.md) |

## Objective

Establish a truthful TurnResult acceptance boundary so a turn is not marked handled, deduped, or accepted before canonical application succeeds.

## Broken Invariant

Current pre-fix `processTurnResultFileAt()` can:

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

## Implementation

Branch:

`task/RUNTIME-002A-accepted-boundary`

Commit:

`5dd883349a99f322f7174d9c51763a2e62236cea`

Changed files:

- `src/gameStateSync.ts`
- `src/statePatch.ts`
- `src/turnResultFallback.ts`
- `scripts/test_runtime_turn_result_acceptance.js`
- `scripts/run_all_tests.js`

Implementer-reported evidence:

- compile PASS;
- focused test PASS;
- related tests PASS;
- full suite `221/221` PASS;
- webview compile outputs classified `EOL_ONLY_DIRTY` with no content patch.

## Verification Focus

Independent verification must attack:

1. no reachable post-commit path can escape to the outer `false` return;
2. actual fallback/watcher duplicate observations preserve exactly-one apply/Handled/callback;
3. restart-with-failed-file behavior requested by the test matrix;
4. production test-hook exports do not alter runtime authority;
5. exact branch diff remains within the five authorized files;
6. `221/221` is reproducible.

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

Architecture Gate, adversarial review, Chief amendment, and implementation are complete.

`RUNTIME-002A` is now in **VERIFYING**.

No merge is authorized until independent verification passes.
