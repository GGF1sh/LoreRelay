# RUNTIME-003A Independent Reverify Result

| Field | Value |
|:---|:---|
| Task | `RUNTIME-003A — Durable Accepted Turn Identity / Restart Replay Guard` |
| Role | Independent Runtime / Crash-Safety Re-Verifier |
| AI | ChatGPT / GPT-5.5 / Very High |
| Repository | `GGF1sh/LoreRelay` |
| Current main at reverify | `c12d089718b208bb52ab7d445f6ab8ed045ca2e8` |
| Original implementation | `e25b7d1307efd126419d6e69754667e10db5c9d5` |
| Original verification FAIL | `97a30f12d78752e2da0870be4528d7f81252a763` |
| Repair source commit | `1c988abb3e6228608dcc86ced1502b93a886aa9b` |
| Repair report commit | `8cff5ff493b3ad54bc23ffc54e005e94c25b208d` |
| Reviewed branch | `task/RUNTIME-003A-durable-replay-guard` |
| Final verdict | `RUNTIME003A_REVERIFY_FAIL` |

## 0. Scope and execution status

This reverify reopened only the five previous blockers `R3A-V1` through `R3A-V5`, plus the requested narrow regression spot-check.

The repair source is exactly one source commit after the original verification result. The repair report is document-only.

No source was modified. No merge was performed.

Independent execution remained unavailable in the verifier environment:

```text
git ls-remote https://github.com/GGF1sh/LoreRelay.git HEAD
→ Could not resolve host: github.com
```

No local LoreRelay checkout was present and no GitHub Actions workflow run existed for the repair source commit. Execution unavailability is not itself a failure. The final FAIL is based on static source-level contract violations.

---

# 1. R3A-V1 — WITNESS OWNERSHIP / FAIL-CLOSED DIVERGENCE

## Verdict: FAIL

## Closed parts

### Ordinary canonical commits preserve disk witness and ignore incoming fake root authority

`stateManager.commitGameState()` now applies witness ownership after generic state merge:

```text
merge gameplay state
→ delete incoming runtimeAcceptedTurn
→ preserve disk witness by default
```

A fake incoming witness in an ordinary commit cannot replace the disk witness.

### Replace-profile commits preserve disk witness

`mergeProfile: 'replace'` still passes through the centralized witness authority function, so omitting the witness from incoming replacement state does not drop the disk witness.

### Accepted-turn commit uses an explicit host install option

`statePatch.processTurnResult()` no longer self-authors `runtimeAcceptedTurn` in the ordinary state payload. It passes:

```text
runtimeAcceptedTurnWitnessMode: 'install'
runtimeAcceptedTurnWitness: buildAcceptedTurnWitness(context)
```

through the canonical state write choke point.

### Active-history missing/malformed/wrong campaign/wrong epoch fail closed for obvious structural cases

`reconcileWitnessBeforeCurrentInput()` now returns `repairRequired` for:

- witness field present but structurally unparsable;
- active epoch head + missing witness;
- wrong campaign witness;
- wrong epoch witness.

## Remaining blocker V1-A — witness semantic validity is not checked before auto-repair

`parseAcceptedTurnWitness()` validates required string fields and 64-hex hash shape, but does **not** recompute:

```text
identityHash = H(campaignInstanceId, timelineEpochId, turnId, payloadHash)
```

`reconcileWitnessBeforeCurrentInput()` then turns that structurally valid witness into a ledger record and can append it when `parentIdentityHash` matches the active head.

Attack:

```text
active valid ledger head H
→ disk witness has current campaign+epoch
→ payloadHash is 64 hex
→ identityHash is different arbitrary 64 hex
→ parentIdentityHash = H.identityHash
```

Actual:

```text
parseAcceptedTurnWitness succeeds
→ one-step parent check succeeds
→ forged witness is written into ledger authority
```

Expected:

```text
invalid witness identityHash
→ repairRequired
→ never repaired into ledger authority
```

This violates the repaired Gate rule that an invalid/malformed witness is never repaired into authority.

## Remaining blocker V1-B — clear authority is not fully centralized

The repaired Gate required host witness set/preserve/clear authority to be centralized in the state write choke point.

Checkpoint restore uses the centralized `runtimeAcceptedTurnWitnessMode: 'clear'` path, but Git Timeline calls `clearCanonicalAcceptedTurnWitness()`, which directly reads and atomically rewrites `game_state.json` outside `stateManager.commitGameState()`.

Therefore witness clear authority remains split across two write surfaces.

## Additional rebind defect

