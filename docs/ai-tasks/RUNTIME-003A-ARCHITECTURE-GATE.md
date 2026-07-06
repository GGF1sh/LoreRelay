# RUNTIME-003A Architecture Gate — Durable Accepted Turn Identity / Restart Replay Guard

| Field | Value |
|:---|:---|
| Task | `RUNTIME-003A` |
| Role | Architecture Gate |
| Author | ChatGPT / GPT-5.5 / High |
| Repository | `GGF1sh/LoreRelay` |
| As-of main | `8a428e9ec10c6b38c6c3d8e7eee2eabd199d549e` |
| Depends on | `RUNTIME-002A` |
| Related | `PROMPT-001C`, `RUNTIME-001B`, `CHATGPT-20260706-002` |
| Gate verdict | `RUNTIME003A_GATE_READY_FOR_ADVERSARIAL_REVIEW` |

## 0. Executive Decision

LoreRelay must stop an already-Accepted `TurnResult` **before `processTurnResult()` is entered**, even after extension-host or process restart.

A separate post-commit ledger alone is not sufficient. It leaves the exact crash window this task is meant to close:

```text
canonical game_state commit succeeds
→ process crashes
→ durable accepted ledger was not written
→ restart sees retained turn_result.json
→ no durable proof exists
→ duplicate mutation may run again
```

The approved Gate contract is therefore a deliberately boring two-layer design:

1. **Canonical acceptance witness** — a minimal host-owned accepted-turn identity written inside the same atomic `game_state.json` canonical commit that crosses the existing RUNTIME-002A Accepted boundary.
2. **Accepted-turn ledger** — a full, inspectable workspace-scoped history written immediately after Accepted with atomic replace + backup.

The witness closes the post-commit/pre-ledger crash window for the latest accepted turn. The ledger provides historical replay suppression, copied-file suppression, conflict detection, and debug visibility.

The existing Accepted boundary is **not moved or redefined**:

```text
validateGameState(commitState) passes
→ commitGameState(...).ok === true
→ Accepted
```

The only change is that the canonical commit payload contains a minimal host-owned witness for the TurnResult identity being accepted.

This Gate does **not** claim globally transactional exactly-once behavior across `game_state.json`, `world_state.json`, secondary ledgers, journal, ACK, or media. That would require a broader multi-file transaction architecture. RUNTIME-003A provides durable **Accepted TurnResult replay suppression**. The separate pre-commit / optimistic-reapply world-simulation issue remains `CHATGPT-20260706-002`.

---

# 1. CURRENT PATH AUDIT

## 1.1 Exact current observation and application path

All normal `turn_result.json` observations converge on the same file processor.

```text
Extension activation
└─ initTurnResultFallback(checkPendingTurnResultFile)
└─ initGameStateSync(...)

Open game panel
└─ startWatchingGameState()
   └─ startGameStateWatcher()
      ├─ create watcher for turn_result.json
      │  ├─ onDidCreate
      │  └─ onDidChange
      │      └─ 50 ms delay
      │         └─ processTurnResultFileAt(uri.fsPath)
      │
      └─ startup sweep
         └─ processTurnResultFileAt(<active workspace>/turn_result.json)

GM-run fallback path
└─ finishGmRun(..., success=true)
   └─ 250 ms delay
      └─ checkPendingTurnResultFile()
         └─ processTurnResultFileAt(<active workspace>/turn_result.json)
      └─ if not newly handled
         └─ optional synthesizeTurnResultIfNeeded(...)
            └─ atomic write of turn_result.json
               └─ watcher observation later
```

The startup sweep is currently triggered when `startGameStateWatcher()` starts, which is reached from opening the game panel. It is not a durable queue consumer running independently of the panel lifecycle.

## 1.2 Exact current `processTurnResultFileAt` ordering

Current ordering:

```text
1. fs.existsSync(turn_result path)
2. read raw UTF-8 content
3. reject empty content / retry read+parse failures
4. rawFileHash = SHA-256(exact file bytes)
5. compare rawFileHash with process-local lastProcessedTurnHash
   └─ equal → false / no-op
6. JSON.parse(content) as TurnResult
7. processTurnResult(turnResult)
8. if processTurnResult returns false
   └─ return false; raw hash remains retryable
9. processTurnResult returns truthy enriched TurnResult
   └─ canonical Accepted boundary was crossed
10. lastProcessedTurnHash = rawFileHash
11. markTurnResultHandled(enriched)
    ├─ pending GM lifecycle false
    ├─ accepted callback detached
    └─ callback invoked under exception isolation
       └─ PROMPT-001C ACK may run if immutable receipt correlation matches
12. success-only effects
    ├─ turn media
    ├─ webview update
    ├─ auto-location image queue
    └─ protagonist bootstrap scheduling
13. return true
```

No current success path deletes, renames, archives, or truncates `turn_result.json`. The accepted file may remain indefinitely.

## 1.3 Exact current canonical apply ordering

Current `processTurnResult()` path:

```text
1. resolve game_state.json path
2. flush scheduled commerce persistence
3. read game_state.json
4. capture baseRevision and beforeHash
5. apply TurnResult patch / fog logic
6. elapsedWorldTurns may persist world simulation steps
7. world-state drift / reputation / quest / visit work may occur
8. finalize game_state candidate
9. re-read fresh game_state.json
10. if fresh revision advanced
    └─ reapply TurnResult to fresh disk state
11. prepare auto-location-image request
12. validateGameState(commitState)
    └─ failure → false
13. afterHash = hashGameState(commitState)
14. commitGameState(commitState, turn profile)
    ├─ failure → false
    └─ ok === true → Accepted
15. isolated post-commit secondary ledger persistence
16. enrich TurnResult with beforeHash / afterHash / appliedAt
17. isolated state_journal.ndjson rotate/append
18. return enriched TurnResult truthy
```

