# Combat Direct Mode Experience Design

Task ID: `COMBAT-DIRECT-MODE-EXPERIENCE-DESIGN-001`
Status: **design document only.** No code, fixture, or resource changed.
Track: optional mode, default OFF. Must not alter legacy, gambit, or mechanics combat.

Defines the V1 contract for a selectable direct-control / Musou-style combat mode
that sits alongside the existing resolvers rather than replacing any of them.

---

## 0. What the code already provides

Written against the tree at `3c8a988`, not against intent.

| Fact | Consequence for this design |
| --- | --- |
| `CombatMode = 'legacy_gambit' \| 'mechanics_v1'` — only two modes exist. | Mode selection needs a wider enum, and `CombatLoadoutState.mode` is the natural place it already lives. |
| `DirectProfile { windupMs, activeMs, recoveryMs, staminaCost, iframeMs?, justWindowMs? }` exists in the schema and is **validated but consumed by nothing**. | The frame contract is already designed; this document connects it. Same pattern `maxTargets`/`falloff` had before the AoE task. |
| **Only 2 of 20 shipped abilities declare `direct`** (`blink`, `perfect_dodge`) — no attack ability has one. | Direct mode **must work without per-ability authoring**, deriving frames when absent (§4.2). Otherwise 18 abilities would be unusable. |
| `resolveMechanics` already applies fan-out, falloff, engagement slots, swarm, armour, barrier, status, lethality and colossal subsystem conversion. | Direct mode adds **no combat rules**. It only decides *when* and *at whom* the same resolver runs. |
| `evasion` is a deterministic per-defender counter (`interval = ceil(100 / effEvasion)`). | The dodge equivalence in §3 has a concrete auto-side quantity to match. |
| The tick loop is driven by `deltaSeconds` with no wall clock and no RNG. | Determinism is preserved for free provided input is bound to tick indices, never milliseconds. |

**The load-bearing consequence:** because direct mode contributes only *inputs*,
every `BattleSpec` remains runnable under `mechanics_gambit` at any time. That is
what makes the no-3D fallback safe rather than aspirational.

---

## 1. Selectable combat modes

### 1.1 The five modes

| Mode | Who decides actions | Resolver | Player watches |
| --- | --- | --- | --- |
| `narrative` | GM | none / skirmish-style instant resolution | prose only |
| `legacy_gambit` | authored gambits | `gambitCombatCore` legacy path (**frozen**, Golden Master) | prose / log |
| `mechanics_gambit` | authored gambits | `gambitCombatCore` + `resolveMechanics` | prose / log / optional replay |
| `direct_action` | **player, one combatant** | same as `mechanics_gambit` | live |
| `command` | player issues orders, no avatar | same as `mechanics_gambit` | live |
| `spectator` | nobody (auto) | same as `mechanics_gambit` | live |

`command` and `spectator` are the same resolver with different input rights:
`command` may issue `tactical_order`, `spectator` may issue nothing. Treating
them as one mode with a permission flag avoids a fourth code path.

### 1.2 Selection, availability, fallback

Selected **before the battle starts**, from the encounter's allowed set:

```
BattleSpec.presentation.requestedMode  →  capability check  →  effectiveMode
```

| Requested | Requires | Fallback when unavailable |
| --- | --- | --- |
| `narrative` | nothing | — |
| `legacy_gambit` | nothing | — |
| `mechanics_gambit` | nothing | — |
| `direct_action` | input adapter **and** presentation adapter | **`mechanics_gambit`** |
| `command` / `spectator` | presentation adapter | `mechanics_gambit` (headless) |

The fallback is unconditional and silent to the simulation: the same
`BattleSpec` runs, the same receipts are produced, only the input source
changes. A battle authored for direct play is always completable in CI, in a
headless QA soak, on remote play, or with the Webview closed.

**Rule:** an encounter may *offer* `direct_action` but may never *require* it.

---

## 2. Direct control V1 — the action contract