`rebindAcceptedTurnCampaignInstance()` quarantines the retained TurnResult and changes campaign/epoch IDs, but it does not:

- clear the old canonical witness;
- initialize/separate a new campaign ledger.

The next preflight can therefore fail on old witness/foreign ledger authority rather than completing a usable rebind.

## Attack verdicts

| Attack | Verdict |
|:---|:---|
| A. ordinary merge with fake incoming witness | PASS |
| B. replace-profile commit omitting witness | PASS |
| C. malformed disk witness | FAIL for structurally valid but semantically forged identityHash |
| D. missing witness with active history | PASS |
| E. wrong campaign witness | PASS |
| F. wrong epoch witness | PASS outside explicit transition; transition race remains under V5 |

---

# 2. R3A-V2 — EPOCH-SAFE RAW HASH

## Verdict: PASS

The previous blocker is closed in source.

Required ordering now is:

```text
read + parse
→ writer lease
→ durable campaign/epoch preflight
→ only then process-local raw-hash fast path
```

The raw-hash marker now stores:

- `rawHash`;
- `campaignInstanceId`;
- `timelineEpochId`.

Suppression requires all three to match the current durable preflight identity.

Therefore:

```text
E1 accept bytes X
→ rotate to E2
→ E2 exact same bytes X
```

cannot be suppressed by the E1 raw marker because the epoch differs.

Same-epoch duplicates remain safely suppressed by durable ledger preflight and, secondarily, the scoped process-local marker.

Checkpoint and Git restore paths also explicitly clear the process-local marker after successful restore preparation, although epoch scoping alone already invalidates the old marker.

---

# 3. R3A-V3 — LEDGER AUTHORITY / RECONCILIATION

## Verdict: FAIL

## Closed parts

### Campaign binding

The ledger now has a top-level `campaignInstanceId`. Loading with the current scope rejects a foreign campaign ledger.

### Record self-validation

Every ledger record recomputes `identityHash` from:

- campaignInstanceId;
- timelineEpochId;
- turnId;
- payloadHash.

Forged ledger records fail parsing and preflight becomes `repairRequired`.

### Witness-first reconciliation for the initial/current epoch

Preflight now reconciles canonical witness before evaluating the currently observed TurnResult. The current file no longer needs to be the same TurnResult as the unreconciled witness.

The requested:

```text
Turn A commit succeeds
→ A ledger write fails
→ current file becomes Turn B
```

works when witness A's parent relation matches the active-epoch head.

### Active witness/head consistency

Missing/malformed/wrong campaign/wrong epoch witness conditions now fail closed when current active history requires authority.

### Backup recovery

Valid backup recovery rewrites primary with backup creation disabled, so the corrupt primary is no longer copied over the valid `.bak` first.

### Both corrupt

Primary and backup corruption becomes `repairRequired`.

### Direct preflight legacy ambiguity

A preflight with no scope and a retained root `turn_result.json` becomes `repairRequired` rather than silently assigning a scope.

## Remaining blocker V3-A — epoch chain write and epoch reconciliation disagree

The repaired Gate defines:

```text
parentIdentityHash = current ledger head for this epoch
first accepted turn in an epoch → no parent
```

The repair partially implemented epoch-aware reconciliation, but the accepted-turn context still uses the **global ledger head**:

```text
const head = ledgerHead(ledger.records)
parentIdentityHash = head?.identityHash
```

Meanwhile witness repair uses:

```text
activeEpochLedgerHead(...)
```

and tests one-step relation against that active-epoch head.

This creates a real crash window after epoch rotation:

```text
E1 ledger head = A
→ rotate to E2
→ E2 first Turn B preflight
→ context.parentIdentityHash = A (global head)
→ canonical commit writes witness B(parent=A)
→ crash before B ledger write
→ restart
→ active E2 head = none
→ repair checks B.parent === activeHead?.identityHash (undefined)
→ false
→ repairRequired
```

Expected:

```text
first E2 witness one step ahead of E2 empty head
→ reconcile B
→ suppress duplicate safely
```

The repair therefore still fails post-commit/pre-ledger crash recovery for the first Accepted turn of a new epoch.

The ledger chain validator also remains one global parent chain, which is inconsistent with the Gate's per-epoch parent semantics.

## Remaining blocker V3-B — repaired witness itself is not identity-self-validated

The ledger parser now recomputes record identity hashes, but the canonical witness path does not recompute witness identity before one-step repair.

This is the same authority defect identified under V1 and directly affects ledger reconciliation.