The canonical write goes through `commitGameState()`, the single `game_state.json` write choke point, and ultimately uses atomic temp-file + rename behavior.

## 1.4 Current provider / receipt / ACK path

For receipt-aware provider paths such as Grok:

```text
buildProductionPromptAssembly
→ immutable PromptDeliveryReceipt captured
→ beginGmRun(accepted callback bound to that receipt)
→ provider runs and writes/causes turn_result.json
→ watcher or fallback observes file
→ processTurnResultFileAt
→ processTurnResult
→ canonical commit succeeds
→ Accepted
→ process-local raw hash commits
→ markTurnResultHandled(enriched)
→ accepted callback
→ acknowledgePromptReceiptAfterAccepted(receipt, enriched)
→ only exact trusted receipt correlation may ACK
→ Chronicle / WCS token attempts
```

PROMPT-001C explicitly does not provide durable receipt recovery across restart. Receipt objects, pending callbacks, and compensation maps are process-local.

## 1.5 Process-local vs durable state

| State / authority | Current scope | Survives process restart? | Current role |
|:---|:---|:---:|:---|
| `lastProcessedTurnHash` | module memory | No | same-process raw-byte duplicate suppression |
| turn-result watchers / timers | process | No | file observation |
| `pendingTurnResultFromGm` | module memory | No | current GM-run lifecycle |
| `pendingAcceptedTurnCallback` | module memory | No | post-Accepted callback / ACK signal |
| provider continuation/session flags | process | No | provider continuity |
| PROMPT receipt object | process | No | immutable delivery correlation |
| PROMPT ACK compensation map | process | No | same-process ACK failure truth |
| `turn_result.json` | workspace disk | Yes | observed TurnResult payload; currently retained |
| `game_state.json` | workspace disk | Yes | canonical game state |
| `stateRevision` | `game_state.json` | Yes | optimistic concurrency, not replay identity |
| `world_state.json` and secondary ledgers | workspace disk | Yes | world / subsystem state |
| `state_journal.ndjson` | workspace disk | Yes | best-effort post-Accepted journal, not acceptance authority |
| `game_history.json` | workspace disk | Yes | history/UI support, not accepted-turn replay authority |

## 1.6 What is currently trusted as identity

Current duplicate authority is only:

```text
SHA-256(exact turn_result.json file bytes)
==
process-local lastProcessedTurnHash
```

Other identifiers are not currently durable replay authority:

- `turnId` is used for GM entry identity/merge but is not a durable accepted-result record.
- `stateRevision` is concurrency state, not TurnResult identity.
- `promptReceipt.receiptId` is delivery/ACK correlation, not universal runtime identity.
- file path and mtime are not identity.
- `beforeHash` / `afterHash` / `appliedAt` are host-added after application and do not identify the original source payload.

## 1.7 Current-path verdict

**UNSAFE ACROSS PROCESS RESTART.**

The exact failure mode is real:

```text
Accepted turn_result.json remains on disk
→ extension host restarts
→ lastProcessedTurnHash resets to empty
→ startup sweep reads same file
→ processTurnResult() is entered again
→ canonical/world/subsystem mutation may run again
```

RUNTIME-002A fixed premature Handled/dedupe ordering inside one process. It intentionally did not create a durable accepted identity.

---

# 2. DURABLE IDENTITY OPTIONS

## 2.1 Candidate comparison

| Option | Collision resistance | Replay safety | Campaign isolation | Same bytes copied to new path | Edited old file | Migration | Debug explainability | PROMPT-001C dependency | Verdict |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| A. raw file content hash | Strong with SHA-256 | Exact-byte only | None by itself | Correctly matches | Whitespace/key-order edit becomes new identity | Low | Medium | None | Insufficient alone |
| B. normalized TurnResult payload hash | Strong with SHA-256 | Stable across formatting/key-order edits | None by itself | Correctly matches | Semantic payload edit becomes new hash | Medium | Good | None | Strong component |
| C. `receiptId` / receipt identity | Strong when present | Good for receipt-aware provider delivery | Not universal | Path-independent | Edited legacy/custom file may have no receipt | High | Good | High | Reject as primary |
| D. campaign-scoped accepted-turn ID (`scope + turnId`) | Strong structural identity | Good for simple duplicates | Good | Path-independent inside same scope | Same turnId edited payload collides semantically | Medium | Excellent | None | Insufficient alone |
| E. durable multi-field accepted record | Strong | Best | Best available | Path-independent | Detects same-turn payload conflict | Medium | Excellent | Optional metadata only | **Chosen** |

## 2.2 Why raw file hash is not enough

Raw SHA-256 remains useful for diagnostics and same-process optimization, but it is not the durable contract because these two files parse to the same TurnResult while producing different raw hashes:

```json
{"turnId":"turn-7","narration":"x"}
```

```json
{
  "narration": "x",
  "turnId": "turn-7"
}
```

A replay guard should not become bypassable by JSON whitespace or key ordering.

## 2.3 Why `receiptId` is not the runtime identity

`receiptId` is not universal:

- legacy TurnResults may not contain it;
- custom/direct-write fallback synthesis may not contain it;
- receipt correlation represents prompt delivery, not canonical mutation identity;
- RUNTIME-003A must still work when PROMPT-001C correlation is unavailable.

Receipt metadata is retained only as optional trace information.

## 2.4 Chosen exact identity contract

### 2.4.1 Normalized source payload

Parse the JSON first. Build the replay-identity payload from the parsed `TurnResult` by excluding only host-added post-application fields:

```text
beforeHash
afterHash
appliedAt
```

