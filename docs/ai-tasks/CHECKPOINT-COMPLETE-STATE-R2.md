# CHECKPOINT-COMPLETE-STATE-R2

Status: REPAIR_VERIFYING

Risk: High — save data, restore authority, multi-file rollback

Base: `5a47cbf1df4ecba33085e2c5768e006876efeeb5`

## Finding confirmed

GPT-6 Pro R2 was reproduced on the current base. Legacy checkpoint restore rebuilds a
display-oriented state from the last GM entry and then uses replace persistence. Canonical roots
such as `commerce`, `world`, `director`, `hiddenState`, `domain`, and `guild` are absent from that
rebuild, while mutable side ledgers remain at their later point in time. This overlaps
`TEMP-001B` and the ordinary-failure portion of `TEMP-001C`.

## Implemented boundary

- New saves use `text-adventure-checkpoint/1.3` with a required
  `lorerelay-checkpoint-state/1` snapshot.
- The snapshot contains the complete validated `game_state` plus explicit present/absent evidence
  for these mutable gameplay ledgers:
  `world_state.json`, `npc_registry.json`, `vehicle_state.json`, `settlement_state.json`,
  `settlement_layout.json`, `discoveries.json`, and `campaign_resources.json`.
- Runtime replay authority, MOD control files, credentials, configuration, definitions, pending
  TurnResults, and combat processing markers are deliberately excluded.
- Capture is bounded and rejects malformed, non-regular, changed, added, or removed ledger files.
  The complete snapshot is revalidated immediately before checkpoint publication.
- Restore writes history and side ledgers before publishing `game_state` last. Ordinary write or
  authorization failure rolls changed files back to their exact pre-restore JSON values. The
  surrounding accepted-turn timeline transaction still installs its repair latch when restore or
  rollback cannot complete; old writer leases and epochs are never copied from the checkpoint.
- Timeline restore also acquires the host-scoped deterministic workspace mutation gate used by
  direct commerce and travel mutations, so a competing canonical mutation is rejected before
  epoch rotation or any checkpoint write.
- Formats 1.0, 1.1, and 1.2 remain readable and retain their legacy history-oriented behavior.
  Only 1.3 claims the enumerated complete-state contract.

## Focused regression contract

- commerce, location/world, director, hidden state, domain, and guild roots survive save/restore;
- all enumerated mutable ledgers return to the same checkpoint point, including authoritative
  absence for files created later;
- final game-state publication failure and MOD authorization drift roll earlier writes back;
- malformed or incomplete snapshots, unexpected file names, and capture-time drift fail closed;
- MOD-lock matching remains required for modded 1.3 checkpoints;
- workspace mutation contention stops before timeline rotation and performs no canonical write;
- legacy 1.0/1.1/1.2 parsing and restore behavior remains compatible.

## Scope boundary

This does not restore arbitrary workspace files, runtime authority, pending/processed combat
artifacts, media caches, immutable scenario/world definitions, or external provider sessions. A
process crash during multi-file publication remains fail-closed through the durable restore repair
latch; this slice does not claim filesystem-level atomic rename across multiple independent files.

## Verification

- Independent review: the GPT-6 Pro R2 finding on main was the single review stage for this lane.
- Focused: complete-state snapshot `39/39`; MOD activation boundaries `132`; MOD substrate `191`.
- Test Console plan: 19 selected commands passed; the pre-existing synchronized writer-lease race
  was timing-flaky in the plan and passed on the same HEAD in isolated verification. No R2 command
  or assertion failed.
- Final unchanged executable tree: full suite `344/344`; Combat `736/736`.
- PR exact-head Code Review found two P1 boundary gaps. The repair now measures the exact indented
  checkpoint serialization written to disk, and rejects/detects MOD provenance hidden in or
  inconsistent with a 1.3 authoritative state snapshot. Direct repair regressions pass; the prior
  full-suite result is superseded because executable code changed.
