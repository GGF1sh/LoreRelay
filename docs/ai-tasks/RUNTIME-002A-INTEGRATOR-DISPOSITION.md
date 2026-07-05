# Chief Integrator Disposition: RUNTIME-002A Adversarial Review

| Field | Value |
|:---|:---|
| **Task** | `RUNTIME-002A` |
| **Gate** | `docs/ai-tasks/RUNTIME-002A-GATE-REPORT.md` |
| **Adversarial Review** | `docs/ai-tasks/RUNTIME-002A-ADVERSARIAL-REVIEW.md` |
| **Chief Verdict** | **ACCEPT_GATE_WITH_NARROW_AMENDMENTS** |

## 1. Current Reality Sync

The adversarial report reviewed Gate commit `7d8833d`. During/after Gate work, current `main` advanced to a refined Gate at `649ffa3`, with no runtime source or test drift.

The refined Gate already incorporates several concerns raised by the adversarial report:

- all post-commit secondary-ledger throws must be isolated;
- journal failures must be isolated;
- `false` is reserved for pre-Accepted failures;
- callback exceptions must be isolated;
- callback state must be detached before invocation;
- cross-restart successful-file replay is explicitly recorded as a new Candidate finding;
- callback has no identity/token and PROMPT-001C owns immutable identity/ACK design.

## 2. Disposition Table

| Adversarial Request | Chief Decision | Reason |
|:---|:---|:---|
| Callback identity added inside RUNTIME-002A | **REJECT / DOWNSTREAM SCOPE** | Current callback type is `() => void`; adding run/turn identity would require a new correlation contract across provider output and pending lifecycle. That is PROMPT-001C / runtime identity scope, not required to correct current false-Accepted ordering. |
| Ternary result type (`accepted / duplicate / rejected`) | **REJECT** | `processTurnResult(): TurnResult | false` is sufficient if structurally enforced as truthy = Accepted and false = pre-Accepted failure only. A richer taxonomy is not required for correctness. |
| Treat stale/revision rejection as duplicate Accepted | **REJECT AS UNSAFE** | Current source provides no durable proof that a stale/conflicting file was previously Accepted. Mapping stale conflict to duplicate success could convert an unrelated failed/conflicted result into false success. |
| Absolute post-commit exception isolation | **ACCEPT** | Required. Already present in the refined Gate. Once canonical commit succeeds, later secondary/journal/downstream failures must not produce `false` or whole-turn retry. |
| Clear callback/pending state before invocation | **ACCEPT AS EXISTING CONTRACT** | Current `markTurnResultHandled()` already clears pending state and detaches the callback before invoking it. Implementation must preserve this and add exception isolation. |
| Cross-restart replay risk is real | **ACCEPT AS SEPARATE FINDING** | Real and already captured by Gate Candidate `CHATGPT-20260706-001`. It is not solved by in-memory dedupe ordering and must not be hidden inside a speculative stale-as-duplicate rule. |
| Callback identity mismatch risk is real | **ACCEPT AS NON-GUARANTEE / DOWNSTREAM BLOCKER** | The callback proves post-commit acceptance only; it does not prove correlation to a specific provider run or delivery receipt. PROMPT-001C must not consume immutable delivery receipts until it adds/binds identity. |

## 3. Source Corrections to the Adversarial Report

### `commitGameState()` success action

Current `CommitGameStateResult` is:

```ts
| { ok: true; action: 'write' }
| { ok: false; action: 'skip' | 'quarantine'; reason: string[] }
```

There is no current `ok: true` `merge` or `noop` action.

Therefore the Gate's Accepted boundary remains:

> `commitGameState(...).ok === true` — which, in current source, necessarily means `action === 'write'`.

No additional merge/noop discriminator is required.

### Stale/conflict recovery

The adversarial counterexample assumes a restarted replay will be rejected as stale and therefore should be reclassified as duplicate success.

That mechanism is not established by current source. More importantly, even if a stale/conflict rejection occurs, RUNTIME-002A has no durable accepted-result identity proving that the file was previously applied.

Therefore:

```text
stale/conflict
≠ proven duplicate Accepted
```

No such mapping is authorized.

### Re-entrancy

Current `markTurnResultHandled()` already performs:

```text
pendingTurnResultFromGm = false
→ capture callback
→ pendingAcceptedTurnCallback = undefined
→ invoke callback
```

The implementation requirement is to preserve this order and add try/catch isolation around invocation.

## 4. Narrow Required Gate Amendments

Only two amendments are required before implementation.

### Amendment A — Callback meaning must be narrowed

The Gate must not say or imply:

> this callback proves that the waiting provider run's own TurnResult was accepted.