All other fields, including optional `promptReceipt`, remain part of the normalized source payload.

Canonical serialization algorithm, version 1:

1. recursively sort object keys lexicographically;
2. preserve array order exactly;
3. preserve parsed string values exactly; do not Unicode-normalize;
4. serialize with deterministic `JSON.stringify` semantics;
5. encode UTF-8.

```text
payloadHash = SHA-256(canonicalSerializedSourceTurnResult)
```

The normalizer is versioned. Identity version changes require explicit migration; silent algorithm changes are forbidden.

### 2.4.2 Interim runtime/campaign scope

RUNTIME-001B `RuntimeContextKey` is not yet implemented. RUNTIME-003A must not invent that larger architecture.

Version 1 uses the current operational runtime boundary: the active LoreRelay workspace root.

```text
normalizedWorkspaceRoot =
    absolute active workspace path
    → realpath when available
    → normalized separators
    → trailing separator removed
    → Windows case normalization

scopeKey = SHA-256(
    "LoreRelayRuntimeScope/v1\0" + normalizedWorkspaceRoot
)
```

This is explicitly an interim scope, not the final universal campaign identity.

### 2.4.3 Primary accepted identity

```text
identityHash = SHA-256(
    "LoreRelayAcceptedTurn/v1\0"
    + scopeKey + "\0"
    + turnId + "\0"
    + payloadHash
)
```

The authoritative identity tuple is:

```text
(scopeKey, turnId, payloadHash)
```

`identityHash` is its compact lookup representation.

### 2.4.4 Supplemental trace fields

A full accepted record also stores, when available:

- raw file SHA-256 — trace only;
- `receiptId` — trace/correlation only;
- receipt provider — trace only;
- receipt `assemblyDigest` — trace only;
- existing `beforeHash` / `afterHash` — trace only;
- accepted timestamp;
- observation source such as `watcher`, `startup-sweep`, or `fallback`.

None of these supplemental fields may override the primary identity tuple.

## 2.5 Collision policy

SHA-256 cryptographic collision is outside the practical threat model for this task.

A same-scope same-`turnId` different-`payloadHash` event is **not** treated as a hash collision. It is an explicit accepted-turn conflict and must be quarantined/rejected from automatic mutation.

---

# 3. TRUTHFUL WRITE BOUNDARY

## 3.1 The required two-layer persistence contract

### Layer 1 — canonical acceptance witness

Add one host-owned field to the canonical game state:

```json
{
  "runtimeAcceptedTurn": {
    "version": 1,
    "scopeKey": "...",
    "identityHash": "...",
    "turnId": "...",
    "payloadHash": "...",
    "acceptedAt": "..."
  }
}
```

Properties:

- minimal;
- host-owned;
- not GM-patchable;
- not sent to the Webview;
- included in the same canonical `game_state.json` write as the accepted mutation;
- only the latest accepted witness is required in canonical state.

The field must be preserved by turn-conflict merge logic. It must be added to the turn-authoritative host root set so a fresh-revision merge cannot drop the witness being accepted.

### Layer 2 — full accepted-turn ledger

Immediately after Accepted, persist the full historical record to:

```text
<active workspace>/accepted_turn_ledger.json
```

This file is the normal durable replay history. The canonical witness is the crash-window bridge, not a replacement for the ledger.

## 3.2 Exact approved ordering

```text
OBSERVE
1. read turn_result.json
2. raw file SHA-256
3. parse TurnResult
4. normalize source payload
5. compute payloadHash
6. resolve scopeKey
7. compute identityHash

DURABLE PREFLIGHT
8. load and validate accepted_turn_ledger.json
9. load canonical runtimeAcceptedTurn witness
10. reconcile witness into ledger if needed
11. decide:
    - exact accepted identity → alreadyAccepted no-op
    - same turnId / different payload → conflict quarantine
    - corrupt authority → repairRequired
    - unseen identity → proceed

CANONICAL APPLY
12. processTurnResult preparation
13. build commitState
14. attach runtimeAcceptedTurn witness to commitState
15. validate commitState
16. commitGameState(commitState, turn profile)
17. commit.ok !== true → Not Accepted; retryable; no accepted ledger record
18. commit.ok === true → Accepted (existing RUNTIME-002A boundary)

FIRST POST-ACCEPTED DURABILITY ACTION
19. atomic replace accepted_turn_ledger.json with full accepted record
20. if write fails:
    - Accepted remains true
    - canonical witness remains durable
    - replay guard enters unreconciled/degraded state
    - no later unseen turn may overwrite the witness before reconciliation succeeds

EXISTING POST-ACCEPTED WORK
21. secondary ledger compensation path
22. journal append
23. truthy Accepted TurnResult returns
24. process-local raw hash commits
25. Handled
26. accepted callback / PROMPT-001C correlation and ACK
27. success-only media / UI / bootstrap
```

## 3.3 Canonical commit succeeds — what exact write happens next?

Answer:

```text
Canonical commit succeeds
↓
Accepted is true, and matching runtimeAcceptedTurn witness is already durable
inside that same canonical game_state.json commit
↓
next exact write:
atomic replacement of accepted_turn_ledger.json with the new full record
```

## 3.4 What if the process crashes between canonical commit and ledger write?

The retained `game_state.json` already contains the exact accepted witness.

On restart:

```text
startup replay-guard bootstrap
→ load canonical witness
→ ledger does not contain witness identity
→ add/recover the full ledger record from witness metadata
→ classify retained matching TurnResult as alreadyAccepted
→ do not call processTurnResult
```

Therefore the canonical mutation does not replay.

A **ledger-only** architecture cannot solve this window. If the accepted identity is written only after `commitGameState()` returns, a crash can always occur between the two independent writes. The canonical witness is required.

