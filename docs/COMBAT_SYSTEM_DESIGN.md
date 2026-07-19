# Combat System Design — Tiered Resolution (Person → Empire)

Status: **Architecture Hold Queue.** Design brief only, v2. No implementation.

Do not schedule implementation until `docs/TERMINOLOGY_CONTRACT.md`,
`docs/DETERMINISM_SPINE_D1_DESIGN.md`, and `docs/STATE_ORCHESTRATOR_SO3_DESIGN.md`
have landed. Combat depends on all three (shared vocabulary, causal-input/seed
discipline, and ledger writeback ownership) and should not lock in its own
competing versions of them. Re-gate this document once those three are settled.

Track: optional system, default OFF. Must not change existing campaigns when OFF.

---

## Revision note (v2)

v1 of this document (Opus 4.8) was reviewed end-to-end by an external model
(ChatGPT, high reasoning) with the full project context. The review confirmed
the core structure — a tiered resolver selected by stakes, reconciling with
`massBattleCore.ts` and `VEHICLE_SYSTEM_DESIGN.md`, and a combat-log →
GM-narration pipeline — but found several load-bearing mistakes in v1's shared
data model. v2 below is the corrected version. Section numbers are kept close
to v1 where possible; §4, §6, §7, §8 changed the most.

The reviewer's concepts referenced here (`ClockRef`, `D2-001D` causal-input
receipts, State Orchestrator, Terminology Contract) were verified to exist in
the repo before being adopted — this document does not take them on faith.

> **Recovery note.** v1 of this file was committed as `2cda416`, and at one
> point the working tree was reverted to it, losing v2 and Appendix A (neither
> had been committed). This file was restored from the reviewed v2 content.
> v1 remains available at `2cda416` if it is ever needed.

---

## 0. Core Principle (unchanged from v1)

> The player experiences combat as **prose narrated by the GM**, never as a
> screen of moving dots. Any simulation exists only as a *truth engine* that
> produces a deterministic log for the GM to novelize.

In `gunbitrts` the gambit sim *is* the game — you watch it. In LoreRelay
nobody watches the sim; its only value is the log/receipts it emits. Build
simulation detail only where it measurably improves that output.

This is also converging with the separate "Narration on Demand" direction
already under discussion for world/trade systems: **the world resolves itself
deterministically; AI is invoked only where it adds meaning for a human.**
Combat is the sharpest test case for that idea, not a special exception to it.

---

## 1. Two Axes That Were Being Conflated, Now Four

v1 separated *grain* (zoom level) from *size class* (physical size within a
battle). That distinction is correct and stays. But v1 then jumped straight to
"the engine resolves it" — collapsing *how it's computed*, *who's in
control*, and *when AI speaks* into one "Tier" number. Those are independent
and should be authored independently per encounter:

| Axis | Question | Example values |
| --- | --- | --- |
| **A. Resolution Mode** | How is the outcome computed? | `skirmish` / `tactical` / `mass` |
| **B. Grain** | What does one token represent? | `single_entity` / `squad` / `formation` / `strategic` |
| **C. Control Mode** | How much does the player operate directly? | `direct` / `directive` / `doctrine` / `observer` |
| **D. Narration Policy** | When does AI speak? | `always` / `important_only` / `on_demand` / `none` |

### 1.1 Grain naming fix

v1 called the finest grain `individual`, but a battle at that grain can contain
infantry, mechs, *and* a warship simultaneously — calling a warship
"individual" reads wrong. Renamed:

- `single_entity` — one token = one discrete actor, whatever its physical size
- `squad` — one token = a small group (5–30), pooled/representative stats
- `formation` — one token = hundreds+ (was `army`)
- `strategic` — one token = a whole domain/nation (was `nation`)

The point is unchanged from v1: grain is "does a token aggregate?", not
"is it a person?". Size (huge, colossal…) lives entirely on axis B/size-class,
not on the grain name.

### 1.2 Control Mode (new — the axis v1 was missing)

This is what actually changes with the player's station (貧民 → 部隊長 →
ギルドマスター → 皇帝), and it is independent of how battles are computed:

- `direct` — player chooses each action (classic turn-based RPG feel)
- `directive` — player sets a per-round order ("push the left flank", assault/hold/stratagem)
- `doctrine` — player authors gambits/standing orders once; battle runs on them
- `observer` — player only receives the outcome

Example combinations (illustrative, not prescriptive — author per encounter):

| Situation | Resolution | Grain | Control | Narration |
| --- | --- | --- | --- | --- |
| Back-alley mugging | skirmish | single_entity | direct | important_only |
| Trusted companion in a big fight | skirmish | single_entity | doctrine | on_demand |
| Warship vs. mech set-piece | tactical | single_entity | directive | always |
| Emperor's war | mass | formation/strategic | doctrine | important_only |

