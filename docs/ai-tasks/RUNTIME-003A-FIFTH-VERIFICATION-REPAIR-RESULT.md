# RUNTIME-003A Fifth Verification Repair Result

Date: 2026-07-07 JST

Branch: `task/RUNTIME-003A-durable-replay-guard`

Repair base: `78d8ac210f7f7d2055a5b2978fe03b20a941d568`

Current `origin/main`: `fc0fedeecd62a81698e4995a7812721c60597860`

Read:

- `docs/ai-tasks/RUNTIME-003A-FOURTH-REVERIFY-RESULT.md`
- `docs/ai-tasks/RUNTIME-003A-FINAL-EXTERNAL-FAIL-INTAKE.md` from `origin/main` because it was not present on the task branch at repair start.

## Scope

Implemented only the recorded Fifth Verification Repair items:

1. Multi-workspace heartbeat singleton bug.
2. Workspace-scoped release isolation.
3. Malformed capture failure lock cleanup validation and targeted cleanup.

Closed RUNTIME-003A areas were not redesigned.

## Changed Files

- `src/acceptedTurnReplayGuard.ts`
- `scripts/test_runtime_accepted_replay_guard.js`
- `docs/ai-tasks/RUNTIME-003A-FIFTH-VERIFICATION-REPAIR-RESULT.md`

Existing EOL-only dirty build artifacts were not part of the repair:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

## Multi-Workspace Heartbeat Repair

Verdict: repaired.

The process still uses one timer, but the timer no longer captures only the first workspace. It now maintains a workspace-keyed registry:

```text
resolved workspace path -> workspace path + writer lock token
```

Each heartbeat interval iterates the registered workspaces and renews only the lease whose current lock token still matches the registered token. If one workspace loses authority or throws during renewal, only that workspace is removed from the registry. Other workspace heartbeats continue.

Reset-for-tests clears the full registry and timer.

## Workspace Release Isolation

Verdict: repaired.

`releaseAcceptedTurnWriterLeaseForTests(workspacePath)` now removes only that workspace from the heartbeat registry. The timer is stopped only when the registry becomes empty.

This prevents releasing workspace A from stopping renewal for workspace B.

## Malformed Capture Failure Lock Cleanup

Verdict: validated and hardened.

Normal-host validation:

- A malformed recoverer was paused after acquiring the fresh lock and before capture.
- A second protocol-compliant host attempted recovery while A held that lock.
- B returned `writerConflict` and did not mutate the malformed lease.
- A resumed and recovered successfully with matching lease/owner token.

Conclusion: a protocol-compliant normal-host interleaving could not make A's expected malformed fingerprint stale after A acquired the fresh lock but before capture. The remaining capture-failure path requires external fault injection or non-protocol filesystem mutation.

Hardening repair:

- If malformed recovery acquires a fresh lock but capture fails, canonical reappears, or fresh lease commit fails, the guard now rolls back only the same fresh lock token it owns.
- The cleanup is same-token guarded and does not remove another host's lock.

## Test Proof

Added focused coverage in `scripts/test_runtime_accepted_replay_guard.js`:

- One process acquires two independent workspaces.
- Both workspaces renew beyond the shortened timeout.
- Releasing A does not stop B renewal.
- Losing B's lock token removes only B from heartbeat service and does not stop A renewal.
- A contender cannot stale-take over a healthy registered workspace B.
- Normal protocol hosts cannot cause malformed capture failure after A owns the fresh lock before capture.
- Simulated capture failure after fresh lock acquisition returns `writerConflict` and removes the same-token lock.

## Regression Results

Commands run:

- `npm run compile`: PASS.
- `node scripts/test_runtime_accepted_replay_guard.js`: PASS.
- `npm test`: PASS, `225/225`.

## Git / EOL State

Substantive repair files:

- `src/acceptedTurnReplayGuard.ts`
- `scripts/test_runtime_accepted_replay_guard.js`
- `docs/ai-tasks/RUNTIME-003A-FIFTH-VERIFICATION-REPAIR-RESULT.md`

EOL-only webview files remained dirty after compile and were not staged:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

`git diff --ignore-space-at-eol` showed no substantive diff for those webview files.

## New Findings

No new merge-blocking runtime finding was found in the Fifth Repair scope.

The intake file is currently present on `origin/main`, not on the task branch before this repair result was added.

## Final Verdict

`RUNTIME003A_FIFTH_VERIFICATION_REPAIR_COMPLETE_READY_FOR_REVERIFY`