## 3.5 Accepted boundary relationship

The witness does not create a new Accepted event.

Forbidden interpretations:

```text
witness prepared → Accepted
witness object exists in memory → Accepted
ledger write succeeds → Accepted
Handled → Accepted
ACK succeeds → Accepted
```

The only Accepted truth remains:

```text
commitGameState(...).ok === true
```

Because the witness is part of the same canonical commit payload, it becomes durable exactly when that canonical write truthfully succeeds.

## 3.6 Ledger-write failure after Accepted

Ledger failure must not return `false` or revoke Accepted.

However, continuing to accept newer turns while the latest witness is not in the ledger would be unsafe: a newer canonical commit could overwrite the only crash-window witness.

Required fail-safe rule:

```text
unreconciled canonical witness
→ reconcile into accepted_turn_ledger.json before any unseen TurnResult may process
→ if reconciliation cannot succeed
   → repairRequired / fail closed
   → do not accept a newer turn
```

This is intentionally conservative.

---

# 4. CRASH WINDOW TABLE

True global exactly-once mutation across every LoreRelay file is not achieved by this Gate. The table describes Accepted TurnResult replay safety for the chosen canonical witness + ledger contract.

| Crash point | Disk state | Canonical state | Replay ledger | Next startup | Retry? | Duplicate canonical mutation? |
|:---|:---|:---|:---|:---|:---:|:---:|
| A. before canonical commit | old `game_state`; no new witness | Not Accepted | no record | identity unseen → process again | Yes | No Accepted duplicate; separate pre-commit side effects remain possible |
| B. during canonical commit | atomic write resolves to old or new canonical file | old = Not Accepted; new = Accepted + witness | usually no new record | old state → retry; new witness → reconcile + no-op | Conditional | No canonical duplicate under normal atomic-replace process-crash model |
| C. immediately after canonical commit, before ledger | new canonical file + witness | Accepted | missing new record | witness → repair ledger → alreadyAccepted | No | No |
| D. during durable ledger write | canonical witness present | Accepted | old primary, new primary, temp, or recoverable backup | validate primary/backup; reconcile witness | No | No |
| E. after durable record, before handled-file cleanup | canonical witness present; `turn_result.json` may remain | Accepted | exact record present | exact identity → alreadyAccepted | No | No |
| F. after cleanup | accepted state persists | Accepted | exact record present | no file = nothing; restored file = alreadyAccepted | No | No |

## 4.1 Crash A caveat

Current `processTurnResult()` may persist world simulation and some world/subsystem changes before the canonical commit. RUNTIME-003A does not make those pre-commit effects transactional.

Therefore:

- canonical Accepted mutation remains retryable before commit;
- a separate duplicate world-simulation risk may still exist;
- that is `CHATGPT-20260706-002`, not a reason to weaken this replay guard.

## 4.2 Crash B atomicity assumption

The contract inherits LoreRelay's current `writeJsonAtomic` process-crash model: write temp file, then rename to canonical path.

RUNTIME-003A does not add fsync/directory-fsync durability for sudden power loss or exotic filesystems. That is an explicit limitation.

## 4.3 Crash C is the decisive Gate requirement

Without the canonical witness:

```text
UNSAFE
commit success → crash → no ledger → restart replay
```

With the witness:

```text
SAFE FOR CANONICAL REPLAY
commit success + witness in same file → crash → startup witness repair → no apply
```

---

# 5. STARTUP SWEEP DECISION TABLE

Every watcher, startup sweep, and fallback observation must use the same durable preflight decision function before `processTurnResult()`.

| Observation | Decision | Required behavior |
|:---|:---|:---|
| unseen valid TurnResult | `process` | enter canonical apply path |
| exact identity already in ledger | `alreadyAccepted` | traceable no-op; never call `processTurnResult` |
| exact identity equals canonical witness but ledger record is missing | `repairThenAlreadyAccepted` | atomically reconcile ledger, then no-op |
| malformed / unreadable TurnResult after existing retry policy | `quarantine` / `reject` | no mutation; preserve evidence |
| same scope + accepted `turnId` + different payloadHash | `conflictQuarantine` | no mutation; explicit edited/stale conflict |
| manually edited old file with same turnId | `conflictQuarantine` | no mutation |
| same bytes copied to new path | `alreadyAccepted` | path-independent identity no-op |
| duplicate watcher event in same process | `alreadyAccepted` or process-local fast no-op | no second apply/Handled/callback |
| accepted identity from campaign A while campaign B is active | compute B scope; A record is not authority | never suppress B because of A identity |
| foreign-scope ledger copied into active workspace | `repairRequired` | do not import foreign suppression authority automatically |
| primary ledger corrupt, valid `.bak` exists | `recoverBackup` | atomically restore valid backup, reconcile witness, continue |
| primary and backup both corrupt | `repairRequired` | fail closed; do not process TurnResult automatically |
| current canonical witness is newer than ledger | `repairWitness` | write missing record before processing any unseen turn |
| accepted old file restored from backup | `alreadyAccepted` | ledger history suppresses replay |
| legacy workspace: no ledger/witness and no retained TurnResult | `initialize` | create empty v1 ledger, continue |
| legacy workspace: no ledger/witness but retained TurnResult exists | `legacyAmbiguous` | do not auto-apply; repair/operator decision required |

## 5.1 Why a legacy retained file is ambiguous

At first migration to RUNTIME-003A, an existing `turn_result.json` might be:

- genuinely unprocessed; or
- already Accepted before durable replay records existed.

Current durable files do not provide universal proof. `state_journal.ndjson` is post-commit best-effort and must not be silently promoted into acceptance authority.

