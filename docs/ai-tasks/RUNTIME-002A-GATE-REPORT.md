# RUNTIME-002A Architecture Gate Report

Task: `RUNTIME-002A — TurnResult handled/dedupe ordering + post-commit Accepted boundary`

Status: Architecture Gate only. No runtime source or test implementation is included in this report.

## 1. Gate Snapshot

- Runtime Source of Truth reviewed: `3b09c70ef2d4b07c772ce6902b377198658da847`
- Chief Integrator snapshot was rechecked at Gate start and was the current `main`.
- During Gate work, `main` advanced to `7d8833ddc23d3d689c06b3d51460b7d9ed616b05` by adding only this Gate Report. `GitHub.compare_commits` showed no runtime source or test drift.
- Gate verdict: `READY_FOR_ADVERSARIAL_REVIEW`

### Reviewed control docs

- `docs/AI_REVIEW_BACKLOG.md`
- `docs/AI_FINDINGS_INBOX.md`
- `docs/ai-tasks/RUNTIME-002A.md`

### Reviewed runtime source

- `src/gameStateSync.ts`
- `src/turnResultFallback.ts`
- `src/statePatch.ts`
- `src/stateManager.ts`
- `src/turnLedgerPersistCore.ts`
- `src/livingWorldCommercePersist.ts`
- `src/livingWorldTurnOps.ts`
- `src/worldSimPersist.ts`
- `src/worldState.ts`
- `src/npcRegistry.ts`
- `src/mediaAgent.ts`
- `src/extension.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`
- `src/types/TurnResult.ts`

### Reviewed callers / references

The GitHub connector code-search index returned no hits for exact-symbol searches. Caller/reference coverage was completed by direct source inspection of the importing and wiring modules.

Reviewed references include:

- `startGameStateWatcher()` watcher and startup sweep
- `processTurnResultFileAt()`
- `checkPendingTurnResultFile()`
- module-level `lastProcessedTurnHash`
- `processTurnResult()`
- `markTurnResultHandled()`
- `beginGmRun()` / `finishGmRun()`
- `initTurnResultFallback(checkPendingTurnResultFile)`
- Grok, local LLM, custom command, VS Code LM, and agentic GM paths
- pending accepted callbacks that set `grokSessionActive` / `localGmSessionActive`
- `persistTurnLedgersAfterCommit()` and compensation policy
- journal append path

### Reviewed tests

- `package.json`
- `scripts/run_all_tests.js`
- `scripts/validate.js`
- `scripts/test_turn_result_pipeline.js`
- `scripts/test_state_patch.js`
- `scripts/test_turn_artifact_commit_atomicity.js`
- `scripts/test_cross_ledger_partial_failure.js`
- `scripts/test_turn_ledger_valid_noop.js`

Current tests prove patch/merge behavior and the explicit post-`game_state` compensation policy, but they do not test the `processTurnResultFileAt()` Accepted / Handled / Dedupe boundary.

### Google Drive guardrail

Reviewed `LoreRelay World Intent / Action Execution Kernel - ChatGPT Master Design 2026-07-04` only as an upper-level guardrail. It reinforces:

- State Orchestrator must not become a universal save system.
- Each ledger retains ownership of parsing, migration, validation, and persistence.
- Event-like downstream effects are post-commit only.

Current GitHub runtime source remains the Source of Truth.

## 2. Current Reality

### A. File processing path: `processTurnResultFileAt()`

Current sequence in `src/gameStateSync.ts`:

1. `startGameStateWatcher()` creates a `turn_result.json` watcher for create/change events.
2. Each event schedules `processTurnResultFileAt(uri.fsPath)` after 50 ms.
3. Watcher startup also sweeps the workspace root `turn_result.json`.
4. `processTurnResultFileAt()` returns `false` if the file does not exist.
5. It reads the file synchronously.
6. Empty content throws.
7. It computes `sha256(content)`.
8. If the hash equals `lastProcessedTurnHash`, it returns `false`.
9. It parses with `JSON.parse(content) as TurnResult`.
10. It immediately assigns `lastProcessedTurnHash = hash`.
11. It immediately calls `markTurnResultHandled()`.
12. It calls `handleTurnResultMedia(turnResult)`.
13. It flushes scheduled commerce persistence.
14. It calls `const enriched = processTurnResult(turnResult)`.
15. It takes/queues any auto-location-image request.
16. It posts `gameStateUpdate` using `enriched || turnResult`.
17. It schedules protagonist bootstrap.
18. It returns `true`.
19. Only thrown failures enter the bounded retry path: up to three 100 ms retries, then `false`.

The critical current facts are:

