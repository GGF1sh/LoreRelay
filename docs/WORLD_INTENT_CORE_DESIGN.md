# World Intent Core Design

> Status: design only.
> Purpose: define a common intent/query/execute layer for future LoreRelay world mutations.
> Non-scope: replacing existing `turn_result.*Ops`, changing ledger write order, or implementing a runtime State Orchestrator.

## 1. Why This Exists

LoreRelay now has many separate mutation channels:

- `statePatch`
- `resolvedQuests`
- `discoveryOps`
- `campaignResourceOps`
- `settlementOps`
- `vehicleOps`
- `mobileBaseOps`
- future mod, guild, domain, commerce, and transport ops

Each channel has its own parser, validator, gate, persistence target, and no-op/failure behavior. This separation kept earlier phases safe, but every new subsystem increases cross-ledger complexity.

World Intent Core is the next common abstraction:

> "Something wants to change the world."

It captures that request before ledger-specific validation and persistence.

## 2. Inspiration and License Boundary

This design is inspired by long-running simulation projects, but it must not copy code or schemas directly.

| Project | Pattern to study | LoreRelay extraction |
|---|---|---|
| Screeps | user/AI code emits intents; engine validates and applies them on tick | `WorldIntent` as a unified request object |
| OpenRCT2 | `Query` vs `Execute` split for game actions | preview without mutation, then apply |
| FreeOrion | effect causes, priority, stacking, accounting | explain why state changed |
| Freeciv | requirements/ruleset sanity checks | shared conditions and semantic validation |
| Evennia | persistent world objects and command permissions | future object/action permission model |

Freeciv is GPL. LoreRelay is MIT. Treat Freeciv only as conceptual reading material. Do not port source code, names, or schema text.

## 3. Layer Boundaries

Do not confuse these three layers:

```text
AI Command Tower
  -> routes work between AIs and humans

World Intent Core
  -> represents and validates "world change requests"

State Orchestrator
  -> eventually commits transaction plans to ledgers safely
```

World Intent Core sits between GM/UI/simulation/mod requests and ledger-specific apply code.

It does not write files in v1.

## 4. Design Goals

- Unify future mutation requests without breaking existing ops.
- Provide a common `query -> execute` mental model.
- Make valid no-op vs failure explicit.
- Allow Webview/UI preview without persistence.
- Allow GM, simulation, UI, and mod-originated requests to share validation language.
- Provide accounting records for Observatory, Replay, Debug, and GM explanations.
- Prepare for a future State Orchestrator without requiring it now.

## 5. Non-Goals

- Do not replace `statePatch` or existing `turn_result.*Ops` in the first phase.
- Do not create a new canonical ledger in v1.
- Do not let Webview execute intents directly.
- Do not implement a scripting language.
- Do not make mods executable.
- Do not make effect stacking globally authoritative until a gate approves it.
- Do not broaden write surfaces.

## 6. Core Types

### EntityRef

```ts
export type EntityKind =
    | 'player'
    | 'npc'
    | 'faction'
    | 'location'
    | 'region'
    | 'settlement'
    | 'vehicle'
    | 'mobile_base'
    | 'guild'
    | 'domain'
    | 'resource'
    | 'discovery'
    | 'quest'
    | 'mod_record'
    | 'world';

export interface EntityRef {
    kind: EntityKind;
    id: string;
}
```

### WorldIntent

```ts
export type IntentSource =
    | 'gm'
    | 'agentic_referee'
    | 'player'
    | 'ui'
    | 'simulation'
    | 'mod'
    | 'debug';

export type IntentSubsystem =
    | 'world'
    | 'npc'
    | 'settlement'
    | 'vehicle'
    | 'mobile_base'
    | 'commerce'
    | 'campaign'
    | 'guild'
    | 'domain'
    | 'mod';

export interface ClockSnapshot {
    gmTurn?: number;
    worldTurn?: number;
    timestampIso?: string;
}

export interface WorldIntent {
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

### Query Result

```ts
export type IntentQueryStatus =
    | 'allowed'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported';

