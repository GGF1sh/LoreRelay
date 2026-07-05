# RUNTIME-002A Architecture Gate Report

Task: `RUNTIME-002A — TurnResult handled/dedupe ordering + post-commit Accepted boundary`

Status: Architecture Gate only. No runtime source or test implementation is included in this report.

## 1. Gate Snapshot

- Current `main` HEAD reviewed: `3b09c70ef2d4b07c772ce6902b377198658da847`
- Current `main` was rechecked before writing this report and was still identical to the Chief Integrator snapshot.
- Gate verdict: `READY_FOR_ADVERSARIAL_REVIEW`

### Reviewed control docs

- `docs/AI_REVIEW_BACKLOG.md`
- `docs/AI_FINDINGS_INBOX.md`
- `docs/ai-tasks/RUNTIME-002A.md`

### Reviewed runtime source

- `src/gameStateSync.ts`
- `src/turnResultFallback.ts`
- `src/statePatch.ts`
- `src/turnLedgerPersistCore.ts`
- `src/stateManager.ts`
- `src/worldState.ts`
- `src/livingWorldCommercePersist.ts`
- `src/mediaAgent.ts`
- `src/extension.ts`
- `src/gmBridgeRunner.ts`
- `src/agenticGmRunner.ts`

### Reviewed callers / references

The GitHub connector code-search index returned no hits for exact-symbol searches such as `processTurnResultFileAt`, `processTurnResult`, `beginGmRun`, and `turn_result`; caller coverage was therefore completed by direct source inspection of the modules that import or wire these functions.

Reviewed references include:

- `startGameStateWatcher()` and its `turn_result.json` watcher path in `src/gameStateSync.ts`
- startup sweep via `processTurnResultFileAt(path.join(folder.uri.fsPath, 'turn_result.json'))`
- `checkPendingTurnResultFile()` in `src/gameStateSync.ts`
- `initTurnResultFallback(checkPendingTurnResultFile)` in `src/extension.ts`
- `beginGmRun()`, `finishGmRun()`, and `markTurnResultHandled()` in `src/turnResultFallback.ts`
- Grok, local LLM, custom command, VS Code LM, and agentic GM paths in `src/gmBridgeRunner.ts` and `src/agenticGmRunner.ts`
- pending accepted callbacks that mark provider session continuation (`grokSessionActive`, `localGmSessionActive`)

### Reviewed tests

- `package.json` test scripts
- `scripts/run_all_tests.js`
- `scripts/validate.js`
- `scripts/test_turn_result_pipeline.js`
- `scripts/test_state_patch.js`
- `scripts/test_turn_artifact_commit_atomicity.js`
- `scripts/test_cross_ledger_partial_failure.js`

Current tests document patch/merge behavior and cross-ledger compensation, but do not currently test the `processTurnResultFileAt()` Accepted/Handled/Dedupe boundary.

### Google Drive guardrail

Reviewed `LoreRelay World Intent / Action Execution Kernel - ChatGPT Master Design 2026-07-04` only as an upper-level guardrail. It reinforces that State Orchestrator must not become a universal save system, ledgers retain ownership of their parsing/migration/validation/persistence, and event-like downstream effects are post-commit only. Current GitHub `main` remains the source of truth for this Gate.

## 2. Current Reality

### A. File processing path: `processTurnResultFileAt()`

Current sequence in `src/gameStateSync.ts`:

1. `startGameStateWatcher()` creates a `turn_result.json` watcher for create/change events.
2. Each event schedules `processTurnResultFileAt(uri.fsPath)` after 50ms.
3. Watcher startup also sweeps the workspace root `turn_result.json` once.
4. `processTurnResultFileAt(fsPath, retryCount = 0)` returns `false` if the file does not exist.
5. It reads file text synchronously.
6. Empty content throws and enters the retry path.
7. It computes `sha256(content)`.
8. If `hash === lastProcessedTurnHash`, it returns `false` as an in-memory duplicate suppression.
9. It parses JSON using `JSON.parse(content) as TurnResult`.
10. It immediately assigns `lastProcessedTurnHash = hash`.
11. It immediately calls `markTurnResultHandled()`.
12. It calls `handleTurnResultMedia(turnResult)`.
13. It calls `flushScheduledCommercePersist()`.
14. It calls `const enriched = processTurnResult(turnResult)`.
15. It calls `takeAutoLocationImageRequest()` and may queue an auto location image.
16. It posts a `gameStateUpdate` with `turnResult: sanitizeTurnResultForWebview(enriched || turnResult, ...)`.
17. It calls `scheduleProtagonistBootstrap(turnResult)`.
18. It returns `true`.
19. In the outer `catch`, it retries up to three times after 100ms, then logs parse/read failure and returns `false`.

