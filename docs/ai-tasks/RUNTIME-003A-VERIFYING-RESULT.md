# RUNTIME-003A Independent Verification Result

| Field | Value |
|:---|:---|
| Task | `RUNTIME-003A — Durable Accepted Turn Identity / Restart Replay Guard` |
| Role | Independent Runtime / Crash-Safety Verifier |
| AI | ChatGPT / GPT-5.5 / High |
| Repository | `GGF1sh/LoreRelay` |
| Current main at verification | `88abce23727dbeef1ac4d983b56a24e95364e98d` |
| Reviewed implementation commit | `e25b7d1307efd126419d6e69754667e10db5c9d5` |
| Implementation result commit | `48527dad215672b2a424df324984bb0428d35eea` |
| Reviewed branch | `task/RUNTIME-003A-durable-replay-guard` |
| Final verdict | `RUNTIME003A_VERIFYING_FAIL` |

## 0. Scope and method

This verification reviewed the implementation itself against:

- `docs/ai-tasks/RUNTIME-003A.md`
- `docs/ai-tasks/RUNTIME-003A-ARCHITECTURE-GATE.md`
- `docs/ai-tasks/RUNTIME-003A-ADVERSARIAL-REVIEW-INTAKE.md`
- `docs/ai-tasks/RUNTIME-003A-ARCHITECTURE-GATE-REPAIR.md`
- `docs/ai-tasks/RUNTIME-003A-ADVERSARIAL-RECHECK.md`
- `docs/ai-tasks/RUNTIME-003A-IMPLEMENTATION-RESULT.md`

The implementation commit is exactly one commit ahead of baseline `696aa001c40bba99ba0db747a913c03c032d567c` and changes 13 files. The implementation-result commit is document-only.

No source was modified by verification. No merge was performed.

Independent execution was attempted but unavailable because the verifier environment could not resolve `github.com`, no local LoreRelay checkout was present, and no GitHub Actions workflow run existed for the implementation commit. Execution unavailability is not itself a failure; the final FAIL is based on static contract violations in the implementation.

---

# 1. ACCEPTED BOUNDARY / WITNESS

## Verdict: FAIL

## What passes

### Canonical commit failure does not become Accepted

`statePatch.processTurnResult()` still returns `false` when canonical `commitGameState()` fails. Accepted ledger recording occurs only after a successful canonical commit.

### Witness is prepared into the canonical commit payload

When `acceptedTurnContext` exists, `runtimeAcceptedTurn` is attached to `commitState` before `commitGameState()`.

This preserves the RUNTIME-002A Accepted boundary:

```text
validate commitState
→ commitGameState(...).ok === true
→ Accepted
```

No pre-commit branch durably records the accepted ledger entry.

### Post-commit accepted-ledger failure does not revoke Accepted

`recordAcceptedTurnAfterCommit()` is attempted after canonical commit and exceptions are isolated. The canonical witness remains on disk for replay recovery.

### AI TurnResult statePatch cannot directly write the witness

`runtimeAcceptedTurn` is not in the `ALLOWED_ROOTS` / patchable root allowlist.

## Blocking failures

### R3A-V1A — canonical witness ownership is not centralized

The repaired Gate required ordinary commits to preserve trusted disk witness authority while ignoring incoming attempts to set/replace it. That ownership rule was not implemented in the state write choke point.

`stateManager.ts` is unchanged. `commitGameState()` still delegates to generic merge behavior.

Consequences:

- default merges allow incoming root `runtimeAcceptedTurn` to overwrite disk because incoming roots spread over disk;
- replace-profile commits can drop the witness when incoming state omits it;
- malformed incoming witness-shaped root data is not filtered by `validateGameState()` and is preserved by `sanitizeGameStateForPersist()` because unknown roots are retained.

The implementation added `runtimeAcceptedTurn` to `TURN_AUTHORITATIVE_ROOT_KEYS`, but that only affects turn-profile revision conflicts. It is not the required host-only set/preserve/clear authority boundary.

