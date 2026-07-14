# LoreRelay Gameplay Spine Architecture

- Status: design only; reconciled against the implemented economy/logistics stack
- Gameplay Spine implementation status: not started
- Design authority: gameplay action lifecycle and subsystem integration
- Implementation base: `88fb824586926f29ddba879b8686de463ff54e34`
- Reconciled economy range: `NOAI-ECON-FLOWS-001` through `NOAI-ECON-FLOWS-005`
- First implementation slice: `NOAI-GAMEPLAY-SPINE-001`

## 0. Decision summary

LoreRelay should not implement `NOAI-ECON-FLOWS-006` as an economy-only action system.

`build`, `repair`, `raid`, `escort`, `sabotage`, `invest`, and `purify` all need the same
game-wide lifecycle as combat, exploration, diplomacy, travel, and construction. The next
architecture layer is therefore a thin **Gameplay Spine**:

```text
Player / NPC / GM / UI / simulation intent
                |
                v
        Structured WorldIntent
                |
                v
       Query / requirements / quote
                |
                v
       Confirmation when required
                |
                v
 Deterministic resolution / trusted dice evidence
                |
                v
       Typed effect plan + facts
                |
                v
 Revalidate / mutation gate / ledger-owner commit
                |
                v
    Commit receipt + post-commit events
                |
                v
       GM narration + UI feedback
```

This is not a new giant game engine. It is a common lifecycle around existing subsystem
cores, ops, ledgers, and persistence owners.

The main decisions are:

1. Keep `WorldIntent` as the request envelope; do not introduce a competing universal
   request type.
2. Separate admission status, mechanical outcome, and persistence status. `blocked`,
   `failure`, and `write_failed` are different facts.
3. Core or a deterministic subsystem resolver owns mechanical truth. AI may interpret intent
   and narrate facts, but may not invent rolls or directly mutate canonical state.
4. Existing ledger owners remain authoritative during migration. Gameplay Spine produces a
   typed plan; it does not make `statePatch` a universal mutation language.
5. Events are emitted only after commit. An event may produce a future intent, but an event
   subscriber may not mutate canonical state directly.
6. No single universal `turn` exists. Every time cost must identify its clock.
7. Current Checkpoint/Undo does not provide full cross-ledger rollback. Gameplay Spine must
   not promise generic Undo until the affected ledgers can actually be restored.
8. `difficulty` remains a meta-game adjudication policy. Fertility, pollution, facility
   condition, production, scarcity, and route danger remain diegetic world state.
9. `NOAI-ECON-FLOWS-006` stays blocked until Gameplay Spine, facility state ownership, and
   facility/route identity are separately ready.

This document is the second design canon for LoreRelay. It governs the game-wide action
lifecycle. `docs/ECONOMY_LOGISTICS_ARCHITECTURE.md` remains authoritative for economy flow
semantics, but its original Slice 006 is narrowed by Section 14 of this document.

## 1. Scope and non-scope

### 1.1 In scope

- player, NPC, GM, UI, simulation, and mod action requests;
- intent interpretation and structured action admission;
- preconditions, quotes, costs, targets, confirmation, and stale-preview handling;
- automatic, resource-only, check-based, opposed, subsystem, and project resolution;
- deterministic results and trusted randomness evidence;
- typed effect plans and existing ledger adapters;
- commit receipts, idempotency correlation, consequences, narration facts, and UI feedback;
- integration boundaries for economy, combat, exploration, diplomacy, and construction;
- a safe migration and implementation-slice plan.

### 1.2 Out of scope

- implementation in this architecture task;
- replacing all existing `turn_result.*Ops` at once;
- choosing a final RPG dice formula or fixed DC table;
- building a universal scripting language or ECS;
- building a full event-sourced save system;
- implementing full cross-ledger atomicity or full Undo;
- implementing combat, economy flows, construction, or NPC AI here;
- creating an animated action UI;
- changing release/version files.

## 2. Current repository boundary

LoreRelay already has several useful pieces of a spine, but they are not yet one gameplay
contract.

| Concern | Current authority | What should remain | Current limitation |
| --- | --- | --- | --- |
| Freeform input | `src/playerAction.ts`, GM bridges | Player text remains first-class | Text is not a canonical structured action |
| AI referee result | `src/agenticGmCore.ts` | Referee/narrator separation is valuable | Referee can still return mechanics as a broad `TurnResult` bag |
| Turn carrier | `src/types/TurnResult.ts` | Existing compatibility envelope | Many independent `*Ops` channels; not an action lifecycle |
| Intent/query | `src/worldIntentCore.ts` | `WorldIntent`, query/no-op taxonomy, closed registry direction | Current registry is a vehicle pilot; `execute` returns an in-memory candidate only |
| Dice | `src/diceRoller.ts`, `DiceLedgerEntry` | System-generated rolls and recorded evidence | Current macro roller owns RNG internally; referee dice entries are parsed rather than recomputed |
| GM state patch | `src/statePatch.ts` | Allowlisted presentation and `game_state` patching | Must not become a universal cross-ledger mutation format |
| GM turn commit | `processTurnResult()` | Existing canonical `game_state` commit | Side ledgers are written after primary commit and may partially fail |
| Side-ledger order | `src/turnLedgerPersistCore.ts` | Existing order and explicit compensation truth | Only a subset of ledgers; no generic atomic transaction |
| Mutation exclusion | `src/deterministicWorkspaceMutationGate.ts` | One shared workspace mutation exclusion gate | It prevents concurrency; it is not durable idempotency or rollback |
| Direct UI actions | trade, market travel, end-day flows | Preview/confirm/re-read/receipt pattern is a strong prototype | Request gates and receipt shapes are duplicated per feature |
| Replay guard | `acceptedTurnReplayGuard*` | Accepted `TurnResult` replay protection | It does not automatically cover every direct deterministic action |
| Checkpoint/Undo | `checkpoint*` | Narrative timeline restore remains useful | Primarily restores history and `game_state`, not every side ledger |
| State Orchestrator | SO1/SO2 inventory/planning and SO3 experimental executor | Descriptor and planning concepts | Not the canonical GM-turn persistence path; do not assume full atomicity |
| World events | `src/worldEventLogCore.ts` | Structured, bounded world facts | Not yet a universal post-commit consequence bus |
| Time | `WORLD_TIME_PASSAGE_IDEA.md`, subsystem clocks | Multiple explicit clocks | Existing `elapsedWorldTurns` is only one time channel |
| Combat | `massBattleCore.ts`, `COMBAT_SYSTEM_DESIGN.md` | Deterministic truth engine plus narration log | Combat is not yet connected through a universal action lifecycle |

### 2.1 Current `TurnResult` is a transport envelope, not `GameAction`

`TurnResult` currently carries narration, `diceLedger`, `statePatch`, time, and many
subsystem-specific channels such as `tradeOps`, `vehicleOps`, `discoveryOps`, `guildOps`, and
`domainOps`. This was a safe incremental growth path, but adding another independent action
format per subsystem would multiply parsing, no-op, persistence, and replay semantics.

Gameplay Spine must sit above these existing channels and adapt to them gradually. It must
not replace them in one migration.

### 2.2 Current commit truth is intentionally partial

The normal GM-turn path commits `game_state` first and then attempts selected side ledgers.
The documented current compensation rule is:

