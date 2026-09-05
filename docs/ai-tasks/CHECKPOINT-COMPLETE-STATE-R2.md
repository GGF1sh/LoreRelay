# CHECKPOINT-COMPLETE-STATE-R2

Status: IMPLEMENTED_VERIFYING  
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
- Formats 1.0, 1.1, and 1.2 remain readable and retain their legacy history-oriented behavior.
  Only 1.3 claims the enumerated complete-state contract.

## Focused regression contract

- commerce, location/world, director, hidden state, domain, and guild roots survive save/restore;
- all enumerated mutable ledgers return to the same checkpoint point, including authoritative
  absence for files created later;
- final game-state publication failure and MOD authorization drift roll earlier writes back;
- malformed or incomplete snapshots, unexpected file names, and capture-time drift fail closed;
- MOD-lock matching remains required for modded 1.3 checkpoints;
- legacy 1.0/1.1/1.2 parsing and restore behavior remains compatible.

## Scope boundary

This does not restore arbitrary workspace files, runtime authority, pending/processed combat
artifacts, media caches, immutable scenario/world definitions, or external provider sessions. A
process crash during multi-file publication remains fail-closed through the durable restore repair
latch; this slice does not claim filesystem-level atomic rename across multiple independent files.