Therefore automatic processing would risk exactly the replay this task is meant to prevent.

Migration rule:

```text
no ledger
+ no canonical witness
+ retained turn_result.json
→ legacyAmbiguous
→ fail closed / explicit repair decision
```

This favors a recoverable blocked turn over silent duplicate mutation.

## 5.2 No implicit latest-report or latest-file authority

Forbidden startup heuristics:

- latest mtime;
- newest path;
- current file path alone;
- `turnId` alone;
- current provider session;
- last journal line;
- process-local memory after restart.

---

# 6. CAMPAIGN / RUNTIME SCOPE

## 6.1 Version 1 scope

RUNTIME-003A does not wait for unresolved RUNTIME-001B.

Version 1 uses:

```text
active workspace root → normalized path → scopeKey
```

The accepted ledger is also physically located inside that active workspace.

This prevents the normal case:

```text
Campaign A workspace ledger
→ Campaign B workspace
→ suppress valid B turn
```

because B computes a different scope key and reads a different workspace ledger.

## 6.2 Campaign A identity observed in campaign B

For a standalone TurnResult copied from A to B:

```text
payload may be identical
turnId may be identical
scopeKey is B
identityHash is therefore B-specific
```

A's accepted identity does not suppress B.

If A's entire `accepted_turn_ledger.json` is copied into B, its header `scopeKey` mismatches the active B scope. It is foreign authority and must not be silently trusted or merged. Outcome: `repairRequired` / explicit rebind.

## 6.3 Relationship to RUNTIME-001B

RUNTIME-001B remains the future owner of a stronger `RuntimeContextKey` / campaign identity.

RUNTIME-003A v1 defines an explicit migration seam:

```text
identity version 1: workspace-path scopeKey
future identity version: RuntimeContextKey-backed scope
```

No silent cross-version equality is allowed.

## 6.4 Same-folder campaign replacement limitation

If a user replaces one campaign with another inside the exact same workspace path, workspace-path scope alone cannot distinguish them.

Until RUNTIME-001B exists, the safe contract is:

- campaign/reset workflows must explicitly archive/reset the replay scope; or
- inconsistent old ledger/witness state must produce `repairRequired`;
- old same-folder replay records must never silently suppress a new campaign.

RUNTIME-003A must not invent provider/session identity to solve this.

## 6.5 Provider/session identity

Provider and session identity are deliberately excluded from primary replay identity.

Reasons:

- the same accepted mutation must remain duplicate even if provider session restarts;
- custom/legacy paths may not have provider-run identity;
- RUNTIME-001C owns provider-specific session identity.

Provider is trace metadata only.

---

# 7. PROMPT / ACK / CONSUMPTION INTERACTION

## 7.1 Duplicate suppression point

An accepted duplicate must be stopped here:

```text
file observation
→ durable identity preflight
→ alreadyAccepted
→ STOP
```

It must not reach:

```text
processTurnResult
canonical mutation
world simulation
Handled
accepted callback
PROMPT ACK
Chronicle/WCS consumption
media/UI/bootstrap success effects
```

## 7.2 Required duplicate outcome

A duplicate observation is not fake success and not a new Accepted turn.

Define an internal structured outcome, for example:

```text
newlyAccepted
alreadyAccepted
retryableFailure
rejected
quarantined
repairRequired
```

Exact implementation names may differ, but the semantic distinction is mandatory.

Current boolean compatibility should remain:

```text
checkPendingTurnResultFile() == true
    only for newlyAccepted

alreadyAccepted == false for current pending-run lifecycle
```

An old retained file must never satisfy or detach a new GM run's pending accepted callback.

## 7.3 PROMPT-001C receipt identity

The full ledger may store:

- `receiptId`;
- provider;
- `assemblyDigest`.

These are trace/correlation fields, not replay authority.

The durable replay guard must work for TurnResults with no receipt.

## 7.4 Restart duplicate behavior

For an already-Accepted duplicate observed after restart:

- no canonical apply;
- no world simulation;
- no `markTurnResultHandled`;
- no callback recreation;
- no ACK replay;
- no Chronicle/WCS token attempt;
- no provider dispatch;
- no success-only media/UI/bootstrap effects;
- emit a traceable replay-suppression event.

## 7.5 Crash after Accepted but before ACK

PROMPT-001C intentionally has no durable receipt/callback recovery.

Therefore a process crash can occur after canonical Accepted but before ACK. On restart, RUNTIME-003A suppresses the duplicate TurnResult and **does not replay ACK**.

Consequence:

- double consumption is prevented;
- delivered prompt context may remain unconsumed and may repeat later;
- RUNTIME-003A does not reconstruct a lost receipt callback.

This is an explicit limitation and is safer than guessing authority after restart.

---

# 8. ATTACK MATRIX

| Attack | Safe? | Expected behavior | Remaining limitation |
|:---|:---:|:---|:---|
| A. accepted file remains → restart → startup sweep | Yes | ledger exact or witness repair → `alreadyAccepted`; no apply | requires valid durable authority or repair |
| B. crash immediately before canonical commit | Canonical replay safe | no accepted witness/record → retry | pre-commit world/subsystem side effects are separate issue |
| C. crash immediately after canonical commit | Yes | canonical witness repairs ledger; no apply | relies on current atomic canonical write model |
| D. crash after durable identity record before cleanup | Yes | ledger exact → no-op | cleanup not authority |
| E. same bytes copied to new path | Yes | normalized identity is path-independent within scope → no-op | cross-scope copy is a new scoped identity |
| F. manually edited old TurnResult | Yes when turnId preserved | same accepted turnId + new payloadHash → conflict quarantine | changing both turnId and payload can impersonate a new result |
| G. campaign A identity observed in campaign B | Yes | different scopeKey; A cannot suppress B | same-folder campaign replacement needs explicit scope reset |
| H. duplicate filesystem events in one process | Yes | same durable identity / fast raw hash → one new accept max | synchronous processing assumptions remain current |
| I. partial durable-record write | Yes | atomic replace + backup; canonical witness reconciles latest | primary+backup corruption fails closed |
| J. old accepted file restored from backup | Yes | historical ledger record → alreadyAccepted | independent rollback of the ledger itself is a broader restore problem |

