# Combat Ability Authoring Contract

Task ID: `COMBAT-ABILITY-AUTHORING-001`
Base: `daa39e4`
Status: **design document only.** No code, fixture, or numeric-rule changes.

Defines how skills, spells, weapons, statuses, and support abilities are
authored — by a human, by a genre pack, or by an AI — so that a free-form world
can invent new abilities without the combat system breaking.

Inputs read: `docs/COMBAT_SYSTEM_DESIGN.md`, `docs/COMBAT_MECHANICS_DESIGN.md`,
`docs/COMBAT_MECHANICS_V1_RULESET.md`, `src/gambitCombatCore.ts`.

---

## 0. Amendments to the V1 Ruleset

This document **supersedes three rules** in
`docs/COMBAT_MECHANICS_V1_RULESET.md`. Recorded explicitly so the two documents
do not silently contradict each other. Everything else in the V1 ruleset stands
unchanged.

| V1 rule | Superseded by | Reason |
| --- | --- | --- |
| §2.5 / §4.1 — "poison, burn and bleed bypass barriers entirely" | §4 Penetration conditions | A blanket bypass is too broad. Poison should not cross a barrier that no flesh was touched through; bleed should not appear on an untouched target; burn should behave differently against an energy shield than against a physical one. |
| §2.2 — deterministic dodge counter as *the* evasion rule | §6 Dual-profile conversion | The counter is correct for automated resolution. Direct player control needs a dodge action, i-frames, stamina, and recovery. Same stat, two expressions. |
| §7.2 — control converts to a **named** subsystem (main gun / engine / bridge) | §8 Subsystem **tags** | Fixed part names do not exist on a kaiju, a fortress, or a spirit. Conversion must target a declared subsystem tag the entity actually has. |

No numeric value in the V1 ruleset changes. No existing code, fixture, or
Golden Master parity is affected.

---

## 1. Ability, Effect, Status, Delivery (関係)

### 1.1 The four layers

```
Ability   — the authored, nameable thing a unit can use ("毒矢")
  ├ Delivery — HOW it reaches targets (shape, range, dodgeability)
  └ Effect[] — WHAT happens on arrival (damage, buildup, heal, barrier…)
        └ Status — WHAT PERSISTS afterwards (poison, stun, regen)
```

The separation is the whole point:

> **Delivery decides *who* is hit. Effect decides *what happens*. Status decides
> *what persists*.**

A new ability is a **recombination of existing parts**, never new resolver code.
"Poison arrow" and "poison gas cloud" share one poison Status and one poison
Effect; they differ only in Delivery.

### 1.2 Schema

```ts
type Ability = {
  id: string;
  name: string;
  tier: 'normal' | 'elite' | 'boss' | 'legendary';   // budget multiplier, §9.2
  delivery: Delivery;
  effects: Effect[];
  auto: AutoProfile;                                  // §6.1
  direct?: DirectProfile;                             // §6.2 — optional
  scaleBehavior: ScaleBehavior;                       // §7
  counters: string[];                                 // §9.3 — mandatory, non-empty
  tags: string[];
};

type Effect = {
  kind: 'damage' | 'buildup' | 'heal' | 'barrier' | 'dispel' | 'cleanse'
      | 'displace' | 'revive' | 'stat_mod' | 'subsystem_damage';
  vector: Vector;                    // §3
  penetration: PenetrationProfile;   // §4
  targetRequirement: TargetTag[];    // §8.1 — what the target must be
  magnitude: number;
  statusId?: string;                 // for kind: 'buildup'
  weaponScale?: WeaponScale;         // reuses V1 ruleset §2.3
};
```

An `Effect` never contains geometry, and a `Delivery` never contains damage.
Violating that separation is the most common authoring error (§9.4).

### 1.3 Resolution order

Per target hit by the Delivery, Effects resolve **in array order**, and each
subsequent Effect sees the results of the previous one. This is what makes
`requiresDamageDealt` (§4.3) work: a bleed Effect placed after a damage Effect
can read whether damage actually landed.

