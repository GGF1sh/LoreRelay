# LoreRelay Debug Mode & Simulation Test Architecture

Status: Draft v0.1

Scope: Developer-facing debugging, deterministic simulation regression, opt-in soak/scale testing.

This document does **not** replace the existing test suite, Debug Scenario, World Intent accounting, Context Inspector, or State Orchestrator. It defines how those pieces should converge into a coherent way to answer two questions:

1. **Why did the world do this?**
2. **Will the world still behave correctly after the next 100 commits?**

---

## 0. Executive decision

LoreRelay has reached the point where ordinary unit tests are necessary but no longer sufficient.

The current repository already has several strong primitives:

- `src/debugScenarioCore.ts`
  - deterministic natural-language debug commands
  - debug-tagged scenario packs only
  - can change trust / romance / fear / HP / location / FoW
  - can request bulk world simulation
- `src/worldSimBulkCore.ts`
  - deterministic multi-step world simulation
  - synchronous and async paths
  - optional `afterStep` hook
  - bounded to 100 steps
  - emits a compact summary
- `scripts/run_all_tests.js`
  - unified manifest
  - validate / unit / smoke categories
  - roughly two hundred test scripts plus nested validation tests
- Effect Accounting
  - answers why a canonical value changed
- Context Inspector / Context Accounting direction
  - answers why AI context included or omitted information
- State Orchestrator descriptors
  - inventories where ledger writes occur

What is missing is the layer between those systems:

> **a deterministic, inspectable, cross-subsystem world-behavior test and trace architecture.**

The recommended structure is:

```text
Existing Unit Tests
        |
        +--> Simulation Test Suite
        |      deterministic scenario regressions
        |
        +--> Soak / Scale Test Suite
        |      long-run invariant checks
        |
        +--> Debug Trace
               why this happened
               which rule matched
               which event was consumed
               what state changed
```

The first implementation slice should be small:

1. add a dedicated `simulation` test category and `npm run test:simulation`
2. keep existing tests runnable through `npm test`
3. do not add a Debug Webview yet
4. design Trace and Scenario contracts before wiring production systems

---

## 1. Terminology

The word "debug" currently risks describing several different things. Use these names consistently.

### 1.1 Debug Sandbox

Existing role: intentionally mutate a debug-tagged scenario.

Examples:

- set NPC trust
- teleport player
- reveal FoW
- advance world simulation
- change market multiplier

Primary existing implementation:

`src/debugScenarioCore.ts`

This is a **world manipulation tool**.

It is not the same as tracing or regression testing.

---

### 1.2 Debug Trace

A structured explanation of why a decision or mutation happened.

Example:

```text
NPC Marcus moved to north_market

because:
  ruleId: food_crisis_buy_wheat

considered event:
  eventId: wce_142_faction_merchants_smiths
  category: faction
  severity: warning

condition evaluation:
  category === resource    false
  severity === warning     true

result:
  foodCrisis = true
  move npc_marcus -> north_market
```

This is a **causal observability tool**.

---

### 1.3 Simulation Test Suite

A deterministic batch of small world scenarios that verifies behavior across subsystem boundaries.

Example:

```text
Scenario: faction_conflict_is_not_food_crisis

Setup:
  two factions
  three NPCs
  normal food stock

Inject:
  faction relationship warning event

Run:
  3 world ticks

Assert:
  faction relation changed
  no food-crisis agenda created
  no wheat-market migration occurred
```

This is a **game-engine regression suite**.

---

### 1.4 Soak / Scale Test Suite

An opt-in, potentially slow batch that runs many turns or large populations.

Examples:

- 1,000 ticks
- 500 named NPCs
- 20 factions
- large event history
- many relationship edges

Checks:

- no crashes
- no NaN / Infinity
- no unbounded growth
- no repeated application of one-shot events
- no impossible state combinations
- deterministic replay where promised
- performance remains inside a declared budget

This is a **long-run engine trial**.

It must not run as part of the normal fast unit test path unless explicitly promoted later.