The critical current fact is that `lastProcessedTurnHash` and `markTurnResultHandled()` advance before `processTurnResult()` is called, and `processTurnResult()` returning `false` is not treated as a failed file-processing result.

### B. `processTurnResult()` path

Current sequence in `src/statePatch.ts`:

1. Resolve `game_state.json` path. If missing, return `false`.
2. Flush scheduled commerce persistence.
3. Read current game state or create an initial record.
4. Capture `baseRevision` and `beforeHash`.
5. Apply TurnResult patches and fog/cartography transformations.
6. Apply elapsed world simulation steps. A non-ok simulation result logs a warning and continues.
7. Load `world_state.json` and apply domain/guild travel drift. Some drift paths may persist `world_state.json` before `game_state` commit.
8. Load `world_state.json` again and apply faction reputation, quest completion, and location visit changes. If dirty, save `world_state.json` before `game_state` commit.
9. Build finalized `commitState` by merging GM entry, living-world operations, domain operations, guild operations, and normalized status fields.
10. Re-read fresh disk state. If disk revision advanced past `baseRevision`, reapply TurnResult to the fresh disk state.
11. Calculate pending auto-location-image request metadata.
12. Validate `commitState` with `validateGameState()`. On validation errors, log/show error and return `false`.
13. Compute `afterHash`.
14. Call `commitGameState(commitState, { mode: 'salvage', baseRevision, mergeProfile: 'turn' })`.
15. If `commit.ok === false`, log skip/quarantine/circuit details and return `false`.
16. Call `persistTurnLedgersAfterCommit()` for discovery, campaign resources, settlement layout, vehicle, and mobile-base ledgers.
17. If ledger persistence is not ok, log the partial/failed targets and explicitly retain `game_state` per compensation policy.
18. Build an enriched `TurnResult` with `beforeHash`, `afterHash`, and `appliedAt`.
19. Rotate `state_journal.ndjson` best-effort inside a local try/catch.
20. Append the enriched TurnResult to `state_journal.ndjson` using `fs.appendFileSync()`.
21. Return the enriched TurnResult.
22. Any uncaught exception in this path is caught by the outer catch, logged, shown to the user, and returns `false`.

Important current hazard: `fs.appendFileSync()` for `state_journal.ndjson` is currently outside the local rotation try/catch. If it throws after `commitGameState()` succeeded, `processTurnResult()` currently returns `false` after the canonical game-state commit. This is incompatible with a truthful Accepted boundary and must be corrected by implementation.

### C. Pending GM run lifecycle

Current sequence:

1. GM bridge providers call `beginGmRun(onAcceptedTurn?)` before starting a provider run.
2. `beginGmRun()` sets `pendingTurnResultFromGm = true` and stores `pendingAcceptedTurnCallback`.
3. When the provider exits successfully, the provider calls `finishGmRun(prevState, playerAction, true)`.
4. `finishGmRun()` waits 250ms.
5. If still pending, it calls injected `checkPendingTurnResultFile()`.
6. `checkPendingTurnResultFile()` calls `processTurnResultFileAt(workspace/turn_result.json)`.
7. Current `processTurnResultFileAt()` calls `markTurnResultHandled()` before canonical apply.
8. Current `markTurnResultHandled()` clears pending state, clears the callback, and invokes the callback synchronously without exception isolation.
9. `finishGmRun()` sees `handled === true` or `pendingTurnResultFromGm === false` and stops.
10. If no real TurnResult was handled, `finishGmRun()` may synthesize a fallback TurnResult from direct `game_state.json` changes.

### D. Restart behavior

Current `lastProcessedTurnHash` and pending callback state are module-level in-memory state only.

On extension restart:

- `lastProcessedTurnHash` resets to `''`.
- `pendingTurnResultFromGm` resets to `false`.
- `pendingAcceptedTurnCallback` resets to `undefined`.
- `startGameStateWatcher()` performs a startup sweep for an existing `turn_result.json`.
- A failed file that remains present can be retried after restart because no committed dedupe survives restart.
- A previously successful file that remains present can also be re-observed after restart because current dedupe is not persistent. Durable accepted-result identity is outside RUNTIME-002A and belongs to later receipt/identity work.
- If a failed file is retried after restart without a pending GM run, it may still be applied, but the original pending callback cannot fire because that in-memory pending run no longer exists.

## 3. Broken Invariant

Current code can produce this false sequence:

```text
Observed
→ Parsed
→ Deduped
→ Handled
→ accepted callback fired
→ canonical apply attempted
→ canonical validation/commit fails or returns false
```

This violates the required invariant:

```text
Accepted / Handled / committed dedupe must never become true before canonical application succeeds.
```

It also violates retryability: a failed TurnResult hash can become `lastProcessedTurnHash`, suppressing the same file in the same extension process even though the turn never became Accepted.

## 4. Accepted Boundary Decision

Decision: **Option D — post-validation `game_state` canonical commit boundary, before secondary ledgers, journal, callback, and downstream events.**

A TurnResult becomes **Accepted** when all of the following are true:

1. the TurnResult file has been observed and parsed;
2. the current `processTurnResult()` validation/preparation path has not rejected the turn;
3. `validateGameState(commitState)` has passed;
4. `commitGameState(commitState, { mode: 'salvage', baseRevision, mergeProfile: 'turn' })` has returned `{ ok: true, action: 'write' }`.

The accepted boundary is reached **at the successful `game_state.json` commit**. It is **not** delayed until independent discovery/campaign/settlement/vehicle ledgers succeed. It is **not** delayed until `state_journal.ndjson` append succeeds. It is **not** delayed until webview/media/protagonist/callback side effects succeed.

Exact answer to the required question:

> If `game_state` commit succeeds, but a secondary ledger persistence later fails and current compensation policy intentionally retains `game_state`, is the turn Accepted?

**Yes. The turn is Accepted.** The secondary ledger failure is post-acceptance compensation/reporting, not a reason to unaccept or retry the whole TurnResult.

### State vocabulary

- **Observed**: a `turn_result.json` file exists and was read.
- **Parsed**: file content decoded as syntactically valid JSON into a TurnResult-shaped value.
- **Validated**: current TurnResult application path has produced a `commitState` that passes `validateGameState()` and has not hit a semantic rejection/abort before commit. Safe-patch allowlist skips are sanitization, not whole-turn rejection by themselves.
- **Canonically Applied**: `commitGameState()` wrote the authoritative `game_state.json` mutation successfully.
- **Accepted**: the turn crossed the boundary above. Downstream systems may rely on `game_state` canonical commit having happened.
- **Handled**: the pending GM run lifecycle may be cleared and completion/accepted callback machinery may run.
- **Deduped**: the hash is committed as a successfully accepted hash and may suppress later observation of the same successful result in the same extension process.
- **Retryable Failure**: failure occurred before Accepted and did not commit dedupe, clear pending as accepted, or fire the accepted callback.

## 5. Canonical Ordering Contract

Approved future ordering:

1. Observe/read `turn_result.json`.
2. Compute candidate hash.
3. Check candidate hash against **committed accepted-result dedupe** only.
4. Parse JSON.
5. Do not mark handled, do not commit dedupe, do not fire accepted callback.
6. Call `processTurnResult(turnResult)`.
7. Inside `processTurnResult()`, apply current validation/preparation path.
8. If validation or canonical commit fails, return `false` before Accepted.
9. Accepted boundary: `commitGameState(...).ok === true`.
10. Persist post-acceptance secondary ledgers and log compensation outcomes. These failures do not unaccept the turn.
11. Append journal as observability-only best effort. Journal failure does not unaccept the turn.
12. Return a truthy enriched TurnResult from `processTurnResult()` only after the Accepted boundary.
13. In `processTurnResultFileAt()`, if `processTurnResult()` returned `false`, return `false` and leave the same hash retryable.
14. If `processTurnResult()` returned truthy, commit `lastProcessedTurnHash = hash`.
15. Mark the pending GM run handled.
16. Fire the post-acceptance callback, with exception isolation.
17. Perform post-acceptance UI/media/auto-image/protagonist side effects.
18. Return `true` from `processTurnResultFileAt()` for a newly Accepted turn.