- dedupe and Handled advance before canonical apply;
- the pending accepted callback can fire before canonical apply;
- `processTurnResult() === false` is ignored;
- a rejected TurnResult can still drive media, UI, auto-image, and protagonist side effects;
- the caller can return `true` although canonical apply returned `false`.

### B. `processTurnResult()` path

Current sequence in `src/statePatch.ts`:

1. Resolve `game_state.json`; missing path returns `false`.
2. Flush scheduled commerce persistence.
3. Read current game state or create an initial record.
4. Capture `baseRevision` and `beforeHash`.
5. Apply state patches and fog/cartography transforms.
6. If `elapsedWorldTurns` is present, call `persistWorldSimulationSteps()`. A non-ok domain result logs and continues; thrown I/O can escape to the outer catch.
7. Load world state and apply domain/guild travel drift. Some paths persist `world_state.json` before `game_state` commit.
8. Re-load world state and apply faction reputation, quest completion, NPC-memory side effects, and location-visit changes. Dirty world state is saved before `game_state` commit.
9. Finalize `commitState`: GM entry merge, living-world operations, domain operations, guild operations, normalization. Living-world finalization may persist `world_state.json`.
10. Re-read fresh `game_state`. If disk revision advanced, call `applyTurnResultToGameState(turnResult, freshDisk, false)`.
11. Calculate pending auto-location-image metadata.
12. Validate `commitState` using `validateGameState()`. Failure returns `false`.
13. Compute `afterHash`.
14. Call `commitGameState(commitState, { mode: 'salvage', baseRevision, mergeProfile: 'turn' })`.
15. `commit.ok === false` returns `false`.
16. Call `persistTurnLedgersAfterCommit()` for discovery, campaign resources, settlement layout, vehicle, and mobile-base effects.
17. A structured secondary-ledger failure is logged; `game_state` is explicitly retained.
18. Build enriched TurnResult metadata.
19. Rotate `state_journal.ndjson` inside a local best-effort try/catch.
20. Append to `state_journal.ndjson` with `fs.appendFileSync()`.
21. Return the enriched TurnResult.
22. Any uncaught exception reaches the outer catch and returns `false`.

Two post-commit hazards matter directly to RUNTIME-002A:

- journal append can throw after successful `game_state` commit and currently convert the result to `false`;
- a thrown exception from post-commit secondary-ledger execution can also reach the outer catch and convert an already committed turn to `false`.

Therefore a naive “move two caller lines after `processTurnResult()`” is insufficient. First, `processTurnResult()` truthiness must become truthful: `false` must mean the Accepted boundary was not crossed.

### Current runtime validation reality

There is no unified TypeScript runtime validator for the `TurnResult` object itself. The file path performs `JSON.parse(... ) as TurnResult`; the cast is compile-time only.

For this Gate:

- **Parsed** means syntactically valid JSON.
- **Validated** means the current acceptance-critical application path has not rejected/aborted and the prepared `commitState` passes `validateGameState()`.
- subsystem-owned operation parsers/semantic checks remain owned by their ledgers and may reject individual operations as invalid/no-op according to current contracts.

RUNTIME-002A must not invent a new global TurnResult schema/error taxonomy merely to fix ordering.

### C. Pending GM run lifecycle

Current sequence:

1. Provider path calls `beginGmRun(onAcceptedTurn?)`.
2. `beginGmRun()` sets `pendingTurnResultFromGm = true`.
3. It stores `pendingAcceptedTurnCallback`.
4. Grok, local LLM, and VS Code LM pass callbacks that mark their provider session active; custom command and agentic paths do not pass a callback.
5. Provider success calls `finishGmRun(prevState, playerAction, true)`.
6. After 250 ms, if still pending, `finishGmRun()` calls `checkPendingTurnResultFile()`.
7. `checkPendingTurnResultFile()` calls `processTurnResultFileAt(workspace/turn_result.json)`.
8. Current `processTurnResultFileAt()` calls `markTurnResultHandled()` before canonical apply.
9. `markTurnResultHandled()`:
   - clears `pendingTurnResultFromGm`;
   - captures the callback;
   - clears the stored callback;
   - invokes the callback synchronously without exception isolation.
10. `finishGmRun()` then stops because the result appears handled.
11. If no real TurnResult was handled, fallback synthesis may write a TurnResult derived from direct `game_state` changes.

### D. Restart behavior

Current state is in-memory only:

- `lastProcessedTurnHash` resets to `''`;
- `pendingTurnResultFromGm` resets to `false`;
- `pendingAcceptedTurnCallback` resets to `undefined`.

On watcher startup, an existing `turn_result.json` is swept.

