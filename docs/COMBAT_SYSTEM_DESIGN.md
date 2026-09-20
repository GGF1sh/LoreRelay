# Combat System Design — Tiered Resolution (Person → Empire)

Status: design brief + gate-ready framing. No implementation in this document.

Track: optional system, default OFF. Must not change existing campaigns when OFF.

This document defines how LoreRelay resolves combat across wildly different
scales (a beggar's knife fight up to an imperial army clash) and wildly
different unit sizes (infantry, mechs, warships) **without** turning the text
adventure into a real-time RTS the player has to watch.

It reconciles three things that already exist or were previously decided:

1. `src/massBattleCore.ts` — a deterministic abstract army-battle resolver
   already shipped under Domain Mode (`enableMassBattle`).
2. `docs/VEHICLE_SYSTEM_DESIGN.md` — which deliberately made *tactical grid
   combat*, *ballistic simulation*, and *real-time driving* **Non-Goals**, and
   models vehicle combat as abstract `combatPower` / `defensePower` bands.
3. The `gunbitrts` Godot prototype (`D:\Gamecreate\gunbitrts`) — a continuous-2D
   "gambit" skirmish engine the user wants to reuse.

The resolution is not "pick one engine." It is a **tiered model** where the
*stakes and scale* of an encounter select the resolver. The gambit engine
becomes one opt-in tier, not the whole combat system.

This document authorizes only high-level design patterns. It does not authorize
copying code, schemas, names, data, or rules from FF12, Final Fantasy Tactics,
Metal Max, Kenshi, or any other reference work. The `gunbitrts` gambit code is
the user's own and may be ported.

---

## 0. Core Principle

> The player experiences combat as **prose narrated by the GM**, never as a
> screen of moving dots. Any simulation exists only as a *truth engine* that
> produces a deterministic log for the GM to novelize.

This is the decisive constraint and it resolves most of the user's anxiety:

- In `gunbitrts`, the gambit sim **is** the game — you watch it.
- In LoreRelay, **nobody watches the sim.** Its only value is the log it emits.
- Therefore a rich simulation is worth building **only where the resulting log
  makes the GM's narration meaningfully better** — set-piece battles where
  position, size, and maneuver matter. For a goblin ambush it is pure waste.

This principle is also why the existing abstract approach (`massBattleCore`,
vehicle combat bands) is *correct* for most of the game and must be preserved,
not replaced.

---

## 1. The Two Problems, Named Separately

The user's confusion collapses two orthogonal axes into one word ("size").
Separating them is the key clarifying move.

### 1.1 Grain — the zoom level of the whole battle

*What does one combatant token represent?*

| Grain | A token is… | Time feel | Example role |
| --- | --- | --- | --- |
| `individual` | one person / one machine | seconds | beggar, hero, a single mech |
| `squad` | a small unit (5–30) | minutes | platoon leader, a lance of mechs |
| `army` | a formation (hundreds+) | days | marshal, warlord |
| `nation` | whole domains | months | king, emperor |

Grain sets the **time scale** and **what a token is**. It is chosen per battle.

### 1.2 Size Class — physical size *within one grain*

*Among tokens fighting in the same battle, how big is each?*

At `individual` grain a battle can still contain an infantryman, a mech, and a
warship. That is `sizeClass`, and it drives the damage-correction table, the
token radius, default turn rate, etc.

```
grain        = the battle's zoom (everyone is individuals, OR everyone is armies)
sizeClass    = one token's physical size relative to its peers at that grain
```

- "個人戦闘 vs 部隊戦闘" → different **grain**.
- "戦艦 vs ロボ" → same grain, different **sizeClass**.

One engine can serve many grains by swapping what a token aggregates. Size
differences are then just a per-token attribute, not a special case.

---

## 2. The Tiered Model (the architecture)

An encounter picks a tier from its stakes. Higher tiers cost more to run and to
maintain; you climb only when the payoff (a better narrated battle, a real
tactical decision) justifies it.

| Tier | Name | Engine | When it fires | Grain(s) |
| --- | --- | --- | --- | --- |
| **0** | Narrative | none (GM freeform) | trivial / flavor fights | any |
| **1** | Skirmish resolver | `skirmishCombatCore` (new, abstract) | most encounters; the "simple turn-based RPG" feel | individual, small squad |
| **2** | Gambit sim | `gambitCombatCore` (new, ported from gunbitrts) | set-piece battles where position & size matter | individual, squad |
| **3** | Mass battle | `massBattleCore` (**exists**) | armies, domains, nations | army, nation |

Key points:

- **Tier 1 is the user's requested "簡易ターン制RPGっぽい" mode.** It is small,
  deterministic, and in the same family as `massBattleCore` — no positions.
- **Tier 2 is the home for the gunbitrts gambit engine.** It is the *only* tier
  that uses continuous 2D space, and it is opt-in per battle. This is where
  warship-vs-mech size drama and the "battle-log → AI novelization" dream live.
- **Tier 3 already works.** This document does not modify `massBattleCore`; it
  places it in the taxonomy and shares the narration contract (§6).
- Tier selection can be authored (scenario/quest), rule-driven (enemy size or
  count crosses a threshold), or GM-chosen. Default when unsure: **Tier 0/1.**

### 2.1 Why not hex/square grids

For the size problem specifically, a discrete grid is the *worst* option: a
warship must occupy many cells, creating exceptions for adjacency, line-of-fire,
and movement cost against a one-cell mech. Continuous coordinates
(`position` + `radius`), which the gunbitrts prototype already uses, represent
size natively — a battleship is just a token with a large radius. So Tier 2 uses
continuous space, and Tiers 0/1/3 use no space at all. **A grid appears nowhere.**

---

## 3. Reconciliation with Existing Systems

### 3.1 `massBattleCore.ts` (already shipped)

- Role: **Tier 3.** Rock-paper-scissors tactics (`assault`/`hold`/`stratagem`),
  ≤3 rounds, troop-percentage losses, `BattleOutcomeKind` → `DomainStatDelta`.
- Unchanged by this design. Its `narrativeHintId` / `reportLine` pattern is the
  template the other tiers copy for GM narration (§6).
- Flag: `enableMassBattle` (existing). New tiers get their own flags (§7).

### 3.2 Vehicle System (`VEHICLE_SYSTEM_DESIGN.md`)

The vehicle doc's Non-Goals (no tactical grid, no ballistics, no real-time
driving) remain **true for the vehicle ledger**. Tier 2 does not violate them
because:

- Tier 2 is a **headless, opt-in truth engine**, not a driving simulator the
  player operates in real time. There is still no player-controlled physics.
- A `VehicleEntry` does not *become* a Tier-2 combatant automatically. When a
  battle needs it, a vehicle is **projected** into a combatant token
  (§4.3), reusing `VehicleCombatProfile`, `VehicleDurability`, and
  `VehicleSizeClass`. The ledger stays the source of truth; the battle reads
  from it and writes results back via `vehicleOps.damage_vehicle`.
- `VehicleSizeClass` (`tiny…colossal`) is reused directly as the Tier-2
  `sizeClass`. No parallel taxonomy.

This means the warship/mech/turret questions are answered by *extending the
existing vehicle profile*, not by a new subsystem (§5.3).

---

## 4. Shared Combat Model

All tiers share one combatant abstraction so stats, damage, and status effects
are defined once. Tiers differ only in *how tokens are resolved against each
other* (abstract math vs continuous sim).

### 4.1 Combatant

```ts
type Grain = 'individual' | 'squad' | 'army' | 'nation';
type SizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'colossal';
// SizeClass is intentionally identical to VehicleSizeClass.

type Combatant = {
  id: string;
  name: string;
  side: 'ally' | 'enemy';
  role: string;              // Frontline / Shooter / Medic / Support / Scout / …
  grain: Grain;

  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  healPower?: number;

  sizeClass: SizeClass;      // drives damage correction + Tier-2 radius/turn defaults
  statuses?: StatusInstance[];
  tags?: string[];           // e.g. 'legendary', 'flagship'

  // Tier-2-only fields (ignored by Tiers 0/1/3):
  tactical?: TacticalProfile;
};
```