`Handled` may immediately follow `Accepted` in implementation, but the conceptual ordering must remain explicit.

## 6. Failure Matrix

| Failure Point | Accepted? | Dedupe committed? | Handled? | Callback? | Retry allowed? | Required behavior |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| Parse failure | No | No | No | No | Yes | Preserve file; retry short read/parse race; later same hash may retry. |
| TurnResult schema/shape failure | No | No | No | No | Yes | Treat as pre-accept rejection; do not suppress corrected or same-file retry. |
| Semantic validation failure | No | No | No | No | Yes | `processTurnResult()` returns `false`; caller returns `false`. |
| `validateGameState(commitState)` failure | No | No | No | No | Yes | No callback, no dedupe, no accepted side effects. |
| `commitGameState()` skip/quarantine/circuit/write failure | No | No | No | No | Yes | Same hash remains retryable; log commit failure separately from parse/validation. |
| Secondary ledger partial failure after `game_state` commit | Yes | Yes | Yes | Yes | No whole-turn retry | Log compensation; retain `game_state`; do not reapply TurnResult. |
| Secondary ledger total failure after `game_state` commit | Yes | Yes | Yes | Yes | No whole-turn retry | Same as partial; failed ledgers require operator/host reconciliation, not TurnResult replay. |
| Journal rotation failure | Yes if `game_state` committed | Yes | Yes | Yes | No whole-turn retry | Log observability failure; Accepted remains true. |
| Journal append failure | Yes if `game_state` committed | Yes | Yes | Yes | No whole-turn retry | Must be isolated from `processTurnResult()` false return. |
| Post-accept media/webview/protagonist side effect failure | Yes | Yes | Yes | Callback already post-accept | No whole-turn retry | Log/isolate; do not unaccept canonical state. |
| Accepted callback throws | Yes | Yes | Yes | Attempted once | No whole-turn retry | Catch/log; callback failure does not rollback or retry canonical apply. |
| Duplicate successful result in same extension process | Already accepted earlier | Already committed earlier | No new handled | No new callback | No reapply | Return `false`/duplicate no-op; do not fire callback again. |

## 7. Dedupe and Retry Contract

### Committed dedupe

`lastProcessedTurnHash` is a committed accepted-result dedupe marker. It may become authoritative only after the TurnResult has crossed the Accepted boundary.

This is the approved timing:

```text
processTurnResult(turnResult) returns truthy accepted result
→ lastProcessedTurnHash = hash
→ mark handled / callback
```

This timing is forbidden:

```text
hash recorded
→ canonical apply attempted later
```

### In-flight reservation

No in-flight reservation is required for RUNTIME-002A.

Reasoning:

- The successful current `processTurnResultFileAt()` path is synchronous after entry and has no `await` until failure retry sleep paths.
- VS Code extension host JavaScript runs these callbacks on the same event loop; queued watcher/fallback invocations do not overlap inside the synchronous success path.
- Multiple file watcher events can queue, but after the first successful Accepted result commits `lastProcessedTurnHash`, later queued calls see the committed duplicate.
- When the first attempt fails before Accepted, the same hash must remain retryable, so a persistent in-flight reservation would enlarge scope and risk suppressing legitimate retry.

If future implementation makes canonical apply asynchronous, an in-flight reservation may be reconsidered as a separate concurrency task. It is not required here.

### Failed hash behavior

A failed hash is not committed. The same bytes may be retried after:

- read/parse race;
- schema/semantic validation failure if the operator wants another attempt;
- transient canonical commit failure;
- extension restart.

### Restart behavior

Current dedupe remains in-memory only. RUNTIME-002A does not introduce durable accepted-result dedupe. Therefore:

- failed pending files retry after restart;
- accepted files left on disk may be re-observed after restart;
- durable accepted identity / ACK token design remains PROMPT-001C or later runtime identity scope.

## 8. Handled / Callback Contract

`markTurnResultHandled()` currently bundles two effects:

1. clear pending GM run state;
2. fire the stored accepted callback.

Conceptually, **Handled is not identical to Accepted**. Accepted is the canonical success boundary. Handled is a pending-run lifecycle transition that is allowed only after Accepted.