v1 had effectively hardcoded Tier 2 to "gambit authoring + one round tactic."
That was premature — Control Mode should be choosable per encounter, not baked
into a tier.

### 1.3 Narration Policy is not a resolution tier

v1's "Tier 0 — Narrative / GM freeform" conflated *not having canonical
mechanical stakes* with *not resolving combat at all*. That's dangerous: if the
GM narrates "cut down the grunt in one stroke," but HP/loot/ammo/status/time
are canonical state, freeform prose just became an unaudited state mutation —
exactly what LoreRelay's Persist-Before-Narrate discipline exists to prevent.

Fixed split:

- **Cosmetic Encounter** (was "Tier 0"): no canonical stakes at all — flavor
  only, nothing in `game_state.json` changes. Fine for pure color.
- Anything that touches HP, inventory, troops, or world state **must** go
  through a Resolution Mode (skirmish/tactical/mass), even if the narration is
  ultimately compressed to one sentence.

Narration Policy then governs *how much AI prose wraps a resolved outcome*,
completely orthogonal to whether the outcome was canonical.

---

## 2. Resolution Mode ↔ Existing Systems

| Resolution Mode | New/existing core | Reconciles with |
| --- | --- | --- |
| `skirmish` | `skirmishCombatCore.ts` (new) | user's "簡易ターン制RPG" ask |
| `tactical` | `gambitCombatCore.ts` (new, port of gunbitrts) | warship/mech set-pieces |
| `mass` | `massBattleCore.ts` (**exists, unmodified**) | Domain Mode army/nation battles |

`massBattleCore` keeps its own `player`/`enemy` two-side assumption and its own
`BattleSide { troops, quality, commanderSkill, fortification }` shape. It is
wrapped by an adapter (§4.4), not rewritten, and not forced into a shared
`Combatant` type (see §4 for why).

`VEHICLE_SYSTEM_DESIGN.md`'s Non-Goals (no tactical grid, no ballistics, no
real-time driving) still hold: `tactical` mode is a headless truth engine the
player never operates in real time, and a vehicle is *projected* into it from
the ledger, not driven live.

---

## 3. Why Not Hex/Square Grids (unchanged conclusion, softened claim)

For representing size differences (battleship vs. mech), a discrete grid is
the worst fit — a warship occupying many cells creates adjacency/line-of-fire/
movement-cost exceptions against a one-cell mech. Continuous position + radius
represents size natively.

v1 overstated this into "grid never appears anywhere." That's not proven yet.
Since nobody watches the sim, the real question is only: **which
representation produces a better combat log for the GM to narrate?** Two
candidates should be prototyped against the same scenario before committing:

- **2A — Zone/relative tactical model**: no coordinates at all —
  `rangeBand: contact|near|far`, `aspect: front|flank|rear`,
  `engagement: free|engaged|pinned`. Much cheaper, and can still produce a log
  line like "the mech circled into the battleship's blind spot."
- **2B — Continuous 2D** (gunbitrts port): `position`, `radius`, `facing`,
  `weaponArc`. More expensive, more precise, needed only if 2A's logs turn out
  noticeably flatter in practice.

Decision to commit to 2B over 2A is deferred to when `tactical` mode is
actually built (§9, P3) — build both against one test battle and compare
narration quality before choosing. Grids remain out; 2A vs 2B is the live
question, not 2B vs nothing.

---

## 4. Shared Model: Contracts, Not Stats

This is the most important correction from v1. v1's `Combatant` tried to hold
`hp/attack/defense/sizeClass/statuses` for *all* resolution modes at once. That
either forces every mode into one bloated do-everything shape, or forces
absurd abstractions (a nation having "HP"). Even the existing `massBattleCore`
doesn't use hp/attack/defense — it uses `troops/quality/commanderSkill`.

