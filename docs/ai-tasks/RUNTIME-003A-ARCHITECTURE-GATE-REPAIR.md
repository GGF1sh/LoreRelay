# RUNTIME-003A Architecture Gate Repair — Durable Accepted Turn Identity / Restart Replay Guard

| Field | Value |
|:---|:---|
| Task | `RUNTIME-003A` |
| Role | Architecture Gate Repair |
| Author | ChatGPT / GPT-5.5 / High |
| Repository | `GGF1sh/LoreRelay` |
| Original Gate | `047e11ad68d5cf44a52535b995b3370e438a179a` |
| Repair baseline | `db32a0b4539c91af6073086e671521a9c91a684a` |
| Adversarial intake | `docs/ai-tasks/RUNTIME-003A-ADVERSARIAL-REVIEW-INTAKE.md` |
| Status | `GATE_DRAFTED (Adversarial Repair)` |
| Repair verdict | `RUNTIME003A_GATE_REPAIRED_READY_FOR_ADVERSARIAL_RECHECK` |

## 0. Repair disposition

The original Gate got the central crash-window fact right:

```text
canonical commit succeeds
→ crash before separate accepted ledger write
→ restart
→ retained turn_result.json can replay
```

A separate post-commit ledger alone is insufficient. A minimal acceptance witness must become durable in the same canonical `game_state.json` write that crosses the existing RUNTIME-002A Accepted boundary.

The adversarial review nevertheless found four real architecture gaps in the original Gate:

1. `alreadyAccepted` was defined semantically but not integrated with the actual boolean caller/fallback lifecycle.
2. restore/rewind paths had no timeline-fork identity, so a monotonic ledger could block valid alternate futures or disagree with restored canonical state.
3. normalized workspace path was too weak as durable campaign scope.
4. the design silently assumed one extension host / writer.

The repaired Gate keeps the original truthful Accepted boundary and two-layer durability idea, but replaces the weak parts with:

- explicit file-processing outcomes, not a collapsed boolean;
- durable replay-local `campaignInstanceId` + `timelineEpochId`;
- a chained accepted ledger across epochs;
- supported restore operations that rotate epoch without truncating history;
- strict canonical witness ownership through the state write choke point;
- a single-writer lease plus process-local single-flight serialization;
- whole-file atomic JSON retained for v1.

This repair does **not** implement anything and does **not** broaden into general runtime identity, provider identity, temporal transactions, or world-simulation redesign.

Where this document conflicts with `RUNTIME-003A-ARCHITECTURE-GATE.md`, this repair is authoritative.

---

# 1. Repository-grounded re-audit

## 1.1 Source drift since the original Gate

Between the original Gate commit and the repair intake/current repair baseline, the relevant runtime source did not change. The intervening changes are documentation/control artifacts and unrelated idea notes.

Therefore the original runtime path audit remains applicable, but the caller semantics and restore paths are repaired below.

## 1.2 Exact current TurnResult observation callers

Current normal observations converge on one processor:

```text
startGameStateWatcher()
├─ turn_result.json watcher onDidCreate
│  └─ 50 ms delay
│     └─ processTurnResultFileAt(path)
├─ turn_result.json watcher onDidChange
│  └─ 50 ms delay
│     └─ processTurnResultFileAt(path)
└─ startup sweep
   └─ processTurnResultFileAt(<workspace>/turn_result.json)

finishGmRun(..., success=true)
└─ 250 ms delay
   └─ checkPendingTurnResultFile()
      └─ processTurnResultFileAt(<workspace>/turn_result.json)
```

No current caller of `processTurnResultFileAt` dispatches a provider.

## 1.3 Exact current boolean semantics

Current `processTurnResultFileAt()` returns:

```text
true
= this invocation newly processed an Accepted non-duplicate TurnResult

false
= missing
  OR same-process duplicate
  OR read/parse exhaustion
  OR processTurnResult returned false
```

`checkPendingTurnResultFile()` passes that boolean through unchanged.

`finishGmRun()` then does:

```text
handled = await checkPendingTurnResultFile()

if handled OR pending lifecycle already cleared
    → stop
else
    → synthesizeTurnResultIfNeeded(prevState, playerAction)
```

Therefore the current boolean cannot safely represent durable `alreadyAccepted`.

If `alreadyAccepted` were collapsed to `false`, the fallback path may continue into direct-write synthesis. That may be correct for a stale old file while the current provider directly changed `game_state.json`, but it is not the same semantic as a retryable failure, a malformed file, or a repair-required authority conflict.

The Gate must preserve those distinctions.

## 1.4 Current pending lifecycle truth

Current lifecycle state is process-local:

```text
beginGmRun(callback)
→ pendingTurnResultFromGm = true
→ pendingAcceptedTurnCallback = callback
```

Only `markTurnResultHandled(acceptedTurn)` truthfully means:

```text
newly Accepted current-process TurnResult
→ pending false
→ callback detached
→ callback invoked under isolation
```

An old durable duplicate must not call it.

## 1.5 Current provider / Webview liveness truth

The adversarial intake's liveness concern is partly real and partly overstated.

For Grok, local LLM, custom command, VS Code LM, and agentic flows, provider completion independently sends:

```text
{ type: 'gmEnd', success: ... }
```

and clears busy/status state.

That occurs from the provider lifecycle, not from `processTurnResultFileAt()` returning true.

Therefore:

- an `alreadyAccepted` file outcome does **not** inherently leave the Webview permanently loading;
- the file processor does **not** resend the provider;
- the real blocker is ambiguous fallback/pending-callback behavior, not a proven UI deadlock.

## 1.6 Current restore/rewind truth

Supported history restore paths currently include:

- Undo last turn;
- rewind to a selected GM entry;
- checkpoint restore;
- regenerate last turn;
- Git Timeline branch-from-turn;
- Git Timeline branch switching.

The checkpoint/rewind paths rebuild `game_state.json` from historical `GameEntry` snapshots and use replace-style canonical writing. Checkpoint files contain history, not a full runtime replay identity.

Git Timeline checks out historical workspace files. `commitTurn()` tracks gameplay files including `game_state.json`, `game_history.json`, `world_state.json`, and others.

None of these current paths rotates a durable accepted-turn timeline identity.

No generic repository-managed `game_state.json.bak` restore path was found in the audited current restore code. Manual or external backup replacement must therefore be handled as detectable divergence at replay-guard preflight, not assumed to be a coordinated restore transaction.

## 1.7 Current world-state ordering truth

Before canonical `game_state.json` commit, `processTurnResult()` can already:

- call `persistWorldSimulationSteps()`;
- save `world_state.json` / NPC registry from simulation;
- apply and save reputation / quest / location-visit world changes.

The fresh-revision reapply path can also re-enter TurnResult application logic.

This is real, but it is not the accepted-restart replay problem RUNTIME-003A owns.

