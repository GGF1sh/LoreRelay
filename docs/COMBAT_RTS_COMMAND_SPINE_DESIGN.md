# Combat RTS Command Spine — Design

**Status:** approved, partially implemented
**Base:** `fa30627`
**Scope:** the deterministic spine for *Gambit RTS + player commands*, the product's main line.

Avatar / Direct control (`combatDirectHeadlessCore`) is a **separate controller** and is
integrated later. It is deliberately out of scope here — see §7.

Implementation progress:

| Phase | Content | State |
|---|---|---|
| PR1 | Extract the tick body into `stepCombat` (no behaviour change) | **done** |
| PR2 | Command input schema + normalization | not started |
| PR3 | Order slot, priority/return, receipts; `stop` / `resume_gambit` | **done** |
| PR4 | `move_to` + `attack_target` | **done** |
| PR5 | `attack_move` | not started |
| PR6 | Multi-unit application order, supersede semantics | not started |
| PR7 | Replay hash + determinism tests | not started |

---

## 0. Constraints discovered in the existing code

Four facts from `gambitCombatCore.ts` shape everything below.

1. **All tick state lived in closures.** `units`, `mechanicsStates`, `lastEvals`, `focusTarget`,
   `tickCount`, `outcome` and every event array were function-scoped, with no external handle.
   PR1 lifted them into `CombatState`.
2. **Gambit evaluation is stateless.** Every tick walks the rule array top-down, runs the first
   matching rule and breaks. There is no persistent intent. `_last_action` only de-duplicates the
   decision log. *This is what makes player commands cheap:* one order slot consulted ahead of the
   rule walk suppresses gambits entirely, with no change to the rules themselves.
3. **The golden master pins the whole output.** `evaluations`, `decisions`, `attacks`, `heals`,
   `deaths`, `focusChanges` and final positions are compared with `deepEqual` against 8
   Godot-generated fixtures. Any behaviour drift is caught.
4. **Determinism rests on `Math.fround`.** `dist` and all movement round through `f()`, reproducing
   Godot's float32 arithmetic. New code must keep that discipline.

---

## 1. Command input schema

One optional field is added to `BattleSpec`. Existing callers (Combat Lab, fixtures) are untouched,
and an absent or empty log means the current all-automatic behaviour, bit for bit.

```ts
export interface BattleSpec {
    // ...existing fields unchanged...
    /** Raw, pre-normalization. Absent → empty log → current behaviour exactly. */
    command?: unknown;
}
```

The schema follows the discipline already proven in `combatDirectInputCore`.

```ts
export const COMMAND_INPUT_SCHEMA_VERSION = 'combat-command-input-v1';

export const RTS_COMMANDS = [
    'move_to', 'attack_move', 'attack_target', 'stop', 'resume_gambit',
] as const;

export interface CommandPoint { x: number; y: number; }   // quantized to 1/1000

export interface CommandInputEvent {
    tick: number;              // non-negative integer
    seq: number;               // order within a tick; (tick, seq) is unique
    issuerTeam: number;        // 0 | 1 — blocks commanding the other side
    unitIds: string[];         // the selection; a drag-select lands here as-is
    command: RtsCommand;
    point?: CommandPoint;      // move_to / attack_move
    targetId?: string;         // attack_target
}

export interface CommandInputLog {
    schemaVersion: typeof COMMAND_INPUT_SCHEMA_VERSION;
    tickRate: number;          // positive integer; must agree with the spec
    events: CommandInputEvent[];
}
```

`normalizeCommandInputLog(raw)` → `{ ok: true, log } | { ok: false, error, detail }`.

| Rule | Reason |
|---|---|
| Total order is `(tick, seq)` only — never wall clock or draw FPS | matches the direct-input contract |
| `point` quantized to 1/1000 (reuse `quantizeScalar`) | float drift would split replays |
| Invalid command / negative tick / duplicate `(tick, seq)` / non-finite / empty `unitIds` → **reject** | no silent defaults |
| `unitIds` is stored as written; reordering happens at apply time | keeps the log round-trippable |

Error codes mirror the direct-input names: `INVALID_LOG`, `INVALID_SCHEMA_VERSION`,
`INVALID_TICK_RATE`, `INVALID_EVENT`, `INVALID_COMMAND`, `INVALID_TICK`, `INVALID_SEQ`,
`DUPLICATE_SEQ`, `INVALID_UNIT_IDS`, `INVALID_TEAM`, `INVALID_POINT`, `INVALID_TARGET_ID`,
`NON_FINITE`.

---

## 2. The step function *(implemented in PR1)*