## 8.1 Additional adversarial cases

### Raw hash changes but payload identity does not

```text
whitespace / key-order edit
→ rawFileHash changes
→ normalized payloadHash unchanged
→ alreadyAccepted
```

### Same accepted turnId, semantically edited payload

```text
payloadHash changes
→ accepted turnId conflict
→ quarantine
```

### Ledger write fails, then a new turn arrives

```text
latest canonical witness not in ledger
→ reconcile first
→ reconciliation fails
→ repairRequired
→ do not accept new turn
```

This prevents overwriting the only crash-window witness.

### SHA-256 collision assumption

Cryptographic SHA-256 collision attacks are outside the task threat model. No fallback to path or mtime is permitted.

---

# 9. PERSISTENCE DESIGN

## 9.1 Canonical witness location

```text
game_state.json
└─ runtimeAcceptedTurn
```

Reason:

- only the canonical commit can close the post-commit/pre-ledger window without a broader transaction manager;
- a second standalone witness file would recreate the same two-write crash gap.

The witness is host-owned runtime metadata. It must not be exposed to the Webview or accepted from GM `statePatch` authority.

## 9.2 Full ledger location

```text
<active workspace>/accepted_turn_ledger.json
```

The name is intentionally explicit and inspectable.

## 9.3 Format

Version 1:

```json
{
  "version": 1,
  "scopeKey": "sha256...",
  "records": [
    {
      "version": 1,
      "identityHash": "sha256...",
      "scopeKey": "sha256...",
      "turnId": "turn-42",
      "payloadHash": "sha256...",
      "rawFileHash": "sha256...",
      "acceptedAt": "2026-07-06T00:00:00.000Z",
      "observationSource": "watcher",
      "receipt": {
        "receiptId": "optional",
        "provider": "optional",
        "assemblyDigest": "optional"
      },
      "beforeHash": "optional",
      "afterHash": "optional"
    }
  ]
}
```

The primary authority remains `(scopeKey, turnId, payloadHash)` / `identityHash`. Optional fields are diagnostic.

## 9.4 Append vs replace

Choose **replace**, not append.

```text
load validated ledger
→ add one immutable record in memory
→ writeJsonAtomic(target, nextLedger, createBackup=true)
```

Reasons:

- append-only NDJSON can expose partial trailing writes;
- whole-file validation is simple;
- 100-turn reliability target is tiny for JSON replacement;
- current repository already has an atomic JSON write helper.

## 9.5 Atomic-write strategy

Use the existing temp-file + rename helper with backup:

```text
accepted_turn_ledger.json.<pid>.<time>.tmp
→ rename to accepted_turn_ledger.json
→ previous primary retained as accepted_turn_ledger.json.bak
```

Do not hand-roll an independent write protocol unless adversarial review finds the existing helper insufficient.

## 9.6 Corruption handling

On load:

1. parse and structurally validate primary;
2. verify version and exact active `scopeKey`;
3. reject duplicate `identityHash` records;
4. reject same-scope same-`turnId` records with different payload hashes;
5. if primary invalid, validate `.bak`;
6. if backup valid, atomically restore it;
7. reconcile canonical witness into restored ledger;
8. if both invalid, return `repairRequired` and fail closed.

Do not silently rebuild full acceptance history from `state_journal.ndjson`. The journal is best-effort post-commit data, not canonical acceptance authority.

## 9.7 Retention policy

Version 1 history is **logically unbounded**.

Do not evict old accepted identities merely to keep the file small. Eviction would make old backup/restored TurnResults replayable.

At the target scale of hundreds or low thousands of turns, the file remains small and understandable.

Implementation may enforce an absurd-size safety limit as corruption/repair-required handling, but it must not silently discard old records.

## 9.8 Compaction

No compaction in RUNTIME-003A v1.

Future compaction requires an independently reviewed archive/checkpoint contract that preserves replay-proof history. It must not be smuggled into this implementation.

## 9.9 Trace/debug visibility

Emit explicit structured log lines for at least:

```text
[RUNTIME-003A] newlyAccepted identity=... turnId=...
[RUNTIME-003A] alreadyAccepted source=ledger identity=...
[RUNTIME-003A] repairedFromCanonicalWitness identity=...
[RUNTIME-003A] conflict sameTurnIdDifferentPayload turnId=...
[RUNTIME-003A] ledgerRecoveredFromBackup
[RUNTIME-003A] repairRequired reason=...
```

Do not log full narrative or sensitive payload content.

---

# 10. IMPLEMENTATION TOUCH SET

## 10.1 MUST CHANGE

### New pure core

`src/acceptedTurnReplayGuardCore.ts`

Responsibilities:

- strip host-added post-application fields;
- deterministic payload canonicalization;
- SHA-256 identity input construction or pure hash-input preparation;
- record/witness validation;
- ledger validation;
- startup/preflight decision table;
- same-turn payload conflict detection.

### New workspace persistence adapter

`src/acceptedTurnReplayGuard.ts`

Responsibilities:

- resolve v1 workspace `scopeKey`;
- ledger path;
- primary/backup load and validation;
- atomic replace;
- canonical witness reconciliation;
- trace events;
- degraded/unreconciled-witness guard.