```text
primary game_state failure
  -> do not attempt side ledgers

side-ledger failure after primary success
  -> retain game_state
  -> report partial failure
  -> operator reconciliation may be required
```

Therefore a new action that requires an atomic invariant across two ledgers must not be made
authoritative merely by emitting two existing ops. It must either:

- use a single existing canonical ledger in its first pilot;
- tolerate and explicitly report partial commit; or
- wait for a separately verified transaction mechanism.

### 2.3 Current Undo truth is narrower than gameplay rollback

Current checkpoints store game history and reconstruct a `game_state` snapshot from GM
entries. They do not prove restoration of `world_state`, `vehicle_state`, settlement data,
discoveries, campaign resources, and future economy facility state as one snapshot.

Gameplay Spine must classify reversibility honestly:

```text
none             no canonical change occurred
compensatable    a later inverse action can be issued
snapshot_needed  safe reversal needs all touched ledgers
irreversible     external or intentionally non-reversible consequence
```

The UI must not show a generic Undo promise for `snapshot_needed` or `irreversible` actions.

### 2.4 Implemented economy/logistics boundary at `88fb824`

Economy/logistics Slices 001-005 are implemented at the exact base commit inspected for this
reconciliation. The implementation, rather than older implementation-status wording in
`docs/ECONOMY_LOGISTICS_ARCHITECTURE.md`, is the current boundary:

| Slice | Commit | Established contract |
| --- | --- | --- |
| `NOAI-ECON-FLOWS-001` | `789e85e` | `src/economyFlowCore.ts`: pure `computeEconomyFlowTick()` production, demand, direct routes, route summaries, and `applyEconomyFlowMarketDeltas()` stock effects |
| `NOAI-ECON-FLOWS-002` | `9aff545` | `src/livingWorldForgeCore.ts` parsing of `CommerceForge.resourceFlows` and opt-in integration in `src/worldKitTickCore.ts` before existing market recovery |
| `NOAI-ECON-FLOWS-003` | `62c9516` | `src/economyProcessingCore.ts`: deterministic `computeEconomyProcessingTick()`; input market deltas consume stock and outputs become same-tick `RuntimeProduction` |
| `NOAI-ECON-FLOWS-004` | `6d0e453` | `src/economyOperationalCore.ts`: authored source/site condition and productive potential, route status/capacity/risk modifiers, plus optional transient `EconomyOperationalState` overrides |
| `NOAI-ECON-FLOWS-005` | `88fb824` | `src/economyLogisticsViewCore.ts`, `src/livingWorldBridge.ts`, and `src/worldView.ts`: pure read-only view model, process-local latest-tick snapshot, and read-only Webview network presentation |

The implemented tick order is deliberately bounded:

```text
opening market stock
  -> single-stage processing consumes inputs
  -> processing outputs become runtime production
  -> production and direct route flow produce market stock deltas
  -> existing market recovery/price pressure reacts
  -> faction demand and later living-world steps continue
```

The following are therefore established and must not be redesigned inside Gameplay Spine:

- deterministic production, demand, processing, direct route flow, and market-stock effects;
- bounded Forge parsing for nodes, sources, demands, routes, recipes, and processing sites;
- one-stage processing with no same-tick recipe chaining;
- authored productive potential/condition and route operational modifiers;
- optional per-tick runtime operational overrides without input mutation;
- stable route summaries and a sanitized read-only logistics projection;
- a read-only Webview that visualizes volume, capacity, direction, risk/status, shortages,
  bottlenecks, production, and processing details.

The following are **not** established by Slices 001-005:

- a canonical persisted facility-instance ledger;
- a canonical persisted route disruption/escort ledger;
- a runtime owner that supplies mutable `EconomyOperationalState` to the normal host tick;
- player/faction build, repair, raid, escort, sabotage, invest, or purify actions;
- facility construction/project progress, ownership transfer, costs, or checks;
- cross-ledger `facility` or `trade_route` identity.

`EconomyOperationalState` is currently a transient input contract, not saved world state.
`tickLivingWorldAfterSim()` does not supply it, so the normal host tick currently uses authored
Forge values and neutral fallbacks. The latest economy tick snapshot used by the view is also
process-local derived data and is explicitly not persisted into `WorldState` or `CommerceForge`.

Slice 005's focused automated tests were reported passing. A real Extension Development Host
visual inspection was not completed because desktop-interaction initialization failed. A
human or capable-agent rendered Webview smoke check remains prudent before treating the view's
presentation as manually verified, but that visual-only gap does not block Gameplay Spine
architecture or the pure shadow Slice 001.

## 3. Difficulty and world conditions

### 3.1 The word `difficulty` currently hides two different concepts

LoreRelay should distinguish:

- **`adjudicationProfile`**: a meta-game policy for how uncertain actions challenge the
  player;
- **`challengeBand`**: the contextual challenge of one attempted action;
- diegetic facts such as pollution, poor tools, expertise, fortification, route danger, and
  facility damage.

The current field `diceDifficulty` can remain for compatibility, but its future semantic
target is `adjudicationProfile`. At present it is largely passed to the GM prompt as a tone;
it is not yet a deterministic DC policy.

### 3.2 Appropriate uses

The adjudication profile may affect:

- DC or success-band calibration for genuinely uncertain actions;
- opposition competence and tactical coordination;
- partial-success thresholds;
- failure consequence severity;
- warning and confirmation generosity before irreversible actions;
- fail-forward generosity;
- hint availability and recovery assistance.

It is not restricted to combat. It can apply to repair, infiltration, negotiation,
investigation, purification, sabotage, and other uncertain actions.

### 3.3 Inappropriate uses

It must not silently decide:

- soil fertility;
- whether an ore seam exists;
- background production capacity;
- facility condition;
- contamination;
- market stock;
- whether a route is blockaded;
- whether an arcology retains a working factory;
- whether a local specialty is rare.

Those are canonical world facts. They can make an action harder, but the source must be
visible in the resolution breakdown.

```text
purify_land challenge
  base challenge: demanding
  + severe contamination
  + damaged purifier
  - specialist assistance
  -> contextual challengeBand
  -> adjudicationProfile applies bounded meta policy
  -> final CheckSpec
```

### 3.4 Campaign presets are authoring bundles, not hidden multipliers

A post-apocalyptic preset may author widespread contamination, low background availability,
damaged facilities, and risky roads. It may still contain a productive arcology, an intact
underground lab, or a miracle valley. The preset must create explicit world conditions; it
must not leave a hidden global multiplier that permanently overrides local facts.

## 4. Canonical terminology

The following terms must not be used interchangeably.

| Term | Meaning | Authority |
| --- | --- | --- |
| `Intent` | A request describing who wants what and why | Player, UI, AI, NPC, simulation, mod |
| `ActionDefinition` | Registered deterministic handler for an intent action | Gameplay Spine registry plus subsystem owner |
| `Query` | Read-only admission, requirements, quote, preview, and no-op check | Action handler |
| `Resolution` | Mechanical outcome and candidate effects | Core/rule/subsystem resolver |
| `EffectPlan` | Typed proposed canonical changes | Resolver plus closed ledger adapters |
| `Commit` | Persistence through canonical ledger owners | Host mutation gate and ledger owner |
| `CommitReceipt` | Factual record of what actually persisted | Commit layer |
| `Event` | Post-commit consequence fact | Post-commit event publisher |
| `Narration` | Prose based on committed facts | GM/narrator |