Therefore:

- a failed file left on disk can be retried after restart;
- no original pending callback survives restart;
- an accepted file left on disk can also be re-observed because successful dedupe is not durable.

The last point is a separate new Finding Candidate, not a reason to expand RUNTIME-002A into persistent receipt/identity design.

## 3. Broken Invariant

Current code permits:

```text
Observed
→ Parsed
→ dedupe hash committed
→ Handled
→ accepted callback fired
→ canonical apply attempted
→ validation / commit fails
→ processTurnResult() returns false
→ caller still returns true
```

It can also permit:

```text
game_state commit succeeds
→ post-commit journal or secondary-ledger code throws
→ processTurnResult() returns false
```

Both violate the required invariant:

```text
Accepted / committed dedupe / Handled / accepted callback
must never become true before canonical success,
and post-Accepted failures must never turn the same turn back into a retryable whole-turn failure.
```

A failed hash must remain retryable. An accepted canonical mutation must never be replayed merely because a post-acceptance observer/secondary effect failed.

## 4. Accepted Boundary Decision

### Decision: Option A

**A TurnResult becomes Accepted immediately when `commitGameState()` returns `{ ok: true, action: 'write' }` for the prepared TurnResult `commitState`.**

This boundary is reached after the current pre-commit preparation/validation path and before post-commit independent ledgers, journal append, Handled, callback, and downstream file-consumer side effects.

This is Option A, strengthened by one necessary contract:

> Once `commitGameState()` succeeds, no later secondary-ledger, journal, callback, media, UI, image, or bootstrap failure may make the TurnResult unaccepted or eligible for whole-turn replay.

Exact answer to the central compensation question:

> If `game_state` commit succeeds, but a secondary ledger persistence later fails and current compensation policy intentionally retains `game_state`, is the turn Accepted?

**Yes. The turn is Accepted.**

The repository already declares that post-commit independent ledger failure does not roll back `game_state`. Delaying Accepted until those ledgers succeed would contradict current compensation policy.

### State vocabulary

- **Observed**: `turn_result.json` exists and its bytes were read.
- **Parsed**: bytes decoded as syntactically valid JSON.
- **Validated**: the current acceptance-critical application path has not rejected/aborted and prepared `commitState` passes `validateGameState()`.
- **Canonically Applied**: `commitGameState()` successfully wrote the authoritative TurnResult `game_state` mutation.
- **Accepted**: the turn crossed that canonical commit boundary; downstream systems may rely on it.
- **Handled**: the pending GM run lifecycle may be cleared and completion callback machinery may run.
- **Deduped**: the candidate hash has been committed as the hash of a successfully Accepted result and may suppress same-process re-observation.
- **Retryable Failure**: failure occurred before Accepted and did not commit dedupe, mark the run handled, or fire the accepted callback.

`Handled` is not semantically identical to `Accepted`. It is a subsequent lifecycle state.

## 5. Canonical Ordering Contract

Approved future ordering:

1. Observe/read `turn_result.json`.
2. Compute candidate SHA-256 hash.
3. Check only the **committed successful dedupe hash**.
4. If equal, return duplicate/no-op `false`.
5. Parse JSON.
6. Do not commit dedupe, do not mark Handled, do not fire callback.
7. Flush current pre-apply synchronization prerequisites as required by existing ownership.
8. Call `processTurnResult(turnResult)`.
9. Inside it, run current preparation, subsystem-owned pre-commit work, and result-state validation.
10. If pre-Accepted validation/preparation fails, return `false`.
11. Attempt `commitGameState()`.
12. If commit fails, return `false`.
13. **Accepted boundary:** `commitGameState(...).ok === true`.
14. Attempt post-commit secondary ledgers. Structured failure or thrown exception is compensation/reporting only and cannot revoke Accepted.
15. Attempt journal rotation/append. Failure is observability-only and cannot revoke Accepted.
16. Return a truthy enriched TurnResult from `processTurnResult()`.
17. In `processTurnResultFileAt()`, if the result is `false`, return `false`; do not perform success-only effects.
18. If truthy, commit `lastProcessedTurnHash = hash`.
19. Mark the pending GM run Handled.
20. Fire the stored post-acceptance callback with exception isolation.
21. Run success-only TurnResult media/image, webview, and protagonist-bootstrap effects with post-acceptance failure isolation.
22. Return `true` for the newly Accepted turn.

The Accepted **semantic boundary** is step 13. The current minimal implementation signal is delayed until `processTurnResult()` returns after post-commit accounting attempts; those attempts may delay the signal but may not suppress it.

### Return Contract

#### `processTurnResult(turnResult): TurnResult | false`