Ordering rule: **damage Effects precede buildup Effects.** An authoring
validator should reject the reverse (§9.4).

---

## 2. Attack Shapes (攻撃形状)

### 2.1 Delivery schema

```ts
type Delivery = {
  shape: Shape;
  range: number;              // px, same units as attack_range
  width?: number;             // line / beam
  angle?: number;             // cone, degrees
  radius?: number;            // area
  pulses?: number;            // barrage / beam ticks
  maxTargets: number;         // hard cap — see §2.3
  falloff: number;            // 0.0–1.0 damage at the edge
  dodgeable: boolean;
  blockedByCover: boolean;
  pierces: boolean;           // continues through the first target
};
```

### 2.2 The eight shapes

| Shape | Geometry | Default `maxTargets` | `dodgeable` | Budget multiplier (§9.2) |
| --- | --- | --- | --- | --- |
| `single_target` | one unit | 1 | yes | ×1.0 |
| `cone` | angle + length from origin | 6 | yes | ×1.6 |
| `line` | width + length, pierces | 6 | yes | ×1.8 |
| `area` | circle at a point | 8 | **no** | ×2.0 |
| `beam` | sustained line, ticks over time | 4 | **no** | ×2.2 |
| `barrage` | N discrete impacts over time | 12 | yes (each pulse) | ×2.2 |
| `sweep` | wide arc, melee-range | 12 | yes | ×2.5 |
| `self` / `aura` | no targeting, or persistent radius | — | — | ×1.4 |

`area` and `beam` are **not dodgeable** — this is the standing counter to the
evasion archetype (V1 ruleset §6.1) and is why evasion builds must respect
positioning.

### 2.3 Target caps are mandatory

Every Delivery declares `maxTargets`. When more valid targets exist than the
cap, selection is **deterministic by `participantOrder`** — the same ordering
convention `src/gambitCombatCore.ts` already uses for every search. Never by
proximity ties, never by insertion order into a temporary array.

Caps exist for two reasons at once: they bound per-tick cost in exactly the
large battles where cost matters, and they stop `sweep` from being an "I win"
button against a hundred-unit formation.

### 2.4 Area must trade damage for coverage

`falloff` is the fraction of damage delivered at the shape's outer edge; damage
scales linearly from full at the origin to `falloff` at the edge. Recommended
defaults: `single_target` 1.0, `cone` 0.7, `line` 0.8, `area` 0.6, `sweep` 0.5,
`beam` 1.0 (compensated by a long cooldown), `barrage` 0.7.

Combined with the §9.2 budget multipliers, this is what prevents "just make
everything area" from being the dominant authoring strategy.

### 2.5 Where the sweep fantasy lives

`sweep` with a high `maxTargets` and `anti_ship` weapon scale is the
"battleship clears the mob" / "kaiju scatters the tanks" case. It is expensive
in budget (×2.5, plus the tier multiplier) and pays for it with a long
cooldown — which is exactly the intended feel: devastating, and rare.

---

## 3. Vectors — Paths of Action (作用経路)

### 3.1 The five vectors

```ts
type Vector = 'physical' | 'magical' | 'technological' | 'mental' | 'biological';
```

A vector determines four things at once: which barriers stop it (§4.2), which
resistance stat opposes it, which immunities are *logically* true, and which
counters exist.

| Vector | Typical sources | Logically immune | Primary counter |
| --- | --- | --- | --- |
| `physical` | blades, bullets, impact, crushing | — | armor, kinetic barriers |
| `magical` | spells, curses, enchantment | anti-magic constructs | arcane wards, magic resistance |
| `technological` | targeting systems, EMP, hacking, nanomachines | pre-industrial organics | energy shields, hardening |
| `mental` | fear, taunt, sleep, illusion, domination | mindless constructs, structures | mental wards, resolve |
| `biological` | venom, disease, parasites, rot | constructs, structures, spirits | antitoxin, vital barriers |