`executeWorldIntent()` in current code performs an in-memory apply and returns a candidate
state. During migration, Gameplay Spine treats that operation as **resolve/plan**, not as a
disk commit. Renaming existing APIs is not part of the first slices.

## 5. Canonical lifecycle

### 5.1 Phase A: capture and interpret

Sources may be:

- freeform player text;
- a structured UI control;
- NPC or faction planning;
- simulation or rule output;
- GM/referee suggestion;
- mod content.

Structured UI may emit a bounded `WorldIntent` directly. Freeform text needs an interpreter
that proposes one or more candidates. Interpretation is not mechanical authority.

`WorldIntent.source` records provenance; it is not an authorization token. In particular,
`source: 'gm'` must not automatically bypass permissions, costs, feature flags, or ledger
validation. The authenticated host context and action handler decide authority.

If actor, target, action, or stakes remain materially ambiguous, the system should ask for
clarification or show candidates. It must not guess an irreversible target.

### 5.2 Phase B: parse and query

The closed action registry:

- validates action key and payload;
- resolves actor and target references;
- reads an immutable snapshot from subsystem owners;
- checks feature flags and preconditions;
- distinguishes invalid, unsupported, blocked, and valid no-op;
- calculates a quote, time cost, risk disclosure, and confirmation policy;
- emits a bounded, visibility-aware preview;
- records witnesses for every ledger it expects to touch.

Query performs no writes, no reservations, no RNG, and no background scheduling.

### 5.3 Phase C: confirm

Confirmation is required when an action is destructive, costly, time-advancing, or difficult
to reverse. The confirm request must bind to:

- `requestId`;
- action key and version;
- actor and targets;
- quoted cost and duration;
- touched-ledger snapshot witnesses.

Changing any material selection invalidates the preview. Confirmation never means that the
old quote will be forced onto newer state.

### 5.4 Phase D: resolve

Resolution:

- reuses the queried action definition;
- consumes trusted evidence if randomness is required;
- calls a pure rule or subsystem core;
- computes `success`, `partial`, or `failure` where relevant;
- produces typed effects, cost accounting candidates, time deltas, and narration facts;
- does not write disk or call the narrator.

### 5.5 Phase E: revalidate and commit

The host acquires the shared workspace mutation gate, reloads canonical state, and compares
the touched-ledger witnesses. It then:

- rejects stale plans or re-queries under an explicitly safe policy;
- validates every effect through its registered ledger adapter;
- commits through existing ledger-owner paths;
- records actual applied/no-op/failed effects;
- returns a `CommitReceipt`.

No UI, GM, event subscriber, or generic JSON payload writes canonical state directly.

### 5.6 Phase F: consequences and presentation

Only after commit:

- publish bounded factual events;
- schedule rule evaluation for a later deterministic phase;
- provide narration facts to the GM;
- provide a sanitized receipt to UI, Remote Play, replay, and prompts;
- use a factual fallback if narration fails.

Narration failure must not roll back a successful commit.

## 6. Minimal canonical contracts

These shapes are architectural targets, not immediate implementation instructions. Exact
generic syntax may be adjusted during Slice 001 without expanding the semantics.

### 6.1 Reuse `WorldIntent`

Do not create another universal `GameAction` request envelope. Continue from the current
shape:

```ts
interface WorldIntent {
    id: string;
    source: IntentSource;
    subsystem: IntentSubsystem;
    action: string;
    actor?: EntityRef;
    target?: EntityRef;
    payload: JsonValue;
    requestedAt?: ClockSnapshot;
    seed?: string;
    correlationId?: string;
}
```

`WorldIntent.id` is a request identity, not by itself a durable proof of commit.

### 6.2 Action definition

```ts
type ActionKey = `${IntentSubsystem}:${string}`;

interface ActionDefinition<I extends WorldIntent = WorldIntent> {
    key: ActionKey;
    version: number;
    query(ctx: ActionQueryContext, intent: I): ActionQueryResult;
    resolve(
        ctx: ActionResolutionContext,
        intent: I,
        query: ReadyActionQuery,
        evidence: ResolutionEvidence
    ): ActionResolution;
}

type ReadyActionQuery = ActionQueryResult & {
    status: 'ready';
    preview: ActionPreview;
    resolutionSpec: ResolutionSpec;
};
```

Rules:

- the production registry is closed and explicitly registered;
- action names use `snake_case` `verb_noun` form;
- unknown actions are `unsupported`, not dynamically executed;
- mods may contribute data to a registered action family later, but V1 mods do not register
  arbitrary executable functions;
- requirement evaluation remains handler-owned initially; do not build a universal
  expression language in Slice 001.

### 6.3 Query status

```ts
type ActionAdmissionStatus =
    | 'ready'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported';

interface RequirementCheck {
    id: string;
    met: boolean;
    reasonCode: string;
    refs?: EntityRef[];
    visibility: 'public' | 'gm_only';
}

interface LedgerWitness {
    ledgerId: string;
    revision?: number;
    hash?: string;
}

interface ActionQueryResult {
    requestId: string;
    actionKey: ActionKey;
    actionVersion: number;
    status: ActionAdmissionStatus;
    reasonCode?: string;
    requirements: RequirementCheck[];
    preview?: ActionPreview;
    resolutionSpec?: ResolutionSpec;
    touchedLedgers: LedgerWitness[];
}
```

Ledger hashes/revisions are host-side stale-state evidence. UI receives an opaque preview
token or sanitized correlation value, not raw hidden-state hashes.

`blocked` means the request is meaningful but cannot currently proceed. `invalid` means its
shape or reference is unacceptable. `valid_noop` means it is legal but would change nothing.
None of those is a gameplay `failure` roll.

### 6.4 Preview and confirmation

```ts
interface ClockSpan {
    clock: ClockRef['clock'] | 'combatRound';
    amount: number;
}

interface ActionCostPreview {
    id: string;
    labelKey: string;
    amount: number;
    unit: string;
    owner?: EntityRef;
}

interface ActionPreview {
    summaryKey: string;
    targets: EntityRef[];
    costs: ActionCostPreview[];
    timeCost?: ClockSpan;
    confirmation: 'none' | 'explicit';
    reversibility: 'none' | 'compensatable' | 'snapshot_needed' | 'irreversible';
    warnings: string[];
}
```

`ClockSpan` is a proposed duration companion to the existing `ClockRef` terminology. It must
be added deliberately to `TERMINOLOGY_CONTRACT.md` in an implementation slice; it must not
be introduced silently. `combatRound` should remain subsystem-local unless that slice proves
that it must become a cross-system clock.

The preview cost is presentation data, not the mutation itself. Each subsystem retains the
typed authoritative cost/effect contract.

### 6.5 Resolution status and gameplay outcome