## Remaining blocker V3-C — legacy ambiguity can be bypassed before preflight

`preflightAcceptedTurn()` correctly rejects missing scope + retained TurnResult.

However provider dispatch paths call `ensureAcceptedTurnScope()` before the TurnResult observation path. `ensureAcceptedTurnScope()` itself still creates a new scope without checking for a retained `turn_result.json`.

Therefore a legacy workspace can transition from:

```text
no scope + retained old turn_result.json
```

to:

```text
fresh scope + retained old turn_result.json
```

before preflight sees it, bypassing the `legacyAmbiguous` condition.

## Rebind authority remains incomplete

A campaign rebind changes scope IDs but leaves the old campaign ledger in place. Since ledger loading is now correctly campaign-bound, the next preflight encounters foreign ledger authority and fails closed instead of starting a separate rebound campaign ledger.

## Attack verdicts

| Attack | Verdict |
|:---|:---|
| Campaign A scope + Campaign B ledger | PASS |
| Forged ledger record identityHash | PASS |
| Witness A reconciliation before Turn B | PASS in current/initial epoch; FAIL for first turn after epoch rotation |
| Missing witness with active history | PASS |
| Wrong epoch witness | PASS |
| Wrong campaign witness | PASS |
| Broken ledger chain | PASS |
| Primary corrupt + backup valid | PASS |
| Primary + backup corrupt | PASS |
| Missing scope + retained file | FAIL at full source integration because scope bootstrap can bypass preflight ambiguity |

---

# 4. R3A-V4 — WRITER LEASE

## Verdict: FAIL

## Closed parts

### Empty-workspace initial acquisition uses an atomic local primitive

First acquisition uses `fs.mkdirSync(writer_lease.lock)`. On an empty workspace, two hosts racing the same lock directory cannot both win that single atomic mkdir.

### Long live owner is not stealable by timeout alone

After timestamp timeout, same-machine ownership checks whether the recorded PID is still running. A live PID remains protected.

### Heartbeat exists and starts after acquisition

The owner starts a 10-second interval that renews the lease file while the extension host remains alive.

Provider dispatch acquires the lease before running provider work, so long asynchronous provider execution is covered by the heartbeat in the normal path.

### Dead stale owner can recover in the simple one-contender case

Expired same-machine lease + dead PID is treated as recoverable.

### Malformed lease fails closed

An existing unparsable lease file returns `writerConflict` instead of being silently overwritten.

## Remaining blocker V4-A — PID reuse is still not defended

The lease records `processStartedAt`, but stale-owner recovery never compares it to actual process-start evidence.

After timeout, same-machine logic is effectively:

```text
PID currently exists → owner considered live
PID absent → recoverable
```

Therefore PID remains sufficient authority.

Attack:

```text
Host A dies
→ OS later reuses A's PID for unrelated process
→ lease timestamp expires
→ Host B attempts recovery
```

Actual:

```text
process.kill(reusedPid, 0) succeeds
→ writerConflict indefinitely while unrelated process lives
```

Expected:

```text
PID + process-start evidence distinguish reused PID from original owner
→ stale owner safely recoverable
```

This fails the explicit adversarial hardening requirement that stale recovery not rely on PID alone.

## Remaining blocker V4-B — stale takeover is not atomic between competing recoverers

For a stale recoverable lease with an existing lock directory, each contender does:

```text
mkdir lockDir → fails
→ rmSync(lockDir, recursive)
→ mkdirSync(lockDir)
```

Two hosts can both read the same stale prior lease before either takeover completes.

Interleaving:

```text
A removes stale lock and creates new lock
B, using stale prior evidence already read, removes A's new lock
B creates lock
A writes lease
B writes lease
```

Both acquisition calls can return success.

The stale takeover path is therefore not compare-and-swap safe even though empty-workspace first acquisition is atomic.

## Remaining blocker V4-C — crash after lock mkdir and before lease write can orphan authority permanently

First acquisition order is:

```text
mkdir lockDir
→ write writer_lease.json
```

If the process crashes between those steps:

```text
lockDir exists
lease file absent
```

A future host sees no prior lease, fails `mkdirSync(lockDir)`, and cannot enter the stale-recovery branch because `prior` is absent.

Result: permanent `writerConflict` without automatic stale-owner recovery.

## Test weakness

The repair test does not spawn two hosts/processes for simultaneous first acquisition or stale takeover. It only exercises one module instance and manually mutates the lease file.

No behavior test covers PID reuse, heartbeat during a long provider run, stale takeover race, or orphan lock recovery.

---