Actions are **semantic**. This document deliberately fixes no key, button, or
gesture; binding is a presentation concern.

```ts
type DirectActionKind =
  | 'move'              // held; direction vector
  | 'light_attack'      // the loadout's normalAttackAbility
  | 'heavy_attack'      // charged variant; hold to charge, release to commit
  | 'use_ability'       // any ability in the loadout, by id
  | 'guard'             // held
  | 'parry'             // tap inside the guard window
  | 'dodge'             // directional, costs stamina, grants i-frames
  | 'target_lock'       // lock/unlock current target, optionally a subsystem
  | 'target_cycle'      // next/previous valid target
  | 'companion_order'   // gather / scatter / focus / retreat / heal_priority
  | 'switch_character'  // take control of another living ally
  | 'pause'             // presentation pause
  | 'tactical_order'    // issue orders (allowed while paused, §6.4)
  | 'mode_switch';      // request direct ⇄ auto (§6.3)
```

`move` and `guard` are held actions carrying `press`/`release`. Everything else
is an instantaneous intent. `heavy_attack` is press-to-charge, release-to-commit,
so it is also a held action with a charge duration measured in ticks.

**Companion orders** are the five listed in the task, expressed as gambit
overrides rather than as a second AI: an order temporarily prepends a rule to the
companion's gambit list for a stated duration (§5.2).

---

## 3. Dodge, stamina, and equivalence with auto evasion

### 3.0 Correction — evasion credits (attack-count ceiling)

**Update for COMBAT-DIRECT-DODGE-EVASION-CREDIT-V1:** time-based stamina alone is
not a sufficient ceiling. Against sparse, high-power attacks a player with full
stamina and good timing could land more *successful* i-frame avoids than the
auto dodge counter would have produced on the same sequence of dodgeable hits.

Therefore i-frame negation of a dodgeable hit additionally requires an
**evasion credit** derived from the same effective-evasion interval as auto:

```
effEvasion = clamp(evasion - attacker.accuracy, 0, 50)   // shared with resolveMechanics
interval   = ceil(100 / effEvasion)                      // effEvasion ≤ 0 → no credits
```

- Each **dodgeable** incoming attack against the controlled combatant increments
  `dodgeableThreatCount`. When `count % interval === 0`, grant one credit
  (`availableEvasionCredits`, hold cap **1**).
- A successful i-frame avoid of a dodgeable hit **consumes** one credit and does
  not call `resolveMechanics`. Without a credit the hit resolves normally even
  inside i-frames (`iframe_no_credit`).
- `delivery.dodgeable === false` never generates or spends credits and always
  goes through the existing resolver (`undodgeable_hit`).
- Skill still chooses *which* credited avoid to spend; total successful avoids
  cannot exceed the auto counter on the same threat sequence.

Stamina remains the cost of *attempting* a dodge (i-frame window). Credits cap
*successful* avoids. Both are required for a free avoid.

### 3.1 The adopted equivalence rule

> **Direct control never grants more total damage avoidance than the same
> combatant's `evasion` would have produced under automation. It grants control
> over *when* that avoidance lands.**

Concretely, `evasion` is expressed as a **dual budget**: stamina meters how often
the player may *open* an i-frame window, and attack-count **evasion credits**
(§3.0) meter how many dodgeable hits may actually be negated:

```
staminaMax         = 100                      (fixed; stored as staminaMilli)
staminaRegenPerSec = 20                       (V1 fixed rate)
dodgeStaminaCost   = 25                       (+10 per consecutive dodge within 1 s)
iframeSeconds      = DirectProfile.iframeMs ?? 300ms
evasionCredits     = min(1, floor-gated auto interval grants)   // §3.0
```

At `evasion 25` the auto interval is 4, so 40 dodgeable threats yield at most
10 successful avoids — the same ceiling whether the player holds credits for
dangerous hits or spends them early. At `evasion 0` no credits are ever
granted, so i-frames never free-avoid dodgeable damage.