## 1.8 Current PROMPT-001C truth

PROMPT ACK is process-local and occurs only after:

```text
newly Accepted
→ Handled
→ exact immutable receipt correlation
```

The current contract explicitly refuses heuristic/latest-pending ACK recovery after restart.

A crash after Accepted and before ACK can therefore leave prompt context unconsumed.

That is a real residual durability gap, but replaying an old Accepted TurnResult must not fabricate or reconstruct ACK authority.

---

# 2. Adversarial finding reclassification

| Finding | Classification | Repository-grounded disposition |
|:---|:---|:---|
| `alreadyAccepted` UI/lifecycle deadlock | **CONFIRMED BLOCKER in caller semantics; UI-deadlock subclaim OVERSTATED** | boolean collapse is unsafe for fallback/pending lifecycle; provider `gmEnd` is independent, so permanent loading is not established |
| ACK loss after Accepted crash | **NON-BLOCKING for RUNTIME-003A; SEPARATE PROMPT durability concern** | canonical replay can be safe while receipt remains unconsumed; do not replay ACK without durable correlation |
| rewind/restore divergence | **CONFIRMED BLOCKER** | current restores change historical state with no replay timeline fork; ledger truncation would be unsafe |
| workspace-path scope bypass | **CONFIRMED BLOCKER** | move/rename/copy/alias/same-folder replacement make path identity unsuitable as durable campaign scope |
| world-state partial mutation | **SEPARATE TASK** | confirmed current behavior; RUNTIME-003A only suppresses already-Accepted cross-restart re-entry |
| whole-file JSON ledger performance | **INVALID / OVERSTATED as a blocker** | target is 100-turn reliability; validated atomic JSON is simpler and safer than introducing NDJSON tail repair/compaction now |
| export sanitization | **NON-BLOCKING / OVERSTATED as a current leak; REQUIRED REGRESSION HARDENING** | current Webview and official replay/archive exports do not serialize arbitrary root `game_state` metadata |
| two extension hosts / concurrent writers | **CONFIRMED BLOCKER** | current state queue and dedupe are process-local; two hosts can both observe and mutate the same campaign |
| ledger corruption / migration behavior | **REQUIRED HARDENING** | must fail closed with explicit recovery rules |
| moved/copied campaign semantics | **REQUIRED HARDENING** | repaired by durable replay-local campaign UUID + explicit clone/rebind semantics |
| canonical witness ownership | **REQUIRED HARDENING** | witness remains in `game_state.json` only as a commit-coupled crash bridge; set/preserve/clear authority must be centralized |

---

# 3. Repaired `alreadyAccepted` liveness contract

## 3.1 Boolean return is no longer sufficient

`processTurnResultFileAt()` must not return a boolean at the architecture boundary.

Required outcome type:

```ts
type TurnResultFileOutcome =
    | { kind: 'newlyAccepted'; identityHash: string; acceptedTurn: TurnResult }
    | { kind: 'alreadyAccepted'; identityHash: string; evidence: 'ledger' | 'canonicalWitness' }
    | { kind: 'missing' }
    | { kind: 'retryableFailure'; reason: string }
    | { kind: 'rejected'; reason: string }
    | { kind: 'quarantined'; reason: string; quarantinePath: string }
    | { kind: 'repairRequired'; reason: string }
    | { kind: 'writerConflict'; reason: string };
```

Exact TypeScript names may vary, but no caller may collapse these outcomes to boolean before lifecycle decisions.

## 3.2 Semantics of the four required classes

### `newlyAccepted`

Truth:

- canonical commit crossed RUNTIME-002A Accepted boundary now;
- full ledger append either succeeded or the canonical witness is the pending reconciliation authority;
- current process may run existing Handled/callback/success-only behavior.

Required behavior:

```text
lastProcessedTurnHash fast marker
→ markTurnResultHandled(acceptedTurn)
→ exact existing Accepted callback semantics
→ optional PROMPT ACK only through existing correlation
→ success-only effects
```

### `alreadyAccepted`

Truth:

- durable authority proves this identity was Accepted previously;
- no mutation occurred in this observation.

Required behavior:

- do not call `processTurnResult`;
- do not call `markTurnResultHandled`;
- do not fire or fabricate the Accepted callback;
- do not ACK;
- do not consume Chronicle/WCS;
- do not run world simulation;
- do not dispatch provider;
- do not run success-only media/UI/bootstrap effects;
- emit a replay-suppression trace event.

This is terminal for that file observation.

### `retryableFailure`

Truth:

- the TurnResult has not been proven Accepted;
- the file may become processable later.

Required behavior:

- do not commit accepted identity;
- do not synthesize over an existing retryable TurnResult;
- do not mark Handled;
- no callback/ACK;
- retain the file;
- allow bounded same-file recovery retries;
- after the bounded recovery window ends, clear any process-local pending callback/lifecycle rather than keeping it stuck forever;
- leave the durable file eligible for a future watcher/startup/manual retry.

### `rejected` / `quarantined`

Truth:

- automatic processing must not retry this exact observation without a material change or repair.

Required behavior:

- no mutation;
- no fallback synthesis over the rejected file;
- no callback/ACK;
- clear current pending lifecycle if this was the current run's terminal result;
- surface explicit diagnostics.

## 3.3 Caller behavior table

| Caller | newlyAccepted | alreadyAccepted | missing | retryableFailure | rejected/quarantined | repairRequired/writerConflict |
|:---|:---|:---|:---|:---|:---|:---|
| watcher | normal Accepted completion | trace no-op | no-op | leave retryable; future event may retry | stop for this file | disable mutation path / surface |
| startup sweep | normal Accepted completion | trace no-op | no-op | bounded startup recovery then retain | stop/quarantine | fail closed |
| fallback `checkPendingTurnResultFile` | current lifecycle is satisfied by real Accepted path | **not** current-run success; continue only direct-write diff fallback | continue direct-write diff fallback | do not synthesize; bounded same-file retry | clear pending/callback, no synthesize | clear/abort pending and fail closed |
| process-local duplicate fast path | no | same semantic as alreadyAccepted | n/a | n/a | n/a | n/a |

## 3.4 Exact `finishGmRun` repair

The fallback must consume the structured outcome.

Required logic:

```text
outcome = checkPendingTurnResultFile()

newlyAccepted:
    real Accepted path already detached current callback
    return

alreadyAccepted:
    do NOT mark Handled
    do NOT clear callback because of the duplicate alone
    if current pending run still exists:
        check only whether provider directly changed game_state
        if direct-write synthesis produces a new TurnResult:
            keep callback available for that new TurnResult's future real Accepted event
        else:
            clear pending lifecycle/callback as no current result
    return

missing:
    current direct-write synthesis fallback may run

retryableFailure:
    do NOT synthesize over it
    run bounded same-file recovery
    if exhausted:
        clear process-local pending lifecycle/callback
        keep file retryable for future observation

rejected/quarantined:
    clear pending lifecycle/callback
    do not synthesize

repairRequired/writerConflict:
    clear/abort pending lifecycle/callback
    block mutation until repaired
```