### 3.2 Why this matters for free-form authoring

This is what makes "neurotoxin against a robot does nothing" a **derived
consequence** rather than a special case someone remembered to write. The
author declares `vector: 'biological'` and `targetRequirement: ['living']`; the
resolver refuses the application and emits `effect_target_invalid`. No
per-monster immunity list is needed.

It also lets one concept split correctly. "Poison" is not one thing:

| Concept | Vector | Target requirement | Notes |
| --- | --- | --- | --- |
| 蛇毒 Snake venom | `biological` | `living` | Antitoxin cures |
| 神経毒 Neurotoxin | `biological` | `living` | Also applies `paralysis` buildup |
| ナノマシン汚染 Nanite corruption | `technological` | `living`, `construct`, `vehicle` | Works on machines; EMP cures |
| 呪毒 Curse-rot | `magical` | any | Dispel cures; ignores biology |
| 放射線障害 Radiation | `technological` | `living` | Slow onset, no quick cleanse |

Five "poisons" — one Status shape, five different vectors, target sets, and
cures. This is the flexibility the free-form world requires.

---

## 4. Penetration Conditions (侵入条件)

**This section replaces the V1 ruleset's blanket "DoT bypasses barriers" rule.**

### 4.1 The three layers

Every target presents up to three layers, resolved outward-in, matching the V1
damage pipeline (S8 barrier → S4 armor → S9 HP):

```
Barrier  →  Armor  →  Body
```

### 4.2 Barriers declare what they block

Rather than a vector × barrier-type matrix (which is O(n²) to author and hostile
to AI generation), **each barrier declares the vectors it stops**:

```ts
type BarrierPool = {
  amount: number;
  type: 'kinetic' | 'energy' | 'arcane' | 'vital' | 'universal';
  blocksVectors: Vector[];
  blocksStatusApplication: boolean;   // does it also stop buildup passing through?
};
```

Recommended defaults:

| Barrier type | Blocks vectors | Blocks buildup | Flavour |
| --- | --- | --- | --- |
| `kinetic` | `physical` | yes | Deflector, physical shield wall |
| `energy` | `physical`, `technological` | yes | Sci-fi shield; **transparent to magic and mind** |
| `arcane` | `magical`, `mental` | yes | Ward; **does not stop a bullet** |
| `vital` | `biological` | yes | Living membrane, antibody field |
| `universal` | all five | yes | Boss-tier only; must be time-boxed |

An Effect passes a barrier when its `vector` is **not** in `blocksVectors`.
This gives every barrier a designed hole, which is the counterplay guarantee
(§9.3) applied at the layer level.

### 4.3 Effects declare their entry requirements

```ts
type PenetrationProfile = {
  barrier: 'blocked' | 'passes' | 'consumed' | 'attenuated';
  armor:   'blocked' | 'passes' | 'reduced';
  requiresBodyContact: boolean;   // must have reached the Body layer
  requiresDamageDealt: boolean;   // must have dealt ≥1 HP damage this hit
};
```

- `consumed` — the effect spends barrier HP to get through (partial passage).
- `attenuated` — passes at **×0.5** magnitude.
- `requiresBodyContact` — the corrected poison rule: venom that never reached
  flesh does not poison.
- `requiresDamageDealt` — the corrected bleed rule: you cannot bleed a target
  that took no damage.

### 4.4 The corrected DoT specifications

Superseding V1 ruleset §4.1:

| Status | Vector | barrier | armor | Body contact | Damage dealt | Net behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| **毒 Poison** | `biological` | blocked | `blocked` | **yes** | no | Must reach living tissue. A full-armor absorption prevents it. `vital` barriers stop it outright. |
| **神経毒 Neurotoxin** | `biological` | blocked | `reduced` | **yes** | no | As poison, plus `paralysis` buildup |
| **炎上 Burn** | `magical` *or* `technological` | `attenuated` | `passes` | no | no | Crosses a `kinetic` barrier at half rate; **stopped by `energy` shields**; ignores armor |
| **腐食 Corrosion** | `technological` | `consumed` | `passes` | no | no | Weak to barriers, strong against armor — the deliberate inverse of burn |
| **出血 Bleed** | `physical` | blocked | `blocked` | yes | **yes** | Applies only when real HP damage landed |

Burn and corrosion being mirror images is intentional: an author choosing
between them is making a real tactical decision about the enemy's defense
layer, not picking a reskin.

### 4.5 Receipts

Failure to penetrate is never silent. Emit `penetration_blocked` with the layer
that stopped it, `effect_target_invalid` for a vector/target mismatch, and
`effect_attenuated` when magnitude was halved. These feed both the GM narration
("the venom found only steel") and gambit conditions (§8.4).

---

## 5. Buildup, Onset, Duration, Removal, Reapplication

All numeric rules from V1 ruleset §3 stand unchanged: threshold 100, applicator
values 15/25/40, resistance multiplier `1 + resist/100`, escalation `+50%` per
proc capped at 4, decay 10/s after 2.0 s, and control diminishing returns
100→50→25→immune.

This document adds only the authoring-side rules:

### 5.1 Buildup passes only if the Effect penetrated

A `kind: 'buildup'` Effect that fails §4 applies **zero** buildup. Partial
penetration (`attenuated`) applies **half**. This is what stops "the barrier
blocked the damage but the poison went through anyway".

### 5.2 Reapplication

Reapplication follows the Status's declared `stacking` policy (V1 ruleset §3.1).
Authors do not choose per-ability stacking — it belongs to the Status, so two
abilities applying the same Status cannot disagree about how it stacks.

### 5.3 Cure channels

Every Status declares which removal channels work on it:

```ts
cureChannels: ('cleanse' | 'dispel' | 'antitoxin' | 'emp' | 'extinguish'
             | 'damage' | 'time' | 'none')[];
```

This is what lets the five poisons of §3.2 share one shape while having
genuinely different cures. **`none` is forbidden below `boss` tier** (§9.3).

---

## 6. Automated vs Direct Control (自動戦闘と直接操作への変換)

**This section supersedes the V1 ruleset's treatment of evasion as a single
rule.**

### 6.1 Two profiles, one truth

```ts
type AutoProfile = {
  cooldown: number;          // seconds
  buildupValue?: number;
  gambitTags: string[];      // how gambits reason about it, §8.4
};

type DirectProfile = {
  windupMs: number;          // cast/wind-up
  activeMs: number;          // hitbox live
  recoveryMs: number;        // 硬直 — cannot act
  staminaCost: number;
  iframeMs?: number;         // dodge/blink abilities
  justWindowMs?: number;     // just-dodge / parry timing window
};
```

The binding rule:

> **The auto profile is authoritative for outcomes.** The direct profile is an
> interaction layer that must not produce results the auto profile could not.

If a directly-controlled character could achieve outcomes impossible under
automation, the same character would behave differently depending on who is
driving — which breaks the truth-engine premise in
`docs/COMBAT_SYSTEM_DESIGN.md` §0, and makes the narrated log unreliable.

### 6.2 Conversion table

| Concept | Automated resolution | Direct control |
| --- | --- | --- |
| Evasion | Deterministic dodge counter (V1 §2.2) | i-frame duration + stamina pool |
| Avoiding an attack | Counter reaches interval | Player presses dodge, spends stamina |
| Just-dodge | Treated as **`evasion +8`** while stamina remains | Timing window `justWindowMs`, full negation + counter opening |
| Recovery (硬直) | Folded into `cooldown` | Real `recoveryMs` during which input is locked |
| Cast time | Folded into `cooldown` | Real `windupMs`, interruptible |
| Stamina | Not modelled | Real resource, gates dodge spam |
| Blink / phase | 2.0 s untargetable, 15 s cooldown (V1 §6.5) | Same window as literal i-frames |

