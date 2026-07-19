# Combat Balance Playtest V1 — Measured Results

Task ID: `COMBAT-BALANCE-PLAYTEST-V1-001`
Base: `75c16ca` (feat(combat): add deterministic Combat Lab V1)
Executed against working tree at `2eb3676`, branch `task/COMBAT-LAB-V1-001`, v1.84.16.

**Every number in this document was measured by executing the Combat Lab. Nothing
is estimated.** No source file, fixture, or resource was modified; harness
scripts were written to a scratchpad outside the repository and `out/` is
gitignored.

---

## 1. Conditions Executed (実行した条件)

| Part | What was run | Battle runs |
| --- | --- | --- |
| A | 10 built-in scenarios, base + left/right swap (`swapCombatLabSides`) | 20 |
| B | 10 scenarios × {attack, hp, defense+armor, cooldown} × {−10%, base, +10%} | 90 |
| C | 12 required archetype matchups (expanded to 20) + 2 mirror-bias controls | 22 |
| D | DoT truncation, dodge precision, paralysis counter, control comparison, armor/AP | 18 |
| E | Regen re-test, barrier depletion sweep, vector bypass, evasion snapping | 4 |
| — | **Total battle runs** | **154** |
| — | Isolated `advanceMechanicsState` simulations (no combat) | 24 |

Catalog: `resources/combat-abilities/v1-reference-abilities.json` — 20 abilities,
9 status definitions (`poison, paralysis, burn, bleed, petrify, doom, taunt,
fear, regen`). Default `deltaSeconds = 1/30`. Timeout 3600 ticks.

**Determinism: 154/154 runs returned `deterministic: true`.** Every run was
executed twice internally by `runCombatLab` and produced byte-identical output.

---

## 2. Measured Results (実測結果)

### 2.1 Part A — built-in scenarios, base vs swapped

| Scenario | base | swap | sec | dmg | heal | barrier | dodges | statusApp | subsys |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard_5v5 | ENEMY | ALLY | 13.7 | 806 | 36 | 0 | 0 | 0 | 0 |
| evasion_ace | ENEMY | ALLY | 5.2 | 280/270 | 0 | 0 | 7 | 0 | 0 |
| armor_vs_normal | ENEMY | ALLY | 9.33 | 110 | 0 | 0 | 0 | 0 | 0 |
| armor_vs_ap | ENEMY | ALLY | 9.33 | 110 | 0 | 0 | 0 | 0 | 0 |
| barrier_vs_burst | ENEMY | ALLY | 9.33 | 100 | 0 | **0** | 0 | 0 | 0 |
| barrier_vs_dot | **ALLY** | **ALLY** | 9.33 | 190 | 0 | 0 | 0 | 2 | 0 |
| healing_vs_block | ALLY | ENEMY | 9.33/34.53 | 235/600 | 162/450 | 0 | 0 | 0 | 0 |
| sleep_break | ENEMY | ALLY | 9.33 | 190 | 0 | 0 | 0 | 0 | 0 |
| petrify_colossal | ENEMY | ALLY | 9.33 | 100 | 0 | 0 | 0 | 0 | **10** |
| infantry_vs_battleship | ENEMY | ALLY | 50.67 | 650/645 | 0 | 0 | 0 | 0 | 0 |

Nine of ten scenarios flip their winner label on swap while the *same
composition* wins — correct, no side bias detectable at scenario level.
`barrier_vs_dot` is the exception: **ALLY wins both orientations**, which is the
first sign of the turn-order bias confirmed in §2.4.

`armor_vs_normal` and `armor_vs_ap` produced **byte-identical results** (110
damage, 9.33 s, survivor at 90/100). The armour-piercing round changed nothing.

### 2.2 Part B — ±10% sensitivity

**6 winner flips out of 40 parameter perturbations (15%).**

| Scenario | flipping fields |
| --- | --- |
| barrier_vs_dot | attack (−10%), hp (−10%), cooldown (+10%) |
| sleep_break | attack (+10%), hp (+10%), defense (+10%) |

All six flips occur in near-mirror duels decided by a single attack in the
first-mover race, so the system is **not** hair-trigger. The concerning result is
the opposite: `armor_vs_*`, `barrier_vs_burst`, `petrify_colossal`, and
`infantry_vs_battleship` **never flip on any parameter at any magnitude**,
because those matchups are hard-locked by immunity (§3.1, §3.2), not by numbers.

### 2.3 Part C — archetype matchups

| Matchup | winner | sec | dmg | dodges | rate | statusApp | onset(s) | subsys | survivor HP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 evasion vs normal | evader | 9.33 | 180 | 2 | 0.091 | 0 | – | 0 | 20 |
| 2 evasion vs accuracy 25 | attacker | 9.33 | 190 | 0 | 0.000 | 0 | – | 0 | 10 |
| 2b evasion vs guided_shot | evader | 9.33 | 180 | 2 | 0.091 | 0 | – | 0 | 20 |
| 3 armor 50 vs normal | armor | 9.33 | 110 | 0 | 0 | 0 | – | 0 | 90 |
| 4 armor 50 vs ap_round | armor | 9.33 | 110 | 0 | 0 | 0 | – | 0 | 90 |
| 5 barrier vs burst (atk 40) | barrier | 9.33 | 100 | 0 | 0 | 0 | – | 0 | **100 (untouched)** |
| 6 barrier vs ignite (DoT) | attacker | 9.33 | 190 | 0 | 0 | 2 | 3.13 | 0 | 10 |
| 7 regen vs plain attacker | attacker | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| 7b regen + heal-block | attacker | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| 8 heal team vs focus | heal team | 8.3 | 260 | 0 | 0 | 0 | – | 0 | 198 |
| 9a sleep 5 s | attacker | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| 9b stun 5 s | attacker | 9.33 | **140** | 0 | 0 | 0 | – | 0 | **60** |
| 9c paralysis 5 s | attacker | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| 9d no control (control) | attacker | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| 10a petrify vs normal | victim | 24.83 | 100 | 0 | 0 | 3 | 2.10 | 0 | 100 |
| 10b petrify vs colossal | colossal | 9.33 | 100 | 0 | 0 | 0 | – | **10** | 400 |
| 10c doom vs normal | victim | 9.33 | 100 | 0 | 0 | 1 | 2.10 | 0 | **100** |
| 10d doom vs colossal | colossal | 9.33 | 100 | 0 | 0 | 0 | – | **10** | 400 |
| 11 two elites vs six mobs | **mobs** | 8.3 | 669 | 0 | 0 | 0 | – | 0 | 331 (4 alive) |
| 12 ace vs eight mobs | **mobs** | 5.2 | 450 | 9 | 0.167 | 0 | – | 0 | 650 (7 alive) |
| MIRROR 1v1 (identical) | **ALLY** | 9.33 | 190 | 0 | 0 | 0 | – | 0 | 10 |
| MIRROR 3v3 (identical) | **ALLY** | 9.33 | 570 | 0 | 0 | 0 | – | 0 | 30 |