```ts
export interface CombatState {
    tick: number;
    outcome: string;                                // '' while running
    units: Record<string, CombatUnitState>;
    mechanicsStates: Record<string, MechanicsCombatant>;
    lastEvals: Record<string, string>;              // drives evaluations de-duplication
    focusTarget: Record<number, string>;            // drives focusChanges
    // orders: Record<string, ActiveOrder | null>;  // added in PR3
}

export interface CombatStepEvents {
    evaluations: CombatEvent[]; decisions: CombatEvent[]; attacks: CombatEvent[];
    heals: CombatEvent[]; deaths: CombatEvent[]; focusChanges: CombatEvent[];
    mechanicsReceipts: Array<CombatEvent & { receipt: MechanicsReceipt }>;
    // commandReceipts: CommandReceipt[];           // added in PR3
}

export interface CombatStepContext {
    spec: BattleSpec; participantOrder: string[]; delta: number;
    combatMode: CombatMode; battleRect: { x: number; y: number; w: number; h: number };
    timeoutTicks: number;
}

export function createCombatStepContext(spec: BattleSpec): CombatStepContext;
export function createCombatState(spec: BattleSpec): CombatState;
export function combatTerminalOutcome(state: CombatState, ctx: CombatStepContext): string;
export function stepCombat(
    state: CombatState, ctx: CombatStepContext,
): { state: CombatState; events: CombatStepEvents };
```

Events are returned as per-tick deltas rather than accumulated in state: the state stays small and
serializable, and a UI can consume a tick's events directly.

`stepCombat` is pure — it copies the state it is handed and never writes to it.

**Tick ordering** (the existing order, with the command phase prepended):

```
1. terminal check (win/lose)          — if decided, do not step
2. tick++
3. ▸ command application phase        — PR3+. All commands for this tick land
                                        before any unit acts
4. engagementRankFor construction     — unchanged
5. for each unit in participantOrder:
     - skip dead / decrement cooldown  — unchanged
     - ▸ if an order is active → run it and skip gambit evaluation entirely
     - otherwise → the existing gambit walk, untouched
6. mechanics_v1 advance + death resolution — unchanged
```

`resolveCombat` is now a thin loop over these functions and keeps its public signature.

---

## 3. Orders vs gambits — priority and return

```ts
export interface ActiveOrder {
    command: RtsCommand;
    point?: CombatPoint;
    targetId?: string;
    issuedTick: number;
    /** attack_move only: paused to fight. Drives movement resume. */
    engaging?: boolean;
}
```

Priority is a plain either/or: **a non-null order slot suppresses gambit evaluation completely.**
No blending — partial mixing makes "which rule won" unexplainable.

| Command | Kind | Completion → return |
|---|---|---|
| `move_to` | transient | arrived → clear slot → gambits resume next tick |
| `attack_move` | transient | arrived → clear. Stops and fights along the way |
| `attack_target` | transient | target dead or gone → clear (`target_defeated`) |
| `stop` | **persistent** | never auto-returns; cleared only by another command or `resume_gambit` |
| `resume_gambit` | immediate | clears the slot and leaves nothing behind |

`stop` is persistent on purpose. If it auto-returned, gambits would re-engage on the very next tick
and the order would do nothing — "hold position" has to outlast the tick that issued it.

Shared interruptions (each emits a receipt and clears the slot):

- unit death
- `orderMaxTicks` exceeded (default: `timeoutTicks`) → `order_timeout`, the guard against
  unreachable goals

Under `mechanics_v1`, a unit failing `canAct` / `canMove` **idles for that tick but keeps its
order**. Crowd control suspends an order; it does not cancel it.

---

## 4. Multi-unit commands and `participantOrder`

One event carries N units, so the expansion order must be fixed or the result is non-deterministic.

```
command phase, per tick:
  for each event ordered by (tick, seq):                    ← log order
      for each unitId ordered by participantOrder.indexOf() ← NOT selection order
          applyOrder(unit, event)
```

- The order of `unitIds` is **ignored**. A drag-select's ordering depends on rectangle direction and
  hit-test order, which is a UI accident and must never reach the simulation.
- Unknown ids are rejected individually (`unit_not_found`); **the batch continues**. One bad id
  silently dropping an entire command would be miserable to use.
- Two commands to the same unit in one tick: **last wins**, and the loser emits `order_superseded`.
- All commands land before any unit acts, so no unit's order can depend on where an earlier-moving
  ally ended up.

---

## 5. Movement, range, target death, unreachable *(V1)*

V1 is **straight-line movement only**. No pathfinding, formations, or collision. The existing
`moveToward` maths (via `f()`) is reused verbatim — no second movement implementation.

```
arrival: dist(unit, point) <= arrivalEpsilon
arrivalEpsilon = move_speed * delta        // one tick of travel
```

One tick of travel is the threshold because anything smaller makes the unit overshoot and oscillate
around the goal.