Therefore attack C/D/E are not fully closed at the canonical write boundary.

### R3A-V1B — missing/malformed/wrong-epoch witness does not fail closed against accepted history

`preflightAcceptedTurn()` does not enforce the repaired Gate's active-epoch witness/head consistency rules.

If the canonical witness is:

- missing;
- malformed and therefore parsed as `undefined`;
- from the wrong epoch;

then preflight may simply continue to `unseen` and allow a new mutation, even when the ledger already contains accepted history.

The repaired Gate required:

```text
active epoch head non-null + witness missing
→ repairRequired

wrong-epoch / behind / inconsistent witness
→ repairRequired unless this is an explicitly coordinated new epoch
```

Those checks are absent.

This directly fails attacks E and F and weakens same-folder/manual restore divergence detection.

## Attack outcomes

| Attack | Outcome |
|:---|:---|
| A. canonical commit fails | PASS |
| B. canonical commit succeeds, ledger write fails | PARTIAL PASS — witness survives; later recovery has limitations described in section 4 |
| C. later ordinary save occurs | FAIL — state write choke point does not own witness preservation/rejection |
| D. incoming patch contains witness | PASS for TurnResult JSON Patch allowlist; FAIL for generic ordinary commit authority |
| E. malformed disk witness | FAIL — malformed witness may collapse to missing and not fail closed |
| F. wrong epoch witness | FAIL — wrong-epoch witness may be ignored and mutation may continue |

---

# 2. RESTART DUPLICATE SUPPRESSION

## Verdict: PASS (narrow accepted-file replay path)

For the exact retained Accepted TurnResult path:

```text
Accepted TurnResult
→ file remains
→ process restart
→ startup sweep
→ processTurnResultFileAt
→ durable preflight
→ ledger exact identity OR one-step matching witness repair
→ alreadyAccepted
→ return before processTurnResult
```

The `alreadyAccepted` path returns before:

- canonical mutation;
- world simulation;
- `markTurnResultHandled`;
- pending callback;
- PROMPT ACK;
- Chronicle/WCS consumption;
- provider dispatch;
- success-only media/UI/auto-image/bootstrap effects.

All normal file observations converge on `processTurnResultFileAt()` and are wrapped by `runAcceptedTurnSingleFlight()`:

- startup sweep;
- watcher create/change;
- fallback `checkPendingTurnResultFile()`.

Same-process duplicate watcher events are also stopped before apply by the accepted raw-hash fast path after one truthful Accepted result.

This verdict is intentionally narrow. Identity/epoch and lease defects are classified separately below.

---

# 3. IDENTITY CORE

## Verdict: FAIL

## Pure-core behavior that passes

`acceptedTurnReplayGuardCore.ts` correctly:

- recursively sorts object keys;
- preserves array order;
- preserves parsed string values without Unicode normalization;
- excludes only root-level `beforeHash`, `afterHash`, and `appliedAt`;
- rejects missing/empty `turnId` during identity build;
- includes campaign ID, epoch ID, turn ID, and payload hash in identity hash;
- detects same campaign+epoch+turnId with changed payload as conflict.

## Blocking failure

### R3A-V2 — process-local raw hash overrides epoch identity

`gameStateSync.processTurnResultFileAtSerialized()` checks:

```text
rawHash === lastProcessedTurnHash
→ alreadyAccepted
```

before:

- writer lease;
- durable scope load;
- epoch-aware identity build;
- ledger/witness preflight.

`lastProcessedTurnHash` is not scoped by `campaignInstanceId` or `timelineEpochId`, and restore/epoch rotation does not reset it.

Attack:

```text
accept bytes X in epoch E1
→ same process
→ rewind/restore rotates to epoch E2
→ a valid alternate-future TurnResult has the same bytes X
→ raw hash matches E1 marker
→ returns alreadyAccepted before E2 identity is built
```