`9a/9c/9d` are **identical in every metric** — sleep and paralysis changed
nothing. `9b` stun and petrify both reduced incoming damage 190→140.

### 2.4 Turn-order (side) bias — measured

Mirror matches with byte-identical units on both sides:

- **1v1: allies win**, surviving at 10/100 HP.
- **3v3: allies win**, all three surviving at 10/100 HP each.

Damage per hit is `max(1, 15−5) = 10`; a 100 HP unit dies to the 10th hit. The
ally side is evaluated first within each tick (`participantOrder`), lands the
killing blow one action earlier, and wins every symmetric engagement.
**Turn order is worth exactly one attack.**

### 2.5 Effective values measured

**Dodge (250-attack samples):**

| evasion | designed rate | measured rate | dodges/attacks |
| --- | --- | --- | --- |
| 20 | 0.200 | **0.153** | 45/250 |
| 25 | 0.250 | **0.183** | 56/250 |
| 33 | 0.250 | **0.183** | 56/250 |
| 50 | 0.500 | **0.311** | 113/250 |

Measured dodge is consistently **61–77% of the designed rate**. Separately,
`evasion` 25, 26 and 33 are **mechanically identical** — `ceil(100/e)` snaps all
three to interval 4. Interval 3 first occurs at `evasion 34`.

**Armor and penetration (exact per-hit damage, attacker attack 15):**

| Case | per-hit damage |
| --- | --- |
| basic_slash vs armor 50 | **1** |
| ap_round vs armor 50 | **1** |
| basic_slash vs armor 0 | **15** |
| ap_round vs armor 0 | **13** |

**Barrier depletion sweep (attacker attack 50, 117 hits landed):**

| barrier pool | per-hit damage | absorbed reported | defender HP after |
| --- | --- | --- | --- |
| 10 | **0** | 0 | 300/300 |
| 100 | **0** | 0 | 300/300 |
| 1000 | **0** | 0 | 300/300 |

A barrier of **10** absorbed 5850 incoming damage without depleting. Same
defender against a magical-vector attacker (`ignite`): **45 damage per hit,
killed**.

**Damage-over-time, isolated over 10 simulated seconds:**

| status | rate | Δ at δ=1/30 | δ=1/10 | δ=1/4 | δ=1/2 | δ=1.0 | expected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| poison | 3/s | **0** | **0** | 0 | 20 | 30 | 30 |
| burn | 5/s | **0** | **0** | 40 | 40 | 50 | 50 |
| bleed | 2/s | **0** | **0** | 0 | 20 | 20 | 20 |
| regen | 2/s | **0** | **0** | 0 | 20 | 20 | 20 |

At the Combat Lab's default `deltaSeconds = 1/30`, **every damage-over-time and
heal-over-time effect deals exactly zero**.

---

## 3. Mechanisms That Are Too Strong (強すぎる機構)

### 3.1 Barrier — unconditional, non-depleting immunity

A barrier grants **permanent immunity** to every vector it blocks, at any pool
size. Measured: pool 10 absorbed 5850 damage and never depleted; the defender
finished untouched at 300/300 and the fight timed out.

Root cause, `src/combatMechanicsResolver.ts`: `penetrationFactor()` (line 39)
returns `0` when the effect is `barrier: 'blocked'` and the barrier blocks that
vector; the caller (line 80) then executes `continue`, skipping the effect
entirely. The absorption-and-depletion code at line 89 can only be reached when
the barrier does *not* block the vector — in which case its own condition
`barrier.blocksVectors.includes(effect.vector)` is false. **Line 89 is
unreachable dead code.**

### 3.2 Armor — near-total immunity with a non-functional counter

Armor 50 against attack 15 yields the minimum-damage floor of 1, i.e. 98%
mitigation, and the designated counter does not work (§5.1). Measured: armor
unit finished at 90/100 HP against 117 landed attacks.

### 3.3 Quantity dominates quality

Six standard mobs defeated two elites (200 HP, 28 attack) with **four mobs
surviving**. Eight mobs killed a 300 HP / 30 attack / evasion 25 ace in 5.2 s
with **seven surviving**. Neither "few elites" nor "lone ace" has a win path at
the current numbers.

---

## 4. Mechanisms That Are Too Weak (弱すぎる機構)

### 4.1 All damage-over-time and regeneration — literally zero

Poison, burn, bleed and regen produce **0 HP change** at the default tick rate.

Root cause, `advanceMechanicsState` line 122:
`next.hp -= Math.trunc(rate * delta)`. With `delta = 1/30` and `rate ≤ 29`, the
truncation floors every tick to 0, forever. The threshold for any effect at all
is `rate × delta ≥ 1`, i.e. `rate ≥ 30` at 1/30 s.

Confirmed end-to-end: `ignite` applied `burn` five times in a 40.3 s battle and
the burn contributed **0** damage; the victim died purely to impact damage.

### 4.2 Doom never executes

`doom` was applied (measured onset 2.10 s) but the target finished at **100/100
HP**. `advanceMechanicsState` decrements `remainingSeconds` and then filters
expired statuses (line 123) — there is **no `onExpire` handling**, so the 12 s
timer simply vanishes.

### 4.3 Sleep does nothing