```ts
type ResolutionMode =
    | 'automatic'
    | 'spend_only'
    | 'check'
    | 'opposed_check'
    | 'subsystem'
    | 'project';

type MechanicalOutcome = 'success' | 'partial' | 'failure';

type ResolutionEvidence =
    | { kind: 'none' }
    | { kind: 'roll'; receipt: RollReceipt }
    | { kind: 'opposed_roll'; actor: RollReceipt; target: RollReceipt }
    | { kind: 'subsystem'; adapterKey: string; receipt: JsonValue }
    | { kind: 'project'; projectId: string; step: number };

interface ActionResolution {
    resolutionId: string;
    requestId: string;
    actionKey: ActionKey;
    actionVersion: number;
    mode: ResolutionMode;
    status: 'resolved' | 'valid_noop' | 'blocked' | 'invalid';
    outcome?: MechanicalOutcome;
    evidence: ResolutionEvidence;
    effectPlan?: EffectPlan;
    narrationFacts: NarrationFact[];
}
```

An automatic action may resolve as `success` without a roll. A rejected or blocked request
has no `MechanicalOutcome` because no gameplay attempt occurred.

### 6.6 Effect plan

```ts
interface EffectCause {
    requestId: string;
    resolutionId: string;
    actionKey: ActionKey;
    actor?: EntityRef;
    targets: EntityRef[];
}

interface LedgerEffectEnvelope<TPayload extends JsonValue = JsonValue> {
    effectId: string;
    ledgerId: string;
    adapterKey: string;
    payload: TPayload;
    cause: EffectCause;
}

interface EffectPlan {
    planId: string;
    witnesses: LedgerWitness[];
    effects: LedgerEffectEnvelope[];
    timeDeltas: ClockSpan[];
    consequenceFacts: ConsequenceFact[];
}

interface ConsequenceFact {
    id: string;
    kind: string;
    refs: EntityRef[];
    values?: Record<string, string | number | boolean>;
    visibility: 'public' | 'player' | 'gm_only';
}
```

`payload` is opaque only at the envelope layer. A closed `adapterKey` must parse it into an
existing typed op family before commit. Unknown adapters or invalid payloads are rejected.
The envelope is not permission for arbitrary ledger paths.

### 6.7 Commit receipt

```ts
type ActionCommitStatus =
    | 'committed'
    | 'committed_partial'
    | 'valid_noop'
    | 'rejected_stale'
    | 'rejected_busy'
    | 'write_failed';

interface ActionCommitReceipt {
    commitId: string;
    requestId: string;
    resolutionId: string;
    actionKey: ActionKey;
    status: ActionCommitStatus;
    committedLedgerIds: string[];
    failedLedgerIds: string[];
    appliedEffectIds: string[];
    skippedEffectIds: string[];
    acceptedTurnIdentityHash?: string;
    clockSnapshot: ClockRef[];
    committedAtIso?: string;
}
```

Host wall-clock timestamps may remain diagnostics, but deterministic gameplay ordering must
use an explicit game clock or accepted-turn identity. `clockSnapshot` contains only relevant
clocks and does not imply that the action advanced all of them.

## 7. Resolution and trusted randomness

### 7.1 Core owns the check result

AI may propose that an action is uncertain and may identify relevant fiction. It may not
authoritatively provide:

- raw dice values;
- final total;
- success boolean;
- state deltas justified only by prose.

The action/rule core produces a `CheckSpec`. A trusted host random source produces a
`RollReceipt`. The pure resolver validates and consumes that receipt.

```ts
interface CheckModifier {
    id: string;
    value: number;
    source: 'actor' | 'target' | 'world' | 'equipment' | 'assistance' | 'difficulty_policy';
}

interface CheckSpec {
    formula: string;
    dc: number;
    modifiers: CheckModifier[];
    partialBand?: { min: number; max: number };
}

interface RollReceipt {
    receiptId: string;
    formula: string;
    rolls: number[];
    modifier: number;
    total: number;
    source: 'system_random' | 'seeded_simulation';
    algorithmVersion: number;
}
```

The resolver recomputes totals and outcomes. It does not trust a supplied `success` flag.
`WorldIntent.seed` is request metadata or a seeded-simulation hint; it is not trusted roll
evidence for a player check.

### 7.2 Replay uses evidence, not a reroll

Exact replay must consume the recorded `RollReceipt`. It must not call RNG again. Seeded
simulation may also record a seed witness and algorithm version, but the final bounded roll
evidence remains part of the resolution receipt.

### 7.3 Do not choose a universal dice system yet

The first Gameplay Spine slices should define evidence and authority, not decide whether all
worlds use d20, percentile, dice pools, or another formula. A later rule-profile slice may
choose supported systems.

`diceDifficulty` should not be converted to a hidden numeric offset until the following are
specified and tested:

- base challenge bands;
- actor capability contribution;
- world-condition modifiers;
- partial-success rules;
- opposed checks;
- consequence severity;
- compatibility with existing prompts and `DiceLedgerEntry`.

### 7.4 Resolution modes

Use the smallest mode that matches the action:

| Mode | Example | Randomness |
| --- | --- | --- |
| `automatic` | open an unlocked door, select an active vehicle | none |
| `spend_only` | buy a known item at a fixed canonical quote | none |
| `check` | purify contaminated soil under uncertain conditions | trusted roll if rules require |
| `opposed_check` | negotiate against an NPC, infiltrate guarded space | trusted evidence for both sides or one derived contest |
| `subsystem` | resolve a combat round or trade-flow tick | subsystem core owns deterministic/seeded rules |
| `project` | build a refinery over several world days | project core and explicit clock steps |

Do not add dice merely to make every button feel like a game. Deterministic facts and costs
should remain deterministic.

## 8. Costs, time, and projects

### 8.1 Cost lifecycle

Single-step actions should initially use atomic consume-on-commit semantics within one
canonical ledger where possible.

Long projects require an explicit policy:

- `upfront`: consume when project starts;
- `per_step`: consume on each completed step;
- `on_completion`: consume at completion only;
- `reserved`: reserve now, consume or release later.

V1 must not silently mix these policies. Reservation is deferred until a ledger can represent
reserved versus available resources without ambiguity.

### 8.2 Time is typed

LoreRelay has at least:

- `gm` exchange time;
- `world` simulation days/turns;
- `simTick` background ticks;
- `domainMonth`;
- `guildDrift`/guild weeks;
- combat rounds;
- scene/narrative time.

An action may advance zero or more explicit clocks, but no field named only `duration` or
`turns` should cross subsystem boundaries.

### 8.3 Long work is a project, not one giant action

Construction, major repair, research, and land purification should use a project record after
the immediate-action pilot is proven.

```ts
interface ProjectRecord {
    id: string;
    actionKey: ActionKey;
    actor: EntityRef;
    targets: EntityRef[];
    status: 'planned' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
    clock: ClockSpan['clock'];
    requiredWork: number;
    completedWork: number;
    costPolicy: 'upfront' | 'per_step' | 'on_completion';
    createdByResolutionId: string;
}
```

The project type remains subsystem-owned. Gameplay Spine standardizes lifecycle and clocks,
not every project-specific field.

Project actions should be explicit:

- `start_project`;
- `advance_project`;
- `pause_project`;
- `resume_project`;
- `cancel_project`;
- `complete_project` as a Core-produced transition, not a player claim.

Clock advancement may make a project eligible for a step. The scheduler should emit a future
intent in a defined phase rather than recursively mutating from an event callback.

## 9. Persistence, events, replay, and accounting

### 9.1 Ledger owners remain authoritative

Gameplay Spine must not own every state schema. Each subsystem keeps:

- its canonical ledger or state owner;
- parser and validation rules;
- pure apply function;
- persistence adapter;
- failure policy.