| Situation | V1 rule |
|---|---|
| `move_to` arrives | clear + `order_completed` |
| `move_to` with an enemy in range | **ignored** — it is a move order, not an engage order |
| `attack_move` with an enemy in range | stop and attack; nearest target, ties broken by `participantOrder` |
| `attack_move` with no enemy in range | resume moving |
| `attack_target` out of range | close via `moveToward` (the existing `attack_nearest` path) |
| `attack_target` in range | `tryAttack` (the existing attack path) |
| `attack_target` target dies | clear + `order_completed(target_defeated)` → gambits resume |
| `attack_target` targeting an ally | rejected at issue time (`invalid_target`) |
| unreachable | cannot occur without collision in V1; `orderMaxTicks` is the only guard |
| `stop` | hold position, no movement, no auto-attack |

**Determinism checklist:** no `Math.random`; no clock; every tie broken by `participantOrder` index;
all coordinates through `f()`; command points pre-quantized to 1/1000.

---

## 6. Command receipts and replay

```ts
export interface CommandReceipt {
    tick: number; unitId: string; command: RtsCommand;
    kind: CommandReceiptKind; reason?: CommandRejectReason; detail?: string;
}

type CommandReceiptKind =
    | 'order_accepted' | 'order_rejected' | 'order_started'
    | 'order_completed' | 'order_superseded' | 'order_interrupted' | 'order_timeout';

type CommandRejectReason =
    | 'unit_not_found' | 'unit_dead' | 'not_your_team' | 'mode_forbids_command'
    | 'invalid_target' | 'target_not_found' | 'target_defeated'
    | 'invalid_point' | 'unknown_command';
```

`commandReceipts` is added to `CombatExpectedOutput` as an optional field, exactly as
`mechanicsReceipts` already is. **When the command log is empty the field is omitted entirely** —
that is what keeps the golden master untouched.

Replay: `(BattleSpec + CommandInputLog)` is the complete input. A `replayHash` over stably
serialized output pins "same spec + same log → identical bytes", mirroring the direct-mode contract.

---

## 7. `spectator` / `command` / `direct_action`

The gates in `combatModeContract` are reused; no new mode predicate is introduced.

| Mode | RTS commands | Avatar verbs (dodge / light_attack) | V1 |
|---|---|---|---|
| `spectator` | **all rejected** → `mode_forbids_command` | rejected (existing) | in scope |
| `command` | **all accepted** | rejected (existing) | **primary target** |
| `direct_action` | accepted, for companion units | accepted (existing direct path) | **out of scope** |

`combatModeAllowsTacticalOrder(mode)` already returns true for `command | direct_action`, so it
serves as the gate unchanged.

**Why `direct_action` waits.** Direct is one avatar replayed from an input log; RTS is N units with
mid-tick intervention. Merging two input logs into one runner is its own design problem, and doing it
inside V1 would destabilise both. Replacing the `tactical_order` no-op in
`combatDirectHeadlessCore` is V2 work.

---

## 8. Compatibility and migration

**The promise:** with `spec.command` absent or empty, `resolveCombat` output is byte-identical to
before. The 8 golden-master fixtures are the executable proof.

| Phase | Content | Proof |
|---|---|---|
| **A** | extract the tick body into `stepCombat`; no features | golden master 8/8 byte-identical |
| **B** | wire the order slot and command log; empty log takes the identical path | golden master 8/8 + empty-log equivalence |
| **C** | implement the five commands | new command tests + golden master 8/8 |

Public API is additive only. `resolveCombat`'s signature is unchanged, so Combat Lab, the fixtures
and `gambitCombatMechanicsIntegration` need no edits.

Phase A carried the real risk: dropping any one of the six lifted closure values would corrupt the
output. That is precisely why it shipped alone, with no feature work mixed in.

---

## 9. PR plan

| PR | Content | Depends on | Verification |
|---|---|---|---|
| 1 | `stepCombat` extraction (pure refactor) | — | golden master 8/8 byte-identical |
| 2 | command schema + `normalizeCommandInputLog` (not yet wired) | — | normalization, round-trip, reject codes |
| 3 | order slot, priority/return, receipts; `stop` + `resume_gambit` | 1, 2 | empty-log equivalence, `stop` persistence, return |
| 4 | `move_to` + `attack_target` | 3 | arrival, target-death return, closing distance |
| 5 | `attack_move` | 4 | engage/disengage, tie-break determinism |
| 6 | multi-unit expansion order, supersede | 4 | same log → same assignment |
| 7 | `replayHash` + determinism tests | 6 | replay identity |

PR2 has no consumer on its own, but it is pure data, independently testable and risk-free, so
landing it early keeps the later reviews small.

---

## Constraint compliance

- **No VS Code API, DOM, I/O, clock or randomness in core** — `stepCombat` depends only on
  `(state, ctx)`.
- **No UI or rendering design here** — click-select and drag-select are concerns of whatever
  produces the command log; this document stops at the log schema.
- **The `direct_action` demo prototype is not merged into the main line** — `direct_action` is
  excluded from V1 scope entirely.
- **3D, pathfinding, formations and physics collision are out of V1** — straight-line movement and
  deterministic order handling only.