The truthful contract is:

> the callback proves that, while the current pending-run lifecycle was active, a non-duplicate TurnResult crossed the RUNTIME-002A post-canonical-commit Accepted boundary.

It does **not** prove:

- provider-run identity;
- turn-result-to-run correlation;
- delivery-receipt identity;
- cross-restart exactly-once identity.

PROMPT-001C may use the callback only as a post-commit temporal signal after it independently introduces/binds immutable delivery identity.

### Amendment B — Cross-restart replay is an explicit dependency risk, not a retry fix

The Gate must explicitly state:

- RUNTIME-002A does not make accepted-result dedupe durable;
- a previously Accepted file may be replayed after restart;
- implementation must not classify stale/conflict as duplicate success without durable accepted identity;
- PROMPT-001C cannot claim cross-process exactly-once semantics from RUNTIME-002A;
- separate Candidate `CHATGPT-20260706-001` remains open.

## 5. Accepted Boundary Decision

The core Gate boundary survives unchanged:

> A TurnResult becomes Accepted at the successful authoritative `game_state.json` commit performed by `commitGameState()`. Under current source, success means `{ ok: true, action: 'write' }`.

Post-commit secondary-ledger, journal, callback, media, UI, or bootstrap failure cannot revoke Accepted and cannot justify whole-turn replay.

## 6. Return Contract Decision

No ternary result type is required.

Approved minimum:

### `processTurnResult()`

```text
truthy TurnResult = Accepted
false = Accepted boundary not crossed
```

Structural requirement:

- every possible post-commit exception is isolated before it can reach the outer `false` return.

### `processTurnResultFileAt()`

```text
true = this invocation newly Accepted a non-duplicate TurnResult
false = missing / duplicate / read-parse exhaustion / pre-Accepted failure
```

The boolean remains sufficient for the current fallback caller because duplicate is not a new Accepted/Handled event. Future diagnostic richness may use another result type, but it is not required by this task.

## 7. Crash Window Decision

The adversarial report correctly identified a real cross-restart crash window:

```text
canonical commit succeeds
→ process dies before durable accepted identity exists
→ restart
→ same file may be observed again
```

Chief classification:

- **real**;
- **not newly introduced by the Gate**;
- **not solved by same-process `lastProcessedTurnHash`**;
- **not safely solvable by interpreting stale conflict as success**;
- **separate P1 finding / prerequisite risk for durable PROMPT-001C semantics**.

RUNTIME-002A still has value and may proceed: it fixes the current same-process false ordering and gives a truthful post-commit signal within the current extension-host lifetime.

## 8. Callback Dependency Decision for PROMPT-001C

After RUNTIME-002A implementation, PROMPT-001C may rely on only this:

> callback attempt occurs after canonical commit, committed same-process dedupe, and pending-state detach.

PROMPT-001C may not rely on:

- callback identity;
- callback payload identity;
- callback-to-provider-run correlation;
- callback durability across restart;
- callback retry;
- cross-process exactly-once.

PROMPT-001C must bind its immutable delivery receipt to an identity/token outside RUNTIME-002A before consuming context.

## 9. Implementation Touch Set

The Gate's smallest Touch Set survives:

### MUST CHANGE

- `src/gameStateSync.ts`
- `src/statePatch.ts`
- `src/turnResultFallback.ts`

### MAY CHANGE

- one focused runtime acceptance test file
- test manifest registration

### MUST NOT CHANGE

- provider runner identity contracts
- PROMPT-001C ACK/token design
- durable cross-restart dedupe architecture
- State Orchestrator
- TEMP-001B/C multi-ledger architecture

## 10. New Findings Disposition

### `GEMINI-20260706-002A-1`

Disposition:

**DUPLICATE / ABSORB INTO `CHATGPT-20260706-001`**

The real underlying issue is cross-restart re-observation/replay of an already Accepted `turn_result.json` due to non-durable dedupe. The adversarial report's specific stale-conflict/lost-callback mechanism is not established strongly enough to create a separate finding.

### Callback identity mismatch

Disposition:

**KEEP AS PROMPT-001C DESIGN CONSTRAINT, NOT RUNTIME-002A IMPLEMENTATION REQUIREMENT**

No new formal finding ID is created here because the Gate already explicitly records that callback identity/token is absent and PROMPT-001C owns immutable identity/ACK design.

## 11. Chief Verdict

`ACCEPT_GATE_WITH_NARROW_AMENDMENTS`

The Gate does not return to architecture.

After the two documentation amendments above are applied, RUNTIME-002A may advance to `READY_TO_IMPLEMENT`.

Implementation must not begin from the unamended callback dependency wording.
