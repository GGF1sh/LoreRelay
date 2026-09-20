# Idea Note — NOAI Long-Horizon Playtest + AI Log Analyst

Date: 2026-07-07 JST
Status: Idea / Research Direction

## Thesis

LoreRelay should eventually run long deterministic NOAI simulations and let AI inspect the resulting logs as a **read-only analyst**.

The useful separation is:

```text
Simulation decides what happened
→ deterministic checks measure what happened
→ AI explains patterns and proposes hypotheses
→ humans decide whether balance changes are justified
```

AI must not become the authority for canonical state or live balance mutation.

## Why this fits LoreRelay

LoreRelay already aims toward long AI-silent periods, deterministic routine simulation, and Narration on Demand.

The same separation can be reused for testing:

```text
NOAI world execution
→ structured receipts / metrics
→ selective log sampling
→ AI balance / boredom analysis
```

This allows cheap long-horizon testing without paying for an AI turn every simulation step.

## Core architecture

### Layer 1 — Deterministic runner

Run fixed scenarios and seeds for long horizons with AI disabled.

The runner owns:

- scenario seed;
- initial state hash;
- turn count;
- deterministic action policy / bot policy;
- final state hash;
- event / action receipts.

The runner must be reproducible without AI.

### Layer 2 — Machine checks first

Before any AI sees the run, ordinary code should detect objective failures:

- invariant violations;
- crashes / stalls;
- impossible negative resources;
- unreachable states;
- runaway unbounded growth;
- permanent zero-activity systems;
- repeated identical loops;
- extreme concentration in one strategy or outcome;
- non-recovery after shocks;
- determinism mismatch between reruns.

AI should not be used to notice what normal assertions and statistics can prove directly.

### Layer 3 — Structured telemetry

Prefer compact structured records over raw text dumps.

Each run should be analyzable through stable IDs such as:

```text
runId
seed
scenarioId
worldTurn
actionId
eventId
actorId
locationId
system tags
state deltas
reason / causal receipt refs
```

The exact schema should reuse existing receipts where practical rather than creating a parallel truth system.

### Layer 4 — AI analyst

The AI receives immutable run outputs and may:

- summarize dominant loops;
- find boring repeated patterns;
- identify apparent dominant strategies;
- compare successful and failed seeds;
- explain which systems rarely matter;
- find decisions that are fake because one choice wins almost always;
- flag runaway positive feedback loops;
- flag over-stable worlds where nothing meaningful changes;
- suggest hypotheses for human review.

The AI may not:

- mutate canonical state;
- rewrite logs;
- silently rebalance values;
- decide PASS from one anecdotal run;
- claim causality without receipt / metric evidence.

## Three analyst roles

### 1. Invariant / pathology analyst

Question:

> Did the world break?

Looks for:

- stuck simulation;
- impossible state;
- explosive growth;
- starvation / collapse loops;
- dead systems;
- oscillation without recovery.

### 2. Balance analyst

Question:

> Did one strategy or role become obviously superior?

Looks for:

- strategy concentration;
- action distribution collapse;
- resource accumulation asymmetry;
- role progression bottlenecks;
- choices that are numerically dominated.

### 3. Boredom / gameplay analyst

Question:

> Even if stable, is this interesting?

Looks for:

- repeated scan-and-run loops;
- low decision diversity;
- long stretches with no meaningful pressure;
- choices whose outcomes are obvious before commitment;
- systems that exist but rarely affect player decisions.

This role is especially useful after machine checks pass.

## Minimum metrics worth considering

Do not build all of these at once. Candidate metrics include:

- action frequency and action entropy;
- unique meaningful decision count per 100 turns;
- strategy convergence rate across seeds;
- share of value / power / wealth held by top actors or factions;
- time-to-dominance;
- recovery time after shocks;
- percentage of systems that actually change future choices;
- repeated-state / repeated-action streaks;
- event throughput and event consequence depth;
- dead-state duration;
- save / replay determinism parity.

The most important metric remains product-facing:

> What did the player have to think about?

## Sampling policy

Do not send entire massive logs to an AI by default.

Use a staged process:

```text
full deterministic run
→ machine aggregation
→ anomaly windows / representative samples
→ AI analysis
```

For each AI claim, preserve links back to exact run / turn / receipt evidence.

## Recommended validation ladder

### Phase A — Human hybrid playtest

Use Gameplay Slice 1's current 30-minute test to answer:

- is the pressure readable?
- is the choice real?
- does the player hesitate?
- does scanner behavior dominate?

### Phase B — Small NOAI soak

Run a few fixed scenarios for hundreds or thousands of turns and prove:

- determinism;
- no crashes;
- no obvious runaway state;
- telemetry is sufficient to explain failures.

### Phase C — Multi-seed balance batch

Run many seeds / policies and compare distributions rather than anecdotes.

### Phase D — AI analyst

Only after machine summaries exist, let one or more AIs review the evidence packet.

Different roles should be kept separate:

```text
one AI finds pathologies
one AI attacks balance
one AI attacks boredom
```

## Anti-patterns

Avoid:

- AI reading every turn live;
- AI changing balance during the same run it evaluates;
- one huge unstructured log dump;
- one seed being treated as representative;
- AI verdicts without exact run evidence;
- replacing numerical checks with prose judgment;
- tuning until the AI says it feels good.

## Recommended product rule

```text
AI may interpret the simulation.
AI may not become the simulation.
```

## Near-term recommendation

Do not block Gameplay Slice 1's current human hybrid playtest on this infrastructure.

After the Slice 1 playtest, create a separate research / implementation gate for:

```text
NOAI long-horizon runner
+ minimal structured telemetry
+ deterministic aggregate checks
```

Only after that works should an AI log analyst be added.

The likely value is high, especially for LoreRelay's goal of surviving 100+ turns without breaking, but the AI layer should be the last layer in the test stack, not the first.
