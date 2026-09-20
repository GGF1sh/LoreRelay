# RUNTIME-002A Canonical Gate Amendment

| Field | Value |
|:---|:---|
| **Task** | `RUNTIME-002A` |
| **Applies Over** | `RUNTIME-002A-GATE-REPORT.md` |
| **Adversarial Input** | `RUNTIME-002A-ADVERSARIAL-REVIEW.md` |
| **Chief Disposition** | `RUNTIME-002A-INTEGRATOR-DISPOSITION.md` |
| **Effect** | Canonical narrow amendment before implementation |

## 1. Accepted Boundary — Unchanged

A TurnResult becomes Accepted at the successful authoritative `game_state.json` commit performed by `commitGameState()`.

Under current source, the success result is exactly:

```ts
{ ok: true, action: 'write' }
```

There is no current successful `merge` or `noop` action.

Therefore no additional action discriminator is required beyond `ok === true` in current implementation.

## 2. Callback Meaning — Narrowed

Replace any stronger interpretation of the callback with this exact contract:

> The pending-run callback proves only that, while the current pending-run lifecycle was active, a newly Accepted non-duplicate TurnResult crossed the RUNTIME-002A post-canonical-commit boundary.

The callback does **not** prove:

- that the accepted TurnResult was produced by the specific waiting provider run;
- provider-run identity;
- TurnResult-to-run correlation;
- delivery-receipt identity;
- immutable source-token identity;
- cross-restart exactly-once identity.

PROMPT-001C may use the callback only as a post-commit temporal signal after PROMPT-001C independently introduces and binds immutable delivery identity.

## 3. Cross-Restart Replay — Explicit Non-Guarantee

RUNTIME-002A does not introduce durable accepted-result dedupe.

Therefore:

```text
canonical commit succeeds
→ process/extension exits before any durable accepted identity exists
→ extension restarts
→ same turn_result.json may be observed again
```

remains possible.

This task must not claim:

- durable exactly-once acceptance;
- safe cross-restart suppression of previously Accepted files;
- durable correlation between pending callback and accepted file.

Implementation must **not** classify a stale/conflict/revision rejection as duplicate success unless a future architecture provides durable proof that the exact TurnResult was previously Accepted.

Exact rule:

```text
stale/conflict
≠ proven duplicate Accepted
```

The open finding for this risk is:

`CHATGPT-20260706-001`

## 4. Return Contract — Confirmed

No ternary result type is required.

### `processTurnResult()`

```text
truthy TurnResult = Accepted boundary crossed
false = Accepted boundary not crossed
```

Mandatory structural rule:

> No exception or failure after successful canonical commit may escape into the outer path that returns `false`.

All post-commit secondary-ledger, journal, logging, and downstream failures must be isolated and reported without revoking Accepted.

### `processTurnResultFileAt()`

```text
true = this invocation newly Accepted a non-duplicate TurnResult
false = missing file / same-process duplicate / read-parse exhaustion / pre-Accepted failure
```

A duplicate is not a new Accepted, Handled, or callback event.

## 5. Callback Lifecycle — Confirmed

Current `markTurnResultHandled()` already detaches state before invocation:

```text
pendingTurnResultFromGm = false
→ capture callback
→ stored callback = undefined
→ invoke callback
```

Implementation must preserve this ordering and add callback exception isolation.

Callback exception cannot:

- revoke Accepted;
- clear committed dedupe;
- trigger whole-turn retry;
- escape the lifecycle boundary.

## 6. No Stale-as-Duplicate Recovery

The adversarial proposal to map stale/revision rejection to `'duplicate'` or `'accepted'` is rejected.

Reason:

- current runtime has no durable proof of prior acceptance;
- stale/conflict may reflect unrelated concurrent state movement;
- converting it to success could fire callback and downstream effects for a TurnResult that was never accepted.

Cross-restart replay prevention belongs to a separate durable accepted-identity task.

## 7. PROMPT-001C Dependency Contract — Final

After RUNTIME-002A implementation, PROMPT-001C may rely on:

- callback attempt occurs after successful canonical commit;
- callback attempt occurs after same-process accepted-hash commit;
- callback state was detached before invocation;
- callback cannot fire for parse failure, pre-commit rejection, or canonical commit failure;
- callback exception does not unaccept or replay the turn.

PROMPT-001C may **not** rely on:

- provider-run correlation;
- callback payload identity;
- immutable receipt identity;
- cross-restart exactly-once;
- durable accepted-result dedupe.

PROMPT-001C must solve immutable delivery identity before consuming delivery receipts.

## 8. Implementation Authorization

The Gate plus this Amendment authorizes implementation with the existing smallest Touch Set:

### MUST CHANGE

- `src/gameStateSync.ts`
- `src/statePatch.ts`
- `src/turnResultFallback.ts`

### MAY CHANGE

- one focused runtime acceptance test file
- test manifest registration

### MUST NOT CHANGE

- provider-run identity contracts
- PROMPT-001C immutable ACK/token design
- durable cross-restart dedupe architecture
- State Orchestrator
- TEMP-001B/C multi-ledger architecture

## 9. Final Gate State

Architecture result after adversarial review and Chief amendment:

`READY_TO_IMPLEMENT`

No further Architecture Gate round is required before implementation.