### 6.3 The equivalence constraint

`evasion` converts to i-frames by:

```
iframeBudgetPerSecond = evasion / 100 × 1.0s
staminaPool          = 100
dodgeStaminaCost     = 25          // 4 dodges before exhaustion
staminaRegen         = 20 / second
```

At `evasion 25`, a player receives 0.25 s of i-frames per second of combat —
the same 25% mitigation the auto counter provides, **but the player chooses
when to spend it.** A perfect player converts that into avoiding the four most
dangerous hits; a poor player wastes it. The ceiling is identical; only the
distribution differs. That is skill expression without stat inflation.

Just-dodge grants `evasion +8` in auto mode rather than a separate mechanic, so
a companion running on gambits still benefits from having learned it.

### 6.4 Which profile runs

Determined by the encounter's Control Mode
(`docs/COMBAT_MECHANICS_DESIGN.md` §1.2): `direct` uses `DirectProfile`;
`directive`, `doctrine`, and `observer` use `AutoProfile`. An ability with no
`DirectProfile` is auto-only and is unavailable to a directly-controlled
character — which is a legitimate design statement, not an error.

---

## 7. Scale Conversion (個人・巨大目標・部隊・艦隊)

### 7.1 Every ability declares its behaviour

```ts
type ScaleBehavior = {
  individual: 'full';
  huge: 'full' | 'convert_subsystem' | 'attenuate' | 'drop';
  squad: 'full' | 'aggregate' | 'drop';
  fleet: 'full' | 'single_member' | 'flagship_only' | 'drop';
};
```

Numeric conversions are unchanged from V1 ruleset §7.2–§7.4. This document
requires only that the declaration is **explicit per ability**, so nothing
converts by accident.

### 7.2 Dropping is honest; faking is not

An ability whose declaration is `drop` at a given grain emits
`effect_out_of_scale` and does nothing. Inventing a plausible-looking aggregate
modifier for an effect that has no aggregate meaning produces numbers nobody can
justify and narration that reads wrong.

---

## 8. Target Tags and Subsystem Tags (対象タグとサブシステムタグ)

### 8.1 Target tags

```ts
type TargetTag = 'living' | 'construct' | 'undead' | 'spirit'
               | 'structure' | 'vehicle' | 'swarm' | 'colossal';
```

An Effect's `targetRequirement` lists what the target must be. Empty = any.
This is the mechanism behind §3.2's vector legality, and it is checked before
anything else resolves.

### 8.2 Subsystem tags replace named parts

**This supersedes V1 ruleset §7.2's named subsystems.** A colossal entity
declares its own parts, each mapped to a **tag**:

```ts
type SubsystemTag = 'locomotion' | 'primary_weapon' | 'sensor'
                  | 'command' | 'power' | 'structure' | 'life_support';
```

The same conversion rules then work on anything colossal:

| Entity | `locomotion` | `primary_weapon` | `sensor` | `command` | `power` |
| --- | --- | --- | --- | --- | --- |
| Warship | engines | main battery | radar mast | bridge | reactor |
| Giant mech | leg actuators | arm cannon | optics | cockpit | core |
| Dragon | wings | breath organ | senses | mind | heart |
| Fortress | (none) | gun emplacements | watchtowers | command post | generator |
| Colossal beast | legs | jaws | eyes | (none) | heart |

### 8.3 Conversion by tag, not by name

V1 ruleset §7.2's table is re-expressed:

| Status | Converts to disabling… | Duration |
| --- | --- | --- |
| 気絶 Stun | `sensor` | 4.0 s |
| 麻痺 Paralysis | `locomotion` | 6.0 s |
| 睡眠 Sleep | `command` | 5.0 s |
| 沈黙 Silence | `primary_weapon` | 6.0 s |
| 石化 Petrify | `locomotion` + incoming ×0.5 | 5.0 s |
| 死の宣告 Doom | **critical damage to the highest-priority subsystem the entity actually has** | permanent |

