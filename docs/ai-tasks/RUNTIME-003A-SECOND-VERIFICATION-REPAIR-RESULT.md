# RUNTIME-003A Second Verification Repair Result

1. branch: `task/RUNTIME-003A-durable-replay-guard`
2. repair source commit: `82f80618620a650d1bb1cb3bab4af935ba887d65`
3. branch tip/report commit: this report commit
4. changed files:
   - `src/acceptedTurnReplayGuardCore.ts`
   - `src/acceptedTurnReplayGuard.ts`
   - `src/stateManager.ts`
   - `src/checkpointHandlers.ts`
   - `src/gitManager.ts`
   - `scripts/test_runtime_accepted_replay_guard.js`
   - `docs/ai-tasks/RUNTIME-003A-SECOND-VERIFICATION-REPAIR-RESULT.md`
5. R3A-V1 repair: closed. Canonical witnesses now self-validate `identityHash` before active-history matching, `alreadyAccepted`, ledger repair, or ledger record creation. Git witness clear now routes through the stateManager runtime witness authority path. Explicit campaign rebind quarantines retained TurnResult, clears the old witness through trusted authority, archives old ledger authority, and creates a clean new campaign/epoch.
6. R3A-V3 repair: closed. Accepted parent selection now uses the current campaign+epoch head. Ledger chain validation is per campaign+epoch, so first records in new epochs have no global parent. Scope bootstrap now fail-closes legacy retained `turn_result.json` ambiguity instead of erasing evidence. Rebind separates old ledger authority from the new campaign.
7. R3A-V4 protocol: closed. Writer leases now use exclusive lock directory ownership plus `lockToken` owner metadata. Stale takeover rereads authority and requires the expected owner token immediately before atomic lock-directory rename; after rename it requires the lock directory to remain absent before writing the new lease.
8. stale takeover race result: closed and witnessed by a two-process test where concurrent stale recovery contenders produce exactly one successful writer.
9. orphan lock recovery result: closed. A lock directory left after mkdir-before-metadata crash is treated as fresh while inside the grace window and recoverable after bounded age by exclusive rename.
10. PID reuse result: closed. Same-machine recovery compares stored `processStartedAt` with actual process-start evidence where available; mismatched PID start evidence is treated as a dead/reused owner and can recover after stale timeout.
11. malformed authority recovery result: closed. Fresh malformed lease metadata fails closed. Old malformed authority is quarantined under a bounded recovery path before a new lease is acquired.
12. heartbeat result: closed. Heartbeat renews the live owner through the same token-checked renewal path and tests observe renewal before a foreign stale attempt.
13. R3A-V5 full restore isolation: closed. A new restore transaction keeps writer authority and single-flight ownership across quarantine, epoch rotation, raw-hash clearing by callers, actual restore mutation or Git checkout, witness clear/install, and completion.
14. six restore path coverage: closed. Undo, rewind, checkpoint restore, regenerate, Git branch-from-turn, and Git branch switch now route through full restore transaction wrappers.
15. witness tests: added non-vacuous forged witness identityHash rejection, centralized witness clear/rebind coverage, and new-campaign usable-authority coverage.
16. epoch/reconciliation tests: added first-new-epoch post-commit/pre-ledger crash recovery proof and provider bootstrap legacy ambiguity proof.
17. writer lease concurrency tests: added empty acquisition, heartbeat, live PID protection, dead stale recovery, two-process stale takeover, orphan lock recovery, PID reuse, fresh malformed fail-closed, and old malformed quarantine/recovery coverage.
18. restore race tests: added in-flight restore transaction proof that competing TurnResult single-flight work waits until restore mutation completes, plus six call-site wrapper coverage.
19. compile: `npm run compile` passed.
20. full suite count: `npm test` passed `225/225`.
21. i18n: `check_i18n_keys.js` passed during full suite with 0 missing keys in `ja`, `en`, `zh-CN`, and `zh-TW`.
22. blockers: none.
23. new findings: none in repaired scope. Requested documents `docs/ai-tasks/RUNTIME-003A-REVERIFY-FAIL-INTAKE.md` and `docs/ai-tasks/RUNTIME-003A-O3-WRITER-LEASE-AUDIT.md` were not present in this checkout; the corresponding blocker details were available in `RUNTIME-003A-REVERIFY-RESULT.md`, `RUNTIME-003A-ARCHITECTURE-GATE-REPAIR.md`, and `RUNTIME-003A-ADVERSARIAL-RECHECK.md`.
24. final verdict: `RUNTIME003A_SECOND_VERIFICATION_REPAIR_COMPLETE_READY_FOR_REVERIFY`