**Fix: share only the outer contract (who's fighting, what came out), not the
inner stat shape.** Each Resolution Mode owns its own profile type.

### 4.1 Shared participant reference

```ts
type CombatGrain = 'single_entity' | 'squad' | 'formation' | 'strategic';
type PhysicalSizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'colossal';
// identical vocabulary to VehicleSizeClass — no parallel taxonomy.

type CombatParticipant = {
  id: string;
  sideId: string;             // not 'ally'|'enemy' — see §4.5
  sourceRef: EntityRef;       // points at character/npc/squad-roster/vehicle/domain entry
  grain: CombatGrain;
  physicalSize?: PhysicalSizeClass;  // only meaningful for tactical mode
};
```

### 4.2 Per-mode profile (not shared)

```ts
// skirmish mode
type SkirmishProfile = { hp: number; attack: number; defense: number; stamina?: number };

// tactical mode
type TacticalProfile = {
  position: Vec2; radius: number; facing: number; mobility: number;
  attackProfile: AttackProfile;   // see §4.3 — replaces v1's sizeClass-only damage model
  defenseProfile: DefenseProfile;
  parts?: SubPart[];              // turret/engine/bridge — staged in later phases
};

// mass mode — this already exists, unmodified
type MassBattleProfile = { troops: number; quality: number; commanderSkill: number; fortification?: number };
```

Nothing forces these three shapes to unify. A `CombatParticipant` carries
exactly one profile, matching its battle's Resolution Mode.

### 4.3 Damage is driven by weapon/attack profile, not attacker size (v1 fix)

v1 computed a damage multiplier from `attacker.sizeClass × target.sizeClass`.
That breaks immediately: a person firing an anti-ship missile is `small` vs.
`colossal` and gets shrunk, despite the weapon being built to hurt ships; a
battleship's point-defense gun vs. another battleship is `colossal × colossal`
and gets full damage, despite being the wrong tool entirely. **The size gap
that matters is between the weapon's intended scale and the target's
structure, not between the two combatants' bodies.**

```ts
type AttackProfile = {
  scale: 'personal' | 'anti_armor' | 'anti_mech' | 'anti_ship' | 'siege';
  penetration: number;
  damageType: string;
  area?: number;
};

type DefenseProfile = {
  physicalSize: PhysicalSizeClass;   // affects hit chance, turn rate, access — not damage directly
  armorClass: string;
  structureClass?: string;
};

// damage multiplier is a table lookup keyed by (AttackProfile.scale, DefenseProfile.structureClass)
// — data-driven per genre pack, not hardcoded, and not derived from body size.
```

`physicalSize`/radius still drives hit chance, turning, firing arcs, and
location access (reusing `VehicleAccessProfile`/`VehicleSizeClass` directly)
— it just stops being the thing that decides raw damage.

### 4.4 The "legendary weapon beats scale" case

Split narrative flavor from mechanical effect, rather than encoding it as a
combat-engine special case:

```ts
type NarrativeTrait = { id: string; label: string };          // 'legendary' — flavor, GM-facing
type MechanicalEffect = 'ignore_scale_penalty' | /* … */ string; // what it actually does, data-driven
```

A legendary blade is a `NarrativeTrait('legendary')` *plus* an explicit
`MechanicalEffect('ignore_scale_penalty')` on its `AttackProfile` — not a
`tags.includes('legendary')` check inside the resolver.

### 4.5 Sides are not `ally`/`enemy`

```ts
type BattleSide = { sideId: string; label: string; stance?: 'hostile' | 'neutral' | 'allied' };
```

Two-sided fights are the common case, not the only case (three-way, civil war,
mid-battle intervention, temporary alliance, neutral monster). The shared
contract takes `sideId: string` and `winnerSideIds: string[]` /
`Record<sideId, SideOutcome>`; nothing bakes in exactly two sides.
`massBattleCore`'s existing `player`/`enemy` assumption stays as-is inside its
own core and is wrapped by a `mass` adapter that maps its two sides onto
`sideId`s — the existing file is not rewritten for this.

### 4.6 Status effect duration needs a unit, not a bare number

v1 used `durationRounds: number` shared across modes, but "round" means
something different in skirmish (a turn), tactical (a fixed subtick), and mass
(often day-scale). Sharing a bare number silently breaks across modes, and
collides with the separate, already-in-progress `ClockRef` /
time-contract work (`docs/TERMINOLOGY_CONTRACT.md`).

```ts
type StatusDuration = { unit: 'action' | 'round' | 'tick' | 'clock'; value: number };
```

Whether Combat should adopt `ClockRef` directly or keep a narrower local unit
enum is left open — decide when Terminology Contract finalizes, not now.

---

## 5. Shared Result Contract

What *is* shared across all three Resolution Modes is the output shape, and —
critically — combat never writes to any ledger directly.

```ts
type BattleSpec = {
  battleId: string;
  resolutionMode: 'skirmish' | 'tactical' | 'mass';
  grain: CombatGrain;
  controlMode: 'direct' | 'directive' | 'doctrine' | 'observer';
  narrationPolicy: 'always' | 'important_only' | 'on_demand' | 'none';
  sides: BattleSide[];
  participants: CombatParticipant[];
  seedReceipt: SeedReceipt;     // explicit causal input — see §7
};

type SideOutcome = 'victory' | 'defeat' | 'stalemate' | 'retreat' | 'routed';

type CombatResult = {
  battleId: string;
  winnerSideIds: string[];
  sideOutcomes: Record<string /* sideId */, SideOutcome>;
  receipts: CombatReceipt[];    // raw, granular facts — §6
  beats: CombatBeat[];          // salience-filtered, capped, for narration — §6
  writebackPlan: WritebackOp[]; // §8 — combat proposes, ledgers own applying
};
```

Each Resolution Mode's internal resolver (`skirmishCombatCore`,
`gambitCombatCore`, `massBattleCore` via adapter) produces a `CombatResult`.
Nothing upstream needs to know which mode ran.