### `src/gameStateSync.ts`

Narrow changes:

- compute raw hash + parsed normalized identity;
- run durable preflight before `processTurnResult()`;
- return/handle explicit `alreadyAccepted`, conflict, quarantine, and repair-required outcomes;
- ensure startup sweep, watcher, and fallback all share one decision path;
- preserve process-local raw hash only as a fast path, never durable authority;
- never call Handled/callback/success effects for `alreadyAccepted`.

### `src/statePatch.ts`

Narrow changes:

- accept prepared accepted-turn identity context from file processor;
- attach `runtimeAcceptedTurn` witness to `commitState` before canonical validation/commit;
- keep `commitGameState(...).ok === true` as Accepted;
- make full accepted-ledger write the first post-Accepted durability action;
- ledger failure remains Accepted but activates unreconciled-witness blocking.

### `src/workspaceStateQueueCore.ts`

Narrow change:

- preserve `runtimeAcceptedTurn` as a host-owned turn-authoritative root during revision-conflict merge.

### New focused test

`scripts/test_runtime_accepted_replay_guard.js`

### Test manifest

`scripts/run_all_tests.js`

Only register the focused test.

## 10.2 MAY CHANGE

### `src/types/GameState.ts`

Only if an explicit `RuntimeAcceptedTurnWitness` type is preferable to housing the type in the replay-guard core.

### `src/workspacePaths.ts`

Only if a central ledger-path or normalized-workspace-root helper is required. Do not change workspace selection semantics.

### Existing runtime acceptance test

`scripts/test_runtime_turn_result_acceptance.js`

Only for narrow regression assertions where reuse is clearly better than the new dedicated test.

## 10.3 MUST NOT CHANGE

- `src/gmPromptBuilder.ts`
- `src/promptReceiptCore.ts`
- PROMPT-001C receipt/token/ACK semantics
- provider dispatch architecture in `src/gmBridgeRunner.ts`
- agentic provider architecture
- provider session identity / `RUNTIME-001C`
- broad RuntimeContextKey architecture / `RUNTIME-001B`
- world simulation implementation
- `worldSimPersist.ts`
- optimistic reapply algorithm beyond replay-guard handoff
- checkpoint / rewind / TEMP-001B/C transaction architecture
- secondary domain/resource/settlement/vehicle ledger business logic
- Webview / UI
- remote-play authority

Implementation must remain a replay guard, not a runtime redesign.

---

# 11. REQUIRED TESTS

Tests must be behavior-based, executable, and load-bearing.

## 11.1 Same-process duplicate

```text
same valid file observed twice
→ canonical apply count = 1
→ Accepted count = 1
→ Handled count = 1
→ callback count = 1
```

## 11.2 Restart duplicate

```text
accept file
→ retain turn_result.json
→ purge/reload modules to lose process memory
→ startup observation
→ alreadyAccepted
→ processTurnResult count remains 1
```

## 11.3 Accepted file retained across actual startup-sweep path

Exercise `startGameStateWatcher()` startup sweep, not only the direct test hook.

Expected:

- no reapply;
- no Handled;
- no callback;
- explicit suppression trace.

## 11.4 Pre-commit failure retry

```text
canonical commit returns false
→ no canonical witness
→ no accepted ledger record
→ restart
→ same bytes remain retryable
→ later successful commit may accept
```

## 11.5 Post-commit / pre-ledger crash injection

Inject failure immediately after canonical commit succeeds and before full ledger write completes.

Expected after module restart:

```text
canonical witness exists
→ startup repairs ledger
→ retained file alreadyAccepted
→ canonical apply count remains 1
```

This test is mandatory and is the core proof of the architecture.

## 11.6 Crash during ledger write

Cover:

- stale temp file;
- old primary + valid backup;
- valid new primary;
- canonical witness newer than restored ledger.

Expected: recover/reconcile, then duplicate no-op.

## 11.7 Unreconciled witness blocks a newer turn

```text
turn A canonical commit succeeds
→ A ledger write fails
→ turn B arrives
→ A reconciliation attempted first
→ if reconciliation still fails, B is not processed
```

This prevents the latest witness from being overwritten before durable history catches up.

## 11.8 Campaign isolation

Two distinct workspace roots, identical TurnResult bytes:

```text
A accepts
B processes independently
A's identity cannot suppress B
```

Also test copied foreign ledger header mismatch → repair-required, not silent suppression.

## 11.9 Same bytes copied to a new file path

Within one scope, observe the same payload through two paths/test inputs.

Expected: one accept, then path-independent alreadyAccepted.

## 11.10 Edited old file

```text
accept turnId=turn-7 payload=A
→ edit retained file to turnId=turn-7 payload=B
→ conflict quarantine
→ no apply
```

## 11.11 Corrupt replay ledger

Cases:

- corrupt primary + valid backup → recover;
- corrupt primary + corrupt backup → repairRequired;
- duplicate identities in ledger → repairRequired;
- same turnId with conflicting accepted payload hashes → repairRequired.

## 11.12 No double world simulation on accepted restart duplicate

Instrument world-simulation call count.

```text
accepted turn contains elapsedWorldTurns
→ restart duplicate observation
→ replay preflight suppresses before processTurnResult
→ no additional world simulation call
```

This test proves RUNTIME-003A's reduction of cross-restart risk without claiming to solve `CHATGPT-20260706-002`.

## 11.13 No double ACK / consumption

Receipt-aware accepted turn:

```text
first lifetime Accepted callback ACKs once
→ restart duplicate
→ no Handled callback
→ no ACK
→ Chronicle/WCS marker call counts unchanged
```

Also test crash-before-ACK behavior: restart suppression does not guess/reconstruct ACK.