### 4.2 Damage resolution (shared by Tier 1 & 2)

```ts
// Deterministic. sizeMultiplier is data-driven (§8), not hardcoded.
function resolveDamage(attacker: Combatant, target: Combatant, ctx: DamageCtx): number {
  const base = Math.max(1, attacker.attack - target.defense);
  const sizeMul = ctx.sizeTable[attacker.sizeClass][target.sizeClass];
  const legendaryOverride = attacker.tags?.includes('legendary')
    && ctx.ignoresSizePenalty(attacker); // the "覆す伝説の一撃" hook
  const mul = legendaryOverride ? Math.max(1, sizeMul) : sizeMul;
  return Math.max(1, Math.round(base * mul * ctx.statusMul(attacker, target)));
}
```

- Size correction is a **table lookup**, so "a mech's rifle barely scratches a
  battleship, but a battleship's cannon deletes a mech" is pure data.
- The "legendary weapon that overturns the size gap" is a **tag + flag**, not a
  special case in the engine — exactly the data-driven pattern used by Campaign
  Kit and the vehicle module `effects[]`.

### 4.3 Projection (aggregation & vehicle → token)

The single most important helper for scale sanity:

```ts
// squad grain: 20 soldiers → one token with pooled HP, representative stats & gambits.
function projectSquad(members: UnitStat[], template: SquadTemplate): Combatant;

// vehicle ledger → combatant token (reuses VehicleCombatProfile/Durability/SizeClass).
function projectVehicle(v: VehicleEntry): Combatant;
```

Projection is where "個人戦闘と部隊戦闘でパラメータを変えるべきか" is answered:
**you do not maintain two stat systems.** You maintain one `Combatant` plus
projection functions that fold a squad or a vehicle into it. Damage/status/AI
logic never changes with grain.

---

## 5. Tier Designs

### 5.1 Tier 1 — Skirmish resolver (`skirmishCombatCore.ts`)

The "simple turn-based RPG" the user asked for.

- No positions. Round-based (cap ~6). Each round, each living combatant acts by
  a **tiny gambit list** (reuse the Tier-2 rule shape, but conditions are
  scale-free: `self_hp_below`, `ally_hp_below`, `enemy_weakest`, else attack).
- Optional single **player tactic** per round, like `massBattleCore`
  (aggressive / defensive / focus), giving the player one meaningful lever
  without a full command UI.
- Emits `SkirmishRoundResult[]` + an outcome, in the same shape family as
  `BattleRoundResult` / `BattleOutcome`.
- This is cheap to build and should ship **first** — it covers 80% of fights and
  proves the shared `Combatant` + `resolveDamage` + narration pipeline.

### 5.2 Tier 2 — Gambit sim (`gambitCombatCore.ts`)

Headless port of the gunbitrts gambit loop. **Pure, deterministic, seeded.** No
Godot, no rendering — it consumes an initial layout and runs fixed-timestep
subticks until a stop condition, emitting a structured `CombatLog`.

Ported directly from `Unit.gd` (`_run_gambits` / `_check_condition` /
`_run_action`): conditions `self_hp_below`, `ally_hp_below`,
`backline_threatened`, `enemy_in_range`, `enemy_too_close`, `nearest_enemy_exists`;
actions `attack_nearest/weakest`, `focus_fire`, `protect_ally`, `retreat_to_safe`,
`flee_to_healer`, `heal_self`, `heal_lowest_hp_ally`, `move_to_nearest_enemy`.
Role default gambits (Shooter/Medic/Support/Scout/Frontline/Raider) port as-is.

Determinism requirements (LoreRelay house rule — cf. `DETERMINISM_SPINE`):

- fixed timestep (e.g. 1/30s), integer/quantized positions or a fixed rounding
  policy, all tie-breaks by seeded hash + stable `id` order.
- no wall-clock, no `Math.random`; seed derived from turn + battle id.