Expected:

```text
new epoch + same turnId/payload
→ valid new identity
```

Actual:

```text
false duplicate suppression by stale process-local raw hash
```

This violates the repaired identity contract and can lose a valid alternate-future turn.

---

# 4. LEDGER / WITNESS RECONCILIATION

## Verdict: FAIL

## What passes

- records carry `parentIdentityHash`;
- structural ordinal order is validated;
- exact retained TurnResult + witness parent equal current head can append one record and return `alreadyAccepted`;
- broken simple parent chain fails parse;
- corrupt primary with valid backup can recover in the normal non-crashing recovery path;
- corrupt primary and corrupt/missing backup throws and becomes `repairRequired` through preflight;
- same-epoch same-turn changed payload is quarantined.

## Blocking failures

### R3A-V3A — ledger has no campaign ownership binding

The ledger schema is only:

```text
schemaVersion
records[]
```

There is no top-level `campaignInstanceId`, and load/preflight does not require all records to belong to the current scope campaign.

A foreign campaign ledger can therefore be loaded under another current scope. Its records become the current global head and a new campaign record can chain onto that foreign head.

This fails the explicit wrong-campaign attack and the repaired Gate's fail-closed foreign-authority rule.

### R3A-V3B — wrong/missing active-epoch witness is not reconciled or rejected truthfully

Preflight only applies witness checks when witness campaign+epoch equal the current scope.

Wrong-epoch witness is ignored.

Missing or malformed witness is also ignored.

A current-epoch ledger can therefore have accepted history while canonical state lacks the matching current-epoch witness, yet a new `unseen` turn can still proceed.

This defeats the intended manual restore / same-folder replacement divergence guard.

### R3A-V3C — unreconciled witness recovery depends on the current TurnResult being that same identity

The one-step repair condition requires:

```text
sameAcceptedTurnIdentity(witness, currentInputIdentity)
AND witness.parentIdentityHash === ledgerHead
```

Therefore after:

```text
Turn A canonical commit succeeds
→ A ledger write fails
→ A file is overwritten by new Turn B before A is re-observed
```

Turn B preflight cannot reconcile A from the canonical witness alone. It fails closed with `repairRequired` instead of performing the Gate's required witness-first reconciliation.

Fail-closed is safer than replay, but the designed automatic crash recovery is incomplete and can strand a campaign despite sufficient witness data.

### R3A-V3D — ledger records are not cryptographically self-consistent

`parseAcceptedTurnLedger()` validates field shapes and hex lengths but does not recompute:

```text
identityHash = H(campaignInstanceId, timelineEpochId, turnId, payloadHash)
```

A structurally valid but internally inconsistent record can pass ledger parsing as long as the parent chain strings line up.

The explicit malformed-record attack is therefore not fully rejected.

### Additional crash-safety concern — backup recovery rewrites through normal backup creation

When primary is corrupt and `.bak` is valid, recovery calls atomic write with backup creation enabled. The generic helper first copies the corrupt primary over `.bak`, then writes recovered primary.

A crash between those steps can destroy the last valid backup and leave both authority files corrupt.

This is a new in-scope crash-safety finding.

## Attack outcomes

| Attack | Outcome |
|:---|:---|
| A. witness two steps ahead | PASS — does not auto-repair |
| B. ledger wrong epoch | FAIL — foreign/current epoch consistency is not enforced as designed |
| C. ledger wrong campaign | FAIL |
| D. stale backup | PARTIAL — normal recovery works, recovery crash window can destroy valid backup |
| E. malformed record | FAIL for internal identity consistency |
| F. same-turn changed-payload conflict | PASS |

---

# 5. STRUCTURED OUTCOMES / LIFECYCLE

## Verdict: PASS

The implementation defines:

- `newlyAccepted`
- `alreadyAccepted`
- `missing`
- `retryableFailure`
- `rejected`
- `quarantined`
- `repairRequired`
- `writerConflict`