## 11.14 Duplicate does not satisfy a new pending GM lifecycle

```text
old accepted file remains
→ begin a new GM run with pending callback
→ old duplicate observed
→ outcome alreadyAccepted
→ pending callback not fired
→ old file not treated as newly handled
```

## 11.15 Provider dispatch remains untouched

File replay suppression must not call provider invocation code.

Instrument provider dispatch count around duplicate observation; expected zero.

## 11.16 Migration ambiguity

```text
no ledger + no witness + no retained TurnResult
→ initialize empty ledger
```

and:

```text
no ledger + no witness + retained TurnResult
→ legacyAmbiguous / repairRequired
→ no automatic mutation
```

## 11.17 Watcher + fallback race

One new valid file observed by watcher and fallback:

```text
newlyAccepted count = 1
canonical apply count = 1
Handled count = 1
callback count = 1
second observation = alreadyAccepted/no-op
```

## 11.18 Mandatory mutation sanity

The focused suite must prove load-bearing authority by temporarily mutating and restoring at least these behaviors:

1. bypass durable preflight before `processTurnResult` → restart duplicate test must fail;
2. remove canonical witness from the accepted commit → post-commit/pre-ledger crash test must fail;
3. treat `alreadyAccepted` as Handled → new-pending-lifecycle test must fail;
4. remove scope from identity → campaign-isolation test must fail.

A test that still passes after these mutations is not sufficient gate evidence.

---

# 12. RELATION TO `CHATGPT-20260706-002`

Candidate:

```text
optimistic reapply may double-run world simulation
```

## 12.1 Does RUNTIME-003A reduce that risk?

**Yes, for cross-restart replay of an already-Accepted TurnResult.**

Because the durable preflight stops an accepted duplicate before `processTurnResult()`, that duplicate cannot re-enter `persistWorldSimulationSteps()` after restart.

## 12.2 Does the separate issue remain?

**Yes.**

Current `processTurnResult()` can run world simulation before canonical Accepted, and the fresh-revision reapply path can also re-enter simulation logic inside one processing attempt.

RUNTIME-003A does not change that ordering or make world simulation transactional.

`CHATGPT-20260706-002` therefore remains a separate runtime/temporal issue.

## 12.3 Do touch sets overlap?

**Yes.**

Likely overlap:

- `src/statePatch.ts`
- runtime acceptance/replay test harnesses

Per the repository's same-touch-set rule, RUNTIME-003A implementation and any future `CHATGPT-20260706-002` implementation should not proceed concurrently.

---

# 13. UNRESOLVED LIMITATIONS / ADVERSARIAL REVIEW TARGETS

The following are explicit limitations, not hidden assumptions:

1. **No global multi-file exactly-once transaction.** Canonical replay suppression does not atomically commit world state, all secondary ledgers, ACK, journal, and media.
2. **Pre-commit world simulation remains separate.** `CHATGPT-20260706-002` is not solved.
3. **Crash after Accepted before ACK is not replayed.** Prompt context may repeat later, but duplicate consumption is not guessed.
4. **Same-folder campaign replacement is ambiguous until RUNTIME-001B.** Explicit replay-scope reset/rebind or repair is required.
5. **A manually altered file that changes both `turnId` and payload can impersonate a new TurnResult.** Stronger provider/run provenance belongs elsewhere.
6. **Primary + backup replay-ledger corruption fails closed.** No automatic journal-based reconstruction.
7. **Workspace move/copy changes v1 scope.** A copied foreign ledger requires explicit rebind/repair rather than silent trust.
8. **Independent rollback of replay ledger and canonical state is a broader restore/checkpoint problem.** Restoring only old TurnResult files is safe; rolling back authority files separately may require repair.
9. **No ledger compaction in v1.** History grows monotonically.
10. **Current atomic-write helper is not a power-loss fsync protocol.** The design targets extension-host/process crash and restart under the repository's existing atomic-replace model.
11. **SHA-256 collision is outside the threat model.**

Adversarial review should focus especially on:

- whether the canonical witness can be dropped by any current merge/sanitize path;
- whether an unreconciled witness can ever be overwritten by a later turn;
- whether `alreadyAccepted` can accidentally satisfy the current pending GM lifecycle;
- migration behavior with a retained pre-RUNTIME-003A file;
- same-folder campaign reset semantics;
- primary/backup corruption and scope mismatch handling.

---

# 14. FINAL GATE CONTRACT

The implementation is authorized only if it preserves all of these invariants:

1. No already-Accepted TurnResult reaches `processTurnResult()` after restart.
2. Identity is `(scopeKey, turnId, normalized payloadHash)`, not path/mtime/process memory.
3. The latest accepted identity witness is committed atomically with canonical `game_state.json` mutation.
4. Accepted remains exactly `commitGameState(...).ok === true`.
5. The full accepted history is persisted immediately after Accepted with atomic replace + backup.
6. A missing ledger record after commit is repaired from canonical witness before any replay or newer accept.
7. An unreconciled witness blocks newer unseen turns rather than being overwritten.
8. Exact duplicate observation is explicit `alreadyAccepted`, not a new success.
9. AlreadyAccepted duplicates run no canonical mutation, world simulation, Handled, callback, ACK, consumption, provider dispatch, or success-only effects.
10. Same accepted turnId with a changed payload is a conflict, not a retry.
11. Campaign A authority never suppresses campaign B under the v1 workspace scope.
12. Corrupt acceptance authority fails closed.
13. Existing PROMPT-001C receipt/ACK architecture is not redesigned.
14. Existing world-simulation/reapply architecture is not redesigned.

## Final Verdict

`RUNTIME003A_GATE_READY_FOR_ADVERSARIAL_REVIEW`