export interface IntentQueryResult {
    ok: boolean;
    status: IntentQueryStatus;
    reasonCode?: string;
    message?: string;
    preview?: IntentPreview;
    warnings?: string[];
}
```

### Execute Result

```ts
export interface IntentExecuteResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    status: 'applied' | 'valid_noop' | 'blocked' | 'invalid' | 'failed';
    reasonCode?: string;
    effects?: EffectSpec[];
    accounting?: EffectAccountingEntry[];
    ledgerPlan?: LedgerMutationPlan;
}
```

The important invariant:

- `valid_noop` is successful but not applied.
- `failed` means an attempted change failed.
- `blocked` means policy rejected it before execution.
- `invalid` means parse/shape/semantic validation failed.

## 7. Query / Execute Split

World Intent Core should adopt OpenRCT2's useful separation:

```text
parse -> normalize -> query -> execute
```

### Query

`queryWorldIntent(intent, context)`:

- no state mutation;
- validates action support;
- checks feature flags;
- checks requirements;
- returns preview and reason codes;
- safe for Webview previews, inspector, remote clients, and tests.

### Execute

`executeWorldIntent(intent, context)`:

- still pure in phase 1;
- returns a mutation plan, not disk writes;
- can produce effects/accounting;
- host layer or future State Orchestrator decides persistence.

In early phases, most existing ops should only get adapters to/from intent shape. Do not force all persistence through this layer.

## 8. Requirement Expressions

Requirement expressions are shared conditions. They should be small and deterministic.

```ts
export type RequirementOperator =
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'exists'
    | 'in';

export interface RequirementAtom {
    subject: EntityKind;
    field: string;
    operator: RequirementOperator;
    value?: JsonValue;
}

export type RequirementExpr =
    | { all: RequirementExpr[] }
    | { any: RequirementExpr[] }
    | { not: RequirementExpr }
    | RequirementAtom;
```

Phase 1 should support only a small allow-list of subjects and fields. No arbitrary path traversal.

## 9. Effects, Cause, Priority, Stacking

FreeOrion-style effect modeling is useful, but should start as accounting metadata.

```ts
export type EffectCauseType =
    | 'gm_intent'
    | 'simulation'
    | 'settlement_structure'
    | 'vehicle_module'
    | 'mobile_base_facility'
    | 'quest_resolution'
    | 'mod_rule'
    | 'debug';

export interface EffectCause {
    type: EffectCauseType;
    id?: string;
    label?: string;
}