Minimum approved architecture:

```text
Canonical game_state commit succeeds
→ TurnResult is Accepted
→ committed dedupe hash advances
→ pending GM run is marked Handled
→ post-acceptance callback fires
```

Splitting `markTurnResultHandled()` into separate `markAccepted` and `fireCallback` APIs is not required for RUNTIME-002A if the implementation enforces post-Accepted ordering and isolates callback exceptions. A rename/split may be a cleanup, not a Gate requirement.

### Callback exception semantics

If the accepted callback throws:

- the TurnResult remains Accepted;
- committed dedupe remains committed;
- pending GM run remains handled/cleared;
- canonical apply must not be retried;
- the exception must be caught and logged;
- callback consumers must be idempotent and must not assume they can make acceptance rollback.

This prevents callback failure from causing duplicate canonical mutation on retry.

## 9. Compensation Policy

Current repository policy already states:

- `game_state` commits before independent ledgers;
- independent ledger writes are gated on successful `game_state` commit;
- failed independent ledgers do not roll back `game_state`;
- failed ledger targets are surfaced for operator/host reconciliation.

RUNTIME-002A adopts that policy without redesigning multi-ledger atomicity.

### Write inventory and classification

| Write / side effect | Current location | Classification for RUNTIME-002A |
|:--|:--|:--|
| Scheduled commerce flush to `game_state` / `world_state` | `flushScheduledCommercePersist()` before/during processing | Pre-existing ambient persistence; not the TurnResult Accepted boundary. Failures must not be mistaken for Accepted. |
| `world_state` simulation/drift/reputation/quest/location writes before `game_state` commit | `statePatch.ts` helpers calling `saveWorldState()` / simulation persist | Current canonical-adjacent side effects; full atomicity is out of scope and belongs to TEMP-001B/C. Throwing failures before `game_state` commit keep TurnResult unaccepted. |
| `game_state.json` via `commitGameState()` | `processTurnResult()` | Acceptance-critical canonical write. |
| Discovery ledger | `persistTurnLedgersAfterCommit()` | Post-acceptance secondary ledger; compensatable. |
| Campaign resources ledger | `persistTurnLedgersAfterCommit()` | Post-acceptance secondary ledger; compensatable. |
| Settlement layout ledger | `persistTurnLedgersAfterCommit()` | Post-acceptance secondary ledger; compensatable. |
| Vehicle/mobile-base ledger | `persistTurnLedgersAfterCommit()` | Post-acceptance secondary ledger; compensatable. |
| `state_journal.ndjson` rotation/append | `processTurnResult()` | Observability only; must not decide Accepted. |
| Media/image queue | `handleTurnResultMedia()` / auto image queue | Post-acceptance event/side effect. |
| Webview `gameStateUpdate` | `processTurnResultFileAt()` | Post-acceptance UI notification. |
| Protagonist bootstrap scheduling | `scheduleProtagonistBootstrap()` | Post-acceptance side effect. |
| Accepted callback | `markTurnResultHandled()` | Post-acceptance lifecycle/event signal. |

### Journal rule

Journal append is observability only. If journal append fails after `game_state` commit, Accepted remains true. Retrying the whole TurnResult would be unsafe because canonical mutation and possibly some secondary ledger writes have already happened.

Implementation must therefore prevent post-commit journal failure from making `processTurnResult()` return `false`.

## 10. Restart Semantics

| Scenario | Retryable? | Deduped? | Pending run still active? | Callback fired? | File behavior |
|:--|:--:|:--:|:--:|:--:|:--|
| Invalid JSON file observed repeatedly | Yes | No | Yes until fallback lifecycle times out/clears | No | Preserved; startup sweep can retry after restart. |
| Parsed but schema/semantic invalid TurnResult | Yes | No | Yes until fallback lifecycle clears or new valid file accepted | No | Preserved; same hash may retry; corrected new hash processes. |
| Canonical commit transient failure | Yes | No | Yes until fallback lifecycle clears or valid retry accepted | No | Preserved; same hash may retry after transient clears. |
| Corrected file replaces failed file | Yes | No prior failed hash | If pending still active, callback can fire after Accepted | Only after Accepted | New hash processes normally. |
| Extension restart with failed file present | Yes | No in-memory dedupe | No original pending run/callback survives | No original callback | Startup sweep reprocesses file. |
| Extension restart with previously accepted file present | Current code may re-observe | No durable dedupe | No original pending run/callback survives | No original callback | Durable accepted identity is out of scope. |