- Truthy enriched TurnResult means the turn crossed Accepted.
- `false` means the turn did **not** cross Accepted.
- `false` is reserved for pre-Accepted failures.
- Post-commit secondary-ledger failures, including thrown exceptions, must be isolated/logged and still produce a truthy accepted result.
- Post-commit journal rotation/append failures must be isolated/logged and still produce a truthy accepted result.

No explicit new result type is required.

#### `processTurnResultFileAt(fsPath): Promise<boolean>`

- `true`: this invocation newly Accepted a non-duplicate TurnResult.
- `false`: missing file, duplicate successful hash, parse/read exhaustion, or pre-Accepted processing failure.
- `processTurnResult() === false` must immediately produce file-processing `false`.
- A `false` application result must not use the three-attempt read/parse retry loop to replay whole canonical processing automatically.
- Read/empty/parse exceptions may retain the existing bounded short retry for file-write races.
- On pre-Accepted `false`, preserve the file, do not commit hash, do not mark Handled, do not fire callback, and do not run success-only media/UI/bootstrap effects.
- Same hash remains eligible for later watcher event, replacement, fallback check, or restart.
- Once Accepted is crossed, post-acceptance failures must not make the function return `false` for that newly Accepted invocation.

### Failure propagation

For retry semantics, `processTurnResult() === false` and a thrown **pre-Accepted** failure are equivalent in authority:

- not Accepted;
- no dedupe commit;
- no Handled;
- no callback;
- later retry allowed.

They are not required to use the same immediate scheduling. Deterministic validation failure should not be blindly replayed three times merely because parse/read races are retried.

Logs must continue to distinguish:

- read/parse failure;
- result-state validation rejection;
- canonical commit skip/quarantine/circuit/write failure;
- post-acceptance secondary compensation;
- journal observability failure;
- callback/downstream side-effect failure.

The file caller must not label a `processTurnResult() === false` result as a parse failure.

## 6. Failure Matrix

| Failure Point | Accepted? | Dedupe committed? | Handled? | Callback? | Retry allowed? |
|:--|:--:|:--:|:--:|:--:|:--:|
| Parse failure | No | No | No | No | Yes |
| TurnResult shape/schema rejection before commit | No | No | No | No | Yes |
| Semantic validation failure before commit | No | No | No | No | Yes |
| `validateGameState(commitState)` failure | No | No | No | No | Yes |
| Canonical `commitGameState()` failure | No | No | No | No | Yes |
| Secondary ledger partial failure after commit | Yes | Yes | Yes | Once if registered | No whole-turn retry |
| Secondary ledger thrown/total failure after commit | Yes | Yes | Yes | Once if registered | No whole-turn retry |
| Journal failure after commit | Yes | Yes | Yes | Once if registered | No whole-turn retry |
| Callback failure | Yes | Yes | Yes | Attempted once; exception isolated | No whole-turn retry |
| Post-accept media/UI/bootstrap failure | Yes | Yes | Yes | Already post-accept | No whole-turn retry |
| Duplicate successful result, same process | Already Accepted earlier; no new acceptance | Already committed | No new Handled | No new callback | No reapply |

Notes:

- “Retry allowed” means the failed hash is not permanently suppressed. It does not promise multi-ledger atomic replay; pre-commit cross-ledger idempotency remains TEMP-001B/C scope.
- Same invalid bytes may be observed again and fail deterministically. They still must not be falsely marked successful/deduped.
- A post-Accepted failure is never a reason to replay the whole TurnResult.

## 7. Dedupe and Retry Contract

### Committed dedupe

`lastProcessedTurnHash` is a committed accepted-result marker, not an observation marker.

Approved:

```text
processTurnResult() returns truthy Accepted result
→ lastProcessedTurnHash = hash
→ mark Handled
→ callback
```

Forbidden:

```text
hash recorded
→ canonical apply attempted later
```

### In-flight reservation

No in-flight reservation is required for RUNTIME-002A.

Reasons:

- watcher create/change events and fallback checks can queue multiple calls;
- the current successful processing path is synchronous and does not `await` during the canonical apply/dedupe critical path;
- JavaScript event-loop execution therefore does not interleave two successful apply critical sections;
- after the first success commits the hash, later queued invocations see the committed duplicate;
- failed read/parse paths may yield during the retry sleep, but no accepted canonical apply happened before that yield;
- reserving a hash before success would enlarge scope and risks suppressing the legitimate retry this task must preserve.

If canonical apply becomes asynchronous later, re-evaluate in-flight reservation separately.

### Failed hash

A failed hash is never committed. The same bytes may be retried after:

- a read/parse race;
- a pre-commit validation/semantic rejection;
- a transient canonical commit failure;
- a later watcher/fallback observation;
- extension restart.

A corrected file with a new hash is not blocked by the failed old hash.

### Same file after failure

#### Validation failure

- Retryable: yes.
- Deduped: no.
- Pending run: not marked Handled; remains pending until the existing fallback lifecycle accepts a real/synthesized result or clears it.
- Callback: no.
- File: preserved.

#### Canonical commit failure

- Retryable: yes.
- Deduped: no.
- Pending run: not marked Handled.
- Callback: no.
- File: preserved.

#### Corrected new file

- Retryable/processable: yes.
- Old failed hash has no authority.
- New hash may be Accepted, then committed to dedupe.
- If the original pending run is still active, its callback fires only after Accepted.

#### Extension restart

- Failed file remains retryable because in-memory dedupe resets.
- Original pending callback cannot survive restart.
- Startup sweep may accept the file without any original callback.
- Successful-file replay after restart is a separate Candidate finding below.

## 8. Handled / Callback Contract

`markTurnResultHandled()` currently bundles:

1. clear pending GM run state;
2. detach/clear the pending callback;
3. invoke that callback.

Conceptually:

```text
Accepted
→ committed dedupe
→ Handled
→ callback attempt
```

### Is Handled identical to Accepted?

No.

Accepted is canonical authority. Handled is a later pending-run lifecycle transition.

Examples:

- a startup-sweep acceptance can be Accepted even though there is no meaningful pending run to clear;
- a callback may throw after the run is already Accepted and Handled;
- duplicate observation of an earlier Accepted result is not a new Handled transition.

### Must `markTurnResultHandled()` be split now?

No.

Splitting the function is not required if:

- it is called only after Accepted and committed dedupe;
- it clears/detaches callback state before invoking the callback;
- callback exceptions are caught/logged and cannot escape.

Keeping the existing API is the minimum architecture. Renaming/splitting is optional cleanup.

### Callback timing

The callback fires only after:

- canonical `game_state` commit succeeded;
- current post-commit secondary/journal attempts completed without being allowed to revoke acceptance;
- committed dedupe hash was advanced;
- pending callback state was detached.

It fires before or as part of the remaining file-consumer success-only downstream effects.

### Callback failure

If callback code throws:

- Accepted remains true;
- dedupe remains committed;
- Handled remains true;
- canonical apply is not retried;
- the exception is logged and swallowed at the lifecycle boundary;
- no automatic callback retry occurs.

Callback consumers that perform durable effects must be idempotent because the callback is not transactionally coupled to their side effect and may fail after partially executing.

### Callback identity

Current callback type is `() => void`.

RUNTIME-002A does not add a hash, turn ID, token, or immutable ACK receipt to the callback. Identity/token design remains PROMPT-001C scope.

## 9. Compensation Policy

Exact rule:

> Once `commitGameState()` succeeds, the TurnResult remains Accepted. Failure of any currently post-commit independent ledger or journal write must be reported/compensated without rolling back `game_state` and without replaying the whole TurnResult.

### Write inventory and required classification

| Write / effect | Owner / timing | Classification |
|:--|:--|:--|
| Flush of previously scheduled commerce persistence to `game_state` / `world_state` | `flushScheduledCommercePersist()`, before current TurnResult commit | **compensatable best-effort persistence** |
| Elapsed world simulation persistence to `world_state` and optionally `npc_registry` | `persistWorldSimulationSteps()`, before `game_state` commit | **acceptance-critical canonical write** in the current pre-commit phase; full atomicity remains TEMP-001B/C |
| Guild/domain/living-world/reputation/quest/location world-state persistence | subsystem-owned helpers before `game_state` commit | **acceptance-critical canonical write** in the current pre-commit phase; owner-specific no-op/false semantics are not redesigned here |
| NPC-memory / simulation registry persistence | `npcRegistry` owner, before `game_state` commit | **acceptance-critical canonical write** in the current pre-commit phase |
| TurnResult `game_state.json` commit | `commitGameState()` | **acceptance-critical canonical write** and the RUNTIME-002A Accepted commit point |
| Discovery ledger | after `game_state` commit | **post-acceptance secondary ledger** |
| Campaign resources ledger | after `game_state` commit | **post-acceptance secondary ledger** |
| Settlement layout ledger | after `game_state` commit | **post-acceptance secondary ledger** |
| Vehicle/mobile-base ledger | after `game_state` commit | **post-acceptance secondary ledger** |
| `state_journal.ndjson` rotation/append | after commit | **observability only** |
| Compensation/error logging | after failures | **observability only** |
| TurnResult media/image queue, webview update, protagonist bootstrap | file-consumer post-acceptance phase | **observability only** for acceptance authority; these effects cannot decide or revoke Accepted |