Gameplay Spine owns:

- lifecycle ordering;
- common status vocabulary;
- witness/revalidation contract;
- causal IDs;
- effect-plan envelope;
- commit receipt;
- post-commit presentation contract.

### 9.2 `statePatch` remains bounded

`statePatch` is appropriate for allowlisted `game_state` presentation/state fields and the
small existing world overlay. It is not appropriate as the effect format for facility,
market, NPC, combat, or project ledgers.

Prefer:

```text
EffectPlan
  -> registered adapterKey
  -> existing typed ops
  -> existing pure apply
  -> canonical ledger owner
```

### 9.3 State Orchestrator relationship

SO1 descriptor inventory and SO2 planning are useful inputs. The existing SO3 executor and
its design are not automatically the authoritative GM-turn path.

Gameplay Spine must not depend on SO3 until a separate high-risk gate proves:

- exact ledger coverage;
- crash recovery;
- backup and rename semantics on supported platforms;
- queue interaction;
- compatibility with current `retain_primary_report_partial` behavior;
- accepted-turn replay guard interaction;
- full failure-injection tests.

The first authoritative Gameplay Spine pilot should remain single-ledger.

### 9.4 Post-commit event rule

Allowed:

```text
CommitReceipt
  -> CommittedGameplayEvent
  -> rule evaluates later
  -> new WorldIntent
  -> normal query/resolve/commit lifecycle
```

Forbidden:

```text
event subscriber
  -> writes ledger directly
  -> triggers another subscriber
  -> recursive hidden mutation
```

### 9.5 Action identity and replay identity

Keep separate IDs:

- `requestId`: one requested attempt and UI correlation;
- `resolutionId`: one mechanical resolution with fixed evidence;
- `planId`: one proposed effect set;
- `commitId`: one commit attempt/result;
- accepted-turn identity: current durable GM-turn replay authority where applicable;
- `eventId`: post-commit fact identity.

Do not deduplicate only by action verb or actor. Do not assume the current per-feature
in-memory request caches survive restart.

### 9.6 Accounting has proposed and committed stages

The system should eventually expose:

```text
proposed effects
  -> suppressed/rejected effects
  -> commit
  -> applied effects
  -> failed effects
```

GM narration must use committed facts. Preview UI may use proposed facts but must label them
as preview.

## 10. GM, AI, and freeform input boundary

### 10.1 What AI may do

- interpret freeform text into candidate `WorldIntent` values;
- ask for clarification;
- propose contextual factors and relevant skills;
- explain requirements and stakes;
- narrate committed facts;
- suggest follow-up actions and story hooks;
- generate non-canonical world-building suggestions.

### 10.2 What AI may not do

- directly write canonical ledgers;
- fabricate trusted rolls or success flags;
- bypass a blocked precondition;
- alter a committed result during narration;
- convert a preview into a claimed commit;
- invent costs, inventory, ownership, deaths, or route state as canonical facts;
- recursively apply consequences from prose.

### 10.3 Freeform action migration

LoreRelay must preserve freeform play. It should not require every sentence to come from a
button catalog.

Recommended later path:

```text
freeform text
  -> one or more bounded intent candidates
  -> confidence + ambiguity report
  -> clarify/confirm if material
  -> registered action handler
```

If no handler exists, the system may continue the current narrative-only path during
migration, but it must not pretend that unsupported mechanics were deterministically applied.

A future generic `attempt_check` action can support truly open-ended uncertain actions, but
it must still use a bounded rule profile, trusted rolls, allowlisted effect families, and
explicit stakes. It is not a generic `statePatch` escape hatch.

### 10.4 Narration facts

```ts
interface NarrationFact {
    id: string;
    kind: string;
    subject?: EntityRef;
    objects?: EntityRef[];
    values?: Record<string, string | number | boolean>;
    visibility: 'public' | 'player' | 'gm_only';
}
```

Facts should be semantic and bounded: `facility_repaired`, `route_blocked`,
`combatant_fell`, `project_started`, `resource_spent`. The GM receives only facts allowed by
the prompt projection and must not receive hidden canonical payloads by default.

### 10.5 GM rulings and correction

LoreRelay is TRPG-like, so the GM must retain room for exceptional rulings. That flexibility
must remain explicit and auditable.

Before resolution, the GM may:

- propose a different intent candidate;
- identify a missed fictional factor;
- request clarification;
- select an allowed scenario/rule option;
- recommend that no check is needed.

Core still validates the resulting `WorldIntent`, `CheckSpec`, and effects.

After resolution but before commit, a ruling change requires re-resolution with new evidence
or a versioned action definition. Prose cannot edit the result in place.

After commit, correction must be one of:

- a normal compensating action;
- an explicit audited `gm_override`/`gm_correction` action, if a later rules profile enables
  it;
- a timeline restore whose actual ledger coverage is disclosed.

An override must record actor, reason, affected effects, prior receipt, new receipt, and
reversibility. It still uses canonical ledger owners and cannot bypass persistence safety.
The first Gameplay Spine slices do not implement overrides.

## 11. Subsystem integration

### 11.1 Economy and logistics

Economy cores own:

- resource definitions;
- production, demand, processing, and flow;
- pure interpretation of authored facility/source/route operational values and optional
  transient runtime overrides;
- market deltas and price pressure;
- typed facility/route ops only after a canonical mutable owner is chosen.

Gameplay Spine owns the lifecycle for player/faction requests such as repair or sabotage.
It does not calculate trade flows itself.

At `88fb824`, `ProductionSource`, `ProcessingSite`, and `TradeRoute` are authored flow
definitions. `EconomyOperationalState` can override their effective operation for one tick,
but no normal host writer persists or supplies those overrides. Gameplay Spine must not
mistake this simulation input shape for a finished facility ledger or write action into
`CommerceForge` merely because the authored fields already exist.

Example:

```text
repair_facility intent
  -> economy adapter validates owner, facility, materials, tools, and local access
  -> rule core decides automatic/check/project mode
  -> economy core computes typed facility/resource effects
  -> canonical owner commits
  -> event/facts describe restored capacity
  -> later economy tick observes the new condition
```

### 11.2 Combat

Gameplay Spine owns:

- declare/start combat intent;
- actor and target admission;
- player tactic/action choice;
- confirmation for retreat or destructive choices;
- commit of final typed effects and presentation receipt.

Combat core owns:

- initiative/round model;
- damage and statuses;
- deterministic or seeded combat resolution;
- `CombatResult` and capped `CombatBeat` log;
- combat-local clock.

Vehicle and troop ledgers remain sources of truth. Combat uses projections and writes results
back through typed subsystem ops. Combat does not replace source entities with duplicate
canonical combat records unless a later design explicitly requires encounter persistence.

### 11.3 Exploration and travel

Exploration adapters may cover:

- `travel_to_location`;
- `investigate_site`;
- `search_area`;
- `gather_resource`;
- `reveal_map`.

Current market travel preview/confirm/receipt is a useful vertical prototype. It should first
be observed through a Gameplay Spine adapter; its authority must not be rewritten in the
first slice.

Discovery effects stay in their existing typed channel until a deliberate migration.

### 11.4 Diplomacy

Diplomacy may use:

- automatic outcomes when a prior agreement guarantees the result;
- spend-only outcomes for explicit gifts or payments;
- checks/opposed checks for persuasion, deception, intimidation, or negotiation;
- project-like multi-stage treaties later.

Relationship, faction reputation, agreement, and world-event owners must remain separate.
One diplomacy action may plan multiple effects, but it cannot become authoritative until its
cross-ledger failure policy is explicit.

### 11.5 Construction and purification

Construction is the primary consumer of the project model:

- site and ownership requirements;
- staged resource consumption;
- world-clock progress;
- pause/resume after damage, blockade, or missing inputs;
- completion that creates or upgrades a facility;
- deterministic capacity change after completion.

Pollution and purification are world conditions plus projects, not difficulty settings.

### 11.6 NPCs and factions

NPC/faction AI may select or rank candidate intents. It does not receive a separate mutation
API. The same query, resolution, and commit rules apply.

For performance, distant systems may remain aggregate or milestone-based. Gameplay Spine
does not require simulating every merchant as an individual actor every tick.

## 12. UI contract

The UI is a projection and command surface, never mechanical authority.

Later UI should receive:

- action catalog entries valid for the visible actor/context;
- query status and public requirement checks;
- cost, time, risk, target, and reversibility preview;
- confirmation requirement;
- in-flight/busy state;
- roll presentation from trusted `RollReceipt`;
- mechanical outcome;
- factual commit status, including partial/stale/write failure;
- public narration facts and follow-up suggestions.

Recommended UI state sequence:

```text
idle
  -> querying
  -> ready | blocked | invalid | valid_noop
  -> confirming
  -> resolving
  -> committing
  -> committed | partial | stale | busy | failed
```

Rules:

- changing material input invalidates preview;
- stale results do not overwrite a newer request;
- busy means not accepted and not queued unless a specific action says otherwise;
- success with refresh failure remains a committed success with stale display warning;
- hidden requirements/facts are removed by the final projection layer;
- no animated universal action UI in early slices.

## 13. Coexistence and migration

### 13.1 Do not rewrite current gameplay paths first

Migration order:

```text
observe existing path
  -> normalize lifecycle facts in shadow
  -> prove parity
  -> add trusted resolution evidence where missing
  -> plan typed effects
  -> commit one single-ledger pilot through its existing owner
  -> expand only after focused verification
```

### 13.2 Existing systems to use as parity fixtures

- `vehicle:repair_vehicle`: WorldIntent query/no-op and pure candidate-state pilot;
- shopkeeper direct trade: deterministic cost/result receipt;
- market travel: read-only preview, explicit confirmation, re-read before commit;
- end day: explicit clock advance and cross-file partial-failure evidence;
- mass battle: deterministic subsystem result plus narration hint/log;
- accepted-turn replay guard: durable identity and restart repair concepts.

No one fixture is the complete solution. The common contract should preserve the strongest
property of each.

### 13.3 Identity convergence

`TERMINOLOGY_CONTRACT.md`, D1 identity, and WorldIntent currently have intentionally different
entity scopes. Gameplay Spine must not add a third silently divergent `EntityKind` union.

When an action needs a new cross-ledger entity kind:

1. name the owning identity layer;
2. decide whether the ID is subsystem-local or cross-ledger;
3. add compatibility adapters and validation deliberately;
4. update identity inventory only when a canonical owner exists;
5. preserve projection/visibility rules.

`commodityId` remains a catalog/local ID. It should not become `EntityRef` merely because it
appears in an action payload.

### 13.4 Subsystem namespace convergence

The current `IntentSubsystem` union does not yet name `combat`, `exploration`, `diplomacy`, or
`construction`. Do not introduce a second competing `GameplaySubsystem` union and do not map
every new action vaguely to `world`.

Before the first non-vehicle adapter needs a missing namespace, run a versioned WorldIntent
vocabulary slice that decides whether to:

- extend `IntentSubsystem` with a small number of stable routing domains; or
- route the action through a genuinely owning existing domain such as `settlement`,
  `campaign`, or `domain`.

The decision must update parser bounds, action keys, traces, tests, and compatibility adapters
together. Presentation categories may remain more detailed than routing domains.

## 14. Gate for `NOAI-ECON-FLOWS-006`

The original Slice 006 is too broad and remains on hold.

### 14.1 Required prerequisites

Before any authoritative facility/logistics action implementation:

1. Economy Slices 001-005 are present and their exact runtime contracts are re-audited on the
   implementation target. This prerequisite is satisfied for this document at `88fb824`;
   re-audit only if a later implementation branch has diverged.
2. The canonical runtime owner for facility instances is chosen.
3. Authored source/site defaults in `CommerceForge.resourceFlows` are separated from mutable
   ownership, condition, productive potential, and project progress.
4. The canonical runtime owner for route status, capacity/risk overrides, disruption, and
   escort state is chosen.
5. `facility` and route identity are deliberately classified as subsystem-local or promoted
   cross-ledger references.
6. At least the Gameplay Spine query/resolution/effect/receipt contracts are proven in shadow.
7. A single-ledger authoritative pilot has proven stale revalidation, busy handling, and
   durable receipt correlation.
8. Project semantics exist before construction or purification is implemented.
9. Check/opposed/subsystem integration exists before raid, sabotage, or escort is treated as
   a resolved gameplay action.
10. Undo/reversibility wording is honest for all touched ledgers.

### 14.2 Facility state ownership decision

`world_forge` is authored world definition and should not casually become the mutable owner
of built/damaged/captured facilities. Current source/site `condition`, source
`productivePotential`, and route `status`/`capacityMultiplier`/`riskDelta` are authored
defaults. `ProductionSource.ownerFactionId` is also authored metadata, not a mutable facility
ownership ledger. Current `EconomyOperationalState` is an optional transient tick input; it
is not persisted, and `tickLivingWorldAfterSim()` does not supply it.

The owner decision must therefore specify both persistence and host injection into future
ticks. Likely choices are:

- dynamic facility instances within an existing runtime world/economy state;
- a dedicated economy/facility runtime ledger;
- a carefully bounded projection split between authored definitions and runtime overrides.

This document does not choose the ledger. That decision belongs to the Slice 006 gate because
it affects migration, persistence, identity, replay, and UI. Slice 004 established the pure
override contract; it did not establish the owner or writer.

### 14.3 Identity decision

Current D1 does not include `facility` or `trade_route`. Current WorldIntent also has no
canonical `facility` or `trade_route` target kind.

Do not hide durable targets forever as unrelated bare payload strings. Before cross-system
ownership, events, UI selection, and action receipts rely on them, add an explicit identity
slice. Do not promote them before a canonical runtime owner exists.

### 14.4 Split the original 006

Replace one broad Slice 006 with later gated slices:

#### `NOAI-ECON-FLOWS-006A`: read-only facility/route action queries

- action catalog and query adapters;
- ownership/access/requirements preview;
- no resolution, cost consumption, or writes.

#### `NOAI-ECON-FLOWS-006B`: one immediate single-ledger facility action

- one action only, preferably a bounded repair/maintenance operation;
- automatic or spend-only resolution first;
- existing canonical owner and typed ops;
- no construction, raid, sabotage, escort, or purification.

#### `NOAI-ECON-FLOWS-006C`: facility projects

- build, upgrade, major repair, and purification;
- only after Gameplay Spine project/time/cost policy exists.