export interface EffectAccountingEntry {
    source?: EntityRef;
    target?: EntityRef;
    intentId?: string;
    ruleId?: string;
    field: string;
    before: JsonValue;
    delta?: JsonValue;
    after: JsonValue;
    cause: EffectCause;
}
```

Use accounting for:

- World Observatory;
- Debug Inspector;
- Replay export;
- GM "why did this happen?" context;
- sanity checks;
- mod conflict explanations.

Do not let effects mutate ledgers directly in v1.

## 10. Adapter Strategy

Existing ops are not replaced. Add adapters gradually.

| Existing channel | Initial adapter direction |
|---|---|
| `vehicleOps` | op -> intent for preview/query; execute delegates back to existing pure apply |
| `mobileBaseOps` | op -> intent; preserve vehicle_state-only write contract |
| `settlementOps.expand_layer` | op -> intent; M4b remains only persistence path |
| `campaignResourceOps` | op -> intent for accounting; existing resource ledger remains |
| `discoveryOps` | op -> intent for appraisal/sale explanation |
| `resolvedQuests` | quest completion intent |
| `statePatch` | do not generalize immediately; keep strict allow-list |

Adapter phase goals:

- common reason codes;
- common preview objects;
- common no-op/failure shape;
- no new writes.

## 11. Workspace Sanity Checker Relationship

World Intent Core should feed a later Workspace Sanity Checker.

Sanity checker should run:

```text
parse
-> normalize
-> validate shape
-> validate references
-> validate semantics
-> report
```

Examples:

- vehicle status says `damaged` but condition says `pristine`;
- mobile base undocked but stale `parkedAt` remains;
- mod manifest declares unsupported merge strategy;
- settlement layout references a missing settlement id;
- mobile base links a vehicle and settlement that disagree on location.

Do not make sanity checker auto-fix by default. Auto-fix requires a separate gate.

## 12. API Sketch

Recommended phase-1 pure module:

`src/worldIntentCore.ts`

Exports:

```ts
parseWorldIntent(raw: unknown): WorldIntent | undefined;
normalizeWorldIntent(intent: WorldIntent): WorldIntent;
queryWorldIntent(intent: WorldIntent, context: WorldIntentContext): IntentQueryResult;
executeWorldIntent(intent: WorldIntent, context: WorldIntentContext): IntentExecuteResult;
worldIntentFromVehicleOp(op: unknown, context: AdapterContext): WorldIntent | undefined;
worldIntentFromMobileBaseOp(op: unknown, context: AdapterContext): WorldIntent | undefined;
worldIntentFromSettlementOp(op: unknown, context: AdapterContext): WorldIntent | undefined;
```

Phase 1 should not import `vscode`, `fs`, or DOM.

## 13. Phase Plan

### WI0: Design Gate

Codex/ChatGPT decides:

- v1 type contract;
- supported subjects/actions;
- whether `WorldIntent` is internal-only or can appear in `turn_result`;
- whether accounting is returned in-memory only;
- test list.

### WI1: Pure Core Skeleton

Implement:

- parser and sanitizer;
- reason-code enums;
- query/execute result shape;
- no-op vs blocked vs invalid tests;
- adapters for at most one subsystem, preferably `vehicleOps`.

No persistence.

### WI2: Adapter Expansion

Add adapters for:

- `mobileBaseOps`;
- `settlementOps.expand_layer`;
- `campaignResourceOps`;
- `discoveryOps`.

Still no write-path migration.

### WI3: Preview UI / Inspector

Claude can expose read-only preview information:

- "Would this action work?"
- "Why blocked?"
- "What would change?"

No execute button unless a later gate approves host wiring.

### WI4: Effect Accounting

Add accounting output to selected deterministic systems.

Targets:

- Observatory;
- Replay;
- Inspector;
- GM prompt compact explanations.

### WI5: State Orchestrator Bridge

Only after WI1-WI4:

- convert intent execute result to transaction plan;
- let State Orchestrator own ledger writes;
- migrate existing ops gradually.

## 14. AI Assignment

Recommended flow:

1. Codex/ChatGPT: WI0 contract gate.
2. Grok: WI1 pure skeleton + tests.
3. Codex/ChatGPT: review no-op/failure semantics.
4. Grok: WI2 adapters.
5. Claude: Inspector/preview UI, read-only.
6. Gemini: documentation and conceptual explanation.

## 15. Guardrails

- No GPL code copy.
- No direct Freeciv schema copy.
- No Webview execution of intents.
- No new canonical ledger.
- No automatic repair of sanity errors.
- No broad `statePatch` replacement.
- No mod-provided executable logic.
- No global effect stacking until approved by gate.

## 16. Recommended Decision

Start with `WorldIntent` as an internal pure-core abstraction. Do not expose it to GM output or `turn_result` yet.

First implementation should prove:

- stable parse/normalize;
- explicit valid no-op vs failure;
- adapter for one existing op family;
- no persistence changes.

## 17. Deep Research Addendum: Action Execution Kernel

The follow-up research reinforces the original direction, but sharpens the
architecture:

> LoreRelay does not need a giant simulation core. It needs a thin Action
> Execution Kernel that connects existing good subsystem contracts to one
> execution lifecycle.

This does not broaden WI1. WI1 remains the minimal pure skeleton and vehicle
adapter described above. The additions below define the later path.

### 17.1 Intent vs GameAction

Split two concepts that are easy to conflate:

- `WorldIntent`: who wants what, with provenance and payload.
- `GameAction`: the registered deterministic handler that can query and plan
  that intent against canonical state.

External AI, player UI, simulation, event rules, and debug tools may all create
intents. They do not become authority. Authority stays in deterministic action
handlers and the existing persistence layer.

Recommended later shape:

```ts
interface GameAction<I extends WorldIntent = WorldIntent> {
    readonly subsystem: I['subsystem'];
    readonly action: I['action'];
    query(ctx: QueryContext, intent: I): IntentQueryResult;
    execute(ctx: ExecuteContext, intent: I, query: IntentQueryResult): IntentExecuteResult;
}
```

WI1 should not implement a dynamic registry yet. It may keep a closed internal
vehicle dispatch table.

### 17.2 Action Result Taxonomy

The common result language should eventually standardize four observable
outcomes:

```text
invalid      -> bad shape, bad id, impossible payload, unknown action
valid_noop   -> valid and already satisfied / no effective delta
changed      -> valid and changed canonical state in memory
write_failed -> persistence failure after a change plan was accepted
```

In current WI1 terminology:

- `invalid` maps to `status: "invalid"`;
- `valid_noop` maps to `status: "valid_noop"`;
- `changed` maps to `status: "applied"` in pure execute;
- `write_failed` is deferred until a State Orchestrator / persistence bridge
  exists.

Do not force `write_failed` into WI1. WI1 has no writes.

### 17.3 Two Future Kernels, Not Five

Avoid a pile of small universal abstractions. Later work should consolidate
around two thin cores:

1. **Action Execution Kernel**
   - intent envelope;
   - action registry;
   - query / execute lifecycle;
   - result taxonomy;
   - legacy adapters.

2. **Rule Kernel**
   - requirement predicates;
   - scope queries;
   - effect cause;
   - effect accounting;
   - dependency extraction.

Everything else should reuse existing LoreRelay infrastructure:

- persistence;
- queues;
- circuit breakers;
- replay;
- projections;
- subsystem states.

### 17.4 Event Bus Rule

The future event bus must be post-commit only.

Allowed flow:

```text
Committed Change
-> Event
-> Rule evaluates
-> New Intent
-> Next deterministic phase
```

Forbidden flow:

```text
Event
-> subscriber mutates canonical state directly
-> another subscriber mutates another ledger
-> recursive event chain
```

This prevents hidden side effects, replay divergence, and order-dependent bugs.

### 17.5 Accounting Before and After Commit

Effect accounting is not only a post-commit report. Later phases should allow a
two-stage trace:

```text
resolution trace
-> commit
-> finalized accounting
```

This lets the system explain:

- which effects were candidates;
- which requirements activated;
- which stacking group suppressed another effect;
- which priority won;
- what value was finally committed.

Do not implement global accounting in WI1. The first accounting pilot should be
small and tied to one deterministic derived value, such as vehicle range, fuel,
repair cost, trade income, or settlement upkeep.

### 17.6 Visibility-Aware ChangeSet

Audience-aware change metadata is useful, but it must not replace the current
FoW-safe projection choke points.

Correct model:

```text
canonical change carries optional audience intent
        +