**The ceiling is structural:** successful i-frame avoids of dodgeable hits are
hard-capped by the shared auto interval, independent of stamina regen. Stamina
only limits how many dodge *attempts* can be opened; without credits those
attempts do not raise total avoidance above auto.

### 3.2 Where player skill is rewarded

Skill must **not** raise the mitigation ceiling, or the modes stop being
comparable. It is rewarded in three ways that do not touch that ceiling:

1. **Distribution.** A skilled player spends i-frames on the four dangerous
   hits; an unskilled one wastes them on chip damage. Same budget, better
   outcome.
2. **Positioning.** Standing outside a cone, or on the falloff edge of an area
   attack, reduces damage taken through the *existing* delivery rules — not
   through evasion.
3. **Perfect dodge → offence, never defence.** A dodge that begins inside
   `justWindowMs` of an incoming active frame grants a **counter window**
   (a short window of increased posture damage / a free committed attack). It
   grants **no stamina refund and no extra i-frames**, because either would
   raise the mitigation ceiling and break §3.1.

Rule 3 is the decisive one. Refunding stamina on a perfect dodge — the obvious
design — makes a flawless player effectively unkillable, since dodges become
free. Routing the reward to offence keeps the defensive budget hard-bounded
while still making mastery feel meaningful.

### 3.3 Consecutive-dodge penalty

Beyond the stamina cost, each dodge inside 1.0 s of the previous one raises the
next dodge's cost by **+10 stamina** (cumulative, decaying after 2.0 s without
dodging). This prevents dodge-spam from converting a large stamina pool into a
continuous i-frame wall, and it gives the recovery frames real weight.

### 3.4 Separation from armour and barrier archetypes

| Archetype | Auto expression | Direct expression | Distinct because |
| --- | --- | --- | --- |
| Evasion | dodge counter | stamina + i-frames | *avoids* the hit entirely; limited resource |
| Armour | flat reduction | unchanged, passive | *reduces* every hit; no resource, no input |
| Barrier | absorbing pool | unchanged, passive | *absorbs* a total; depletes |
| Guard | — (V1 auto has none) | held, reduces damage, costs stamina on hit | *converts* damage into stamina pressure |

Guard is the one genuinely new defensive verb in direct mode. It is bounded the
same way: guarding drains stamina per blocked hit, and reaching zero stamina
breaks the guard and staggers the defender. In auto mode a combatant simply does
not guard, which is why guard must never be strong enough to be the dominant
answer — it is a stamina trade, not free mitigation.

---

## 4. Attacks and abilities in direct mode

### 4.1 One ability system, not two

Direct mode reuses `AbilityDefinition` unchanged. It contributes only timing and
targeting; every damage, status, penetration, fan-out, engagement, swarm and
subsystem rule resolves through the existing `resolveMechanics`.

```
input event → state machine → (on active frame) resolveMechanics(...) → receipts
```

There is deliberately **no direct-only ability list**. An ability that exists in
auto exists in direct, and vice versa.

### 4.2 Deriving frames when `direct` is absent

Only 2 of 20 shipped abilities declare a `DirectProfile`. Requiring one would
make the other 18 unusable, so V1 derives frames from the auto profile:

```
windupTicks    = ceil(cooldown × 0.20 × tickRate)
activeTicks    = max(1, ceil(cooldown × 0.10 × tickRate))
recoveryTicks  = ceil(cooldown × 0.20 × tickRate)
staminaCost    = clamp(round(cooldown × 8), 5, 40)
```

An explicit `DirectProfile` always overrides the derivation. Millisecond values
convert with `ticks = ceil(ms / 1000 × tickRate)` — **ceiling, never rounding**,
so no ability ever gets a zero-length active window.

Deriving rather than authoring is what lets direct mode ship without touching
`resources/combat-abilities/v1-reference-abilities.json`.

### 4.3 Interruptibility