`sleep 5 s` produced results identical to no status at all (190 damage,
survivor at 10 HP). The first attack breaks sleep before it prevents any action.
It is not a strict upgrade over stun — **it is strictly worse than stun**, which
measurably reduced incoming damage 190→140.

### 4.4 Paralysis does nothing in a stationary fight

Identical to the no-status control. `canAct()` deliberately excludes paralysis,
so a paralyzed unit keeps attacking; when both units already stand inside their
attack range, blocking movement changes nothing. This is *correct by design*
but means paralysis has no standalone value — its entire worth is as the evasion
counter (§6.1), where it works perfectly.

### 4.5 `effect.magnitude` is ignored for damage

`basic_slash` declares magnitude 14 but dealt **15**; `ap_round` declares 16 but
dealt **13**. Damage comes from `input.attacker.attack` (line 83); the authored
magnitude is never read for `kind: 'damage'`. It *is* honoured for `buildup` and
`heal`. Every damage ability therefore hits for the same amount, differing only
by weapon-scale multiplier.

### 4.6 Healing contributes almost nothing at scale

In `standard_5v5` the medic produced **36 healing across 13.7 s** while 806
damage was dealt — 4.5%. The medic composition lost to five plain attackers in
both orientations; trading an attacker for a medic is strictly negative.

---

## 5. Counters That Do Not Work (counterが機能していない組み合わせ)

### 5.1 Armour-piercing vs armour — **inverted**

`ap_round` is **strictly worse than `basic_slash` in every measured case**: equal
(1 damage) against armour 50, and *lower* (13 vs 15) against unarmoured targets.

Two independent causes:
1. `mechanicsFor()` in `src/combatLabCore.ts` (lines 53–61) never populates
   `penetration`, so `attacker.penetration` is always `undefined → 0`.
2. `effect.penetration.armor` (`'reduced'` on ap_round) is **never read** by the
   resolver — only `.barrier`, `.requiresDamageDealt`, and `.requiresBodyContact`
   are consumed.

Meanwhile `ap_round`'s `anti_armor` weapon scale is 0.9 against `flesh`, so it
takes a 10% penalty with no compensating benefit.

### 5.2 Burst vs barrier — no effect

A 40-attack `area_bombardment` left a 100-point barrier holder at **100/100**.
Burst cannot break what never depletes (§3.1).

### 5.3 Guided shot vs evasion — does not bypass

`guided_shot` was dodged at the same rate as a basic attack (2 dodges, 0.091).
`delivery.dodgeable` is **never read**; the resolver hardcodes only
`['area','beam']` as undodgeable (line 72), and `guided_shot` is
`single_target`.

### 5.4 Heal-block vs regeneration — no observable effect

`7_regen` and `7b_regen_vs_healblock` were identical (190 damage, survivor at
10 HP). Since regen itself deals 0 (§4.1), suppressing it changes nothing. This
counter cannot be evaluated until §4.1 is fixed.

### 5.5 Weapon scale vs colossal targets — inert

`mechanicsFor()` never sets `structureClass`, so the scale table always resolves
the `flesh` column. The designed `personal → capital = 0.05` multiplier never
fires. It is currently masked by armour (both paths floor to 1 damage), but any
high-attack personal weapon would hit a battleship at full effectiveness.

---

## 6. What Works (問題なし)

### 6.1 Paralysis → evasion: the best counter measured

| condition | dodges | attacks | rate |
| --- | --- | --- | --- |
| evasion 25, no control | 56 | 250 | 0.183 |
| evasion 25 + paralysis | **0** | 250 | **0.000** |

Complete, clean negation. This is the single most correctly-implemented
counter relationship in the build.

### 6.2 Accuracy → evasion

`accuracy 25` against `evasion 25` produced **0 dodges** and flipped the duel to
the attacker. Direct subtraction works exactly as specified.

### 6.3 Vector choice → barrier

The one barrier counter that functions: `ignite` (magical) against a `kinetic`
barrier dealt **45 per hit and killed**, versus **0 per hit** for a physical
attacker on the same target. The "every barrier has a designed hole" principle
is real and measurable.

### 6.4 Colossal subsystem conversion

Both `petrify_ray` and `doom` against colossal targets produced **10 subsystem
disables and 0 status applications** — the conversion path fires correctly and
never applies hull-level control. Non-colossal targets received the status
normally (3 petrify applications, onset 2.10 s). This behaves exactly as
designed.

### 6.5 Determinism

154/154 runs deterministic, including every swapped, perturbed, and archetype
scenario. Left/right swap changes only the winner label, never the outcome, for
9 of 10 built-in scenarios.

### 6.6 Status onset timing

Measured onset was **2.10 s** for a 40-magnitude applicator (`petrify_ray`,
`doom`) and **3.13 s** for a 30-magnitude applicator (`ignite`) — consistent
with threshold 100 and matching the ruleset's "procs on the 3rd–4th applying
hit" budget.

---

## 7. Recommended Numeric Changes (推奨数値変更)

Ordered by measured impact. **None have been applied.**

| # | Change | Location | Justification |
| --- | --- | --- | --- |
| R1 | Accumulate DoT fractionally instead of truncating per tick — keep a per-status fractional remainder and apply whole HP when it reaches 1 | `advanceMechanicsState` line 122 | Restores poison/burn/bleed/regen from **0** to their designed 20–50 HP totals |
| R2 | Make a blocked barrier **absorb and deplete** rather than return factor 0 — move depletion ahead of the `continue` | `penetrationFactor` line 39 + caller line 80 | Turns permanent immunity into a 100-point pool; restores burst as a counter |
| R3 | Populate `penetration` (and `structureClass`) in `mechanicsFor()`, and consume `effect.penetration.armor` | `combatLabCore.ts` 53–61, resolver 83 | Makes `ap_round` beat armour instead of losing to it |
| R4 | Read `effect.magnitude` for `kind: 'damage'` | resolver line 83 | Lets 20 authored abilities differ from each other |
| R5 | Honour `delivery.dodgeable` instead of hardcoding `['area','beam']` | resolver line 72 | Makes `guided_shot` the anti-evasion tool it is specified to be |
| R6 | Add `onExpire: 'execute'` handling for doom | `advanceMechanicsState` line 123 | Doom currently expires harmlessly |
| R7 | Correct the ruleset evasion table: **34**, not 33, is the first value giving interval 3 | `COMBAT_MECHANICS_V1_RULESET.md` §2.2 | Measured: 25, 26 and 33 are mechanically identical |
| R8 | Raise elite attack ~+40% or reduce mob count in the reference matchups | scenario data | Six mobs beat two elites with four surviving |

