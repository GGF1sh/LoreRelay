# RUNTIME-003A Adversarial Review Intake

Status: `ADVERSARIAL_REPAIR_REQUIRED`
Date: 2026-07-06 JST

Source: Gemini 3.1 Pro adversarial review supplied by user.

## Overall verdict

The Architecture Gate is not ready for implementation.

However, adversarial severity labels are not automatically accepted as final. Several findings were explicitly based on unverified caller/UI assumptions and require repository-grounded gate repair before promotion.

## Candidate blockers requiring architecture repair

### A. alreadyAccepted liveness semantics

Risk: replay suppression may return a value that callers interpret as failure/pending, potentially causing retry, fallback synthesis, or UI/GM lifecycle stalls.

Important constraint:

- Do not solve this by replaying the real PROMPT ACK.
- Do not fabricate Accepted callbacks.
- Do not satisfy a new pending callback with an old duplicate.

Required gate repair: define an explicit duplicate outcome and trace exact current callers to prove how watcher, fallback, GM lifecycle, and UI settle.

### B. restore / rewind divergence

Risk: canonical witness and accepted-turn ledger can describe different timelines after restore, backup replacement, Git timeline restore, or manual file replacement.

Important constraint:

- Do not automatically truncate durable history merely because witness is older.
- Destructive repair must not occur silently.

Required gate repair: define explicit timeline/epoch/branch semantics or fail-closed reconciliation policy.

### C. interim workspace-path scopeKey

Risk: folder move, copy, alias, junction, UNC/path normalization, or same-folder campaign replacement may change or collide with scope identity.

Required gate repair: determine whether RUNTIME-003A must depend on RUNTIME-001B campaign/runtime identity, or whether a narrow durable campaign identity can be introduced safely.

### D. multi-file world-state partial persistence

Risk: replay guard on game_state acceptance does not by itself solve pre-commit world/secondary-ledger persistence or optimistic reapply duplication.

Required gate repair: clearly separate what RUNTIME-003A can prove from CHATGPT-20260706-002 and other multi-file transaction gaps. Do not claim global exactly-once.

## Required hardening candidates

- ledger durability and concurrency strategy
- multiple extension-host / concurrent writer behavior
- export sanitization for host-owned witness metadata
- migration behavior for legacy campaigns
- copied/moved campaign semantics

## Rejected automatic fixes from adversarial proposal

The following are not accepted without further design:

1. `alreadyAccepted` => fake normal success / dummy PROMPT ACK
2. witness older than ledger => automatic destructive ledger truncation
3. whole-file JSON => automatic NDJSON migration solely on performance speculation

Each may create new authority or recovery bugs.

## Lifecycle

`ADVERSARIAL_REVIEW` -> `GATE_DRAFTED (Adversarial Repair)`

Next owner: ChatGPT 5.5 High

Next deliverable:

`docs/ai-tasks/RUNTIME-003A-ARCHITECTURE-GATE-REPAIR.md`