No current write in the reviewed RUNTIME-002A path needs `unclear / requires escalation` to define this Gate. The non-atomic relationship among independently canonical pre-commit ledgers is known residual scope for TEMP-001B/C.

### Journal semantics

Journal append is observability only.

If journal append fails after `game_state` commit:

- Accepted remains true;
- dedupe must still commit;
- Handled/callback must still proceed;
- failure is logged/reported;
- whole-turn retry is forbidden.

Retrying the whole TurnResult after a journal-only failure is unsafe because canonical mutation and possibly secondary ledger writes have already occurred.

## 10. Restart Semantics

| Scenario | Retryable? | Deduped? | Pending run still active? | Callback fired? | File behavior |
|:--|:--:|:--:|:--:|:--:|:--|
| Invalid JSON observed again | Yes | No | Until current fallback lifecycle clears/accepts another result | No | Preserved; can be observed again |
| Parsed but pre-commit invalid/rejected | Yes | No | Not marked Handled; fallback lifecycle decides eventual clear/synthesis | No | Preserved |
| Canonical commit transient failure | Yes | No | Not marked Handled | No | Preserved; same hash can retry |
| Corrected file with new hash | Yes | No failed-hash authority | If still pending, yes until acceptance | Only after Accepted | New hash processes normally |
| Restart with failed file still present and still invalid | Yes | No | Original pending state lost | No original callback | Startup sweep retries and fails again |
| Restart with failed file and transient condition now cleared | Yes, then success | New-process hash commits after success | Original pending state lost | No original callback | Startup sweep may Accept it |
| Restart with previously successful file present | Current code can replay | No durable dedupe | Original pending state lost | No original callback | Candidate finding; out of RUNTIME-002A fix |

Pending/callback state is intentionally not reconstructed by this task.

## 11. PROMPT-001C Dependency Contract

After RUNTIME-002A implementation, PROMPT-001C may rely on:

> The pending-run post-acceptance callback means the TurnResult has crossed the RUNTIME-002A Accepted boundary: the authoritative TurnResult `game_state` commit succeeded.

Guarantees:

- signal is post-canonical-commit;
- it cannot fire for parse failure;
- it cannot fire for pre-commit validation/semantic failure;
- it cannot fire for canonical commit failure;
- it fires at most once for one newly Accepted non-duplicate result in the current extension-host lifetime;
- same-process duplicate successful observation does not fire it again;
- callback failure does not unaccept or replay the turn;
- post-commit secondary-ledger success is not implied.

Non-guarantees:

- no durable exactly-once identity across restart;
- no immutable provider-delivery ACK token;
- callback receives no identity/token;
- no promise that every independently canonical ledger is atomic with `game_state`;
- no callback retry after callback exception.

PROMPT-001C must own any immutable identity/ACK token and downstream durable idempotency design. RUNTIME-002A provides only the truthful post-commit acceptance signal.

## 12. Required Implementation Shape

### MUST CHANGE

#### `src/gameStateSync.ts`

Responsibilities:

- treat `processTurnResult() === false` as failed file processing;
- immediately return `false` on that result;
- move `lastProcessedTurnHash = hash` after truthy Accepted result;
- move `markTurnResultHandled()` after committed dedupe;
- move `handleTurnResultMedia()`, auto-image consumption/queue, webview update, and protagonist bootstrap to success-only post-acceptance execution;
- do not use `enriched || turnResult` to notify UI after an application failure;
- ensure post-Accepted caller-side effects cannot make a newly Accepted invocation return `false`;
- preserve same-hash retry after failure.

Minimum conceptual shape:

```text
read/hash/duplicate/parse
→ const enriched = processTurnResult(turnResult)
→ if (!enriched) return false
→ lastProcessedTurnHash = hash
→ markTurnResultHandled()
→ isolated post-acceptance effects
→ return true
```

#### `src/statePatch.ts`

Responsibilities:

- reserve `false` for failures before Accepted;
- make successful `commitGameState()` the exact commit point;
- isolate both structured and thrown post-commit secondary-ledger failures;
- isolate journal rotation/append failures;
- always return a truthy enriched accepted result after the commit point.

No global TurnResult validator and no new multi-ledger transaction are required.

#### `src/turnResultFallback.ts`

Responsibilities:

- keep callback state detached/cleared before invocation;
- catch/log callback exceptions;
- never allow callback failure to escape and trigger canonical retry or reverse Handled.

### MAY CHANGE