---

## 8. Numbers That Should NOT Change (変更しない方がよい数値)

- **Minimum damage floor of 1.** It is what keeps infantry-vs-battleship at
  "futile but non-zero" (measured 1 damage per hit, 650 total over 50.67 s)
  rather than a hard zero. It is currently doing the work armour scaling should
  do, but it is not itself wrong.
- **Buildup threshold 100 and applicator magnitudes 25/30/40.** Measured onsets
  of 2.10 s and 3.13 s land squarely in the intended 3–4 hit window.
- **Status durations (poison 8 s, burn 6 s, bleed 10 s, petrify 5 s, doom 12 s).**
  Untestable until R1 lands; changing them now would be guessing.
- **Stun at 1.5 s design intent.** Measured stun already produced a clean
  190→140 damage swing at 5 s; it does not need strengthening.
- **Sleep breaking on damage.** The rule is correct; sleep's uselessness is a
  *sequencing* consequence, not a duration problem. Do not lengthen it.
- **Determinism and float32 quantization.** 154/154 clean. Do not touch.
- **Subsystem conversion durations.** Working exactly as designed.

---

## 9. Adjustments to Adopt in V1 (V1で採用する調整候補)

Adopt **R1, R2, R3** and nothing else. All three are correctness repairs to
mechanics that are already specified and already have data authored for them;
each converts a dead system into a live one, and together they restore every
broken counter relationship in §5 except 5.3 and 5.5.

Adopt **R7** as a documentation-only correction (one number in the ruleset).

Defer R4–R6, R8 until R1–R3 have been re-measured — several §3 and §4 findings
are downstream of the same three defects and may resolve without further tuning.

---

## 10. Deferred to V2+ (V2以降へ送る要素)

- **Turn-order fairness.** Allies win every mirror match by exactly one attack
  (§2.4). Fixing it requires simultaneous resolution or initiative, which is a
  structural change to the tick loop, not a balance number.
- **Effective dodge shortfall.** Measured 61–77% of designed rate; needs tracing
  of `incomingHitCount` persistence across the tick loop.
- **Evasion granularity.** `ceil(100/e)` snapping makes whole ranges of values
  identical; a finer scheme (per-attacker counters, or a different interval
  formula) is a V2 redesign.
- **Healing viability at squad scale** (§4.6) — depends on R1 and on whether
  regen/heal-block become meaningful.
- **Quantity-vs-quality curve** (§3.3) — retune only after damage abilities stop
  being interchangeable (R4).
- **Weapon-scale vs structure class** (§5.5) — currently masked; will matter once
  high-attack anti-ship weapons exist in scenarios.

---

## Final Report

**Scenarios executed:** 154 battle runs (10 built-in × base/swap, 90 sensitivity
perturbations, 22 archetype matchups, 22 targeted diagnostics) plus 24 isolated
state-advance simulations. **154/154 deterministic.**

**Top 3 problems:**

1. **All damage-over-time and regeneration deal exactly zero** at the default
   1/30 s tick — `Math.trunc(rate × delta)` floors every tick to 0. Poison,
   burn, bleed and regen are entirely inert; doom additionally never executes on
   expiry.
2. **Any barrier is permanent immunity** — a 10-point pool absorbed 5850 damage
   without depleting, because the blocked-vector path skips the effect before
   the depletion code can run, making that code unreachable.
3. **The armour-piercing round is strictly worse than a basic attack** — equal
   against armour 50 (1 damage each) and *lower* against unarmoured targets
   (13 vs 15), because `penetration` is never populated and
   `effect.penetration.armor` is never read.

**Best counter relationship measured:** paralysis against evasion — 56 dodges
reduced to **0** over an identical 250-attack sample, a complete and clean
negation. Runner-up: vector choice against barriers (0 vs 45 damage per hit on
the same defender).

**Minimum recommended adjustment:** R1, R2, R3 only — fractional DoT
accumulation, barrier depletion instead of nullification, and populating
`penetration`. These are correctness repairs, not tuning; they revive four dead
mechanics and restore every broken counter except guided-shot dodging and weapon
scale. Re-measure before changing any balance number.

COMBAT_BALANCE_PLAYTEST_V1_COMPLETE

---

# Appendix A — Post-Fix Re-measurement

Task ID: `COMBAT-MECHANICS-CORRECTNESS-FIX-001`. Everything above this line is the
**pre-fix** measurement and is retained unchanged. The numbers below were taken
after the four correctness repairs landed, using the same harness.

Changed files: `src/combatMechanicsResolver.ts`, `src/gambitCombatCore.ts`.
No balance number, ability definition, status definition, or scenario was
altered.

## A.1 Over-time effects — was 0, now exact

Isolated `advanceMechanicsState`, 10 simulated seconds, measured at five tick
widths:

| status | rate | **before** (all widths) | **after** @ 1/30, 1/10, 1/4, 1/2, 1 s | designed |
| --- | --- | --- | --- | --- |
| poison | 3/s | 0 | **−30, −30, −30, −30, −30** | −30 |
| burn | 5/s | 0 | **−50, −50, −50, −50, −50** | −50 |
| bleed | 2/s | 0 | **−20, −20, −20, −20, −20** | −20 |
| regen | 2/s | 0 | **+20, +20, +20, +20, +20** | +20 |

Tick width no longer changes the result for the same elapsed time — the
requirement that motivated the fix.

Fix: over-time accrual is accumulated in **integer milli-HP** on the status
instance (`residualMilli`, JSON-safe) instead of `Math.trunc(rate * delta)` per
tick, which discarded every contribution below 1 HP.

In-battle effect (`ignite` vs a 400 HP passive target):

