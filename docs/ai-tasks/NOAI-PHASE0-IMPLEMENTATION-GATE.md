# NOAI Phase 0 Implementation Gate

Status: GATE_DRAFT
Date: 2026-07-07 JST
Owner: Claude Sonnet

## Source of Truth

Read first:

- `docs/ideas/NOAI-SIMULATION-ONLY-PRODUCT-UX-GATE.md`
- `docs/ideas/NARRATION-ON-DEMAND-AI-OPTIONAL-LIVING-WORLD.md`
- `docs/ideas/NARRATION-ON-DEMAND-NARRATIVE-SAMPLING-ADDENDUM.md`
- `docs/AI_PROMPT_HANDOFF_POLICY.md`

## Goal

Draft a narrow implementation gate for Phase 0 only.

Do not implement code.
Do not touch RUNTIME-003A.
Do not create a large NOAI subsystem.

## Phase 0 scope

Design the smallest safe pilot around the already-existing deterministic direct Commerce path:

1. Add a single campaign-level AI participation policy field to `game_rules.json` without changing engine behavior yet.
2. Record successful direct Commerce trades into the existing event/history backbone so they can later be narrated.
3. Define the exact UI copy and visibility needed to expose the policy safely, without adding a dashboard.
4. Preserve the rule that narration failure never rolls back deterministic gameplay.

## Required decisions

The gate must decide:

- exact field name and enum values;
- default and backward-compatibility behavior;
- where the field is authored and read;
- whether Phase 0 should write Chronicle, WorldChangeEvent, or both;
- stable event identity and dedupe expectations;
- persistence ordering relative to Commerce state mutation;
- failure semantics if event-history persistence fails after trade state commit;
- minimal UI placement and copy;
- exact source touch set;
- focused tests and acceptance criteria;
- what is explicitly deferred to later phases.

## Constraints

- No new event-history type.
- Prefer extending/reusing existing `WorldChangeEvent` behavior.
- No Important Events classifier.
- No Narrate Now pipeline yet.
- No NotebookLM dependency.
- No direct-action parity work for travel/time/settlement/domain/guild/vehicle yet.
- No broad Start Hub redesign.
- Do not reopen RUNTIME-003A or unrelated runtime authority work.

## Output

Create or complete a gate document with:

- current repository evidence;
- exact minimal contract;
- touch set;
- failure matrix;
- test plan;
- acceptance criteria;
- deferred scope;
- final verdict.

Final verdict exactly one:

`NOAI_PHASE0_IMPLEMENTATION_GATE_READY`

or

`NOAI_PHASE0_IMPLEMENTATION_GATE_BLOCKED`