| Phase | Interruptible by |
| --- | --- |
| `windup` | hard control (stun/sleep/petrify), guard-break, death |
| `active` | hard control, death — **not** by taking damage |
| `recovery` | hard control, death; `dodge` may cancel at a stamina surcharge |

Poise is not introduced in V1. Taking damage does not interrupt an active frame,
which is what keeps a swordsman able to trade with a crowd rather than being
stun-locked out of every swing.

### 4.4 Connection to existing mechanics

| Existing rule | How direct mode reaches it |
| --- | --- |
| fan-out / `maxTargets` | The active frame supplies the target list; the primary is the locked target, the rest follow `participantOrder` exactly as auto does |
| `falloff` | Applied by target index, unchanged |
| engagement slots | The player-controlled combatant occupies a slot like any attacker; being one of seven attacking a medium defender still means `×0.25` |
| swarm | `×1.5` applies to non-single-target abilities against `swarm` targets, unchanged |
| armour / barrier / status | Unchanged, inside `resolveMechanics` |
| colossal subsystems | `target_lock` may carry a `subsystemTag`; a locked subsystem receives the hit. This is the direct-mode expression of the existing conversion model, not a new one |
| doom | `doom_imminent` surfaces to the UI (§9.5); the counters are the same — cleanse, heal above threshold, kill the caster |

---

## 5. Companions and enemy AI

### 5.1 Companions run the existing gambit path

While the player drives one combatant, **every other ally is resolved by
`mechanics_gambit`, unmodified**. There is no companion-specific AI.

### 5.2 Orders as temporary gambit overrides

```ts
type CompanionOrder = 'gather' | 'scatter' | 'focus_target' | 'retreat' | 'heal_priority';
```

An order prepends one rule to the companion's gambit list for a stated duration
(recommended 8 s) and then lapses. `focus_target` binds to the player's locked
target. Because orders are gambit rules, they are expressible in auto mode too,
and a replay of an auto battle can contain the same overrides.

### 5.3 Character switching and player death

- `switch_character` transfers control to a living ally. The relinquished
  combatant immediately resumes its gambits; the acquired one abandons its
  in-flight action at the start of its next `idle` phase.
- On the controlled combatant's death, control transfers automatically to the
  highest-priority living ally in `participantOrder`.
- If none survive, the battle continues in `mechanics_gambit` to its conclusion.
  **A player death never ends the simulation early** — the truth engine still
  produces the full result for the GM to narrate.

### 5.4 Enemy AI

Enemies use the same `AbilityDefinition` and the same `resolveMechanics`. No
hidden stats, no direct-mode-only enemy rules, no reaction advantages the player
cannot also have. A boss is a boss because of its profile and abilities.

---

## 6. Fairness across modes — the adopted rule

> **Every mode resolves the same battle from the same `BattleSpec` against the
> same rules, and yields the same rewards. Modes differ only in who supplies the
> decisions.**

### 6.1 Shared state

HP, statuses, buildup, cooldowns, stamina, barriers, subsystem damage,
engagement occupancy and the dodge counter are all **one state**, carried
unchanged across any mid-battle mode transition. Nothing resets on switch.

### 6.2 No reward or difficulty differential

Identical loot, XP, world-state writeback and GM narration inputs regardless of
mode. **No mode is easier, harder, or more lucrative.**

The reason is structural rather than generous: LoreRelay's product is the
narrated outcome, and the outcome is the truth engine's. If direct mode paid
better, it would coerce players into it and quietly deprecate the gambit
authoring that the rest of this system is built around; if it paid worse, nobody
would use it. Parity is the only setting that leaves both genuinely optional.

The payoff for direct play is that a skilled player can *win a fight they would
otherwise lose*, by distributing the same mitigation budget better. That is a
real reward and it costs the economy nothing.

### 6.3 Mid-battle switching, and why it cannot be abused

Switching is allowed in both directions, gated by three rules:

1. **Commitment cost.** A switch takes effect at the controlled combatant's next
   `idle` phase and costs one full action cycle of inactivity.
2. **No state reset.** §6.1 — cooldowns, stamina, statuses and counters all
   persist. Switching cannot be used to escape a doom timer, refresh stamina, or
   clear engagement overflow.
3. **Recorded.** Every transition is a `mode_switch` event in the input log, so a
   replay reproduces exactly the same battle.

The abuse this forecloses is "auto until it gets dangerous, then take over with
full resources" — the resources are not full, because they were never separate.

### 6.4 Pause

Pause is permitted and is presentation-only. Orders may be issued while paused,
but they consume the **same action economy** they would unpaused: a
`tactical_order` occupies its issuer's action for the same number of ticks.
Pausing therefore buys thinking time, not extra actions. It is recorded in the
input log so replays are exact.

### 6.5 What each mode is genuinely for

| Mode | Its distinct value |
| --- | --- |
| `narrative` | speed; combat as story beat |
| `legacy_gambit` | frozen parity reference |
| `mechanics_gambit` | the authoring game — building gambits that win unattended |
| `direct_action` | moment-to-moment execution; distribution of a fixed budget |
| `command` | tactics without execution |
| `spectator` | watching a build you authored perform |

---

## 7. Determinism and replay

### 7.1 The contract

```
BattleSpec + DirectInputLog  →  identical CombatResolution, receipts, and replay
```

Bit-identical, on any machine, at any rendering frame rate.

### 7.2 Input event schema

```ts
interface DirectInputEvent {
  tick: number;            // integer tick index — never a millisecond timestamp
  seq: number;             // monotonic within a tick; total ordering
  actorId: string;         // which combatant this input drives
  action: DirectActionKind;
  phase?: 'press' | 'release';
  direction?: { x: number; y: number };   // quantized to 1/1000, unit length
  targetId?: string;
  subsystemTag?: SubsystemTag;
  abilityId?: string;
  order?: CompanionOrder;
  requestedMode?: CombatMode;
}

interface DirectInputLog {
  schemaVersion: 'combat-direct-input-v1';
  tickRate: number;        // ticks per second the log was recorded at
  events: DirectInputEvent[];   // sorted by (tick, seq)
}
```

### 7.3 The determinism rules

1. **Inputs bind to ticks, never to wall-clock time.** The input adapter converts
   device events to the *current* tick index; the simulation never reads a clock.
2. **Analog direction is quantized** to 1/1000 and normalised before entering the
   log, so no controller float noise reaches the resolver.
3. **`(tick, seq)` is a total order.** Two inputs on the same tick resolve in
   `seq` order, always.
4. **Frame rate is irrelevant.** A 144 Hz client and a headless replay at
   unlimited speed consume the same log and produce the same receipts.
5. **No `Math.random()`.** Direct mode introduces no randomness; the existing
   deterministic dodge counter and buildup thresholds remain the only
   "chance-like" mechanics.
6. **Replay is a first-class run.** Replaying a log is the same code path as
   playing, with the input adapter swapped for a log reader.
7. **A missing or truncated log degrades safely** — the battle continues under
   `mechanics_gambit` from the last consumed tick.

---

## 8. The 3D boundary

The Godot prototype at `D:\Gamecreate\gunbitrts` remains a **behaviour oracle**
(the Golden Master source) and is never the shipped runtime. The runtime is the
LoreRelay VS Code extension.

### 8.1 Responsibilities

| Layer | Owns | Forbidden |
| --- | --- | --- |
| **Pure TypeScript core** | `BattleSpec`, tick loop, `resolveMechanics`, state machine, input log consumption, receipts, replay | DOM, wall clock, RNG, callbacks into presentation, any renderer type |
| **Input adapter** | device events → `DirectInputEvent` (tick binding, quantization, ordering) | reading or writing combat state |
| **Presentation adapter** | per-tick snapshot + receipts → rendering, camera, audio, HUD | writing combat state; being required for the battle to resolve |