| attacker | impact damage | burn applications | time to kill |
| --- | --- | --- | --- |
| basic_slash (before & after) | 401 | 0 | 40.33 s |
| ignite **before** | — | 5 | burn contributed **0** |
| ignite **after** | 316 | 3 | **21.30 s** |

## A.2 Barrier — was unlimited immunity, now a depleting pool

Attacker attack 50, defender 300 HP:

| pool | **before** absorbed | **before** defender | **after** absorbed | **after** defender |
| --- | --- | --- | --- | --- |
| 10 | 0 | 300/300 (timeout) | **10** | **0/300 (killed)** |
| 100 | 0 | 300/300 (timeout) | **100** | **0/300 (killed)** |
| 1000 | 0 | 300/300 (timeout) | **1000** | **0/300 (killed)** |

Each pool now absorbs exactly its stated amount and then lets damage through
(first hit through a depleted 10-pool delivered 35 of 45).

Fix: `penetrationFactor` no longer returns `0` for a blocked **damage** effect,
so the effect reaches the barrier stage and depletes the pool. Non-damage
effects are still held off, but only while the pool has charge.

**Existing vector rules are unchanged and still verified:** `ignite` (magical)
against a `kinetic` barrier still bypasses it entirely — 50 damage on the first
hit, defender killed.

## A.3 Armour piercing — was strictly worse, now correctly ordered

Per-hit damage, attacker attack 15:

| target armour | basic_slash before | ap_round before | basic_slash **after** | ap_round **after** |
| --- | --- | --- | --- | --- |
| 0 | 15 | 13 | 15 | **13** |
| 5 | — | — | 10 | **13** |
| 15 | — | — | 1 | **13** |
| 25 | — | — | 1 | **11** |
| 40 | — | — | 1 | **3** |
| 50 | 1 | 1 | 1 | 1 |

AP now beats a plain attack across the entire armour band the V1 ruleset
documents (heavy infantry 5 → capital 40), while remaining slightly weaker
against unarmoured targets (13 vs 15) — the intended role trade-off, preserved.

Fix: `effect.penetration.armor` is now honoured (`passes` → armour ignored,
`reduced` → half armour, `blocked` → armour intact), and attacker penetration
falls back to the weapon scale's documented value (`personal` 0, `anti_armor`
10, `anti_ship` 25, `siege` 20) when the combatant carries none.

## A.4 Doom — was never executed, now resolves through the lethality gate

| measurement | before | after |
| --- | --- | --- |
| doom applied | 2.10 s | 2.10 s |
| `lethal_timer_expired` | **never** | **14.10 s** (12 s duration) |
| target final HP | **100/100 (survived)** | **0/900 (executed)** |

Endure/undying still intercept it: a doomed target holding one `endure` charge
finishes at **1 HP** with an `endure` receipt and no `death` receipt.

Fix: an expiring status whose definition is `statusClass: 'lethal_timer'` now
routes through the same `resolveLethality` choke point used by lethal damage —
no raw HP write, no doom-specific branch. The gate was extracted from the damage
path so both callers share it.

## A.5 Verification

| check | result |
| --- | --- |
| Golden Master parity fixtures | **8/8 pass** |
| Combat suites (resolver, correctness, lab, lab store, workshop, workshop store, validator, loadout, integration, gambit) | **44/44 pass** |
| New focused tests (`combatMechanicsCorrectness.test.ts`) | **11/11 pass** |
| `npm run test:validate` | **7/7 pass** |
| `npm run test:unit` | **288/288 pass** |
| Built-in Combat Lab scenarios still deterministic | **10/10** |
| Symbol Registry | regenerated, up to date |

Two pre-existing tests were corrected rather than weakened: both declared
`penetration.armor: 'passes'` (armour-ignoring) while asserting that armour
applied — an expectation that only held because the field was never read. Their
fixtures now use the neutral `'blocked'`, and `'passes'` is asserted explicitly
in the new correctness suite.

## A.6 Remaining known issues

Only two, both explicitly out of scope for this fix:

1. **Ally-side first-mover bias.** Mirror matches are still won by the ally side
   by exactly one attack (`participantOrder` is evaluated in order each tick).
   Structural, not numeric.
2. **Armour 50 still floors both attacks to 1 damage.** With attack 15 that is
   a 3.3:1 mismatch and the minimum-damage floor is working as designed; the
   reference scenario simply uses an armour value above the V1 ruleset's
   documented band (capital 40). A scenario-data question, not a mechanics one.

Items deliberately untouched per the task: evasion interval formula and its 33%
boundary, `guided_shot` dodgeability, weapon-scale/`structureClass` redesign,
and all balance numbers.

COMBAT_MECHANICS_CORRECTNESS_FIX_LANDED

---

# Post-fix measured results