## 3.5 UI and provider verdict

`alreadyAccepted` does not need to send a fake `gmEnd`.

The provider lifecycle already sends `gmEnd` independently on provider completion.

No file-processing outcome is allowed to invoke `invokeGmBridge()` or resend the provider.

Therefore:

- **confirmed**: caller/fallback semantics needed repair;
- **not confirmed**: automatic permanent Webview loading deadlock;
- **not confirmed**: automatic provider resend.

## 3.6 Filesystem settlement

A durably proven `alreadyAccepted` result may safely settle the observation as a traceable no-op without deleting or renaming the file.

File cleanup is not acceptance authority.

RUNTIME-003A v1 does not require accepted-file archival. Leaving the file in place is safe because every future observation is checked durably before `processTurnResult()`.

---

# 4. Restore / rewind divergence repair

## 4.1 Why the original monotonic ledger is insufficient

A single campaign-wide ledger with identity `(scope, turnId, payloadHash)` creates a valid alternate-future problem:

```text
accept turn-20 payload A
→ rewind to turn-10
→ generate a new turn-20 payload B
```

If the ledger has no timeline fork:

- `turn-20` + B may be treated as a conflict;
- or old A may suppress valid alternate-future work;
- or truncating the ledger may re-enable old accepted files.

Automatic destructive truncation is forbidden.

## 4.2 Repaired narrow v1 contract: timeline epoch

RUNTIME-003A introduces a replay-local `timelineEpochId`.

It is not a general temporal checkpoint architecture.

The accepted identity becomes:

```text
campaignInstanceId
timelineEpochId
turnId
normalizedPayloadHash
```

A supported rewind/restore creates a new epoch.

Old ledger records remain immutable and are never truncated.

## 4.3 Supported restore fork ordering

All supported history/timeline mutation paths must use one replay-guard restore coordinator.

Required ordering:

```text
1. hold single-writer authority
2. pause/serialize TurnResult processing
3. if turn_result.json exists:
   atomically move it to runtime quarantine
   if quarantine fails → abort restore before state mutation
4. atomically rotate timelineEpochId
   - campaignInstanceId unchanged
   - new random UUID
   - parentEpochId = previous epoch
   - reason recorded
5. execute the existing restore/rewind/checkout operation
6. resume TurnResult processing
```

Epoch rotation occurs before state restoration.

If the process crashes after epoch rotation but before the requested state change completes, the result is a harmless extra fork at the old state. It is traceable and does not replay an Accepted turn.

## 4.4 Paths that must participate

Required supported fork reasons include:

- `undo-last-turn`;
- `rewind-to-turn`;
- `checkpoint-restore`;
- `regenerate-last-turn`;
- `git-branch-from-turn`;
- `git-switch-timeline-branch`;
- explicit manual replay-scope rebind/fork.

The current restore code cannot remain unaware of replay epoch.

## 4.5 Future accepted file after rewind

Attack:

```text
future Accepted turn_result.json remains on disk
→ rewind
→ new epoch
```

Required safe behavior:

- the restore coordinator quarantines the file before epoch rotation;
- if it cannot quarantine the file, the restore does not proceed;
- therefore an old future file cannot be reinterpreted under the new epoch.

## 4.6 Manual / external game_state replacement

Manual state replacement has no current coordinated restore callback.

RUNTIME-003A therefore does not guess.

At preflight, current-epoch ledger head and canonical witness must agree.

If active epoch already has accepted records and the canonical state is missing, behind, or inconsistent with that head:

```text
timelineDiverged
→ repairRequired
→ no TurnResult processing
```

The user/operator must explicitly rebind/fork or restore the matching runtime authority.

No ledger truncation occurs automatically.

## 4.7 Restore divergence decision table

| State attack | Required result | Automatic destructive action? | Reason |
|:---|:---|:---:|:---|
| A. old `game_state` + newer ledger, same active epoch | `repairRequired` | No | canonical state is behind accepted history |
| B. new `game_state` witness + old ledger, witness parent equals ledger head | repair ledger from witness, then continue | No | exact post-commit/pre-ledger crash proof |
| B2. new witness + old ledger, parent mismatch | `repairRequired` | No | cannot prove one-step crash window |
| C. both restored to different points | `repairRequired` | No | chain mismatch |
| D. witness missing after supported restore into fresh epoch with empty head | allowed | No | supported timeline fork |
| D2. witness missing in non-empty active epoch | `repairRequired` | No | uncoordinated divergence |
| E. future accepted file exists before supported rewind | quarantine file, then rotate epoch | No ledger truncation | prevents old future reinterpretation |
| foreign-epoch witness after supported fork | ignore as historical metadata while new epoch head is empty | No | epoch is authority |
| manual replacement before any accepted record in current epoch | allowed as new epoch base only if scope/ledger are otherwise consistent | No | no accepted head to contradict |

## 4.8 Git Timeline interaction

Replay runtime authority files must not be rolled backward by Git Timeline checkout.

Required location:

```text
.text-adventure/runtime/
```

Required Git policy:

- runtime authority directory must be Git-ignored;
- `commitTurn()` must not stage it;
- if runtime authority files are detected as already Git-tracked, timeline mutation must fail closed until repaired/untracked explicitly;
- do not silently `git rm --cached` user data.

Git checkout may restore an old `game_state.json` carrying an old-epoch witness. That witness is historical because the replay scope epoch was rotated before checkout.

---

# 5. ScopeKey reassessment

## 5.1 Original workspace-path scope verdict

**REJECTED as durable identity.**

Normalized path is not stable enough across:

- drive-letter case / path normalization;
- symlink or junction aliases;
- UNC aliases;
- folder rename;
- folder move;
- copied campaign folders;
- same-folder campaign replacement.

Path remains useful only as a location, never primary replay identity.

## 5.2 Option comparison

| Option | Move/rename | Alias resilience | Copy semantics | Same-folder replacement | Dependency size | Verdict |
|:---|:---|:---|:---|:---|:---|:---|
| A. workspace path | poor | poor | ambiguous | poor | low | reject |
| B. generated durable campaign UUID | strong | strong | explicit clone semantics needed | detectable/rebindable | low | chosen component |
| C. block on RUNTIME-001B | potentially strong | future-defined | future-defined | future-defined | high / unresolved | reject as dependency |
| D. hybrid replay-local UUID + epoch | strong | strong | explicit clone/fork semantics | explicit rebind | narrow | **chosen** |

## 5.3 Repaired durable replay scope

File:

```text
<workspace>/.text-adventure/runtime/accepted_turn_scope.json
```

Format:

```json
{
  "format": "lorerelay-accepted-turn-scope/1",
  "campaignInstanceId": "uuid-v4",
  "timelineEpochId": "uuid-v4",
  "createdAt": "ISO-8601",
  "epochCreatedAt": "ISO-8601",
  "parentEpochId": null,
  "epochReason": "initial"
}
```

Ownership:

- generated by LoreRelay host;
- atomic JSON replace + backup;
- never supplied by provider;
- never derived from path;
- never placed in prompt authority;
- never used as provider session identity.

## 5.4 Migration behavior

### Fresh/legacy campaign with no retained TurnResult

```text
scope missing
ledger missing
canonical replay witness missing
turn_result.json absent
→ atomically create campaignInstanceId + initial timelineEpochId
→ create empty ledger
```

### Legacy campaign with retained TurnResult

```text
scope missing
ledger missing
witness missing
turn_result.json present
→ legacyAmbiguous
→ fail closed
→ explicit operator classification/rebind required
```

The file might be unprocessed or already Accepted before RUNTIME-003A existed. Automatic application is unsafe.

### Scope exists, ledger missing

- no witness, no accepted history evidence → create empty ledger;
- current-epoch witness with `parentIdentityHash = null` → recover first ledger record from witness;
- witness parent non-null → `repairRequired`, because historical records are missing.

### Ledger exists, scope missing

`repairRequired`. Do not generate a new campaign UUID around an existing ledger.

## 5.5 Move, rename, alias, and copy semantics

### Folder move / rename

Scope file moves with campaign. Identity unchanged.

### Symlink / junction / UNC alias

Path alias does not change campaign identity.

### Full campaign folder copy

The copied runtime scope means the copy is initially a **clone of the same campaign lineage**.

This is deliberate, not an accidental new campaign.

If the user wants an independent campaign, an explicit rebind operation must:

1. hold writer authority;
2. quarantine pending `turn_result.json`;
3. generate a new `campaignInstanceId`;
4. generate a new `timelineEpochId`;
5. initialize a separate ledger.

No automatic UUID regeneration on folder copy.

### Same-folder campaign replacement

If gameplay state is replaced but runtime scope remains, same-epoch witness/ledger divergence must fail closed.

Explicit rebind is required.

### Two campaigns in one workspace root

Unsupported in v1. One replay scope owns one active LoreRelay campaign workspace.

## 5.6 RUNTIME-001B relationship

RUNTIME-003A does **not** block on RUNTIME-001B.

The generated UUID is narrowly owned by accepted-turn replay protection.

It is not declared the universal RuntimeContextKey.

Future RUNTIME-001B may reference, adopt, or migrate it only through its own reviewed contract.

---

# 6. Repaired durable identity contract

## 6.1 Normalized TurnResult payload

Parse JSON first.

For identity canonicalization, remove only host-added post-application fields:

```text
beforeHash
afterHash
appliedAt
```

Keep all source-delivered fields, including `promptReceipt` when present.

Canonical serialization:

1. recursively sort object keys lexicographically;
2. preserve array order;
3. preserve parsed string values exactly;
4. deterministic JSON serialization;
5. UTF-8 bytes.

```text
payloadHash = SHA-256(canonicalSourceTurnResult)
```

## 6.2 Primary identity

```text
identityHash = SHA-256(
    "LoreRelayAcceptedTurn/v1\0"
    + campaignInstanceId + "\0"
    + timelineEpochId + "\0"
    + turnId + "\0"
    + payloadHash
)
```

Authoritative tuple:

```text
(campaignInstanceId, timelineEpochId, turnId, payloadHash)
```

## 6.3 Same-turn conflict rule

Within one campaign + epoch:

```text
same turnId
+ different payloadHash
→ conflict
→ quarantine / reject automatic mutation
```

Across a new timeline epoch, the same turnId may validly be reused for an alternate future.

## 6.4 Logical acceptance chain

Each accepted record also has:

```text
parentIdentityHash = current ledger head for this epoch
```

The first accepted turn in an epoch uses `null`.

The canonical witness and ledger record must carry this parent.

This turns the post-commit witness into a one-step reconciliation proof rather than an unqualified “latest object”.

---

# 7. Canonical witness ownership repair

## 7.1 Is `game_state.json` still the right location?

**Yes, but only for the minimal crash-window witness.**

A second independent witness file would recreate the same two-write window:

```text
commit game_state
→ crash
→ witness file never written
```

The same-file witness remains the narrowest way to prove Accepted across an immediate process crash without designing a broader transaction manager.

The full history does not live in `game_state.json`.

## 7.2 Witness shape

```json
{
  "runtimeAcceptedTurn": {
    "format": "lorerelay-accepted-turn-witness/1",
    "campaignInstanceId": "uuid",
    "timelineEpochId": "uuid",
    "identityHash": "sha256",
    "parentIdentityHash": null,
    "turnId": "turn-42",
    "payloadHash": "sha256",
    "acceptedAt": "ISO-8601"
  }
}
```

No raw narrative, prompt text, token payload, or receipt token belongs in the witness.

## 7.3 Ownership rules

`runtimeAcceptedTurn` is host-owned runtime metadata.

Required rules:

1. AI `statePatch` cannot write it.
2. Webview/user semantic patch handlers cannot write it.
3. Ordinary canonical state commits preserve the current disk witness and ignore any incoming attempt to replace it.
4. Only the accepted-turn commit API may install a new witness.
5. Only a coordinated timeline restore/rebind path may intentionally clear or supersede current-epoch witness authority.
6. Replay guard separately validates witness structure; gameplay validation must not blindly trust unknown root metadata.
7. An invalid/malformed witness is never repaired into ledger authority.

## 7.4 State write choke-point repair

The ordinary `commitGameState()` API is not sufficient as the only authority surface because merge profiles and external full-state inputs can carry/drop arbitrary root fields.

Required state-manager separation:

```text
ordinary commit
→ preserve validated existing disk witness
→ ignore incoming runtimeAcceptedTurn authority

accepted-turn commit
→ merge gameplay state
→ install the prepared host witness into final persisted payload
→ atomic canonical write

coordinated restore/rebind commit
→ explicit host-authorized witness handling for the new epoch
```

Exact function names may differ, but host witness set/preserve/clear authority must be centralized in the state write choke point.

## 7.5 Current attack surfaces

### `statePatch`

Current allowed gameplay roots do not include `runtimeAcceptedTurn`.

Result: AI patch authority is already naturally excluded.

### direct external `game_state.json` writes

A custom GM can physically overwrite the whole file.

RUNTIME-003A cannot pretend that did not happen.

Required response:

- ordinary host commits preserve the last valid host witness where possible;
- direct-write fallback must never accept provider-supplied witness as authority;
- if external replacement drops/rewinds current-epoch witness while ledger has a head, next replay preflight returns `repairRequired`.

