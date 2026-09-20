# Combat Mechanics Design — Resolution Pipeline, Effects, and Counterplay

Task ID: `COMBAT-MECHANICS-DESIGN-001`
Status: **design document only.** No implementation, tests, PR, or merge.
Track: optional system, default OFF.

Companion to `docs/COMBAT_SYSTEM_DESIGN.md` (which decides *which resolver runs
for which battle*). This document decides *what happens inside a single
exchange of blows* — and does so once, so that personal duels, gambit
skirmishes, one-versus-many sweeps, and army clashes share one rule set.

`src/gambitCombatCore.ts` is **not modified by this design.** See §1.2 for why
that constraint shapes the whole architecture.

This document authorizes only high-level design patterns. It does not authorize
copying rules, data, names, or numbers from any existing game.

---

## 1. Core Principles (基本原則)

### 1.1 Measured starting point

This design is written against the code as it actually exists, not against an
imagined baseline. Verified in `src/gambitCombatCore.ts` at the time of writing:

- Damage is `Math.max(1, attacker.attack - target.defense)` — a single flat
  subtraction with a floor of 1.
- **Every attack hits.** There is no accuracy, evasion, block, or critical roll.
- **There is no RNG anywhere.** No seed, no `Math.random`, no dice.
- There are no status effects, barriers, resistances, or damage types.
- Healing is `Math.min(max_hp - hp, heal_power)` — capped, no over-heal, no
  healing modifiers.
- Determinism is achieved by quantizing geometry through `Math.fround` (float32)
  to match the Godot reference implementation bit-for-bit.
- Sides are `team: 0 | 1`, with `enemyTeam = 1 - team` — strictly two sides.
- Combat state per unit is: `hp`, `max_hp`, `attack`, `defense`, `heal_power`,
  `move_speed`, `attack_range`, `attack_cooldown`, `radius`, `pos_x`, `pos_y`,
  plus internal `_cooldown_timer`, `_dead`, `_last_action`.

Everything in this document is therefore **additive**. Nothing here describes a
change to existing behavior.

### 1.2 The parity constraint is the architecture

`gambitCombatCore.ts` exists to prove the Godot → TypeScript port is faithful
(commit `b695687`, "8/8 Golden Master Parity"). Its entire value is that its
output matches the Godot reference exactly. Adding accuracy rolls, status
ticks, or barriers *into that file* would destroy the thing it exists to prove.

Therefore:

> **Mechanics live in a separate, pure module. The parity core is frozen and
> becomes the neutral-profile baseline.**

The binding compatibility rule:

> When every mechanic is at its neutral value — no evasion, no guard, no
> barrier, no resistance, no damage type, no status — the pipeline in §2 **must
> reduce exactly to `max(1, attack - defense)`**, and the existing Golden
> Master fixtures must still pass unchanged.

This is not a nicety. It is the regression test that keeps the mechanics layer
honest, and it means mechanics can be developed without ever risking the port's
credibility. Proposed home: a new `combatMechanicsCore.ts`, consumed by a future
combat runner — never called from inside the frozen parity core.

### 1.3 Determinism before mechanics

Introducing accuracy or status-application chance introduces randomness into a
core that currently has none. That is a real architectural cost and must be
paid deliberately:

- A seeded RNG stream is required, carried on the battle spec as an explicit
  causal input (consistent with the dice/ID receipt work already tracked in
  `docs/AI_REVIEW_BACKLOG.md` as `D2-001D`). Never `Math.random()`.
- **Every draw emits a receipt** recording what was rolled, for what, and
  against what threshold. An unreceipted roll is a bug.
- **Draws are consumed lazily.** A neutral profile consumes zero draws, so the
  existing fixtures remain byte-identical.
- Numeric domains are fixed: **HP, damage, armor, barrier, and stacks are
  integers.** Only geometry uses float32 (`Math.fround`), matching the current
  core. Percentages are applied in a defined order with a defined rounding step
  (§2.4) so no float drift enters the HP domain.