# 5. R3A-V5 — RESTORE / REWIND / GIT AUTHORITY

## Verdict: FAIL

## Closed parts

### All six call sites invoke restore preparation

Source call sites exist for:

- Undo;
- rewind;
- checkpoint restore;
- regenerate;
- Git branch-from-turn;
- Git branch switch.

### Quarantine occurs before epoch rotation

`prepareAcceptedTurnTimelineRestore()` now:

```text
enter TurnResult single-flight
→ acquire writer lease
→ quarantine retained turn_result.json
→ verify root file is gone
→ rotate epoch
```

### Quarantine failure leaves epoch unchanged

Rotation is not attempted when quarantine throws.

### Raw hash is epoch-scoped and callers clear it

Checkpoint/Git restore preparation clears the process-local marker after successful preparation.

### Git authority isolation is implemented in source

- `.text-adventure/runtime/` is added to Git ignore rules before initial `git add .`;
- existing Git repos get the ignore line added;
- timeline mutation checks `git ls-files` and refuses if runtime authority is already tracked.

## Remaining blocker V5-A — only preparation is serialized; the restore mutation itself is outside the TurnResult queue

`prepareAcceptedTurnTimelineRestore()` holds `runAcceptedTurnSingleFlight()` only through:

```text
lease
→ quarantine
→ epoch rotation
```

It returns after rotation and releases the queue.

The six callers then perform outside that serialization authority:

- raw-hash clear;
- history mutation;
- canonical restore write;
- Git checkout;
- Git witness clear.

Therefore the required full order is not held under one mutation barrier:

```text
writer authority
→ same serialization authority
→ quarantine
→ rotate
→ clear epoch marker
→ perform restore
```

Attack:

```text
restore preparation finishes and queue releases
→ watcher/fallback observes a newly written TurnResult
→ TurnResult processing enters the queue
→ actual checkpoint/Git restore is still pending outside the queue
```

The TurnResult can race the restore state mutation.

For Git paths the window is especially clear because asynchronous `git checkout` runs after restore preparation has released the queue.

This leaves the previous V5 serialization blocker open.

## Transition witness race

Because queue ownership ends before the restore clears/replaces the old witness, a queued TurnResult can observe:

```text
new epoch scope
+ old epoch canonical witness
```

and return `repairRequired` during an explicit coordinated transition.

It does not duplicate canonical mutation, but it proves the transition is not isolated as designed and can interfere with pending lifecycle handling.

## Git clear path also bypasses the centralized state write choke point

After checkout, Git paths call `clearCanonicalAcceptedTurnWitness()` directly. This is a trusted helper, but it directly rewrites `game_state.json`, so witness authority is not truly centralized.

## Attack verdicts

| Attack | Verdict |
|:---|:---|
| A. quarantine failure | PASS |
| B. in-flight/competing TurnResult processing | FAIL — preparation waits for prior work, but restore body is not protected from subsequent TurnResult work |
| C. old retained future TurnResult | PASS |
| D. same bytes after epoch rotation | PASS |
| E. manual divergence | PASS for direct same-epoch missing/mismatched witness preflight |
| F. Git runtime authority isolation | PASS in source |

---

# 6. TEST QUALITY RECHECK

## Verdict: FAIL

The repair tests are materially better, but they still do not make all five repairs load-bearing.

## Covered behavior

- ordinary witness preservation;
- replace-profile witness preservation;
- fake incoming ordinary witness ignored;
- obvious malformed/missing/wrong-epoch witness fail closed;
- same payload identity across epoch at guard-preflight level;
- wrong campaign ledger;
- forged ledger record identity hash;
- witness A reconciliation before current Turn B in the initial epoch;
- valid backup preservation;
- both ledger files corrupt;
- direct preflight legacy ambiguity;
- live PID beyond timestamp timeout;
- simple stale dead PID recovery;
- malformed lease;
- successful quarantine-before-rotation;
- quarantine failure leaves epoch unchanged;
- generic Git ignore mechanics.

## Missing load-bearing behavior

1. structurally valid but identity-inconsistent canonical witness rejection;
2. state write choke-point enforcement for Git witness clear;
3. first post-commit/pre-ledger crash after epoch rotation;
4. same bytes across epoch through actual `gameStateSync` raw-hash marker, not direct guard-only calls;
5. provider/bootstrap bypass of legacy ambiguity;
6. simultaneous first acquisition with two process/module owners;
7. concurrent stale takeover contenders;
8. orphan lock directory after crash before lease write;
9. PID reuse with mismatched process-start evidence;
10. heartbeat during a provider run longer than timeout;
11. full restore mutation serialization against TurnResult processing;
12. all six restore call sites behaviorally proving ordering;
13. tracked runtime authority rejection through actual Git Timeline mutation helper;
14. explicit campaign rebind producing separate usable ledger/witness authority.