Future implementation tests only:

- a new focused test such as `scripts/test_runtime_turn_result_acceptance.js`;
- `scripts/run_all_tests.js` and/or `scripts/validate.js` only to register that test.

### MUST NOT CHANGE for RUNTIME-002A implementation

- `src/stateManager.ts`
- `src/turnLedgerPersistCore.ts`
- `src/livingWorldCommercePersist.ts`
- `src/livingWorldTurnOps.ts`
- `src/worldSimPersist.ts`
- `src/worldState.ts`
- `src/npcRegistry.ts`
- `src/mediaAgent.ts`
- `src/extension.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`
- `docs/AI_REVIEW_BACKLOG.md`
- `docs/AI_FINDINGS_INBOX.md`
- status fields in `docs/ai-tasks/RUNTIME-002A.md`
- State Orchestrator architecture
- TEMP-001B/C multi-ledger transaction design
- PROMPT-001C immutable ACK/token design
- unrelated runtime/prompt/context code

This is the smallest correct runtime Touch Set: three source files plus focused tests.

## 13. Future Test Matrix

For this matrix, **apply count means successful authoritative `game_state` TurnResult commit count**, not mere function-entry or commit-attempt count.

| Test | Apply count | Accepted count | Handled count | Callback count | Dedupe state | Retryability |
|:--|--:|--:|--:|--:|:--|:--|
| 1. Parse failure | 0 | 0 | 0 | 0 | Hash not committed | Same file retry allowed |
| 2. TurnResult shape/schema failure before commit | 0 | 0 | 0 | 0 | Hash not committed | Same file retry allowed |
| 3. Semantic validation failure before commit | 0 | 0 | 0 | 0 | Hash not committed | Same file retry allowed |
| 4. Canonical commit failure | 0 | 0 | 0 | 0 | Hash not committed | Same hash retry allowed |
| 5. Successful apply | 1 | 1 | 1 | 1 | Hash committed | No same-process whole-turn retry |
| 6. Duplicate successful result | 1 total, 0 additional | 1 total, 0 additional | 1 total, 0 additional | 1 total, 0 additional | Already committed | Duplicate suppressed |
| 7. Failed same-hash retry, then success | 1 total after later success | 1 | 1 | 1 | Committed only after success | Allowed until success |
| 8. Corrected new hash after failure | 1 for corrected file | 1 | 1 | 1 | Corrected hash committed | Old failed hash has no authority |
| 9. Restart with failed file; transient condition clears | 1 total after restart success | 1 | 1 lifecycle-call/no-op pending clear | 0 original callback | New-process hash committed | Startup sweep retries |
| 10. `game_state` success + secondary ledger partial failure | 1 | 1 | 1 | 1 | Hash committed | No whole-turn retry |
| 11. Journal failure after `game_state` success | 1 | 1 | 1 | 1 | Hash committed | No whole-turn retry |
| 12. Accepted callback throws | 1 | 1 | 1 | 1 attempted | Hash committed | No whole-turn retry |
| 13. Callback exactly once under watcher + fallback duplicate observations | 1 | 1 | 1 | 1 | Hash committed | Later same-process observations suppressed |

Required assertions beyond counts:

1. **Parse failure**
   - bounded read/parse retry may occur;
   - `processTurnResult()` not called for invalid JSON;
   - file preserved.

2. **Shape/schema failure**
   - no accepted side effects;
   - raw rejected TurnResult not posted as successful `gameStateUpdate`.

3. **Semantic validation failure**
   - model using an existing pre-commit semantic rejection seam or controlled stub;
   - no need to add a production-wide error taxonomy.

4. **Canonical commit failure**
   - same hash not suppressed;
   - domain-specific commit log retained.

5. **Successful apply**
   - ordering assertion: commit success before hash, before Handled, before callback.

6. **Duplicate successful result**
   - invoke file path repeatedly through watcher/fallback surfaces;
   - zero additional apply/Handled/callback.

7. **Failed same-hash retry**
   - first attempt pre-Accepted false;
   - second identical bytes after transient clears succeeds exactly once.

8. **Corrected new hash**
   - old failed hash never committed;
   - new file succeeds normally.

9. **Restart with failed file**
   - reset module dedupe/pending state;
   - startup sweep retries;
   - original callback count remains zero.

10. **Secondary partial failure**
    - include returned structured failure and a thrown post-commit secondary exception case;
    - both remain Accepted.

11. **Journal failure**
    - inject append failure;
    - accepted result stays truthy and callback/dedupe still happen.

12. **Callback throws**
    - exception observed in log;
    - no canonical retry;
    - duplicate observation remains suppressed.