### Webview path

Current Webview state sanitization is whitelist-only and does not include `runtimeAcceptedTurn`.

### official replay/archive export

Current replay/archive exports are built from history, Chronicle/journal-derived data, and explicit public fields rather than arbitrary `game_state` root serialization.

Therefore no current official export leak is established.

Required regression rule: keep the witness excluded.

## 7.6 Witness/ledger reconciliation rules

For the active epoch:

```text
witness identity == ledger head
→ consistent

witness not in ledger
AND witness.parentIdentityHash == ledger head
→ exact one-step post-commit/pre-ledger crash
→ append witness record to ledger

witness identity exists in ledger but is behind current head
→ timeline divergence
→ repairRequired

witness not in ledger
AND parent does not equal ledger head
→ repairRequired

witness missing
AND active epoch head is non-null
→ repairRequired

witness missing
AND active epoch head is null
→ allowed

witness belongs to prior epoch
AND active epoch head is null
→ historical witness after supported fork; not active authority
```

No automatic ledger truncation.

---

# 8. Truthful write boundary and repaired ordering

## 8.1 Accepted boundary remains unchanged

RUNTIME-002A remains authoritative:

```text
validate canonical commit state
→ commit accepted-turn game state succeeds
→ Accepted
```

Secondary ledger, accepted-history ledger, journal, callback, ACK, media, and UI do not define Accepted.

## 8.2 Exact repaired ordering

```text
WRITER AUTHORITY
1. require single-writer lease
2. enter process-local TurnResult single-flight queue

OBSERVATION
3. read file
4. raw hash for diagnostics/fast same-process path
5. parse TurnResult
6. build normalized payloadHash
7. load replay scope
8. build campaign+epoch identity

DURABLE PREFLIGHT
9. validate scope / ledger / backup
10. validate canonical witness
11. reconcile exact one-step witness-ahead crash if allowed
12. decide outcome
    - alreadyAccepted → stop before processTurnResult
    - conflict/quarantine → stop
    - repairRequired → stop/fail closed
    - unseen → continue

CANONICAL APPLY
13. capture current epoch ledger head as parentIdentityHash
14. run current TurnResult preparation/application path
15. build minimal host witness
16. validate gameplay state and witness separately
17. accepted-turn canonical commit writes gameplay mutation + witness atomically
18. commit failure → retryableFailure / not Accepted
19. commit success → Accepted

FIRST POST-ACCEPTED REPLAY-DURABILITY ACTION
20. append immutable full record in memory
21. atomic replace accepted_turn_ledger.json with backup
22. if ledger write fails:
    - Accepted remains true
    - witness remains one-step ahead
    - no newer unseen turn may be accepted until reconciliation succeeds

EXISTING POST-ACCEPTED PATH
23. existing isolated secondary ledger / journal behavior
24. truthy Accepted result returns
25. process-local raw hash commits
26. markTurnResultHandled
27. exact current callback / optional PROMPT ACK
28. success-only effects
```

The implementation may place the full accepted-ledger write immediately after the canonical commit before existing secondary-ledger work, because it is the first replay-durability action. This does not redefine Accepted.

---

# 9. Crash-window table

RUNTIME-003A guarantees durable suppression of an already-Accepted TurnResult. It does not guarantee a global multi-file transaction.

| Crash point | Canonical game_state | Witness | Accepted ledger | Restart behavior | Retry? | Duplicate canonical Accepted mutation? |
|:---|:---|:---|:---|:---|:---:|:---:|
| before TurnResult processing | unchanged | prior | prior | normal observation | Yes if unseen | No prior Accepted claim |
| before canonical commit | old | old/prior | prior | unseen identity remains retryable | Yes | No Accepted duplicate; pre-commit side-effect caveat remains |
| during canonical atomic write | old or new | old or new with same atomic result | prior | old→retry; new→witness reconciliation | Conditional | No under current process-crash atomic replace model |
| immediately after commit, before ledger | new | new witness, parent=head | old head | append witness as exact one-step repair; alreadyAccepted | No | No |
| during ledger replace | new | new | old primary/new primary/temp/backup | recover valid ledger/backup then reconcile witness | No | No |
| after ledger, before Handled/callback | new | new | new head | alreadyAccepted after restart | No | No; ACK may be lost |
| after Handled before ACK | new | new | new | alreadyAccepted after restart | No | No; ACK may be lost |
| after ACK before file cleanup | new | new | new | alreadyAccepted | No | No |
| after cleanup | new | new | new | restored old file still suppresses via ledger | No | No |

## 9.1 Post-commit/pre-ledger verdict

The repaired witness chain closes this window for accepted replay:

```text
ledger head = P
→ canonical commit writes witness C(parent=P)
→ crash
→ restart sees ledger head P + witness C(parent=P)
→ append C
→ duplicate no-op
```

A witness with any other parent relationship is not auto-repaired.

## 9.2 Atomicity limitation

The design inherits the repository's existing temp-write + rename process-crash model.

It does not add `fsync` / directory-fsync power-loss guarantees.

---

# 10. World-state / partial-commit separation

## 10.1 What RUNTIME-003A prevents

For a durably known Accepted identity:

```text
restart observation
→ durable preflight
→ alreadyAccepted
→ processTurnResult is never entered
```

Therefore the already-Accepted duplicate cannot re-run:

- canonical game-state mutation;
- `persistWorldSimulationSteps()`;
- world-state reputation/quest/location mutations;
- optimistic reapply logic;
- post-commit secondary ledger attempts.

## 10.2 What RUNTIME-003A does not prevent

Before canonical Accepted, current code can already persist world state.

A pre-commit failure may therefore leave world/subsystem mutation that a retry can encounter again.

Current optimistic reapply can also re-enter simulation logic within one processing attempt.

RUNTIME-003A does not solve:

- transactional world/game-state commit;
- rollback of pre-commit world mutation;
- optimistic reapply double world simulation;
- global exactly-once across secondary ledgers.

## 10.3 Classification

`CHATGPT-20260706-002` remains a separate issue.

It is **not a blocker for RUNTIME-003A's narrower accepted-restart replay contract**.

However the implementation touch sets overlap in `src/statePatch.ts` and runtime tests.

They must not be implemented concurrently under the repository same-touch-set rule.

---

# 11. ACK residual-risk verdict

## 11.1 Exact crash

```text
canonical Accepted commit succeeds
→ accepted witness durable
→ accepted ledger may or may not complete
→ process crashes before PROMPT ACK
→ restart
→ retained TurnResult is alreadyAccepted
→ duplicate suppressed
→ no callback reconstruction
→ no ACK replay
```

## 11.2 Result

Safe:

- canonical mutation does not repeat;
- world simulation does not repeat from the duplicate;
- Chronicle/WCS are not double-consumed;
- no guessed receipt authority is created.

Residual:

- the original delivered receipt may remain unconsumed;
- Chronicle/WCS context may be eligible for delivery again in a later prompt;
- the player may see repeated context rather than duplicate canonical mutation.

## 11.3 Classification

**NON-BLOCKING KNOWN LIMITATION for RUNTIME-003A.**

If the product later requires durable “Accepted-but-ACK-not-complete” recovery, that needs a separate PROMPT durability contract with durable receipt correlation.

RUNTIME-003A must not solve it by:

- latest receipt lookup;
- dummy callback;
- fake `alreadySatisfied` ACK;
- reconstructing selected tokens heuristically.

---

# 12. Ledger format reassessment

## 12.1 Options

| Format | Crash behavior | Validation/recovery | Concurrent writers | 100–1000 turns | Debuggability | Compaction | Verdict |
|:---|:---|:---|:---|:---|:---|:---|:---|
| A. whole-file atomic JSON replace | simple primary/backup model | strongest/simple | requires single writer | good | excellent | none needed v1 | **chosen** |
| B. append-only NDJSON | partial tail possible | tail repair required | still unsafe without lock | good | good | eventually needed | reject for v1 |
| C. bounded JSON ledger | simple | simple | still needs lock | good | good | implicit eviction | reject: old replay becomes possible |
| D. witness + recent cache only | small | simple | still needs lock | good | medium | none | reject: restored old files can replay |

## 12.2 Chosen paths

```text
.text-adventure/runtime/accepted_turn_scope.json
.text-adventure/runtime/accepted_turn_ledger.json
.text-adventure/runtime/accepted_turn_ledger.json.bak
.text-adventure/runtime/writer_lease.json
.text-adventure/runtime/quarantine/
```

## 12.3 Ledger shape