final Webview / Remote / Replay / AI prompt projection uses whitelist sanitize
```

This is defense in depth. The final projection remains authoritative for
secrecy.

### 17.7 Per-Ledger Migration Chain

As ledgers mature, schema compatibility should be managed per ledger instead of
as one global save migration.

Future helper direction:

```ts
migrateVehicleState(raw, fromVersion, toVersion)
migrateSettlementState(raw, fromVersion, toVersion)
migrateCampaignResources(raw, fromVersion, toVersion)
```

A common runner can order and test migrations, but each ledger owns its own
contract. Do not introduce this during WI1.

### 17.8 Scheduler Descriptor, Not Scheduler Rewrite

LoreRelay has many clocks:

- GM turn;
- world turn;
- simulation tick;
- guild week;
- domain month;
- settlement processing;
- observer / bulk simulation.

Do not unify execution now. A later design may add observation-only descriptors:

```ts
interface SimulationSystemDescriptor {
    id: string;
    phase: 'pre_turn' | 'turn' | 'post_turn' | 'world_tick' | 'daily' | 'weekly' | 'monthly' | 'on_demand';
    order: number;
    dependsOn?: string[];
    intervalTurns?: number;
    runLevels?: string[];
    deterministic: true;
    failurePolicy: 'skip' | 'degrade' | 'open_circuit' | 'abort_phase';
    budgetMs?: number;
}
```

For now this is design-only metadata for audits and future ordering tests.

### 17.9 Deferred Materialization

Do not process every remote entity every tick. Later simulation should classify
systems as:

- eager: player vicinity, combat, directly visible/interactable objects;
- deferred: distant settlements, remote economy, aggregate populations;
- scheduled milestone: caravan arrival, disaster, war, death, delivery.

This belongs after the Action Execution Kernel is proven.

### 17.10 Action Execution Kernel Roadmap

Recommended path after WI1:

1. **WI1**: pure `WorldIntent` skeleton and vehicle adapter.
2. **WI1R**: review semantics against vehicle characterization tests.
3. **WI2**: closed action registry and vehicle shadow-mode parity against
   legacy `vehicleOps`.
4. **WI3**: optional compatibility bridge, feature-flagged and subsystem-owned.
5. **WI4**: one small EffectCause / EffectAccounting pilot.
6. **WI5**: semantic sanity checker for mod/rule definitions.
7. **WI6**: per-ledger migration helper.

Settlement and Mobile Base should not be early pilots. They share ledgers and
cross-system contracts, so they should wait until the vehicle pilot proves the
taxonomy.

Once proven, expand adapters and use the intent layer to prepare a future State Orchestrator.