---

## 2. Existing inventory: do not rebuild what already exists

### 2.1 `debugScenarioCore.ts`

Keep it.

Its role should remain:

```text
human debug command
    -> parsed deterministic command
    -> bounded mutation intent
```

Do not turn it into the Trace engine.

Do not make it responsible for explaining every subsystem.

Future integration:

```text
Debug Sandbox command
    -> mutation / simulation
    -> optional Debug Trace capture
```

---

### 2.2 `worldSimBulkCore.ts`

Keep it as the initial simulation loop primitive.

It already provides:

- bounded step count
- sync path
- async event-loop-yield path
- optional `afterStep`
- summary output

Do not immediately replace it with a giant new engine.

Future use:

```text
Simulation Scenario Runner
    -> worldSimBulkCore
    -> afterStep adapter
    -> invariant probes
    -> canonical trace
```

Potential future limitation:

The current absolute 100-step cap is appropriate for interactive debug use, but not for soak tests. Do not simply raise the interactive cap. Add a separate test-only soak runner with its own explicit limits.

---

### 2.3 Current unified test runner

Current categories:

- validate
- unit
- smoke

Add:

- simulation

Later, when a real soak harness exists:

- soak

Expected commands:

```text
npm test
npm run test:validate
npm run test:unit
npm run test:smoke
npm run test:simulation

# Future, opt-in only
npm run test:soak
```

`npm test` should continue to run fast-enough deterministic simulation regressions.

`test:soak` should remain separate.

---

## 3. Core principle: debug reasons, not log volume

A bad debug mode produces more text.

```text
NPC moved
Faction changed
Event emitted
Market updated
```

A useful debug mode records causality.

```text
input
  -> rule evaluated
  -> evidence matched
  -> decision
  -> effect
  -> output references
```

The shared shape should be close to:

```ts
export interface DebugTraceEntry {
  version: 1;

  runId: string;
  traceId: string;
  parentTraceId?: string;

  worldTurn?: number;
  gmTurn?: number;

  phase:
    | 'input'
    | 'query'
    | 'decision'
    | 'effect'
    | 'event'
    | 'persist'
    | 'context';

  subsystem: string;
  ruleId?: string;

  inputRefs?: TraceRef[];
  evidence?: TraceEvidence[];

  decision?: {
    outcome: string;
    reasonCode?: string;
  };

  outputRefs?: TraceRef[];

  accounting?: {
    before?: unknown;
    delta?: unknown;
    after?: unknown;
  };

  visibility: 'internal' | 'gm_safe' | 'player_safe';
}
```

This is a design sketch, not a frozen schema.

Important invariant:

> Trace entries should reference canonical entities and events by ID whenever possible instead of copying entire ledger objects.

---

## 4. Trace graph, not just a flat log

LoreRelay now has chains such as:

```text
World Event
    -> NPC Agency
    -> NPC Move
    -> Relationship Change
    -> New World Event
    -> GM Prompt
```

A flat array is still useful, but every entry should be able to form a causal graph through:

```text
traceId
parentTraceId
inputRefs
outputRefs
```

Example:

```text
trace_100
  Event: faction relation worsened

    |
    +--> trace_101
         NPC Agency considered event

            |
            +--> trace_102
                 food crisis rule matched

                    |
                    +--> trace_103
                         Marcus moved to north_market
```

This is the structure needed for the eventual question:

> "Why did Marcus move?"

---

## 5. Safety boundary: internal trace vs user-safe trace

LoreRelay has Fog of War and hidden state.

Therefore Debug Trace must not be one universal payload.

Use at least these conceptual levels:

### Internal Developer Trace

May contain:

- hidden event IDs
- secret entity IDs
- omitted context candidates
- internal reason codes
- full rule evaluation

### GM-safe Trace

May contain information the GM/operator is allowed to inspect.

### Player-safe Trace

Must obey non-interference requirements.

A player-safe trace must not reveal:

- the existence of an inaccessible secret
- hidden NPC identity
- hidden location
- omitted secret context candidate
- hidden faction plan

Context Accounting already needs this boundary. Debug Trace should reuse the same principle.

---

## 6. Simulation scenario contract

A simulation scenario should be data-first and deterministic.

Suggested conceptual shape:

```ts
export interface SimulationScenarioDefinition {
  id: string;
  version: 1;
  description: string;

  seed?: string;

  setup: {
    worldForge: unknown;
    worldState: unknown;
    npcRegistry?: unknown;
    gameRules?: unknown;
  };

  inject?: SimulationInjection[];

  run: {
    steps: number;
  };

  assertions: SimulationAssertion[];
}
```

Do not freeze this schema before P1 design review.

A scenario result should contain:

```ts
export interface SimulationScenarioResult {
  scenarioId: string;
  ok: boolean;
  stepsExecuted: number;

  failures: SimulationAssertionFailure[];
  summary: SimulationSummary;

  trace?: CanonicalSimulationTrace;
  performance?: SimulationPerformanceSummary;
}
```

---

## 7. Assertion types

Prefer semantic assertions over entire JSON snapshots.

Good:

```text
no NPC received agenda food_crisis_buy_wheat
faction relation A|B changed exactly once
faction relation C|D did not change
worldTurn advanced by 20
no numeric value is NaN or Infinity
recentChanges length <= cap
```

Bad:

```text
entire world_state.json must exactly equal this 800-line fixture
```

Suggested assertion families:

### State assertions

- equals
- not equals
- within range
- unchanged

### Event assertions

- emitted exactly once
- not emitted
- emitted with participants
- not re-applied

### Entity assertions

- moved / did not move
- gained / lost relation
- remained accessible / inaccessible

### Growth assertions

- ledger size <= max
- relationship edges <= max
- event count bounded

### Determinism assertions

- same seed => same canonical trace
- same scenario => same semantic result

### Performance assertions

- run completed under a generous budget
- event count did not explode superlinearly for declared workload

Performance assertions must avoid fragile machine-specific microbenchmarks.

---

## 8. Golden Trace

Golden testing is useful only if canonicalized.

Never include unstable fields such as:

- timestamps
- random UUIDs
- absolute paths
- full prose narration
- object property order

A canonical trace should keep semantic outputs only.

Example:

```json
{
  "scenario": "faction_conflict_is_not_food_crisis",
  "turns": [
    {
      "worldTurn": 10,
      "events": [
        {
          "code": "faction_conflict",
          "participants": ["faction_a", "faction_b"]
        }
      ],
      "npcMoves": [],
      "relationshipChanges": [
        {
          "pair": "faction_a|faction_b",
          "delta": -10
        }
      ]
    }
  ]
}
```

Golden traces should be small enough for a human to review.

---

## 9. First required regression scenarios

These are directly motivated by current architecture risks.

### S1: Faction warning is not food crisis

Setup:

- normal food stocks
- faction relationship warning event

Expected:

- no `food_crisis_buy_wheat`
- no wheat-market move

---

### S2: One event applies once

Setup:

- one conflict event remains visible in `recentChanges` for five turns

Expected:

- mutation occurs once
- history visibility does not imply repeated effect execution

This scenario formalizes the boundary:

```text
stepEvents / unconsumed intents
    -> mutation input

recentChanges / history
    -> observation and retrieval
```

---

### S3: A-B conflict does not mutate C-D

Setup:

- factions A, B, C, D
- conflict only between A and B

Expected:

- A-B changes
- unrelated pairs remain unchanged

---

### S4: NPC scale does not define faction universe

Setup:

- maxNamedNpcCount below total registry size
- faction C represented only by an NPC outside the selected named-NPC window

Expected future architecture:

- faction C remains part of faction simulation if it exists in canonical world faction data

---

### S5: Sequential batch semantics

Setup:

```text
fuel 18 / 20
op1 +2
op2 +2
```

Expected:

```text
op1 changed
op2 valid_noop
```