## Mutation sanity verdict

- Remove stateManager preserve/install repair: current V1 tests fail — good.
- Remove epoch-aware preflight/raw-hash source repair: current guard-only epoch test may still pass if only `gameStateSync` fast-path ordering regresses — insufficient.
- Reintroduce first-new-epoch crash reconciliation defect: current V3 tests still pass — insufficient.
- Reintroduce PID reuse/stale takeover/orphan lock defects: current V4 tests still pass — insufficient.
- Release queue before actual restore mutation: current V5 tests still pass — insufficient.

Therefore test quality remains FAIL.

---

# 7. NARROW REGRESSION SPOT-CHECK

## Exact restart duplicate: PASS

For a valid retained already-Accepted TurnResult with consistent scope/ledger/witness authority:

```text
startup sweep
→ durable preflight
→ alreadyAccepted
→ return before processTurnResult
```

No duplicate:

- canonical mutation;
- world simulation;
- Handled;
- Accepted callback;
- PROMPT ACK;
- Chronicle/WCS consumption;
- provider dispatch;
- success-only UI/media/bootstrap.

## Fallback lifecycle: PASS

The repair did not modify `turnResultFallback.ts`.

Previously-passed behavior remains:

- old `alreadyAccepted` duplicate does not satisfy a new pending callback;
- current-run direct-write diff synthesis remains independent;
- retryable/quarantine/repair outcomes do not synthesize over the same bad file.

## World-state separation: PASS

RUNTIME-003A still does not claim to solve:

- pre-commit world-state mutation;
- optimistic fresh-revision reapply;
- global multi-file exactly-once.

`CHATGPT-20260706-002` remains separate.

---

# 8. EXECUTION

## Independent execution

Not run.

Reason:

- no local LoreRelay checkout;
- outbound GitHub DNS unavailable;
- no GitHub Actions workflow run for repair source commit.

This did not cause the FAIL verdict.

## Repair implementation evidence

`RUNTIME-003A-VERIFICATION-REPAIR-RESULT.md` reports:

- `npm run compile`: PASS;
- focused replay-guard test: PASS;
- runtime acceptance test: PASS;
- requested pipeline/state/atomicity/cross-ledger/PROMPT/Inspector regressions: PASS;
- `node scripts/check_i18n_keys.js`: PASS;
- `npm test`: PASS, `225/225`.

`npm ci --include=dev` was not rerun in the repair turn because dependencies were already installed from the implementation run.

Execution evidence is accepted as implementation evidence only, not independent reverify execution.

---

# 9. REMAINING BLOCKERS

## R3A-V1 remains open

- canonical witness identity is not self-validated before one-step repair;
- Git witness clear bypasses the centralized canonical state write choke point;
- rebind does not produce coherent new witness/ledger authority.

## R3A-V3 remains open

- write-side parent selection uses global ledger head while repair uses active-epoch head;
- first Accepted turn after epoch rotation cannot recover a post-commit/pre-ledger crash;
- legacy ambiguity can be bypassed by scope bootstrap before preflight.

## R3A-V4 remains open

- PID reuse is not distinguished using process-start evidence;
- stale takeover is not atomic between two recoverers;
- crash after lock-directory creation before lease write can orphan the lock permanently.

## R3A-V5 remains open

- only restore preparation is in the TurnResult single-flight queue;
- actual checkpoint/Git restore mutation executes after the queue is released.

`R3A-V2` is closed.

---

# 10. NEW FINDINGS

1. A structurally valid but identity-inconsistent canonical witness can be one-step repaired into ledger authority before ledger self-validation catches it later.
2. Global write-side parent chaining and active-epoch repair semantics are inconsistent, breaking crash recovery for the first Accepted turn after an epoch rotation.
3. Stale writer-lock takeover can allow two recoverers because each may delete the other's newly acquired lock directory using stale prior evidence.
4. Crash after atomic lock-directory creation but before lease-file write leaves an orphan lock with no automatic recovery path.
5. Provider-side scope bootstrap can erase the missing-scope condition before legacy retained-file preflight checks it.

All findings are within the requested RUNTIME-003A replay/crash-safety scope.

---

# 11. FINAL VERDICT

`RUNTIME003A_REVERIFY_FAIL`
