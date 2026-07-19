# Combat Mechanics V1 Ruleset — Concrete Numbers

Task ID: `COMBAT-MECHANICS-V1-RULESET-001`
Base: `daa39e4` (merge of `task/GAMBIT-COMBAT-TS-PARITY-001`, PR #16)
Status: **ruleset specification only.** No implementation, tests, PR, or merge.

Concretizes `docs/COMBAT_MECHANICS_DESIGN.md` into playable numbers. Where the
design document said "this is a knob", this document gives the recommended
value and does not hedge.

Inputs read: `docs/COMBAT_SYSTEM_DESIGN.md`, `docs/COMBAT_MECHANICS_DESIGN.md`,
`src/gambitCombatCore.ts`.

**V1 uses zero randomness.** No RNG stream, no seed, no dice. Every mechanic
below resolves deterministically. This is not a stylistic choice — it is what
keeps the Golden Master fixtures byte-identical (§1.4).

---

## 1. V1 Base Numeric Scale (V1基本数値スケール)

### 1.1 The anchor is the shipped roster

All values below are derived from the units that actually exist in the parity
build, not invented. From the Golden Master roster:

| Unit | Role | HP | ATK | DEF | HEAL | Speed | Range | CD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| タロウ(前衛) | Frontline | 170 | 14 | 2 | 0 | 72 | 48 | 0.9 |
| ゴウ(重装) | Frontline | 240 | 10 | 5 | 0 | 52 | 50 | 1.4 |
| レン(射撃) | Shooter | 90 | 18 | 0 | 0 | 66 | 240 | 1.0 |
| ミナ(衛生) | Medic | 110 | 8 | 0 | 18 | 78 | 95 | 1.2 |
| アキラ(支援) | Support | 110 | 13 | 0 | 0 | 72 | 160 | 1.0 |
| レイダー | Raider | 120 | 12 | 0 | 0 | 72 | 48 | 1.0 |
| スカウト | Scout | 70 | 10 | 0 | 0 | 110 | 46 | 0.7 |
| スナイパー | Shooter | 75 | 22 | 0 | 0 | 58 | 260 | 1.6 |
| 敵衛生兵 | Medic | 95 | 7 | 0 | 15 | 74 | 90 | 1.3 |
| ブルート | Brute | 240 | 20 | 3 | 0 | 40 | 52 | 1.6 |

Established scale: **HP 70–240 (median 110), ATK 7–22 (median 13), DEF 0–5,
HEAL 15–18, cooldown 0.7–1.6 s, DPS 8–20.**

Tick rate is 1/60 s (`deltaSeconds` on the battle spec); timeout is 3600 ticks
(60 s). A typical decisive engagement runs **8–20 s (480–1200 ticks)**.

### 1.2 Design budgets derived from that scale

These budgets are what make the numbers in §4 non-arbitrary:

| Budget | Value | Rationale |
| --- | --- | --- |
| Total DoT damage per proc | **20–40 HP** | 15–35% of a median 110 HP bar |
| Hard control duration | **1.5–6.0 s** | 10–30% of a 20 s fight; never a full lockout |
| Soft control duration | **4.0–10.0 s** | Longer is acceptable when it does not remove agency |
| Buildup procs per fight | **1–2 per status** | Escalation (§3.3) enforces this |
| Hits to first proc | **4** | Standard applicator, unresisted |
| Single heal | **15–18 HP** | Existing `heal_power`, unchanged |
| Barrier pool | **50–200** | 0.5–2 median healthbars |

### 1.3 New stats introduced in V1

| Stat | Range | Default | Meaning |
| --- | --- | --- | --- |
| `armor` | 0–40 | = existing `defense` | Flat pre-mitigation subtraction |
| `penetration` | 0–40 | 0 | Reduces target `armor` only |
| `evasion` | 0–50 | 0 | Deterministic dodge rate, %; see §2.2 |
| `accuracy` | 0–50 | 0 | Subtracts from target `evasion` |
| `resist[tag]` | 0–100 | 0 | Raises status buildup threshold |
| `barrier` | 0–200 | 0 | Impact-only absorb pool |
| `regen` | 0–8 | 0 | HP per second |
| `healReceivedMul` | 0.0–2.0 | 1.0 | Healing taken multiplier |
| `structureClass` | enum | `flesh` | `flesh` / `light` / `armored` / `structure` / `capital` |
| `weaponScale` | enum | `personal` | `personal` / `anti_armor` / `anti_ship` / `siege` |

`armor` is the **same field** as the existing `defense` — renamed conceptually,
not structurally. Nothing in `gambitCombatCore.ts` changes.

### 1.4 The parity guarantee, stated numerically

With every new stat at its default (`penetration 0`, `evasion 0`, `accuracy 0`,
`resist 0`, `barrier 0`, `regen 0`, `healReceivedMul 1.0`,
`structureClass flesh`, `weaponScale personal`), the §2 pipeline evaluates to:

```
max(1, attack − defense)
```

— identical to `src/gambitCombatCore.ts` line-for-line in result, consuming
zero RNG draws. **The existing 8/8 Golden Master fixtures must pass unchanged.**

---

## 2. Attack and Defense Formulas (攻撃・防御の具体式)

### 2.1 Ordered pipeline

```
S0  targeting legality      → illegal ⇒ no damage, attacker still pays cooldown
S1  dodge check             → dodged ⇒ miss, no damage, no buildup
S2  base      = attacker.attack
S3  scaled    = trunc(base × scaleMul[weaponScale][structureClass])
S4  armored   = scaled − max(0, target.armor − attacker.penetration)
S5  guarded   = trunc(armored × guardMul)             // V1: guardMul = 1.0 always
S6  resisted  = trunc(guarded × (1 − damageResistPct / 100))
S7  floored   = max(1, resisted)                      // immune ⇒ 0, floor bypassed
S8  barrier   = absorb impact damage from pool, overflow continues
S9  hp        = max(0, hp − remaining)
S10 lethality gate          → endure / undying may hold at 1 HP
S11 buildup application     → §3
S12 receipts emitted
```

Truncation happens at S3, S5, S6 (toward zero). HP, damage, armor, barrier, and
buildup are **integers throughout**. Only geometry uses float32 (`Math.fround`),
exactly as the current core does.

`damageResistPct` is clamped to **[−50, +75]**. True immunity is a separate
categorical flag (§6.6), never the tail of a stacking curve.

### 2.2 Deterministic dodge (S1)

V1 has no RNG, so evasion is a **counter**, not a roll:

```
effEvasion    = clamp(target.evasion − attacker.accuracy, 0, 50)
if effEvasion == 0 → always hit
dodgeInterval = ceil(100 / effEvasion)
target.incomingHitCount += 1
dodged        = (target.incomingHitCount % dodgeInterval == 0)
```

The counter is **per defender**, shared across attackers, and resets each
battle. Effective dodge rate snaps to `1 / dodgeInterval`, so use the canonical
value set:

| `evasion` | interval | effective dodge |
| --- | --- | --- |
| 0 | — | 0% |
| 20 | 5 | 20% |
| 25 | 4 | 25% |
| 33 | 3 | 33% |
| 50 | 2 | 50% |

Recommended assignment: Scout-type 25, light infantry 20, standard 0, heavy 0.
`accuracy` 15–25 on precision weapons. **50% is the hard ceiling** and should be
reserved for a dedicated evasion boss.

An attack tagged `cannotBeDodged` (area, beam, siege) skips S1 entirely and does
**not** advance the counter.

### 2.3 Scale multiplier table (S3)

Keys on **weapon scale × target structure**, never on attacker body size.

| weaponScale \ structureClass | flesh | light | armored | structure | capital |
| --- | --- | --- | --- | --- | --- |
| `personal` | 1.00 | 0.60 | 0.25 | 0.15 | **0.05** |
| `anti_armor` | 0.90 | 1.00 | 1.00 | 0.70 | 0.35 |
| `anti_ship` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `siege` | 1.00 | 1.00 | 1.00 | **1.50** | 0.80 |

Design notes:

- `personal` vs `capital` at 0.05 plus the minimum-damage floor means a rifleman
  chips a warship for exactly 1 per shot — futile but not literally zero, which
  is the correct feel and preserves "a thousand cuts" as a *narrative* option.
- `anti_ship` is deliberately flat 1.00 across the board. Capital weapons are
  balanced by **long cooldowns (3.0–5.0 s) and huge ATK**, not by an artificial
  penalty against infantry. A capital gun one-shots a soldier; it simply cannot
  do so efficiently. Area geometry (the "battleship sweeps the mob" fantasy) is
  V2 — see §10.
- `siege` vs `structure` at 1.50 is the only above-1.0 entry and exists so
  fortification assaults resolve in reasonable time.

### 2.4 Armor and penetration (S4)

```
effectiveArmor = max(0, target.armor − attacker.penetration)
```

Penetration **reduces armor and never becomes bonus damage**. Recommended armor
values: infantry 0–2, heavy infantry 5, light vehicle 8, armored 15,
structure 25, capital 40. Recommended penetration: standard 0, anti-armor 10,
anti-ship 25, siege 20.

Worked check — Ren (ATK 18, `personal`) against a `capital` (armor 40):
`trunc(18 × 0.05) = 0` → `0 − 40 = −40` → floor **1 damage**. Against a 5000 HP
capital that is 5000 hits. Correct.

Same Ren with an anti-ship launcher (ATK 18, `anti_ship`, pen 25):
`18 × 1.00 = 18` → `18 − max(0, 40 − 25) = 3` → **3 damage**. Still poor —
because ATK 18 is a personal-scale stat. A real anti-ship weapon carries
ATK 120+, giving `120 − 15 = 105`. **Weapon scale gates access; ATK provides
the magnitude.** Both are required.

### 2.5 Barrier absorption (S8)

Barriers absorb **impact damage only**. Poison, burn, and bleed bypass barriers
entirely (§4). This is the barrier archetype's designed weakness.

Pools deplete in ascending remaining-duration order (spend the expiring shield
first). Overflow continues to the next pool, then to HP, within the same hit.
Depletion emits `barrier_broken`.

### 2.6 Lethality gate (S10)

Reaching 0 HP is not death. The gate resolves, in order:

1. `undying` active → hold at 1 HP, no death
2. `endure` charge available → hold at 1 HP, consume charge
3. otherwise → death, emit `death`

An attack tagged `trueDeath` skips the gate entirely.

---

## 3. Status Buildup, Onset, and Removal (状態異常の蓄積・発症・解除)

### 3.1 Deterministic onset by accumulation

No proc chance. Statuses accumulate and fire on a threshold.

```
buildup[unit][tag] += applicator.value      // on a landing, non-dodged hit
threshold = 100 × (1 + resist[tag] / 100) × (1 + 0.5 × procCount[unit][tag])
if buildup ≥ threshold:
    apply status
    buildup = 0
    procCount += 1        // capped at 4
```

Applicator values: **light 15, standard 25, heavy 40.** A standard applicator
against an unresisted target procs on the **4th hit** (25 × 4 = 100).

### 3.2 Resistance

`resist[tag]` is 0–100 and raises the threshold multiplicatively:

| `resist` | threshold | hits to proc (standard) |
| --- | --- | --- |
| 0 | 100 | 4 |
| 25 | 125 | 5 |
| 50 | 150 | 6 |
| 100 | 200 | 8 |

Resistance never reaches immunity. Categorical immunity is a separate flag used
only where it is *logically* true (poison against a machine), and is itself
counterable by switching damage type.

### 3.3 Escalation (deterministic diminishing returns)

`procCount` raises the threshold 50% per prior proc, capped at 4:

| proc # | threshold (resist 0) | cumulative hits |
| --- | --- | --- |
| 1st | 100 | 4 |
| 2nd | 150 | 10 |
| 3rd | 200 | 18 |
| 4th | 250 | 28 |
| 5th+ | 300 | 40 |

At a 1.0 s cooldown this yields **1–2 procs in a typical 8–20 s fight**, exactly
the §1.2 budget. This is also the counter to status spam and requires no RNG.

### 3.4 Decay

Buildup decays **10 per second after 2.0 s** with no new application. A unit
that disengages sheds accumulated buildup — which makes `retreat_to_safe` a real
counterplay to status pressure, using gambit behavior that already exists.

### 3.5 Control diminishing returns

Separately from buildup, repeated **`control`-tagged** statuses on the same unit
degrade:

| application | duration |
| --- | --- |
| 1st | 100% |
| 2nd | 50% |
| 3rd | 25% |
| 4th+ | **immune for 10.0 s** |

The DR window resets after **10.0 s** free of control. This is core behavior,
not per-status data.

### 3.6 Removal

| Method | Effect |
| --- | --- |
| Expiry | Duration elapses |
| Cleanse | Removes **all buildup** on target plus the single highest-priority active debuff (§5.3) |
| Damage | Breaks `sleep` only |
| Death | Clears everything |
| `barrier_break` | Removes barrier pools and blocks new pools for 5.0 s |

Dispel priority (highest first): `doom` → `petrify` → `silence` → `sleep` →
`stun` → `paralysis` → `fear` → `taunt` → `burn` → `poison` → `bleed` → `slow`.

---

## 4. Status Catalogue — Fixed Specifications (各状態異常の確定仕様)

All durations in seconds. All damage in HP. `flesh_only` statuses do not
accumulate on `armored` / `structure` / `capital` targets.

### 4.1 Damage over time

| Status | Duration | Effect | Total | Stacking | Barrier | Tags |
| --- | --- | --- | --- | --- | --- | --- |
| **毒 Poison** | 8.0 | 3 HP/s, ignores armor | 24 | `stack_intensity`, max 3 (+2 HP/s each) | bypasses | `dot`, `flesh_only`, `dispellable` |
| **炎上 Burn** | 6.0 | 5 HP/s, target armor −2 | 30 | `refresh` | bypasses | `dot`, `armor_impairing`, `dispellable` |
| **出血 Bleed** | 10.0 | 2 HP/s, **+2 HP/s while the unit moved this tick** | 20–40 | `stack_duration`, max 20.0 | bypasses | `dot`, `flesh_only`, `dispellable` |

Poison at 3 stacks is 7 HP/s for 8 s = 56 total — a genuine threat that still
requires 12+ applying hits to reach.

Bleed is the only status that reads the movement the gambit engine already
tracks: standing still halves it. That is its counterplay, and it interacts
directly with `retreat_to_safe` and `move_to_nearest_enemy`.

### 4.2 Soft control

| Status | Duration | Effect | Stacking | Tags |
| --- | --- | --- | --- | --- |
| **鈍足 Slow** | 6.0 | `move_speed × 0.5` | `refresh` | `movement_impairing`, `dispellable` |
| **沈黙 Silence** | 5.0 | Cannot heal, cleanse, or use skills. Attacks still allowed | `refresh` | `healing_impairing`, `dispellable` |
| **恐怖 Fear** | 4.0 | Forced `retreat_to_safe` behavior, overriding gambits | `refresh` | `control`, `dispellable` |
| **挑発 Taunt** | 4.0 | Forced target = taunter, overriding target selection | `refresh` | `control`, `dispellable` |

Silence is the designated **anti-medic** tool and the counter to sustain
compositions. Fear and Taunt are `control`-tagged and therefore subject to DR
(§3.5) — without that, chain-taunt trivializes any AI.

### 4.3 Hard control

| Status | Duration | Effect | Stacking | Tags |
| --- | --- | --- | --- | --- |
| **麻痺 Paralysis** | 4.0 | `move_speed × 0`, **attacks still allowed**, `evasion → 0` | `refresh` | `control`, `movement_impairing` |
| **気絶 Stun** | **1.5** | `cannotAct` | `ignore` (no refresh) | `control` |
| **睡眠 Sleep** | 6.0 | `cannotAct`; **any damage breaks it**, and the waking hit deals ×1.5 | `refresh` | `control` |
| **石化 Petrify** | 5.0 | `cannotAct`, incoming damage ×0.5, **no new buildup accumulates** | `ignore` | `control`, `structural` |

Deliberate distinctions:

- **Paralysis is not a mini-stun.** It removes movement, not agency — a
  paralyzed shooter keeps firing. It also zeroes evasion, making it the primary
  counter to evasion-type defense.
- **Stun is only 1.5 s** because it is total. Combined with DR it can never
  chain-lock.
- **Sleep must break on damage.** Otherwise it is strictly better than stun and
  the two collapse into one status. The ×1.5 waking hit rewards the burst.
- **Petrify is double-edged**: a full lockout that also halves damage and blocks
  further buildup. Petrifying an ally is a legitimate emergency defense. This
  ambiguity is intended.

### 4.4 Doom

| Status | Duration | Effect | Stacking | Tags |
| --- | --- | --- | --- | --- |
| **死の宣告 Doom** | **12.0** | On expiry, HP → 0 through the normal lethality gate | `ignore` | `lethal_timer`, `dispellable` |

Rules: does no damage while ticking; **must be visible** to the player and to
gambits (`ally_doomed`, §8); passes through the lethality gate so `undying` and
`endure` still apply; 12.0 s is long enough that cleansing is a real decision
and short enough to matter inside a 20 s fight.

### 4.5 Defense-stripping effects

| Effect | Duration | Magnitude | Stacking | Counters archetype |
| --- | --- | --- | --- | --- |
| **装甲破壊 Armor Break** | 8.0 | `armor × 0.5`, rounded down | `refresh` | Armor (§6.2) |
| **耐性低下 Resist Down** | 8.0 | `resist[all] − 25`, floor 0 | `refresh`, max 2 stacks | Status resistance |
| **バリア破壊 Barrier Break** | instant + 5.0 lockout | Removes all pools, blocks new pools 5.0 s | `ignore` | Barrier (§6.3) |

Armor Break against a capital (armor 40) yields armor 20, converting an
anti-armor weapon (pen 10) from `40−10=30` reduction to `20−10=10`. That is a
threefold damage swing — armor break is intended to be a *decisive* tactical
play, not a minor buff.

---

## 5. Healing and Support — Fixed Specifications (回復・支援の確定仕様)

### 5.1 Direct healing

```
healed = min( trunc(healPower × target.healReceivedMul), target.maxHp − target.hp )
```

Existing `heal_power` values (15–18) are unchanged. Overheal is **discarded** —
it does not become a shield. Cooldown remains the existing `attack_cooldown`
(1.2–1.3 s for medics).

### 5.2 Regeneration (継続回復)

| Property | Value |
| --- | --- |
| Rate | **2 HP/s** |
| Duration | **10.0 s** |
| Total | 20 HP |
| Stacking | `refresh` |
| Tags | `beneficial`, `dispellable` |

Deliberately equal to roughly one medic heal spread over time — so regen is a
sustain tool, not a burst-healing replacement. Subject to `healReceivedMul`.

### 5.3 Cleanse (治療)

| Property | Value |
| --- | --- |
| Effect | Removes **all buildup** on target + the single highest-priority active debuff (§3.6) |
| Cooldown | **4.0 s** |
| Blocked by | `silence` |

Removing all buildup is the important half — it undoes accumulated pressure, not
just the visible symptom, which makes cleansing worth an action even when no
status has procced yet.

### 5.4 Revival (蘇生)

| Property | Value |
| --- | --- |
| Restored HP | **30% of maxHp** |
| Penalty | `revival_sickness`: all output ×0.5 for **10.0 s** |
| Limit | **Once per unit per battle** |
| Blocked by | `trueDeath` kills, `silence` |
| Default availability | **Unavailable** — scenario/genre packs opt in |

Defaulting revival to unavailable matches the Living World stance that death is
not casually reversible, and prevents V1 fights from becoming attrition stalls.

### 5.5 Healing reduction (回復阻害)

| Property | Value |
| --- | --- |
| Effect | `healReceivedMul = 0.25` (−75%) |
| Duration | **8.0 s** |
| Stacking | `refresh` |
| Counter | Cleanse; outlasting it |
| Tags | `healing_impairing`, `dispellable` |

Not 0.0. A hard heal-block invalidates the entire support role for its
duration; 25% keeps medics relevant while decisively beating regeneration-type
defense (§6.4).

---

## 6. Defensive Archetypes — Strengths and Weaknesses (防御アーキタイプ別の強みと弱点)

### 6.1 Evasion type (回避型)
**Build:** `evasion` 25–33, low HP (70–110), low armor.
**Strong against:** many small hits — every 3rd or 4th is negated outright.
**Weak against:** `accuracy` (direct subtraction), `cannotBeDodged` attacks,
**paralysis (sets evasion to 0)**, and DoT (buildup lands on hits that connect,
and DoT ignores evasion once applied).
**Numbers:** Scout at evasion 25 facing ATK 14 attacks takes 3 of every 4 →
effective incoming DPS reduced 25%. An attacker with accuracy 25 removes the
entire benefit.

### 6.2 Armor type (装甲型)
**Build:** `armor` 15–40, high HP (240+), low speed.
**Strong against:** low-ATK, high-frequency attackers — reduced to the 1-damage
floor.
**Weak against:** `penetration`, **Armor Break (−50%)**, `anti_armor` scale, and
all DoT (poison/burn/bleed ignore armor entirely).
**Numbers:** armor 15 vs ATK 10 → 1 damage per hit. The same target vs ATK 10
with pen 10 → 5 damage. Vs poison → full 3 HP/s regardless.

### 6.3 Barrier type (バリア型)
**Build:** `barrier` 100–200, average everything else.
**Strong against:** burst impact damage; the pool absorbs an entire alpha strike.
**Weak against:** **DoT (bypasses barriers completely)**, Barrier Break
(removes pool + 5 s lockout), and sustained chip that outlasts reapplication.
**Numbers:** a 150 barrier absorbs ~10 hits at ATK 15, but poison at 3 HP/s
tears through it as if it did not exist.

### 6.4 Regeneration type (再生型)
**Build:** `regen` 5–8 HP/s, medium HP.
**Strong against:** chip damage and any incoming DPS below the regen rate.
**Weak against:** **回復阻害 (−75% → effective regen 1.25–2 HP/s)**, sustained
DPS above the rate, and burst that outruns the tick.
**Numbers:** regen 5 HP/s beats a single ATK 10/1.0 s attacker net −5 HP/s; one
additional attacker flips it. Under heal reduction it collapses to 1.25 HP/s.

### 6.5 Phase type (位相 — untargetable)
**Build:** `untargetable` window.
**Fixed constraints (non-negotiable):** maximum **2.0 s** duration, minimum
**15.0 s** cooldown, **cannot attack while phased**, and must be visible to the
opponent.
**Weak against:** `cannotBeDodged` area attacks, which ignore targeting legality
entirely; and simply waiting 2 seconds.

### 6.6 Undying type (不死型)
**Build:** `endure` charge or `undying` window.
**Fixed constraints:** `endure` = survive at 1 HP, **once per 20.0 s**;
`undying` = cannot drop below 1 HP for **3.0 s**, once per battle.
**Weak against:** consuming the charge then killing inside the window, and
`trueDeath` sources (which bypass the gate outright).

### 6.7 Combination rule

A unit with **three or more archetypes at listed maximums is a boss-tier
design decision** requiring an explicitly authored counter in the encounter, not
an emergent stat outcome. V1 recommends at most two archetypes per ordinary
unit.

---

## 7. Conversion to Huge Targets, Squads, and Fleets (巨大目標・部隊・艦隊への変換表)

### 7.1 Principle

Huge targets are **never given blanket status immunity**. Hard control is
*converted* into subsystem damage, which is both more interesting and more
narratable.

### 7.2 Huge target (巨大目標) — control converts to subsystem disable

Huge/`capital` targets carry subsystems, each with its own HP:

| Subsystem | HP (of a 5000 HP capital) | Disabled effect |
| --- | --- | --- |
| Engine | 800 | `move_speed × 0` |
| Main gun | 600 | Cannot use `anti_ship` attacks |
| Sensors | 400 | Target selection degrades to nearest-only |
| Bridge | 500 | Skips actions for the disable duration |

Control buildup does not control the hull; it accumulates against a subsystem
and disables it on proc:

| Status | Converts to | Disable duration |
| --- | --- | --- |
| 気絶 Stun | Sensors offline | 4.0 s |
| 麻痺 Paralysis | Engine disabled | 6.0 s |
| 睡眠 Sleep | Bridge disabled | 5.0 s |
| 沈黙 Silence | Fire control — no `anti_ship` attacks | 6.0 s |
| 石化 Petrify | Armor lock: speed 0, incoming ×0.5 | 5.0 s |
| 挑発 Taunt | **Applies normally** (targeting, not control) | 4.0 s |
| 恐怖 Fear | **Dropped** — emits `effect_out_of_scale` | — |
| 毒 Poison | **Immune** (`flesh_only`) | — |
| 炎上 Burn | Applies at **×0.5** rate (structural fire) | 6.0 s |
| 出血 Bleed | **Immune** (`flesh_only`) | — |
| 死の宣告 Doom | Converts to **critical subsystem loss** (main gun destroyed), not death | permanent |

Doom converting to permanent subsystem loss rather than instant capital death is
the single most important entry here — it keeps doom relevant against bosses
without making a 12-second timer delete a set-piece encounter.

### 7.3 Squad (部隊) — control converts to effectiveness loss

A squad token pools member HP and carries `strength` (member count).

| Individual effect | Squad conversion |
| --- | --- |
| 気絶 Stun (1.5 s) | Output ×0.8 for 1.5 s |
| 睡眠 Sleep (6.0 s) | Output ×0.6 for 6.0 s, breaks on damage |
| 麻痺 Paralysis | `move_speed × 0.5` (not 0 — the squad disperses) |
| 石化 Petrify | **Dropped** — `effect_out_of_scale` |
| 恐怖 Fear | Forced retreat — applies fully (morale is real at squad scale) |
| 挑発 Taunt | Applies fully |
| 沈黙 Silence | Squad medics suppressed; no healing output |
| DoT (poison/burn/bleed) | Applies to pooled HP at **×0.5** (dispersion) |
| 回復阻害 | Applies fully |
| Barrier | Reads as prepared position / fortification |

### 7.4 Fleet (艦隊)

A fleet token is a group of `capital` units. Each member resolves under §7.2, and
the fleet aggregates:

| Effect | Fleet conversion |
| --- | --- |
| Any control | Applies to **one member ship**, chosen as the highest-HP undisabled member (deterministic) |
| DoT | Applies to the flagship only, at ×0.5 |
| 死の宣告 Doom | One member loses its main gun permanently |
| 挑発 Taunt | Entire fleet retargets (fleet-wide fire discipline) |
| 恐怖 Fear | Dropped |
| Barrier | Fleet-wide screen; depletes before any member takes impact damage |

### 7.5 Effects that do not convert are dropped, not faked

Every dropped effect emits `effect_out_of_scale`. Silently inventing an
equivalent produces numbers nobody can justify and narration that reads wrong.

---

## 8. Gambit Conditions and Action Tags (ガンビット条件・行動タグ)

Existing conditions (`self_hp_below`, `ally_hp_below`, `backline_threatened`,
`enemy_in_range`, `enemy_too_close`, `nearest_enemy_exists`) are **unchanged**.
New entries use the identical `{ cond, param, action, factor }` shape.

### 8.1 New conditions

| Condition | Param | Fires when |
| --- | --- | --- |
| `self_has_effect` | tag | Bearer has any effect with that tag |
| `ally_has_effect` | tag | Any ally has it |
| `enemy_has_effect` | tag | Any enemy has it |
| `ally_doomed` | — | Any ally carries `lethal_timer` |
| `ally_incapacitated` | — | Any ally has `control` and `cannotAct` |
| `self_buildup_above` | 0.0–1.0 | Own highest buildup ÷ threshold exceeds param |
| `self_barrier_below` | 0.0–1.0 | Own barrier fraction below param |
| `enemy_barrier_above` | 0.0–1.0 | Nearest enemy barrier fraction above param |
| `enemy_untargetable` | — | Nearest enemy is phased |
| `self_healing_blocked` | — | Own `healReceivedMul < 1.0` |
| `enemy_armor_above` | integer | Nearest enemy armor exceeds param |

`self_buildup_above` is the standout: it lets a unit **disengage before a status
lands**, turning §3.4 buildup decay into deliberate play rather than an
accounting detail.

### 8.2 New actions

| Action | Behavior |
| --- | --- |
| `cleanse_ally` | Cleanse the ally with the highest dispel-priority debuff |
| `dispel_enemy` | Remove the highest-priority buff from nearest enemy |
| `shield_ally` | Apply a barrier to the lowest-barrier ally |
| `revive_ally` | Revive a fallen ally (if enabled) |
| `focus_doomed_enemy` | Concentrate on an enemy carrying `lethal_timer` |
| `focus_lowest_barrier` | Attack the enemy with the least barrier remaining |
| `use_penetrating_attack` | Switch to an `anti_armor` profile |
| `break_armor` | Apply Armor Break |
| `retreat_until_buildup_clears` | Disengage until own buildup decays below 25% |

### 8.3 Tag vocabulary (the authoring contract)

`control`, `dot`, `lethal_timer`, `movement_impairing`, `healing_impairing`,
`armor_impairing`, `dispellable`, `beneficial`, `harmful`, `flesh_only`,
`structural`, `untargetable`.

Gambits author against **tags, never status ids**, so a genre pack can add a new
poison without touching a single gambit list.

### 8.4 Recommended V1 default gambit additions

```
Medic  — insert at priority 2:
  { cond: "ally_doomed",        action: "cleanse_ally" }
  { cond: "ally_incapacitated", action: "cleanse_ally" }

Shooter — insert at priority 2:
  { cond: "self_buildup_above", param: 0.75, action: "retreat_until_buildup_clears" }

Frontline — insert at priority 2:
  { cond: "enemy_armor_above",  param: 10,   action: "break_armor" }
```

### 8.5 Evaluation cost

Effect predicates must be **O(1) lookups against a precomputed per-unit tag
set**, refreshed once per tick before gambit evaluation — never a scan of an
effect list. Gambits run per unit per tick; a linear scan makes status count a
quadratic cost exactly in the large battles where it is least affordable.

---

## 9. Ten Worked Combat Examples (代表的な10件の戦闘例)

All numbers follow §2–§7 exactly.

### 9.1 Parity baseline — タロウ vs レイダー
Neutral profiles. Taro ATK 14 vs Raider DEF 0 → `max(1, 14−0) = 14`, every
0.9 s. Raider ATK 12 vs Taro DEF 2 → `max(1, 12−2) = 10`, every 1.0 s.
Raider (120 HP) dies after 9 hits ≈ 8.1 s; Taro has taken ~80 of 170.
**Identical to the current Golden Master output.** ✅

### 9.2 Armor wall — レン vs ブルート with armor 15
Ren ATK 18, `personal`, pen 0 vs armor 15 → `18 − 15 = 3` per shot, 1.0 s.
240 HP ÷ 3 = **80 seconds** — past the 3600-tick timeout. Ren cannot win.
With `use_penetrating_attack` (pen 10): `18 − 5 = 13` → 19 s. **Winnable.**
Demonstrates armor as a hard gate that penetration, not persistence, opens.

### 9.3 Deterministic evasion — スカウト (evasion 25) vs タロウ
Interval = ceil(100/25) = 4. Every 4th of Taro's attacks is dodged. Taro's
effective DPS drops from 15.5 to 11.7. Scout (70 HP) survives 7 landed hits at
14 = 6 attacks-worth longer.
Taro switches to a precision profile (accuracy 25): effEvasion = 0, **all
attacks land**. Scout dies in 5 hits ≈ 4.5 s.

### 9.4 Poison buildup — standard applicator vs ゴウ (240 HP, armor 5)
Applicator 25/hit, resist 0, threshold 100 → procs on **hit 4** (≈ 4.0 s).
Poison: 3 HP/s × 8.0 s = **24 damage, ignoring armor 5 entirely**.
Second proc needs threshold 150 → 6 more hits (≈ 10 s) — total 48 poison damage
over a 14-second fight, 20% of Gou's bar. Armor contributed nothing.

### 9.5 Barrier vs DoT — barrier 150 defender
Attacker A: impact ATK 20/1.0 s → absorbed entirely for 7.5 s, then HP damage.
Attacker B: poison applicator → 4 hits to proc, then **3 HP/s straight to HP**
while the barrier sits untouched.
The barrier build beats burst and loses to sustained toxicity. Applying
`barrier_break` removes the pool and locks reapplication for 5.0 s.

### 9.6 Regeneration vs heal reduction — regen 5 HP/s defender
Single attacker ATK 14/0.9 s = 15.5 DPS → net −10.5 HP/s. Regen loses.
Against chip (ATK 6/1.0 s = 6 DPS) → net **−1 HP/s**, a near-stalemate the
defender can hold with any outside support.
Apply 回復阻害 (×0.25): regen becomes 1.25 HP/s → net −4.75 HP/s even against
chip. The archetype is decisively countered without being deleted.

### 9.7 Medic denial — 沈黙 on ミナ
Silence 5.0 s blocks `heal_lowest_hp_ally`, `heal_self`, and `cleanse_ally`.
Mina's normal output is 18 HP per 1.2 s = 15 HP/s; silence removes **75 HP** of
healing. Counter: another medic cleanses her (blocked only for the silenced
unit), or she survives the 5 s. Note silence does **not** stop her attacking.

### 9.8 Doom race — 死の宣告 on タロウ
Doom applied at t=0, expires t=12.0. Mina's cleanse cooldown is 4.0 s, so she
has up to three attempts — but each cleanse spent on Taro is a heal not given.
If Mina is silenced at t=8.0 for 5.0 s, the window closes and Taro dies at
t=12.0 through the normal lethality gate (an `endure` charge would still save
him at 1 HP). **Doom is a resource-drain, not a coin flip.**

### 9.9 Infantry vs capital — 5 riflemen vs a 5000 HP warship
Each: ATK 18, `personal` vs `capital` → `trunc(18 × 0.05) = 0` → `0 − 40` →
floor **1 damage**. Five riflemen at 1.0 s = 5 DPS → **1000 seconds.** Futile,
as intended, and never literally zero.
Same squad with anti-ship launchers (ATK 120, `anti_ship`, pen 25):
`120 − max(0, 40−25) = 105` each → 525 DPS → **9.5 seconds.**
Weapon scale, not headcount, is what decides this fight.

### 9.10 Stunning a warship — control conversion
A stun applicator lands 4 hits on a `capital`. Instead of a 1.5 s hull stun, the
buildup resolves against **Sensors**, disabling them for **4.0 s** — the ship
degrades to nearest-only targeting and its escorts lose fire coordination.
Landing doom instead destroys the **main gun permanently**, removing its
`anti_ship` attacks for the rest of the battle without killing it.
The boss is never status-immune; the status simply means something different.

---

## 10. V1 Scope and Deferred Items (V1実装対象とV2以降へ送る項目)

### 10.1 In scope for V1

- §2 pipeline stages S0–S12, with `guardMul` fixed at 1.0
- Deterministic dodge counter (§2.2)
- Scale multiplier table (§2.3), armor/penetration (§2.4)
- Barrier pools, impact-only (§2.5)
- Lethality gate with `endure` / `undying` (§2.6)
- Buildup / resistance / escalation / decay / control DR (§3)
- All 12 statuses in §4, exactly as specified
- Armor Break, Resist Down, Barrier Break (§4.5)
- Healing, regeneration, cleanse, revival (default off), heal reduction (§5)
- All six defensive archetypes (§6)
- Huge-target subsystem conversion, squad and fleet conversion (§7)
- All new gambit conditions, actions, and the tag vocabulary (§8)

**Milestone 0, before anything else:** confirm the neutral profile reproduces
`max(1, attack − defense)` and the 8/8 Golden Master fixtures pass byte-identical
(§1.4). If that is hard, the layering is wrong.

### 10.2 Deferred to V2+

| Item | Why deferred |
| --- | --- |
| Attack geometry (`cone`/`line`/`circle`/`beam`/`sweep`) | The "battleship sweeps the mob" fantasy needs area resolution; V1 is single-target only |
| Facing, turn rate, firing arcs, blind spots | Requires the geometry layer; §2.3 compensates with cooldown instead |
| Guard / parry / cover stances | Needs an action-economy model V1 does not have; `guardMul` is a placeholder at 1.0 |
| Seeded RNG, graze band | V1 is fully deterministic by design; introduce only when `D2-001D` settles |
| Per-attacker dodge counters | V1 shares one counter per defender |
| More than two sides (`team: 0 \| 1`) | The parity core is strictly two-sided |
| Status persistence into character/vehicle ledgers | Owned by State Orchestrator writeback, not this document |
| Player-facing effect UI / replay visualization | Webview work, gated separately |
| Multi-charge revival, resurrection economies | V1 is once per unit per battle, default off |

### 10.3 Non-goals (unchanged)

- No modification to `src/gambitCombatCore.ts`
- No rewrite of `src/massBattleCore.ts`
- No `Math.random()` and no unreceipted randomness anywhere in V1
- No float arithmetic in the HP/damage/buildup domain
- No implicit multiplicative stat stacking
- No mechanic without a documented counter
- No status defined in code that could be defined in data
- No implementation, tests, PR, or merge from this document