#### `NOAI-ECON-FLOWS-006D`: risky logistics actions

- raid, escort, sabotage, blockade;
- only after check/combat integration and consequence/event rules exist.

#### `NOAI-ECON-FLOWS-006E`: investment and control

- investment, revenue rights, ownership transfer, monopoly/control effects;
- only after faction/diplomacy and cross-ledger failure policies are explicit.

## 15. Implementation slices

### `NOAI-GAMEPLAY-SPINE-000`: architecture gate

This document only.

- no code;
- no schema changes;
- no tests or compile in the design task;
- review against the merged target branch before implementation.

### `NOAI-GAMEPLAY-SPINE-001`: lifecycle vocabulary and vehicle shadow adapter

Smallest safe slice.

Includes:

- pure bounded types for action key, admission, resolution, evidence, effect-plan summary,
  and commit status;
- compatibility adapter around current vehicle WorldIntent query/execute results;
- `vehicle:repair_vehicle` parity fixtures against the existing
  `scripts/test_world_intent_core.js` and `scripts/test_world_intent_wi2.js` behavior;
- stable summaries for later UI/narration;
- focused tests only.

The compatibility adapter must preserve the source vocabulary and map it explicitly:

| Existing vehicle contract | Gameplay Spine shadow projection |
| --- | --- |
| query `allowed` | admission `ready` |
| query `valid_noop` | admission `valid_noop` |
| query `blocked` | admission `blocked` |
| query `invalid` | admission `invalid` |
| query `unsupported` | admission `unsupported` |
| execute `applied` with `nextVehicleState` | resolution `resolved` with `candidateChanged: true`; still not committed |
| execute `valid_noop` | resolution `valid_noop` with `candidateChanged: false` |
| execute `blocked` / `invalid` / `unsupported` | retain the corresponding admission fact; do not fabricate a resolution |
| execute `failed` | adapter failure diagnostic; no resolved plan and no commit |

`ready` and `candidateChanged` are Gameplay Spine projection terms, not current WorldIntent
status values. Current `queryWorldIntent()` returns `allowed`; current
`executeWorldIntent()` returns `applied` when it produced an in-memory `nextVehicleState`.
The adapter must retain the source status for diagnostics and never report that candidate as
persisted or committed.

Current type ownership is also part of the parity contract:

- `WorldIntent`, `IntentQueryResult`, `IntentExecuteResult`, and the exported query/execute
  functions belong to `src/worldIntentCore.ts`;
- `V3VehicleOpType`, `RepairVehicleOp`, and `applyVehicleOps()` belong to
  `src/vehicleOpsCore.ts`;
- `VehicleState` and vehicle durability data belong to `src/vehicleCore.ts`;
- `TurnResult.vehicleOps` in `src/types/TurnResult.ts` remains a compatibility transport
  channel and is not changed by this slice;
- the exact registry key is `vehicle:repair_vehicle`, while the source action/op name is
  `repair_vehicle`.

Excludes:

- persistence;
- RNG;
- host command;
- Webview;
- new canonical ledger;
- new action behavior;
- `TurnResult` schema changes;
- WorldIntent write-path changes.

### `NOAI-GAMEPLAY-SPINE-002`: check specification and trusted roll evidence

- pure `CheckSpec`, modifier breakdown, and `RollReceipt` validation;
- pure outcome computation from injected evidence;
- compatibility projection to `DiceLedgerEntry`;
- no host RNG replacement yet;
- no fixed global DC table.

### `NOAI-GAMEPLAY-SPINE-003`: action query/preview projection

- common public preview shape;
- witness and stale-preview contract;
- visibility filtering;
- shadow adapters for one structured UI flow such as market travel;
- no runtime behavior change.

### `NOAI-GAMEPLAY-SPINE-004`: typed effect-plan and legacy adapter parity

- one closed adapter from Gameplay Spine effect envelope to existing `vehicleOps`;
- compare candidate state with current vehicle apply path;
- effect cause and proposed accounting;
- shadow/compare-only;
- no writes.

### `NOAI-GAMEPLAY-SPINE-005`: single-ledger authoritative pilot

- one existing vehicle action only;
- shared workspace mutation gate;
- re-read and witness revalidation;
- existing vehicle ledger owner performs the write;
- durable request/resolution/commit receipt correlation;
- factual UI/GM summary;
- feature-flagged rollback to legacy path;
- no multi-ledger action.

This is the first runtime-risk gate and requires verification sized to the actual writer
changes under `DEVELOPMENT_VERIFICATION_POLICY.md`.

### `NOAI-GAMEPLAY-SPINE-006`: post-commit consequence and narration facts

- bounded post-commit event shape;
- committed facts versus preview facts;
- no direct event-subscriber writes;
- fallback factual presentation if narration fails.

### `NOAI-GAMEPLAY-SPINE-007`: freeform intent interpretation

- AI produces bounded candidate intents only;
- ambiguity and irreversible-action confirmation;
- unsupported actions remain non-authoritative;
- no generic state mutation escape hatch.

### `NOAI-GAMEPLAY-SPINE-008`: project and typed time model

- `ClockSpan` contract;
- project lifecycle;
- one project owner and one clock first;
- explicit cost policy;
- pause/resume/cancel;
- no universal scheduler rewrite.

### `NOAI-GAMEPLAY-SPINE-009`: subsystem expansion

Expand one adapter per slice:

- exploration/travel;
- diplomacy;
- combat;
- economy facility action;
- construction/project;
- NPC/faction intent source.

Each adapter requires its own canonical owner, focused tests, failure policy, and feature gate.

### `NOAI-GAMEPLAY-SPINE-010`: UI action surface

- shared catalog/query/confirm/result presentation;
- static, factual state first;
- no simulation authority in Webview;
- no animation requirement.

## 16. Explicit non-goals and risks

Do not do yet:

- implement economy Slice 006 as one feature;
- replace `TurnResult` wholesale;
- replace every `*Ops` channel;
- make `statePatch` universal;
- add a dynamic executable mod action registry;
- build a universal requirement DSL;
- build full NPC planner AI;
- route all current writes through SO3;
- promise atomic multi-ledger commits without failure-injection proof;
- promise generic Undo;
- use AI-authored dice totals as authority;
- use `diceDifficulty` to rewrite world scarcity or production;
- unify every clock into one turn counter;
- implement multi-stage construction before projects exist;
- implement full tactical combat as part of Gameplay Spine;
- build a fully animated action UI;
- perform a huge commerce, combat, or persistence rewrite;
- bump version or update `CHANGELOG`;
- create `walkthrough.md`;
- run the full test suite by default for low-risk pure slices.

Primary risks:

| Risk | Mitigation |
| --- | --- |
| A universal action ontology becomes a second game engine | Keep a thin lifecycle; subsystem cores own mechanics |
| Admission failure and gameplay failure are conflated | Separate query status, outcome, and commit status |
| AI remains de facto state authority | Trusted rolls, typed adapters, Core-computed effects |
| Preview becomes stale | Ledger witnesses and commit-time revalidation |
| New cross-ledger actions create split-brain | Single-ledger pilot first; explicit partial/atomic policy |
| Identity unions diverge further | Dedicated identity promotion, no third silent union |
| Time semantics become ambiguous | `ClockRef`/`ClockSpan`, no bare `turns` |
| Events cause recursive writes | Post-commit only; events produce future intents |
| Undo claims exceed actual snapshots | Reversibility classification and honest UI wording |
| Freeform play is lost to buttons | AI interpretation into bounded intents plus narrative fallback |