Doom's target is resolved by walking a fixed priority order —
`power` → `command` → `primary_weapon` → `locomotion` → `sensor` — and taking
the first tag the entity declares. A warship loses its reactor; a fortress loses
its generator; a dragon loses its heart; a beast with no `power` or `command`
loses its jaws. **No entity needs a bespoke rule, and nothing references a part
name that may not exist.**

If an entity declares no subsystems at all, doom resolves normally as death.

### 8.4 Gambit-visible tags

Abilities declare `gambitTags` so gambits can reason about them without knowing
ability ids: `opener`, `finisher`, `interrupt`, `cleanse`, `escape`,
`anti_armor`, `anti_barrier`, `crowd_control`, `sustain`, `burst`.

Combined with the V1 ruleset §8 conditions, this is what lets an authored
gambit say "use an `anti_barrier` ability when `enemy_barrier_above 0.5`"
without enumerating every ability that might qualify.

---

## 9. Validation for AI-Generated Abilities (妥当性検証)

The rules an authoring validator enforces. An ability failing any hard check is
**rejected, not clamped** — silent clamping hides generation errors and produces
abilities whose name no longer matches their behaviour.

### 9.1 Structural checks (hard)

1. `counters` is non-empty (§9.3).
2. `scaleBehavior` declares all four grains.
3. Every Effect's `vector` is legal against its `targetRequirement` (§3.1) —
   e.g. `biological` + `targetRequirement: ['construct']` is rejected.
4. Every `buildup` Effect names a Status that exists.
5. Delivery contains no damage values; Effects contain no geometry (§1.2).
6. `maxTargets` is present and within the §2.2 cap for its shape.
7. Damage Effects precede buildup Effects in the array (§1.3).
8. Status `cureChannels` is non-empty unless `tier` is `boss` or above (§5.3).

### 9.2 Power budget (hard)

```
cost   = (damage + buildupValue × 1.5 + heal × 1.2 + barrier × 1.0)
         × shapeMultiplier
budget = 15 × cooldownSeconds × tierMultiplier

tierMultiplier: normal 1.0 · elite 1.5 · boss 2.5 · legendary 4.0
```

Reject when `cost > budget × 1.1` (10% tolerance). The 15/second baseline is
derived from the shipped roster's median 13 ATK at 1.0 s cooldown
(V1 ruleset §1.1), so a generated ability is measured against what actually
exists rather than against an invented ideal.

Worked checks:

- 通常斬撃 — damage 14, ×1.0, cd 0.9, normal → cost 14, budget 13.5. At the
  line, as a baseline attack should be.
- 範囲爆撃 — damage 22, ×2.0, cd 3.0, normal → cost 44, budget 45. Passes.
- 巨大怪物の薙ぎ払い — damage 40, ×2.5, cd 6.0, boss → cost 100, budget 225.
  Comfortably legal, which is correct for a boss set-piece.

### 9.3 Counterplay requirement (hard)

Every ability declares at least one counter, and the following **must** declare
a specific, in-world counter rather than "deal more damage":

hard control · lethal timers · untargetability · healing denial · immunity ·
any effect lasting more than 8.0 s.

Rejected outright at any tier below `boss`: permanent hard control,
unconditional immunity, undodgeable-and-unblockable combinations, and
`cureChannels: ['none']`.

### 9.4 Soft warnings (advisory)

Flag but allow: cooldown under 0.5 s; more than three Effects on one Ability;
`maxTargets` above 8 outside `sweep`/`barrage`; an ability that is strictly
better than an existing one at the same tier; a Status duration exceeding 30% of
a typical 20 s engagement.

### 9.5 Generation guidance for AI authors

- Start from an existing ability and change **one** axis — vector, shape, or
  status. Whole-cloth invention is where budget violations come from.