The two adapters are the only things that may be absent. The core runs without
either.

### 8.2 Headless execution and the no-3D fallback

Headless is not a special mode — it is the core with no adapters attached. This
is what makes QA soaks, CI, and the `mechanics_gambit` fallback (§1.2) the same
code path rather than three.

### 8.3 The profiling boundary for a future Rust/WASM core

`COMBAT_MECHANICS_V1_RULESET.md` Appendix B fixes the replaceable boundary as
`BattleSpec → CombatResolution`. Direct mode **extends the input side of that
same boundary** and must not breach it:

```
(BattleSpec, DirectInputLog) → CombatResolution
```

still serializable, still pure, still free of callbacks. If the sim ever calls
*into* the presentation layer mid-tick, the boundary is broken and the Rust/WASM
option dies with it. That is the single architectural constraint direct mode
must not violate.

No 3D library is selected here. The renderer is deliberately unspecified beyond
"consumes snapshots, writes nothing".

---

## 9. Worked scenarios

### 9.1 One swordsman vs six mobs
Engagement slots cap the crowd at three effective attackers (§4.4). The player
holds `guard` between swings, spends the evasion-derived stamina budget on the
three telegraphed heavy blows, and uses an area ability on cooldown. Winnable
with skill; the same character on gambits loses — the difference is
distribution, not power.

### 9.2 Evasion build vs high-accuracy enemy
The enemy's `accuracy` reduces the auto dodge interval; in direct mode it does
not touch the stamina budget, so the evasion player retains their i-frames but
faces attacks that are harder to read (shorter telegraphs). The counter is
positioning, not more dodging.

### 9.3 Heavy armour vs many
Armour is passive and identical in both modes. The player mostly ignores dodge,
spends stamina on guard, and relies on the minimum-damage floor working in their
favour. Demonstrates that not every build wants the dodge budget.

### 9.4 Three-person party with a healer
Player drives the front-liner; the healer runs its existing gambits.
`companion_order: heal_priority` biases it for 8 s. Illustrates that orders are
gambit overrides, not a parallel AI.

### 9.5 Responding to `doom_imminent`
The receipt surfaces on the HUD three seconds before resolution. The player may
`switch_character` to the healer to cleanse, order `heal_priority` to lift the
target above its execution threshold, or focus the caster to lift the timer.
Three real counters, all pre-existing.

### 9.6 Colossal subsystem attack
`target_lock` with `subsystemTag: 'locomotion'` directs hits at the leg
actuators. The colossal cannot be executed by doom (existing rule), so the win
condition is subsystem attrition — which direct aiming makes tractable in a way
auto targeting is not.

### 9.7 Controlled character dies → switch to companion
Control transfers automatically (§5.3). Cooldowns and statuses on the new
combatant are whatever its gambits left them at; nothing is refreshed.

### 9.8 Mid-battle direct → gambit switch
Player switches at 30% HP. The combatant resumes its gambits with the same HP,
statuses, cooldowns and stamina. Nothing resets (§6.3). The battle concludes
identically to one that had been on gambits from that tick.

### 9.9 No-3D environment
The same encounter, launched with the Webview closed. `direct_action` is
requested, the capability check fails, and it silently resolves as
`mechanics_gambit` (§1.2). The GM narration is produced from the same receipts.

### 9.10 Replay of an identical input log
The saved `DirectInputLog` is replayed against the saved `BattleSpec` at
unlimited speed with no renderer. Receipts and final state match bit-for-bit
(§7.1).

---

## 10. Implementation surface

### 10.1 Adopted in V1

Mode selection with capability fallback (§1); the semantic action contract (§2);
stamina/i-frame equivalence with the perfect-dodge-rewards-offence rule and the
consecutive-dodge penalty (§3); frame derivation for abilities lacking a
`DirectProfile` (§4.2); companion orders as gambit overrides (§5.2); shared state
with no reward differential (§6); the input log and replay contract (§7); the
adapter boundary (§8).

