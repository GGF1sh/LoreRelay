# Combat Lethality and Anti-Horde Design

Task ID: `COMBAT-LETHALITY-ANTI-HORDE-DESIGN-001`
Base: `a17a9a4` (merge of PR #24)
Status: **design document only.** No code, fixture, resource, or numeric value changed.

Addresses the two balance problems measured in
`docs/COMBAT_BALANCE_PLAYTEST_V1.md` §P.5: doom is an HP-independent guaranteed
kill, and quantity beats quality with no counter-path. Both are solved as
**rules**, not as stat inflation. One adopted design per problem, no options
left open.

---

## 0. What the code actually does today

Everything below is written against measured behaviour, not the design docs.

| Fact | Consequence |
| --- | --- |
| `resolveMechanics` takes **one** `target`. `maxTargets`, `falloff`, `pierces`, `blockedByCover` are validated but **never consumed**. | **Multi-target delivery does not exist.** Six shipped abilities declare `maxTargets` 4–12 and all hit exactly one target. |
| Budget is `cost = Σ(magnitude × kindWeight) × SHAPE_MULTIPLIERS[shape]`, a **fixed** constant per shape. | AoE pays 1.6–2.5× for **zero** mechanical benefit. Today AoE is a strict *downgrade*. Once fan-out exists, the same formula under-prices a 12-target sweep by ~4.8×. |
| `doom`: `single_target`, tier `elite`, buildup magnitude **40**, threshold 100 → 3 hits (measured onset **2.10 s**), 12 s timer, unconditional execution. | Cost is independent of target durability. Measured: **14 impact damage killed a 900 HP target**. |
| `doom.scaleBehavior.huge = 'convert_subsystem'` with priority `power → command → primary_weapon → locomotion → sensor`. Conversion sets `disabledSeconds`, never destroys. | Colossal conversion works but is a **temporary disable**, contradicting `COMBAT_ABILITY_AUTHORING.md` §8.3 which specifies permanent critical loss. |
| `TargetTag` includes **`swarm`**, referenced only by the validator's allow-list. | An unused, already-schema'd hook — the natural lever for anti-horde without touching base stats. |
| Buildup escalation `threshold × (1 + 0.5 × min(procCount, 4))` and decay 10/s after 2 s idle both work. | Reapplication resistance and disengagement counters already exist and need no new machinery. |
| `StatusInstance` has no source reference. | "Kill the caster" is declared in `doom.counters` but is **mechanically impossible**. |

Two of doom's three declared counters (`arcane ward`, `kill caster`) are
therefore currently fiction. Only `cleanse` is real.

---

# Part 1 — Doom (死の宣告)

## 1.1 The adopted rule

> **Doom does not kill. It executes a target that is already dying, and
> otherwise lands as heavy damage.**

Execution becomes **threshold-gated**. On expiry, doom checks the target's HP
fraction:

- at or below the rank threshold → **execute** (through the existing
  `resolveLethality` gate, so `endure`/`undying` still intercept);
- above it → deal **20% of `maxHp`** as magical damage, then expire.

This is the whole fix. It makes doom's cost scale with the target's durability
without any per-target special-casing: to kill a 900 HP boss you must still do
~720 HP of work first. The measured failure case collapses immediately — an
attacker who dealt 14 damage leaves the target above 50%, so doom lands for 180
and the target lives.

It also converts doom from a *replacement* for damage into a **finisher that
rewards focus fire**, which is exactly the behaviour the few-versus-many design
in Part 2 wants to encourage.

## 1.2 Rank table

| Target rank | Execute threshold | Buildup to apply | Notes |
| --- | --- | --- | --- |
| normal | HP ≤ **50%** | 4 hits | The common case; doom is a strong finisher |
| elite | HP ≤ **35%** | 5 hits (resist +25) | Meaningful but not a shortcut |
| boss | HP ≤ **20%** | 6 hits (resist +50) | A closing tool, never an opener |
| colossal | **never executes** | 6 hits (resist +50) | Converts to subsystem destruction (§1.6) |

Rank is read from the existing `tier` on the *unit's* profile where present, and
falls back to `colossal` detection via `isHuge()` (already implemented:
`structureClass === 'capital'` or the `colossal` tag). Ranks are data, not new
enums — `resistances.doom` carries the +25/+50, which the existing threshold
formula already consumes.

## 1.3 Onset and the visible grace window

- Buildup magnitude **40 → 25**. Against threshold 100 this is **4 applying
  hits**, matching the cadence every other applicator already uses (measured
  onset ~3.13 s instead of 2.10 s). Doom should never land *sooner* than poison.
- Duration stays **12 s**.
- The final **3 s** become a distinct `doom_imminent` phase. It emits a receipt
  **once per second** (`stage: 'lethal_timer', kind: 'doom_imminent'`) carrying
  the target id and whether it is currently below the execute threshold.

The imminent phase is what makes doom fair rather than arbitrary. It gives the
GM three seconds of narratable dread, gives gambits a trigger to react to
(§3.5), and guarantees a doomed player is never silently deleted.

## 1.4 Counters (eight, six of them newly real)

| # | Counter | Mechanism | Status |
| --- | --- | --- | --- |
| 1 | **Cleanse** | Removes doom; `PRIORITY` already ranks it first | Works today |
| 2 | **Dispel** | `kind: 'dispel'` removes it as a magical effect | Effect kind exists, no ability uses it |
| 3 | **Heal above the threshold** | Emergent from §1.1 — healing the target out of the execute band defeats doom outright | **New, free** |
| 4 | **Kill the caster** | `StatusInstance.sourceId`; doom is removed when its source dies | **New**, needs one field |
| 5 | **Interrupt the application** | Doom needs 4 hits; killing or hard-controlling the caster mid-buildup stops it | Works today |
| 6 | **Disengage** | Buildup decays 10/s after 2 s idle — breaking contact sheds accumulation | Works today |
| 7 | **Endure / undying** | Doom routes through `resolveLethality`; measured working | Works today |
| 8 | **Resistance escalation** | Post-resolution `resistances.doom += 50`, battle-scoped, on top of `procCount` escalation | **New**, one line |

Counter #3 deserves emphasis: because execution is threshold-gated, **a medic
becomes a doom counter** without knowing doom exists. That is the kind of
emergent interaction the ruleset should prefer over bespoke immunity flags.

## 1.5 Reapplication

Doom uses the existing escalation (`+50%` threshold per prior proc, capped at 4)
**plus** a battle-scoped `resistances.doom += 50` once a doom resolves either way.
A second doom on the same target therefore needs roughly twice the buildup, and a
third is impractical inside one engagement. No new decay rule; `procCount`
already persists for the battle.

## 1.6 Colossal conversion

For `isHuge()` targets, doom **never** executes. It instead **permanently
destroys** the first subsystem present in the declared priority walk
(`power → command → primary_weapon → locomotion → sensor`), setting that
subsystem's `hp` to 0 rather than only `disabledSeconds`.

Constraints:

- **One subsystem per doom.** A colossal cannot be chain-doomed to death.
- **Colossal never dies to doom**, even with every subsystem destroyed. Killing
  it still requires HP damage.
- If the entity declares no subsystems, doom falls back to §1.1 damage (20% of
  `maxHp`), never to execution.

This closes the gap noted in §0: conversion becomes the permanent critical loss
that `COMBAT_ABILITY_AUTHORING.md` §8.3 already specified, and it gives doom a
genuinely different — and arguably better — role against bosses than against
mooks.

## 1.7 Automated vs direct control

Per `COMBAT_ABILITY_AUTHORING.md` §6, the auto profile is authoritative. Every
counter above is expressible in both modes, and none of them requires reflexes
the automated resolver cannot reproduce:

| Counter | Automated | Direct control |
| --- | --- | --- |
| Cleanse / dispel | Gambit `ally_doomed` → `cleanse_ally` | Player casts cleanse |
| Heal above threshold | Gambit `ally_doomed_below_threshold` → heal | Player heals |
| Kill caster | Gambit `focus_doom_caster` | Player targets caster |
| Interrupt buildup | Gambit `enemy_channeling_lethal` → interrupt | Player interrupts |
| Disengage | Gambit `self_buildup_above 0.75` → retreat | Player breaks contact |
| Endure / undying | Passive | Passive |

There is deliberately **no timing-window counter** for doom. A reaction test the
gambit AI cannot perform would break the equivalence constraint.

## 1.8 Constraints on AI-generated lethal abilities

New validator rules, so a generated ability cannot reproduce the measured
failure. All are hard rejections.

1. A `lethal_timer` status may only be applied by tier **`elite` or above**.
2. Buildup magnitude for a `lethal_timer` effect ≤ **25** (never faster than four hits).
3. Ability cooldown ≥ **8 s**.
4. `counters` must include at least **two** entries, of which at least one is
   `cleanse` or `dispel`.
5. `scaleBehavior.huge` must be `convert_subsystem` with ≥1 `hugeSubsystemTags`.
6. May **not** combine `lethal_timer` with any `hard_control` status in the same
   ability (no "stun, then execute" lockouts).
7. May **not** be simultaneously `dodgeable: false` **and** `penetration.barrier: 'passes'` —
   at least one interception layer must exist.
8. May **not** declare `delivery.shape` with `maxTargets > 1` (no mass execution).

New error codes: `LETHAL_TIMER_TIER_TOO_LOW`, `LETHAL_TIMER_BUILDUP_TOO_HIGH`,
`LETHAL_TIMER_COOLDOWN_TOO_LOW`, `LETHAL_TIMER_COUNTER_REQUIRED`,
`LETHAL_TIMER_WITH_HARD_CONTROL`, `LETHAL_TIMER_NO_INTERCEPTION`,
`LETHAL_TIMER_MULTI_TARGET`.

## 1.9 Fairness both ways

The rules are symmetric by construction — there are no player-only or
enemy-only multipliers, and rank thresholds key off the *target's* rank, so a
player elite enjoys the same 35% band an enemy elite does.

Two additions exist specifically to keep enemy-cast doom fair to the player:

- the `doom_imminent` receipt must reach the GM narration layer, so a doomed
  player character is always warned before dying;
- caster-death removal (§1.4 #4) means an enemy doom is defeatable by
  aggression, not only by having brought a cleanser.

---

# Part 2 — Few versus many (少数精鋭対多数)

## 2.1 Why the measured fight is unwinnable

Six mobs (100 HP, 15 atk) versus two elites (200 HP, 28 atk):

```
mob throughput   6 × (15 − 5) = 60 DPS      mob pool   600 HP
elite throughput 2 × (28 − 5) = 46 DPS      elite pool 400 HP
```

The few are behind on **both** axes simultaneously. No amount of per-unit stat
tuning fixes this without making elites simply better mobs — the fight has no
structure for them to exploit. The fix must be structural on both the defensive
and offensive side.

## 2.2 The adopted rule: engagement slots

> **A defender can only be meaningfully attacked by a limited number of
> opponents at once, determined by its physical size.**

| Defender size | Slots |
| --- | --- |
| tiny / small | 2 |
| medium (human) | **3** |
| large | 4 |
| huge | 6 |
| colossal | 12 |

Attackers beyond the cap deal **×0.25** damage until a slot frees. Slot
assignment is deterministic: by `participantOrder` among attackers currently
engaging that target, re-evaluated each tick.

This single rule is the defensive half of the entire anti-horde design. Against
one ace, six mobs stop being 60 DPS and become `3 × 10 + 3 × 2.5 = 37.5` raw,
~28 DPS after evasion 25. The ace's survival time roughly doubles, which is
exactly the room the few need — and it is historically and intuitively obvious,
which matters for a game the player experiences as prose.

It is also the mechanic that makes the *many* interesting rather than merely
numerous: a horde must now spread out, flank, or bring reach, instead of all
piling onto one target.

## 2.3 Multi-target delivery (the prerequisite)

None of the offensive tools work until fan-out exists. V1 implements it in the
simplest deterministic form:

```
resolveMechanicsMulti(ability, attacker, targets[], statuses)
  → targets ordered by participantOrder, truncated to delivery.maxTargets
  → target k receives damage × falloffAt(k)
     falloffAt(k) = 1 − (1 − falloff) × (k − 1) / max(1, maxTargets − 1)
  → each target resolves through the existing single-target pipeline unchanged
```

No geometry. V1 has no real spatial resolution in the mechanics layer, and
inventing one here would duplicate what the gambit core already owns. Selection
of *which* combatants are in the shape stays the caller's job; the resolver only
applies the ramp. Determinism is preserved because ordering is
`participantOrder`, the same convention every existing search uses.

## 2.4 The corrected power budget

This is the most important constraint in Part 2. The current formula prices AoE
by a fixed shape constant. Once fan-out lands, a 12-target sweep would deliver
~12× value for a 2.5× price — an instant auto-win.

```
targetValue   = maxTargets × (1 + falloff) / 2          // area under the falloff ramp
pricedTargets = 1 + (targetValue − 1) × 0.6             // crowd-efficiency discount
cost          = Σ(magnitude × kindWeight) × pricedTargets
budget        = 15 × cooldown × TIER_MULTIPLIERS[tier]  // unchanged
```

`SHAPE_MULTIPLIERS` is retired as a cost term and retained only as an authoring
hint. The `0.6` discount is deliberate: it is what makes AoE **better against
crowds and worse in a duel**, rather than merely equal.

Worked, using `kaiju_sweep` (maxTargets 12, falloff 0.5, boss, cd 6, damage 40):

```
targetValue   = 12 × 0.75 = 9
pricedTargets = 1 + 8 × 0.6 = 5.8
cost          = 40 × 5.8 = 232        budget = 15 × 6 × 2.5 = 225
```

Marginally over — it needs cooldown 6.2 s or damage 38. That is the formula
working: at 40 damage across 12 targets on a 6 s cooldown it was worth 80 DPS
against a crowd versus a basic attack's 15.

**The 1v1 constraint falls out for free.** At equal budget and cooldown, an AoE
ability's per-target damage is `1 / pricedTargets` of a single-target ability's.
A sweep therefore hits ~5.8× weaker in a duel and ~55% harder against a full
crowd. No special rule is needed to stop AoE being a strict upgrade — the
pricing guarantees it.

**`maxTargets` becomes a commitment you pay for, not a free ceiling.** Authors
who declare 12 and typically hit 3 have simply overpaid.

## 2.5 The `swarm` tag

`swarm` already exists in `TargetTag` and is used by nothing. V1 gives it meaning:

- units tagged `swarm` take **×1.5** from `cleave` and from any shape other than
  `single_target`;
- they take **×1.0** from `single_target` (unchanged);
- `swarm` units gain the encirclement bonus (§2.7) when ≥4 are alive.

This is the lever that lets anti-horde *equipment* matter without touching any
unit's base HP or attack — the explicit requirement of this task. A mob roster
becomes vulnerable to the right tool rather than to bigger numbers.

## 2.6 Offensive tools for the few

| Tool | Rule | Cap / anti-abuse |
| --- | --- | --- |
| **Cleave** | `cleaveFraction` (0–0.5) on a melee `single_target` ability; spills that fraction to up to **2** additional engaged enemies | Cleave damage **cannot itself cleave**; priced into budget as `pricedTargets` with `maxTargets = 3` |
| **Overkill spill** | Damage exceeding the target's remaining HP carries **50%** to **one** further target | **One hop only.** No chain reactions; spill cannot trigger on-kill effects |
| **Momentum** | On kill: **+15% attack per stack, max 3 stacks, 4 s**, refreshed not extended | Refresh-only prevents indefinite extension; no cooldown refund in V1 (loop risk — see §4) |
| **Stagger resistance** | Tier `elite`+ takes **half** stagger accumulation; already-existing control DR applies on top | Does not stack with control immunity |

Momentum favours the few by construction: elites kill mooks far more often than
mooks kill elites, so the buff accrues to the side that is outnumbered.

## 2.7 The many's win path

The horde must remain able to win legitimately, or the design has simply
inverted the problem.

| Tool | Rule |
| --- | --- |
| **Encirclement** | When ≥4 attackers engage one target, they collectively gain **+10% attack** — a flat bonus, *not* per attacker |
| **Attrition** | Engagement slots limit burst, not total throughput; a horde still wins any fight long enough |
| **Guard break** | Sustained attacks from ≥3 attackers strip interception (guard/parry) for 2 s |
| **Stagger** | Many small hits accumulate stagger, briefly interrupting a non-elite defender |
| **Slot pressure** | Killing or displacing an engaged attacker frees a slot instantly, rewarding the horde for cycling |

Crucially, **an elite carrying only single-target tools still loses to six
mobs.** The measured result stays a legitimate outcome; what changes is that a
correctly-equipped elite now has a path.

## 2.8 The six required shapes, with the mechanics that make each work

| # | Shape | How it resolves |
| --- | --- | --- |
| 1 | **Ace 1 vs 6 mobs** | Slots cap incoming at 3 (~28 DPS after evasion). Ace clears ~600 HP with a sweep + cleave + `swarm` ×1.5 + momentum. **Narrow ace win.** |
| 2 | **2 elites vs 6 mobs** | Mobs split 3+3; each elite takes ~22 DPS against 200 HP. One AoE between the pair clears the pool in ~9 s. **Close elite win.** |
| 3 | **Mobs win legitimately** | Same fight, elites carrying only `basic_slash`: single-target kill rate (1 mob / 4 s) loses the race against attrition. **Mob win.** |
| 4 | **Anti-horde-equipped elite wins** | The differentiator is the loadout — `sweep`/`cleave` + `swarm` multiplier — not the stat line. |
| 5 | **Few + support** | A medic sustains through the slot-capped chip damage while the front-liner carves; heal-block becomes the horde's answer (now functional after PR #24). |
| 6 | **Colossal vs infantry** | Colossal has 12 slots — it *can* be swarmed. Its sweep hits 12. Infantry with `personal` weapons deal floor damage (measured 1/hit); infantry with `anti_armor`/`anti_ship` win. **Both sides have a path.** |

---

# Part 3 — Implementation surface

## 3.1 Adopted in V1

**Doom:** threshold execution (§1.1), rank table (§1.2), magnitude 25 and the
3 s imminent window (§1.3), caster link (§1.4 #4), doom resistance escalation
(§1.5), permanent colossal subsystem destruction (§1.6), the eight validator
constraints (§1.8).

**Anti-horde:** engagement slots (§2.2), multi-target fan-out (§2.3), corrected
power budget (§2.4), `swarm` semantics (§2.5), cleave, overkill spill, momentum,
stagger resistance (§2.6), encirclement and guard break (§2.7).

## 3.2 Deferred to V2

- Real geometry for shape selection (cones/lines resolved spatially rather than by caller-supplied target lists)
- Ranged attackers exempted from engagement slots, and cover
- Cooldown refund on kill (perpetual-loop risk — §4)
- Formation state as a first-class object (facing, ranks, breaking)
- Chain attacks that retarget dynamically
- Per-attacker dodge counters interacting with slots
- Direct-control stamina interactions for cleave and guard break

## 3.3 Type / schema changes

```ts
// combatAbilityTypes.ts
interface Effect {
  cleaveFraction?: number;      // 0–0.5, melee single_target only
  overkillSpill?: boolean;      // one hop, 50%
}
interface AbilityDefinition {
  onKill?: { momentumStacks?: number };   // V1: momentum only, no cooldown refund
}

// combatMechanicsResolver.ts
interface StatusInstance {
  sourceId?: string;            // caster link for lethal timers
}
interface MechanicsCombatant {
  sizeClass?: SizeClass;        // drives engagement slots; distinct from structureClass
  momentum?: { stacks: number; remainingSeconds: number };
  engagedBy?: string[];         // deterministic slot occupancy, participantOrder-ordered
  rank?: AbilityTier;           // doom execute threshold
}
type MechanicsMultiInput = {
  ability: AbilityDefinition;
  attacker: MechanicsCombatant;
  targets: MechanicsCombatant[];
  statuses: readonly StatusDefinition[];
};
```

`sizeClass` is deliberately separate from `structureClass`: the latter drives
the damage scale table, the former drives crowding. Conflating them would make
an armoured car un-swarmable.

## 3.4 Resolver changes

1. `resolveMechanicsMulti` — fan-out with index falloff (§2.3); the existing
   single-target path becomes the `maxTargets === 1` case.
2. Damage pipeline — apply the engagement-slot penalty (×0.25 beyond cap) and
   the `swarm` multiplier alongside the existing scale/armour/resist stages.
3. `advanceMechanicsState` — tick momentum decay; emit `doom_imminent` in the
   final 3 s; on lethal-timer expiry evaluate the execute threshold and route
   either execution or 20%-maxHp damage through `resolveLethality`.
4. Status removal when `sourceId` is no longer alive (checked once per tick).
5. Colossal doom conversion writes `subsystem.hp = 0`, not `disabledSeconds`.
6. Overkill spill and cleave, both explicitly non-recursive.

Golden Master parity is unaffected: every change is inside `mechanics_v1`, and
`legacy_gambit` never reaches this code.

## 3.5 Gambit semantic tags

**Conditions:** `enemy_count_above(n)`, `enemies_clustered(n)`,
`enemy_is_swarm`, `self_engaged_by_above(n)`, `self_has_momentum`,
`ally_doomed`, `self_doomed`, `doom_imminent`,
`ally_doomed_below_threshold`, `enemy_doomed_below_threshold`,
`doom_caster_alive`, `enemy_channeling_lethal`.

**Actions:** `use_area_ability`, `focus_doom_caster`, `cleanse_ally`,
`heal_doomed_ally`, `spread_out`, `encircle_target`, `interrupt_caster`,
`finish_doomed_enemy`.

`enemy_doomed_below_threshold` is the one that makes doom a *team* tool: a
gambit can now say "concentrate on the target that doom is about to be able to
execute," which is precisely the focus-fire behaviour §1.1 is designed to reward.

## 3.6 Combat Lab scenarios to add

| id | Purpose | Pass condition |
| --- | --- | --- |
| `doom_above_threshold` | Doom on a healthy 900 HP target | No execution; 180 damage; target lives |
| `doom_below_threshold` | Same target pre-damaged to 40% | Executes |
| `doom_healed_out` | Healer lifts target above threshold before expiry | No execution |
| `doom_caster_killed` | Caster dies mid-timer | Doom removed |
| `doom_vs_colossal` | Colossal target | One subsystem destroyed permanently; target alive |
| `doom_reapplied` | Two dooms on one target | Second needs ~2× buildup |
| `ace_vs_six_no_aoe` | Ace with `basic_slash` only | **Mobs win** |
| `ace_vs_six_with_aoe` | Ace with sweep + cleave | **Ace wins narrowly** |
| `two_elites_vs_six` | One AoE between the pair | **Close elite win** |
| `engagement_slot_cap` | 6 mobs, 1 medium defender | Only 3 at full damage; 3 at ×0.25 |
| `swarm_tag_multiplier` | AoE vs `swarm`-tagged vs untagged | ×1.5 vs `swarm` only |
| `aoe_in_duel` | Sweep vs one target | Loses decisively to single-target at equal budget |
| `overkill_spill_single_hop` | 200-damage hit on a 100 HP mob | Exactly one further target; no chain |
| `momentum_cap` | Five consecutive kills | Caps at 3 stacks |
| `colossal_vs_infantry` | 12 infantry vs colossal | Personal weapons floor at 1; anti-ship wins |

## 3.7 Ability examples (twelve)

Budget shown as `cost / budget` using §2.4.

| # | Ability | Shape / targets / falloff | Tier · cd | Effects | Budget |
| --- | --- | --- | --- | --- | --- |
| 1 | **Wide Sweep** | sweep · 6 · 0.5 | normal · 3.0 | damage 12 | 12×3.1 = 37 / 45 ✔ |
| 2 | **Cleaving Strike** | single_target · 1 (cleave 0.4 → 3 eff.) | normal · 1.2 | damage 14, `cleaveFraction 0.4` | 14×2.2 = 31 / 18 ✘ → cd 2.1 s |
| 3 | **Executioner's Mark** | single_target · 1 | elite · 8.0 | buildup 25 → `doom` | 25×1.5 = 38 / 180 ✔ |
| 4 | **Whirlwind** | sweep · 8 · 0.4 | elite · 4.0 | damage 10, `overkillSpill` | 10×4.4 = 44 / 90 ✔ |
| 5 | **Piercing Lance** | line · 4 · 0.8 | normal · 2.0 | damage 13, pierces | 13×2.5 = 33 / 30 ✘ → cd 2.2 s |
| 6 | **Suppressing Fire** | cone · 6 · 0.6 | normal · 2.5 | damage 8 + buildup 15 `slow` | 30.5×3.4 = 104 / 37 ✘ → cd 7 s |
| 7 | **Rally** | self · 1 | elite · 10.0 | `onKill.momentumStacks 2`, barrier 40 | 40×1 = 40 / 150 ✔ |
| 8 | **Vermin Cull** | area · 8 · 0.5 | normal · 3.0 | damage 9, ×1.5 vs `swarm` | 9×4.0 = 36 / 45 ✔ |
| 9 | **Guard Breaker** | single_target · 1 | normal · 2.0 | damage 10, strips interception 2 s | 10×1 = 10 / 30 ✔ |
| 10 | **Anti-Ship Lance** | single_target · 1 | boss · 6.0 | damage 120, `anti_ship`, pen 25 | 120×1 = 120 / 225 ✔ |
| 11 | **Doom Chorus** *(rejected)* | area · 6 · 1.0 | elite · 8.0 | buildup 25 → `doom` | **Rejected**: `LETHAL_TIMER_MULTI_TARGET` (§1.8 #8) |
| 12 | **Instant Word** *(rejected)* | single_target · 1 | normal · 2.0 | buildup 60 → `doom` | **Rejected**: tier too low, magnitude > 25, cooldown < 8 s, no counters |

Entries 2, 5 and 6 are shown failing the corrected budget on purpose: they are
the shapes most likely to be authored carelessly, and the formula catches all
three. Entries 11 and 12 demonstrate the §1.8 lethal-timer gate.

## 3.8 Abuse, loops, and strict-upgrade prevention

| Risk | Prevention |
| --- | --- |
| AoE becomes an auto-win | Budget priced by `pricedTargets` (§2.4) |
| AoE strictly better in a duel | Falls out of the same pricing — ~5.8× weaker per target |
| Cleave chains | Cleave damage cannot cleave |
| Overkill chain reaction | One hop, 50%, cannot trigger on-kill effects |
| Momentum perpetual loop | 3 stacks, 4 s, refresh-only, **no cooldown refund in V1** |
| Encirclement runaway | Flat +10% regardless of attacker count |
| Doom as a damage substitute | Threshold execution (§1.1) |
| Doom chaining on a boss | Resistance +50 per resolution, one subsystem per doom |
| Mass execution | `LETHAL_TIMER_MULTI_TARGET` |
| Stun-lock into execution | `LETHAL_TIMER_WITH_HARD_CONTROL` |
| Slot-gaming by body-blocking | Slot assignment is deterministic by `participantOrder`, re-evaluated per tick |
| `swarm` bonus stacking | Multiplier applies once per hit, not per source |

---

## Final report

### Doom V1 — final proposal

Doom stops being a kill and becomes a **threshold-gated execution**: it executes
only a target already at or below 50% (normal) / 35% (elite) / 20% (boss), never
executes a colossal, and otherwise lands as 20% of `maxHp` in damage. Buildup
drops 40 → 25 so it can never land sooner than a poison, the last 3 s become a
visible `doom_imminent` phase, doom dies with its caster, each resolution adds
+50 doom resistance, and against colossal targets it permanently destroys one
subsystem instead of killing. Eight counters exist, six of which are new or
newly real; eight validator rules stop an AI from generating an unfair instant
kill. The measured failure case — 14 impact damage killing a 900 HP target —
becomes impossible.

### Anti-horde V1 — final proposal

**Engagement slots** are the centrepiece: a medium defender can only be
meaningfully attacked by three opponents at once, with the excess at ×0.25. That
roughly halves incoming damage for an outnumbered unit without touching a single
stat. The offensive half is multi-target fan-out, cleave, one-hop overkill
spill, capped momentum, and the `swarm` tag giving anti-horde tools a ×1.5
multiplier. The horde keeps encirclement, guard break, stagger, and attrition,
so **an elite with only single-target tools still loses** — the measured result
stays valid, and the differentiator becomes the loadout rather than the stat
line. The corrected power budget, priced by expected target count rather than a
fixed shape constant, is what keeps AoE from becoming an auto-win and
simultaneously guarantees it can never be a strict upgrade in a duel.

### Minimum implementation set

1. `resolveMechanicsMulti` with index falloff, plus engagement-slot and `swarm`
   multipliers in the damage pipeline.
2. Threshold execution, `doom_imminent`, `sourceId` caster link, and permanent
   colossal subsystem destruction in `advanceMechanicsState`.
3. The corrected budget formula and the eight lethal-timer rules in
   `combatAbilityValidator.ts`.
4. Four new fields: `Effect.cleaveFraction`, `Effect.overkillSpill`,
   `StatusInstance.sourceId`, `MechanicsCombatant.{sizeClass, momentum, engagedBy, rank}`.

Everything else in this document is data or gambit authoring.

### Decisions needed from you (two)

1. **Re-price the six shipped AoE abilities, or grandfather them?** The
   corrected budget (§2.4) puts `kaiju_sweep`, `naval_bombardment`,
   `area_bombardment`, `ignite`, `fear` and `petrify_ray` over budget once
   fan-out makes their `maxTargets` real. Re-pricing means editing
   `resources/combat-abilities/v1-reference-abilities.json` — a resource change
   this task was told not to make, and one that will shift every Combat Lab
   measurement taken so far. Grandfathering means shipping six abilities that
   the validator would now reject.

2. **Should doom ever execute at all?** §1.1 keeps execution as a threshold
   finisher because the drama of a lethal timer is worth preserving. The
   stricter alternative is damage-only — doom becomes "20% of maxHp after 12 s,
   never a kill" — which removes every instant-death concern permanently at the
   cost of the mechanic's identity. This is a tone question about how lethal
   LoreRelay's combat should feel, and it is yours rather than mine.

COMBAT_LETHALITY_ANTI_HORDE_DESIGN_COMPLETE