This catches batch parity systems that compare every operation against the same pre-batch snapshot.

---

### S6: Raw malformed ledger remains diagnosable

Setup:

- duplicate vehicle IDs
- resource current > max
- invalid version

Expected:

- Sanity Checker reports malformed / normalization loss
- parser normalization must not erase all evidence before diagnosis

---

### S7: Migration backup names are unique

Setup:

- two backup operations in the same second

Expected:

- two distinct backup identities
- no silent overwrite

---

### S8: Scale profile invariants

Setup:

- 500 NPCs
- 3 factions

Expected:

- faction-level output size depends on faction count, not NPC pair count
- personal relationship materialization remains sparse

---

## 10. Simulation test category

The first code slice should reclassify existing engine-behavior tests under a dedicated category.

Initial candidates:

```text
test_emergent_simulator.js
test_world_sim_bulk_core.js
test_world_sim_bulk_event_loop_yield.js
test_debug_scenario_core.js
test_world_sim_living_world.js
```

This does not mean they stop running in `npm test`.

It means developers can run:

```text
npm run test:simulation
```

when working on:

- world ticks
- Living World
- NPC Agency
- relationships
- events
- future Scenario Runner

The category should remain deterministic and reasonably fast.

---

## 11. Future soak category

Do not create a fake soak suite by simply renaming unit tests.

A real soak suite needs:

- long iteration counts
- invariant probes every N turns
- bounded trace retention
- compact failure artifacts
- explicit workload metadata

Suggested command:

```text
npm run test:soak
```

Suggested initial profiles:

### Small Long Run

```text
1000 ticks
20 NPCs
4 factions
```

### Medium Population

```text
250 ticks
500 NPCs
10 factions
```

### Relationship Stress

```text
500 NPCs
sparse interactions
hotspot location bursts
```

### Event History Stress

```text
large event production
bounded recent window
entity timeline indexing when implemented
```

Soak tests should be opt-in locally and may later run in scheduled CI.

---

## 12. Debug Trace storage policy

Do not add another permanent canonical ledger in P1.

Recommended initial policy:

```text
in-memory ring buffer
last N trace entries
or last N simulation runs
```

Optional developer export:

```text
.lorerelay/debug/
```

Only by explicit command.

Never:

- silently persist every trace forever
- add raw prompt contents by default
- include secrets in player-facing payloads

---

## 13. UI roadmap

### P0 — Test classification and architecture

- dedicated `simulation` test category
- this design document
- no production runtime change

### P1 — Structured Trace Core

Pure core only.

Candidate modules:

```text
src/debugTraceCore.ts
scripts/test_debug_trace_core.js
```

Capabilities:

- bounded ring buffer model
- trace entry validation
- parent/child linkage
- canonical ordering
- internal vs safe projection

No Webview.

### P2 — Inspect Last Simulation Tick

Command:

```text
LoreRelay: Inspect Last Simulation Tick
```

Output Channel first.

Shows:

- phases
- rules matched
- events consumed
- decisions
- effects

No raw ledger dump.

### P3 — Scenario Runner

Command or CLI:

```text
LoreRelay: Run Debug Scenario
npm run test:simulation
```

Runs deterministic scenario fixtures and semantic assertions.

### P4 — Soak / Scale Harness

Opt-in only.

Produces:

- compact summary
- first failing turn
- invariant name
- bounded trace around failure

### P5 — Debug Panel

Only after the data contracts stabilize.

Possible panels:

- Entity Inspector
- Event Inspector
- Tick Trace
- Persistence Trace
- Context Trace

Do not start with a large Webview.

---

## 14. Relationship to existing Accounting systems

The long-term conceptual model should be:

```text
Decision Accounting
  Why was this action chosen?

Effect Accounting
  Why did this value change?

Context Accounting
  Why did the AI know or omit this?

Persistence Accounting
  Why was this ledger written?

Debug Trace
  How did these explanations connect across subsystems?
```

Do not force all of these into one giant universal schema immediately.