### 10.2 Deferred to V2

Combo strings and cancels; poise and damage-interrupt; positional backstabs;
aerial or vertical movement; guard-break as a distinct enemy verb; per-attacker
dodge counters; camera modes and animation blending; multi-character
simultaneous control; and everything already excluded elsewhere (cleave,
overkill spill, momentum, encirclement, stagger, first-mover bias, the evasion
formula).

### 10.3 Type and schema changes

```ts
// combatAbilityTypes.ts
type CombatMode = 'narrative' | 'legacy_gambit' | 'mechanics_v1' | 'direct_action' | 'command' | 'spectator';

// combatMechanicsResolver.ts
interface MechanicsCombatant {
  stamina?: { current: number; max: number; regenPerSecond: number };
  actionState?: DirectActionState;      // §10.5
  iframeTicksRemaining?: number;
  consecutiveDodges?: number;
  lockedTargetId?: string;
  lockedSubsystemTag?: SubsystemTag;
}

// new module: combatDirectInputCore.ts
interface DirectInputEvent { /* §7.2 */ }
interface DirectInputLog { /* §7.2 */ }
```

### 10.4 New `BattleSpec` fields

```ts
interface BattleSpec {
  presentation?: {
    requestedMode: CombatMode;
    allowedModes: CombatMode[];
    controlledActorId?: string;
    tickRate: number;              // ticks per second; input log must match
  };
  directInput?: DirectInputLog;    // present when replaying or driving directly
}
```

All optional. A spec without them behaves exactly as today.

### 10.5 State machine

Per controlled combatant:

```
                 ┌───────────────── hard control / death ─────────────────┐
                 ▼                                                        │
   idle ──light/heavy/ability──► windup ──► active ──► recovery ──► idle ─┘
    │                              │                      │
    ├── guard(press) ─► guarding ──┤ (stamina drain on hit)
    │        │                     │
    │        └── stamina 0 ─► guard_broken ─► staggered ─► idle
    │
    ├── dodge ─► iframe ─► dodge_recovery ─► idle
    │              └── inside justWindow ─► counter_window ─► idle
    │
    └── switch_character / mode_switch ─► (applied at next idle)
```

Transitions are tick-quantized; every edge is deterministic given `(tick, seq)`.

### 10.6 New receipts

`stamina_spent`, `stamina_exhausted`, `guard_raised`, `guard_hit`,
`guard_broken`, `dodge_started`, `iframe_negated`, `perfect_dodge`,
`counter_window_opened`, `action_interrupted`, `target_locked`,
`subsystem_targeted`, `companion_order_issued`, `character_switched`,
`mode_switched`, `input_log_exhausted`.

`iframe_negated` matters most: it is the direct-mode analogue of the auto
`dodged` receipt, and comparing their totals across modes is how §3.1's
equivalence is *verified* rather than merely asserted.

### 10.7 Information the UI needs

Per tick, read-only: controlled actor id; HP/max and stamina/max for the party;
current action phase and remaining ticks; i-frame active flag; locked target and
subsystem; incoming-attack telegraph (attacker, remaining windup ticks, shape);
active statuses with remaining seconds; **`doom_imminent` with its timer**;
cooldowns; companion order state; engagement occupancy on the current target.

The telegraph is the only genuinely new derived quantity — it is what makes
reactive play possible, and it is computable from other combatants' `windup`
phases without exposing hidden state.

### 10.8 Safe implementation order

1. **Mode enum + capability fallback**, no direct behaviour. Proves every
   existing battle still resolves and `direct_action` degrades to
   `mechanics_gambit`.
2. **Input log schema + replay of an empty log.** Proves the determinism
   contract before any action exists.