Task ID: `COMBAT-POST-FIX-BALANCE-PLAYTEST-001`
Base: `ba78533` (merge of PR #23, `task/COMBAT-MECHANICS-CORRECTNESS-FIX-001`).

Appendix A recorded that the four repairs worked. This chapter asks the next
question: **now that those mechanics actually run, is the resulting combat
balanced?** Everything above is retained unchanged.

**168 battle runs** (14 conditions × base + swap + 8 sensitivity + 2 determinism
replays) plus **26 isolated state-advance measurements**. No code, fixture,
resource, or scenario was modified. **Determinism: 14/14 conditions reproduce
byte-identically.**

## P.1 Base measurements

`impact` = damage from attacks. `DoT` = HP change not attributable to impact or
healing (over-time effects and doom execution). `uptime` = summed applied status
duration ÷ battle length, capped at 1.

| condition | win | sec | impact | DoT | absorb | depleted | procs | onset | uptime | dodge% | A/E | HP left |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 poison | ALLY | 48.3 | 940 | **130** | 0 | – | 5 | 3.13 s | 0.83 | 0 | 1/0 | 130 |
| 02 burn | ALLY | 33.1 | 804 | **116** | 0 | – | 4 | 3.13 s | 0.73 | 0 | 1/0 | 280 |
| 03 bleed | ALLY | 51.7 | 1003 | **97** | 0 | – | 6 | 3.13 s | **1.00** | 0 | 1/0 | 100 |
| 04 regen | ENEMY | 9.33 | 200 | **−18** | 0 | – | 0 | – | – | 0 | 0/1 | 18 |
| 05 regen + heal-block | ENEMY | 9.33 | 200 | **−18** | 0 | – | 0 | – | – | 0 | 0/1 | 18 |
| 06 barrier depletion | ALLY | 8.3 | 380 | 0 | **100** | **2.10 s** | 0 | – | – | 0 | 1/0 | 2920 |
| 07 barrier vs passing vector | ALLY | 5.2 | 340 | 10 | **0** | – | 1 | 3.13 s | 1.00 | 0 | 1/0 | 2950 |
| 08 normal vs armour 25 | **ENEMY** | **92.0** | 990 | 0 | 0 | – | 0 | – | – | 0 | 0/1 | 310 |
| 09 AP vs armour 25 | **ALLY** | **37.2** | 760 | 0 | 0 | – | 0 | – | – | 0 | 1/0 | 540 |
| 10 doom | ALLY | 14.1 | **14** | **900** | 0 | – | 1 | 2.10 s | 0.85 | 1 fired | 1/0 | 886 |
| 12 two elites vs six mobs | **ENEMY** | 7.27 | 646 | 0 | 0 | – | 0 | – | – | 0 | 0/4 | 354 |
| 13 evasion ace vs six | **ENEMY** | 7.27 | 500 | 0 | 0 | – | 0 | – | – | 0.161 | 0/4 | 400 |
| 14 paralysis vs evasion | TIMEOUT | 120.0 | 250 | 0 | 0 | – | 0 | – | – | **0.000** | 1/1 | 5750 |
| 14b evasion baseline | TIMEOUT | 120.0 | 194 | 0 | 0 | – | 0 | – | – | **0.183** | 1/1 | 5806 |

Conditions 14/14b are deliberately stalemated (attack 6 vs defence 5 → floor
damage, 3000 HP) to isolate dodge rate over a long sample; the timeout is the
harness design, not a balance result.

## P.2 Left/right swap

**All 14 conditions produced the mirrored winner on swap** — the same
composition wins regardless of which side it occupies. No side bias is
detectable at the composition level. Battle length was identical to the
centisecond in 13 of 14 (condition 13 varied 7.27 s → 6.40 s, from turn order
within the mob group).

Surviving HP differed by 0–23 across swaps, consistent with the known
first-mover advantage of one action, which remains out of scope.

## P.3 ±10% sensitivity

**2 winner flips out of 56 perturbations (3.6%).** Both are conditions 04 and
05 flipping ENEMY → ALLY at attack +10%, i.e. the attacker crossing the regen
unit's sustain threshold — precisely the interaction that should be tight.

Everything else held. Conditions 08/09 (armour), 12 (quantity), 13 (evasion)
never flipped on any parameter, which is the concerning direction: those
outcomes are structural, not numeric.

## P.4 Did the four repaired mechanics behave?

**Yes, all four, with one gap.**

**Over-time effects** now carry their full designed load at natural duration:

| status | duration | measured total | designed | share of a 100 HP unit |
| --- | --- | --- | --- | --- |
| poison | 8 s | **−24** | −24 | 24% |
| burn | 6 s | **−30** | −30 | 30% |
| bleed | 10 s | **−20** | −20 | 20% |
| regen | 10 s | **+20** | +20 | 20% |

All sit inside the V1 ruleset's 15–35% budget. Poison stacking scales correctly
(intensity 1/2/3 → 3.0 / 5.0 / 6.9 HP per second; the third is 1 HP low over
ten seconds, a milli-HP rounding artifact, not a design deviation).

In battle, DoT contributed **9–13% of all damage dealt** (130/1070, 116/920,
97/1100) — present and felt, never dominant.

**Barrier** absorbed exactly its pool (100) and depleted at **2.10 s**, after
which damage reached the body. A passing vector (`ignite` magical vs `kinetic`)
still bypasses entirely: **0 absorbed**.

**Armour piercing** is now decisive: against armour 25, a plain attack **loses
after 92 s**, AP **wins in 37 s**.

**Doom** fires at **12.03 s** after onset and executes, and the lethality gate
intercepts it correctly:

| protection | fired at | final HP | receipts |
| --- | --- | --- | --- |
| none | 12.03 s | **0** | `lethal_timer_expired`, `death` |
| endure ×1 | 12.03 s | **1** | `lethal_timer_expired`, `endure` |
| undying 15 s (overlaps timer) | 12.03 s | **1** | `lethal_timer_expired`, `undying` |
| undying 5 s (expires first) | 12.03 s | 0 | `lethal_timer_expired`, `death` |

The last row is correct behaviour, not a defect — a 5 s window cannot cover a
12 s timer. An earlier draft of this measurement mis-sized that window and is
corrected here.

**The gap: heal reduction does not apply to regeneration.**

| channel | unblocked | with heal-block | expected at −75% |
| --- | --- | --- | --- |
| direct heal | +18 | **+4** | +4 ✔ |
| regen over 10 s | +20 | **+20** | +5 ✘ |

`healReceivedMul` is consumed only by the `heal` effect path; the over-time
tick in `advanceMechanicsState` ignores it. Conditions 04 and 05 are therefore
byte-identical. **The regeneration archetype's designated counter does not work
against regeneration.** This is a missing interaction, not a number.

## P.5 Balance findings

### Confirmed healthy

- **Paralysis → evasion** remains the cleanest counter measured: dodge rate
  **0.183 → 0.000** over an identical 250-attack sample.
- **AP → armour** is now a real, decisive counter (loss at 92 s → win at 37 s).
- **Vector choice → barrier** works both ways: blocked vectors deplete a finite
  pool, passing vectors ignore it.
- **DoT weight is well tuned.** 9–13% of damage, 20–30% of a healthbar per
  application, uptime 0.73–0.83 for poison and burn.
- **No endless battles or one-sided shutouts arose naturally.** The two
  timeouts were engineered stalemates; the longest natural fight was 92 s, and
  it had a working counter that resolved it in 37 s.

### Problems

1. **Heal-block does not touch regen** (P.4). Regen's counter is inert.
2. **Doom is an HP-independent guaranteed kill, and it is cheap.** Condition 10:
   the attacker dealt **14 impact damage** and won at 14.1 s against a **900 HP**
   target. Onset was 2.10 s (3 hits at magnitude 40 against threshold 100), then
   a fixed 12 s to execution. Nothing about the target's durability mattered.
   This is the "instant-death bias" the playtest was asked to check for, and it
   is present.
3. **Quantity beats quality with no counter-path.** Six mobs (100 HP, 15 atk)
   beat two elites (200 HP, 28 atk) with **four mobs surviving**, and a lone ace
   (300 HP, 30 atk, evasion 25) lost to six mobs with four surviving. Neither
   flipped on any ±10% perturbation — the outcome is structural.

Bleed is the only status at **1.00 uptime** (10 s duration, reapplied before
expiry). Because its rate is the lowest (2/s), the sustained contribution is
only ~1.9 DPS, so this is noted rather than escalated.

## P.6 Recommended numeric changes (maximum three)

None have been applied.

### N1 — Doom application magnitude 40 → 25

- **Current:** `doom` ability effect magnitude **40**, status threshold 100 →
  procs on the **3rd** applying hit (measured onset **2.10 s**); 12 s timer.
- **Recommended:** magnitude **25** → procs on the **4th** hit (~3.13 s, the
  same cadence every other applicator already uses).
- **Evidence:** condition 10 — 14 impact damage killed a 900 HP target in
  14.1 s. Doom is the only effect whose cost is independent of target
  durability, yet it lands one hit sooner than poison, burn or bleed.
- **Archetypes affected:** every high-HP defender (armour, barrier, colossal);
  doom currently bypasses all of them equally.
- **If unchanged:** the dominant strategy against any durable target is doom
  rather than damage, and boss HP totals stop meaning anything.

### N2 — Elite profile attack 28 → 40 (or HP 200 → 300)

- **Current:** two elites (200 HP, 28 atk) vs six mobs (100 HP, 15 atk) →
  **mobs win with 4 of 6 alive** in 7.27 s.
- **Recommended:** raise elite attack to **40**, or HP to **300**. Measured
  throughput is 2 × 23 = 46 DPS for elites against 6 × 10 = 60 DPS for mobs,
  over pools of 400 vs 600 HP — elites are behind on both axes simultaneously.
- **Evidence:** no flip across any of the eight ±10% perturbations; the result
  is structural, not marginal.
- **Archetypes affected:** few-elites and lone-ace builds, which currently have
  no win path at any tested stat level.
- **If unchanged:** "bring more bodies" is strictly correct, and the ace /
  elite fantasy the tactical tier exists to serve cannot be expressed.

### N3 — Bleed duration 10 s → 7 s

- **Current:** 10 s duration, reapplied before expiry → **uptime 1.00**,
  against poison 0.83 and burn 0.73.
- **Recommended:** **7 s**, bringing uptime to roughly 0.8 in line with its
  siblings. Total per application falls 20 → 14 HP.
- **Evidence:** condition 03 — bleed is the only status that is never off the
  target once applied, and its 6 procs over 51.7 s never lapsed.
- **Archetypes affected:** sustained-damage builds; minor, since bleed's 2/s
  rate makes the practical swing ~1.9 DPS.
- **If unchanged:** low impact. This is the weakest of the three candidates and
  should be dropped if only two changes are wanted.

**Not proposed as numeric changes:** the heal-block/regen gap (P.4) needs a
code path, not a value; the ally first-mover bias, the evasion interval formula
and its 33% boundary, `guided_shot` dodgeability, and weapon-scale redesign are
all out of scope for this task.

COMBAT_POST_FIX_BALANCE_PLAYTEST_COMPLETE

---

# Hot-fix: heal-block now applies to regeneration

Task ID: `COMBAT-HOT-HEAL-BLOCK-FIX-001`
Base: `ba78533` (same merged state as the Post-fix chapter above).

§P.4 identified that `healReceivedMul`/`heal_block` was consumed by the direct
`heal` effect but ignored by the regeneration tick in `advanceMechanicsState`,
so conditions 04 and 05 were byte-identical. This is the narrowest possible fix
for that one gap. No other mechanic, number, or scenario changed.

## Fix

`advanceMechanicsState` now scales a status's over-time rate by the shared
`healingMultiplier(target)` helper **only when the rate is negative** (i.e. the
effect heals — currently only `regen`). Positive-rate effects (poison, burn,
bleed) are untouched. The same helper now backs the direct `heal` effect too,
so heal-block's `×0.25` is defined in exactly one place and cannot drift between
the two paths or be applied twice to the same source.

## Focused tests (`combatMechanicsHealBlockRegen.test.ts`, 8/8 pass)

| test | result |
| --- | --- |
| regen +20/10s under `heal_block` (×0.25) | **+5** |
| `healReceivedMul: 1.0` | +20 (unchanged) |
| `healReceivedMul: 0` | +0 |
| direct heal not doubly discounted | +5 for a 20-magnitude heal under block (matches pre-fix `Math.trunc(20*0.25)`) |
| poison/burn/bleed unaffected by heal_block or `healReceivedMul: 0` | 30/50/20, unchanged |
| tick-width invariance for reduced regen (1/30, 1/10, 1/2, 1 s) | all **+5** |
| maxHp clamp on unblocked regen | clamps at 200, does not overshoot |
| identical input reproduces identical output | byte-identical |

## Re-measurement

| condition | before this fix | after this fix |
| --- | --- | --- |
| regen isolated, 10 s, no block | +20 | +20 (unchanged) |
| regen isolated, 10 s, `heal_block` | **+20** | **+5** |
| direct heal, no block | +18 | +18 (unchanged) |
| direct heal, `heal_block` | +4 | +4 (unchanged — confirms no double-apply) |
| condition 04 vs 05 (Combat Lab) | **byte-identical** | **defender HP 18 vs 4 — different** |
| `healing_vs_block` built-in scenario | ALLY, 9.33 s, 162 healing | ALLY, 9.33 s, 162 healing (unchanged — this scenario uses direct heal, not regen) |

Condition 04/05 are no longer byte-identical, which was the specific expectation
this task set out to produce. Regen isolated matches the requested +20 → +5
exactly. The `healing_vs_block` built-in scenario is unaffected because it
exercises the direct-heal path, which was never broken.

## Verification

| check | result |
| --- | --- |
| Compile | clean |
| New focused tests | **8/8** |
| Golden Master parity fixtures | **8/8** |
| Combat suites (resolver, both correctness files, lab, lab store, workshop, workshop store, validator, loadout, integration) | **44/44** |
| `npm run test:unit` | **288/288** |
| Symbol Registry | regenerated, up to date |
| Built-in Combat Lab scenarios still deterministic | **10/10** |

## Scope discipline

Not touched, per the task: doom magnitude, elite HP/attack, bleed duration,
first-mover bias, any Ability/Status numeric value, UI, or mass-battle design.
Only `src/combatMechanicsResolver.ts` changed.

COMBAT_HOT_HEAL_BLOCK_FIX_PUSHED

---

# Doom V1 implementation — measured results

Task ID: `COMBAT-DOOM-V1-IMPLEMENTATION-001`
Base: `a17a9a4`. Design: `docs/COMBAT_LETHALITY_AND_ANTI_HORDE_DESIGN.md` Part 1.

Implements the adopted rule: **an expiring lethal timer executes only a target
already inside its rank's execution band, otherwise lands as 20% of `maxHp`, and
never kills a colossal.** Everything above this line is retained unchanged.

## D.1 What changed

| Area | Before | After |
| --- | --- | --- |
| Doom buildup magnitude | 40 → applied on hit 3 (**2.10 s**) | **25** → applied on hit 4 (**3.13 s**) |
| Expiry | Unconditional kill regardless of HP | Threshold-gated (§D.3) |
| Colossal | Temporary subsystem *disable* at application time; the timer never applied | Timer applies normally; on expiry **permanently destroys** one critical subsystem |
| Caster link | None — `kill caster` was a declared but impossible counter | `StatusInstance.sourceId` / `sourceAbilityId`; doom lifts when its caster dies |
| Warning | None | `doom_imminent` announced once, 3 s before resolution |
| HP writes | Doom wrote `hp = 0` directly | All damage funnels through a shared `applyHpDamage` → lethality gate |

A defect found during re-measurement and fixed in the same change: the
application-time `convert_subsystem` shortcut intercepted doom before the status
could ever be applied to a colossal, so the permanent-destruction path was
unreachable. Lethal timers are now exempt from that shortcut and convert at
expiry instead.

## D.2 Combat Lab, end to end

| # | Scenario | Applied | Imminent | Resolved | Result | Final HP | Det |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | vs 100 HP normal | 3.13 s | 12.13 s | 15.13 s | fallback damage | 0/100 † | ✔ |
| 5 | vs colossal | 3.13 s | 12.13 s | 15.13 s | **subsystem destroyed (`power`)** | **900/900** | ✔ |
| 8 | caster killed mid-timer | 1.63 s | — | — | **source defeated** | 900/900 | ✔ |

† Scenario 1 runs a caster that re-applies doom indefinitely against a passive
target, so the victim eventually dies to repeated cycles. Single-cycle behaviour
is isolated at resolver level below.

## D.3 Single doom cycle, HP at expiry controlled

| Case | HP % at expiry | Result | Final HP | Counter |
| --- | --- | --- | --- | --- |
| boss, full | 100% | fallback damage | **720/900** | — |
| boss | **19%** | **executed** | 0/900 | — |
| boss | **21%** | fallback damage | 9/900 | — |
| normal | **50%** | **executed** | 0/100 | — |
| normal | **51%** | fallback damage | 31/100 | — |
| elite | **35%** | **executed** | 0/100 | — |
| elite | **36%** | fallback damage | 16/100 | — |
| colossal, subsystems present | 100% | **subsystem destroyed (`power`)** | 900/900 | — |
| colossal, no subsystems | 100% | **no-subsystem misfire** | 900/900 | — |
| endure ×1 | 10% | **prevented** | **1**/100 | endure |
| undying covering timer | 10% | **prevented** | **1**/100 | undying |
| source defeated | — | **source defeated** | 10/100 | caster killed |
| healed out of band | 80% | fallback damage | 60/100 | **healed out** |
| cleansed | — | **cleansed** | 10/100 | cleanse |

Every rank boundary is exact, and `power` correctly outranks `locomotion` in the
subsystem priority walk.

## D.4 The original failure case

| | Before | After |
| --- | --- | --- |
| 900 HP target at full HP, attacker dealing 14 impact damage | **killed at 14.1 s** | **survives at 720/900** |

Doom is no longer a substitute for damage. Killing a 900 HP boss with it now
requires bringing the boss to 180 HP first.

## D.5 Verification

| check | result |
| --- | --- |
| New focused tests (`combatDoomV1.test.ts`) | **32/32** |
| Golden Master parity fixtures | **8/8** |
| Combat suites (resolver, 3 correctness files, lab, lab store, workshop ×2, validator, loadout, integration) | **76/76** |
| `npm run test:validate` | **7/7** |
| `npm run test:unit` | **288/288** |
| `npm run test:smoke` | **16/16** |
| Built-in Combat Lab scenarios deterministic | **10/10** |
| JSON round trip mid-timer | identical |
| Symbol Registry | regenerated, up to date |

## D.6 Validator

Nine lethal-timer rules now reject unfair generated abilities: tier below elite,
magnitude above 25, cooldown under 8 s, fewer than two counters, multi-target
shape, pairing with hard control, single-hit onset, and direct death against
colossal targets. The shipped `doom` ability passes all of them at magnitude 25.

## D.7 Out of scope, unchanged

AoE fan-out, engagement slots, cleave, overkill spill, momentum, re-pricing the
six AoE abilities, anti-horde abilities, first-mover bias, the evasion formula,
UI, and rosters — all untouched, per the task.

COMBAT_DOOM_V1_IMPLEMENTATION_PUSHED