Use shared references and compatible provenance concepts first.

---

## 15. Relationship to typed Event Semantics

Recent cross-subsystem bugs show the danger of using broad fields as meaning:

```text
severity === warning
message contains "war"
```

Debug Trace can expose such mistakes, but it should not become the permanent solution.

The architecture should move toward typed semantic event meaning:

```ts
interface WorldChangeEvent {
  id: string;
  code?: string;
  participants?: EntityRef[];
  sourceEventId?: string;
  consumedBy?: string[]; // derived/debug only, not necessarily canonical
}
```

This document does not freeze an Event Backbone schema.

It records that Simulation Tests should verify semantic event behavior rather than prose matching.

---

## 16. Determinism rules

Simulation regressions should avoid:

- `Date.now()` in canonical expected output
- `Math.random()` without seeded abstraction
- filesystem ordering as semantic ordering
- locale-sensitive string sorting where IDs are expected
- unstable generated IDs in golden traces

When existing production code is not fully deterministic, tests should canonicalize unstable fields rather than pretending otherwise.

---

## 17. Failure artifact

When a Simulation Scenario fails, the ideal artifact is small.

```text
Scenario: faction_conflict_is_not_food_crisis
Result: FAIL
First failing turn: 12
Assertion: no_npc_agenda(food_crisis_buy_wheat)

Actual:
  npc_marcus agenda=restock_wheat

Causal trace:
  event faction_relation_warning
  -> rule food_crisis_buy_wheat
  -> condition severity === warning matched
  -> move npc_marcus north_market
```

Do not dump a 20 MB world state unless explicitly requested.

---

## 18. Non-goals

Do not use this initiative to:

- replace the current 200+ test suite
- build a full in-game developer console immediately
- add production cheats outside debug-tagged scenarios
- make the GM model responsible for judging test pass/fail
- store every trace forever
- expose internal secrets through Remote Play
- redesign Context Engine
- redesign State Orchestrator
- redesign all World Events

The goal is observability and regression confidence.

---

## 19. Review gates

Before P1 implementation, review these questions:

1. Should Trace be a generic core, or begin as Simulation-only?
2. Which fields are truly shared with Effect/Context Accounting?
3. How is non-interference tested for safe trace projection?
4. What is the exact boundary between history (`recentChanges`) and mutation input (`stepEvents`)?
5. What scenario fixture format minimizes migration burden?
6. Which production clocks are allowed in trace entries?
7. How should seeded randomness be introduced if future simulations need it?
8. What is the first real soak workload for the user's target hardware?

---

## 20. Recommended AI review roles

### Opus / Architecture Owner

- freeze boundaries
- reject universal-schema overreach
- decide P1 trace minimum

### ChatGPT / Systems Critic

- cross-subsystem failure modes
- scenario coverage
- accounting convergence

### Gemini

- repository-wide duplication audit
- find existing debug/log/test utilities before new modules

### Grok

Attack:

- repeated events
- loops
- 500 / 5000 NPC scale
- secret leaks
- malformed ledgers
- trace explosion
- non-determinism

### Sonnet / Implementation Owner

After architecture freeze:

- pure core
- tests
- runner integration
- host command later

---

## 21. Immediate implementation decision

This first PR should do only:

```text
1. Add this design document.
2. Add `simulation` as a dedicated unified-test-runner category.
3. Reclassify existing deterministic game-engine tests.
4. Add `npm run test:simulation`.
```

It should not:

- alter production simulation behavior
- add Debug Trace runtime code
- add a Webview panel
- add soak tests before a real soak harness exists

This is a low-risk foundation.

---

## Final north-star statement

LoreRelay no longer only needs to know whether each component is correct.

It needs to know whether the **world's causal behavior remains correct**.

The target debugging model is:

```text
What happened?
    -> Why did it happen?
        -> Which input and rule caused it?
            -> Which state changed?
                -> Did the same scenario behave this way before?
```

That is the bridge from a large collection of tested subsystems to a testable game engine.