Observed caller behavior is materially aligned with the repaired Gate:

### newlyAccepted

Only this path performs:

- committed raw hash update;
- `markTurnResultHandled`;
- callback;
- success-only media/UI/auto-image/bootstrap.

### alreadyAccepted

Returns before apply and before all truthful success-completion effects.

### retryableFailure

Does not enter direct-write synthesis in `finishGmRun()` and clears pending callback/lifecycle after the bounded file read recovery path is exhausted.

The durable file remains on disk and can be observed later.

### rejected/quarantined/repairRequired/writerConflict

Do not enter synthesis and do not mark Handled.

The `rejected` variant exists in the outcome type but has no obvious producer in the reviewed implementation; that is not itself a blocker because malformed/conflict cases are represented by other explicit stop outcomes.

---

# 6. DIRECT-WRITE FALLBACK

## Verdict: PASS (static lifecycle path)

High-priority attack:

```text
current GM run exists
+ old stale alreadyAccepted turn_result.json remains
```

Implemented behavior:

1. stale file returns `alreadyAccepted` without Handled/callback;
2. `finishGmRun()` treats `alreadyAccepted` as eligible only for the independent direct-write diff check;
3. if current `game_state.json` differs from pre-run state, a new synthesized TurnResult is written;
4. the existing current-run callback remains stored for that newly synthesized TurnResult;
5. the stale duplicate itself does not satisfy the current run;
6. `retryableFailure` and quarantine/repair outcomes do not synthesize over the bad file.

The current callback is invoked only later when the newly synthesized TurnResult crosses a real Accepted boundary.

No static callback leak or duplicate-current-turn path was found in this narrow flow.

However, this architecture-critical behavior is not directly covered by a focused behavior test; that is recorded under test quality.

---

# 7. WRITER LEASE

## Verdict: FAIL

### R3A-V4A — live/stale determination is timestamp-only

The lease records:

- host UUID;
- PID;
- hostname;
- process start time;
- acquired/renewed times.

But `isLeaseLive()` uses only:

```text
Date.now() - Date.parse(renewedAt) < leaseTimeoutMs
```

PID, hostname, and process start identity are not used to prove owner liveness or distinguish PID reuse.

### R3A-V4B — no heartbeat keeps a long-running live owner live

The lease is renewed only when `ensureAcceptedTurnWriterLease()` is called.

Provider dispatch acquires/renews once before a provider run. No periodic heartbeat was found.

Attack:

```text
Host A starts a provider run lasting >30 seconds
→ A remains alive and mutating campaign lifecycle
→ lease renewedAt expires
→ Host B calls ensure lease
→ Host B overwrites A's lease
```

This violates:

```text
live foreign writer cannot be stolen
```

### R3A-V4C — first acquisition is not an exclusive/CAS operation

Acquisition performs:

```text
read existing file if any
→ decide
→ atomic replace writer_lease.json
```

There is no exclusive-create (`wx`) or compare-and-swap ownership step.

Two hosts can both observe no lease concurrently and both write their own lease. Each can return success.

This defeats the primary two-host safety goal.

### R3A-V4D — malformed lease is silently stealable

A malformed lease parses as `undefined` and is overwritten as if stale/unowned.

The implementation therefore cannot distinguish malformed authority from absence, and a live owner whose lease is partially/corruptly observed can be stolen.

## Attack outcomes

| Attack | Outcome |
|:---|:---|
| A. two live VS Code hosts | FAIL under simultaneous first acquisition and timeout stealing |
| B. stale lease after crash | PASS after timeout |
| C. PID reuse | FAIL to prove safety — PID/start identity is recorded but unused |
| D. expired timestamp but live process | FAIL — live lease is stolen |
| E. dead PID with recent lease | conservative conflict until timeout; safe but not prompt recovery |
| F. process restart | stale recovery only by timestamp expiry |
| G. malformed lease | FAIL — overwritten rather than fail closed |