---

## 6. Combat Log: Receipts First, Beats Derived — Never Inferred

v1's `CombatBeat` risked being reconstructed after the fact from before/after
HP snapshots ("HP dropped a lot → probably a big hit"). That is exactly the
class of bug already found in Debug Trace review: **never infer an event from
its aggregate aftermath; emit the event itself.**

Pipeline, matching the existing candidate → selected → delivered → consumed
shape used elsewhere in LoreRelay:

```
Resolver emits atomic CombatReceipt per event
        ↓ (candidate)
Salience scoring
        ↓ (selected)
CombatBeat[]  (capped, ordered, for the GM prompt)
        ↓ (delivered)
GM narration
        ↓ (consumed)
```

```ts
type CombatReceipt = {
  kind: 'attack_resolved' | 'damage_applied' | 'part_disabled' | 'entity_fell'
      | 'retreat' | 'heal_applied' | 'status_applied' | 'side_broke';
  actorId?: string; targetId?: string;
  amount?: number;
  receiptId: string;   // stable id, referenced by any derived beat
};

type CombatBeat = {
  kind: 'clash' | 'fell' | 'retreat' | 'heal' | 'part_down' | 'flank' | 'crit' | 'legendary';
  sourceReceiptIds: string[];   // beats point back at the receipts that justify them — never freestanding
  hintId: string;               // stable id → GM narration guidance, i18n-friendly
};
```