### 1.4 Every capability owes a counter

No mechanic ships without at least one documented, in-world way to beat it
(§9). This is the rule that keeps "invincible" from being a real state and keeps
the gambit AI meaningful — a gambit can only respond to a threat that has a
response. A capability whose counter is "bring more damage" does not count.

### 1.5 Mechanics are data, engines are not

Damage types, resistances, status definitions, and scale-conversion tables are
**data files**, following the pattern already established by Campaign Kit and
the genre packs. Adding a new poison must never require editing a resolver.

### 1.6 The output is still prose

Per `docs/COMBAT_SYSTEM_DESIGN.md` §0, the player reads a narrated battle. Every
stage below emits a receipt, and receipts are what the GM narrates. A mechanic
that cannot produce a legible beat ("her guard shattered", "the poison finally
took him") is mechanically real but narratively invisible, and should be
questioned.

---

## 2. Attack / Defense Resolution Pipeline (攻撃・防御処理パイプライン)

One ordered pipeline, used by every resolver. Stages are skipped, not
reordered. Each stage emits receipts.

```
 0. Targeting legality      → can this attack address this target at all?
 1. Hit determination       → hit / graze / miss
 2. Interception            → guard, parry, block, cover
 3. Damage assembly         → base, scale, damage type
 4. Penetration vs Armor    → flat reduction
 5. Resistance / Vulnerability → percentage multipliers (clamped)
 6. Minimum damage floor    → unless immune
 7. Absorption layers       → barrier / shield pools consumed before HP
 8. HP application          → subtract, floor at 0
 9. Lethality gate          → endure / undying / revive triggers
10. On-hit riders           → status application attempts (rolled separately)
11. Receipts                → atomic events emitted for narration & replay
```

### 2.1 Stage 0 — Targeting legality

Resolved before anything else, because "cannot be targeted" is categorically
different from "takes no damage".

- `untargetable` — the attack cannot select this unit. Must be time-boxed
  (§6.5).
- `stealth` — untargetable *by units that have not detected it*.
- Area effects declare whether they respect targeting legality; most do not,
  which is exactly how stealth and phasing get counterplay.

Failing this stage costs the attacker its action and cooldown but produces no
damage receipt — it emits `target_illegal`.

### 2.2 Stage 1 — Hit determination

```ts
type HitOutcome = 'hit' | 'graze' | 'miss';
```

- Compared value is `accuracy` against `evasion`, both integers, producing a hit
  chance clamped to a configured band (recommended floor/ceiling so nothing is
  ever a guaranteed miss or a guaranteed hit against evasion-type defenders).
- **`graze`** exists so that pure evasion stacking degrades gracefully instead
  of producing all-or-nothing whiffs; a graze applies reduced damage and
  suppresses on-hit riders.
- Attacks may carry `cannotBeDodged` (area, beams, unavoidable strikes) which
  skips this stage entirely — the primary counter to evasion-type defense.
- **Neutral profile: `evasion = 0` and hit chance resolves to certain hit with
  no draw consumed** — this is what preserves parity with the current core.

### 2.3 Stage 2 — Interception

Active defenses that consume a resource or a decision, distinct from passive
armor:

- `guard` — flat or percentage reduction while guarding; costs stamina/an action
  and can be broken by guard-break attacks.
- `parry` / `riposte` — negates and may return damage; narrow timing window.
- `cover` — positional, only valid from certain angles; ties directly to the
  facing/arc concepts in `docs/COMBAT_SYSTEM_DESIGN.md`.

Interception is where player and gambit *decisions* show up in the damage math,
which is why it is separate from armor.

### 2.4 Stages 3–6 — Damage assembly and reduction

Order is deliberate and load-bearing:

```
raw        = base attack value (+ weapon, + modifiers)
scaled     = raw × scaleMultiplier(attack.scale, target.structureClass)
armored    = scaled - max(0, targetArmor - attack.penetration)
resisted   = armored × resistMultiplier(damageType)          // clamped
floored    = max(minimumDamage, resisted)                    // unless immune
```

Rules:

- **Flat before percentage.** Armor is subtracted first, then resistances
  multiply. The reverse order makes armor scale absurdly against large hits.
- **Penetration reduces armor, not damage.** `max(0, armor - penetration)`
  means penetration can neutralize armor but never becomes bonus damage.
- **Resistance is clamped** to a configured band (e.g. -100%…+75%) so stacking
  cannot reach absolute immunity by accident. True immunity is a distinct,
  explicit state (§6.6), not the tail of a stacking curve.
- **Rounding happens once**, after all multipliers, using a single defined rule
  (recommended: truncate toward zero), so the integer HP domain never sees
  accumulated float error.
- **The minimum damage floor is a profile value (default 1)** — this is what
  reproduces the current `max(1, …)`. Critically, **immunity bypasses the
  floor**; otherwise an "immune" unit still takes chip damage and the immunity
  archetype is a lie.

`scaleMultiplier` keys on the **weapon's intended scale versus the target's
structure class**, not on the attacker's body size. A soldier with an anti-ship
missile should hurt a warship; a warship's point-defense gun should not shred
another warship's hull. Body size (`radius`, physical size class) governs hit
chance, turning, arcs, and access — not raw damage output.

### 2.5 Stage 7 — Absorption layers

Barriers, shields, and temporary HP are **pools consumed before HP**, resolved
in a declared order (recommended: shortest remaining duration first, so
expiring shields are spent rather than wasted).

- A pool declares what it absorbs (`all`, or specific damage types).
- A pool declares whether it blocks **on-hit riders** while intact — this is the
  difference between "a barrier that stops the poison" and one that only stops
  the numbers.
- Overkill beyond a pool spills into the next pool, then HP, in the same hit.
- Pool depletion emits its own receipt (`barrier_broken`) — a natural narration
  beat and a natural gambit trigger.

### 2.6 Stages 8–9 — HP application and the lethality gate

HP is subtracted and floored at 0. **Death is a separate decision from reaching
0 HP**, checked at the lethality gate, which is what makes "endure", "undying",
and revive-on-death expressible without special cases scattered through the
resolver:

- `endure` — survive at 1 HP; consumes the buff.
- `undying` — cannot drop below 1 for a duration.
- `revive_trigger` — dies, then returns under stated conditions.
- `trueDeath` on an attack bypasses all of the above — the counter.

Only after the gate resolves does a `death` receipt fire.

### 2.7 Stages 10–11 — Riders and receipts

On-hit status application is rolled **separately from the hit itself** (§3.3),
so a landed blow can still fail to poison. Grazes and fully-absorbed hits
suppress riders by default.

Receipts are atomic and describe what *happened*, never what can be inferred
afterwards from a before/after HP comparison. Minimum receipt vocabulary:

`target_illegal`, `miss`, `graze`, `intercepted`, `armor_absorbed`,
`resisted`, `barrier_absorbed`, `barrier_broken`, `damage_applied`,
`death_prevented`, `death`, `status_applied`, `status_resisted`,
`status_expired`, `status_cleansed`, `heal_applied`, `heal_blocked`.

These extend — not replace — the existing event arrays in
`CombatExpectedOutput` (`evaluations`, `decisions`, `attacks`, `heals`,
`deaths`, `focusChanges`).

---

## 3. Effect / Status Common Structure (Effect／Statusの共通構造)

### 3.1 One shape for everything

Buffs, debuffs, damage-over-time, control, barriers, and doom timers are all the
same structure. Only their fields differ.

```ts
type EffectDef = {
  id: string;
  tags: EffectTag[];              // semantic vocabulary — see §3.5 and §8
  category: 'dot' | 'control' | 'stat' | 'absorb' | 'doom' | 'aura';

  duration: EffectDuration;       // never a bare number — see §3.2
  stacking: StackingPolicy;       // see §3.4
  maxStacks?: number;

  // category payloads (all optional; a def uses what it needs)
  hpPerTick?: number;             // dot: negative = damage, positive = regen
  damageType?: string;
  statMods?: Partial<Record<CombatStat, { flat?: number; mul?: number }>>;
  control?: ControlPayload;       // skipAction / speedMul / cannotAct …
  absorbPool?: { amount: number; blocks: 'all' | string[]; blocksRiders: boolean };
  onExpire?: 'nothing' | 'execute' | 'detonate' | 'trigger';

  application: ApplicationRule;   // see §3.3
  cleansable: boolean;
  dispelPriority?: number;
};
```

### 3.2 Duration always carries a unit

The resolvers do not share a clock: the gambit core advances in fixed
sub-ticks, a skirmish resolver advances in rounds, and mass battle advances in
coarse rounds that narratively span days. A bare `durationRounds: number` means
something different in each and will silently desynchronize.

```ts
type EffectDuration =
  | { unit: 'tick'; value: number }
  | { unit: 'action'; value: number }     // N of the bearer's own actions
  | { unit: 'round'; value: number }
  | { unit: 'permanent' }
  | { unit: 'until_cleansed' }
  | { unit: 'while_condition'; conditionTag: string };
```

Each resolver declares its conversion to its own clock. Whether this ultimately
adopts the `ClockRef` vocabulary being settled in `docs/TERMINOLOGY_CONTRACT.md`
is deliberately left open — but a bare number is ruled out now.

Tick ordering within a step is fixed and must be specified once:
**expire-checks → DoT/regen application → control gating → action resolution.**
A status that expires this step does not gate this step's action.

### 3.3 Application is a contest, not a flag

Applying a status is separate from landing the hit:

```ts
type ApplicationRule = {
  power: number;                  // attacker-side application strength
  resistStat: string;             // which defender stat opposes it
  onResist: 'none' | 'reduced_duration' | 'partial_stacks';
  ignoresImmunity?: boolean;      // reserved for rare, explicitly-gated sources
};
```

Outcomes: `applied` / `reduced` / `resisted` / `immune`. Each emits a receipt.
`reduced_duration` is preferred over binary resist for most debuffs — it keeps
high-resistance targets meaningful without making status builds worthless.

### 3.4 Stacking is declared, never implicit

```ts
type StackingPolicy =
  | 'refresh'          // reapply resets duration; no intensity gain
  | 'stack_intensity'  // stacks add magnitude, one shared duration
  | 'stack_duration'   // stacks extend duration, fixed magnitude
  | 'independent'      // separate instances, each with own timer
  | 'ignore'           // reapplication does nothing while active
  | 'escalate';        // converts to a stronger effect at a threshold
```

`escalate` is how "enough bleeding becomes a crippling wound" or "stacked chill
becomes freeze" is expressed without bespoke code.

**Multiplicative stat stacking is forbidden by default.** Same-source `mul`
modifiers take the strongest rather than multiplying; only explicitly-tagged
`multiplicative` sources compound. This is the single most common source of
runaway numbers and is cheaper to prevent than to re-balance.

### 3.5 Control diminishing returns

Hard control must degrade under repetition, or chain-CC becomes an unanswerable
strategy:

> Successive applications of the same control tag to the same target within a
> defined window apply at reduced duration (e.g. full → half → quarter →
> immune), decaying back after the window elapses.

This is a mechanic-level counterplay guarantee, not a balance number, and
belongs in the core rather than in per-status data.

---

## 4. Status Catalogue (状態異常カタログ)

Canonical definitions. Numbers are deliberately omitted — these are shapes, and
values belong in genre data packs.

| Status | Category | Shape | Key property | Primary counters |
| --- | --- | --- | --- | --- |
| **毒 Poison** | dot | `stack_intensity` | Damage ignores armor (internal); does not break sleep | Antidote/cleanse, poison resistance, regen outpacing it |
| **炎上 Burn** | dot | `stack_intensity` | May also reduce armor or healing received; ignores barriers that only block impact | Water/immersion, cleanse, fire resistance, extinguish action |
| **出血 Bleed** | dot | `stack_duration` | Damage scales with the bearer's own movement/aggression | Staying still, first aid, bleed immunity (constructs, undead) |
| **睡眠 Sleep** | control | `refresh` | `cannotAct`; **damage wakes** (often with a bonus on the waking hit) | Any damage, noise/AoE, sleep immunity, cleanse |
| **麻痺 Paralysis** | control | `stack_intensity` | Intermittent action loss or severe speed reduction, not total lockout | Cleanse, resistance, escalating DR (§3.5) |
| **気絶 Stun** | control | `ignore` | Total action loss, deliberately short | Strong DR, stun immunity windows, cleanse |
| **石化 Petrify** | control | `refresh` | `cannotAct` **and** usually blocks other statuses and DoTs while active — a double-edged prison | Cleanse, shatter-vulnerability trade-off, resistance |
| **死の宣告 Doom** | doom | `ignore` | Timer with `onExpire: 'execute'`; does no damage until it fires | Cleanse before expiry, death-immunity, killing the caster if `while_condition` |

Notes that keep these honest:

- **Sleep must break on damage**, otherwise it is a strictly better stun and the
  distinction collapses.
- **Petrify blocking other effects** is what makes it situationally a *defensive*
  status — that ambiguity is the point and is good design, not a bug.
- **Doom must be visible** to the player and to gambits (§8) well before it
  fires. A hidden timer is not counterplay.
- **Large-scale units resist most hard control** by structure rather than by
  stat (§7.4) — you do not "stun" a warship, you disable a subsystem.

---

## 5. Healing and Support (回復・支援体系)

### 5.1 Healing

Current behavior (`Math.min(max_hp - hp, heal_power)`) is the neutral case and
stays valid. Extensions:

```
effectiveHeal = base × healingDealtMul × healingReceivedMul
applied       = min(effectiveHeal, maxHp - hp)      // unless overheal is allowed
overflow      = effectiveHeal - applied             // → shield, or discarded
```

- **`healingReceivedMul` is the hook for 回復阻害** (healing reduction), the
  designated counter to regeneration-type defense (§6.4). At 0 it is a full
  heal-block, which must be duration-limited and cleansable.
- Overheal defaults to **discarded**; converting overflow to a temporary shield
  is an opt-in effect, not the default, so healing does not silently become
  barrier generation.

### 5.2 Barriers and shields

Barriers are `category: 'absorb'` effects (§3.1) consumed at pipeline stage 7.
Distinguish two kinds explicitly, because conflating them causes balance
problems:

- **Absorb pool** — a finite HP-like buffer. Countered by burst damage.
- **Damage gate** — negates hits below a threshold, or the next N hits.
  Countered by *many small hits* or by a single hit above the gate.

They have opposite counters, which is precisely why both should exist.

### 5.3 Cleansing and dispelling

- **Cleanse** removes debuffs from an ally; **dispel** removes buffs from an
  enemy. Both respect `cleansable` and `dispelPriority` so a cleanse spends
  itself on the doom timer rather than on a trivial slow.
- Cleanse should be *targeted by tag* (`cleanse tag: 'control'`), not by status
  id — this is what lets gambits express "cure whatever is stopping our medic".

### 5.4 Revival

Revival is a **lethality-gate participant** (§2.6), not an HP heal. It must
declare: what fraction of HP is restored, whether a penalty is applied, whether
it can be prevented (`trueDeath`), and whether the corpse is a targetable
object. Given the project's existing "no destructive NPC deletion" stance in the
Living World systems, revival availability is a scenario/genre decision and
must default to unavailable rather than assumed.

---

## 6. Invulnerability and Defensive Archetypes (無敵・防御アーキタイプ)

"Invincible" is not one state. Seven distinct mechanisms, each with a distinct
counter — this is what makes defense a build choice rather than a stat check.

### 6.1 Evasion type (回避型)
High `evasion`; attacks miss. **Counters:** accuracy stacking, `cannotBeDodged`
attacks, area effects, immobilization, and the `graze` band that stops evasion
from being all-or-nothing.

### 6.2 Armor type (装甲型)
High flat `armor`; small hits are reduced to the minimum floor. **Counters:**
`penetration`, armor-break debuffs, fewer/larger hits, anti-armor weapon scale.
Naturally weak to exactly what evasion type resists.

### 6.3 Barrier type (バリア型)
Large absorb pools. **Counters:** burst above the pool, `barrier_broken`
punishes, DoT/riders that the pool does not block, dispel.

### 6.4 Regeneration type (再生型)
Sustained `hpPerTick` regen. **Counters:** healing reduction (§5.1), sustained
damage exceeding regen, burst that outruns the tick, execute thresholds.

### 6.5 Untargetable / phase (無敵時間・位相)
Cannot be addressed at all (stage 0). **This is the most dangerous archetype and
carries the hardest constraints:** it must be strictly time-boxed, must be
visible to the opponent, must not be self-sustainable indefinitely, and must
have at least one reveal/dispel counter. Area effects that ignore targeting
legality are the standing answer.

### 6.6 Immunity type (無効化型)
Categorical immunity to a damage type or status tag. Distinct from 100%
resistance (§2.4) and **bypasses the minimum damage floor.** **Counters:**
alternate damage types, immunity-strip effects, `ignoresImmunity` sources
(rare, explicitly gated).

### 6.7 Endurance / undying (不死型)
Survives lethal damage (§2.6). **Counters:** consuming the charge then killing
within the window, `trueDeath`, or preventing the trigger condition.

**Cross-cutting rule:** a single unit combining three or more archetypes at high
values should be treated as a **boss-tier design decision requiring an explicit
scripted counter**, not as an emergent stat outcome.

---

## 7. Scale Conversion (スケール別変換)

`docs/COMBAT_SYSTEM_DESIGN.md` establishes that one token may represent an
individual, a squad, a formation, or a domain. Mechanics must convert across
those grains rather than being redefined per grain.

### 7.1 The conversion principle

> As grain coarsens, **discrete state becomes statistical modifier.** A binary
> condition on one body becomes an efficiency or attrition term on a population.

### 7.2 Conversion table

| Mechanic | single_entity | squad | formation / strategic |
| --- | --- | --- | --- |
| Damage | HP subtraction | pooled HP / casualties | troop-strength attrition % |
| Stun / sleep | loses actions | fraction of unit combat-ineffective this step | initiative or effectiveness penalty for the round |
| Poison / burn | HP per tick | attrition per tick + medical load | ongoing attrition + supply strain |
| Bleed | HP scaling with action | casualty rate scaling with aggression | casualties scaling with offensive posture |
| Doom | executes the unit | eliminates a sub-element | officer loss / rout-chance spike |
| Barrier | absorb pool | fortification / prepared position | entrenchment, fortification stat |
| Evasion | miss chance | dispersion, reduced effective hits | maneuver advantage / avoided engagement |
| Regeneration | HP per tick | field medics, returning wounded | reinforcement / recovery rate |
| Heal-block | healing mul 0 | medics suppressed | supply line cut |

### 7.3 Effects that do not convert are dropped, not faked

If an effect has no meaningful aggregate reading at a coarser grain
("petrify one soldier" inside a 4,000-strong formation), it is **dropped with a
receipt** (`effect_out_of_scale`) rather than converted into a token modifier.
Silent fake conversion produces numbers nobody can justify and narration that
sounds wrong.

### 7.4 Structural control resistance

Control resistance is a function of **structure class**, not only stats. Hard
control (stun/sleep/petrify) should be structurally unavailable against
colossal targets; the equivalent effect against them is **subsystem disable**,
which composes naturally with the sub-part/turret concepts already sketched in
`docs/COMBAT_SYSTEM_DESIGN.md`. "Disable the engine" is the warship's stun.

### 7.5 Existing mass-battle compatibility

`src/massBattleCore.ts` resolves army battles with
`troops / quality / commanderSkill / fortification` and rock-paper-scissors
tactics. It is **not rewritten** to use this pipeline. Instead, converted
effects (§7.2) map onto its existing inputs — attrition to `troops`, disruption
to `quality`, entrenchment to `fortification` — via an adapter. Mechanics reach
army scale as *modifiers to the existing resolver*, not as a replacement for it.

---

## 8. Gambit Integration (ガンビット連携)

The gambit engine's value is that units react intelligently. New mechanics are
only worth their cost if gambits can see and respond to them.

### 8.1 Gambits read tags, never internals

Existing conditions (`self_hp_below`, `ally_hp_below`, `backline_threatened`,
`enemy_in_range`, `enemy_too_close`, `nearest_enemy_exists`) stay valid and
unmodified. New conditions follow the same `{ cond, param, action }` shape so
authored gambit lists remain forward-compatible:

**Proposed conditions**

| Condition | Purpose |
| --- | --- |
| `self_has_effect(tag)` | react to own state |
| `ally_has_effect(tag)` | cleanse / rescue triggers |
| `enemy_has_effect(tag)` | focus the doomed, avoid the immune |
| `ally_incapacitated` | a control-specific rescue trigger |
| `self_barrier_below(frac)` | re-shield before collapse |
| `enemy_barrier_above(frac)` | switch to burst or wait |
| `enemy_untargetable` | stop wasting actions on a phased target |
| `self_healing_blocked` | disengage instead of expecting heals |
| `enemy_armor_above(v)` | swap to penetrating attack |
| `ally_doomed` | prioritize the lethal timer |

**Proposed actions**

`cleanse_ally`, `dispel_enemy`, `shield_ally`, `revive_ally`,
`focus_lowest_barrier`, `focus_doomed_enemy`, `use_penetrating_attack`,
`extinguish_self`, `hold_action_until_effect_expires`.

### 8.2 The tag vocabulary is the contract

Gambits must be authorable against tags, not status ids, so genre packs can add
new statuses without rewriting gambit lists:

`control`, `dot`, `lethal_timer`, `movement_impairing`, `healing_impairing`,
`armor_impairing`, `dispellable`, `beneficial`, `harmful`, `stealth`,
`untargetable`, `structural`.

"Cleanse any `control` on an ally" must work for a status invented later.

### 8.3 Perception limits

A gambit may only condition on what the unit could plausibly know. Hidden
statuses, enemy internal stats, and undetected stealth units are not readable.
This prevents omniscient AI and creates real value for detection/scouting
abilities — and it matters more here than usual, because the same receipts feed
GM narration, which must not describe knowledge the actor lacked.

### 8.4 Evaluation cost

Gambits are evaluated per unit per tick. Effect predicates must be **O(1)
lookups against a precomputed per-unit tag set**, not scans over an effect list,
or the per-tick cost grows with status count in exactly the scenarios (large
battles) where it is least affordable.

---

## 9. Counterplay Matrix (Counterplay一覧)

The §1.4 obligation, discharged. Every row must be satisfiable in-world.

| Capability | Primary counter | Secondary counter | Structural safeguard |
| --- | --- | --- | --- |
| High evasion | Accuracy / `cannotBeDodged` | Area effects, immobilize | `graze` band; hit-chance clamp |
| Heavy armor | Penetration | Armor-break; larger hits | Penetration reduces armor, never adds damage |
| Large barrier | Burst above pool | Dispel; rider-bypassing DoT | `barrier_broken` receipt as a punish window |
| Damage gate | Many small hits | Threshold-exceeding hit | Explicitly opposite counter to absorb pools |
| Regeneration | Healing reduction | Sustained DPS; execute | Heal-block is duration-limited & cleansable |
| Untargetable | Area effects ignoring stage 0 | Reveal / dispel | Mandatory time-box + visibility |
| Immunity | Alternate damage type | Immunity-strip | Immunity is explicit, never emergent stacking |
| Undying / endure | Consume charge, then kill | `trueDeath` | Lethality gate is a single choke point |
| Reflect / riposte | Ranged / DoT damage | Bait the window | Timing window is narrow by construction |
| Hard control chains | Diminishing returns | Cleanse; control immunity | DR is core behavior, not per-status data |
| Doom timer | Cleanse before expiry | Kill caster (`while_condition`) | Must be visible to player and gambits |
| Stacking DoT | Cleanse; regen | Resistance | `stack_intensity` capped by `maxStacks` |
| Stat buff stacking | Dispel | Debuff | Same-source `mul` takes strongest, no multiply |
| Alpha-strike burst | Guard / interception | Barriers; positioning | Interception costs a resource, so it is a real choice |

---

## 10. First Implementation Scope and Future Extensions (第一実装範囲と将来拡張)

This project has a documented failure mode of building large substrate before
play-testing. The first slice is therefore deliberately small, and the first
milestone is *proving nothing changed*.

### 10.1 V1 — the neutral pipeline (proves parity)

Build the §2 pipeline with **only** these stages active: damage assembly, flat
armor, minimum floor, HP application, receipts. No RNG, no statuses, no
barriers.

Exit criterion: `resolveDamage` with a neutral profile returns exactly
`max(1, attack - defense)`, and the existing Golden Master fixtures pass
unchanged. **If this milestone is hard, the architecture is wrong** — that is
the point of doing it first.

### 10.2 V2 — absorption and two DoTs

Add stage 7 (absorb pools), the `EffectDef` structure (§3), duration units
(§3.2), and exactly two statuses: **poison** and **burn**. Add the corresponding
gambit conditions `self_has_effect` / `ally_has_effect`. Still no RNG.

This is the first point at which a battle log gets meaningfully richer, so it is
the right point to check whether GM narration actually improves.

### 10.3 V3 — control, cleanse, and seeded RNG

Add **stun** (with §3.5 diminishing returns), cleanse, healing modifiers, and
the seeded RNG stream with receipts (§1.3). Hit determination (§2.2) arrives
here, defaulting to certain-hit.

RNG entering the system is a determinism-spine event and should be gated
against whatever `D2-001D` settles.

### 10.4 V4 and beyond

Remaining statuses (bleed, sleep, paralysis, petrify, doom), interception
(guard/parry/cover), resistance tables, immunity, endure/undying, revival,
untargetable/stealth, and the §7 scale-conversion adapter onto
`massBattleCore`.

### 10.5 Non-goals for all versions

- No modification to `src/gambitCombatCore.ts` — it stays frozen as the parity
  baseline.
- No rewrite of `src/massBattleCore.ts` — mechanics reach it via adapter (§7.5).
- No `Math.random()` anywhere; no unreceipted RNG draw.
- No float arithmetic in the HP/damage domain.
- No implicit multiplicative stat stacking.
- No mechanic without a §9 counterplay entry.
- No status defined in code that could be defined in data.
- No combat prompt injection or writeback while the feature flag is OFF.
- No implementation, tests, PR, or merge from this document.

### 10.6 Open questions deferred to other gates

1. Whether `EffectDuration` adopts `ClockRef` from `docs/TERMINOLOGY_CONTRACT.md`
   or keeps a local unit enum.
2. Whether the RNG stream reuses the `D2-001D` dice/ID receipt machinery.
3. How `WritebackOp` carries surviving statuses out of a battle into persistent
   character/vehicle ledgers — owned by the State Orchestrator work, not here.
4. Whether sides generalize beyond `team: 0 | 1`; the current parity core is
   strictly two-sided, and three-way battles would require the mechanics layer
   to carry a side identifier the frozen core does not have.