- Prefer a new **vector** over a new Status. Five poisons (§3.2) needed zero new
  Status definitions.
- The interesting design space is `PenetrationProfile`, not damage numbers.
  "Strong against armor, weak against barriers" is a more useful ability than
  "the same thing but +20%".
- Name the counter first, then build the ability. An ability whose counter you
  cannot state is one the validator will reject anyway.

---

## 10. Twenty Reference Ability Definitions (代表的な能力20件)

Compact form: `delivery | vector | penetration | effects | cd | counters`.
All satisfy §9.2.

### Physical attacks

**1. 通常斬撃 Basic Slash** — the parity baseline
`single_target r48 | physical | barrier:blocked armor:blocked | damage 14 (personal) | cd 0.9`
Counters: armor, kinetic barrier, evasion. Scale: `full/attenuate/aggregate/drop`.
Exactly reproduces `max(1, attack − defense)` — this ability *is* the current core's attack.

**2. 徹甲弾 AP Round**
`single_target r240 | physical | armor:reduced (pen 10) | damage 16 (anti_armor) | cd 1.2`
Counters: evasion, barriers (unhelped by penetration), high HP. `gambitTags: ['anti_armor']`.

**3. 誘導射撃 Guided Shot**
`single_target r200 dodgeable:false | technological | barrier:blocked | damage 12 | cd 1.4`
Counters: energy shields (block `technological`), ECM, armor. The designed answer to evasion builds.

**4. 範囲爆撃 Area Bombardment**
`area r300 radius 90 falloff 0.6 maxTargets 8 dodgeable:false | physical | barrier:blocked | damage 22 | cd 3.0`
Counters: dispersion, cover, barriers. Scale: `full/full/aggregate/single_member`.

### Damage over time

**5. 毒矢 Poison Arrow**
`single_target r220 | physical damage + biological buildup | poison: barrier:blocked armor:blocked requiresBodyContact | damage 8, buildup 25 (poison) | cd 1.0`
Requires `living`. Counters: armor absorption, `vital` barrier, antitoxin, disengaging to decay buildup.
Note: damage Effect precedes buildup Effect, so the arrow that fails to break armor also fails to poison.

**6. 神経毒 Neurotoxin**
`single_target r60 | biological | armor:reduced requiresBodyContact | buildup 25 (poison) + buildup 20 (paralysis) | cd 2.0`
Requires `living`; **rejected against `construct`/`structure` by §9.1.3**. Cures: antitoxin, cleanse.

**7. 炎上 Ignite**
`cone 60° len 120 falloff 0.7 maxTargets 6 | magical | barrier:attenuated armor:passes | damage 6 + buildup 30 (burn) | cd 2.5`
Crosses `kinetic` barriers at half rate; **stopped by `energy` shields**. Cures: extinguish, cleanse, immersion.

**8. 出血 Rend**
`single_target r48 | physical | requiresDamageDealt | damage 12 + buildup 30 (bleed) | cd 1.1`
**Cannot apply if the damage Effect dealt 0.** Counters: armor, barriers, standing still (halves bleed), first aid.

### Control

**9. 石化光線 Petrify Ray**
`line width 40 len 260 pierces maxTargets 4 dodgeable:false | magical | barrier:blocked | buildup 40 (petrify) | cd 5.0` — tier `elite`
Counters: `arcane` ward, magic resistance, cleanse, control DR, cover. Scale: `full/convert_subsystem(locomotion)/drop/drop`.

**10. 死の宣告 Doom**
`single_target r180 | magical | barrier:blocked | buildup 40 (doom) | cd 8.0` — tier `elite`
Counters: cleanse within 12.0 s, `arcane` ward, death immunity, killing the caster.
Scale: `full/convert_subsystem(§8.3 priority walk)/aggregate/single_member`.