Provider dispatch does have a lease gate, but the lease itself is not a reliable single-writer authority.

---

# 8. SINGLE-FLIGHT / RACES

## Verdict: PASS for TurnResult observation paths

`processTurnResultFileAt()` wraps the entire serialized file-processing path in one module-level promise chain.

The queue covers:

```text
file read/parse
→ lease check
→ durable preflight
→ processTurnResult
→ canonical witness commit
→ accepted-ledger update
→ Accepted result completion
```

All four requested observation combinations converge on this same function:

- startup + watcher;
- watcher + watcher;
- watcher + fallback;
- fallback + startup.

No alternate TurnResult file processor outside this queue was found.

Caveat: restore/rewind mutation is not coordinated with this single-flight queue. That is classified under restore/rewind because the restored state can race a queued TurnResult apply even though the TurnResult processors themselves are serialized with each other.

---

# 9. RESTORE / REWIND EPOCH ROTATION

## Verdict: FAIL

## What passes

All six required call sites invoke a replay-restore preparation helper before their main restore/checkout mutation:

- Undo;
- rewind-to-turn;
- checkpoint restore;
- regenerate;
- Git branch-from-turn;
- Git branch switch.

Each preparation helper checks writer lease first.

Ledger records are not truncated on epoch rotation.

## Blocking failures

### R3A-V5A — required quarantine/epoch order is reversed

Required:

```text
writer authority
→ quarantine retained turn_result.json
→ rotate timelineEpochId
→ restore
```

Implemented helper:

```text
write new timelineEpochId
→ quarantine retained turn_result.json
```

If quarantine rename fails:

- epoch was already rotated;
- restore is aborted;
- stale TurnResult remains at the root;
- the required pre-rotation safety invariant is broken.

The focused test verifies only successful final state and does not inject quarantine failure.

### R3A-V5B — restore is not serialized against the TurnResult single-flight queue

Checkpoint/Git restore helpers call lease+rotation directly.

They do not enter `runAcceptedTurnSingleFlight()` or another common process-local mutation barrier.

A same-host restore can therefore race a TurnResult currently between preflight and canonical apply/ledger update.

The writer lease cannot stop this because both operations have the same host instance and are allowed to renew the same lease.

### R3A-V5C — valid same-bytes alternate future can be suppressed after epoch rotation

The old `lastProcessedTurnHash` remains process-local across epoch rotation.

A valid E2 TurnResult with bytes identical to a previously Accepted E1 TurnResult is returned as `alreadyAccepted` before E2 durable identity is built.

This violates the required new-epoch same-turn validity.

### R3A-V5D — manual inconsistent restore is not fail-closed

As described in sections 1 and 4, missing/malformed/wrong-epoch witness can be ignored while ledger history exists.

Therefore manual old `game_state` + newer accepted ledger can continue to an unseen mutation instead of `repairRequired`.

### R3A-V5E — Git runtime authority is not protected from Git Timeline

The repaired Gate required `.text-adventure/runtime/` to be Git-ignored and tracked runtime authority to fail closed.

Implementation does neither:

- default `.gitignore` does not include `.text-adventure/runtime/`;
- initial `git add .` can track scope/ledger/lease files if they already exist;
- no tracked-runtime-authority detection exists before timeline checkout.

A Git branch checkout can therefore roll replay authority files with the timeline, undermining the durable scope/ledger separation.

## Call-site outcome

| Path | Preparation helper present? | Required order/serialization satisfied? |
|:---|:---:|:---:|
| Undo | Yes | FAIL |
| rewind | Yes | FAIL |
| checkpoint restore | Yes | FAIL |
| regenerate | Yes | FAIL |
| Git branch-from-turn | Yes | FAIL |
| Git branch switch | Yes | FAIL |

---

# 10. CAMPAIGN SCOPE

## Verdict: FAIL

## What passes