3. **State machine with `move` and `light_attack` only**, frames derived (§4.2).
4. **Stamina, dodge, i-frames**, with the equivalence test (§10.9) as the gate.
5. **Guard, parry, perfect dodge → counter window.**
6. **Target lock/cycle, subsystem targeting, abilities, heavy attack.**
7. **Companion orders, character switch, mid-battle mode switch.**
8. **Presentation adapter** last — the core must be complete and headless-testable
   before anything renders.

Each step is independently shippable and leaves the existing modes untouched.

### 10.9 Focused test plan

| Test | Asserts |
| --- | --- |
| Existing battles unchanged with the new mode enum | no regression; Golden Master 8/8 |
| `direct_action` without adapters | falls back to `mechanics_gambit`, same receipts |
| Empty input log | identical to a plain `mechanics_gambit` run |
| Same log replayed twice | bit-identical receipts and final state |
| Same log at two tick rates *recorded at that rate* | consistent within each rate; mismatch rejected |
| Two inputs on one tick | resolve in `seq` order |
| Analog direction quantization | no float drift enters the resolver |
| **Mitigation budget ceiling** | total `iframe_negated` over a fixed fight never exceeds the §3.1 bound |
| **Cross-mode equivalence** | auto `dodged` total ≈ direct `iframe_negated` total for the same combatant and fight length |
| Perfect dodge | opens a counter window; grants **no** stamina and **no** extra i-frames |
| Consecutive dodges | cost escalates, decays after 2 s |
| Guard to exhaustion | breaks, staggers |
| Frame derivation | every shipped ability without `direct` yields ≥1 active tick |
| Explicit `DirectProfile` | overrides derivation (`blink`, `perfect_dodge`) |
| Mid-battle switch | no cooldown/stamina/status reset |
| Character death | control transfers; battle completes |
| Colossal subsystem lock | hits the locked subsystem |
| `doom_imminent` | surfaces in the UI model before resolution |
| Pause + order | consumes the same action ticks as unpaused |

---

## Final report

### Direct mode V1 — the completed proposal

Direct control is an **input source, not a rule set**. It selects when and at
whom the existing `resolveMechanics` runs, contributing no combat mechanics of
its own and no direct-only abilities. Abilities lacking a `DirectProfile` — 18
of the 20 shipped — derive their frames from `auto.cooldown`, so the mode ships
without touching any resource. A state machine of
`idle → windup → active → recovery`, plus guard and dodge branches, is driven by
tick-bound semantic actions that name no key or button.

### Fairness with auto

One rule: **same `BattleSpec`, same rules, same rewards; only the decision-maker
differs.** `evasion` converts into a stamina-metered mitigation budget whose
long-run ceiling is fixed by regen, so no input sequence yields more avoidance
than automation would have. Skill is rewarded through *distribution*,
positioning, and a perfect dodge that pays out in **offence** — never in stamina
or extra i-frames, because either would lift the ceiling. State is shared across
mid-battle switches so "auto until it gets dangerous" gains nothing, and rewards
are identical so neither mode is coerced.

### Minimum implementation stages

Mode enum with fallback → input log and empty-log replay → state machine with
move and light attack → stamina/dodge/i-frames gated on the equivalence test.
Those four make the mode real and verifiable; guard, abilities, orders,
switching and the renderer follow. The presentation adapter is deliberately
last, so the core is proven headless first.

### Decisions needed from you (two)

1. **Reward parity, or a small direct-mode incentive?** §6.2 adopts strict
   parity — identical loot, XP and difficulty — on the grounds that any
   differential would coerce players toward one mode and quietly devalue the
   gambit authoring the rest of the system is built around. The alternative is a
   modest engagement bonus for playing manually. This is an economy and
   player-motivation call rather than a technical one.

2. **Should `direct_action` be pausable at all?** §6.4 permits pause, treating it
   as thinking time whose orders still cost full action economy. The stricter
   alternative bans pause outright in direct mode to preserve tension, at the
   cost of accessibility for players who need it. This is a tone-versus-access
   tradeoff and is yours.

COMBAT_DIRECT_MODE_EXPERIENCE_DESIGN_COMPLETE