13. **Exactly once callback**
    - create/change/fallback duplicate observations around one successful file;
    - one callback only.

The focused test should exercise actual ordering seams, not merely pure `statePatch` helpers.

## 14. Alternatives Rejected

### Design A — naive move only

**Selected boundary, rejected implementation sufficiency.**

Option A is the correct Accepted boundary, but only moving `lastProcessedTurnHash` and `markTurnResultHandled()` after the current `processTurnResult()` call is insufficient. Current `processTurnResult()` can still return `false` after successful commit because of post-commit exceptions.

Approved architecture is therefore **Option A plus a truthful return contract**.

### Design B — explicit result type

Rejected for current scope.

A future status union could improve diagnostics, but RUNTIME-002A can be correct with `TurnResult | false` if:

- truthy means Accepted;
- false means not Accepted;
- post-acceptance failures are isolated.

Adding a result taxonomy now enlarges Touch Set without being necessary.

### Design C — in-flight reservation + committed dedupe

Rejected.

No real interleaving of two successful synchronous apply critical sections was found. A reservation adds state and creates a new release-on-failure problem.

### Design D — split Accepted from Handled callback machinery

Rejected as a requirement.

Conceptual separation is mandatory; API splitting is not. Correct ordering and callback exception isolation are enough for the current task. A later rename/split may be cleanup.

## 15. Residual Risks

- Pre-commit `world_state` / `npc_registry` / scheduled-commerce mutations are not transactionally atomic with the TurnResult `game_state` commit. TEMP-001B/C owns that architecture.
- Allowing retry after pre-Accepted `game_state` commit failure does not guarantee all earlier subsystem side effects are globally idempotent. RUNTIME-002A must preserve retry eligibility but cannot solve multi-ledger replay safety.
- Current TypeScript file path has no dedicated TurnResult runtime schema validator.
- Current same-process dedupe is one in-memory hash only.
- Durable accepted identity and cross-restart exactly-once behavior remain unresolved.
- Callback is an at-most-once in-memory signal with no payload/identity.
- If `processTurnResult()` is made asynchronous in the future, concurrency assumptions must be re-reviewed.
- Connector-backed exact-symbol search returned no index hits; adversarial review should re-run local `rg`/`grep` if available.

## 16. New Finding Candidates

### Candidate ID: `CHATGPT-20260706-001`

- **Reporter:** ChatGPT (GPT-5.5 Thinking)
- **As-of Commit:** `3b09c70ef2d4b07c772ce6902b377198658da847`
- **Evidence:** `lastProcessedTurnHash` is module-level memory initialized to `''`; `startGameStateWatcher()` unconditionally sweeps an existing `turn_result.json`; successful file processing does not remove/archive the file. After extension-host restart, an already Accepted file can be processed again because no successful dedupe survives restart.
- **Suggested Severity:** P1 High
- **Possible Duplicate:** Related to RUNTIME-002A and future PROMPT/runtime identity work, but no exact duplicate was found in the reviewed Backlog/Findings Inbox.
- **Confidence:** High

Impact note: reprocessing is not necessarily harmless because TurnResult processing includes potentially non-idempotent world simulation and ledger effects.

### Candidate ID: `CHATGPT-20260706-002`

- **Reporter:** ChatGPT (GPT-5.5 Thinking)
- **As-of Commit:** `3b09c70ef2d4b07c772ce6902b377198658da847`
- **Evidence:** `processTurnResult()` can apply `persistWorldSimulationSteps()` before the fresh-revision check. If `freshRevision > baseRevision`, it then calls `applyTurnResultToGameState(turnResult, freshDisk, false)`. That helper unconditionally processes `elapsedWorldTurns` and calls `persistWorldSimulationSteps()` again; its `persistWorld` flag only gates later living-world persistence. The same TurnResult can therefore advance world simulation twice on the optimistic-reapply path.
- **Suggested Severity:** P1 High
- **Possible Duplicate:** Related to TEMP-001B/C and state-merge/concurrency work; no exact duplicate was found in the reviewed Backlog/Findings Inbox.
- **Confidence:** High

Neither Candidate is added to Backlog or Findings Inbox by this Gate.

## 17. Gate Verdict

`READY_FOR_ADVERSARIAL_REVIEW`

The architecture question is answered precisely:

> The rest of LoreRelay may truthfully believe a TurnResult has been Accepted at the successful `commitGameState()` commit point, and only then. Later secondary-ledger, journal, callback, or downstream-effect failure may require compensation/reporting, but may not revoke Accepted or trigger whole-turn replay.

RUNTIME-002A is not ready for implementation until adversarial architecture review also passes.