### 5.3 Tier 2 — vehicle / large-unit extensions (staged)

These answer "転回速度・射角・タレット耐久・サイズ差." Add **incrementally**;
each stage is independently shippable and testable (same discipline the ZoC /
terrain roadmap used in gunbitrts `DESIGN_QUESTIONS.md`).

```ts
type TacticalProfile = {
  radius: number;                 // size natively = radius (battleship ≫ mech)
  moveSpeed: number;

  // Stage A — facing & turning
  facing?: number;                // radians
  turnRate?: number;              // rad/s; huge hulls turn slowly

  // Stage B — firing arcs
  weaponArc?: number;             // rad; target must be within facing±arc/2
  // (also lets a mech dodge to a warship's blind spot — emergent, not scripted)

  // Stage C — subsystems / turret durability
  parts?: SubPart[];              // route damage per-part; hull dies when core dies
};

type SubPart = {
  id: string;
  name: string;                   // 'main turret', 'engine', 'bridge'
  hp: number; maxHp: number;
  arc?: number;                   // this weapon's own firing arc
  disabledEffect?: string[];      // e.g. ['no_move'] when engine dies
};
```

Rollout order (do **not** build all at once):

1. **Size correction table** (§4.2) — biggest bang, pure data, works in Tier 1 too.
2. **Facing + turnRate** — makes big hulls feel big.
3. **Weapon arc** — positioning gains meaning; blind spots emerge for free.
4. **Sub-parts / turret HP** — warships become multi-target; disabling > killing.

Infantry/mechs simply omit `parts` and use a full-circle `weaponArc`; the same
engine runs them with zero special-casing.

---

## 6. Combat Log → GM Narration (the payoff)

Every tier emits a compact, structured log; the GM turns it into prose. This is
the through-line that makes any simulation worth its cost and directly delivers
the gunbitrts `USER_IDEAS.md` #1 ("戦闘ログ → AIで小説化") natively.

```ts
type CombatResult = {
  tier: 0 | 1 | 2 | 3;
  outcome: 'ally_victory' | 'enemy_victory' | 'stalemate' | 'retreat' | 'rout';
  survivors: { side: 'ally' | 'enemy'; id: string; hpFrac: number }[];
  beats: CombatBeat[];            // ordered, capped (~12) salient events
  reportLine: string;            // one-line summary, like BattleOutcome.reportLine
};

type CombatBeat = {
  kind: 'clash' | 'fell' | 'retreat' | 'heal' | 'turret_down' | 'flank' | 'crit' | 'legendary';
  actorId?: string; targetId?: string;
  hintId: string;                // stable id → GM narration guidance (i18n-friendly)
};
```

Rules (mirror `buildBattlePromptLines` in `massBattleCore`):

- The **GM narrates from the log; it must not invent contradicting facts**
  (who won, who died, troop/HP numbers). Core owns truth, GM owns prose.
- `beats` are **capped and salience-ranked** so the prompt stays compact —
  never dump every subtick of a Tier-2 sim.
- A full unabridged log may be written to a battle-log file (like gunbitrts
  `user://logs/battle_*.txt`) for optional offline novelization.

---

## 7. Balance & Status Effects — data-driven, minimal-first

Do **not** design the full status roster now. Ship the smallest set and let the
GM supply flavor, exactly as Campaign Kit / Settlement Mode did.

```ts
type StatusDef = {
  id: string;                    // 'poison', 'stun', 'guard', 'berserk'
  hpPerRound?: number;           // +heal / -damage over time
  attackMul?: number; defenseMul?: number;
  skipAction?: boolean;          // stun
  durationRounds: number;
  stacks?: 'refresh' | 'add' | 'ignore';
};
```

- Defined in a data file (`combat_profiles.json`), not hardcoded — so "山ほどある
  異常状態" grows without engine edits and without touching `game_state.json`.
- V1 ships perhaps 4: `poison`, `stun`, `guard`, `weaken`. Everything else is
  future data.
- The `sizeTable` (§4.2) also lives here, per scenario/genre pack.

---

## 8. Feature Flags (`game_rules.json`)