## 11. PROMPT-001C Dependency Contract

After RUNTIME-002A is implemented, PROMPT-001C may rely on this signal:

> The post-acceptance callback fired by the pending GM run lifecycle means the TurnResult has crossed the RUNTIME-002A Accepted boundary: schema/current semantic checks passed and authoritative `game_state` canonical commit succeeded.

PROMPT-001C may rely on:

- callback is post-canonical-commit;
- callback does not fire for parse failure;
- callback does not fire for schema/semantic validation failure;
- callback does not fire for canonical commit failure;
- callback fires at most once per accepted non-duplicate TurnResult in the current extension process;
- callback failure does not make the turn unaccepted;
- duplicate same-hash successful result in the same extension process does not fire callback again.

PROMPT-001C may not rely on:

- durable accepted identity across extension restart;
- immutable provider-delivery ACK tokens;
- callback receiving a stable TurnResult identity/token;
- exactly-once semantics across process boundaries;
- secondary ledger success.

Current callback receives no identity/token. Designing immutable prompt ACK tokens and delivery-time source identity remains PROMPT-001C scope.

## 12. Required Implementation Shape

### MUST CHANGE

#### `src/gameStateSync.ts`

Responsibilities:

- Treat `processTurnResult(turnResult) === false` as failed processing.
- Do not commit `lastProcessedTurnHash` before Accepted.
- Do not call `markTurnResultHandled()` before Accepted.
- Do not fire accepted UI/media/protagonist side effects before Accepted.
- Preserve retryability for failed same-hash files.
- Keep duplicate successful-result suppression in the same extension process.

Minimum shape:

```text
parse
→ if committed duplicate return false
→ const enriched = processTurnResult(turnResult)
→ if (!enriched) return false
→ lastProcessedTurnHash = hash
→ markTurnResultHandled()
→ post-accept side effects
→ return true
```

#### `src/statePatch.ts`

Responsibilities:

- Preserve `false` only for pre-Accepted failures.
- Ensure successful `commitGameState()` is the Accepted boundary.
- Ensure secondary ledger failure after `game_state` commit returns a truthy accepted result with compensation logged.
- Ensure journal rotation/append failure after `game_state` commit is caught/logged and does not turn Accepted into `false`.

#### `src/turnResultFallback.ts`

Responsibilities:

- Ensure accepted callback exceptions cannot escape and cannot undo Handled/Accepted state.
- Keep pending lifecycle clear semantics, but make callback failure post-acceptance and isolated.

### MAY CHANGE

- `scripts/run_all_tests.js` / `scripts/validate.js` if a new focused runtime acceptance test is added to the manifest.
- A new focused test file such as `scripts/test_runtime_turn_result_acceptance.js`.
- `src/turnLedgerPersistCore.ts` only if the implementation needs a richer, still-compatible compensation result. No change is required by this Gate.

### MUST NOT CHANGE for RUNTIME-002A implementation

- `docs/AI_REVIEW_BACKLOG.md`
- `docs/AI_FINDINGS_INBOX.md`
- `docs/ai-tasks/RUNTIME-002A.md` status fields
- PROMPT-001C immutable ACK token design
- State Orchestrator transaction architecture
- TEMP-001B/C multi-ledger atomicity design
- unrelated prompt budgeter / context-engine code

## 13. Future Test Matrix

