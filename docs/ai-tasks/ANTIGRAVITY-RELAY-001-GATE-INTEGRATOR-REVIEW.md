# Antigravity Relay 001 — Gate Integrator Review

Date: 2026-07-07 JST
Reviewed branch: `docs/antigravity-relay-001-gate`
Reviewed artifact: `docs/ai-tasks/ANTIGRAVITY-RELAY-001-GATE.md`
Source baseline: `00422b8063157d9a327fca0d3fe374614a71ec79`
Status: `GATE_REPAIR_REQUIRED`

## Verdict

`ANTIGRAVITY_RELAY_GATE_NOT_READY`

The gate contains useful code-grounded reuse findings, but it does not yet define a coherent player-to-Antigravity handoff.

The current proposal has one internal contradiction and one product-contract gap that must be repaired before implementation.

## G1 — Control-surface contradiction

The gate says Relay Mode disables:

- `freeInput`;
- `sendBtn`;
- every option button.

But A3 and the payload-building section also require the user to submit the compose box while Relay Mode is on so that `buildGmPromptBreakdown(playerAction)` can refresh the payload.

Both cannot be true.

```text
input disabled
≠
user can submit playerAction
```

The repaired gate must choose and specify one coherent Relay Mode interaction path.

## G2 — The actual outbound relay is underspecified

The user requirement is not merely to hide LoreRelay controls.

It is:

```text
LoreRelay
→ hand off the player's chosen action/request in a usable format
→ Antigravity
→ Antigravity produces turn_result.json
→ LoreRelay imports it
```

The current gate reuses `promptContext.breakdown`, but does not fully specify how a fresh player action or selected option enters the outbound payload once normal controls are suppressed.

Copying a previously available breakdown is not sufficient unless the gate proves that the current player action is included and defines the exact outbound envelope.

## Minimum Repair Contract

### R1 — One active surface, but one real relay action path

Relay Mode must suppress normal LoreRelay GM/provider execution, not every possible player input.

Recommended v0:

```text
Relay Mode OFF
→ normal LoreRelay UI unchanged

Relay Mode ON
→ normal provider dispatch disabled
→ one clearly labeled Relay composer / handoff action remains active
```

A selected option may populate the Relay composer or directly prepare the relay payload, but it must never start the normal LoreRelay GM path.

### R2 — Exact outbound handoff envelope

Define one exact v0 payload that includes at minimum:

```text
kind / version
playerAction
promptContext breakdown
availableOptions (if relevant)
targetOutput: turn_result.json
```

The payload is tooling data, not canonical game state.

Do not claim automatic injection into Antigravity chat unless a real integration path is proven.

A clipboard handoff is acceptable for v0 if it is explicit and complete.

A workspace `turn_request.*` artifact may be proposed only if the gate defines stale-request handling and does not invent authority.

### R3 — Options must not become dead text

The user is currently selecting setup / turn options.

In Relay Mode, option buttons must have one of two explicit behaviors:

1. populate the Relay composer; or
2. prepare/copy the outbound Antigravity payload.

They must not look actionable while doing nothing, and they must not dispatch a LoreRelay GM turn.

### R4 — Waiting state begins from a real handoff

`Waiting for Antigravity result` may start only after the outbound payload is actually prepared/copied/exported.

It must not start merely because Relay Mode is enabled.

The return boundary remains the existing accepted `turn_result.json` processing path.

### R5 — Keep the good constraints

Preserve:

- Relay Mode as a VS Code workflow setting, not GameRules;
- no gameplay changes;
- no Slice 1 file changes;
- no new turn-result ingestion path;
- Relay Mode OFF remains behaviorally unchanged;
- existing `turn_result.json` watcher remains the return channel.

## Token / process note

This was a narrow UX gate. Repository-wide exploration was disproportionate to the task.

The repair should be performed from this review plus the existing gate only. No exploration agent and no broad repository scan are needed.

## Final Verdict

`ANTIGRAVITY_RELAY_GATE_NOT_READY`