```json
{
  "enableSkirmishCombat": false,   // Tier 1
  "enableGambitCombat": false,     // Tier 2
  "enableMassBattle": false        // Tier 3 (EXISTS)
}
```

- All default OFF; when OFF, no prompt injection, no ops applied, panels hidden.
- Tier 2 should additionally require Tier 1 conceptually (shared `Combatant`);
  enabling Tier 2 without Tier 1 is allowed but the shared core ships with T1.

---

## 9. Implementation Phases

Independent files, path-scoped commits (the safe multi-AI pattern from
`project_lorerelay` memory — avoid touching hot shared files).

- **P0 — Shared core.** `src/combatModelCore.ts`: `Combatant`, `resolveDamage`,
  status application, projection stubs, `CombatResult`/`CombatBeat`. Pure, no I/O.
  Tests: damage/size-table/status determinism, input never mutated.
- **P1 — Tier 1.** `src/skirmishCombatCore.ts` + tests. Round loop, mini-gambits,
  player tactic, outcome classification. Wire narration lines (read-only prompt).
- **P2 — Narration contract.** `CombatResult` → GM prompt lines; battle-log file
  writer. Prove the log→prose loop end-to-end with Tier 1 before building Tier 2.
- **P3 — Tier 2 core.** `src/gambitCombatCore.ts`: headless deterministic sim,
  ported gambit rules, Stage-A **size table only**. Tests: seeded reproducibility,
  same log for same seed.
- **P4 — Tier 2 vehicle extensions.** Facing → arc → sub-parts, one stage per
  slice, each gated. Reuse `VehicleCombatProfile`/`projectVehicle`.
- **P5 — Webview.** Read-only battle replay/summary panel (optional; a static
  canvas replay of a Tier-2 log is a natural fit and does not require the sim to
  run in the Webview).

The GDScript→TS port of `Unit.gd` (P3) is mechanical and, per the user, should be
handed to another agent (Grok/Codex); Claude drives design + Webview.

---

## 10. Non-Goals

- No player-controlled real-time driving/piloting (upholds Vehicle doc).
- No grid / hex / square tactical board anywhere.
- No ballistic/physics simulation beyond position + radius + facing.
- No pathfinding in V1 (open field; obstacles are a later, optional stage).
- No second stat system per grain — one `Combatant` + projection only.
- No replacement of `massBattleCore`; Tier 3 stays as-is.
- No combat prompt injection while the relevant tier flag is OFF.
- No copying of any reference game's schema, data, or rules.

---

## 11. Open Decisions (need a gate / user sign-off)

1. **Adopt Tier 2 at all?** It is the only expensive, philosophy-shifting piece
   (a second, simulation-style engine in a codebase that has so far stayed
   abstract). Tiers 0/1/3 alone already give the user a working combat spread.
   Recommendation: **ship P0–P2 first (cheap, high value), then decide on Tier 2
   with real narration output in hand.**
2. **Squad grain in Tier 2, or keep Tier 2 individual-only?** Projection makes it
   possible; whether it's worth the tuning is a later call.
3. **Player agency model** (the gunbitrts Q1 question): gambit-only vs
   semi-auto override. In LoreRelay the player's lever is *authoring gambits +
   a per-round tactic*, not live clicking — so Q1 largely dissolves here.

---

## 12. AI Division

1. **Codex/ChatGPT** — gate this design; approve P0–P2 scope only.
2. **Grok/Codex** — implement `combatModelCore.ts` + `skirmishCombatCore.ts` + tests.
3. **Codex/ChatGPT** — review P0–P2.
4. **Grok/Codex** — port `Unit.gd` → `gambitCombatCore.ts` (P3) if Tier 2 approved.
5. **Claude** — narration contract, battle-log format, read-only Webview replay.
6. **Gemini** — genre `sizeTable`/status packs and scenario examples.

Key instruction for all agents:

> Combat is a deterministic truth engine that feeds the GM prose. The player
> reads a battle; they do not operate a simulator. Choose the cheapest tier that
> makes the narration good.
