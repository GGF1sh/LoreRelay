# RUNTIME-003A Reverify Fail Intake

Status: `IMPLEMENTING (Second Verification Repair)`
Date: 2026-07-06 JST

Source reverify commit:
`6f2a522df9c5564acbe99ed53a764f2b362a00e6`

Repair source reviewed:
`1c988abb3e6228608dcc86ced1502b93a886aa9b`

Final verdict:
`RUNTIME003A_REVERIFY_FAIL`

## Closed

- `R3A-V2` epoch-safe raw hash is closed.
- Narrow restart replay suppression remains PASS.
- Fallback lifecycle remains PASS.
- World-state separation remains PASS.

## Remaining blockers

### R3A-V1 — witness semantic authority

- Canonical witness `identityHash` is not recomputed before one-step repair.
- Structurally valid forged witness can be promoted into ledger authority.
- Git Timeline witness clear bypasses the `stateManager` choke point.
- Campaign rebind leaves old witness/ledger authority behind.

### R3A-V3 — epoch reconciliation / legacy ambiguity

- Accepted write uses global ledger head as parent while repair uses active-epoch head.
- First Accepted turn in a new epoch can become unrecoverable after post-commit/pre-ledger crash.
- Canonical witness is not identity-self-validated.
- Provider-side `ensureAcceptedTurnScope()` can create scope before preflight and erase the missing-scope + retained-file ambiguity condition.
- Rebind changes scope IDs without separating old ledger authority.

### R3A-V4 — writer lease

- `processStartedAt` is recorded but not used to distinguish PID reuse.
- Stale takeover is not CAS-safe; competing recoverers can remove each other's newly acquired lock.
- Crash after lock-directory creation but before lease write creates an orphan lock with no automatic recovery.

### R3A-V5 — restore isolation

- Single-flight is held only during restore preparation, not through the actual restore mutation.
- After preparation releases the queue, watcher/fallback TurnResult processing can race with history mutation, canonical restore write, `git checkout`, and witness clear.
- Async Git Timeline restore has an explicit race window.

## Required next repair discipline

Do not reopen R3A-V2.
Do not broaden into CHATGPT-20260706-002.
Do not redesign the whole system.
Repair only the four remaining blocker groups and add behavior tests that fail if each repair is removed.