| Test | Apply count | Accepted count | Handled count | Callback count | Dedupe state | Retryability |
|:--|--:|--:|--:|--:|:--|:--|
| 1. Parse failure | 0 | 0 | 0 | 0 | hash not committed | Same file retry allowed. |
| 2. TurnResult schema/shape failure | 0 | 0 | 0 | 0 | hash not committed | Same file retry allowed. |
| 3. Semantic validation failure | 0 canonical commits | 0 | 0 | 0 | hash not committed | Same file retry allowed. |
| 4. Canonical commit failure | 0 successful commits | 0 | 0 | 0 | hash not committed | Same file retry allowed after transient clears. |
| 5. Successful apply | 1 | 1 | 1 | 1 | hash committed | Whole-turn retry not allowed in same process. |
| 6. Duplicate successful result | 0 additional | 0 additional | 0 additional | 0 additional | hash already committed | Suppressed in same process. |
| 7. Failed same-hash retry | 1 only after later success | 1 only after later success | 1 only after later success | 1 only after later success | committed only after success | Same hash remains retryable until Accepted. |
| 8. Corrected new hash after failure | 1 for corrected file | 1 | 1 | 1 | corrected hash committed | Failed old hash not suppressing new hash. |
| 9. Extension restart with failed file present | 1 if later valid/apply succeeds | 1 if commit succeeds | 0 original pending; possible new none | 0 original callback | in-memory dedupe reset | Startup sweep retries file. |
| 10. `game_state` success + secondary ledger partial failure | 1 canonical commit | 1 | 1 | 1 | hash committed | No whole-turn retry; compensation logged. |
| 11. Journal failure after `game_state` success | 1 canonical commit | 1 | 1 | 1 | hash committed | No whole-turn retry; journal error logged. |
| 12. Accepted callback throws | 1 canonical commit | 1 | 1 | 1 attempted | hash committed | No whole-turn retry; exception logged. |
| 13. Callback fires exactly once on successful accepted turn | 1 | 1 | 1 | 1 | hash committed | Duplicate event does not refire. |

Suggested test seams:

- mock/stub `processTurnResult()` to return `false`, truthy, or throw before acceptance;
- mock/stub `commitGameState()` failure inside `processTurnResult()`;
- mock/stub `persistTurnLedgersAfterCommit()` partial failure;
- mock/stub journal append failure;
- inject accepted callback that increments count or throws;
- simulate repeated watcher/fallback calls with same hash.

## 14. Alternatives Rejected

### Design A — only move handled/dedupe after `processTurnResult() === true`

Rejected as insufficient by itself.

Moving the calls is necessary, but not sufficient, because current `processTurnResult()` can return `false` after successful `game_state` commit if post-commit journal append throws. The implementation must also ensure post-accept failures do not turn an accepted result into `false`.

### Design B — explicit result type from `processTurnResult()`

Rejected as not required for this task.

A richer result such as `accepted`, `rejected_retryable`, or `accepted_with_compensation` may be useful later, but RUNTIME-002A can be made truthful with the current `TurnResult | false` contract if and only if `false` is reserved for pre-Accepted failures and truthy means Accepted.

### Design C — in-flight reservation + committed dedupe

Rejected for current scope.

No real concurrent overlap requiring reservation was found in the current synchronous success path. Adding reservation state would enlarge scope and could suppress legitimate retry if not carefully released.

### Design D — split Accepted from Handled callback machinery

Rejected as a hard requirement, accepted as an optional cleanup.

The current `markTurnResultHandled()` name is semantically overloaded, but ordering plus callback exception isolation is enough for RUNTIME-002A. PROMPT-001C can consume the callback as a post-commit signal once this ordering is enforced.

## 15. Residual Risks

- `lastProcessedTurnHash` remains in-memory only. Durable accepted identity across restart is intentionally out of scope.
- Some `world_state` and scheduled commerce writes can occur before the `game_state` commit in the current `processTurnResult()` path. RUNTIME-002A does not redesign multi-ledger atomicity; TEMP-001B/C owns that architecture.
- The current code has no explicit TurnResult JSON schema validation before `JSON.parse(... ) as TurnResult`; validation is effectively performed through the application path and resulting `game_state` validation. A dedicated TurnResult validator is outside this Gate unless implementation tests need a narrow helper.
- Code-search index limitations prevented connector-backed exact-symbol search results. Direct source inspection covered known wiring and imports, but adversarial review should re-run local `grep`/`rg` if available.
- Durable exactly-once callback semantics across extension host restart remain PROMPT-001C / runtime identity scope.

## 16. New Finding Candidates

None.

Residual pre-commit `world_state` side effects are noted above as TEMP-001B/C scope rather than a new RUNTIME-002A finding.

## 17. Gate Verdict

`READY_FOR_ADVERSARIAL_REVIEW`

RUNTIME-002A is not ready for implementation until adversarial architecture review passes. This Gate only defines the truthful Accepted boundary and the minimum future implementation/test shape.