- `campaignInstanceId` is random and durable in runtime scope file;
- identity does not derive from workspace path;
- folder rename/move preserves copied runtime scope identity;
- full-folder copy preserves clone lineage;
- `rebindAcceptedTurnCampaignInstance()` changes campaign ID and epoch ID.

## Blocking failures

### Foreign ledger ownership is not checked

A scope with Campaign B can load a ledger containing Campaign A records and continue from its global head.

### Rebind does not initialize/separate ledger authority

`rebindAcceptedTurnCampaignInstance()` changes scope UUIDs but leaves the old ledger untouched and does not reject or archive the foreign campaign records.

### Same-folder campaign replacement is not reliably detected

If gameplay state is replaced while old runtime scope/ledger remain, missing or wrong-epoch witness can be ignored and a new turn may proceed.

Expected: `repairRequired` / explicit rebind.

### Legacy retained TurnResult migration is not fail closed

`ensureAcceptedTurnScope()` creates a fresh scope whenever the scope file is missing.

It does not check for:

```text
no scope
+ no ledger
+ retained turn_result.json
```

The repaired Gate required this to become `legacyAmbiguous` / repair-required rather than auto-assigning new replay identity and processing the file.

---

# 11. WORLD-STATE SEPARATION

## Verdict: PASS

The implementation does not claim or attempt to solve:

- pre-commit `world_state` mutation;
- optimistic fresh-revision reapply;
- global multi-file exactly-once.

No world simulation implementation file was changed.

The replay guard reduces one narrow risk by stopping a durably known already-Accepted duplicate before `processTurnResult()`, so that duplicate cannot re-enter world simulation.

The pre-existing pre-commit world mutation / optimistic reapply candidate remains separate as `CHATGPT-20260706-002`.

No implementation change was found that makes that issue materially worse.

---

# 12. TEST QUALITY

## Verdict: FAIL

The focused test `scripts/test_runtime_accepted_replay_guard.js` is only a small smoke suite. It covers:

- host-field/key-order identity stability;
- direct preflight duplicate after ledger record;
- manually constructed one-step witness repair;
- same-epoch changed-payload conflict;
- corrupt primary + valid backup recovery;
- one recent foreign lease conflict;
- successful epoch rotation/quarantine helper.

The existing runtime acceptance test adds:

- structured retryable/newlyAccepted/alreadyAccepted behavior;
- Accepted witness presence in the commit payload;
- same-process fallback/watcher duplicate ordering.

Architecture-critical requirements that are not behavior-tested include:

1. actual restart/module reload with real durable guard + `gameStateSync`;
2. no double world simulation on restart duplicate;
3. no double PROMPT ACK / Chronicle/WCS consumption;
4. old duplicate + current direct-write fallback lifecycle;
5. post-commit/pre-ledger crash injection through the real `statePatch` path;
6. witness one-step repair after actual ledger-write failure;
7. witness two-step / wrong-parent rejection;
8. missing/wrong-epoch witness with non-empty accepted history;
9. wrong-campaign ledger;
10. internally inconsistent ledger record identity;
11. primary+backup both corrupt;
12. crash during backup recovery;
13. live owner after lease timeout;
14. stale/dead process evidence;
15. PID reuse;
16. malformed lease;
17. simultaneous first lease acquisition;
18. lease heartbeat during long provider run;
19. startup+watcher race behavior;
20. watcher+watcher race behavior;
21. watcher+fallback race with real durable guard;
22. fallback+startup race;
23. quarantine failure before epoch rotation;
24. restore racing a TurnResult already in single-flight;
25. all six restore call sites rotating epoch behaviorally;
26. same bytes accepted again in a new epoch;
27. Git runtime authority ignore/tracked-file rejection;
28. folder move/rename identity;
29. explicit rebind with ledger ownership;
30. same-folder campaign replacement fail-closed;
31. legacy retained TurnResult migration ambiguity.