```json
{
  "format": "lorerelay-accepted-turn-ledger/1",
  "campaignInstanceId": "uuid",
  "records": [
    {
      "identityHash": "sha256",
      "parentIdentityHash": null,
      "timelineEpochId": "uuid",
      "turnId": "turn-1",
      "payloadHash": "sha256",
      "acceptedAt": "ISO-8601",
      "rawFileHash": "optional sha256",
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

The chain head for an epoch is derived from records or maintained as validated redundant metadata. Records are logically immutable.

## 12.4 Write strategy

```text
load validated ledger
→ validate chain
→ append one immutable record in memory
→ writeJsonAtomic(target, nextLedger, createBackup=true)
```

Do not append in place.

## 12.5 Corruption recovery

1. validate primary structure, campaign ID, record identity, parent chains, duplicate IDs, same-epoch turn conflicts;
2. if invalid, validate `.bak`;
3. if backup valid, restore/rewrite primary atomically;
4. reconcile current canonical witness only if it is exactly one step ahead of the recovered epoch head;
5. if primary and backup are invalid, `repairRequired`;
6. do not silently rebuild acceptance authority from `state_journal.ndjson`.

## 12.6 Retention and scale

v1 is unbounded.

No silent eviction, no compaction.

The design target is hundreds to low thousands of accepted turns, where whole-file JSON is acceptable and much easier to inspect and validate.

A future compaction task must preserve replay proof and is not part of this Gate.

## 12.7 Windows locking

Existing atomic rename has bounded retry behavior for transient Windows locks.

If accepted-ledger replacement still fails after canonical Accepted:

- witness remains the crash bridge;
- the next unseen turn is blocked until reconciliation succeeds;
- Accepted is not revoked.

---

# 13. Two extension hosts / concurrent writers

## 13.1 v1 support verdict

**Concurrent writers are unsupported.**

The implementation must detect and fail closed.

It is not acceptable for two VS Code extension hosts to both process or dispatch GM turns for one campaign silently.

## 13.2 Why current code is unsafe

Current protections are process-local:

- `lastProcessedTurnHash`;
- state queue serialization;
- watcher timers;
- pending callback state.

Two hosts can each:

- observe the same file;
- see their own empty dedupe memory;
- call canonical/world mutation;
- maintain separate pending lifecycle state.

## 13.3 Required single-writer lease

Runtime file:

```text
.text-adventure/runtime/writer_lease.json
```

Required behavior:

- campaign mutation host acquires exclusive lease before TurnResult watcher/startup processing or provider dispatch;
- second live host cannot acquire and enters `writerConflict` fail-closed mode;
- read-only state display may continue;
- TurnResult processing and provider dispatch are disabled without writer authority.

A practical v1 lease may use:

- exclusive create (`wx`) for initial acquisition;
- random `hostId`;
- PID + hostname for same-machine stale detection;
- heartbeat/expiry for crash recovery;
- atomic stale-lease takeover after expiry/dead-owner proof;
- release only when `hostId` matches.

Exact timeout constants are implementation details, but silent concurrent ownership is forbidden.

Network/shared-filesystem perfect locking is not promised by v1. If ownership cannot be proved, fail closed.

## 13.4 Same-process races

Even with a host lease, startup sweep + watcher + fallback can race in one process.

All `processTurnResultFileAt` work must pass through one process-local single-flight queue/mutex covering:

```text
identity preflight
→ canonical apply
→ witness commit
→ accepted ledger update
```

A second observation waits, then sees `alreadyAccepted`.

## 13.5 Provider dispatch gate

`invokeGmBridge()` or its common pre-dispatch boundary must require writer authority before:

- writing dice/prompt work files that drive a campaign turn;
- `beginGmRun`;
- provider invocation.

This is a guard check only, not a provider architecture redesign.

---

# 14. Repaired startup / observation decision table

| Condition | Outcome | Mutation? | Fallback synthesis? | Callback/ACK? | Next action |
|:---|:---|:---:|:---:|:---:|:---|
| no writer lease | `writerConflict` | No | No | No | fail closed |
| no TurnResult file | `missing` | No | only current GM direct-write fallback | No | no-op/start fallback |
| malformed during bounded write window | `retryableFailure` | No | No | No | bounded retry |
| malformed after retry exhaustion | `quarantined` or `rejected` | No | No | No | preserve evidence |
| scope/ledger corrupt, recoverable backup | internal recover then continue | No until recovered | No | No | restore backup |
| scope/ledger authority unrecoverable | `repairRequired` | No | No | No | fail closed |
| exact identity is epoch ledger head/history | `alreadyAccepted` | No | stale-file direct-write fallback only if current pending run exists | No | trace no-op |
| current witness exactly one step ahead of ledger | repair ledger then `alreadyAccepted` | No | same as above | No | trace recovery |
| same epoch + same turnId + different payload | `quarantined` | No | No | No | explicit conflict |
| active epoch ledger head ahead of/mismatched with canonical witness | `repairRequired` | No | No | No | timeline divergence |
| unseen valid identity | process | Yes if commit succeeds | n/a | only after newlyAccepted | normal apply |
| canonical validation/commit false | `retryableFailure` | no Accepted | No synthesis over file | No | leave retryable |
| canonical commit succeeds, ledger succeeds | `newlyAccepted` | Yes once | No | normal existing callback path | normal completion |
| canonical commit succeeds, ledger fails | `newlyAccepted` + unreconciled witness state | Yes once | No | current-process Accepted callback may continue | block next unseen turn until reconcile |
| legacy no scope/ledger + retained file | `repairRequired` (`legacyAmbiguous`) | No | No | No | operator decision |

---

# 15. Repaired restore divergence table

| Scenario | Active epoch state | Canonical witness | Ledger state | Verdict |
|:---|:---|:---|:---|:---|
| normal current state | E | head H | E head H | consistent |
| post-commit crash | E | C parent=H | E head H | append C, suppress duplicate |
| old state restored without epoch fork | E | old/missing | E head newer | `repairRequired` |
| new state + accidentally old ledger | E | C parent=H | E head H | one-step repair |
| new state + unrelated old ledger | E | C parent≠head | mismatched | `repairRequired` |
| supported checkpoint/rewind fork | E2 | missing or historical E1 witness | E2 head null | allowed |
| supported fork after one new accept | E2 | head N | E2 head N | consistent |
| future file left during supported restore | restore must abort before epoch rotation if quarantine fails | n/a | n/a | never reinterpret automatically |
| manual same-folder campaign replacement | unchanged E | missing/foreign | E has history | `repairRequired`; explicit rebind |
| full folder clone | copied campaign ID + epoch + ledger | copied | copied | same lineage clone; explicit rebind for independent campaign |

---

# 16. Implementation touch set

## 16.1 MUST CHANGE

### New: `src/acceptedTurnReplayGuardCore.ts`

Pure responsibilities:

- TurnResult source normalization;
- deterministic canonical serialization;
- identity/hash input construction;
- scope/ledger/witness validation;
- parent-chain validation;
- same-epoch turn conflict detection;
- startup/preflight decision logic;
- restore-divergence decision logic.

### New: `src/acceptedTurnReplayGuard.ts`

Workspace responsibilities:

- runtime directory paths;
- scope bootstrap/migration;
- campaign UUID and epoch persistence;
- ledger primary/backup load;
- atomic ledger replace;
- witness reconciliation;
- restore epoch fork coordinator;
- pending TurnResult quarantine;
- single-writer lease;
- process-local single-flight queue;
- trace/debug events.

### `src/gameStateSync.ts`

- replace boolean processor outcome with structured outcome;
- run durable preflight before `processTurnResult`;
- startup/watcher caller handling;
- no Handled/callback/success effects for `alreadyAccepted`;
- writer authority integration.

### `src/turnResultFallback.ts`

- accept structured `checkPendingTurnResultFile` outcome;
- exact fallback behavior per liveness table;
- bounded retryable-failure handling;
- never treat old duplicate as current Accepted;
- never synthesize over retryable/rejected authority.

### `src/statePatch.ts`

- accept prepared replay identity context;
- build witness using current epoch ledger head;
- use accepted-turn canonical commit path;
- make accepted ledger update the first replay-durability action after commit;
- preserve existing Accepted boundary;
- no world-simulation redesign.

### `src/stateManager.ts`

- centralize host witness ownership;
- ordinary commit preserves valid existing witness and ignores incoming authority attempts;
- accepted-turn commit installs witness in final persisted payload;
- coordinated restore/rebind authority is explicit.

### `src/checkpointHandlers.ts`

Before supported Undo/Rewind/Checkpoint/Regenerate state mutation:

- acquire writer authority;
- quarantine pending TurnResult;
- rotate epoch;
- then run existing restore.

### `src/gitManager.ts`

- runtime directory Git-ignore policy;
- fail closed if runtime authority is Git-tracked;
- rotate epoch/quarantine before timeline checkout/branch mutation;
- do not stage runtime replay authority.

### `src/gmBridgeRunner.ts`

Only narrow change:

- require replay writer authority at common provider-dispatch boundary.

No provider session/receipt redesign.

### Focused test

`script/test_runtime_accepted_replay_guard.js` or repository-standard plural `scripts/test_runtime_accepted_replay_guard.js`.

Use repository naming convention at implementation time; only one focused suite is required.

### `scripts/run_all_tests.js`

Register focused test only.

## 16.2 MAY CHANGE

- `src/types/GameState.ts` for witness type only;
- `src/workspacePaths.ts` for runtime directory helpers only;
- existing `scripts/test_runtime_turn_result_acceptance.js` for narrow RUNTIME-002A regressions;
- command registration only if an explicit replay-scope rebind/repair command is required for migration usability.

## 16.3 MUST NOT CHANGE

- `src/gmPromptBuilder.ts` ACK semantics;
- `src/promptReceiptCore.ts`;
- PROMPT-001C selected-token/receipt contract;
- provider session identity architecture;
- RUNTIME-001B general RuntimeContextKey architecture;
- `worldSimPersist.ts`;
- optimistic reapply algorithm;
- world simulation business logic;
- secondary ledger business logic;
- checkpoint data model beyond calling the replay fork coordinator;
- broad Webview UX;
- remote-play authority architecture;
- TEMP-001B/C transaction architecture.

---

# 17. Required executable tests

All tests must be behavior-based and load-bearing.

## 17.1 Outcome / liveness tests

1. `newlyAccepted` invokes canonical apply once, Handled once, callback once.
2. `alreadyAccepted` invokes none of apply, Handled, callback, ACK, media, bootstrap.
3. startup `alreadyAccepted` is a terminal no-op.
4. watcher `alreadyAccepted` does not retry provider.
5. active pending GM run + stale `alreadyAccepted` file does not satisfy callback.
6. active pending GM run + stale duplicate + direct game_state change may run the existing independent synthesis fallback.
7. active pending run + stale duplicate + no direct state change clears lifecycle without fake Accepted callback.
8. `retryableFailure` does not synthesize over the file.
9. bounded retry exhaustion clears process-local pending callback but leaves file retryable for later startup.
10. rejected/quarantined outcome never synthesizes.

## 17.2 Restart replay tests

11. same-process duplicate suppressed.
12. accepted file retained across module reload/restart suppressed.
13. actual startup sweep path suppresses retained accepted file.
14. copied same payload to another path in same campaign+epoch suppressed.
15. whitespace/key-order-only JSON change remains duplicate by normalized payload.
16. same epoch same turnId changed payload quarantined.

## 17.3 Post-commit crash tests

17. inject crash immediately after canonical commit before ledger write.
18. restart sees witness parent equal old head.
19. ledger repairs exactly one record.
20. retained file becomes `alreadyAccepted`.
21. canonical apply count remains one.
22. no second world simulation call.

Mutation sanity:

- remove commit-coupled witness → this test must fail;
- allow arbitrary witness parent repair → mismatch attack must fail.

## 17.4 Ledger corruption tests

23. corrupt primary + valid backup recovers.
24. corrupt primary + corrupt backup fails closed.
25. duplicate identity records fail validation.
26. broken parent chain fails validation.
27. same epoch same turnId conflicting payloads fail validation.
28. witness one step ahead repairs.
29. witness two/unrelated steps ahead fails closed.
30. witness behind current head fails closed.

## 17.5 Restore / rewind tests

31. Undo rotates epoch before restore.
32. rewind-to-turn rotates epoch.
33. checkpoint restore rotates epoch.
34. regenerate rotates epoch before new provider dispatch.
35. Git branch-from-turn rotates epoch before checkout.
36. Git branch switch rotates epoch before checkout.
37. old ledger records remain; no truncation.
38. same turnId is valid in a new epoch.
39. retained future TurnResult is quarantined before epoch rotation.
40. quarantine failure aborts restore before state mutation.
41. manual old game_state + new same-epoch ledger becomes repairRequired.
42. new witness + old ledger repairs only when parent=head.
43. both restored to different points fail closed.

## 17.6 Campaign scope tests

44. folder path rename does not change campaign identity.
45. path case/alias does not define identity.
46. full copied runtime folder preserves clone lineage.
47. explicit rebind creates new campaignInstanceId and epoch.
48. Campaign A ledger cannot suppress Campaign B with another campaignInstanceId.
49. same-folder state replacement without rebind produces divergence when history exists.
50. two campaigns in one workspace are rejected/unsupported.

Mutation sanity:

- replace UUID with path-derived scope → move/rename tests must fail.
- remove epoch from identity → alternate-future same-turn test must fail.

## 17.7 Witness ownership tests

51. AI `statePatch` cannot write witness root.
52. ordinary state commit preserves valid disk witness.
53. incoming ordinary state payload cannot overwrite witness.
54. accepted-turn commit can install a new witness.
55. malformed witness is not accepted as authority.
56. direct full-state replacement that removes current witness causes divergence when active epoch has head.
57. Webview payload excludes witness.
58. replay export excludes witness.
59. saga HTML export excludes witness.

## 17.8 ACK / consumption tests

60. first lifetime newlyAccepted may ACK once under exact existing correlation.
61. restart duplicate does not ACK.
62. restart duplicate does not consume Chronicle/WCS.
63. crash after Accepted before ACK leaves no reconstructed callback.
64. duplicate suppression still occurs despite unconsumed receipt.
65. new pending callback is never satisfied by old duplicate.

## 17.9 Concurrent writer tests

66. first host acquires writer lease.
67. second live host receives writerConflict.
68. second host cannot register mutation-capable TurnResult processing.
69. second host cannot dispatch provider.
70. stale/dead same-machine lease can be recovered according to lease contract.
71. release by wrong hostId fails.
72. startup sweep + watcher race serializes to one accept.
73. watcher + fallback race serializes to one accept.

Mutation sanity:

- bypass lease check → two-host test must fail;
- bypass single-flight queue → watcher/fallback race test must fail.

## 17.10 Migration tests

74. no scope/ledger/file → initializes cleanly.
75. no scope/ledger + retained file → legacyAmbiguous fail closed.
76. scope + no ledger + first-turn witness parent null → recover.
77. scope + no ledger + witness parent non-null → repairRequired.
78. ledger + no scope → repairRequired.
79. runtime authority detected as Git-tracked → timeline operation fails closed.

## 17.11 RUNTIME-002A regression tests

80. pre-commit failure remains retryable.
81. failed canonical apply is never durably accepted.
82. Accepted boundary remains canonical commit success.
83. post-commit secondary/journal failure cannot revoke Accepted.
84. same-process newly Accepted ordering remains commit → dedupe → Handled → callback.

---

# 18. Unresolved limitations

1. RUNTIME-003A is not a global multi-file exactly-once transaction.
2. Pre-commit `world_state` / NPC / related mutation remains possible.
3. Optimistic reapply double simulation remains `CHATGPT-20260706-002`.
4. Crash after Accepted before PROMPT ACK can leave delivered context unconsumed.
5. RUNTIME-003A deliberately does not reconstruct durable ACK authority.
6. Concurrent writers are unsupported; v1 detects/fails closed rather than supporting them.
7. Network/shared-filesystem lease semantics are best-effort; inability to prove ownership fails closed.
8. Full campaign folder copies are clone lineage until explicit rebind.
9. Two independent campaigns inside one workspace root are unsupported.
10. Manual state replacement without coordinated epoch fork can require explicit repair.
11. Primary + backup ledger corruption fails closed; journal is not promoted to acceptance authority.
12. Ledger is unbounded and uncompacted in v1.
13. Existing atomic rename is a process-crash model, not a power-loss fsync protocol.
14. A malicious actor with unrestricted filesystem authority can alter runtime files; this Gate protects application/runtime mistakes, replay, crashes, and ordinary provider authority boundaries, not hostile host compromise.
15. The replay-local campaign UUID is not the future universal RUNTIME-001B RuntimeContextKey.

---

# 19. Repaired final contract

Implementation is authorized only if all of these remain true:

1. An already-Accepted identity is stopped before `processTurnResult()`.
2. `processTurnResultFileAt` exposes explicit outcomes; no fallback decision uses collapsed boolean semantics.
3. `alreadyAccepted` never calls Handled, Accepted callback, ACK, consumption, provider dispatch, world simulation, or success-only effects.
4. Provider/Webview lifecycle remains separate; no fake `gmEnd` or provider resend is added.
5. Durable identity is `(campaignInstanceId, timelineEpochId, turnId, normalizedPayloadHash)`.
6. Workspace path is not identity.
7. Supported restore/rewind operations quarantine pending TurnResult and rotate epoch before state mutation.
8. Accepted history is never automatically truncated on rewind.
9. Same turnId may validly recur only in a new epoch.
10. The canonical witness is written in the same atomic `game_state` commit as Accepted mutation.
11. Accepted remains exactly canonical commit success.
12. Witness set/preserve/clear authority is centralized in the state write choke point.
13. Witness reconciliation is allowed only as an exact one-step parent-chain advance over ledger head.
14. Full history is a validated whole-file atomic JSON ledger with backup.
15. A witness/ledger divergence that is not exact one-step repair fails closed.
16. No newer unseen turn may overwrite an unreconciled accepted witness.
17. One live writer owns a campaign; competing hosts fail closed.
18. Startup/watcher/fallback processing is process-local single-flight.
19. PROMPT ACK is never reconstructed from `alreadyAccepted`.
20. World-state partial mutation and optimistic reapply remain separate issues.

## Final Verdict

`RUNTIME003A_GATE_REPAIRED_READY_FOR_ADVERSARIAL_RECHECK`