Rules (mirrors `massBattleCore`'s `buildBattlePromptLines` discipline):

- The GM narrates from `beats`; it must not invent facts contradicting
  `receipts` (who won, who died, HP/troop numbers).
- `beats` are capped and salience-ranked — never dump every subtick.
- A full unabridged `receipts[]` log may be persisted to a battle-log file
  (mirroring gunbitrts's `user://logs/battle_*.txt`) for optional offline
  novelization — this directly satisfies the gunbitrts
  `USER_IDEAS.md` #1 wish.

---

## 7. Determinism: Seed Is an Explicit Causal Input, Not a Derived Hash

v1 said "seed derived from turn + battle id, hash for reproducibility." Given
LoreRelay's separate, active principle that **Canonical State must not silently
diverge from its Causal Input** (backlog item `D2-001D`, dice/ID receipts),
combat should not invent its own ad hoc reproducibility story.

```ts
type SeedReceipt = { battleId: string; seed: string /* or number */ };
```

`BattleSpec.seedReceipt` is persisted explicitly alongside the battle, the same
way dice/ID receipts are handled elsewhere. Same `BattleSpec` + same
`seedReceipt` ⇒ same `CombatResult`, by construction, not by a hash trick
combat invents on its own. Whether combat reuses the existing dice/ID receipt
machinery outright or defines a narrow sibling is a call for the Determinism
Spine gate, not this document.

---

## 8. Writeback: Combat Proposes, Ledgers Own Applying

v1 didn't specify who writes HP/inventory/domain/vehicle state back after a
battle. Left implicit, that turns the combat resolver into the one subsystem
that knows how to mutate every other ledger — the exact god-object shape the
World Intent / State Orchestrator design already rejected for other
subsystems (pure plan/execute per subsystem; each ledger owns its own schema,
validation, and persistence; the orchestrator only coordinates).

Combat follows the same shape:

```ts
type WritebackOp =
  | { ledger: 'character'; op: 'damage' | 'heal' | 'status'; targetId: string; amount?: number }
  | { ledger: 'vehicle'; op: 'damage_vehicle' | 'repair_vehicle'; vehicleId: string; amount: number }
  | { ledger: 'domain'; op: 'apply_troop_loss'; delta: DomainStatDelta }
  | { ledger: 'inventory'; op: 'consume_ammo' | 'grant_loot'; itemId: string; amount: number };
```

`CombatResult.writebackPlan` is a **proposal**, not a direct write. Each
ledger's existing apply path (`characterOps`, `vehicleOps.damage_vehicle`,
`domainOps`/`massBattleCore`'s own delta application, inventory ops) consumes
only the ops addressed to it, the same commit-then-apply discipline already
used for `turn_result` → `statePatch`. Combat never touches
`game_state.json`/`vehicle_state.json`/domain ledgers directly.

---

## 9. Implementation Phases (unchanged order, contract updated)

Still start cheap and prove the log→prose loop before building anything
expensive — this recommendation was independently reached by both reviews.
See **Appendix B** for the binding implementation-language policy per phase.

- **P0 — Shared contracts.** `src/combatModelCore.ts`: `BattleSpec`,
  `CombatParticipant`, `CombatResult`, `CombatReceipt`, `CombatBeat`,
  `WritebackOp`, `SeedReceipt`. Pure types + validation only, no per-mode logic.
- **P1 — Skirmish mode.** `src/skirmishCombatCore.ts` + `SkirmishProfile`.
  Round loop (cap ~6), mini-gambits (`self_hp_below`, `ally_hp_below`,
  `enemy_weakest`, else attack), Control Mode `direct`/`directive`/`doctrine`
  all expressible against this simple profile. Emits receipts/beats per §6.
- **P2 — Narration contract + play it.** Wire `CombatResult` → GM prompt
  lines; battle-log file writer. Then actually run ~10 skirmish battles with
  `narrationPolicy: important_only`/`on_demand` and read the output before
  building anything further — this is the gate for whether `tactical` mode is
  worth its cost at all.
- **P3 — Tactical mode, 2A vs 2B bake-off.** Build the same test battle twice
  — zone/relative (§3, 2A) and continuous-2D gunbitrts port (2B) — compare
  narration quality, then commit to one. `AttackProfile`/`DefenseProfile`
  (§4.3) ship regardless of which representation wins. P3 is a **TypeScript**
  reference implementation plus benchmarks; it is **not** a Rust phase
  (Appendix B).
- **P4 — Tactical vehicle extensions.** Facing → weapon arc → sub-parts, one
  stage per slice, each independently gated. Reuses
  `VehicleCombatProfile`/vehicle projection.
- **P5 — Mass mode adapter.** Thin wrapper mapping `massBattleCore`'s existing
  `player`/`enemy`/`BattleSide` shape onto `BattleSpec`/`CombatResult`. No
  changes to `massBattleCore.ts` itself.
- **P6 — Webview.** Read-only battle replay/summary panel (optional).

The GDScript→TS port of `Unit.gd` (P3, 2B path) is mechanical porting work and,
per the user's existing workflow, should go to another agent (Grok/Codex);
Claude's role stays design + narration contract + Webview.

---

## 10. Non-Goals

- No player-controlled real-time driving/piloting (upholds Vehicle doc).
- No hex/square tactical grid (2A vs 2B are the only live tactical-mode candidates).
- No ballistic/physics simulation beyond what 2B's position+radius+facing needs.
- No pathfinding in P3 (open field; obstacles are a later optional stage).
- No shared stat system across Resolution Modes — profiles stay per-mode (§4).
- No rewrite of `massBattleCore.ts` — it is wrapped, not replaced (§2, P5).
- No direct ledger writes from combat resolvers — writeback is proposed, not applied (§8).
- No ad hoc seed/hash reproducibility scheme independent of the Determinism Spine (§7).
- No combat prompt injection while the relevant mode's feature flag is OFF.
- No second language toolchain introduced ahead of the measurements in Appendix B.
- No copying of any reference game's schema, data, or rules.

---

## 11. Open Decisions (blocked on other gates, listed so they aren't lost)

1. **Does combat adopt `ClockRef` directly for status/duration**, or keep a
   narrower local time-unit enum? — blocked on Terminology Contract finalizing.
2. **Does combat reuse the existing dice/ID causal-input receipt machinery**
   for `SeedReceipt`, or define a narrower sibling? — blocked on Determinism
   Spine (`D2-001D`) finalizing.
3. **Who owns `WritebackOp` application wiring** — State Orchestrator directly,
   or a thin combat-specific coordinator that calls into orchestrator-owned
   ledger ops? — blocked on State Orchestrator SO3 finalizing.
4. **2A (zone/relative) vs 2B (continuous 2D)** for tactical mode — deferred to
   P3's bake-off (§3, §9), not decided here.
5. **Does `tactical` mode ever run at `squad` grain**, or stay `single_entity`
   only? — open, low priority until P3 exists.
6. **Long-term Combat Core implementation language** — deferred to post-P3
   measurement (Appendix B), explicitly not decided by reaching P3.

---

## 12. Feature Flags (`game_rules.json`, for when this leaves the hold queue)

```json
{
  "enableSkirmishCombat": false,
  "enableTacticalCombat": false,
  "enableMassBattle": false
}
```

All default OFF; when OFF, no prompt injection, no writeback ops applied, no
panels shown. `enableMassBattle` already exists and is unaffected by this
document.

---

## 13. AI Division (for when this leaves the hold queue)

1. **Codex/ChatGPT** — gate this document; approve P0–P2 scope only initially.
2. **Grok/Codex** — implement `combatModelCore.ts` + `skirmishCombatCore.ts` + tests.
3. **Codex/ChatGPT** — review P0–P2 against Terminology Contract / Determinism
   Spine / State Orchestrator once those have landed.
4. **Grok/Codex** — P3 bake-off (2A and 2B), including the `Unit.gd` port for 2B.
5. **Claude** — narration contract, battle-log format, read-only Webview replay.
6. **Gemini** — genre `AttackProfile`/`DefenseProfile` tables and scenario examples.

Key instruction for all agents:

> Combat is a deterministic truth engine that proposes writeback and feeds the
> GM prose. It does not own other ledgers, does not invent its own time or
> seed conventions, and does not force one stat shape onto skirmishes, tactical
> set-pieces, and mass battles alike. The player reads a battle; they do not
> operate a simulator. Choose the cheapest Resolution Mode and the lightest
> Narration Policy that still make the outcome mean something.

---

## Appendix A — Future Vision (non-binding; not part of P0–P6)

Captured from a user + ChatGPT (high reasoning) exploration of *why* the
gunbitrts continuous-space gambit approach appeals, beyond "more detailed
combat." Numeric claims below about existing LoreRelay code were checked
against the repo (see verification note at the end) before being trusted.
This appendix is a wishlist to preserve intent for whenever `tactical` mode
(P3+) actually gets built — it does not authorize scheduling any of it now.

### A.1 What the tactical mode is actually for

Not finer-grained combat math. The draw is **scale difference itself as the
drama**: a battleship mowing down a hundred fighters with one salvo, an ace
pilot alone diving into a fleet, a giant shrugging off tank shells, a small
mech slipping into a warship's blind spot. A hex/square grid forces a
battleship to occupy many cells against a mech's one — the scale drama becomes
system overhead. Continuous position + radius represents it for free: a
battleship just *is* a token with a huge radius among small ones. This is the
same conclusion §3 already reached, now with a concrete reason to actually
build 2B rather than defer to 2A indefinitely.

### A.2 Sim / Replay / Camera separation

`tactical` mode should stay **2.5D**, not full 3D physics:

- Core simulates `(x, y)` + `radius` + `facing`; height is cosmetic
  (`altitudeBand: low | medium | high | orbital` later, for "aircraft can fly
  over walls, ships can't"), not a real z-axis with pitch/yaw/roll and 3D
  navigation. Going full 3D turns this into a flight-sim project on its own.
- The core does not need to render in real time. It can resolve a whole battle
  headless in seconds and emit a **replay timeline** (`t=0, t=0.1, …` position/
  state snapshots), the same way `massBattleCore` resolves fixed rounds
  instantly. A Three.js viewer then plays that timeline back — independently
  of simulation speed, with pause/rewind/slow-mo/scrub, matching the existing
  Chronicle/Replay/Debug-Timeline philosophy already used elsewhere.
- **Verified precedent for this separation already exists**: the Settlement
  Diorama (`src/settlementDioramaCore.ts` → `webview/modules/86c-settlement-diorama.js`)
  is a read-only Three.js projection of canonical Settlement state — it never
  mutates canonical state, and its orbit camera (`yaw`/`pitch`/`distance`,
  pitch clamped `8°–82°`, `DIORAMA_PITCH_MIN/MAX`) is already an independent
  state object decoupled from the simulation. A combat replay viewer is the
  same pattern applied to a `CombatReceipt`/beat timeline instead of a static
  settlement snapshot.
- Camera should be free, with presets rather than only-manual: e.g. Tactical
  (standard oblique), Strategic (high overview for fleet/army scale), Focus
  (follow one participant — the ace-diving-into-a-fleet shot), Cinematic
  (auto-cut to camera on salient `CombatBeat`s like `flank`/`legendary`/
  `part_disabled`), Scale (frame two very-different-radius participants
  together to sell the size gap).
- Sim visibility is **optional, not required**: required experience is AI
  narration of the `CombatResult`; the 3D replay is an optional, separately
  toggleable layer on top of the same receipts/beats. This slightly loosens
  §0's "nobody watches the sim" framing — nobody *has to*, but watching should
  be genuinely fun when they choose to.
- Extreme scale mismatch (a 1.8m person vs. a 2km capital ship) makes the small
  participant literally invisible at any camera distance that also shows the
  big one. Fix in the renderer, not by lying about physical size in the Core:
  keep true radius, and make small/fast participants readable via a selection
  halo, contrail/trail, nameplate, and threat marker layered on top of the
  (still tiny) model.

### A.3 Attack Geometry — why "battleship mows down mobs" needs more than a damage number

A single number (`9999 damage to one target`) can't produce "one salvo wipes a
formation." What's needed is a **shape**, resolved spatially against whoever is
standing in it — this is a natural companion to `AttackProfile` (§4.3), not a
replacement:

```ts
type AttackGeometry = 'single_target' | 'cone' | 'line' | 'circle' | 'sweep' | 'beam' | 'barrage';
```

Examples: battleship main gun → `beam` (long range, wide); giant's greatsword
→ `sweep` (short range, wide arc); missile salvo → `circle`; an ace's rapid
precise fire → `single_target`, fast retarget. "Battleship clears fifty grunts
in one shot" then falls out of geometry + position, not a hardcoded number —
and "the ace tears through a fleet alone" is the mirror case, achieved not by
absurd stat inflation but by **giving smallness its own kind of strength**:
mobility, turn rate, evasion, blind-spot exploitation, fast retargeting, weak-
point targeting — vs. the battleship's firepower, range, area, and durability.
Size becomes a difference in *kind* of combat strength, not simply a multiplier
on the same stat — which is also consistent with §4.3's point that raw size
should not directly set damage output.

### A.4 Tower defense — via Settlement → Battlefield projection, not a new game

The user's "wall the base, build a tower, hold a bridge" idea is not a
separate system to design later — it is the **same projection pattern already
used for vehicles** (§2, `projectVehicle`), applied to Settlement state:

```
Settlement State (canonical)
        ↓  (projection, read-only, same pattern as Settlement Diorama)
Battlefield Projection
        ↓
Combat Core (tactical mode)
```

- `wall`/`gate` tiles (already real settlement tile kinds, `w:0.9 d:0.9 h:2.4`
  for wall / `w:1.0 d:0.35 h:2.0` for gate per `settlementDioramaCore.ts`)
  project into movement blockers / destructible structures; `tower` projects
  into a **stationary** `CombatParticipant` (`mobility: none`, fixed
  `position`) running an ordinary gambit list — a tower's autofire AI is
  mechanically identical to a warship turret or a fixed emplacement. One
  "stationary weapon platform" shape covers all of them.
- Bridges/chokepoints emerge for free from radius + passage width: a 3m-wide
  bridge against ~0.6m-radius humans fits 2–3 abreast; the same width against
  a 5m-radius mech doesn't fit at all. `PhysicalSize` (§4.3) already governs
  what can pass where (shared vocabulary with `VehicleAccessProfile`) — a
  giant might ford a river a human must bridge, a warship can never pass a
  gate, a kaiju simply destroys a wall instead of routing around it.
- **Attacking side should also run gambits**, not just walk to a goal (the
  usual TD assumption): a siege engine gambit targets the nearest wall; a
  flier ignores walls entirely; an assassin bypasses towers to beeline the
  commander; a sapper gambit targets the gate. Same gambit shape as defenders
  (soldier holds the gate, archer supports from height, cavalry sallies to
  flank, a resident gambit flees to shelter when threatened). This means "just
  wall everything" doesn't trivially win — different enemy kinds have
  different gambits, which is itself genre content (fantasy giants/flying
  wyverns vs. post-apoc raiders/vehicles vs. sci-fi mechs/orbital bombardment
  can reuse one Core with different gambit/geometry data).
- Battle results should be able to feed back into the Settlement ledger
  (a wall damaged in the fight stays damaged tomorrow) — this is exactly what
  `WritebackOp` (§8) already exists for; no new mutation channel is needed,
  just a `ledger: 'settlement'` op added when that day comes.
- **Pathfinding is the one real blocker**, and the existing Non-Goal ("no
  pathfinding in P3") is correct to keep for open-field skirmishes/set-pieces.
  Tower defense specifically needs enemies to route around walls/through
  gates, so it is later than plain `tactical` mode, not part of it. Stage it
  when the time comes, cheapest first:
  1. **Lane** — fixed spawn → checkpoint → gate → core path (ordinary TD).
  2. **Path graph** — nodes/edges with gates/bridges as toggleable edges.
  3. **Full continuous navigation** (navmesh/A*/local avoidance) — only if 1–2
     turn out not to be enough.

### A.5 Why this belongs in the same hold queue as the rest

None of this contradicts §0–§13: it reuses the projection pattern (§2, §8),
the `AttackProfile`/`PhysicalSize` split (§4.3), the receipts→beats pipeline
(§6), and the existing Non-Goal on pathfinding (§10). It sharpens *why* Tier 2
(`tactical` mode) is worth building at all, and gives the eventual P3 bake-off
(2A vs. 2B, §3) a concrete scenario to test against — but it changes no
near-term phase and authorizes no work ahead of Terminology Contract /
Determinism Spine / State Orchestrator SO3 landing.

---

## Appendix B — Implementation Language and Replacement Boundary

Binding policy for whenever this document leaves the hold queue. Converged
conclusion of a multi-model review (ChatGPT high reasoning, Grok, Claude) plus
the user's own final revision; recorded here so it is not re-litigated. Repo
facts below were measured, not assumed: at v1.83.0 the extension is 298
TypeScript files in `src/`, with no `Cargo.toml`, `.csproj`, `binding.gyp`, or
`.wasm` anywhere in the tree, and exactly two runtime dependencies
(`mermaid`, `ws`).

### B.1 Canonical language by phase

**P0–P2 are TypeScript.** Chosen to minimize integration cost with the existing
LoreRelay core-function pattern, and to stay compatible with debugging, Test
Console, Debug Trace, and — the heaviest practical constraint — the multi-AI
parallel development workflow. Introducing a second toolchain (Cargo, WASM
build, JS bindings, VSIX bundling, CI, per-agent build instructions, doubled
debugging paths) would cost more than it buys at this stage, because P1
(round-based skirmish, no coordinates, small participant counts) has
essentially no performance pressure.

**P3 is a TypeScript reference implementation plus benchmarks.** P3 builds the
tactical gambit core in TypeScript and a set of realistic large-scale battle
fixtures to measure against.

> **Reaching P3 does not mean starting a Rust phase.** Rust/WASM is not a
> component of P3. No agent may treat arrival at P3 as authorization to begin
> a port, scaffold a crate, or add a build step.

**The long-term Combat Core language is undecided.** Rust/WASM remains a strong
*candidate optimization* for the eventual general-purpose battlefield simulator
(Appendix A), and would be preferred over a native DLL, C#/.NET, or C++ if a
switch ever happens — a WASM module bundles as a single artifact in the VSIX
with no per-OS/CPU binaries and no runtime install for the user. But a
candidate is not a schedule.

### B.2 Conditions for considering a Rust/WASM replacement

A replacement is considered only when **all four** hold — raw timing numbers
alone are not sufficient grounds:

1. Resolution time exceeds the target at the scale the game is *actually
   played* at (not a synthetic worst case).
2. Ordinary TypeScript-side optimization has already been applied and did not
   close the gap — Worker separation, data-layout improvements (typed arrays /
   struct-of-arrays), spatial partitioning for target search.
3. GC pauses or memory usage are a demonstrated problem, not a predicted one.
4. The benefit exceeds the ongoing development, CI, and multi-AI operational
   cost of carrying a second language.

Benchmarks should reuse real gameplay fixtures rather than tests invented to
justify a port. Indicative scales to measure: 10v10, 100v100, 300 participants
× 3000 ticks, and a fortification defense including walls/gates/bridges. For
calibration: if a 300-participant battle resolves in ~1s, a port is likely
unnecessary; if 100 participants with pathfinding takes ~20s, it becomes a
legitimate candidate.

Note that language choice does not grant determinism. Reproducibility comes
from the contract — explicit `SeedReceipt` (§7), fixed tick, stable participant
evaluation order, no `Math.random()`, defined rounding, defined tie-breaks, and
a recorded core version — and is equally achievable in TypeScript with
fixed-point arithmetic.

### B.3 The replacement boundary (fix this now, not the language)

What must be settled early is the boundary, not the implementation language:

```
BattleSpec → CombatResolution
```

`CombatResolution` contains at minimum `CombatResult`, `CombatReceipt[]`,
`CombatReplay`, and `CombatDiagnostics`.

This boundary must be a **serializable pure contract**. It must not use, or
depend on, any of: VS Code APIs, the DOM, file I/O or filesystem paths, current
wall-clock time, `Math.random()`, function callbacks passed inside
`BattleSpec`, circular references, or TypeScript-specific runtime class
instances.

Held to that shape, the Combat Core's *internals* can later be replaced with
Rust/WASM while keeping parity against identical fixtures, and without
rewriting LoreRelay's integration, projection, writeback (§8), or narration
(§6) code.

### B.4 Godot Golden Master fixtures

The existing Godot/GDScript 5v5 prototype is retained as a **reference
implementation**, not a discarded draft. Before porting, capture its behavior
as fixtures recording the *decision contract* — not frame-by-frame coordinates:

- HP threshold at which a unit chooses to retreat
- how a retreat destination is chosen
- healing target priority
- HP threshold for returning to the line
- choice made when a target is in range vs. out of range
- re-selection behavior when a target dies
- gambit evaluation order

The TypeScript implementation — and any future replacement implementation —
must maintain parity with these fixtures on both decision contract and final
outcome. This is what prevents Godot → TypeScript → (possibly) Rust from
silently drifting into a different game.

### B.5 Explicitly not started while in the hold queue

This appendix settles the language policy only. It does not authorize, and no
agent should begin: Rust toolchain setup, a WASM prototype, combat-specific CI,
bulk combat test authoring, new PR/review process rules, an independent review
pass, or combat parameter/balance tuning. The document stays in the
Architecture Hold Queue until Terminology Contract, Determinism Spine, and
State Orchestrator SO3 have landed.