The focused suite would still pass with several confirmed blockers above, including timestamp-only lease stealing and reversed quarantine/epoch order.

The tests are therefore not load-bearing enough for the repaired Architecture Gate.

---

# 13. EXECUTION

## Independent execution

Not available.

Attempted:

```text
git ls-remote https://github.com/GGF1sh/LoreRelay.git HEAD
```

Result:

```text
Could not resolve host: github.com
```

No local LoreRelay checkout was present. No GitHub Actions workflow run was associated with implementation commit `e25b7d1307efd126419d6e69754667e10db5c9d5`.

Therefore the verifier did not independently run:

- `npm ci --include=dev`
- `npm run compile`
- focused runtime replay test
- requested regression scripts
- `npm test`
- i18n key check

## Implementation evidence

The implementation result reports:

- `npm ci --include=dev`: PASS
- `npm run compile`: PASS
- requested focused/runtime regression scripts: PASS
- `npm test`: PASS `225/225`
- i18n key check: PASS

Execution unavailability is not counted as a blocker. Static contract failures independently require FAIL.

---

# 14. SCOPE CHECK

## Verdict: PASS

Implementation diff is confined to the replay guard and directly necessary integration/test files.

No unintended changes were found to:

- PROMPT-001C receipt/ACK authority core;
- provider session identity architecture;
- World Map / README;
- world simulation implementation;
- unrelated gameplay systems.

Provider files are touched narrowly to add writer-lease gating.

`CHATGPT-20260706-002` behavior is not redesigned.

---

# 15. BLOCKERS

## R3A-V1 — Witness ownership/divergence is not fail-closed

Repair requirements:

- centralize host witness set/preserve/clear authority in canonical state write choke point;
- ordinary commit must preserve trusted disk witness and reject/ignore incoming authority;
- active accepted history + missing/malformed/wrong-epoch witness must follow explicit repaired divergence rules.

## R3A-V2 — Raw hash fast path is not epoch-scoped

Repair requirements:

- do not let process-local raw hash bypass epoch-aware durable identity after timeline rotation;
- reset or bind fast-path marker to campaign+epoch identity;
- behavior-test same bytes in new epoch.

## R3A-V3 — Ledger ownership/reconciliation is incomplete

Repair requirements:

- bind ledger to campaign scope and reject foreign campaign authority;
- enforce correct epoch/head/witness consistency;
- validate record identity hash from record fields;
- reconcile one-step witness before evaluating a newer unseen TurnResult;
- avoid destroying valid backup during primary recovery.

## R3A-V4 — Writer lease is not a reliable single-writer lock

Repair requirements:

- make first acquisition exclusive/CAS-safe;
- keep live owner live with heartbeat or equivalent provable liveness;
- do not steal a live owner merely because timestamp expired;
- actually use sufficient host/process-start evidence for stale recovery;
- define malformed lease fail-closed/recovery behavior;
- behavior-test two-host races and long-running providers.

## R3A-V5 — Restore/rewind safety ordering and integration are incomplete

Repair requirements:

- quarantine retained TurnResult before epoch rotation;
- abort before rotation when quarantine fails;
- serialize restore mutation against TurnResult single-flight;
- prevent stale raw hash from crossing epochs;
- fail closed on manual restore divergence;
- Git-ignore runtime authority and detect tracked authority before timeline mutation.

---

# 16. NEW FINDINGS

1. Valid ledger backup can be overwritten by corrupt primary during backup-based recovery before recovered primary is safely installed.
2. Legacy missing-scope + retained TurnResult does not enter the required ambiguity/fail-closed migration state.
3. Git Timeline initialization can track `.text-adventure/runtime/` because the runtime directory is absent from the default `.gitignore` and initial setup runs `git add .`.

These are all within the requested RUNTIME-003A crash-safety / replay-authority scope.

---

# 17. FINAL VERDICT

`RUNTIME003A_VERIFYING_FAIL`