**11. 挑発 Taunt**
`single_target r150 | mental | barrier:blocked | buildup 40 (taunt) | cd 4.0`
Requires a mind — **no effect on `construct`/`structure`**. Counters: mental ward, control DR, resolve.

**12. 恐怖 Fear**
`area radius 120 maxTargets 6 | mental | barrier:blocked | buildup 30 (fear) | cd 6.0`
Requires a mind. Scale: `full/**drop**/full/drop` — fear is meaningful to a squad's morale and meaningless to a warship.

### Support

**13. 回復魔法 Heal**
`single_target r95 ally | magical | — | heal 18 | cd 1.2`
Counters: 回復阻害 (×0.25), silence, burst exceeding throughput. This is the existing medic action.

**14. 再生 Regeneration**
`single_target r95 ally | magical | — | buildup→status regen (2 HP/s, 10.0 s) | cd 4.0`
Counters: 回復阻害, dispel, burst.

**15. バリア Barrier**
`single_target r95 ally | magical | — | barrier 120, type arcane, blocks ['magical','mental'] | cd 5.0`
**Explicitly does not stop bullets** — the designed hole. Counters: physical damage, barrier break, dispel.

**16. 蘇生 Revive**
`single_target r60 fallen ally | magical | — | revive 30% HP + revival_sickness 10.0 s | cd 20.0` — tier `elite`
Once per unit per battle; **default unavailable** per V1 §5.4. Counters: `trueDeath`, silence, killing the reviver.

### Defensive / mobility

**17. 瞬間移動回避 Blink**
`self | — | — | untargetable 2.0 s + displace 150px | cd 15.0`
Cannot attack while phased. Counters: `area`/`beam` (ignore targeting legality), waiting 2 s, the 15 s cooldown.
`direct`: `iframeMs 400, staminaCost 40, recoveryMs 200`.

**18. ジャスト回避 Perfect Dodge**
`self | — | — | (see §6.3) | cd 0.6`
`auto`: grants **`evasion +8`** while stamina remains — a companion on gambits still benefits.
`direct`: `justWindowMs 120, iframeMs 300, staminaCost 25, recoveryMs 150`; a successful just-dodge opens a counter window.
Counters: stamina exhaustion, undodgeable `area`/`beam`, paralysis (sets evasion 0).

### Colossal scale

**19. 艦砲射撃 Naval Bombardment**
`area r1200 radius 140 falloff 0.6 maxTargets 8 dodgeable:false | physical | barrier:blocked | damage 120 (anti_ship, pen 25) | cd 5.0` — tier `boss`
Cost `120 × 2.0 = 240`; budget `15 × 5.0 × 2.5 = 187`. **Fails §9.2 at boss tier** — the author must raise the cooldown to 6.5 s or reduce damage to 95. *Recommended resolution: cooldown 6.5 s.* Included deliberately as a worked example of the validator doing its job.
Counters: dispersion, closing to inside minimum range, disabling `primary_weapon`, the long cooldown.

**20. 巨大怪物の薙ぎ払い Kaiju Sweep**
`sweep 180° r140 falloff 0.5 maxTargets 12 | physical | barrier:blocked armor:blocked | damage 40 + displace 100px | cd 6.0` — tier `boss`
Cost `40 × 2.5 = 100`; budget `225`. Passes comfortably.
Counters: staying outside r140, spreading out, disabling `locomotion`, the 6.0 s telegraph.
Scale: `full/full/aggregate/drop`.

---

## 11. Non-Goals

- No change to `src/gambitCombatCore.ts`, its fixtures, or Golden Master parity.
- No change to any numeric value in `docs/COMBAT_MECHANICS_V1_RULESET.md` beyond
  the three superseded rules listed in §0.
- No RNG introduced; every rule here resolves deterministically in auto mode.
- No ability may be authored without a counter (§9.3).
- No entity-specific subsystem rules — conversion is by tag only (§8.2).
- No implementation, tests, PR, merge, or additional AI review from this document.