## 17. Established boundary and intentionally deferred decisions

### 17.1 Established at the reconciliation base

- `WorldIntent` remains the request envelope and its vehicle registry is the first parity
  fixture, not a universal authoritative writer;
- `queryWorldIntent()` uses `allowed`, `valid_noop`, `blocked`, `invalid`, and `unsupported`;
- `executeWorldIntent()` uses `applied`, `valid_noop`, `blocked`, `invalid`, `unsupported`, and
  `failed`, and its vehicle success returns an in-memory candidate only;
- economy production, direct flow, demand, single-stage processing, operational modifiers,
  market stock deltas, and read-only logistics projection exist at `88fb824`;
- `EconomyOperationalState` and latest-tick view snapshots are transient, not canonical
  persisted mutable economy state;
- the read-only logistics UI does not create authority for facility or route actions.

### 17.2 Decisions intentionally deferred

- final name and values of `adjudicationProfile`;
- versioned expansion policy for `IntentSubsystem`;
- dice system and exact DC mapping;
- generic opposed-check formula;
- facility and route runtime ledger owner and host injection path;
- promotion of `facility` and `trade_route` to cross-ledger identity kinds;
- project reservation semantics;
- full cross-ledger transaction/rollback strategy;
- whether direct deterministic actions join accepted-turn identity or use a sibling durable
  receipt ledger;
- whether combat encounters need a persistent encounter ledger;
- final player-facing action UI.

These are gates, not invitations to guess during Slice 001.

## 18. Model allocation

Recommended allocation after this architecture is accepted:

| Work | Model | Reasoning |
| --- | --- | --- |
| Architecture changes or cross-ledger authority decisions | GPT-5.6 Sol | Very High |
| `NOAI-GAMEPLAY-SPINE-001` pure shadow implementation | Grok 4.5 or GPT-5.5 Thinking | High |
| Focused parity review and play-feel review | Fable 5 | High |
| Mechanical adapter implementation after contracts are fixed | capable lower coding model | Medium/High by risk |

Reserve GPT-5.6 Sol for architecture that must reconcile identity, persistence ownership,
cross-ledger accounting/rollback, or similarly coupled system boundaries. Slice 001 is a
bounded pure compatibility implementation and does not require Sol.

Do not send `NOAI-ECON-FLOWS-006` to an implementation model until the Section 14 gates are
closed.

## Appendix A: first implementation handoff prompt

The following prompt is for a later session. It is included for handoff only; this design
task must not execute it.

```text
Model recommendation: Grok 4.5 or GPT-5.5 Thinking
Reasoning level: High

Repository:
C:\AI\text-adventure-vsce

Required implementation base:
88fb824586926f29ddba879b8686de463ff54e34

Task:
Implement only NOAI-GAMEPLAY-SPINE-001: lifecycle vocabulary and vehicle shadow adapter.

This is a pure, shadow-only compatibility slice. Do not change runtime gameplay behavior.

Read first:
- AGENTS.md
- docs/DEVELOPMENT_VERIFICATION_POLICY.md
- docs/GAMEPLAY_SPINE_ARCHITECTURE.md
- docs/WORLD_INTENT_CORE_DESIGN.md
- docs/TERMINOLOGY_CONTRACT.md
- docs/IDENTITY_REFERENCE_LAYER_D1_DESIGN.md
- src/worldIntentCore.ts
- src/vehicleOpsCore.ts
- src/vehicleCore.ts
- src/types/TurnResult.ts
- existing focused World Intent / vehicle parity tests

Before editing, inspect the current branch and dirty worktree. Preserve all unrelated user
changes. Do not use git add .

Exact scope:
- Add a small pure Gameplay Spine contract module for:
  - ActionKey
  - ActionAdmissionStatus
  - ResolutionMode
  - MechanicalOutcome
  - ActionCommitStatus
  - bounded lifecycle summary types
- Add a pure compatibility adapter that maps the existing vehicle WorldIntent
  query/execute result for vehicle:repair_vehicle into the new lifecycle summary.
- Preserve current WorldIntent and vehicle behavior byte-for-byte where observable.
- Preserve and explicitly map the current source contracts:
  - query allowed -> Gameplay Spine admission ready
  - query valid_noop -> admission valid_noop
  - query blocked -> admission blocked
  - query invalid -> admission invalid
  - query unsupported -> admission unsupported
  - execute applied + nextVehicleState -> resolution resolved with candidateChanged: true,
    not committed
  - execute valid_noop -> resolution valid_noop with candidateChanged: false
  - execute blocked/invalid/unsupported -> retain the admission fact; no fabricated resolution
  - execute failed -> adapter failure diagnostic; no resolved plan and no commit
- Never rename the existing WorldIntent statuses themselves. ready and candidateChanged are
  projection vocabulary only, and the source status remains available for diagnostics.
- Keep all outputs deterministic and stably ordered.
- Never mutate inputs.

Likely files:
- create src/gameplaySpineCore.ts
- create src/gameplaySpineVehicleAdapterCore.ts
- create one focused test script
- edit scripts/run_all_tests.js only if repository policy requires test registration

Existing parity authorities:
- scripts/test_world_intent_core.js
- scripts/test_world_intent_wi2.js

Do not:
- persist any file;
- add VS Code or filesystem imports to the new core files;
- call time or randomness;
- add a host command or Webview UI;
- add a new ledger or schema version;
- change TurnResult;
- change WorldIntent runtime modes;
- change vehicleOps behavior;
- implement a dynamic registry;
- implement dice/DC rules;
- implement EffectPlan commit;
- implement any economy action;
- implement NOAI-ECON-FLOWS-006;
- update version, CHANGELOG, or walkthrough.md;
- run the full test suite by default.

Focused verification limit:
- npm run compile
- the new focused Gameplay Spine test
- node scripts/test_world_intent_core.js
- node scripts/test_world_intent_wi2.js

Run each command at most once unless a concrete failure requires a code change. Do not run
npm test unless the user explicitly authorizes it or the verification policy requires it for
the actual changed risk tier.

Stop before commit. Report:
- changed files;
- exact lifecycle mapping;
- commands and results;
- any mismatch between the design and current WorldIntent types;
- confirmation that runtime behavior and unrelated files were untouched.
```

## Appendix B: related design authorities

- `docs/ECONOMY_LOGISTICS_ARCHITECTURE.md`
- `docs/WORLD_INTENT_CORE_DESIGN.md`
- `docs/WORLD_INTENT_WI4_EFFECT_ACCOUNTING_DESIGN.md`
- `docs/STATE_ORCHESTRATOR_SO1_DESIGN.md`
- `docs/STATE_ORCHESTRATOR_SO2_TRANSACTION_PLANNING_GATE.md`
- `docs/STATE_ORCHESTRATOR_SO3_DESIGN.md`
- `docs/TERMINOLOGY_CONTRACT.md`
- `docs/IDENTITY_REFERENCE_LAYER_D1_DESIGN.md`
- `docs/COMBAT_SYSTEM_DESIGN.md`
- `docs/WORLD_TIME_PASSAGE_IDEA.md`
